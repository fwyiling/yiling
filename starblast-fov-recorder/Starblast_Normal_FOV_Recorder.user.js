// ==UserScript==
// @name         Starblast Normal-FOV Recorder
// @namespace    https://github.com/fwyiling/yiling
// @version      1.0.0
// @description  Play zoomed out, record at normal FOV. The game UI, your crosshair and the sound are recorded exactly as normal.
// @match        https://starblast.io/*
// @match        http://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const STORE_KEY = 'sb-normal-fov-recorder';
  const MIN_RATIO = 1, MAX_RATIO = 8;
  const VIDEO_BITRATE = 12e6, AUDIO_BITRATE = 160e3, FPS = 60;

  const settings = { ratio: 3, height: 0, audio: true, panel: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY)) || {}); } catch (e) {}
  const saveSettings = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch (e) {} };

  const state = {
    THREE: null, BaseRenderer: null,
    main: null, ops: [], inRender: false,
    rec: null, previewOn: false,
    recorder: null, chunks: [], startedAt: 0, mix: null,
  };
  const active = () => state.previewOn || !!state.recorder;

  // ---- three.js hook: wrap WebGLRenderer so the game's render passes can be replayed ----

  const patchedThree = new WeakSet();
  function patchThree(T) {
    if (!T || typeof T.WebGLRenderer !== 'function' || patchedThree.has(T)) return;
    patchedThree.add(T);
    const Base = T.WebGLRenderer;
    state.THREE = T;
    state.BaseRenderer = Base;
    const Hooked = function (params) {
      const r = new Base(params);
      hookRenderer(r);
      return r;
    };
    Hooked.prototype = Base.prototype;
    T.WebGLRenderer = Hooked;
  }

  let threeRef = window.THREE;
  try {
    // three.js assigns an empty THREE object first and fills it in later, so patch lazily on read.
    Object.defineProperty(window, 'THREE', {
      configurable: true, enumerable: true,
      get() { patchThree(threeRef); return threeRef; },
      set(v) { threeRef = v; },
    });
  } catch (e) {
    const iv = setInterval(() => {
      if (window.THREE && window.THREE.WebGLRenderer) { patchThree(window.THREE); clearInterval(iv); }
    }, 0);
  }

  function isMain(r) {
    const p = r.domElement.parentNode;
    if (p && p.id === 'canvaswrapper') { state.main = r; return true; }
    return false;
  }

  function hookRenderer(r) {
    const render = r.render, clear = r.clear;
    r.render = function (scene, camera, target, forceClear) {
      if (isMain(r) && !target && active()) {
        state.ops.push({ scene, camera, forceClear: !!forceClear, autoClear: r.autoClear, sortObjects: r.sortObjects });
      }
      state.inRender = true;
      try { return render.apply(this, arguments); } finally { state.inRender = false; }
    };
    r.clear = function (color, depth, stencil) {
      if (active() && !state.inRender && isMain(r)) state.ops.push({ clear: [color, depth, stencil] });
      return clear.apply(this, arguments);
    };
  }

  const nativeRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return nativeRAF.call(window, function (t) {
      try { return cb(t); } finally { if (state.ops.length) flush(); }
    });
  };

  function flush() {
    const ops = state.ops;
    state.ops = [];
    if (!active() || !state.main || !state.BaseRenderer) return;
    try { replay(ops); } catch (e) { console.warn('[Normal-FOV Recorder] replay failed', e); }
  }

  function targetSize() {
    const src = state.main.domElement;
    let w = src.width, h = src.height;
    if (settings.height > 0) { h = settings.height; w = Math.round(h * src.width / src.height); }
    return [w - (w % 2), h - (h % 2)];
  }

  function ensureRec() {
    if (!state.rec) {
      state.rec = new state.BaseRenderer({ antialias: true, alpha: false });
      state.rec.autoClear = false;
      state.rec.setPixelRatio(1);
      ui.mountCanvas(state.rec.domElement);
    }
    const [w, h] = targetSize(), c = state.rec.domElement;
    if (!state.recorder && (c.width !== w || c.height !== h)) state.rec.setSize(w, h, false);
    return state.rec;
  }

  // Background (first perspective pass) and UI (orthographic pass) are replayed untouched;
  // only the world camera is narrowed back to normal FOV.
  function replay(ops) {
    const rec = ensureRec(), main = state.main;
    rec.setClearColor(main.getClearColor(), main.getClearAlpha());
    rec.clear();
    const persp = ops.filter(o => o.camera && o.camera.isPerspectiveCamera);
    const background = persp.length > 1 ? persp[0] : null;
    for (const op of ops) {
      if (op.clear) { rec.clear(op.clear[0], op.clear[1], op.clear[2]); continue; }
      const cam = op.camera.isPerspectiveCamera && op !== background ? normalCamera(op.camera) : op.camera;
      rec.autoClear = op.autoClear;
      rec.sortObjects = op.sortObjects;
      rec.render(op.scene, cam, undefined, op.forceClear);
    }
  }

  const camCache = new WeakMap();
  function normalCamera(src) {
    let cam = camCache.get(src);
    if (!cam) { cam = new state.THREE.PerspectiveCamera(); camCache.set(src, cam); }
    src.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale);
    // Read the FOV from the projection matrix so it works whether the FOV hack changes fov, zoom or the matrix.
    const e = src.projectionMatrix.elements;
    cam.aspect = e[5] / e[0];
    cam.near = src.near;
    cam.far = src.far;
    cam.zoom = 1;
    cam.fov = 2 * Math.atan((1 / e[5]) / settings.ratio) * 180 / Math.PI;
    cam.updateProjectionMatrix();
    return cam;
  }

  // ---- audio: tap WebAudio sound effects and <audio> music ----

  const taps = new Map();
  const mediaEls = new Set();
  const nativeConnect = AudioNode.prototype.connect;
  const nativeDisconnect = AudioNode.prototype.disconnect;
  const isDestination = n => typeof AudioDestinationNode !== 'undefined' && n instanceof AudioDestinationNode;

  function tapFor(ctx) {
    let t = taps.get(ctx);
    if (!t) {
      t = ctx.createMediaStreamDestination();
      taps.set(ctx, t);
      if (state.mix) mixStream(t.stream);
    }
    return t;
  }

  AudioNode.prototype.connect = function (dest, output) {
    const result = nativeConnect.apply(this, arguments);
    if (isDestination(dest)) { try { nativeConnect.call(this, tapFor(this.context), output || 0); } catch (e) {} }
    return result;
  };
  AudioNode.prototype.disconnect = function (dest) {
    const result = nativeDisconnect.apply(this, arguments);
    if (isDestination(dest)) {
      const t = taps.get(this.context);
      if (t) { try { nativeDisconnect.call(this, t); } catch (e) {} }
    }
    return result;
  };

  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    mediaEls.add(this);
    if (state.mix) mixMedia(this);
    return nativePlay.apply(this, arguments);
  };

  function mixStream(stream) {
    if (!stream.getAudioTracks().length) return;
    try { nativeConnect.call(state.mix.ctx.createMediaStreamSource(stream), state.mix.dest); } catch (e) {}
  }
  function mixMedia(el) {
    if (state.mix.media.has(el) || typeof el.captureStream !== 'function') return;
    state.mix.media.add(el);
    try { mixStream(el.captureStream()); } catch (e) {}
  }
  function startAudioMix() {
    const ctx = new AudioContext();
    state.mix = { ctx, dest: ctx.createMediaStreamDestination(), media: new WeakSet() };
    for (const t of taps.values()) mixStream(t.stream);
    for (const el of mediaEls) mixMedia(el);
    return state.mix.dest.stream.getAudioTracks()[0];
  }
  function stopAudioMix() {
    if (!state.mix) return;
    state.mix.ctx.close().catch(() => {});
    state.mix = null;
  }

  // ---- recording ----

  function pickMime(withAudio) {
    const list = withAudio
      ? ['video/mp4;codecs=avc1.640033,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.640033', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  function startRecording() {
    if (state.recorder) return;
    if (!state.main || !state.BaseRenderer) return ui.status('Game not ready yet');
    const rec = ensureRec();
    const stream = rec.domElement.captureStream(FPS);
    if (settings.audio) {
      const track = startAudioMix();
      if (track) stream.addTrack(track);
    }
    const mimeType = pickMime(stream.getAudioTracks().length > 0);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITRATE, audioBitsPerSecond: AUDIO_BITRATE });
    } catch (e) {
      stopAudioMix();
      return ui.status('Recording not supported: ' + e.message);
    }
    state.chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size) state.chunks.push(e.data); };
    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'video/webm';
      download(new Blob(state.chunks, { type }), type.includes('mp4') ? 'mp4' : 'webm');
      state.chunks = [];
      stream.getTracks().forEach(t => t.stop());
      stopAudioMix();
    };
    state.recorder = recorder;
    state.startedAt = Date.now();
    recorder.start(1000);
    ui.refresh();
  }

  function stopRecording() {
    const r = state.recorder;
    if (!r) return;
    state.recorder = null;
    if (r.state !== 'inactive') r.stop();
    ui.refresh();
  }

  function download(blob, ext) {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `starblast-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.${ext}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    ui.status('Saved ' + name);
  }

  // ---- controls ----

  const toggleRecording = () => (state.recorder ? stopRecording() : startRecording());
  const togglePreview = () => { state.previewOn = !state.previewOn; ui.refresh(); };
  const togglePanel = () => { settings.panel = !settings.panel; saveSettings(); ui.refresh(); };
  const nudgeRatio = d => {
    settings.ratio = Math.round(Math.min(MAX_RATIO, Math.max(MIN_RATIO, settings.ratio + d)) * 10) / 10;
    saveSettings();
    ui.refresh();
  };

  function onKey(e) {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.code === 'F8') toggleRecording();
    else if (e.code === 'F9' && e.shiftKey) togglePanel();
    else if (e.code === 'F9') togglePreview();
    else if (e.altKey && e.code === 'BracketRight') nudgeRatio(0.1);
    else if (e.altKey && e.code === 'BracketLeft') nudgeRatio(-0.1);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  window.addEventListener('keydown', onKey, true);

  const ui = (() => {
    let root, els = {}, statusTimer, pendingCanvas = null;

    const css = `
#nfr-panel{position:fixed;left:10px;bottom:10px;z-index:2147483647;font:12px/1.4 system-ui,sans-serif;color:#dfe8f0;background:rgba(10,16,24,.88);border:1px solid rgba(120,170,220,.35);border-radius:8px;padding:8px;user-select:none;min-width:230px}
#nfr-panel.nfr-hidden{display:none}
#nfr-panel .nfr-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
#nfr-panel button,#nfr-panel select{font:inherit;color:inherit;background:rgba(60,90,120,.5);border:1px solid rgba(120,170,220,.4);border-radius:4px;padding:2px 8px;cursor:pointer}
#nfr-panel button:hover{background:rgba(80,120,160,.7)}
#nfr-rec.nfr-on{background:#b3202a;border-color:#ff6b75}
#nfr-ratio{min-width:38px;text-align:center;font-weight:600}
#nfr-time{font-variant-numeric:tabular-nums;color:#ff8a92}
#nfr-status{color:#9fc3e0;min-height:16px}
#nfr-hint{color:#7d93a8;font-size:11px}
#nfr-preview{margin:4px 0 6px;display:none}
#nfr-preview.nfr-show{display:block}
#nfr-park{position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none}
#nfr-canvas{display:block;width:320px;height:auto;border-radius:4px}
#nfr-badge{position:fixed;left:10px;bottom:10px;z-index:2147483647;font:12px system-ui,sans-serif;color:#fff;background:#b3202a;border-radius:10px;padding:2px 8px;display:none;pointer-events:none}`;

    // Clients that replace the page with document.open/write wipe the panel and window listeners; rebuild them.
    function ensure() {
      window.addEventListener('keydown', onKey, true);
      if (document.body && document.head && !document.getElementById('nfr-panel')) build();
    }

    function build() {
      els = {};
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.id = 'nfr-panel';
      root.innerHTML = `
<div class="nfr-row"><button id="nfr-rec">&#9679; REC</button><span id="nfr-time"></span><span style="flex:1"></span><button id="nfr-prev">Preview</button><button id="nfr-hide" title="Hide panel (Shift+F9)">&times;</button></div>
<div class="nfr-row"><span>Your FOV</span><button id="nfr-minus">&minus;</button><span id="nfr-ratio"></span><button id="nfr-plus">+</button><span style="flex:1"></span>
<select id="nfr-res"><option value="0">Game res</option><option value="720">720p</option><option value="1080">1080p</option><option value="1440">1440p</option></select></div>
<div class="nfr-row"><label><input type="checkbox" id="nfr-audio"> Record sound</label></div>
<div id="nfr-preview"></div>
<div id="nfr-status"></div>
<div id="nfr-hint">F8 rec &middot; F9 preview &middot; Shift+F9 panel &middot; Alt+[ / Alt+] FOV</div>`;
      document.body.appendChild(root);
      const park = document.createElement('div');
      park.id = 'nfr-park';
      document.body.appendChild(park);
      const badge = document.createElement('div');
      badge.id = 'nfr-badge';
      document.body.appendChild(badge);
      for (const id of ['rec', 'time', 'prev', 'hide', 'minus', 'ratio', 'plus', 'res', 'audio', 'preview', 'status']) els[id] = root.querySelector('#nfr-' + id);
      els.park = park;
      els.badge = badge;

      const click = (el, fn) => el.addEventListener('click', e => { fn(); el.blur(); e.stopPropagation(); });
      click(els.rec, toggleRecording);
      click(els.prev, togglePreview);
      click(els.hide, togglePanel);
      click(els.minus, () => nudgeRatio(-0.1));
      click(els.plus, () => nudgeRatio(0.1));
      els.res.addEventListener('change', () => { settings.height = +els.res.value; saveSettings(); els.res.blur(); });
      els.audio.addEventListener('change', () => { settings.audio = els.audio.checked; saveSettings(); els.audio.blur(); });
      for (const ev of ['mousedown', 'mouseup', 'wheel', 'contextmenu']) root.addEventListener(ev, e => e.stopPropagation());

      if (pendingCanvas) { mountCanvas(pendingCanvas); pendingCanvas = null; }
      refresh();
    }

    function mountCanvas(canvas) {
      if (!root || !root.isConnected) { pendingCanvas = canvas; return; }
      canvas.id = 'nfr-canvas';
      (state.previewOn ? els.preview : els.park).appendChild(canvas);
    }

    function tick() {
      if (!root || !root.isConnected) return;
      const txt = state.recorder ? fmt(Date.now() - state.startedAt) : '';
      els.time.textContent = txt;
      els.badge.textContent = '● REC ' + txt;
      els.badge.style.display = state.recorder && !settings.panel ? 'block' : 'none';
    }
    const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

    function refresh() {
      if (!root || !root.isConnected) return;
      root.classList.toggle('nfr-hidden', !settings.panel);
      els.rec.classList.toggle('nfr-on', !!state.recorder);
      els.rec.innerHTML = state.recorder ? '&#9632; STOP' : '&#9679; REC';
      els.prev.textContent = state.previewOn ? 'Hide preview' : 'Preview';
      els.ratio.textContent = settings.ratio.toFixed(1) + '×';
      els.res.value = String(settings.height);
      els.res.disabled = !!state.recorder;
      els.audio.checked = settings.audio;
      els.audio.disabled = !!state.recorder;
      els.preview.classList.toggle('nfr-show', state.previewOn);
      if (state.rec) {
        const c = state.rec.domElement, want = state.previewOn ? els.preview : els.park;
        if (c.parentNode !== want) want.appendChild(c);
      }
      tick();
    }

    function status(msg) {
      if (!root || !root.isConnected) return console.log('[Normal-FOV Recorder]', msg);
      els.status.textContent = msg;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { els.status.textContent = ''; }, 6000);
    }

    setInterval(() => { ensure(); tick(); }, 500);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
    else ensure();
    return { mountCanvas, refresh, status };
  })();
})();

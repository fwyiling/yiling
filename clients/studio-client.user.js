// ==UserScript==
// @name         Syndicate Studio
// @namespace    syndicate
// @version      2.0.0
// @description  Starblast for recording: the game exactly as it looks, with less work for the GPU. Optional (in the \ panel): FOV zoom and extended view, full map radar with names, leaderboard ship icons, ESP, ship colour highlights, no stars, fast respawn, team lock bypass, Aim Assist.
// @match        https://starblast.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
//
// Sections 1-4 leave every pixel the same: they only drop work the game
// asks for that changes nothing. Section 5 trades scenery for frames, only
// while frames are being dropped:
//
// 1. GPU STATE CACHE. Starblast's three.js (r85) re-sends the same values
//    every frame: in a measured match 78% of uniform uploads repeated the
//    value already in place, and buffers, attributes, textures and blend
//    state were re-bound with what was already bound. Each one is a trip
//    through the browser's GPU command queue. Here a call that would set
//    a state to the value it already has is not sent. The cache is kept per
//    context and starts empty (the first call always goes through), and
//    anything that can change state behind it (a deleted buffer or texture,
//    a relinked program, a vertex array switch, a lost context) clears the
//    part it affects.
//
// 2. TEXTURE UPLOADS OF UNCHANGED CANVASES. The scoreboard is redrawn on a
//    256x512 canvas and sent to the GPU every frame, with the same text
//    nearly every time. Every drawing call on a canvas that goes to the GPU
//    is noted (with the drawing state it starts from), and an upload whose
//    drawing is exactly the last one's, into the same texture with the same
//    settings, is not sent again: same calls on a cleared canvas, same
//    pixels. Anything it can't vouch for (a video, a WebGL canvas, an image
//    still loading, pixels written directly, a canvas not cleared first,
//    fonts loading meanwhile) is uploaded as before.
//
// 3. VERTEX ARRAYS (section 4 below): the per-object buffer setup three.js
//    repeats before every draw is made once per setup and bound with one
//    call. localStorage STUDIO_novao = "1" turns just this off.
//
// 4. THE FAST GPU. WebGL asks for the high-performance GPU (the discrete
//    one on a laptop with two) unless the game asked otherwise.
//
// 5. NO FPS DROPS (section 5 below; this one does change what's drawn):
//    the game's own auto quality, which rebuilds the whole renderer when it
//    kicks in, is off; instead, while frames are being dropped, galaxies,
//    nebulae, planets, background and finally resolution go down a step at
//    a time, and come back once it runs clean. F9 shows FPS and the step.
//
// 6. LIGHTER EFFECTS (section 6 below; these change what's drawn): the
//    Syndicate client's performance options, on by default: particle
//    effects off, High-Perf Lasers, Disable Suns, HUD Throttle,
//    Off-Screen Asteroid Culling, Static Objects, Stop Spinning. Each has a
//    switch in the game's Settings, in a "Syndicate Studio" section under
//    the vanilla ones (with one for section 5).
//
// KEYS (in game or in the lobby): \\ opens a settings panel (the game's
// own switches, then the Studio ones); ] turns every Studio change off,
// and ] again brings back what was on.
//
// In the Syndicate Studio app, F11 makes the window fill the screen with
// no frame (for recording).
//
// localStorage STUDIO_off = "1" turns it all off (reload). STUDIO_verify =
// "1" checks every skipped call against the real GPU state and every
// skipped upload against the canvas pixels, and counts any difference
// (window.__studio.stats()); it is slow, for testing only.
window.__perfCoreCfg = { keys: { off: "STUDIO_off", verify: "STUDIO_verify", novao: "STUDIO_novao", gov: "STUDIO_gov" }, govDefault: "1" };
// #region perf-core (clients/shared/perf-core.js, copied in by tools/splice-shared.js: edit it there)
// PERF CORE: the frame-rate work shared by the Studio and Syndicate clients.
// It runs at document-start, before the game makes its WebGL context, its
// settings or its laser system. The host sets window.__perfCoreCfg first:
//   { keys: { off, verify, novao, gov }, govDefault: "1" }
// (localStorage names for: everything off, verify mode, no vertex arrays,
// the governor) and then drives it through window.__perfCore:
//   on            flags the host keeps up to date (noparticles, highperf,
//                 disablesuns, hudthrottle, offscreencull, staticobj, nospin)
//   setGov(on, persist)   the no-FPS-drops governor
//   onRender(fn, order)   fn(scene, camera, info, renderer) before every
//                 draw of every renderer (lower order first; info.world is
//                 true for the game's world scene)
//   afterRender(fn)       fn(scene, camera, info, renderer) after it
//   whenClass(test, install)  install(proto, name) once a game class whose
//                 prototype passes test(proto) exists (one scan of window
//                 per half second for every request, not one each)
//   settings()    the game's settings object; cullScale() how far out
//                 asteroids still count as near (1 = 1,400)
//   ownsTimer(id) true for the core's own intervals (a host that clears
//                 every timer, to stop a page it replaces, must spare them)
//   stats(), gov, fx, readout(el)   for checking
//
// 1. GPU STATE CACHE. Starblast's three.js (r85) re-sends the same values
//    every frame: in a measured match 78% of uniform uploads repeated the
//    value already in place, and buffers, attributes, textures and blend
//    state were re-bound with what was already bound. A call that would set
//    a state to the value it already has is not sent. The cache is kept per
//    context, starts empty, and anything that can change state behind it (a
//    deleted object, a relinked program, a vertex array switch, a lost
//    context) clears the part it affects.
// 2. TEXTURE UPLOADS OF UNCHANGED CANVASES. A canvas whose drawing since its
//    last upload is exactly the same calls on a cleared canvas, uploaded to
//    the same texture with the same settings, is not sent again.
// 3. VERTEX ARRAYS. The per-object buffer setup three.js repeats before
//    every draw is made once per setup and bound with one call.
// 4. THE FAST GPU (powerPreference high-performance).
// 5. NO FPS DROPS: the game's auto quality (which rebuilds the renderer) off;
//    while frames are dropped, galaxies, nebulae, planets, background and
//    finally resolution go down a step at a time, and come back once clean.
// 6. LIGHTER EFFECTS, each behind a flag in `on`.
// Sections 1-4 change no pixel; verify mode checks every skipped call
// against the real GPU state and every skipped upload against the pixels.
(function() {
  "use strict";
  if (window.__perfCore) return;
  var CFG = window.__perfCoreCfg || {}, K = CFG.keys || {};
  var LS = function(k) { try { return k ? localStorage.getItem(k) : null; } catch (e) { return null; } };
  var OFF = LS(K.off) === "1", VERIFY = LS(K.verify) === "1";
  var ST = { skipped: {}, sent: {}, uploadsSkipped: 0, uploadsSent: 0, mismatch: 0, mismatchWhat: [] };
  var ON = {}, PRE = [], POST = [], WAIT = [], TIMERS = {};
  function every(fn, ms) { var id = setInterval(fn, ms); TIMERS[id] = 1; return id; }
  var CORE = window.__perfCore = { version: "1.0.0", off: OFF, verify: VERIFY, on: ON,
    stats: function() { return JSON.parse(JSON.stringify(ST)); },
    onRender: function(fn, order) { fn.__order = order || 0; PRE.push(fn); PRE.sort(function(a, b) { return a.__order - b.__order; }); }, afterRender: function(fn) { POST.push(fn); },
    whenClass: function(test, install, ms) { WAIT.push({ test: test, install: install, until: performance.now() + (ms || 120000) }); if (!SOON) SOON = setTimeout(findClasses, 0); },
    settings: function() { return null; }, setGov: function() {}, cullScale: function() { return 1; }, readout: function() {},
    ownsTimer: function(id) { return TIMERS[id] === 1; } };
  // (the class finder and the render pipeline serve the host even with the
  // GPU work switched off)
  var SOON = 0;
  function findClasses() {
    SOON = 0;
    if (!WAIT.length) return;
    var now = performance.now();
    WAIT = WAIT.filter(function(w) { return w.until > now; });
    for (var key in window) {
      if (!WAIT.length) break;
      var cls; try { cls = window[key]; } catch (e) { continue; }
      if (typeof cls !== "function" || !cls.prototype) continue;
      for (var i = WAIT.length - 1; i >= 0; i--) {
        var w = WAIT[i], hit = false;
        try { hit = w.test(cls.prototype, key); } catch (e) {}
        if (hit) { WAIT.splice(i, 1); try { w.install(cls.prototype, key); } catch (e) { console.warn("[perf-core] install failed:", e); } }
      }
    }
  }
  every(findClasses, 500);
  function skip(k) { ST.skipped[k] = (ST.skipped[k] || 0) + 1; }
  function bad(what) { ST.mismatch++; if (ST.mismatchWhat.length < 20) ST.mismatchWhat.push(what); }

  // ---- 4. the high-performance GPU ----
  var getCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (/^(webgl|webgl2|experimental-webgl)$/.test(type)) {
      var a = {}; if (attrs) for (var k in attrs) a[k] = attrs[k];
      if (a.powerPreference == null) a.powerPreference = "high-performance";
      if (a.failIfMajorPerformanceCaveat == null) a.failIfMajorPerformanceCaveat = false;
      var c = getCtx.call(this, type, a);
      if (c && !this.__stLost) { this.__stLost = 1; this.addEventListener("webglcontextlost", function() { if (c) c.__st = null; }); this.addEventListener("webglcontextrestored", function() { if (c) c.__st = null; }); }
      return c;
    }
    var r = getCtx.apply(this, arguments);
    if (type === "2d" && r) this.__is2d = 1;
    return r;
  };
  if (!OFF) {
    // ---- 1. the GPU state cache ----
    function S(gl) { return gl.__st || (gl.__st = { cap: {}, tex: {}, unit: undefined, buf: {}, fb: {}, rb: undefined, prog: undefined, att: {}, attOn: {}, ps: {}, v: {} }); }
    function same(a, b) { if (a === b) return true; if (!a || !b || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i])) return false; return true; }
    function copy(v) { return v && typeof v.length === "number" && typeof v !== "string" ? Array.prototype.slice.call(v) : v; }
    function patch(P, name, make) { var f = P[name]; if (typeof f !== "function") return; P[name] = make(f); }

    function install(P) {
      var GL = WebGLRenderingContext;
      var ARRAY = GL.ARRAY_BUFFER, ELEM = GL.ELEMENT_ARRAY_BUFFER, TEX0 = GL.TEXTURE0;
      // simple values: key -> last args
      function simple(name, n) {
        patch(P, name, function(f) {
          return function() {
            var s = S(this), k = name + (n === 1 ? ":" + arguments[0] : ""), a = arguments, last = s.v[k];
            if (last && last.length === a.length) { var eq = true; for (var i = 0; i < a.length; i++) if (last[i] !== a[i]) { eq = false; break; } if (eq) { if (VERIFY) verifySimple(this, name, a); skip(name); return; } }
            s.v[k] = Array.prototype.slice.call(a);
            return f.apply(this, a);
          };
        });
      }
      ["depthMask", "depthFunc", "colorMask", "blendEquation", "blendEquationSeparate", "blendFunc", "blendFuncSeparate", "blendColor", "cullFace", "frontFace", "lineWidth", "clearColor", "clearDepth", "clearStencil", "polygonOffset", "viewport", "scissor", "depthRange", "sampleCoverage", "stencilMask"].forEach(function(n) { simple(n, 0); });
      patch(P, "stencilMaskSeparate", function(f) { return function() { delete S(this).v.stencilMask; return f.apply(this, arguments); }; });
      // pixelStorei keyed by pname
      patch(P, "pixelStorei", function(f) { return function(p, v) { var s = S(this); if (s.ps[p] === v) { skip("pixelStorei"); return; } s.ps[p] = v; return f.call(this, p, v); }; });
      // a blend change also covers its separate form and the other way round
      ["blendEquation", "blendEquationSeparate"].forEach(function(n) { var f0 = P[n]; P[n] = function() { var s = S(this); var other = n === "blendEquation" ? "blendEquationSeparate" : "blendEquation"; var r = f0.apply(this, arguments); delete s.v[other]; return r; }; });
      ["blendFunc", "blendFuncSeparate"].forEach(function(n) { var f0 = P[n]; P[n] = function() { var s = S(this); var other = n === "blendFunc" ? "blendFuncSeparate" : "blendFunc"; var r = f0.apply(this, arguments); delete s.v[other]; return r; }; });

      var CAPS = {}; [GL.BLEND, GL.CULL_FACE, GL.DEPTH_TEST, GL.DITHER, GL.POLYGON_OFFSET_FILL, GL.SAMPLE_ALPHA_TO_COVERAGE, GL.SAMPLE_COVERAGE, GL.SCISSOR_TEST, GL.STENCIL_TEST].forEach(function(c) { CAPS[c] = 1; });
      patch(P, "enable", function(f) { return function(c) { var s = S(this); if (CAPS[c] && s.cap[c] === true) { if (VERIFY && this.isEnabled(c) !== true) bad("enable " + c); skip("enable"); return; } if (CAPS[c]) s.cap[c] = true; return f.call(this, c); }; });
      patch(P, "disable", function(f) { return function(c) { var s = S(this); if (CAPS[c] && s.cap[c] === false) { if (VERIFY && this.isEnabled(c) !== false) bad("disable " + c); skip("disable"); return; } if (CAPS[c]) s.cap[c] = false; return f.call(this, c); }; });

      patch(P, "useProgram", function(f) { return function(p) { var s = S(this); if (s.prog === p && p !== undefined) { if (VERIFY && this.getParameter(GL.CURRENT_PROGRAM) !== p) bad("useProgram"); skip("useProgram"); return; } s.prog = p; return f.call(this, p); }; });
      patch(P, "linkProgram", function(f) { return function(p) { if (p) p.__stEp = (p.__stEp || 0) + 1; if (S(this).prog === p) S(this).prog = undefined; return f.call(this, p); }; });
      patch(P, "deleteProgram", function(f) { return function(p) { var s = S(this); if (p) p.__stEp = (p.__stEp || 0) + 1; if (s.prog === p) s.prog = undefined; return f.call(this, p); }; });
      patch(P, "getUniformLocation", function(f) { return function(p, n) { var l = f.call(this, p, n); if (l) { l.__stP = p; l.__stEp = p.__stEp || 0; } return l; }; });
      // uniforms: per location, only while its own program is the one in use
      function uni(name, vec) {
        patch(P, name, function(f) {
          return function(loc) {
            var s = S(this);
            if (!loc || loc.__stP === undefined || loc.__stP !== s.prog || s.prog === undefined || loc.__stEp !== (loc.__stP.__stEp || 0)) { if (loc) loc.__stV = undefined; return f.apply(this, arguments); }
            var a = arguments, v = vec ? a[a.length - 1] : null, key;
            if (vec && a.length !== (/Matrix/.test(name) ? 3 : 2)) { loc.__stV = undefined; return f.apply(this, a); }
            if (vec) { key = name + (a.length === 3 ? ":" + a[1] : ""); var lv = loc.__stV; if (lv && lv.k === key && same(lv.v, v)) { if (VERIFY) verifyUni(this, loc, v); skip(name); return; } loc.__stV = { k: key, v: copy(v) }; }
            else { key = name; var lv2 = loc.__stV, eq = lv2 && lv2.k === key && lv2.v.length === a.length - 1; if (eq) for (var i = 1; i < a.length; i++) if (lv2.v[i - 1] !== a[i]) { eq = false; break; } if (eq) { if (VERIFY) verifyUni(this, loc, Array.prototype.slice.call(a, 1)); skip(name); return; } loc.__stV = { k: key, v: Array.prototype.slice.call(a, 1) }; }
            return f.apply(this, a);
          };
        });
      }
      ["uniform1f", "uniform2f", "uniform3f", "uniform4f", "uniform1i", "uniform2i", "uniform3i", "uniform4i", "uniform1ui", "uniform2ui", "uniform3ui", "uniform4ui"].forEach(function(n) { uni(n, false); });
      ["uniform1fv", "uniform2fv", "uniform3fv", "uniform4fv", "uniform1iv", "uniform2iv", "uniform3iv", "uniform4iv", "uniformMatrix2fv", "uniformMatrix3fv", "uniformMatrix4fv"].forEach(function(n) { uni(n, true); });

      // buffers (vertex and index; with vertex arrays the index buffer is theirs)
      patch(P, "bindBuffer", function(f) { return function(t, b) { var s = S(this); if ((t === ARRAY || t === ELEM) && s.buf[t] === b && b !== undefined) { if (VERIFY && this.getParameter(t === ARRAY ? GL.ARRAY_BUFFER_BINDING : GL.ELEMENT_ARRAY_BUFFER_BINDING) !== b) bad("bindBuffer"); skip("bindBuffer"); return; } if (t === ARRAY || t === ELEM) s.buf[t] = b; return f.call(this, t, b); }; });
      patch(P, "deleteBuffer", function(f) { return function(b) { var s = S(this); for (var t in s.buf) if (s.buf[t] === b) s.buf[t] = null; for (var i in s.att) if (s.att[i] && s.att[i][0] === b) delete s.att[i]; return f.call(this, b); }; });
      patch(P, "enableVertexAttribArray", function(f) { return function(i) { var s = S(this); if (s.attOn[i] === true) { if (VERIFY && this.getVertexAttrib(i, GL.VERTEX_ATTRIB_ARRAY_ENABLED) !== true) bad("enableVAA"); skip("enableVertexAttribArray"); return; } s.attOn[i] = true; return f.call(this, i); }; });
      patch(P, "disableVertexAttribArray", function(f) { return function(i) { var s = S(this); if (s.attOn[i] === false) { if (VERIFY && this.getVertexAttrib(i, GL.VERTEX_ATTRIB_ARRAY_ENABLED) !== false) bad("disableVAA"); skip("disableVertexAttribArray"); return; } s.attOn[i] = false; return f.call(this, i); }; });
      patch(P, "vertexAttribPointer", function(f) { return function(i, sz, ty, no, str, off) { var s = S(this), b = s.buf[ARRAY], a = s.att[i]; if (b !== undefined && a && a[0] === b && a[1] === sz && a[2] === ty && a[3] === no && a[4] === str && a[5] === off) { if (VERIFY && (this.getVertexAttrib(i, GL.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) !== b || this.getVertexAttribOffset(i, GL.VERTEX_ATTRIB_ARRAY_POINTER) !== off)) bad("vertexAttribPointer"); skip("vertexAttribPointer"); return; } s.att[i] = b === undefined ? null : [b, sz, ty, no, str, off]; return f.apply(this, arguments); }; });
      ["vertexAttribIPointer", "vertexAttribDivisor"].forEach(function(n) { patch(P, n, function(f) { return function(i) { delete S(this).att[i]; return f.apply(this, arguments); }; }); });
      function vaoSwitch(f) { return function() { var s = S(this); s.buf[ELEM] = undefined; s.att = {}; s.attOn = {}; return f.apply(this, arguments); }; }
      patch(P, "bindVertexArray", vaoSwitch);

      // textures, per unit and target
      patch(P, "activeTexture", function(f) { return function(u) { var s = S(this); if (s.unit === u) { if (VERIFY && this.getParameter(GL.ACTIVE_TEXTURE) !== u) bad("activeTexture"); skip("activeTexture"); return; } s.unit = u; return f.call(this, u); }; });
      patch(P, "bindTexture", function(f) { return function(t, x) { var s = S(this); if (s.unit !== undefined) { var k = s.unit + ":" + t; if (s.tex[k] === x && x !== undefined) { if (VERIFY && t === GL.TEXTURE_2D && this.getParameter(GL.TEXTURE_BINDING_2D) !== x) bad("bindTexture"); skip("bindTexture"); return; } s.tex[k] = x; } return f.call(this, t, x); }; });
      patch(P, "deleteTexture", function(f) { return function(x) { var s = S(this); for (var k in s.tex) if (s.tex[k] === x) s.tex[k] = null; return f.call(this, x); }; });
      // framebuffers and renderbuffers
      patch(P, "bindFramebuffer", function(f) { return function(t, b) { var s = S(this); if (s.fb[t] === b && b !== undefined) { skip("bindFramebuffer"); return; } s.fb[t] = b; if (t === GL.FRAMEBUFFER) { s.fb[0x8CA8] = b; s.fb[0x8CA9] = b; } else { delete s.fb[GL.FRAMEBUFFER]; } return f.call(this, t, b); }; });
      patch(P, "deleteFramebuffer", function(f) { return function(b) { var s = S(this); for (var t in s.fb) if (s.fb[t] === b) s.fb[t] = null; return f.call(this, b); }; });
      patch(P, "bindRenderbuffer", function(f) { return function(t, b) { var s = S(this); if (s.rb === b && b !== undefined) { skip("bindRenderbuffer"); return; } s.rb = b; return f.call(this, t, b); }; });
      patch(P, "deleteRenderbuffer", function(f) { return function(b) { var s = S(this); if (s.rb === b) s.rb = null; return f.call(this, b); }; });

      // ---- 2. uploads of canvases whose drawing hasn't changed ----
      patch(P, "texImage2D", function(f) {
        return function() {
          var a = arguments, s = S(this), src = a.length === 6 ? a[5] : null, k = s.unit + ":" + a[0], tex = s.unit !== undefined ? s.tex[k] : undefined;
          if (tex && src && src.__is2d && src instanceof HTMLCanvasElement) {
            var key = [a[0], a[1], a[2], a[3], a[4], s.ps[GL.UNPACK_FLIP_Y_WEBGL], s.ps[GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL], s.ps[GL.UNPACK_COLORSPACE_CONVERSION_WEBGL], s.ps[GL.UNPACK_ALIGNMENT], src.width, src.height].join(",");
            var d = src.__cd;
            var unchanged = d && tex.__stUp && tex.__stUp === d.up && d.key === key && s.ps[GL.UNPACK_FLIP_Y_WEBGL] !== undefined && s.ps[GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL] !== undefined &&
              (d.n === 0 || d.ok && d.cur === d.last && fontEp === d.fe);
            if (unchanged) {
              if (VERIFY) verifyCanvas(src, d);
              d.cur = ""; d.n = 0; d.ok = false; d.started = false; d.bp = false;
              ST.uploadsSkipped++; return;
            }
            var r = f.apply(this, a);
            var up = ++UPID; tex.__stUp = up;
            src.__cd = { up: up, key: key, last: d && d.ok ? d.cur : null, cur: "", n: 0, ok: false, started: false, bp: false, fe: fontEp };
            // (read twice: the first read of a GPU canvas comes back with a few
            // bytes off from the second, the copy every later read gives)
            if (VERIFY) try { var vg = src.getContext("2d"); vg.getImageData(0, 0, src.width, src.height); src.__cd.px = vg.getImageData(0, 0, src.width, src.height).data.slice(); } catch (e) {}
            ST.uploadsSent++; return r;
          }
          if (tex) tex.__stUp = 0;
          return f.apply(this, a);
        };
      });
      ["texSubImage2D", "copyTexImage2D", "copyTexSubImage2D", "compressedTexImage2D", "compressedTexSubImage2D", "texStorage2D"].forEach(function(n) {
        patch(P, n, function(f) { return function(t) { var s = S(this), x = s.unit !== undefined ? s.tex[s.unit + ":" + t] : undefined; if (x) x.__stUp = 0; else if (s.unit === undefined) BUMP++; return f.apply(this, arguments); }; });
      });

      // verification helpers (the verify switch only)
      function verifySimple(gl, name, a) {
        var q = { depthMask: [GL.DEPTH_WRITEMASK], depthFunc: [GL.DEPTH_FUNC], cullFace: [GL.CULL_FACE_MODE], frontFace: [GL.FRONT_FACE], lineWidth: [GL.LINE_WIDTH], viewport: [GL.VIEWPORT], scissor: [GL.SCISSOR_BOX], colorMask: [GL.COLOR_WRITEMASK], clearColor: [GL.COLOR_CLEAR_VALUE] }[name];
        if (!q) return; var v = gl.getParameter(q[0]); var w = Array.prototype.slice.call(a);
        if (v && typeof v.length === "number") { if (!same(Array.prototype.slice.call(v).map(function(x) { return typeof x === "number" ? Math.fround(x) : x; }), w.map(function(x) { return typeof x === "number" ? Math.fround(x) : x; }))) bad(name + " " + JSON.stringify(Array.prototype.slice.call(v)) + " v " + JSON.stringify(w)); }
        else if (v !== w[0] && !(typeof v === "number" && Math.fround(v) === Math.fround(w[0]))) bad(name);
      }
      function verifyUni(gl, loc, v) {
        var g = gl.getUniform(loc.__stP, loc); var a = g && typeof g.length === "number" ? Array.prototype.slice.call(g) : [g];
        var b = Array.prototype.slice.call(v).map(function(x) { return typeof x === "boolean" ? x : Math.fround(x); });
        a = a.map(function(x) { return typeof x === "boolean" ? x : Math.fround(+x); });
        if (a.length === b.length) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i] && !(a[i] !== a[i] && b[i] !== b[i]) && !(typeof a[i] === "boolean" || a[i] === +b[i])) { bad("uniform " + JSON.stringify(a.slice(0, 4)) + " v " + JSON.stringify(b.slice(0, 4))); return; } }
      }
    }
    var UPID = 0, BUMP = 0, fontEp = 0;
    function verifyCanvas(c, d) {
      try { var vg = c.getContext("2d"); vg.getImageData(0, 0, c.width, c.height); var px = vg.getImageData(0, 0, c.width, c.height).data, o = d.px; if (!o || o.length !== px.length) { bad("canvas size"); return; } for (var i = 0; i < px.length; i++) if (px[i] !== o[i]) { bad("canvas pixels " + c.width + "x" + c.height); return; } } catch (e) {}
    }
    // (the browser's own functions, for the vertex array layer below: it
    // sets up what it binds itself and must not go through the cache)
    var GP = WebGLRenderingContext.prototype, NAT = {};
    ["bindBuffer", "enableVertexAttribArray", "disableVertexAttribArray", "vertexAttribPointer", "getParameter", "getVertexAttrib", "getVertexAttribOffset", "getExtension"].forEach(function(k) { NAT[k] = GP[k]; });
    install(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) install(WebGL2RenderingContext.prototype);

    // ---- 4. vertex arrays (WebGL 1, the game's) ----
    // Before every draw three.js (r85, no vertex arrays) binds each of the
    // object's buffers and points every attribute at it again: ~200 calls a
    // frame that the cache can't drop, because they differ object to object.
    // Here those calls only note what the game wants; at the draw, the setup
    // it adds up to (which buffers, how laid out, which index buffer) is
    // made once as a vertex array object and from then on bound with one
    // call. What the GPU draws from is exactly what the game set: the verify switch
    // checks it at every draw. A game that uses vertex arrays itself (or
    // instancing) gets everything handed back and the layer steps aside.
    var LZ_ON = LS(K.novao) !== "1", BID = new WeakMap(), NBID = 0;
    function bid(b) { if (!b) return "0"; var i = BID.get(b); if (!i) { i = ++NBID; BID.set(b, i); } return i; }
    function LZ(gl) {
      var L = gl.__lz;
      if (L) return L;
      L = gl.__lz = { mode: "pass" };
      if (!LZ_ON || !(gl instanceof WebGLRenderingContext)) return L;
      var e = null; try { e = NAT.getExtension.call(gl, "OES_vertex_array_object"); } catch (x) {}
      if (!e) return L;
      L.mode = "lazy"; L.ext = e; L.create = e.createVertexArrayOES.bind(e); L.bind = e.bindVertexArrayOES.bind(e); L.del = e.deleteVertexArrayOES.bind(e);
      L.D = { arr: null, elem: null, on: {}, ptr: {} }; L.act = null; L.cur = undefined; L.map = new Map(); L.refs = new Map(); L.scratch = null; L.scrElem = undefined; L.copies = new WeakMap();
      return L;
    }
    var ARRAY_B = WebGLRenderingContext.ARRAY_BUFFER, ELEM_B = WebGLRenderingContext.ELEMENT_ARRAY_BUFFER;
    function syncArr(gl, L) { if (L.act !== L.D.arr) { NAT.bindBuffer.call(gl, ARRAY_B, L.D.arr); L.act = L.D.arr; } }
    function syncElem(gl, L) {
      // (the index buffer belongs to the bound vertex array: changing it on
      // one of ours would change that setup, so a spare one takes it)
      if (!L.scratch) L.scratch = L.create();
      if (L.cur !== L.scratch) { L.bind(L.scratch); L.cur = L.scratch; L.scrElem = undefined; }
      if (L.scrElem !== L.D.elem) { NAT.bindBuffer.call(gl, ELEM_B, L.D.elem); L.scrElem = L.D.elem; }
    }
    function ensure(gl, L) {
      var D = L.D, idx = [], k = "";
      for (var i in D.on) if (D.on[i]) idx.push(+i);
      idx.sort(function(a, b) { return a - b; });
      for (var j = 0; j < idx.length; j++) { var p = D.ptr[idx[j]]; k += idx[j] + (p ? ":" + bid(p[0]) + "," + p[1] + "," + p[2] + "," + p[3] + "," + p[4] + "," + p[5] : ":-") + "|"; }
      k += "#" + bid(D.elem);
      var v = L.map.get(k);
      if (v) { if (L.cur !== v) { L.bind(v); L.cur = v; } }
      else {
        if (L.map.size > 3000) { L.map.forEach(function(x) { L.del(x); }); L.map.clear(); L.refs.clear(); }
        v = L.create(); L.bind(v); L.cur = v;
        for (var q = 0; q < idx.length; q++) {
          var pp = D.ptr[idx[q]];
          if (pp) { if (L.act !== pp[0]) { NAT.bindBuffer.call(gl, ARRAY_B, pp[0]); L.act = pp[0]; } NAT.vertexAttribPointer.call(gl, idx[q], pp[1], pp[2], pp[3], pp[4], pp[5]); ref(L, pp[0], k); }
          NAT.enableVertexAttribArray.call(gl, idx[q]);
        }
        NAT.bindBuffer.call(gl, ELEM_B, D.elem); ref(L, D.elem, k);
        L.map.set(k, v); skip("vertexArrayMade");
      }
      if (VERIFY) verifyVao(gl, L, idx);
    }
    function ref(L, b, k) { if (!b) return; var r = L.refs.get(b); if (!r) L.refs.set(b, r = []); r.push(k); }
    function verifyVao(gl, L, idx) {
      var D = L.D, n = NAT.getParameter.call(gl, gl.MAX_VERTEX_ATTRIBS);
      for (var i = 0; i < n; i++) {
        var want = !!D.on[i], has = NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        if (want !== has) { bad("attrib " + i + " enabled " + has + " v " + want); return; }
        if (!want) continue;
        var p = D.ptr[i]; if (!p) continue;
        if (NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) !== p[0] || NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_SIZE) !== p[1] || NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_TYPE) !== p[2] ||
          NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_NORMALIZED) !== !!p[3] || NAT.getVertexAttrib.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_STRIDE) !== p[4] || NAT.getVertexAttribOffset.call(gl, i, gl.VERTEX_ATTRIB_ARRAY_POINTER) !== p[5]) { bad("attrib " + i + " pointer"); return; }
      }
      if (NAT.getParameter.call(gl, gl.ELEMENT_ARRAY_BUFFER_BINDING) !== D.elem) bad("index buffer");
    }
    // hand everything back: the game's own vertex arrays, or instancing
    function toPass(gl) {
      var L = gl.__lz; if (!L || L.mode !== "lazy") { if (L) L.mode = "pass"; else gl.__lz = { mode: "pass" }; return; }
      var D = L.D; L.bind(null); L.cur = null;
      for (var i in D.on) { var p = D.ptr[i]; if (p) { NAT.bindBuffer.call(gl, ARRAY_B, p[0]); NAT.vertexAttribPointer.call(gl, +i, p[1], p[2], p[3], p[4], p[5]); } if (D.on[i]) NAT.enableVertexAttribArray.call(gl, +i); else NAT.disableVertexAttribArray.call(gl, +i); }
      for (var i2 in D.ptr) if (!(i2 in D.on)) { var p2 = D.ptr[i2]; NAT.bindBuffer.call(gl, ARRAY_B, p2[0]); NAT.vertexAttribPointer.call(gl, +i2, p2[1], p2[2], p2[3], p2[4], p2[5]); }
      NAT.bindBuffer.call(gl, ELEM_B, D.elem); NAT.bindBuffer.call(gl, ARRAY_B, D.arr);
      L.map.forEach(function(x) { L.del(x); }); if (L.scratch) L.del(L.scratch);
      L.mode = "pass"; var s = S(gl); s.att = {}; s.attOn = {}; s.buf = {};
    }
    (function(P) {
      function lz(name, fn) { var prev = P[name]; if (typeof prev !== "function") return; P[name] = function() { var L = LZ(this); if (L.mode !== "lazy") return prev.apply(this, arguments); return fn.call(this, L, prev, arguments); }; }
      lz("bindBuffer", function(L, prev, a) { if (a[0] === ARRAY_B) { if (L.D.arr === a[1]) skip("bindBuffer"); L.D.arr = a[1]; return; } if (a[0] === ELEM_B) { if (L.D.elem === a[1]) skip("bindBuffer"); L.D.elem = a[1]; return; } return prev.apply(this, a); });
      lz("enableVertexAttribArray", function(L, prev, a) { if (L.D.on[a[0]] === true) skip("enableVertexAttribArray"); L.D.on[a[0]] = true; });
      lz("disableVertexAttribArray", function(L, prev, a) { if (L.D.on[a[0]] === false) skip("disableVertexAttribArray"); L.D.on[a[0]] = false; });
      lz("vertexAttribPointer", function(L, prev, a) { var o = L.D.ptr[a[0]], b = L.D.arr; if (o && o[0] === b && o[1] === a[1] && o[2] === a[2] && o[3] === a[3] && o[4] === a[4] && o[5] === a[5]) skip("vertexAttribPointer"); L.D.ptr[a[0]] = [b, a[1], a[2], a[3], a[4], a[5]]; });
      function drawer(L, prev, a) { ensure(this, L); return prev.apply(this, a); }
      lz("drawArrays", drawer); lz("drawElements", drawer);
      function bufOp(L, prev, a) {
        var t = a[0]; if (t === ARRAY_B) syncArr(this, L); else if (t === ELEM_B) syncElem(this, L);
        return prev.apply(this, a);
      }
      lz("bufferSubData", function(L, prev, a) { var b = a[0] === ARRAY_B ? L.D.arr : a[0] === ELEM_B ? L.D.elem : null; if (b) L.copies.delete(b); return bufOp.call(this, L, prev, a); });
      lz("getBufferParameter", bufOp);
      // (an upload of exactly the bytes the buffer already holds, up to 4 KB:
      // same size, same use, same contents)
      lz("bufferData", function(L, prev, a) {
        var b = a[0] === ARRAY_B ? L.D.arr : a[0] === ELEM_B ? L.D.elem : null, d = a[1];
        if (b && d && typeof d === "object" && d.byteLength != null && d.byteLength <= 4096) {
          var u8 = new Uint8Array(d.buffer || d, d.byteOffset || 0, d.byteLength), c = L.copies.get(b);
          if (c && c.u === a[2] && c.d.length === u8.length) { var eq = true; for (var i = 0; i < u8.length; i++) if (c.d[i] !== u8[i]) { eq = false; break; } if (eq) { skip("bufferData"); return; } }
          var r = bufOp.call(this, L, prev, a); L.copies.set(b, { u: a[2], d: u8.slice() }); return r;
        }
        if (b) L.copies.delete(b);
        return bufOp.call(this, L, prev, a);
      });
      lz("deleteBuffer", function(L, prev, a) {
        var b = a[0], D = L.D, r = L.refs.get(b);
        if (r) { r.forEach(function(k) { var v = L.map.get(k); if (v) { L.del(v); L.map.delete(k); if (L.cur === v) L.cur = undefined; } }); L.refs.delete(b); }
        if (D.arr === b) D.arr = null; if (L.act === b) L.act = null; if (D.elem === b) D.elem = null; if (L.scrElem === b) L.scrElem = undefined;
        for (var i in D.ptr) if (D.ptr[i] && D.ptr[i][0] === b) D.ptr[i] = [null, D.ptr[i][1], D.ptr[i][2], D.ptr[i][3], D.ptr[i][4], D.ptr[i][5]];
        L.copies.delete(b);
        return prev.apply(this, a);
      });
      // what the game asks about comes from what it set
      lz("getParameter", function(L, prev, a) { if (a[0] === this.ARRAY_BUFFER_BINDING) return L.D.arr; if (a[0] === this.ELEMENT_ARRAY_BUFFER_BINDING) return L.D.elem; if (a[0] === 0x85B5) return null; return prev.apply(this, a); });
      lz("getVertexAttrib", function(L, prev, a) { ensure(this, L); return prev.apply(this, a); });
      lz("getVertexAttribOffset", function(L, prev, a) { ensure(this, L); return prev.apply(this, a); });
    })(WebGLRenderingContext.prototype);

    // vertex arrays and instancing from the WebGL 1 extensions: the game using
    // either gets the plain state back
    var getExt = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = function(n) {
      var e = getExt.call(this, n), gl = this;
      if (e && /vertex_array_object$/i.test(n) && !e.__stG && typeof e.bindVertexArrayOES === "function") { e.__stG = 1; var b = e.bindVertexArrayOES; e.bindVertexArrayOES = function() { toPass(gl); var s = S(gl); s.buf[WebGLRenderingContext.ELEMENT_ARRAY_BUFFER] = undefined; s.att = {}; s.attOn = {}; return b.apply(this, arguments); }; }
      // (three.js asks for instancing at start whether it uses it or not: the
      // layer steps aside on its first actual use)
      if (e && /instanced_arrays$/i.test(n) && !e.__stG && typeof e.vertexAttribDivisorANGLE === "function") {
        e.__stG = 1; var dv = e.vertexAttribDivisorANGLE, dai = e.drawArraysInstancedANGLE, dei = e.drawElementsInstancedANGLE;
        e.vertexAttribDivisorANGLE = function(i) { toPass(gl); delete S(gl).att[i]; return dv.apply(this, arguments); };
        e.drawArraysInstancedANGLE = function() { toPass(gl); return dai.apply(this, arguments); };
        e.drawElementsInstancedANGLE = function() { toPass(gl); return dei.apply(this, arguments); };
      }
      return e;
    };

    // ---- the drawing record of each canvas that goes to the GPU ----
    // Every call that can change a 2D canvas's pixels or drawing state is
    // added to the canvas's record since its last upload; the record counts
    // only if it starts by clearing the whole canvas with no transform or clip
    // (then the pixels depend on nothing but the record and the state it
    // started from, which is written in first).
    var CP = CanvasRenderingContext2D.prototype, OID = new WeakMap(), NID = 0;
    function oid(o) { var i = OID.get(o); if (!i) { i = ++NID; OID.set(o, i); } return i; }
    function val(x) {
      if (x == null || typeof x !== "object") return typeof x === "number" ? String(x) : typeof x === "string" ? JSON.stringify(x) : String(x);
      if (x instanceof HTMLCanvasElement) return x.__is2d ? "C" + oid(x) + "." + (x.__ver || 0) + "." + x.width + "x" + x.height : null;
      if (window.HTMLImageElement && x instanceof HTMLImageElement) return x.complete && x.naturalWidth ? "I" + oid(x) + "." + x.currentSrc : null;
      if (window.HTMLVideoElement && x instanceof HTMLVideoElement) return null;
      if (window.OffscreenCanvas && x instanceof OffscreenCanvas) return null;
      if (window.ImageData && x instanceof ImageData) return null;
      if (window.Path2D && x instanceof Path2D) return "P" + oid(x) + "." + (x.__ver || 0);
      if (x.__sig !== undefined) return x.__sig;
      if (typeof x.length === "number") { var parts = Array.prototype.map.call(x, val); return parts.indexOf(null) >= 0 ? null : "[" + parts.join(",") + "]"; }
      return "O" + oid(x) + "." + (x.__ver || 0);
    }
    var SETTER = {};
    var READONLY = { getImageData: 1, measureText: 1, isPointInPath: 1, isPointInStroke: 1, getTransform: 1, getLineDash: 1, createLinearGradient: 1, createRadialGradient: 1, createConicGradient: 1, createPattern: 1, createImageData: 1, getContextAttributes: 1, isContextLost: 1, constructor: 1, drawFocusIfNeeded: 1 };
    var PROPS = [];
    Object.getOwnPropertyNames(CP).forEach(function(k) {
      var d = Object.getOwnPropertyDescriptor(CP, k); if (!d) return;
      if (typeof d.value === "function" && !READONLY[k]) {
        var f = d.value;
        CP[k] = function() {
          var c = this.canvas; if (c) { c.__ver = (c.__ver || 0) + 1; var r = c.__cd; if (r) note(this, c, r, k, arguments); }
          if (k === "save") (this.__clip || (this.__clip = [0])).push(this.__clip[this.__clip.length - 1]);
          else if (k === "restore") { if (this.__clip && this.__clip.length > 1) this.__clip.pop(); }
          else if (k === "clip") { var cs = this.__clip || (this.__clip = [0]); cs[cs.length - 1] = 1; }
          else if (k === "reset") this.__clip = [0];
          return f.apply(this, arguments);
        };
      } else if (d.set && d.get && k !== "canvas") {
        PROPS.push(k); SETTER[k] = 1;
        Object.defineProperty(CP, k, { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v) { var c = this.canvas; if (c) { var r = c.__cd; if (r) note(this, c, r, k, [v]); } return d.set.call(this, v); } });
      }
    });
    function note(ctx, c, r, k, a) {
      if (!r.started) {
        // (a style set before the clear only matters through the state the
        // clear reads in; the first drawing call decides whether it counts)
        if (SETTER[k]) return;
        r.started = true; r.ok = false;
        if (k === "clearRect" && !(ctx.__clip && ctx.__clip[ctx.__clip.length - 1])) {
          var t = ctx.getTransform ? ctx.getTransform() : null;
          if (t && t.isIdentity && a[0] <= 0 && a[1] <= 0 && a[0] + a[2] >= c.width && a[1] + a[3] >= c.height) {
            r.ok = true; var st = [];
            for (var i = 0; i < PROPS.length; i++) { try { st.push(val(ctx[PROPS[i]])); } catch (e) { st.push("?"); } }
            try { st.push(val(ctx.getLineDash())); } catch (e) {}
            if (st.indexOf(null) >= 0) r.ok = false;
            r.cur = st.join(";") + "|";
          }
        }
      }
      if (!SETTER[k]) r.n++;
      if (!r.ok) return;
      // (the path carries over from before the record: filling or stroking
      // it before a beginPath depends on what came earlier)
      if (k === "beginPath") r.bp = true;
      else if ((k === "fill" || k === "stroke" || k === "clip") && !r.bp && !(a[0] && typeof a[0] === "object")) { r.ok = false; return; }
      var s = k + "(";
      for (var j = 0; j < a.length; j++) { var v = val(a[j]); if (v === null) { r.ok = false; return; } s += (j ? "," : "") + v; }
      r.cur += s + ")";
      if (r.cur.length > 200000) r.ok = false;
    }
    // gradients and patterns are known by what they're made of, not which
    // object they are (the game makes the scoreboard's gradient anew every
    // frame): the same arguments and stops paint the same
    ["createLinearGradient", "createRadialGradient", "createConicGradient", "createPattern"].forEach(function(k) {
      var f = CP[k]; if (typeof f !== "function") return;
      CP[k] = function() { var g = f.apply(this, arguments); if (g && typeof g === "object") { var parts = Array.prototype.map.call(arguments, val); g.__sig = parts.indexOf(null) >= 0 ? null : k + "(" + parts.join(",") + ")"; } return g; };
    });
    if (window.CanvasGradient) { var acs = CanvasGradient.prototype.addColorStop; CanvasGradient.prototype.addColorStop = function(o, c) { var r = acs.call(this, o, c); if (this.__sig !== null) this.__sig = (this.__sig || "G" + oid(this)) + "|" + val(o) + "," + val(c); return r; }; }
    if (window.CanvasPattern && CanvasPattern.prototype.setTransform) { var pst = CanvasPattern.prototype.setTransform; CanvasPattern.prototype.setTransform = function(m) { var r = pst.apply(this, arguments); this.__sig = null; return r; }; }
    // what a record refers to that can change in place
    [window.Path2D && Path2D.prototype].forEach(function(PP) {
      if (!PP) return; Object.getOwnPropertyNames(PP).forEach(function(k) { var d = Object.getOwnPropertyDescriptor(PP, k); if (!d || typeof d.value !== "function" || k === "constructor") return; var f = d.value; PP[k] = function() { this.__ver = (this.__ver || 0) + 1; return f.apply(this, arguments); }; });
    });
    // a resize clears the canvas and its state: it doesn't count as the same
    ["width", "height"].forEach(function(k) {
      var d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, k); if (!d || !d.set) return;
      Object.defineProperty(HTMLCanvasElement.prototype, k, { configurable: true, enumerable: d.enumerable, get: d.get, set: function(v) { this.__ver = (this.__ver || 0) + 1; if (this.__cd) { this.__cd.n++; this.__cd.ok = false; } return d.set.call(this, v); } });
    });
    // text drawn before a font finished loading looks different after
    try { if (document.fonts) { document.fonts.addEventListener("loadingdone", function() { fontEp++; }); document.fonts.addEventListener("loading", function() { fontEp++; }); } } catch (e) {}
  }

  // ---- 5. no FPS drops: the quality governor ----
  // The game's own "auto" quality turns antialiasing off after ~8 s under
  // 45 FPS, and that rebuilds its whole renderer (a new GPU context, every
  // texture sent and every shader compiled again) at the very moment it's
  // struggling; it's switched off. Instead, while frames are being dropped
  // (frame times against the screen's refresh), the settings that take
  // effect at once go down one step at a time, the least visible first. In a
  // measured match (software GPU): galaxies, nebulae, planets and moons off
  // +51% FPS, background off +36%, full resolution off +52%. After a clean
  // while a step comes back; one that brings drops back waits twice as long.
  var GOV_ON = !OFF && (LS(K.gov) == null ? CFG.govDefault !== "0" : LS(K.gov) !== "0");
  var STEPS = [
    { name: "full quality", set: {} },
    { name: "galaxies off", set: { galaxies: false } },
    { name: "nebulae off", set: { galaxies: false, nebulae: false } },
    { name: "planets off", set: { galaxies: false, nebulae: false, planets: false, moons: false } },
    { name: "background off", set: { galaxies: false, nebulae: false, planets: false, moons: false, background: false } },
    { name: "lower resolution", set: { galaxies: false, nebulae: false, planets: false, moons: false, background: false, fullres: false } }
  ];
  var GV = CORE.gov = { on: GOV_ON, settings: null, step: 0, fps: 0, dropPct: 0, vsync: 0, changes: 0, wait: {}, lastChange: 0, log: [], steps: STEPS };
  // the game's settings object, found by its "forced" overrides (which its
  // check() reads before the saved value)
  var cands = [];
  try {
    Object.defineProperty(Object.prototype, "forced", { configurable: true,
      set: function(v) { Object.defineProperty(this, "forced", { value: v, writable: true, configurable: true, enumerable: true }); if (cands && cands.length < 50) cands.push(this); },
      get: function() { return undefined; } });
  } catch (e) {}
  function findSettings() {
    if (GV.settings) return GV.settings;
    for (var i = 0; cands && i < cands.length; i++) { var c = cands[i]; if (c && typeof c.check === "function" && c.parameters && c.parameters.fullres && c.parameters.antialias && c.forced) { GV.settings = c; break; } }
    if (GV.settings) { try { delete Object.prototype.forced; } catch (e) {} cands = null; GV.settings.auto = false; }
    // (not found within two minutes: a game update changed it; stand down)
    else if (performance.now() > 120000 && cands) { try { delete Object.prototype.forced; } catch (e) {} cands = null; }
    return GV.settings;
  }
  CORE.settings = findSettings;
  function apply(step) {
    var st = findSettings(); if (!st) return;
    var all = STEPS[STEPS.length - 1].set, want = STEPS[step].set;
    for (var k in all) { if (k in want) st.forced[k] = { value: want[k] }; else delete st.forced[k]; }
    GV.step = step; GV.lastChange = performance.now(); GV.changes++;
    GV.log.push(Math.round(performance.now() / 1000) + "s " + STEPS[step].name); if (GV.log.length > 30) GV.log.shift();
  }
  CORE.setGov = function(on, persist) {
    GV.on = GOV_ON = !!on;
    if (persist && K.gov) try { localStorage.setItem(K.gov, on ? "1" : "0"); } catch (e) {}
    if (!on && GV.step) apply(0);
  };
  // one frame time per frame (every requestAnimationFrame callback of a
  // frame is given the same time)
  var lastT = 0, D = [], raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb) {
    return raf.call(window, function(t) {
      if (t !== lastT) { if (lastT && t - lastT < 1000) { D.push(t - lastT); if (D.length > 600) D.shift(); } lastT = t; }
      return cb(t);
    });
  };
  every(function tick() {
    var st = findSettings(); if (st) st.auto = false;
    if (!GOV_ON || !st || document.hidden || D.length < 60) return;
    var now = performance.now(), recent = D.slice(-Math.min(D.length, 180));
    var srt = recent.slice().sort(function(a, b) { return a - b; });
    var vs = srt[Math.floor(srt.length * .1)]; GV.vsync = vs;
    var drops = 0, sum = 0; for (var i = 0; i < recent.length; i++) { sum += recent[i]; if (recent[i] > vs * 1.6) drops++; }
    GV.fps = Math.round(1000 * recent.length / sum); GV.dropPct = Math.round(1000 * drops / recent.length) / 10;
    var since = now - GV.lastChange;
    if (GV.dropPct >= 4 && since > 3000 && GV.step < STEPS.length - 1) {
      if (since < 8000 && GV.lastUp) GV.wait[GV.step] = Math.min(240000, (GV.wait[GV.step] || 20000) * 2);
      GV.lastUp = false; apply(GV.step + 1); D.length = 0;
    } else if (GV.dropPct < .6 && GV.step > 0 && since > (GV.wait[GV.step - 1] || 20000)) {
      GV.lastUp = true; apply(GV.step - 1); D.length = 0;
    }
  }, 1000);
  CORE.readout = function(el) { if (el) el.textContent = GV.fps + " fps · drops " + GV.dropPct + "% · " + STEPS[GV.step].name + (GOV_ON ? "" : " (governor off)"); };

  // ---- 6. lighter effects ----
  // Each is behind a flag in `on` (the host's settings). They change what's
  // drawn, on purpose, for frames; each works the moment its flag changes.
  var FXS = CORE.fx = { renderers: 0, world: false, sparks: false, lasers: 0, sun: false, trail: false, hud: { figures: false, info: false }, asteroids: false, culled: 0 };
  function wrapCtor(Orig, make) { var W = make(Orig); W.prototype = Orig.prototype; try { Object.setPrototypeOf(W, Orig); } catch (e) {} W.__perfW = 1; return W; }
  function trapProp(obj, name, wrap) {
    var val = obj[name]; if (val) val = wrap(val);
    try { Object.defineProperty(obj, name, { configurable: true, enumerable: true, get: function() { return val; }, set: function(v) { val = v && !v.__perfW ? wrap(v) : v; } }); } catch (e) {}
  }
  function threeTraps(T) { trapProp(T, "WebGLRenderer", function(R0) { return wrapCtor(R0, function(O) { return function(p) { O.call(this, p); onRenderer(this); }; }); }); }
  try {
    var t3v = window.THREE;
    if (t3v) threeTraps(t3v);
    else Object.defineProperty(window, "THREE", { configurable: true, enumerable: true, get: function() { return t3v; }, set: function(v) { t3v = v; if (v && typeof v === "object" && !v.__perfT) { try { Object.defineProperty(v, "__perfT", { value: 1 }); } catch (e) {} threeTraps(v); } } });
  } catch (e) {}
  // The one render hook: every renderer the game makes, from the moment it's
  // made. Before a world draw: the effects below, then the host's passes in
  // the order they were added; after it, the host's after-passes.
  var CAM = null, SC = new WeakMap();
  function onRenderer(r) {
    FXS.renderers++; var f = r.render;
    r.render = function(scene, cam) {
      var I = null;
      if (scene) { try { I = beforeRender(scene, cam); } catch (e) {} for (var i = 0; i < PRE.length; i++) try { PRE[i](scene, cam, I, this); } catch (e) {} }
      try { return f.apply(this, arguments); }
      finally { if (scene) for (var j = 0; j < POST.length; j++) try { POST[j](scene, cam, I, this); } catch (e) {} }
    };
  }
  function attrs(o) { return o && o.geometry && o.geometry.attributes ? o.geometry.attributes : null; }
  // what a scene holds, looked at again every 2 s (new ships, asteroids)
  function scan(scene, I) {
    I.lasers = []; I.sparks = []; I.spin = []; I.hedra = []; I.sun = null; I.at = performance.now();
    scene.traverse(function(o) {
      if (o.type === "Points") { var a = attrs(o); if (!a) return; if (a.speedratio) I.lasers.push(o); else if (a.speed && a.opac && a.time && !a.type && !a.figure && !a.startype) I.sparks.push(o); return; }
      if (o.type !== "Mesh") return;
      var g = o.geometry && o.geometry.type;
      if (g === "IcosahedronGeometry" || g === "OctahedronGeometry") I.hedra.push(o);
      else if (o.parent && o.parent.type === "Group") I.spin.push(o);
    });
    I.world = I.lasers.length > 0;
    // (the sun: a large mesh, not a group, at the middle of the world)
    if (I.world) for (var i = 0; i < scene.children.length; i++) { var c = scene.children[i]; if (!c || c.type === "Group" || !c.isMesh || !c.position || !c.scale) continue; if (Math.abs(c.position.x) > 5 || Math.abs(c.position.y) > 5 || c.scale.x < 20) continue; I.sun = c; break; }
  }
  function hide(o, off) { if (off) { if (o.visible) { o.visible = false; o.__pcHid = 1; } } else if (o.__pcHid) { o.visible = true; o.__pcHid = 0; } }
  function beforeRender(scene, cam) {
    var I = SC.get(scene); if (!I) { I = {}; SC.set(scene, I); scan(scene, I); }
    else if (performance.now() - I.at > 2000) scan(scene, I);
    if (!I.world) return I;
    FXS.world = true; FXS.lasers = I.lasers.length; FXS.sparks = I.sparks.length > 0; FXS.sun = !!I.sun;
    if (cam && cam.position) CAM = cam.position;
    var i;
    for (i = 0; i < I.sparks.length; i++) hide(I.sparks[i], ON.noparticles);
    if (I.sun) hide(I.sun, ON.disablesuns);
    if (ON.staticobj) for (i = 0; i < I.hedra.length; i++) I.hedra[i].rotation.set(0, 0, 0);
    if (ON.nospin) for (i = 0; i < I.spin.length; i++) I.spin[i].rotation.set(0, 0, 0);
    var st = findSettings();
    if (st && st.forced) { if (ON.noparticles) { st.forced.explolight = { value: false }; FXS.el = 1; } else if (FXS.el) { delete st.forced.explolight; FXS.el = 0; } }
    return I;
  }
  // High-Perf Lasers: the laser system's trail ring read as at most 5 points
  // while the flag is on (set on the object as the game builds it)
  try {
    Object.defineProperty(Object.prototype, "trail_size", { configurable: true, get: function() { return undefined; },
      set: function(v) { var real = v; Object.defineProperty(this, "trail_size", { configurable: true, enumerable: true, get: function() { return ON.highperf ? Math.max(1, Math.min(real, 5)) : real; }, set: function(n) { real = n; } }); FXS.trail = true; } });
  } catch (e) {}
  // HUD Throttle: the HUD bars (each bar on its own clock: setBar's first
  // argument) and the FPS/ping panel at most 15 times a second. The game
  // calls these only when a value changes, so a call that comes too soon is
  // kept and applied when its 1/15 s comes: the last value always shows.
  function throttle(proto, k, tag, perArg) {
    var o = proto[k]; if (typeof o !== "function" || o.__perfT) return;
    var w = function() {
      if (!ON.hudthrottle) return o.apply(this, arguments);
      var self = this, key = perArg ? String(arguments[0]) : "_", T = this.__pcHud || (this.__pcHud = {}), t = T[key] || (T[key] = { at: -1e9, args: null, timer: 0 });
      var n = performance.now(), wait = 66.6667 - (n - t.at);
      if (wait <= 0 && !t.timer) { t.at = n; return o.apply(this, arguments); }
      t.args = Array.prototype.slice.call(arguments);
      if (!t.timer) t.timer = setTimeout(function() { t.timer = 0; t.at = performance.now(); var a = t.args; t.args = null; if (a) o.apply(self, a); }, Math.max(0, wait));
    };
    w.__perfT = 1; w.__original = o; proto[k] = w; FXS.hud[tag] = true;
  }
  CORE.whenClass(function(p) { return typeof p.setBar === "function" && typeof p.updateLives === "function"; }, function(p) { throttle(p, "setBar", "figures", true); });
  CORE.whenClass(function(p) { return typeof p.repaint === "function" && /FPS|ping/.test(String(p.repaint)); }, function(p) { throttle(p, "repaint", "info", false); }, 60000);
  // Off-Screen Asteroid Culling: an asteroid farther than 1,400 (times
  // cullScale) from the camera has its model updated every 6th frame.
  CORE.whenClass(function(p) {
    var names = Object.getOwnPropertyNames(p);
    for (var i = 0; i < names.length; i++) { var d = Object.getOwnPropertyDescriptor(p, names[i]); if (!d || typeof d.value !== "function") continue; var s = String(d.value); if (s.indexOf("rotation_period") >= 0 && s.indexOf("this.pop<15") >= 0 && /this\.[\w$]+\.rotation\.y=\w+%this\.rotation_period/.test(s)) { p.__pcCullName = names[i]; return true; } }
    return false;
  }, function(p) {
    var k = p.__pcCullName, o = p[k], mp = /this\.([\w$]+)\.rotation\.y=\w+%this\.rotation_period/.exec(String(o))[1];
    p[k] = function() {
      if (!ON.offscreencull || !CAM) return o.apply(this, arguments);
      var m = this[mp]; if (!m || !m.position) return o.apply(this, arguments);
      var dx = m.position.x - CAM.x, dy = m.position.y - CAM.y, r = 1400 * (CORE.cullScale() || 1);
      if (dx * dx + dy * dy <= r * r) return o.apply(this, arguments);
      this.__pcC = ((this.__pcC || 0) + 1) % 6; if (this.__pcC === 0) return o.apply(this, arguments);
      FXS.culled++;
    };
    FXS.asteroids = true;
  });
})();
// #endregion perf-core
// ---- Studio: its switches, ship outlines and keys, on the perf core ----
(function() {
  "use strict";
  if (window.__studio) return;
  var CORE = window.__perfCore, GV = CORE.gov;
  var LS = function(k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  // (the app it runs in names itself: Syndicate Studio or Sisyphus)
  var BRAND = String(window.__studioBrand || "SYNDICATE STUDIO").replace(/[<>&"]/g, "");
  var FX = {
    noparticles:   { name: "Remove particle effects", def: "1" },
    highperf:      { name: "High-Perf Lasers", def: "1" },
    disablesuns:   { name: "Disable Suns", def: "1" },
    hudthrottle:   { name: "HUD Throttle (15fps)", def: "1" },
    offscreencull: { name: "Off-Screen Asteroid Culling", def: "1" },
    staticobj:     { name: "Static Objects", def: "1" },
    nospin:        { name: "Stop Spinning", def: "1" },
    outlines:      { name: "Ship outlines (ship hue)", def: "1" }
  };
  var FXV = CORE.on;
  for (var fk in FX) { var fv = LS("STUDIO_fx_" + fk); FXV[fk] = !CORE.off && (fv == null ? FX[fk].def : fv) === "1"; }
  window.__studio = { version: "2.0.0", off: CORE.off, verify: CORE.verify, stats: CORE.stats, gov: GV, fx: CORE.fx, fxOn: FXV };

  // Ship outlines: a copy of each ship part a little larger, back faces only,
  // in the part's own glow colour (the ship's hue), behind it; asteroids and
  // see-through parts skipped. New ships are picked up every 2 s.
  var OL = new WeakMap(), OLS = [];
  CORE.onRender(function(scene, cam, I) {
    var T = window.THREE; if (!I || !I.world || !T || !T.MeshBasicMaterial) return;
    if (FXV.outlines && I.olAt !== I.at) {
      I.olAt = I.at;
      for (var i = 0; i < scene.children.length; i++) {
        var g = scene.children[i]; if (!g || g.type !== "Group") continue;
        g.traverse(function(o) {
          if (!o.isMesh || o.__stOL || OL.has(o) || !o.material || !o.geometry) return;
          var m = o.material; if (m.transparent === true || m.blending === T.AdditiveBlending) return;
          if (/hedron/i.test(o.geometry.type || "")) return;
          if (!/^Mesh(Lambert|Phong|Standard|Basic)Material$/.test(m.type)) return;
          var hex = m.emissive && m.emissive.getHex() ? m.emissive.getHex() : m.color ? m.color.getHex() : 0xffffff;
          var ol = new T.Mesh(o.geometry, new T.MeshBasicMaterial({ color: hex, side: T.BackSide, depthWrite: false, transparent: true, opacity: .85 }));
          ol.scale.set(1.12, 1.12, 1.12); ol.__stOL = 1; o.add(ol); OL.set(o, ol); OLS.push(ol);
        });
      }
    }
    if (OLS.length && OLS.__on !== FXV.outlines) { for (var j = 0; j < OLS.length; j++) OLS[j].visible = FXV.outlines; OLS.__on = FXV.outlines; }
  });

  function setStudio(k, on) {
    ALLOFF = null; window.__studio.allOff = false;
    if (k === "gov") { CORE.setGov(on, true); return; }
    FXV[k] = on; try { localStorage.setItem("STUDIO_fx_" + k, on ? "1" : "0"); } catch (x) {}
  }
  // ] : every Studio change off, and ] again: back to what was on before
  var ALLOFF = null;
  function allOff() {
    if (!ALLOFF) {
      ALLOFF = { fx: {}, gov: GV.on }; for (var k in FX) { ALLOFF.fx[k] = FXV[k]; FXV[k] = false; }
      CORE.setGov(false, false);
    } else {
      for (var k3 in ALLOFF.fx) FXV[k3] = ALLOFF.fx[k3]; CORE.setGov(ALLOFF.gov, false); ALLOFF = null;
    }
    window.__studio.allOff = !!ALLOFF;
    [document.querySelector(".modal .modalbody"), PANEL].forEach(function(b) { if (!b) return; var ins = b.querySelectorAll("input[data-studio]"); for (var i = 0; i < ins.length; i++) { var kk = ins[i].getAttribute("data-studio"); ins[i].checked = kk === "gov" ? GV.on : !!FXV[kk]; } });
  }
  function rows() { var r = [{ k: "gov", name: "No FPS drops (smart quality)", on: GV.on }]; for (var k in FX) r.push({ k: k, name: FX[k].name, on: FXV[k] }); return r; }
  // The game's own Settings, under its vanilla options: a section with the
  // same switches (the game builds its settings with buildSettings, a name
  // that survives its minifier)
  function addStudioRows(body) {
    if (!body || body.querySelector("[data-studio]")) return;
    var h = '<div class="option" style="margin-top:12px;opacity:.75;font-size:.8em;letter-spacing:.12em">' + BRAND + '</div>';
    rows().forEach(function(r) { h += '<div class="option">' + r.name + '<label class="switch"><input type="checkbox" data-studio="' + r.k + '"' + (r.on ? ' checked="checked"' : "") + '><div class="slider"></div></label></div>'; });
    body.insertAdjacentHTML("beforeend", h);
    body.addEventListener("change", function(e) { var k = e.target && e.target.getAttribute && e.target.getAttribute("data-studio"); if (k) setStudio(k, !!e.target.checked); });
  }
  CORE.whenClass(function(p) { return typeof p.buildSettings === "function"; }, function(p) {
    var bs = p.buildSettings;
    p.buildSettings = function() { var r = bs.apply(this, arguments); try { addStudioRows(document.querySelector(".modal .modalbody")); } catch (e) {} return r; };
  });
  // \ : a settings panel over the game (the game's own Settings screen
  // belongs to the lobby, hidden in a match): the game's switches, set
  // through its settings as its menu does, then the Studio ones
  var PANEL = null;
  // (built from the game's own settings markup, so the game's stylesheet
  // draws it; where that doesn't reach, a stand-in in the same look)
  var FB_CSS = ".studio-modal.studio-fb{background:hsla(200,45%,9%,.92);border:1px solid hsla(200,60%,70%,.35);border-radius:6px;box-shadow:0 0 24px hsla(200,80%,50%,.18),0 12px 40px rgba(0,0,0,.6);color:#fff;font-family:Play,sans-serif}" +
    ".studio-modal.studio-fb .modaltitle{padding:12px 16px;font-size:20px;text-align:center;letter-spacing:.06em;border-bottom:1px solid hsla(200,60%,70%,.2);background:hsla(200,50%,15%,.6)}" +
    ".studio-modal.studio-fb .modalbody{padding:6px 18px 14px}" +
    ".studio-modal.studio-fb .option{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;font-size:15px;border-bottom:1px solid hsla(0,0%,100%,.06)}" +
    ".studio-modal.studio-fb .switch{position:relative;display:inline-block;flex:none;width:44px;height:22px;cursor:pointer}" +
    ".studio-modal.studio-fb .switch input{position:absolute;opacity:0;width:0;height:0}" +
    ".studio-modal.studio-fb .slider{position:absolute;inset:0;border-radius:22px;background:hsla(200,20%,40%,.6);transition:.2s}" +
    ".studio-modal.studio-fb .slider:before{content:'';position:absolute;left:3px;top:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}" +
    ".studio-modal.studio-fb input:checked+.slider{background:hsl(200,80%,50%)}" +
    ".studio-modal.studio-fb input:checked+.slider:before{transform:translateX(22px)}" +
    ".studio-modal.studio-fb button{font:inherit;color:#fff;background:hsla(200,60%,30%,.7);border:1px solid hsla(200,60%,70%,.4);border-radius:4px;padding:2px 10px;cursor:pointer}";
  function panel() {
    if (PANEL) { PANEL.remove(); PANEL = null; return; }
    var st = CORE.settings();
    if (!document.getElementById("studio-modal-fb")) { var css = document.createElement("style"); css.id = "studio-modal-fb"; css.textContent = FB_CSS; (document.head || document.documentElement).appendChild(css); }
    PANEL = document.createElement("div");
    PANEL.className = "modal studio-modal";
    PANEL.style.cssText = "position:fixed;left:50%;top:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);margin:0;z-index:2147483647;width:min(440px,92vw);max-height:84vh;overflow:auto;display:block;opacity:1;visibility:visible;box-sizing:border-box";
    function row(label, attr, on) { return '<div class="option">' + label + '<label class="switch"><input type="checkbox" ' + attr + (on ? ' checked="checked"' : "") + '><div class="slider"></div></label></div>'; }
    function sec(title) { return '<div class="studio-sec" style="opacity:.55;font-size:.75em;letter-spacing:.14em;margin:14px 0 2px;text-transform:uppercase">' + title + "</div>"; }
    var h = '<div class="modaltitle">Settings</div><div class="modalbody"><div style="opacity:.55;font-size:.75em;text-align:center;margin:2px 0 4px">\\ or Esc to close · ] all mods off/on</div>';
    if (st && st.parameters) {
      h += sec("Game");
      for (var k in st.parameters) { var P = st.parameters[k]; if (!P || typeof P.value !== "boolean" || P.type || (st.isHidden && st.isHidden(k))) continue; h += row(P.name || k, 'data-game="' + k + '"', P.value); }
    }
    h += sec(BRAND);
    rows().forEach(function(r) { h += row(r.name, 'data-studio="' + r.k + '"', r.on); });
    if (window.__studioExt) h += window.__studioExt.rows(row, sec);
    PANEL.innerHTML = h + "</div>";
    PANEL.addEventListener("change", function(e) {
      var t = e.target, on = !!t.checked, g = t.getAttribute("data-game"), k2 = t.getAttribute("data-studio");
      if (g && st) { try { if (typeof st.set === "function") st.set(g, on); else st.parameters[g].value = on; } catch (x) {} return; }
      if (k2) setStudio(k2, on);
    });
    PANEL.addEventListener("keydown", function(e) { e.stopPropagation(); });
    (document.body || document.documentElement).appendChild(PANEL);
    try {
      var sl = PANEL.querySelector(".slider"), scs = sl && getComputedStyle(sl), pcs = getComputedStyle(PANEL);
      if (!scs || scs.position !== "absolute" || pcs.backgroundColor === "rgba(0, 0, 0, 0)") PANEL.classList.add("studio-fb");
    } catch (x) { PANEL.classList.add("studio-fb"); }
    if (window.__studioExt) window.__studioExt.bind(PANEL);
  }
  // F9: a small readout (FPS, drops, quality step), for checking
  var HUD = null;
  setInterval(function() { CORE.readout(HUD); }, 500);
  try {
    window.addEventListener("keydown", function(e) {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      var t = e.target; if (t && (t.tagName === "INPUT" && t.type !== "checkbox" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "\\") { e.preventDefault(); e.stopPropagation(); panel(); }
      else if (e.key === "Escape" && PANEL) { e.preventDefault(); e.stopPropagation(); panel(); }
      else if (e.key === "]") { e.preventDefault(); e.stopPropagation(); allOff(); }
      else if (e.key === "F9") {
        e.preventDefault();
        if (HUD) { HUD.remove(); HUD = null; return; }
        HUD = document.createElement("div");
        HUD.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.6);padding:3px 7px;border-radius:4px;pointer-events:none";
        (document.body || document.documentElement).appendChild(HUD); CORE.readout(HUD);
      } else if (e.key === "F11") {
        // (in the app: the window fills the screen with no frame)
        var T = window.__TAURI__, inv = T && (T.core && T.core.invoke || T.invoke);
        if (inv) { e.preventDefault(); e.stopPropagation(); inv("studio_fullscreen").catch(function() {}); }
      }
    }, true);
  } catch (e) {}
})();
// ---- Studio: Syndicate's FOV zoom, full map radar with names, and Aim Assist ----
// The socket hook goes in at once (before the game connects); the features
// start once the page is up. Each has its switch in the \ panel, and ]
// (all mods off) takes them off too.
(function() {
  "use strict";
  if (window.__studioExt) return;
  var LS = function(k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var FEAT = {
    fov:        { key: "AEGIS_fov",        def: "1" },
    radarzoom:  { key: "AEGIS_radarzoom",  def: "0" },
    radarnames: { key: "AEGIS_radarnames", def: "1" },
    radaricons: { key: "AEGIS_radaricons", def: "0" },
    radartier:  { key: "AEGIS_radartier",  def: "1" },
    aim:        { key: "STUDIO_aim",       def: "0" },
    wide:       { key: "AEGIS_wideview",   def: "1" },
    nostars:    { key: "STUDIO_nostars",   def: "1" },
    lbicons:    { key: "STUDIO_lbicons",   def: "1" },
    teamlock:   { key: "STUDIO_teamlock",  def: "1" },
    fastrespawn:{ key: "AEGIS_fastrespawn", def: "1" },
    esp:        { key: "STUDIO_esp",       def: "1" },
    saturate:   { key: "STUDIO_saturate",  def: "1" },
    highcontrast:{ key: "AEGIS_highcontrast", def: "1" },
    teamhl:     { key: "STUDIO_teamhl",    def: "1" }
  };
  function espNear() { var v = LS("STUDIO_esp_range"); return v === "near"; }
  function espDist() { var v = parseFloat(LS("STUDIO_esp_dist")); return v >= 10 ? v : 100; }
  var FEAT_V = {};
  function featOn(f) {
    if (!FEAT[f]) return false;
    if (window.__studio && window.__studio.allOff) return false;
    var v = FEAT_V[f];
    if (v === undefined) v = FEAT_V[f] = (LS(FEAT[f].key) || FEAT[f].def) === "1";
    return v;
  }
  function featSet(f, on) {
    FEAT_V[f] = !!on;
    try { localStorage.setItem(FEAT[f].key, on ? "1" : "0"); } catch (e) {}
  }

  // ---- game state off the wire ----
  var _nativeAB = Blob.prototype.arrayBuffer;
  // one copy of each game message's bytes, however many listeners read it
  function _synBytes(blob) { return blob.__synAB || (blob.__synAB = _nativeAB.call(blob)); }
  var _aegisShips = {}, _aegisNames = {}, _aegisWS = null;
  var _aegisTeamOf = {}, _aegisHueOf = {}, _aegisMapHalf = 400;
  // Control messages (the steering word) never go out faster than 90 in any
  // second, whoever sends them (the game or Aim Assist): more than ~120 a
  // second gets an IP ban. Over the limit, the newest word waits.
  var _ctlTimes = [], _ctlPend = null, _ctlTimer = 0, CTL_MAX = 90;
  function _synCtlSend(ws, d) {
    var now = performance.now();
    while (_ctlTimes.length && now - _ctlTimes[0] >= 1000) _ctlTimes.shift();
    if (_ctlTimes.length < CTL_MAX && !_ctlPend) {
      _ctlTimes.push(now);
      try { return Object.getPrototypeOf(ws).send.call(ws, d); } catch (e) { return; }
    }
    _ctlPend = { ws: ws, d: d };
    if (!_ctlTimer) _ctlTimer = setTimeout(function flush() {
      _ctlTimer = 0;
      var n2 = performance.now();
      while (_ctlTimes.length && n2 - _ctlTimes[0] >= 1000) _ctlTimes.shift();
      if (_ctlTimes.length >= CTL_MAX) { _ctlTimer = setTimeout(flush, Math.max(1, 1000 - (n2 - _ctlTimes[0]) + 1)); return; }
      var P = _ctlPend; _ctlPend = null;
      if (P && P.ws.readyState === 1) { _ctlTimes.push(n2); try { Object.getPrototypeOf(P.ws).send.call(P.ws, P.d); } catch (e) {} }
    }, Math.max(1, 1000 - (now - (_ctlTimes[0] || now)) + 1));
  }
  window.__synCtlSend = _synCtlSend;
  // Ship status packets (type 0) by ship id.
  var _synStat = {};
  window.__synShipStat = _synStat;
  function _synShipStatus(b) {
    if (b.length < 48 || b[0] !== 0) return;
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var tf = dv.getUint16(14, true), code = tf & 0x3FF;
    var r = dv.getFloat32(32, true);
    _synStat[b[1]] = {
      id: b[1], alive: (b[2] & 1) === 1, up: (b[2] & 2) === 2, code: code, tier: Math.floor(code / 100),
      x: dv.getFloat32(16, true), y: dv.getFloat32(20, true), vx: dv.getFloat32(24, true), vy: dv.getFloat32(28, true),
      angle: ((r * 180 / Math.PI) % 360 + 360) % 360, shield: dv.getUint16(42, true),
      crystals: dv.getUint16(46, true), score: b.length >= 52 ? dv.getUint32(48, true) : 0, ts: Date.now(),
      inv: (tf & 0x8000) !== 0, healing: (tf & 0x400) !== 0, gen: dv.getUint16(44, true), steer: dv.getUint16(12, true) % 360,
      glide: (tf & 0x4000) !== 0, side: b[2] & 32 ? 1 : b[2] & 64 ? -1 : 0, stun: b[40], spin: dv.getFloat32(36, true), tick: dv.getUint32(8, true),
      stime: dv.getUint32(4, true)
    };
    _synClock(_synStat[b[1]]);
    if (window.__synAimStat) try { window.__synAimStat(_synStat[b[1]]); } catch (e) {}
  }
  // How old a ship's state really is: the least-delayed packets set the
  // offset between the server's clock and ours.
  var _synClkOff = null, _synClkAt = 0, _synClkOdd = 0, _synClkBad = false;
  function _synClock(s) {
    var v = s.ts - s.stime;
    if (!(s.stime > 0) || _synClkBad) return;
    if (_synClkOff != null && v - _synClkOff > 1500) { if (++_synClkOdd >= 6) { _synClkBad = true; _synClkOff = null; return; } } else _synClkOdd = 0;
    if (_synClkOff == null || Math.abs(v - _synClkOff) > 5000) { _synClkOff = v; _synClkAt = s.ts; return; }
    if (v < _synClkOff) _synClkOff = v; else _synClkOff += Math.min(v - _synClkOff, (s.ts - _synClkAt) * .0005);
    _synClkAt = s.ts;
  }
  function synAge(s, now) {
    now = now || Date.now();
    var byArrival = now - s.ts;
    if (_synClkOff == null || !(s.stime > 0)) return byArrival;
    var a = now - (s.stime + _synClkOff);
    return a >= byArrival - 5 && a - byArrival < 3000 ? a : byArrival;
  }
  window.__synAge = synAge;
  // Lasers in flight (type 100 volleys: laser id -> shooter).
  var _synLaserOwner = {}, _synLaserN = 0;
  function _synCombat(b) {
    var t = b[0], now = Date.now();
    if (t === 100) {
      if (b.length < 40) return;
      if (window.__synAimVolley) try { window.__synAimVolley(b); } catch (e) {}
      if (window.__synDodgeVolley) try { window.__synDodgeVolley(b); } catch (e) {}
      for (var o = 8; o + 32 <= b.length; o += 32) { _synLaserOwner[b[o + 24] | b[o + 25] << 8] = [b[1], now]; _synLaserN++; }
      if (_synLaserN > 3000) {
        for (var k in _synLaserOwner) if (now - _synLaserOwner[k][1] > 5000) delete _synLaserOwner[k];
        _synLaserN = 0;
      }
      return;
    }
    if (b.length < (t === 101 ? 13 : 12)) return;
    if (window.__synDodgeGone) try { window.__synDodgeGone(b[2] | b[3] << 8); } catch (e) {}
  }
  var SHIP_TTL = 6e3, NAME_THROTTLE = 4e3, BOT_ZERO_TTL = 5e3;
  // Names for radar ids: each id asked at most 3 times, 4 requests a second.
  var _aegisNameReq = {}, _aegisNameTries = {}, _aegisNameBucket = { t: 0, n: 0 };
  function requestName(id) {
    try {
      if (!_aegisWS || _aegisWS.readyState !== 1 || _aegisNames[id]) return;
      var now = Date.now();
      if (_aegisNameReq[id] && now - _aegisNameReq[id] < NAME_THROTTLE) return;
      if ((_aegisNameTries[id] || 0) >= 3) return;
      if (now - _aegisNameBucket.t > 1000) { _aegisNameBucket.t = now; _aegisNameBucket.n = 0; }
      if (_aegisNameBucket.n >= 4) return;
      _aegisNameBucket.n++;
      _aegisNameTries[id] = (_aegisNameTries[id] || 0) + 1;
      _aegisNameReq[id] = now;
      _aegisWS.send(JSON.stringify({ name: "get_name", data: { id: Number(id) } }));
    } catch (e) {}
  }
  function onBinary(b) {
    if (b[0] === 0) _synShipStatus(b);
    else if (b[0] === 100 || b[0] === 101 || b[0] === 103) _synCombat(b);
    else if (b[0] === 255) {
      for (var sy = 1; sy < b.length; ) {
        var sl = b[sy++];
        if (sy + sl <= b.length) {
          var st = b[sy];
          if (sl >= 48 && st === 0) _synShipStatus(b.subarray(sy, sy + sl));
          else if (st === 100 || st === 101 || st === 103) _synCombat(b.subarray(sy, sy + sl));
        }
        sy += sl;
      }
    }
    // radar contacts (200; 201 once survival starts)
    if (b[0] !== 200 && b[0] !== 201 || b.length < 10) return;
    var count = b[1];
    if (count < 1) return;
    var recSize = Math.floor((b.length - 2) / count);
    if (recSize < 5) return;
    var ts = Date.now();
    for (var i = 0; i < count; i++) {
      var off = 2 + i * recSize, id = b[off];
      if (id <= 0) continue;
      var bx = b[off + 1], by = b[off + 2];
      var alive = recSize >= 4 ? (b[off + 3] & 1) === 1 : true;
      if (!alive) { delete _aegisShips[id]; continue; }
      var x = (bx < 128 ? bx : bx - 256) * (_aegisMapHalf / 128);
      var y = (by < 128 ? by : by - 256) * (_aegisMapHalf / 128);
      var rTier = recSize >= 8 ? 1 + ((b[off + 3] >> 5) & 7) : null;
      var rCode = rTier != null ? 100 * rTier + 1 + b[off + 7] : null;
      var prev = _aegisShips[id];
      if (prev) {
        prev.tier = rTier; prev.code = rCode;
        var dt = (ts - prev.ts) / 1e3;
        if (dt > .02 && dt < 3) {
          var nvx = (x - prev.x) / dt, nvy = (y - prev.y) / dt;
          prev.vx = prev.vx === undefined ? nvx : prev.vx * .5 + nvx * .5;
          prev.vy = prev.vy === undefined ? nvy : prev.vy * .5 + nvy * .5;
        }
        prev.x = x; prev.y = y; prev.ts = ts;
        if (x === 0 && y === 0) { if (prev.zeroSince == null) prev.zeroSince = ts; } else prev.zeroSince = null;
      } else {
        _aegisShips[id] = { tier: rTier, code: rCode, x: x, y: y, curX: x, curY: y, vx: 0, vy: 0, ts: ts, zeroSince: x === 0 && y === 0 ? ts : null };
      }
    }
  }
  function onText(t, ws, u) {
    if (typeof t !== "string" || t.charAt(0) !== "{") return;
    var j;
    try { j = JSON.parse(t); } catch (e) { return; }
    if (!j || !j.data) return;
    if (j.name === "player_name") {
      _aegisNames[j.data.id] = j.data.player_name;
      if (typeof j.data.friendly === "number") _aegisTeamOf[j.data.id] = j.data.friendly;
      if (typeof j.data.hue === "number") _aegisHueOf[j.data.id] = j.data.hue;
    } else if (j.name === "entered") {
      if (typeof j.data.team === "number") window.__synMyTeam = j.data.team;
      if (typeof j.data.shipid === "number") window.__synMyShipId = j.data.shipid;
    } else if (j.name === "welcome") {
      // a new game: ship ids are reused, so last game's names and teams go
      _aegisTeamOf = {}; _aegisNames = {}; _aegisNameTries = {}; _aegisHueOf = {};
      window.__synMyTeam = null; window.__synMyShipId = null;
      for (var sk in _synStat) delete _synStat[sk];
      _synClkOff = null; _synClkOdd = 0; _synClkBad = false;
      window.__synWelcome = { data: j.data, url: u, ws: ws, ts: Date.now() };
      window.__synGameWS = ws;
      if (j.data.size > 0) _aegisMapHalf = Math.round(j.data.size / 2);
    }
  }
  (function hookWS() {
    var OrigWS = window.WebSocket;
    function PatchedWS(url, proto) {
      var ws = proto ? new OrigWS(url, proto) : new OrigWS(url);
      var u = String(url || "");
      if (/dankdmitron\.dev|pixelmelt\.dev/i.test(u)) return ws;
      if (!(/starblast|neuronality/i.test(u) || (/^wss?:\/\/\d{1,3}(?:\.\d{1,3}){3}/i.test(u) && !/127\.0\.0\.1/.test(u)))) return ws;
      // (the game also opens latency-probe sockets: a socket is the game's
      // for sure once it sends the join request)
      if (!_aegisWS || _aegisWS.readyState > 1) _aegisWS = ws;
      try { if (window.__synSpecAttach) window.__synSpecAttach(ws); } catch (e) {}
      ws.send = function(d) {
        if (typeof d === "string" && d.indexOf('"ojct:4"') !== -1) { _aegisWS = ws; window.__synGameWS = ws; }
        // Aim Assist: the heading in each control message is swapped for the solved aim
        if (typeof d === "number" || typeof d === "string" && /^\d+$/.test(d)) {
          var ad = d;
          if (featOn("aim") && window.__synAimRewrite) { try { ad = window.__synAimRewrite(d, ws); } catch (e) { ad = d; } }
          return _synCtlSend(ws, ad);
        }
        return Object.getPrototypeOf(ws).send.apply(ws, arguments);
      };
      ws.addEventListener("message", function(evt) {
        var d = evt.data;
        if (d instanceof Blob) _synBytes(d).then(function(buf) { try { onBinary(new Uint8Array(buf)); } catch (e) {} }).catch(function() {});
        else if (d instanceof ArrayBuffer) { try { onBinary(new Uint8Array(d)); } catch (e) {} }
        else onText(d, ws, u);
      });
      ws.addEventListener("close", function() { if (_aegisWS === ws) _aegisWS = null; });
      return ws;
    }
    PatchedWS.prototype = OrigWS.prototype;
    PatchedWS.OPEN = OrigWS.OPEN;
    PatchedWS.CLOSED = OrigWS.CLOSED;
    PatchedWS.CONNECTING = OrigWS.CONNECTING;
    PatchedWS.CLOSING = OrigWS.CLOSING;
    Object.defineProperty(PatchedWS, "name", { value: "WebSocket" });
    window.WebSocket = PatchedWS;
  })();

  // ---- the game's own state ----
  var _hashTrusted = false;
  window.addEventListener("hashchange", function() { _hashTrusted = true; });
  function inGame() {
    if (_hashTrusted && /^#\d+/.test(location.hash)) return true;
    if (_aegisWS && _aegisWS.readyState === 1 && document.querySelector("canvas")) return true;
    try {
      var ex = window.module && window.module.exports && window.module.exports.settings;
      if (ex) for (var k in ex) {
        var g = ex[k];
        if (g && g.pending_respawn && "player_name" in g) return true;
        if (g && g.mode && g.mode.id && g.mode.id !== "welcome") { _hashTrusted = true; return true; }
      }
    } catch (e) {}
    return false;
  }
  window.__SB_GAME__ = null;
  setInterval(function() {
    try {
      var s = window.module && window.module.exports && window.module.exports.settings;
      if (!s) return;
      for (var k in s) {
        var obj = s[k];
        if (!obj || !obj.mode || !obj.display || !obj.names || typeof obj.size !== "number") continue;
        var d = obj.display;
        for (var dk in d) {
          try {
            var v = d[dk];
            if (v && typeof v.render === "function" && v.domElement && v.domElement.isConnected) { window.__SB_GAME__ = obj; return; }
          } catch (e2) {}
        }
      }
    } catch (e) {}
  }, 500);
  function getGS() {
    try {
      var sb = window.__SB_GAME__;
      if (sb && sb.mode && sb.names && "player_name" in sb) return sb;
    } catch (e) {}
    try {
      var ex = window.module && window.module.exports;
      if (!ex) return null;
      var src = ex.settings || ex, keys = Object.keys(src);
      for (var i = 0; i < keys.length; i++) {
        try { var v = src[keys[i]]; if (v && v.mode && v.names && "player_name" in v) return v; } catch (e) {}
      }
    } catch (e) {}
    return null;
  }
  var _myKey = null;
  function getMyStatus(g) {
    if (!g) return null;
    try { var c = _myKey && g[_myKey]; if (c && c.status && typeof c.status.x === "number") return c.status; } catch (e) {}
    var keys = Object.keys(g);
    for (var i = 0; i < keys.length; i++) {
      try { var v = g[keys[i]]; if (v && v.status && typeof v.status.x === "number") { _myKey = keys[i]; return v.status; } } catch (e) {}
    }
    return null;
  }
  var _camAt = 0, _cam = null;
  function getActiveCamera() {
    try {
      var now = performance.now();
      if (_cam && _cam.isPerspectiveCamera && now - _camAt < 1000) return _cam;
      _camAt = now; _cam = null;
      var g = window.__SB_GAME__ || getGS();
      if (!g) return null;
      var keys = Object.keys(g);
      for (var i = 0; i < keys.length; i++) {
        var v = g[keys[i]];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          var vk = Object.keys(v);
          for (var j = 0; j < vk.length; j++) {
            try { var c = v[vk[j]]; if (c && c.isPerspectiveCamera) return _cam = c; } catch (e) {}
          }
        }
      }
    } catch (e) {}
    return null;
  }
  function getScreenXform(g) {
    try {
      var canvas = document.querySelector("#canvaswrapper canvas");
      if (!canvas || !(g && g.display && g.display.width > 0 && g.display.height > 0)) return null;
      var rect = canvas.getBoundingClientRect();
      if (!(rect.width > 0) || !(rect.height > 0)) return null;
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    } catch (e) { return null; }
  }
  function worldToScreenPx(cam, wx, wy, g) {
    if (!cam || !cam.matrixWorldInverse || !cam.projectionMatrix) return null;
    var vi = cam.matrixWorldInverse.elements, pj = cam.projectionMatrix.elements;
    var vx = vi[0] * wx + vi[4] * wy + vi[12], vy = vi[1] * wx + vi[5] * wy + vi[13], vz = vi[2] * wx + vi[6] * wy + vi[14], vw = vi[3] * wx + vi[7] * wy + vi[15];
    var cx = pj[0] * vx + pj[4] * vy + pj[8] * vz + pj[12] * vw, cy = pj[1] * vx + pj[5] * vy + pj[9] * vz + pj[13] * vw, cw = pj[3] * vx + pj[7] * vy + pj[11] * vz + pj[15] * vw;
    if (cw <= 1e-4) return null;
    var xf = g && getScreenXform(g);
    if (xf) return { x: xf.left + (cx / cw * .5 + .5) * xf.width, y: xf.top + (-cy / cw * .5 + .5) * xf.height };
    return { x: (cx / cw * .5 + .5) * window.innerWidth, y: (-cy / cw * .5 + .5) * window.innerHeight };
  }
  // Aim Assist reads its hold key here (Q unless set in the \ panel)
  if (!window.__aegisGetKeybinds) window.__aegisGetKeybinds = function() {
    return { aimassist: { key: LS("STUDIO_aim_key") || "q", on: featOn("aim") }, duelpilot: { key: "", on: false } };
  };

  // Fast respawn: the game's respawn wait is skipped and the respawn asked
  // for at once, then again (gently) while the game still waits
  var _origSetTimeout = window.setTimeout;
  window.setTimeout = function(fn, delay) {
    if (delay > 500 && typeof fn === "function" && featOn("fastrespawn")) {
      try {
        var src = Function.prototype.toString.call(fn);
        if (src.indexOf("killed(") >= 0 || src.indexOf("pending_respawn") >= 0) {
          fn();
          _origSetTimeout(function() { try { if (_aegisWS && _aegisWS.readyState === 1) _aegisWS.send(JSON.stringify({ name: "respawn" })); } catch (e) {} }, 50);
          return;
        }
      } catch (e) {}
    }
    return _origSetTimeout.apply(this, arguments);
  };
  var _fastResp = { last: 0, n: 0 };
  setInterval(function() {
    if (!featOn("fastrespawn")) return;
    try {
      var s = window.module && window.module.exports && window.module.exports.settings, pending = false;
      if (!s) return;
      for (var k in s) { var g = s[k]; if (g && g.pending_respawn && "player_name" in g) { pending = true; break; } }
      if (!pending) { _fastResp.n = 0; return; }
      var now = Date.now();
      if (_fastResp.n >= 4 || now - _fastResp.last < 1500) return;
      if (_aegisWS && _aegisWS.readyState === 1) { _aegisWS.send(JSON.stringify({ name: "respawn" })); _fastResp.last = now; _fastResp.n++; }
    } catch (e) {}
  }, 250);
  // Extended FOV view: Syndicate's spectator engine, zoomed out with FOV
  // zoom it grows the asteroid window and places far ships
  (function synSpectator() {
    'use strict';
    var TAN = Math.tan((22.5 * Math.PI) / 180);
    var BASE_Z = 70;
    var now = function() { return performance.now(); };
    var S = {
      ws: null, welcome: null, seed: null, modeId: null, teams: [], mapSize: 0, world: 0, myId: null,
      players: new Map(), rocks: new Map(), field: null, tickBase: null, tickAt: 0, tickGuess: false,
      effects: [], survival: false, live: true
    };
    try { if (localStorage.getItem('syn_spec_live') === '0') S.live = false; } catch (e) {}
    var serverTick = function() { return S.tickBase == null ? null : S.tickBase + (Date.now() - S.tickAt) * 0.06; };
    function player(id) {
      var p = S.players.get(id);
      if (!p) {
        p = { id: id, name: '', hue: 0, team: null, code: 101, score: 0, rank: 0, alive: false,
          samples: [], exact: null, known: null, heading: 0, blend: null, wasExact: false, askedName: 0 };
        S.players.set(id, p);
      }
      return p;
    }
    function wrapDelta(d) { var W = S.world || 1; d = ((d % W) + W) % W; return d > W / 2 ? d - W : d; }
    function wrapPos(v) { var W = S.world || 1, h = W / 2; return ((((v + h) % W) + W) % W) - h; }
    function angleLerp(a, b, k) { var d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; }
    var first = function(a) { return Array.isArray(a) ? a[0] : a; };

    // ── sockets: every game socket is watched; the one that gets "welcome" is the game
    var watched = new WeakSet();
    window.__synSpecAttach = function(ws) {
      if (!ws || watched.has(ws)) return;
      watched.add(ws);
      ws.addEventListener('message', function(ev) {
        var d = ev.data;
        if (typeof d === 'string') {
          if (d.indexOf('"welcome"') !== -1 && ws !== S.ws) adopt(ws);
          if (ws === S.ws) onText(d);
        } else if (ws === S.ws) {
          if (d instanceof ArrayBuffer) onBinary(new DataView(d));
          else if (d instanceof Blob) _synBytes(d).then(function(b) { if (ws === S.ws) onBinary(new DataView(b)); });
          else if (d && d.arrayBuffer) d.arrayBuffer().then(function(b) { if (ws === S.ws) onBinary(new DataView(b)); });
        }
      });
    };
    function adopt(ws) {
      if (SP.active) exitSpectator();
      S.ws = ws; S.myId = null; S.tickBase = null; S.effects = [];
      S.players.clear(); S.rocks.clear(); SP.loaded = false;
    }
    function inject(buf) {
      if (!S.ws || typeof S.ws.onmessage !== 'function') return false;
      S.ws.onmessage({ data: { arrayBuffer: function() { return Promise.resolve(buf); } } });
      return true;
    }
    function sendJSON(obj) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj)); }
    function onText(txt) {
      if (txt[0] !== '{') return;
      var m; try { m = JSON.parse(txt); } catch (e) { return; }
      var d = m.data;
      if (m.name === 'welcome') {
        var mode = d.mode || {};
        S.welcome = d; S.seed = d.seed; S.modeId = mode.id || null; S.teams = mode.teams || [];
        S.world = d.size || mode.map_size * 10 || 0; S.survival = false; S.field = null;
        S.mapSize = mode.map_size || S.world / 10;
        if (d.servertime != null) { S.tickBase = d.servertime * 0.06; S.tickAt = Date.now(); S.tickGuess = true; }
      } else if (m.name === 'entered') {
        S.myId = d.shipid;
      } else if (m.name === 'player_name') {
        var p = player(d.id); p.name = d.player_name; p.hue = d.hue; p.team = d.friendly;
      }
    }
    function onBinary(v) {
      var op = v.getUint8(0);
      if (op === 0) onShipStatus(v);
      else if (op === 200 || op === 201) { S.survival = op === 201; onScoreboard(v); }
      else if (op === 110) {
        var r = rockAt(v.getInt8(2), v.getInt8(3));
        S.rocks.set(v.getInt8(2) + ',' + v.getInt8(3), v.getUint32(4, true));
        if (r && (SP.active || testOn)) { S.effects.push({ kind: 'rock', x: r.x, y: r.y, t: now() }); fxRockDestroyed(r, v.getUint8(8)); }
      } else if (op === 210) {
        var base = v.getUint32(1, true);
        for (var o = 5; o + 2 < v.byteLength; o += 3) S.rocks.set(v.getInt8(o) + ',' + v.getInt8(o + 1), base + v.getUint8(o + 2));
      } else if (op === 150) {
        var victim = player(v.getUint8(1));
        if (SP.active || testOn) {
          var pos = renderPos(victim);
          if (pos) { fxKill(victim, pos, v.getUint8(2)); S.effects.push({ kind: 'kill', x: pos.x, y: pos.y, t: now() }); }
        }
        victim.alive = false; victim.known = null;
      }
    }
    function onShipStatus(v) {
      var tick = v.getUint32(8, true), est = serverTick();
      if (est == null || S.tickGuess || tick > est - 2) { S.tickBase = tick; S.tickAt = Date.now(); S.tickGuess = false; }
      var p = player(v.getUint8(1)), flags = v.getUint8(2);
      var e = p.exact = {
        at: now(), tick: tick, x: v.getFloat32(16, true), y: v.getFloat32(20, true),
        vx: v.getFloat32(24, true), vy: v.getFloat32(28, true), r: v.getFloat32(32, true),
        alive: (flags & 1) > 0, lives: (flags >> 2) & 7, type: v.getUint16(14, true) & 1023,
        shield: v.getUint16(42, true), generator: v.getUint16(44, true), gems: v.getUint16(46, true),
        score: v.getUint32(48, true), levels: v.getUint32(52, true)
      };
      p.code = e.type; p.alive = e.alive; p.score = e.score; p.heading = e.r; p.wasExact = true; p.blend = null;
      p.known = { shield: e.shield, gems: e.gems, generator: e.generator, levels: e.levels, lives: e.lives, code: e.type, at: Date.now() };
    }
    function onScoreboard(v) {
      var half = S.world / 2, t = now(), seen = new Set();
      for (var i = 0, n = v.getUint8(1); i < n; i++) {
        var o = 2 + 8 * i, id = v.getUint8(o), p = player(id);
        var flags = v.getUint8(o + 3), w = v.getUint32(o + 4, true), alive = (flags & 1) > 0;
        seen.add(id);
        if (alive && !p.alive) p.samples = [];
        p.alive = alive; p.rank = i; p.score = w & 0xffffff; p.code = 100 * (1 + ((flags >> 5) & 7)) + 1 + (w >>> 24);
        p.samples.push({ t: t, x: ((v.getInt8(o + 1) + 0.5) / 128) * half, y: ((v.getInt8(o + 2) + 0.5) / 128) * half });
        if (p.samples.length > 8) p.samples.shift();
        // (names: asked only while the spectator view or the map is up)
        if (!p.name && (SP.active || SP.wide || testOn) && Date.now() - p.askedName > 5000) { p.askedName = Date.now(); sendJSON({ name: 'get_name', data: { id: id } }); }
      }
      S.players.forEach(function(_, id) { if (!seen.has(id) && id !== S.myId) S.players.delete(id); });
      listDirty = true;
    }

    // ── positions: exact near us, radar (1×/s) far away; LIVE predicts, SMOOTH trails 1.25 s
    var BOARD_DELAY = 1250, SMOOTH_MS = 90, EXACT_MS = 1000, LIVE_MAX_AHEAD = 1.5, LIVE_SPRING_HZ = 0.8;
    var exactFresh = function(p, t) { return !!p.exact && t - p.exact.at < EXACT_MS; };
    // (exact from our own socket: the game draws that ship itself; exact from
    // a bot's view: the game does not know it, we place it)
    var ownExact = function(p, t) { return exactFresh(p, t) && !p.exact.bot; };
    function exactState(p, t) { var e = p.exact, dt = (t - e.at) * 0.06; return { x: wrapPos(e.x + e.vx * dt), y: wrapPos(e.y + e.vy * dt), vx: e.vx, vy: e.vy, exact: true }; }
    function boardState(p, t) {
      var s = p.samples;
      if (!s.length) return null;
      var rt = t - BOARD_DELAY, i = s.length - 2;
      while (i >= 0 && s[i].t > rt) i--;
      if (i < 0) return { x: s[0].x, y: s[0].y, vx: 0, vy: 0 };
      var P1 = s[i], P2 = s[i + 1];
      var P0 = s[i - 1] || { x: P1.x - wrapDelta(P2.x - P1.x), y: P1.y - wrapDelta(P2.y - P1.y) };
      var P3 = s[i + 2] || { x: P2.x + wrapDelta(P2.x - P1.x), y: P2.y + wrapDelta(P2.y - P1.y) };
      var X = [P0, P1, P2, P3].map(function(q) { return P1.x + wrapDelta(q.x - P1.x); });
      var Y = [P0, P1, P2, P3].map(function(q) { return P1.y + wrapDelta(q.y - P1.y); });
      var dt = Math.max(1, P2.t - P1.t), u = (rt - P1.t) / dt, extra = 0;
      if (u > 1) { extra = Math.min(u - 1, 0.5); u = 1; }
      var cr = function(a) { return 0.5 * (2 * a[1] + (a[2] - a[0]) * u + (2 * a[0] - 5 * a[1] + 4 * a[2] - a[3]) * u * u + (3 * a[1] - a[0] - 3 * a[2] + a[3]) * u * u * u); };
      var dcr = function(a) { return 0.5 * ((a[2] - a[0]) + 2 * (2 * a[0] - 5 * a[1] + 4 * a[2] - a[3]) * u + 3 * (3 * a[1] - a[0] - 3 * a[2] + a[3]) * u * u); };
      var vx = dcr(X), vy = dcr(Y), k = 1000 / 60 / dt;
      return { x: wrapPos(cr(X) + vx * extra), y: wrapPos(cr(Y) + vy * extra), vx: vx * k, vy: vy * k };
    }
    function smooth(p, b, t) {
      var sm = p.sm;
      if (!sm || t - sm.t > 2000 || Math.abs(wrapDelta(b.x - sm.x)) + Math.abs(wrapDelta(b.y - sm.y)) > 60) { p.sm = { x: b.x, y: b.y, t: t }; return; }
      if (t > sm.t) { var k = 1 - Math.exp(-(t - sm.t) / SMOOTH_MS); sm.x = wrapPos(sm.x + wrapDelta(b.x - sm.x) * k); sm.y = wrapPos(sm.y + wrapDelta(b.y - sm.y) * k); sm.t = t; }
      b.x = sm.x; b.y = sm.y;
    }
    function liveModel(p) {
      var s = p.samples, L = s[s.length - 1], A = s[s.length - 2], dt = A ? (L.t - A.t) / 1000 : 0;
      return { t: L.t, x: L.x, y: L.y, vx: dt > 0 ? wrapDelta(L.x - A.x) / dt : 0, vy: dt > 0 ? wrapDelta(L.y - A.y) / dt : 0 };
    }
    function liveState(p, t) {
      if (!p.samples.length) return null;
      var lastT = p.samples[p.samples.length - 1].t;
      if (!p.lv || p.lv.lastT !== lastT) p.lv = { lastT: lastT, m: liveModel(p) };
      var m = p.lv.m, age = Math.max(0, Math.min((t - m.t) / 1000, LIVE_MAX_AHEAD));
      var tgt = { x: wrapPos(m.x + m.vx * age), y: wrapPos(m.y + m.vy * age) }, z = p.spr;
      if (!z || t - z.t > 500) {
        z = p.spr = { x: tgt.x, y: tgt.y, vx: m.vx, vy: m.vy, t: t, px: tgt.x, py: tgt.y };
      } else if (t > z.t) {
        var dts = (t - z.t) / 1000;
        var tvx = wrapDelta(tgt.x - z.px) / dts, tvy = wrapDelta(tgt.y - z.py) / dts;
        if (Math.hypot(tvx, tvy) > 300) { tvx = m.vx; tvy = m.vy; }
        z.px = tgt.x; z.py = tgt.y;
        if (Math.abs(wrapDelta(tgt.x - z.x)) + Math.abs(wrapDelta(tgt.y - z.y)) > 80) { z.x = tgt.x; z.y = tgt.y; z.vx = tvx; z.vy = tvy; }
        else {
          var w = 2 * Math.PI * LIVE_SPRING_HZ, steps = Math.max(1, Math.ceil(dts / 0.02)), h = dts / steps;
          for (var i = 0; i < steps; i++) {
            z.vx += (w * w * wrapDelta(tgt.x - z.x) + 2 * w * (tvx - z.vx)) * h;
            z.vy += (w * w * wrapDelta(tgt.y - z.y) + 2 * w * (tvy - z.vy)) * h;
            z.x = wrapPos(z.x + z.vx * h); z.y = wrapPos(z.y + z.vy * h);
          }
        }
        z.t = t;
      }
      return { x: z.x, y: z.y, vx: z.vx / 60, vy: z.vy / 60 };
    }
    function renderPos(p, t) {
      t = t || now();
      if (exactFresh(p, t)) { var e = exactState(p, t); p.sm = { x: e.x, y: e.y, t: t }; return e; }
      var b;
      if (S.live) b = liveState(p, t);
      else if ((b = boardState(p, t))) smooth(p, b, t);
      if (!b) return null;
      if (p.wasExact && p.exact) {
        var ex = exactState(p, Math.min(t, p.exact.at + EXACT_MS));
        p.blend = { dx: wrapDelta(ex.x - b.x), dy: wrapDelta(ex.y - b.y), at: t };
        p.wasExact = false;
      }
      if (p.blend) {
        var k = 1 - (t - p.blend.at) / 1200;
        if (k <= 0) p.blend = null; else { b.x = wrapPos(b.x + p.blend.dx * k); b.y = wrapPos(b.y + p.blend.dy * k); }
      }
      return b;
    }

    // ── game internals, found by readable names or (whitespace-free) source
    var squash = function(s) { return String(s).replace(/\s+/g, ''); };
    function findClass(test) {
      var names = Object.getOwnPropertyNames(window);
      for (var i = 0; i < names.length; i++) {
        try { var v = window[names[i]]; if (typeof v === 'function' && v.prototype && test(v)) return v; } catch (e) {}
      }
      return null;
    }
    function protoFnBySource(cls, needle) {
      var keys = Object.getOwnPropertyNames(cls.prototype);
      for (var i = 0; i < keys.length; i++) {
        var d = Object.getOwnPropertyDescriptor(cls.prototype, keys[i]);
        if (d && typeof d.value === 'function' && squash(d.value.toString()).indexOf(needle) !== -1) return keys[i];
      }
      return null;
    }
    function wrapProto(cls, name, fn) { var orig = cls.prototype[name]; cls.prototype[name] = function() { return fn(orig, this, arguments); }; }
    var G = {
      hooked: false, world: null, camFn: null, camKey: null, tickKey: null,
      Scene: null, scene: null, renderFn: null, sceneCamKey: null, cursor: null, lastTry: 0,
      game: function() {
        if (!this.world) return null;
        if (this._gameOf !== this.world) {
          this._game = Object.values(this.world).find(function(v) { return v && v.mode && v.mode.options && v.names; }) || null;
          this._gameOf = this._game ? this.world : null;
        }
        return this._game;
      },
      cam: function() { return this.world && this.camKey ? this.world[this.camKey] : null; },
      tick: function() {
        var w = this.world, est = serverTick();
        if (!w || est == null) return est;
        if (this.tickKey && typeof w[this.tickKey] === 'number' && Math.abs(w[this.tickKey] - est) < 600) return w[this.tickKey];
        var best = null, bd = 600, keys = Object.keys(w);
        for (var i = 0; i < keys.length; i++) {
          var v = w[keys[i]];
          if (typeof v === 'number' && Number.isInteger(v) && v > 1000 && Math.abs(v - est) < bd) { bd = Math.abs(v - est); best = keys[i]; }
        }
        this.tickKey = best;
        return best ? w[best] : est;
      },
      shipType: function(code) {
        var g = this.game();
        if (!g || !g.mode) return null;
        if (this._typesOf !== g.mode) {
          var vals = Object.values(g.mode);
          this._types = vals.find(function(v) { return v && v.types_by_code; });
          this._models = vals.find(function(v) { return v && v.ships_by_code; });
          this._typesOf = g.mode;
        }
        var t = this._types && this._types.types_by_code[code], m = this._models && this._models.ships_by_code[code];
        return t || m ? { t: t, m: m } : null;
      }
    };
    function installHooks() {
      if (G.hooked) return true;
      // (a scan of every global is not free: at most once a second until found)
      var t = now();
      if (t - G.lastTry < 1000) return false;
      G.lastTry = t;
      if (!window.THREE || !THREE.PerspectiveCamera) return false;
      var World = findClass(function(c) { return typeof c.prototype.initCamera === 'function' && typeof c.prototype.asteroidStatus === 'function'; });
      G.camFn = World && protoFnBySource(World, '.zoom=.995*');
      if (!G.camFn) return false;
      G.camKey = (squash(World.prototype[G.camFn].toString()).match(/this\.(\w+)\.zoom=\.995\*/) || [])[1];
      wrapProto(World, G.camFn, function(orig, self, args) {
        G.world = self;
        if (SP.active) return spectatorTick(self);
        var r = orig.apply(self, args);
        if (SP.wide) { try { synthShips(); driveShips(self); } catch (e) {} }
        return r;
      });
      wrapProto(THREE.PerspectiveCamera, 'updateProjectionMatrix', function(orig, cam, args) {
        if (G.scene && G.sceneCamKey && cam === G.scene[G.sceneCamKey]) {
          if (SP.active) {
            if (SP.orig == null) SP.orig = { z: cam.position.z, far: cam.far };
            cam.position.z = SP.z; cam.far = Math.max(1000, SP.z + 200);
          } else if (SP.orig != null) {
            // (back to exactly what the game had)
            cam.position.z = SP.orig.z; cam.far = SP.orig.far; SP.orig = null;
          }
        }
        return orig.apply(cam, args);
      });
      if (typeof window.Cursor === 'function' && window.Cursor.prototype.set) {
        wrapProto(window.Cursor, 'set', function(orig, self, args) { G.cursor = self; return orig.apply(self, args); });
      }
      G.hooked = true;
      return true;
    }
    function installSceneHooks() {
      var g = G.game();
      if (G.Scene && (G.renderFn || G._sceneGame === g)) return true;
      var scene = g && Object.values(g).find(function(v) { return v && typeof v === 'object' && Object.values(v).some(isRockRenderer); });
      if (!scene) return false;
      var fn = protoFnBySource(scene.constructor, '.fov=45*this.');
      G.Scene = scene.constructor; G.scene = scene; G._sceneGame = g;
      if (fn) {
        G.renderFn = fn;
        G.sceneCamKey = (squash(scene.constructor.prototype[fn].toString()).match(/this\.(\w+)\.fov=45\*this\./) || [])[1];
        wrapProto(G.Scene, fn, function(orig, self, args) { G.scene = self; return orig.apply(self, args); });
      } else {
        // (the render step is wrapped by another hook, ours or another
        // script's: the scene camera is then found by what it is; the scene
        // is found again for every new game)
        G.sceneCamKey = Object.keys(scene).find(function(k) { return scene[k] instanceof THREE.PerspectiveCamera; }) || null;
      }
      return !!G.sceneCamKey;
    }

    // ── rocks: the game's own generator, for the whole map
    var MODE_CLASS = { team: 'TeamMode', survival: 'SurvivalMode', invasion: 'InvasionMode', deathmatch: 'DeathMatchMode', battleroyale: 'BattleRoyaleMode', modding: 'ModdingMode' };
    function buildField() {
      if (S.seed == null || !S.mapSize) return null;
      G.FieldClass = G.FieldClass || findClass(function(c) { return typeof c.prototype.getCustomMap === 'function'; });
      if (!G.FieldClass) return null;
      var options = (S.welcome && S.welcome.mode) || {};
      var cls = window[MODE_CLASS[S.modeId]] || window.Mode;
      var density = cls && cls.prototype && cls.prototype.asteroidsDensityModifier;
      var mode = { options: options, asteroidsDensityModifier: function(x, y) { return density ? density.call({ options: options }, x, y) : 1; } };
      var half = S.mapSize / 2, gen = new G.FieldClass(S.seed, half, mode), out = {}, list = [];
      list.index = new Map();
      for (var cx = -half; cx < half; cx++) {
        for (var cy = -half; cy < half; cy++) {
          gen.get(cx, cy, out);
          if (!out.on) continue;
          var r = { cx: cx, cy: cy, x: out.x * 10, y: out.y * 10, size: out.size * 10 };
          list.push(r); list.index.set(cx + ',' + cy, r);
        }
      }
      return list;
    }
    var rockAt = function(cx, cy) { return (S.field && S.field.index.get(cx + ',' + cy)) || null; };
    function rockScale(r, tick) {
      var key = r.cx + ',' + r.cy, resp = S.rocks.get(key);
      if (resp == null || tick == null) return 1;
      if (tick <= 60 * resp - 60) return 0;
      if (tick < 60 * resp) return Math.sqrt((tick - (60 * resp - 60)) / 60);
      S.rocks.delete(key);
      return 1;
    }
    var isRockRenderer = function(v) { return v && typeof v === 'object' && typeof v.rebuild === 'function' && typeof v.number === 'number' && Array.isArray(v.models); };
    function rockRenderer() {
      var g = G.game(), list = [G.scene].concat(g ? Object.values(g) : []);
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c || typeof c !== 'object') continue;
        var r = Object.values(c).find(isRockRenderer);
        if (r) { G.scene = G.scene || c; return r; }
      }
      return null;
    }
    function* growRocksJob(inst, N) {
      var group = Object.values(inst).find(function(v) { return v instanceof THREE.Group; });
      if (!group) throw new Error('rock renderer has no group');
      var n0 = inst.number, old = group.children.slice(), fresh = [];
      for (var h = 0; h < N; h++) {
        for (var r = 0; r < N; r++) {
          var ref = old[(h % 10) * n0 + (r % 10)];
          var mi = ref && ref.model != null ? ref.model : (h * 7 + r * 3) % inst.models.length;
          var m = inst.models[mi].getInstance();
          m.model = mi;
          if (ref) { m.rotation.x = ref.rotation.x; m.rotation.y = ref.rotation.y; }
          m.visible = false;
          fresh.push(m);
        }
        yield fresh.length / (N * N);
      }
      group.children.length = 0;
      for (var i = 0; i < fresh.length; i++) group.add(fresh[i]);
      if (!SP.rocksOrig || SP.rocksOrig.inst !== inst) SP.rocksOrig = { inst: inst, group: group, children: old, number: n0 };
      inst.number = N;
      SP.rocksInst = inst; SP.rocksN = N;
    }

    // ── ship stats (the game's own formulas)
    function specValue(v, upg, level) { if (!Array.isArray(v)) return typeof v === 'number' ? v : 0; var i = Math.max(0, Math.min(1, upg / Math.max(1, level))); return v[0] * (1 - i) + v[1] * i; }
    var shieldSpec = function(st) { return st && st.t && st.t.specs && st.t.specs.shield; };
    var knownFor = function(p) { return p.known && p.known.code === p.code ? p.known : null; };
    function shieldCapacity(st, levels, fallback) { var spec = shieldSpec(st); return Math.max(1, spec ? specValue(spec.capacity, (levels >>> 0) & 15, st.t.level || 1) : fallback || 1); }
    var gemsCapacity = function(st, code) { var l = (st && st.t && st.t.level) || Math.floor(code / 100) || 1; return l * l * 20; };
    function estimateShield(p) {
      var st = G.shipType(p.code), spec = shieldSpec(st), k = knownFor(p);
      var cap = Math.max(spec ? shieldCapacity(st, k ? k.levels : 0) : 100, k ? k.shield : 0);
      if (!k) return cap;
      var reload = spec ? specValue(spec.reload, (k.levels >>> 4) & 15, st.t.level || 1) : 3;
      var factor = (S.welcome && S.welcome.mode && S.welcome.mode.shield_regen_factor) || 1;
      return Math.min(cap, k.shield + factor * reload * ((Date.now() - k.at) / 1000));
    }

    // ── the spectator camera and far ships
    var SP = { active: false, orig: null, loaded: false, loading: false, x: 0, y: 0, z: BASE_Z, zTarget: BASE_Z,
      follow: null, userZoomed: false, drag: null, mouseX: 0, mouseY: 0, rocksInst: null, rocksN: 0, lastSynth: 0, keysDown: new Set() };
    var maxZ = function() { return Math.max(BASE_Z, Math.min(S.world / 2, (SP.rocksN || 20) * 5) / TAN); };
    var unitsPerPixel = function() { return (2 * SP.z * TAN) / innerHeight; };
    function povZ(code) {
      var st = G.shipType(code);
      var radius = (st && ((st.t && st.t.radius) || (st.m && st.m.radius))) || 3;
      var zoom = Math.pow(radius / 3, 0.3) / ((st && ((st.m && st.m.zoom) || (st.t && st.t.zoom))) || 1);
      return (BASE_Z * Math.tan((22.5 * zoom * Math.PI) / 180)) / TAN;
    }
    function spectatorTick(world) {
      var cam = world[G.camKey];
      if (cam) {
        var ks = Object.keys(cam);
        for (var i = 0; i < ks.length; i++) if (typeof cam[ks[i]] === 'number') cam[ks[i]] = 0;
        cam.x = SP.x; cam.y = SP.y; cam.zoom = 1;
      }
      synthShips();
      driveShips(world);
    }
    function synthShips() {
      var t = now();
      if (t - SP.lastSynth < 200) return;
      SP.lastSynth = t;
      var tick = G.tick();
      if (tick == null) return;
      // (Wide View: only ships inside the zoomed-out window; every ship the
      // game is handed it simulates and draws each frame, seen or not)
      var cam = !SP.active && G.cam(), reach = Math.max(SP.wideN, 20) * 5 + 20;
      S.players.forEach(function(p) {
        if (p.id === S.myId || !p.alive || (!p.samples.length && !exactFresh(p, t)) || ownExact(p, t)) return;
        var st = renderPos(p, t);
        if (!st) return;
        if (cam && (Math.abs(wrapDelta(st.x - cam.x)) > reach || Math.abs(wrapDelta(st.y - cam.y)) > reach)) return;
        inject(buildShipPacket(p, st, Math.round(tick)));
      });
    }
    // (each ship entity's status object, looked up once, not every tick)
    var statusOf = new WeakMap();
    function driveShips(world) {
      if (!Array.isArray(world.ships)) return;
      var statusById = new Map();
      for (var i = 0; i < world.ships.length; i++) {
        var e = world.ships[i], s = statusOf.get(e);
        if (s === undefined) {
          var v = Object.values(e).find(function(o) { return o && o.status && typeof o.status.x === 'number' && o.status.id != null; });
          s = v ? v.status : null;
          statusOf.set(e, s);
        }
        if (s) statusById.set(s.id, s);
      }
      var t = now();
      S.players.forEach(function(p) {
        var s = p.id !== S.myId && p.alive && !ownExact(p, t) && statusById.get(p.id);
        var st = s && renderPos(p, t);
        if (!st) return;
        var sp = Math.hypot(st.vx, st.vy);
        if (p.aim && t < p.aim.until) p.heading = angleLerp(p.heading, p.aim.a, 0.25);
        else if (sp > 0.03) p.heading = angleLerp(p.heading, Math.atan2(st.vy, st.vx), 0.08);
        if (sp > 0.32) p.up = true; else if (sp < 0.18) p.up = false;
        s.x = st.x; s.y = st.y; s.r = p.heading; s.up = !!p.up;
        s.angle = ((Math.round((p.heading * 180) / Math.PI) % 360) + 360) % 360;
      });
    }
    function buildShipPacket(p, st, tick) {
      var v = new DataView(new ArrayBuffer(56)), k = knownFor(p), deg = Math.round((p.heading * 180) / Math.PI);
      v.setUint8(0, 0); v.setUint8(1, p.id);
      v.setUint8(2, (p.alive ? 1 : 0) | (p.up ? 2 : 0) | ((((k && k.lives) || 0) & 7) << 2));
      v.setUint8(3, Math.round(((p.hue || 0) * 256) / 360) & 255);
      v.setUint32(4, 0, true); v.setUint32(8, tick, true);
      v.setUint16(12, ((deg % 360) + 360) % 360, true); v.setUint16(14, p.code & 1023, true);
      [st.x, st.y, st.vx, st.vy, p.heading].forEach(function(f, i) { v.setFloat32(16 + 4 * i, f, true); });
      v.setUint8(41, Math.min(255, p.rank || 0));
      v.setUint16(42, Math.round(estimateShield(p)), true);
      v.setUint16(44, k ? k.generator : 0, true); v.setUint16(46, k ? k.gems : 0, true);
      v.setUint32(48, p.score >>> 0, true); v.setUint32(52, k ? k.levels >>> 0 : 0, true);
      return v.buffer;
    }
    // reconstructed shots and gems out of our bubble (who broke which rock,
    // who killed whom: the server tells the whole map); a reconstruction
    var FX = { laserId: 61000, gemId: 61000 };
    var fxId = function(key) { var v = FX[key]; FX[key] = v >= 65000 ? 61000 : v + 1; return v; };
    function inMyBubble(x, y) { var me = S.players.get(S.myId); return !!(me && me.exact) && Math.hypot(wrapDelta(x - me.exact.x), wrapDelta(y - me.exact.y)) < 110; }
    function laserSpecs(code) { var st = G.shipType(code), L = st && st.t && st.t.lasers; return Array.isArray(L) && L.length ? L : [{ x: 0, y: -2, speed: 150, damage: 5, type: 1, number: 1, spread: 0 }]; }
    function fireAt(p, tx, ty, volleys, gapMs) {
      var t = now(), pos = renderPos(p, t);
      if (!pos) return;
      var dx = wrapDelta(tx - pos.x), dy = wrapDelta(ty - pos.y);
      if (Math.hypot(dx, dy) > 95) return;
      var ang = Math.atan2(dy, dx);
      p.aim = { a: ang, until: t + volleys * gapMs + 400 };
      for (var i = 0; i < volleys; i++) setTimeout(function() { fireVolley(p, ang); }, 60 + i * gapMs);
    }
    function fireVolley(p, ang) {
      var pos = SP.active && p.alive && renderPos(p, now()), tick = G.tick();
      if (!pos || tick == null) return;
      var fx = Math.cos(ang), fy = Math.sin(ang), recs = [];
      laserSpecs(p.code).forEach(function(L) {
        var n = Math.max(1, Math.min(8, L.number || 1)), spread = ((L.spread || 0) * Math.PI) / 180, ox = +L.x || 0, oy = +L.y || 0;
        for (var k = 0; k < n; k++) recs.push([pos.x - fx * oy + fy * ox, pos.y - fy * oy - fx * ox, pos.vx || 0, pos.vy || 0, first(L.speed) || 150, ang + (n > 1 ? (k / (n - 1) - 0.5) * spread : 0), L.type || 1, Math.min(255, first(L.damage) || 5)]);
      });
      var v = new DataView(new ArrayBuffer(8 + 32 * recs.length));
      v.setUint8(0, 100); v.setUint8(1, p.id); v.setUint32(4, Math.round(tick), true);
      recs.forEach(function(r, i) {
        var o = 8 + 32 * i;
        [r[0], r[1], 0, r[2], r[3], r[4]].forEach(function(f, j) { v.setFloat32(o + 4 * j, f, true); });
        v.setUint16(o + 24, fxId('laserId'), true); v.setFloat32(o + 26, r[5], true); v.setUint8(o + 30, r[6]); v.setUint8(o + 31, r[7]);
      });
      inject(v.buffer);
    }
    function dropGems(x, y, count, points, eaterId, eatAfterMs) {
      var tick = G.tick();
      if (tick == null) return;
      var n = Math.max(1, Math.min(8, count)), v = new DataView(new ArrayBuffer(5 + 19 * n)), ids = [];
      v.setUint8(0, 120); v.setUint32(1, Math.round(tick), true);
      for (var i = 0; i < n; i++) {
        var o = 5 + 19 * i, a = Math.random() * 2 * Math.PI, r = 2 + Math.random() * 4, id = fxId('gemId');
        ids.push(id);
        v.setUint8(o, Math.max(1, Math.min(255, Math.round(points)))); v.setUint16(o + 1, id, true);
        [x, y, Math.cos(a) * r, Math.sin(a) * r].forEach(function(f, j) { v.setFloat32(o + 3 + 4 * j, f, true); });
      }
      inject(v.buffer);
      if (eaterId == null) return;
      ids.forEach(function(id, i) {
        setTimeout(function() {
          if (!SP.active) return;
          var w = new DataView(new ArrayBuffer(4));
          w.setUint8(0, 121); w.setUint8(1, eaterId); w.setUint16(2, id, true);
          inject(w.buffer);
        }, eatAfterMs + i * 110);
      });
    }
    function fxRockDestroyed(r, shooterId) {
      if (!SP.active || inMyBubble(r.x, r.y)) return;
      var sh = S.players.get(shooterId), ok = sh && sh.alive && !exactFresh(sh, now());
      if (ok) fireAt(sh, r.x, r.y, 2, 170);
      dropGems(r.x, r.y, 2 + Math.round(r.size / 3), Math.max(1, Math.round(r.size)), ok ? sh.id : null, 900);
    }
    function fxKill(victim, pos, killerId) {
      if (!SP.active || inMyBubble(pos.x, pos.y)) return;
      var k = S.players.get(killerId), ok = k && k.alive && k.id !== victim.id && !exactFresh(k, now());
      if (ok) fireAt(k, pos.x, pos.y, 3, 160);
      var level = Math.floor(victim.code / 100) || 1, gems = (victim.known && victim.known.gems) || level * level * 6;
      var n = Math.max(2, Math.min(8, Math.round(gems / 15)));
      dropGems(pos.x, pos.y, n, Math.max(1, gems / n), ok ? k.id : null, 1300);
    }

    // ── on / off
    function toggleSpectator() { if (SP.loading) return; if (SP.active) exitSpectator(); else enterSpectator(); }
    function enterSpectator() {
      if (!S.welcome) return toast('Start a game first');
      G.lastTry = 0;
      if (!installHooks() || !G.world) return notReady('world');
      if (!installSceneHooks()) return notReady('scene');
      releaseHeldInput();
      var cam = G.cam();
      SP.x = cam ? cam.x : 0; SP.y = cam ? cam.y : 0; SP.z = BASE_Z; SP.zTarget = BASE_Z; SP.follow = null; SP.active = true;
      if (G.cursor) G.cursor.visible = false;
      document.body.classList.add('syn-spec-on');
      listDirty = true;
      S.players.forEach(function(p) { p.askedName = 0; });
      if (SP.loaded && SP.rocksInst === rockRenderer()) ui.show(); else runLoading();
      paintHud();
    }
    function notReady(what) { toast('Game not ready yet (' + what + ' not found) — try again in a moment'); }
    // the game's own 20×20 rock window back (the big one cost frames after
    // leaving: the game walks every rock of it each frame)
    function shrinkRocks() {
      var o = SP.rocksOrig;
      if (!o || SP.rocksInst !== o.inst) return;
      try {
        // (dropped in one go: removing 10 000 children one by one is quadratic)
        o.group.children.length = 0;
        o.children.forEach(function(m) { o.group.add(m); });
        o.inst.number = o.number;
      } catch (e) {}
      SP.rocksOrig = null; SP.rocksInst = null; SP.rocksN = 0; SP.loaded = false;
    }
    function exitSpectator() {
      SP.active = false; SP.drag = null; SP.follow = null;
      shrinkRocks();
      document.body.classList.remove('syn-spec-on');
      if (G.cursor) G.cursor.visible = true;
      try { if (G.world && G.world.initCamera) G.world.initCamera(1); } catch (e) {}
      ui.hide();
      paintHud();
    }
    function paintHud() {
      var r = document.getElementById('aegis-hud-spec-row');
      if (r) r.classList.toggle('on', SP.active);
    }
    function runLoading() {
      SP.loading = true;
      var L = ui.loading;
      L.start();
      var steps = [
        function* () { yield 0.5; L.detail(0, 'seed ' + S.seed + ' · ' + (S.modeId || '?') + ' · ' + S.mapSize + '×' + S.mapSize + ' cells (' + S.world + ' units)'); },
        function* () {
          S.field = S.field || buildField();
          var inst = rockRenderer();
          if (!inst) throw new Error('rock renderer not found');
          var N = Math.max(20, Math.min(100, Math.ceil(S.mapSize / 10) * 10));
          if (SP.rocksInst !== inst || SP.rocksN < N) yield* growRocksJob(inst, N);
          var dead = S.field ? S.field.filter(function(r) { return rockScale(r, serverTick()) === 0; }).length : 0;
          L.detail(1, (S.field ? S.field.length : '?') + ' rocks · ' + dead + ' destroyed · window ' + SP.rocksN + '×' + SP.rocksN);
        },
        function* () {
          var t0 = now();
          while (now() - t0 < 3000) {
            var all = Array.from(S.players.values());
            var named = all.filter(function(p) { return p.name; }).length, ready = all.filter(function(p) { return p.samples.length >= 2; }).length;
            L.detail(2, all.length + ' players · ' + named + ' names · ' + ready + ' with position');
            if (all.length && named === all.length && ready >= all.filter(function(p) { return p.alive; }).length) break;
            yield Math.min(0.99, (now() - t0) / 3000);
          }
        },
        function* () {
          SP.lastSynth = 0; synthShips();
          for (var t0 = now(); now() - t0 < 400;) yield (now() - t0) / 400;
          L.detail(3, 'ships in place · name, shield and gems in the list');
        }
      ];
      var si = 0, it = null;
      (function frame() {
        if (!SP.active) { SP.loading = false; L.hide(); return; }
        try {
          for (var t0 = now(); now() - t0 < 12;) {
            if (!it) { L.step(si); it = steps[si](); }
            var r = it.next();
            if (!r.done) { L.progress(si, r.value); continue; }
            L.done(si); it = null;
            if (++si >= steps.length) {
              SP.loaded = true; SP.loading = false;
              setTimeout(function() { L.hide(); if (SP.active) ui.show(); }, 350);
              return;
            }
          }
        } catch (e) {
          console.error('[Syndicate spectator] loading failed', e);
          L.error(si, String(e.message || e));
          SP.loading = false;
          setTimeout(function() { L.hide(); exitSpectator(); }, 2500);
          return;
        }
        requestAnimationFrame(frame);
      })();
    }

    // ── input: while on, nothing reaches our own ship
    var BLOCK = ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu', 'wheel', 'mousewheel', 'DOMMouseScroll', 'touchstart', 'touchmove', 'touchend', 'pointerdown', 'pointerup', 'pointermove'];
    // (Studio: only its wide view is used; spectator mode has no key, ] is all mods off)
    var specKey = function() { return null; };
    function onAnyInput(e) {
      if (e.__synspec) return;
      if (e.type === 'keydown') SP.keysDown.add(e.keyCode);
      if (e.type === 'keyup') SP.keysDown.delete(e.keyCode);
      var a = document.activeElement;
      var typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
      if (e.type === 'keydown' && !typing && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === specKey() || (e.key === '[' && (SP.active || testOn)))) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === specKey()) toggleSpectator(); else testOn = !testOn;
        return;
      }
      if (!SP.active) return;
      if (e.target && e.target.closest && e.target.closest('.syn-spec-ui, #aegis, #aegis-hud, #aegis-bots-win')) return;
      // Our ship dead: the game's respawn screen needs its clicks and keys
      // (they were all swallowed and the Respawn button did nothing).
      var me = S.players.get(S.myId);
      // (our own status says it first: the radar can still list us as alive)
      if (me && (!me.alive || (me.exact && !me.exact.alive && now() - me.exact.at < 3000))) { if (e.type === 'mousemove') { SP.mouseX = e.clientX; SP.mouseY = e.clientY; } return; }
      // Only what is aimed at the game itself is ours: the game's own
      // buttons and panels (respawn, menus, chat) keep working.
      if (e.type.indexOf('key') !== 0 && e.type !== 'mousemove' && e.type !== 'mouseup' && e.type !== 'wheel' && e.target && e.target.tagName && e.target.tagName !== 'CANVAS' && e.target !== document.body && e.target !== document.documentElement) return;
      e.stopImmediatePropagation();
      if (e.type.indexOf('key') === 0) {
        if (e.type === 'keydown' && e.key === 'Escape') SP.follow = null;
        if (e.type === 'keydown' && e.key && e.key.toLowerCase() === 'l') toggleLive();
        if (e.type === 'keydown' && e.key === '[') testOn = !testOn;
        if (!/^F\d+$/.test(e.key)) e.preventDefault();
        return;
      }
      if (e.type === 'mousemove') {
        SP.mouseX = e.clientX; SP.mouseY = e.clientY;
        if (SP.drag) { var upp = unitsPerPixel(); SP.x = wrapPos(SP.drag.x - (e.clientX - SP.drag.mx) * upp); SP.y = wrapPos(SP.drag.y + (e.clientY - SP.drag.my) * upp); }
      } else if (e.type === 'mousedown') {
        e.preventDefault();
        if (e.button === 2) { SP.follow = null; SP.drag = { mx: e.clientX, my: e.clientY, x: SP.x, y: SP.y }; }
        else if (e.button === 0) { var id = shipUnderMouse(e.clientX, e.clientY); if (id != null) followPlayer(id); }
      } else if (e.type === 'mouseup') {
        if (e.button === 2) SP.drag = null;
      } else if (e.type === 'wheel') {
        e.preventDefault();
        if (SP.follow != null) SP.userZoomed = true;
        SP.zTarget = Math.max(25, Math.min(maxZ(), SP.zTarget * Math.pow(1.0015, e.deltaY)));
      } else if (e.type === 'contextmenu' || e.type === 'mousewheel' || e.type === 'DOMMouseScroll') {
        e.preventDefault();
      }
    }
    BLOCK.forEach(function(type) { window.addEventListener(type, onAnyInput, { capture: true, passive: false }); });
    function toggleLive() {
      S.live = !S.live;
      try { localStorage.setItem('syn_spec_live', S.live ? '1' : '0'); } catch (e) {}
      S.players.forEach(function(p) { p.lv = p.sm = p.spr = null; });
      toast(S.live ? 'Movement: LIVE (predicted, no delay)' : 'Movement: SMOOTH (1.25 s behind, fluid)');
    }
    function releaseHeldInput() {
      SP.keysDown.forEach(function(code) {
        var ev = new KeyboardEvent('keyup', { bubbles: true, cancelable: true });
        Object.defineProperty(ev, 'keyCode', { get: function() { return code; } });
        Object.defineProperty(ev, 'which', { get: function() { return code; } });
        ev.__synspec = true;
        document.dispatchEvent(ev);
      });
      SP.keysDown.clear();
      [0, 2].forEach(function(button) {
        var ev = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: button, clientX: SP.mouseX, clientY: SP.mouseY });
        ev.__synspec = true;
        document.dispatchEvent(ev);
      });
    }
    function worldToScreen(x, y) { var upp = unitsPerPixel(); return { sx: innerWidth / 2 + wrapDelta(x - SP.x) / upp, sy: innerHeight / 2 - wrapDelta(y - SP.y) / upp }; }
    function shipUnderMouse(mx, my) {
      var best = null, bd = 40, t = now();
      S.players.forEach(function(p) {
        var pos = p.alive && renderPos(p, t);
        if (!pos) return;
        var s = worldToScreen(pos.x, pos.y), d = Math.hypot(s.sx - mx, s.sy - my);
        if (d < bd) { bd = d; best = p.id; }
      });
      return best;
    }
    function followPlayer(id) { var p = S.players.get(id); if (p) { SP.follow = id; SP.userZoomed = false; SP.zTarget = Math.min(maxZ(), povZ(p.code)); listDirty = true; } }
    function cameraFrame() {
      var t = now(), dt = Math.min(0.1, Math.max(0, (t - (SP.lastFrame || t)) / 1000));
      SP.lastFrame = t;
      var ease = function(tau) { return 1 - Math.exp(-dt / tau); };
      var p = SP.follow != null && S.players.get(SP.follow), pos = p && p.alive && renderPos(p, t);
      if (pos) {
        if (SP.lookId !== p.id) { SP.lookId = p.id; SP.lvx = pos.vx || 0; SP.lvy = pos.vy || 0; }
        SP.lvx += ((pos.vx || 0) - SP.lvx) * ease(0.4); SP.lvy += ((pos.vy || 0) - SP.lvy) * ease(0.4);
        SP.x = wrapPos(SP.x + wrapDelta(pos.x + 30 * SP.lvx - SP.x) * ease(0.13));
        SP.y = wrapPos(SP.y + wrapDelta(pos.y + 30 * SP.lvy - SP.y) * ease(0.13));
        if (!SP.userZoomed) SP.zTarget = Math.min(maxZ(), povZ(p.code));
      }
      SP.z += (SP.zTarget - SP.z) * ease(0.1);
    }

    // ── UI (Syndicate look)
    var CSS = [
      '.syn-spec-ui{font-family:Rajdhani,"Segoe UI",sans-serif;color:#e2e2e2;user-select:none;-webkit-font-smoothing:antialiased}',
      'body.syn-spec-on canvas{cursor:none!important}',
      '#syn-spec-list{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:100000;width:286px;max-height:80vh;overflow-y:auto;scrollbar-width:none;padding:1px;display:none;background:#474551;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}',
      '#syn-spec-list::-webkit-scrollbar{display:none}',
      '#syn-spec-list .in{background:rgba(18,20,20,.94);padding:6px 0 8px;clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}',
      '#syn-spec-list .ttl{display:flex;justify-content:space-between;align-items:center;padding:6px 12px 8px;font-size:11px;font-weight:700;letter-spacing:.22em;color:#c6c1ff;border-bottom:1px solid rgba(198,193,255,.18);margin-bottom:4px}',
      '#syn-spec-list .ttl b{font-family:"JetBrains Mono",monospace;font-weight:500;letter-spacing:.06em;color:#928f9c}',
      '#syn-spec-list .hdr{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;padding:7px 12px 3px}',
      '#syn-spec-list .row{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:4px 12px;cursor:pointer;font-size:13px;line-height:1.15;border-left:2px solid transparent}',
      '#syn-spec-list .row:hover{background:rgba(198,193,255,.07)}',
      '#syn-spec-list .row.sel{background:rgba(198,193,255,.14);border-left-color:#c6c1ff}',
      '#syn-spec-list .row.dead{opacity:.38}',
      '#syn-spec-list img{width:24px;height:24px;object-fit:contain}',
      '#syn-spec-list .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
      '#syn-spec-list .sc{font-family:"JetBrains Mono",monospace;font-size:11px;text-align:right;color:#c8c4d3}',
      '#syn-spec-list .pg{font-size:9px;color:#928f9c}',
      '#syn-spec-list .bars{display:grid;gap:2px;margin-top:3px}',
      '#syn-spec-list .bar{height:3px;background:rgba(255,255,255,.08);overflow:hidden}',
      '#syn-spec-list .bar i{display:block;height:100%;transition:width .25s linear}',
      '#syn-spec-list .bar.sh i{background:linear-gradient(90deg,#7b74e6,#c6c1ff)}',
      '#syn-spec-list .bar.gm i{background:linear-gradient(90deg,#c25b8b,#ffb4d6)}',
      '#syn-spec-list .bar.unk{background:repeating-linear-gradient(90deg,rgba(255,180,214,.22) 0 4px,transparent 4px 8px)}',
      '#syn-spec-list .row.est .bar i{opacity:.55}',
      '#syn-spec-bar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:100000;display:none;pointer-events:none;background:#474551;padding:1px;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}',
      '#syn-spec-bar .in{background:rgba(18,20,20,.92);padding:5px 14px;font-size:12px;letter-spacing:.06em;color:#c8c4d3;white-space:nowrap;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}',
      '#syn-spec-bar b{color:#c6c1ff;letter-spacing:.2em;margin-right:6px}',
      '#syn-spec-bar kbd{font-family:"JetBrains Mono",monospace;font-size:10px;color:#121414;background:#c6c1ff;padding:0 4px;margin:0 3px}',
      '#syn-spec-load{position:fixed;inset:0;z-index:100001;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,28,52,.94),rgba(8,9,10,.97))}',
      '#syn-spec-load .box{width:min(460px,90vw)}',
      '#syn-spec-load h1{font-size:22px;letter-spacing:.32em;text-align:center;margin:0 0 6px;font-weight:700;color:#c6c1ff}',
      '#syn-spec-load h2{font-size:10px;letter-spacing:.3em;text-align:center;margin:0 0 22px;font-weight:600;color:#928f9c}',
      '#syn-spec-load .st{margin:12px 0}',
      '#syn-spec-load .st.wait{opacity:.32}',
      '#syn-spec-load .st.err .t{color:#ffb4ab}',
      '#syn-spec-load .t{display:flex;justify-content:space-between;font-size:14px;font-weight:600;letter-spacing:.06em}',
      '#syn-spec-load .d{font-family:"JetBrains Mono",monospace;font-size:10px;color:#928f9c;min-height:14px;margin-top:3px}',
      '#syn-spec-load .p{height:3px;background:rgba(255,255,255,.08);margin-top:5px}',
      '#syn-spec-load .p i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7b74e6,#c6c1ff)}',
      '#syn-spec-toast{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%);z-index:100002;display:none;pointer-events:none;background:#474551;padding:1px;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}',
      '#syn-spec-toast .in{background:rgba(18,20,20,.95);padding:10px 18px;font-size:13px;letter-spacing:.05em;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}'
    ].join('\n');
    function el(tag, attrs, parent) {
      if (!document.getElementById('syn-spec-css')) document.head.appendChild(Object.assign(document.createElement('style'), { id: 'syn-spec-css', textContent: CSS }));
      var e = Object.assign(document.createElement(tag), attrs || {});
      if (parent) parent.appendChild(e);
      return e;
    }
    var esc = function(s) { return String(s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var myPing = function() { var g = G.game(); return g && g.ping != null ? g.ping : '?'; };
    var hsl = function(h, l) { return 'hsl(' + (h || 0) + ',75%,' + l + '%)'; };
    function toast(msg) {
      var t = document.getElementById('syn-spec-toast');
      if (!t) { t = el('div', { id: 'syn-spec-toast', className: 'syn-spec-ui' }, document.body); el('div', { className: 'in' }, t); }
      t.firstChild.textContent = msg;
      t.style.display = 'block';
      clearTimeout(toast.timer);
      toast.timer = setTimeout(function() { t.style.display = 'none'; }, 1800);
    }
    var icons = new Map();
    function shipIcon(code) {
      if (!icons.has(code)) {
        G.IconClass = G.IconClass || findClass(function(c) { return typeof c.getShipIcon === 'function'; });
        var canvas = null;
        try { canvas = G.IconClass && G.IconClass.getShipIcon(code); } catch (e) {}
        if (!canvas) return null;
        icons.set(code, { canvas: canvas, url: canvas.toDataURL ? canvas.toDataURL() : '' });
      }
      return icons.get(code);
    }
    var listDirty = true;
    var ui = {
      list: null, inner: null, bar: null, lastBuild: 0, lastHtml: '',
      show: function() {
        if (!this.list) {
          this.list = el('div', { id: 'syn-spec-list', className: 'syn-spec-ui' }, document.body);
          this.inner = el('div', { className: 'in' }, this.list);
          this.bar = el('div', { id: 'syn-spec-bar', className: 'syn-spec-ui' }, document.body);
          el('div', { className: 'in' }, this.bar);
          var self = this;
          ['mousedown', 'mouseup', 'click', 'wheel', 'contextmenu'].forEach(function(type) { self.list.addEventListener(type, function(e) { e.stopPropagation(); }); });
          // (mousedown: a click is lost when its row is rebuilt under it)
          this.list.addEventListener('mousedown', function(e) {
            var row = e.button === 0 && e.target.closest('.row');
            if (row) { followPlayer(+row.dataset.id); self.lastBuild = 0; }
          });
        }
        this.list.style.display = this.bar.style.display = 'block';
        this.lastHtml = ''; this.lastBuild = 0;
      },
      hide: function() { if (this.list) this.list.style.display = this.bar.style.display = 'none'; },
      update: function() {
        var t = now();
        if (!SP.active || !this.list || this.list.style.display === 'none' || t - this.lastBuild < 250) return;
        this.lastBuild = t;
        // (beside the Syndicate HUD panel while it is open, not under it)
        var hp = document.getElementById('aegis-hud');
        var left = hp && hp.style.display !== 'none' && hp.offsetWidth ? Math.round(hp.getBoundingClientRect().right + 8) + 'px' : '0px';
        if (this.list.style.left !== left) this.list.style.left = left;
        var key = specKey();
        var barHtml = '<b>SPECTATOR</b><kbd>' + esc(key) + '</kbd> exit · <kbd>SCROLL</kbd> zoom · <kbd>R-DRAG</kbd> move · <kbd>CLICK</kbd> follow · <kbd>ESC</kbd> unfollow · <kbd>[</kbd> map · <kbd>L</kbd> ' + (S.live ? 'live' : 'smooth') + ' · ' + myPing() + ' ms';
        if (this.bar.firstChild.innerHTML !== barHtml) this.bar.firstChild.innerHTML = barHtml;
        var groups = new Map();
        S.players.forEach(function(p) {
          var k = S.teams.length && p.team != null ? p.team : -1;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push(p);
        });
        var html = ['<div class="ttl">ALL PLAYERS<b>' + S.players.size + '</b></div>'], self = this;
        Array.from(groups.keys()).sort(function(a, b) { return a - b; }).forEach(function(k) {
          var list = groups.get(k).sort(function(a, b) { return b.score - a.score; }), team = S.teams[k];
          var title = team ? team.faction : S.survival || S.modeId === 'survival' ? 'Survival' : 'Players';
          html.push('<div class="hdr" style="color:' + (team ? hsl(team.hue, 72) : '#928f9c') + '">' + esc(title + ' · ' + list.length) + '</div>');
          list.forEach(function(p) { html.push(self.row(p, t)); });
        });
        var out = html.join('');
        if (out !== this.lastHtml) { this.inner.innerHTML = out; this.lastHtml = out; }
      },
      row: function(p, t) {
        var exact = exactFresh(p, t), k = knownFor(p), st = G.shipType(p.code), me = p.id === S.myId;
        var shield = exact ? p.exact.shield : Math.round(estimateShield(p));
        var shieldMax = shieldCapacity(st, exact ? p.exact.levels : k ? k.levels : 0, shield);
        var gems = exact ? p.exact.gems : k ? k.gems : null, gemsMax = gemsCapacity(st, p.code);
        var age = k && !exact ? Math.round((Date.now() - k.at) / 1000) : 0;
        var pct = function(a, b) { return Math.max(0, Math.min(100, (100 * a) / Math.max(1, b))).toFixed(0); };
        var tip = (st && st.t ? st.t.name : p.code) + ' · shield ' + shield + '/' + Math.round(shieldMax) + ' · gems ' + (gems == null ? '?' : gems) + '/' + gemsMax + (exact ? ' · live' : age ? ' · last seen ' + age + 's ago' : ' · estimated');
        var icon = shipIcon(p.code);
        return '<div class="row' + (p.alive ? '' : ' dead') + (SP.follow === p.id ? ' sel' : '') + (exact ? '' : ' est') + '" data-id="' + p.id + '" title="' + esc(tip) + '">' +
          '<img src="' + (icon ? icon.url : '') + '">' +
          '<div><div class="nm" style="color:' + hsl(p.hue, 74) + '">' + esc(p.name || '#' + p.id) + (me ? ' (you)' : '') + '</div>' +
          '<div class="bars"><div class="bar sh"><i style="width:' + pct(shield, shieldMax) + '%"></i></div>' +
          '<div class="bar gm' + (gems == null ? ' unk' : '') + '"><i style="width:' + (gems == null ? 0 : pct(gems, gemsMax)) + '%"></i></div></div></div>' +
          '<div class="sc">' + p.score + (me ? '<div class="pg">' + myPing() + ' ms</div>' : '') + '</div></div>';
      },
      loading: {
        root: null, rows: [],
        start: function() {
          if (!this.root) {
            this.root = el('div', { id: 'syn-spec-load', className: 'syn-spec-ui' }, document.body);
            var box = el('div', { className: 'box' }, this.root);
            el('h1', { textContent: 'SPECTATOR MODE' }, box);
            el('h2', { textContent: '[≜] SYNDICATE' }, box);
            this.rows = ['01 · FIND MAP', '02 · GENERATE MAP', '03 · FIND PLAYERS', '04 · PLACE PLAYERS'].map(function(name) {
              var r = el('div', {}, box), t = el('div', { className: 't' }, r);
              el('span', { textContent: name }, t);
              return { r: r, s: el('span', {}, t), d: el('div', { className: 'd' }, r), i: el('i', null, el('div', { className: 'p' }, r)) };
            });
          }
          this.rows.forEach(function(row) { row.r.className = 'st wait'; row.s.textContent = row.d.textContent = ''; row.i.style.width = '0'; });
          this.root.style.display = 'flex';
        },
        step: function(i) { this.rows[i].r.className = 'st'; this.rows[i].s.textContent = '…'; },
        progress: function(i, k) { this.rows[i].i.style.width = Math.round(100 * Math.max(0, Math.min(1, k))) + '%'; },
        detail: function(i, txt) { this.rows[i].d.textContent = txt; },
        done: function(i) { this.rows[i].i.style.width = '100%'; this.rows[i].s.textContent = '✓'; },
        error: function(i, msg) { this.rows[i].r.className = 'st err'; this.rows[i].s.textContent = '✗'; this.rows[i].d.textContent = msg; },
        hide: function() { if (this.root) this.root.style.display = 'none'; }
      }
    };

    // ── overlay canvas: crosshair, far-out labels, map overview
    var testOn = false, canvas = null, ctx = null;
    function label(txt, x, y, color, size, align) {
      ctx.font = '600 ' + (size || 12) + 'px Rajdhani, Arial, sans-serif'; ctx.textAlign = align || 'left';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = color;
      ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y);
      ctx.lineWidth = 1; ctx.textAlign = 'left';
    }
    function dot(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
    function drawOverlay() {
      if (!testOn && !SP.active) { if (canvas && canvas.style.display !== 'none') canvas.style.display = 'none'; return; }
      if (!canvas) {
        canvas = el('canvas', { id: 'syn-spec-overlay' }, document.body);
        Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', zIndex: 99999, pointerEvents: 'none' });
        ctx = canvas.getContext('2d');
      }
      canvas.style.display = 'block';
      var dpr = window.devicePixelRatio || 1, W = innerWidth, H = innerHeight;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (SP.active && !SP.loading) drawSpectatorOverlay(W, H);
      if (testOn) drawTestMap(W, H);
    }
    function drawSpectatorOverlay(W, H) {
      var t = now();
      if (SP.z > 180) {
        ctx.globalAlpha = Math.min(1, (SP.z - 180) / 120);
        S.players.forEach(function(p) {
          var pos = p.alive && renderPos(p, t);
          if (!pos) return;
          var s = worldToScreen(pos.x, pos.y);
          if (s.sx < -50 || s.sy < -50 || s.sx > W + 50 || s.sy > H + 50) return;
          dot(s.sx, s.sy, 3, hsl(p.hue, 65));
          label((p.name || '#' + p.id) + '  ' + p.score, s.sx, s.sy - 8, hsl(p.hue, 80), 12, 'center');
        });
        ctx.globalAlpha = 1;
      }
      var f = SP.follow != null && S.players.get(SP.follow);
      if (f) label('◉ FOLLOWING · ' + (f.name || '#' + f.id), W / 2, H - 70, '#c6c1ff', 15, 'center');
      // crosshair
      var mx = SP.mouseX, my = SP.mouseY;
      ctx.strokeStyle = '#c6c1ff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 4; ctx.shadowColor = '#000';
      ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.moveTo(mx - 15, my); ctx.lineTo(mx - 5, my); ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 15, my);
      ctx.moveTo(mx, my - 15); ctx.lineTo(mx, my - 5); ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 15);
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1;
    }
    function drawTestMap(W, H) {
      if (!S.world) return label('Waiting for a game…', 20, 30, '#e2e2e2', 16);
      S.field = S.field || buildField();
      // (below the spectator bar, right of the player list, and clear of the
      // game's scoreboard and radar on the right; it used to run under all three)
      var listOn = SP.active && ui.list && ui.list.style.display !== 'none';
      var ox = listOn ? (parseInt(ui.list.style.left, 10) || 0) + 300 : 20, oy = SP.active ? 56 : 20;
      var size = Math.max(240, Math.min(W - ox - 340 - 290, H - oy - 20)), sc = size / S.world;
      var half = S.world / 2, wrapW = function(v) { return ((v + half) % S.world + S.world) % S.world - half; };
      var px = function(x) { return ox + (wrapW(x) / S.world + 0.5) * size; }, py = function(y) { return oy + (0.5 - wrapW(y) / S.world) * size; };
      ctx.fillStyle = 'rgba(12,15,15,.9)'; ctx.fillRect(ox, oy, size, size);
      ctx.strokeStyle = 'rgba(198,193,255,.35)'; ctx.strokeRect(ox, oy, size, size);
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
      var tick = serverTick(), dead = 0;
      if (!S.field) label('Rock generator not found', ox + 10, oy + 20, '#ffb4ab', 13);
      (S.field || []).forEach(function(r) {
        var k = rockScale(r, tick);
        if (k <= 0) dead++;
        else dot(px(r.x), py(r.y), Math.max(0.8, r.size * sc * k), k < 1 ? 'rgba(155,231,176,.9)' : 'rgba(146,143,156,.7)');
      });
      var t = now();
      S.effects = S.effects.filter(function(e) { return t - e.t < 1500; });
      ctx.lineWidth = 2;
      S.effects.forEach(function(e) {
        var a = 1 - (t - e.t) / 1500;
        ctx.strokeStyle = (e.kind === 'kill' ? 'rgba(255,180,171,' : 'rgba(198,193,255,') + a + ')';
        ctx.beginPath(); ctx.arc(px(e.x), py(e.y), (e.kind === 'kill' ? 18 : 8) * (1.2 - a), 0, Math.PI * 2); ctx.stroke();
      });
      ctx.lineWidth = 1;
      if (SP.active) { var hw = (SP.z * TAN * W) / H, hh = SP.z * TAN; ctx.strokeStyle = 'rgba(198,193,255,.85)'; ctx.strokeRect(px(SP.x - hw), py(SP.y + hh), 2 * hw * sc, 2 * hh * sc); }
      var list = Array.from(S.players.values()).sort(function(a, b) { return b.score - a.score; });
      list.forEach(function(p) {
        var pos = p.alive && renderPos(p, t);
        if (!pos) return;
        var x = px(pos.x), y = py(pos.y);
        dot(x, y, p.id === S.myId ? 6 : 4, hsl(p.hue, 65));
        if (pos.exact) { ctx.strokeStyle = '#e2e2e2'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke(); }
        label(p.name || '#' + p.id, x + 7, y - 6, hsl(p.hue, 80), 12);
      });
      ctx.restore();
      var lx = ox + size + 16, ly = oy + 18;
      label(String(S.welcome.name || '') + '  ·  mode: ' + S.modeId + (S.survival ? ' (survival)' : ''), lx, ly, '#c6c1ff', 14);
      label('seed ' + S.seed + ' · map ' + S.mapSize + '×' + S.mapSize + ' cells · ' + S.world + ' units', lx, (ly += 16), '#928f9c', 12);
      label('rocks: ' + (S.field ? S.field.length : '?') + ' · destroyed: ' + dead + ' · tick ' + (tick ? Math.round(tick) : '?'), lx, (ly += 16), '#928f9c', 12);
      ly += 10;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (ly > oy + size - 10) break;
        var icon = shipIcon(p.code);
        if (icon) try { ctx.drawImage(icon.canvas, lx, ly + 2, 18, 18); } catch (e) {}
        var txt = (p.name || '#' + p.id) + '  ' + p.score;
        if (p.known) txt += '  shield ' + p.known.shield + ' · gems ' + p.known.gems + (exactFresh(p, t) ? '' : ' (' + Math.round((Date.now() - p.known.at) / 1000) + 's old)');
        label(txt, lx + 24, ly + 15, p.alive ? hsl(p.hue, 75) : '#777', 12);
        ly += 21;
      }
    }

    window.__synSpectator = {
      toggle: toggleSpectator, isOn: function() { return SP.active; }, map: function() { testOn = !testOn; }, _G: G,
      status: function() {
        return { hooked: G.hooked, world: !!G.world, camFn: G.camFn, camKey: G.camKey, scene: !!G.scene, renderFn: G.renderFn,
          sceneCamKey: G.sceneCamKey, rocksN: SP.rocksN, tick: G.tick(), serverTick: serverTick(), players: S.players.size, active: SP.active, z: SP.z, wide: SP.wide, wideN: SP.wideN, myId: S.myId, me: (function() { var m = S.players.get(S.myId); return m ? { alive: m.alive, exact: !!(m.exact && m.exact.alive) } : null; })() };
      }
    };
    // ── wide view: zoomed out with FOV Zoom, the rock window grows to fit
    // and far ships are placed like in spectator mode
    SP.wide = false; SP.wideN = 0; SP.growing = false;
    function wideFrame() {
      var f = window.__synFovFactor ? window.__synFovFactor() : 1;
      var want = !SP.active && !SP.loading && !!S.welcome && featOn('wide') && !window.__synWideBlock && f > 1.25 && G.hooked && !!G.world;
      if (want && !SP.wide) { SP.wide = true; SP.lastSynth = 0; }
      if (!want && SP.wide) { SP.wide = false; if (!SP.active) shrinkRocks(); SP.wideN = 0; return; }
      if (!SP.wide || SP.growing) return;
      if (!installSceneHooks()) return;
      // (the game's window is 20×20 cells around the camera: enough for the
      // zoom-out, in steps of 10, at most 60)
      var N = Math.min(60, Math.max(20, Math.ceil((20 * f + 4) / 10) * 10));
      if (N <= SP.rocksN || N === SP.wideN) return;
      var inst = rockRenderer();
      if (!inst) return;
      SP.growing = true; SP.wideN = N;
      var job = growRocksJob(inst, N);
      (function step() {
        try {
          for (var t0 = now(); now() - t0 < 6;) { if (job.next().done) { SP.growing = false; return; } }
        } catch (e) { SP.growing = false; return; }
        requestAnimationFrame(step);
      })();
    }
    // ── what our bots see (app only): exact positions far beyond our own view
    var lastFeed = 0, feedBusy = false;
    function botFeed() {
      if (!(SP.active || SP.wide) || feedBusy || now() - lastFeed < 100) return;
      if (typeof isApp !== 'function' || !isApp()) return;
      lastFeed = now(); feedBusy = true;
      try {
        window.__TAURI__.core.invoke('bot_seen_ships', { maxAge: 0.5 }).then(function(list) {
          feedBusy = false;
          var t = now();
          (list || []).forEach(function(sh) {
            if (sh.id === S.myId) return;
            var p = player(sh.id);
            if (p.exact && !p.exact.bot && t - p.exact.at < EXACT_MS) return;
            var at = t - (sh.age || 0) * 1000;
            if (p.exact && p.exact.bot && p.exact.at >= at) return;
            var lv = p.known ? p.known.levels : 0;
            p.exact = { at: at, tick: 0, x: sh.x, y: sh.y, vx: sh.vx, vy: sh.vy, r: sh.r, alive: sh.alive, lives: 0, type: sh.code,
              shield: sh.shield, generator: sh.gen, gems: sh.crystals, score: sh.score, levels: lv, bot: true };
            p.code = sh.code; p.alive = sh.alive; p.heading = sh.r; p.wasExact = true; p.blend = null; p.up = sh.up;
            p.known = { shield: sh.shield, gems: sh.crystals, generator: sh.gen, levels: lv, lives: 0, code: sh.code, at: Date.now() };
          });
        }, function() { feedBusy = false; });
      } catch (e) { feedBusy = false; }
    }
    // main loop: next to nothing while off (a hook attempt at most once a second)
    var loopErrs = {};
    (function loop() {
      try {
        if (document.body && (S.welcome || SP.active)) {
          if (installHooks() && G.world) installSceneHooks();
          if (SP.active) { cameraFrame(); ui.update(); }
          wideFrame();
          botFeed();
          drawOverlay();
        }
      } catch (e) {
        // (once per kind of error: logging every frame costs frames itself)
        var k = String(e && e.message);
        if (!loopErrs[k]) { loopErrs[k] = 1; console.error('[Syndicate spectator]', e); }
        if (window.__synNoteError) window.__synNoteError('[spectator] ' + k, 'syndicate');
      }
      requestAnimationFrame(loop);
    })();
  })();

  function start() {
    // Remove stars: the star layer is the Points with a "startype"
    // attribute (the perf core tells them from sparks the same way)
    (function removeStars() {
      var CORE = window.__perfCore, STARS = [];
      if (!CORE || !CORE.onRender) return;
      CORE.onRender(function(scene, cam, I) {
        if (!I || !scene) return;
        if (I.starAt !== I.at) {
          I.starAt = I.at;
          STARS = STARS.filter(function(o) { return !!o.parent; });
          scene.traverse(function(o) {
            if (o.type === "Points" && o.geometry && o.geometry.attributes && o.geometry.attributes.startype && STARS.indexOf(o) < 0) STARS.push(o);
          });
        }
        var off = featOn("nostars");
        for (var i = 0; i < STARS.length; i++) {
          var o = STARS[i];
          if (off) { if (o.visible) { o.visible = false; o.__stStar = 1; } }
          else if (o.__stStar) { o.visible = true; o.__stStar = 0; }
        }
      });
    })();
    // Team lock bypass: a team's board on the team page sets
    // "enabled = start && team.open" each time it's drawn; with the switch
    // on, a started team's board stays clickable when the team is closed
    // (Syndicate takes "&& this.team.open" out of the game's source).
    (function teamlockBypass() {
      var CORE = window.__perfCore;
      if (!CORE || !CORE.whenClass) return;
      CORE.whenClass(function(p, key) { return key === "TeamBoard"; }, function(P) {
        Object.getOwnPropertyNames(P).forEach(function(n) {
          var fn = P[n], src;
          if (n === "constructor" || typeof fn !== "function") return;
          try { src = Function.prototype.toString.call(fn); } catch (e) { return; }
          if (!/this\.enabled\s*=\s*this\.start\s*&&\s*this\.team\.open/.test(src)) return;
          P[n] = function() {
            var r = fn.apply(this, arguments);
            if (this.start && this.team && !this.team.open && featOn("teamlock")) this.enabled = true;
            return r;
          };
        });
      }, 600000);
    })();
    // Saturated ship colours in the game's own drawing: a method holding
    // "this.hue,.5,1" or "this.hue,.5,.5" gets a copy with "this.hue,1,1"
    // (Syndicate's edit of the game's source), used while the switch is on.
    // A copy that can't run outside the game's own scope falls back to the
    // original for good. (The ship finishes are done in shipMaterials.)
    (function sourcePatches() {
      var RULES = [
        { feat: "saturate", word: "this.hue,.5,", rx: /this\.hue,\.5,(?:1|\.5)(?!\d)/g, to: "this.hue,1,1" }
      ];
      var seen = new WeakSet(), found = [];
      window.__studioPatches = found;
      function patch(holder, name, where) {
        var fn;
        try { fn = holder[name]; } catch (e) { return; }
        if (typeof fn !== "function" || seen.has(fn)) return;
        seen.add(fn);
        var src;
        try { src = Function.prototype.toString.call(fn); } catch (e) { return; }
        if (src.indexOf("[native code]") >= 0) return;
        var hits = RULES.filter(function(r) { return src.indexOf(r.word) >= 0 && src.replace(r.rx, r.to) !== src; });
        if (!hits.length) return;
        var variants = {}, broken = false, label = where + "." + name + " (" + hits.map(function(r) { return r.feat; }).join(", ") + ")";
        function build(mask) {
          if (variants[mask] !== undefined) return variants[mask];
          var ns = src;
          hits.forEach(function(r, b) { if (mask & (1 << b)) ns = ns.replace(r.rx, r.to); });
          if (!/^(async\s+)?function\b/.test(ns)) ns = "function " + ns;
          var f = null;
          try { f = (0, eval)("(" + ns + ")"); } catch (e) {}
          return variants[mask] = f;
        }
        if (!build((1 << hits.length) - 1)) { found.push(label + " can't copy"); return; }
        var wrapped = function() {
          var mask = 0;
          if (!broken) for (var b = 0; b < hits.length; b++) if (featOn(hits[b].feat)) mask |= 1 << b;
          var f = mask ? build(mask) : null;
          if (!f) return fn.apply(this, arguments);
          try { return f.apply(this, arguments); }
          catch (e) {
            if (!(e instanceof ReferenceError)) throw e;
            broken = true;
            console.warn("[Studio] " + label + " needs the game's own scope, left as it was");
            return fn.apply(this, arguments);
          }
        };
        seen.add(wrapped);
        try { holder[name] = wrapped; found.push(label); } catch (e) {}
      }
      function scan() {
        for (var key in window) {
          var cls;
          try { cls = window[key]; } catch (e) { continue; }
          if (typeof cls !== "function" || seen.has(cls)) continue;
          var p = cls.prototype;
          if (p) {
            var names;
            try { names = Object.getOwnPropertyNames(p); } catch (e) { names = []; }
            for (var i = 0; i < names.length; i++) {
              if (names[i] === "constructor" || /^build\w*Material$/.test(names[i])) continue;
              var d = Object.getOwnPropertyDescriptor(p, names[i]);
              if (d && typeof d.value === "function") patch(p, names[i], key + ".prototype");
            }
          }
          var st;
          try { st = Object.getOwnPropertyNames(cls); } catch (e) { st = []; }
          for (var j = 0; j < st.length; j++) {
            if (st[j] === "prototype" || st[j] === "caller" || st[j] === "arguments") continue;
            var d2 = Object.getOwnPropertyDescriptor(cls, st[j]);
            if (d2 && typeof d2.value === "function") patch(cls, st[j], key);
          }
        }
      }
      // (the game's classes come with its script; looked for a minute)
      var n = 0, iv = setInterval(function() { try { scan(); } catch (e) {} if (++n >= 30) clearInterval(iv); }, 2000);
    })();
    // High contrast: every ship built in the full colour finish; team
    // highlight: in team games, other ships built plain green (yours) or
    // yellow (the other teams'); saturated colours: a finish's glow at full
    // saturation (the game builds it at half). Ships take it when the game
    // builds them (joining, respawning, upgrading).
    (function shipMaterials() {
      var CORE = window.__perfCore;
      if (!CORE || !CORE.whenClass) return;
      function teamColor(inst) {
        if (!featOn("teamhl")) return null;
        var wm = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode;
        if (!(wm && (wm.id === "team" || Array.isArray(wm.teams) && wm.teams.length > 1))) return null;
        var id = inst.shipid, mine = window.__synMyShipId, mt = window.__synMyTeam, t = _aegisTeamOf[id];
        if (id == null || id === mine || typeof mt !== "number" || typeof t !== "number") return null;
        return t === mt ? 0x90ee90 : 0xeab308;
      }
      function darken(c) { var f = .35; return (Math.round((c >> 16 & 255) * f) << 16) | (Math.round((c >> 8 & 255) * f) << 8) | Math.round((c & 255) * f); }
      CORE.whenClass(function(p) { return typeof p.buildFullColorMaterial === "function" && typeof p.buildDefaultMaterial === "function"; }, function(P) {
        var full = P.buildFullColorMaterial;
        Object.getOwnPropertyNames(P).forEach(function(n) {
          if (!/^build\w*Material$/.test(n) || typeof P[n] !== "function") return;
          var orig = P[n];
          P[n] = function() {
            // (one build at a time: a finish that builds through another one is left alone)
            if (this.__stMat) return orig.apply(this, arguments);
            this.__stMat = 1;
            try {
              var hl = teamColor(this), T = window.THREE;
              if (hl != null && T && T.MeshPhongMaterial) { this.material = new T.MeshPhongMaterial({ color: hl, emissive: darken(hl), specular: 0x111111, shininess: 10 }); return; }
              var r = n !== "buildFullColorMaterial" && featOn("highcontrast") ? full.apply(this, arguments) : orig.apply(this, arguments);
              var m = this.material, H = window.OIl1O;
              if (featOn("saturate") && m && m.emissive && m.emissive.setHex && typeof this.hue === "number" && H && typeof H.hsvToRgbHex === "function") m.emissive.setHex(H.hsvToRgbHex(this.hue, 1, 1));
              return r;
            } finally { this.__stMat = 0; }
          };
        });
      }, 600000);
    })();
    // Leaderboard ship icons: each player's row on the scoreboard gets a gap
    // before the name with their ship's icon drawn in it, in their hue.
    (function leaderboardIcons() {
      var GAP = "  ", hooked = [], iconOwner = null, iconAt = 0, tint = {}, byName = {}, names = [], nameAt = 0;
      function norm(s) { return String(s || "").replace(/(…|\.\.\.)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase(); }
      function shipIcon(code) {
        if (!iconOwner) {
          if (window.IOII0 && typeof window.IOII0.getShipIcon === "function") iconOwner = window.IOII0;
          else if (Date.now() - iconAt > 3000) {
            iconAt = Date.now();
            for (var k in window) {
              try { var v = window[k]; if (v && (typeof v === "function" || typeof v === "object") && typeof v.getShipIcon === "function") { iconOwner = v; break; } } catch (e) {}
            }
          }
        }
        try { return iconOwner ? iconOwner.getShipIcon(code) : null; } catch (e) { return null; }
      }
      function tinted(code, hue) {
        var key = code + ":" + hue;
        if (tint[key]) return tint[key];
        var src = shipIcon(code);
        if (!src || !(src.width > 0) || !(src.height > 0)) return null;
        var c = document.createElement("canvas");
        c.width = src.width; c.height = src.height;
        var x = c.getContext("2d");
        x.drawImage(src, 0, 0);
        x.globalCompositeOperation = "source-in";
        x.fillStyle = hue == null ? "#fff" : "hsl(" + hue + ",100%,62%)";
        x.fillRect(0, 0, c.width, c.height);
        return tint[key] = c;
      }
      function refreshNames() {
        var now = Date.now();
        if (now - nameAt < 1000) return;
        nameAt = now; byName = {}; names = [];
        function add(id, nm) {
          var t = norm(nm);
          if (!t) return;
          if (byName[t] === undefined) { byName[t] = +id; names.push(t); } else if (byName[t] !== +id) byName[t] = -1;
        }
        for (var id in _aegisNames) add(id, _aegisNames[id]);
        try {
          var g = getGS(), d = g && g.names && g.names.data;
          if (Array.isArray(d)) d.forEach(function(p) { if (p && p.player_name != null && p.id != null) { add(p.id, p.player_name); if (typeof p.hue === "number" && typeof _aegisHueOf[p.id] !== "number") _aegisHueOf[p.id] = p.hue; } });
        } catch (e) {}
      }
      function idFor(text) {
        var t = norm(text);
        if (!t || /^[\d\s.,:]+$/.test(t)) return null;
        var id = byName[t];
        if (id >= 0) return id;
        if (id === -1 || t.length < 4) return null;
        // (a long name the board cut short: the one name it starts)
        var hit = null;
        for (var i = 0; i < names.length; i++) if (names[i].length > t.length && names[i].indexOf(t) === 0) { if (hit != null) return null; hit = byName[names[i]]; }
        return hit >= 0 ? hit : null;
      }
      function codeOf(id) {
        var s = _synStat[id];
        if (s && s.code && Date.now() - s.ts < 5000) return s.code;
        var r = _aegisShips[id];
        return r && r.code ? r.code : s && s.code ? s.code : null;
      }
      function rowIcon(ctx, text, x) {
        if (typeof text !== "string") return null;
        var m = /^(\s*\d{1,3}[.)]\s*)?([\s\S]+)$/.exec(text);
        if (!m) return null;
        var pre = m[1] || "", rest = m[2], id = idFor(rest);
        if (id == null) return null;
        var code = codeOf(id);
        if (!code) return null;
        var hue = typeof _aegisHueOf[id] === "number" ? Math.round(_aegisHueOf[id]) : null;
        var img = tinted(code, hue);
        if (!img) return null;
        var nt = pre + GAP + rest;
        var fs = /(\d+(?:\.\d+)?)px/.exec(ctx.font), px = fs ? +fs[1] : 14;
        var wAll = ctx.measureText(nt).width, wPre = ctx.measureText(pre).width, wGap = ctx.measureText(GAP).width;
        var al = ctx.textAlign, left = al === "right" || al === "end" ? x - wAll : al === "center" ? x - wAll / 2 : x;
        var sz = Math.min(wGap * .95, px * 1.15);
        return { text: nt, img: img, ix: left + wPre + (wGap - sz) / 2, sz: sz };
      }
      function findDraw(proto) {
        var ns = Object.getOwnPropertyNames(proto);
        for (var i = 0; i < ns.length; i++) {
          var fn;
          try { fn = proto[ns[i]]; } catch (e) { continue; }
          if (typeof fn !== "function") continue;
          try {
            var src = Function.prototype.toString.call(fn);
            if (src.length > 500 && src.indexOf("fillText") >= 0 && src.indexOf("fillStyle") >= 0 && src.indexOf("hue") >= 0) return ns[i];
          } catch (e) {}
        }
        return null;
      }
      function hook(proto) {
        var name = findDraw(proto);
        if (!name || proto[name].__stLB) return false;
        var orig = proto[name];
        proto[name] = function(ctx) {
          if (!ctx || typeof ctx.fillText !== "function" || !featOn("lbicons")) return orig.apply(this, arguments);
          refreshNames();
          var own = Object.prototype.hasOwnProperty.call(ctx, "fillText"), oFT = ctx.fillText;
          ctx.fillText = function(text, x, y) {
            var r = null;
            try { r = rowIcon(ctx, text, x); } catch (e) {}
            if (!r) return oFT.apply(ctx, arguments);
            try { return oFT.call(ctx, r.text, x, y); }
            finally {
              try {
                var b = ctx.textBaseline, ty = b === "middle" ? y - r.sz / 2 : b === "top" || b === "hanging" ? y : y - r.sz * .82;
                ctx.drawImage(r.img, r.ix, ty, r.sz, r.sz);
              } catch (e) {}
            }
          };
          try { return orig.apply(this, arguments); }
          finally { if (own) ctx.fillText = oFT; else delete ctx.fillText; }
        };
        proto[name].__stLB = true;
        return true;
      }
      setInterval(function() {
        try {
          var g = getGS(), mode = g && g.mode;
          if (!mode) return;
          var boards = [];
          if (mode.scoreboard) boards.push(mode.scoreboard);
          if (Array.isArray(mode.teamboards)) mode.teamboards.forEach(function(tb) { if (tb) boards.push(tb); });
          boards.forEach(function(b) {
            var p = Object.getPrototypeOf(b);
            if (p && hooked.indexOf(p) < 0 && hook(p)) hooked.push(p);
          });
        } catch (e) {}
      }, 400);
    })();
    // ESP: a line from your ship to every other ship, or only those within
    // the near distance (exact while in view, the radar's spot beyond it,
    // dashed), a light box round each one on screen, name and distance;
    // team games colour allies green and enemies red, others in their hue.
    (function esp() {
      var cv = document.createElement("canvas");
      cv.style.cssText = "position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:999987;display:none";
      document.body.appendChild(cv);
      var ctx = cv.getContext("2d"), dpr = 1, disp = {}, lastT = 0;
      function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); }
      resize();
      addEventListener("resize", resize);
      function wrapD(d) { var size = _aegisMapHalf * 2; if (!(size > 0)) return d; d = (d % size + size) % size; return d > size / 2 ? d - size : d; }
      function teamGame() { var wm = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode; return !!(wm && (wm.id === "team" || Array.isArray(wm.teams) && wm.teams.length > 1)); }
      function col(id, a) {
        if (teamGame()) {
          var mt = typeof window.__synMyTeam === "number" ? window.__synMyTeam : null;
          return mt != null && _aegisTeamOf[id] === mt ? "hsla(140,70%,55%," + a + ")" : "hsla(2,85%,60%," + a + ")";
        }
        var h = _aegisHueOf[id];
        return typeof h === "number" ? "hsla(" + Math.round(h) + ",100%,65%," + a + ")" : "rgba(255,255,255," + a + ")";
      }
      // where each ship is: the status packets while fresh, else the radar (eased)
      function ships(myId, now, ease) {
        var out = [];
        for (var id in _synStat) {
          var s = _synStat[id], n = +id;
          if (n === myId || now - s.ts > 1500) continue;
          if (!s.alive) { delete disp[id]; continue; }
          var age = Math.min(.5, (now - s.ts) / 1000);
          var x = s.x + s.vx * 60 * age, y = s.y + s.vy * 60 * age;
          disp[id] = { x: x, y: y, seen: now };
          out.push({ id: n, x: x, y: y, exact: true });
        }
        for (var rid in _aegisShips) {
          var rn = +rid, st = _synStat[rid];
          if (rn === myId || st && now - st.ts <= 1500) continue;
          var r = _aegisShips[rid];
          if (now - r.ts > SHIP_TTL || r.zeroSince != null && now - r.zeroSince > BOT_ZERO_TTL) continue;
          var D = disp[rid];
          if (!D || now - D.seen > 1500) D = disp[rid] = { x: r.x, y: r.y, seen: now };
          D.x += wrapD(r.x - D.x) * ease; D.y += wrapD(r.y - D.y) * ease; D.seen = now;
          out.push({ id: rn, x: D.x, y: D.y, exact: false });
        }
        return out;
      }
      // (a point off screen is pulled back along the line to the edge, for its label)
      function edge(a, b, m) {
        var W = innerWidth, H = innerHeight;
        if (b.x >= m && b.y >= m && b.x <= W - m && b.y <= H - m) return { x: b.x, y: b.y, off: false };
        var dx = b.x - a.x, dy = b.y - a.y, t = 1;
        if (dx > 0) t = Math.min(t, (W - m - a.x) / dx); else if (dx < 0) t = Math.min(t, (m - a.x) / dx);
        if (dy > 0) t = Math.min(t, (H - m - a.y) / dy); else if (dy < 0) t = Math.min(t, (m - a.y) / dy);
        t = Math.max(0, t);
        return { x: a.x + dx * t, y: a.y + dy * t, off: true };
      }
      function drawEsp(g, my, cam, me, ease) {
        var now = Date.now(), list = ships(my.id, now, ease);
        ctx.font = "600 11px Play, Arial, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineJoin = "round";
        var near = espNear(), maxD = espDist(), RAD = window.__synAim && window.__synAim.RAD || {};
        var p0 = worldToScreenPx(cam, my.x, my.y, g), p1 = worldToScreenPx(cam, my.x + 10, my.y, g);
        var ppu = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10 : 0;
        for (var i = 0; i < list.length; i++) {
          var t = list[i], dx = wrapD(t.x - my.x), dy = wrapD(t.y - my.y);
          var dist = Math.round(Math.hypot(dx, dy));
          if (near && dist > maxD) continue;
          var p = worldToScreenPx(cam, my.x + dx, my.y + dy, g);
          if (!p) continue;
          var e = edge(me, p, 28), nm = _aegisNames[t.id] || "#" + t.id, label = nm + "  " + dist;
          // the light box: the ship's hull size, a little room round it
          var code = (_synStat[t.id] || {}).code || (_aegisShips[t.id] || {}).code, half = !e.off && ppu > 0 ? Math.max(6, (RAD[code] || 3) * .8 * ppu) : 0;
          // (the line stops at the box)
          var lx = me.x - p.x, ly = me.y - p.y, m = Math.max(Math.abs(lx), Math.abs(ly)), k = half && m > half ? half / m : 0;
          if (!half || m > half) {
            ctx.save();
            ctx.strokeStyle = col(t.id, t.exact ? .6 : .38);
            ctx.lineWidth = t.exact ? 1.5 : 1.2;
            if (!t.exact) ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(me.x, me.y); ctx.lineTo(p.x + lx * k, p.y + ly * k); ctx.stroke();
            ctx.restore();
          }
          if (half) {
            ctx.save();
            ctx.shadowColor = col(t.id, .9); ctx.shadowBlur = 8;
            ctx.fillStyle = col(t.id, .07); ctx.fillRect(p.x - half, p.y - half, half * 2, half * 2);
            ctx.strokeStyle = col(t.id, t.exact ? .85 : .5); ctx.lineWidth = 1.2;
            ctx.strokeRect(p.x - half, p.y - half, half * 2, half * 2);
            ctx.restore();
            e = { x: p.x, y: p.y - half + 1, off: false };
          }
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(7,16,22,.85)"; ctx.strokeText(label, e.x, e.y - 5);
          ctx.fillStyle = col(t.id, .95); ctx.fillText(label, e.x, e.y - 5);
          if (!_aegisNames[t.id]) requestName(t.id);
        }
      }
      (function loop() {
        requestAnimationFrame(loop);
        var now = Date.now(), fdt = lastT ? Math.min(.1, (now - lastT) / 1000) : .016; lastT = now;
        if (!featOn("esp") || !inGame()) { if (cv.style.display !== "none") cv.style.display = "none"; return; }
        if (cv.style.display !== "block") cv.style.display = "block";
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        try {
          var g = getGS(), my = g && getMyStatus(g), cam = getActiveCamera();
          if (!g || !my || !cam || my.alive === false || typeof my.x !== "number") return;
          var me = worldToScreenPx(cam, my.x, my.y, g);
          if (!me) return;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawEsp(g, my, cam, me, 1 - Math.exp(-fdt * 7));
        } catch (e) {}
      })();
    })();
    (function fovZoom() {
      var MIN_FOV = 1, MAX_FOV = 170, T_MIN = .4, T_MAX = 3, SENS = 9e-4, TAU = 170;
      var _fovFactor = 1, _fovTarget = 1, _fovInstalled = false, _nativeZoom = false;
      window.__synFovFactor = function() { return featOn("fov") && !_nativeZoom ? _fovFactor : 1; };
      function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
      }
      function install(T) {
        if (!T || !T.PerspectiveCamera || _fovInstalled) return;
        _fovInstalled = true;
        var oU = T.PerspectiveCamera.prototype.updateProjectionMatrix;
        T.PerspectiveCamera.prototype.updateProjectionMatrix = function() {
          // (spectator mode runs its own zoom)
          if (!featOn("fov") || _nativeZoom || (window.__synSpectator && window.__synSpectator.isOn())) return oU.call(this);
          var keepFov = this.fov, keepFar = this.far;
          this.fov = clamp(keepFov * _fovFactor, MIN_FOV, MAX_FOV);
          this.far = keepFar * Math.max(1, _fovFactor);
          var r = oU.call(this);
          this.fov = keepFov;
          this.far = keepFar;
          return r;
        };
        var last = performance.now();
        (function tick(now) {
          var a = 1 - Math.exp(-(now - last) / TAU);
          last = now;
          _fovFactor += (_fovTarget - _fovFactor) * a;
          window.__aegisFovFactor = featOn("fov") && !_nativeZoom ? _fovFactor : 1;
          var val = document.getElementById("aegis-zoom-val");
          if (val) val.textContent = (1 / _fovFactor).toFixed(2) + "×";
          requestAnimationFrame(tick);
        })(last);
        console.log("[Studio] FOV hook installed on THREE.PerspectiveCamera");
      }
      (function watch() {
        if (window.THREE && window.THREE.PerspectiveCamera) install(window.THREE); else setTimeout(watch, 100);
      })();
      window.addEventListener("wheel", function(e) {
        if (window.__synSpectator && window.__synSpectator.isOn()) return;
        if (!featOn("fov") || !inGame()) return;
        if (!e.target || e.target.tagName !== "CANVAS") return;
        _nativeZoom = false;
        var dir = e.deltaY > 0 ? 1 : -1;
        _fovTarget = clamp(_fovTarget * Math.exp(dir * Math.abs(e.deltaY) * SENS), T_MIN, T_MAX);
      }, {
        passive: true
      });
      document.addEventListener("keydown", function(e) {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (!inGame() || !featOn("fov")) return;
        if (e.key === "0") {
          e.preventDefault();
          _nativeZoom = !_nativeZoom;
          _fovTarget = 1;
          _fovFactor = 1;
        }
      });
    })();
    (function aimAssist() {
      var CFG_KEY = "STUDIO_aim_cfg", CFG_DEF = { act: "both", confirm: 0, targets: "aim", cone: 30, autofire: "big", gate: true, others: true, marker: true, qsnap: true, drag: true, dodge: false, dodgeHow: "auto", dodgeMin: 0, kb: false, kbTurn: true, steady: false };
      function readCfg() {
        var c = {};
        try { c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}") || {}; } catch (e) {}
        for (var k in CFG_DEF) if (c[k] == null) c[k] = CFG_DEF[k];
        return c;
      }
      var C = readCfg();
      addEventListener("syn-aim-cfg", function() { C = readCfg(); });
      addEventListener("storage", function(e) { if (e.key === CFG_KEY) C = readCfg(); });
      var A = {
        keyHeld: false, snap: false, forceLock: null, forced: false, sentWord: null, flags: null, userDeg: null, userFire: false, numeric: true, ws: null,
        lock: null, cand: null, candSince: 0, graceUntil: 0, shot: null, aim: null, fire: false, engaged: false,
        sentDeg: null, sentFire: null, sentAt: 0, speed: 0, k: 1, kN: 0, tracks: {}, lastSolve: null,
        gun: { fwd: 0, n: 0 }, ship: { code: null, maxRec: 0, maxVol: 0, genMax: 0, regen: 0 },
        my: { gen: null, genTs: 0, turn: 0, hist: [] }, pulse: { on: false, start: 0, cool: 0, big0: 0 }, lastBigAt: 0, bigShots: 0
      };
      window.__synAim = A;
      A.cfg = function() { return C; };
      var DT = 1 / 120, HULL = 2.2;
      function wrap(d) {
        var size = _aegisMapHalf * 2;
        if (!(size > 0)) return d;
        d = (d % size + size) % size;
        return d > size / 2 ? d - size : d;
      }
      function sdiff(a, b) { return ((a - b) % 360 + 540) % 360 - 180; }
      function angDiff(a, b) { return Math.abs(sdiff(a, b)); }
      function myId() {
        if (typeof window.__synMyShipId === "number") return window.__synMyShipId;
        var gs = getGS(), st = gs && getMyStatus(gs);
        return st ? st.id : null;
      }
      function ping() { var gs = getGS(); return gs && typeof gs.ping === "number" ? gs.ping : 80; }
      // (the game's own rule: a bolt slower than 100 lives 2 s, a faster one
      // -2 ln(1 - 63/S) s, i.e. it stops at 63)
      function laserLife(S) { return S >= 100 ? -2 * Math.log(1 - 63 / S) : 2; }
      function reach(S) { return S >= 100 ? 63 : S * (1 - Math.exp(-1)); }
      // Motion models: 0 straight, 1 fading turn (a juke), 2 held turn
      // (circling), 3 changing speed (burn or brake, fading).
      var TAU = [0, .6, 4, .5];
      function stateOf(x, y, vx, vy, w, ac) { return { x: x, y: y, h: Math.atan2(vy, vx), sp: Math.hypot(vx, vy) * 60, w: w || 0, ac: ac || 0 }; }
      function copyQ(q) { var o = {}; for (var k in q) o[k] = q[k]; return o; }
      // 4, the engine: the game's own ship physics (ShipPhysics, as the bots
      // run it): the nose turns towards the steering angle in the status
      // packet, and with the engine on the velocity closes on top speed along
      // the nose by the ship's inertia every tick; off, it bleeds away.
      // Per ship: speed, rotation, accel at level 1 (ships.rs).
      var ENG = {101: [125, 110, 100], 201: [110, 80, 110], 202: [110, 70, 90], 301: [105, 60, 80], 302: [100, 50, 100], 303: [120, 35, 90], 304: [80, 40, 70], 401: [75, 90, 75], 402: [85, 60, 60], 403: [75, 50, 90], 404: [80, 50, 110], 405: [90, 40, 50], 406: [75, 40, 80], 501: [70, 50, 60], 502: [70, 120, 150], 503: [80, 50, 90], 504: [90, 70, 110], 505: [110, 35, 140], 506: [85, 70, 90], 507: [70, 50, 80], 508: [70, 40, 90], 601: [70, 30, 70], 602: [75, 50, 80], 603: [85, 60, 80], 604: [95, 50, 80], 605: [90, 40, 90], 606: [85, 50, 80], 607: [75, 50, 55], 608: [70, 30, 130], 609: [70, 30, 80], 701: [45, 20, 150], 702: [110, 50, 90], 703: [80, 25, 105], 704: [75, 25, 95]};
      // The mode's movement options (welcome message): strafe power (RCS
      // sideways thrust; 0 = none), speed_mod, friction_ratio (coasting).
      var _mode = null, _modeAt = 0;
      function MODE() {
        var now = Date.now();
        if (_mode && now - _modeAt < 1000) return _mode;
        var m = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode || {};
        _modeAt = now;
        return (_mode = { strafe: +m.strafe > 0 ? Math.min(1, +m.strafe) : 0, speed: +m.speed_mod > 0 ? +m.speed_mod : 1, fric: +m.friction_ratio > 0 ? +m.friction_ratio : 1 });
      }
      A.mode = MODE;
      // Hull radius per ship (ships.rs): what a bolt has to pass to miss.
      var RAD = {101: 1.856, 201: 3.33, 202: 2.804, 301: 2.851, 302: 2.343, 303: 2.823, 304: 3.834, 401: 4.646, 402: 3.514, 403: 4.352, 404: 3.427, 405: 3.553, 406: 4.922, 501: 4.83, 502: 5.299, 503: 5.051, 504: 3.38, 505: 3.78, 506: 3.96, 507: 5.01, 508: 4.187, 601: 6.064, 602: 5.858, 603: 3.573, 604: 3.586, 605: 3.621, 613: 3.621, 606: 4.524, 607: 4.676, 608: 5.888, 609: 4.449, 701: 9.054, 702: 6.807, 703: 10.53, 704: 8.225};
      A.RAD = RAD;
      function engState(src, tr) {
        var d = ENG[src.code] || [ 100, 50, 90 ], sp = Math.hypot(src.vx, src.vy), M = MODE();
        // top speed: the ship's own, upgrades included, as measured from how
        // it gathers speed under thrust (tr.topEst); before that is known,
        // never slower than it has been seen going. On RCS (glide) the game
        // keeps the speed exactly unless it is above the ship's top speed.
        var est = tr && tr.topEst || 0, top = est ? Math.max(est, .004 * d[0] * M.speed) : Math.max(.004 * d[0] * M.speed, sp, tr && tr.vtop || 0);
        return { x: src.x, y: src.y, vx: src.vx, vy: src.vy, r: src.r, aim: src.aim, up: src.up,
          glide: !!src.glide || !!(tr && tr.gInf && !src.up), side: src.side || 0, stun: src.stun || 0, M: M,
          top: top, gcap: est ? Math.max(top * 1.01, Math.min(sp, top * 1.01)) : Math.max(top, sp), inr: Math.exp(Math.log(.5) / (3000 / d[2])), turn: .15 * d[1] / 100,
          h: Math.atan2(src.vy, src.vx), sp: sp * 60, w: 0, ac: 0 };
      }
      function step(m, q, dt) {
        if (m === 4) {
          // (ShipPhysics.IlIOl: knocked back, it neither turns nor steers;
          // gliding (RCS off) with no thrust it keeps its speed, slowed only
          // above top speed; strafing thrusts across the nose; coasting
          // brakes by inertia ^ friction_ratio)
          var n = dt * 60, M = q.M || MODE(), sd = M.strafe > 0 ? q.side || 0 : 0;
          if (!(q.stun > 0)) {
            var dd = Math.atan2(Math.sin(q.aim - q.r), Math.cos(q.aim - q.r));
            if (Math.abs(dd) < 5 * q.turn) q.r += dd * (1 - Math.pow(.8, n)); else q.r += (dd > 0 ? 1 : -1) * Math.min(Math.abs(dd), q.turn * n);
          }
          var f = Math.pow(q.inr, n);
          if (q.stun > 0 || q.glide && !q.up && !sd) {
            if (Math.hypot(q.vx, q.vy) > (q.gcap || q.top)) { q.vx *= f; q.vy *= f; }
            if (q.stun > 0) q.stun = Math.max(0, q.stun - n);
          } else {
            var tx = 0, ty = 0;
            if (q.up) { tx = q.top * Math.cos(q.r); ty = q.top * Math.sin(q.r); }
            if (sd) {
              tx -= q.top * Math.sin(q.r) * M.strafe * sd; ty += q.top * Math.cos(q.r) * M.strafe * sd;
              var tl = Math.hypot(tx, ty); if (tl > q.top) { tx = tx / tl * q.top; ty = ty / tl * q.top; }
            }
            var ii = q.up ? f : Math.pow(q.inr, n * M.fric);
            q.vx = tx + (q.vx - tx) * ii; q.vy = ty + (q.vy - ty) * ii;
          }
          q.x += q.vx * n; q.y += q.vy * n;
          return;
        }
        if ((m === 1 || m === 2) && q.w) { q.h += q.w * dt; q.w *= Math.exp(-dt / TAU[m]); }
        if (m === 3 && q.ac) { q.sp = Math.max(0, q.sp + q.ac * dt); q.ac *= Math.exp(-dt / TAU[3]); }
        q.x += Math.cos(q.h) * q.sp * dt; q.y += Math.sin(q.h) * q.sp * dt;
      }
      // The shot from o (own fire spot) with own velocity v (per tick) at
      // target state q (at fire time, mutated). Returns { deg, t, x, y, hit }:
      // heading, flight time and meeting point, or the closest pass.
      function solve(o, v, q, m, S, k) {
        var life = laserLife(S), pg = null, prx = 0, pry = 0, best = null;
        for (var t = DT; t <= life + 1e-9; t += DT) {
          step(m, q, DT);
          var rx = wrap(q.x - o.x) - 60 * k * v.x * t, ry = wrap(q.y - o.y) - 60 * k * v.y * t;
          var gap = Math.hypot(rx, ry) - S * (1 - Math.exp(-t / 2));
          if (gap <= 0) {
            var f = pg != null && pg - gap > 0 ? pg / (pg - gap) : 1;
            var ax = prx + (rx - prx) * f, ay = pry + (ry - pry) * f;
            return { deg: (Math.atan2(ay, ax) * 180 / Math.PI + 360) % 360, t: t - DT * (1 - f), x: q.x, y: q.y, hit: true };
          }
          if (!best || gap < best.gap) best = { gap: gap, deg: (Math.atan2(ry, rx) * 180 / Math.PI + 360) % 360, t: t, x: q.x, y: q.y, hit: false };
          pg = gap; prx = rx; pry = ry;
        }
        return best;
      }
      // Closest pass of a bolt fired at `deg` (to pick the whole degree).
      function missAt(deg, o, v, q, m, S, k) {
        var life = laserLife(S), c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180), best = 1e9;
        for (var t = DT; t <= life + 1e-9; t += DT) {
          step(m, q, DT);
          var D = S * (1 - Math.exp(-t / 2));
          var dx = wrap(q.x - o.x) - c * D - 60 * k * v.x * t, dy = wrap(q.y - o.y) - s * D - 60 * k * v.y * t;
          var d = Math.hypot(dx, dy);
          if (d < best) best = d;
        }
        return best;
      }
      A.solve = solve;
      // Per ship: turn rate and speed change, and the self-check (every ~0.1 s
      // each model predicts where the ship is now from ~0.4 s ago).
      window.__synAimStat = function(s) {
        if (s.id === myId()) { ownStat(s); if (document.hidden && A.pump && C.dodge) try { A.pump(true); } catch (e) {} }
        var tr = A.tracks[s.id];
        if (!tr || !s.alive) { A.tracks[s.id] = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, ts: s.ts, w: 0, ac: 0, T: 0, hist: [], e: [0, 0, 0, 0, 0], n: 0, chk: -1, vtop: 0, r: null, up: false, glide: false, slide: 0 }; return; }
        tr.vtop = Math.max((tr.vtop || 0) * .999, Math.hypot(s.vx, s.vy));
        // packets arrive bunched, so the time between them comes from how far
        // the ship went at its speed (the arrival times only when it sits still)
        var sp0 = Math.hypot(tr.vx, tr.vy), sp1 = Math.hypot(s.vx, s.vy), dtR = (s.ts - tr.ts) / 1000;
        var dt = sp0 + sp1 > .1 ? Math.hypot(wrap(s.x - tr.x), wrap(s.y - tr.y)) / ((sp0 + sp1) * 30) : dtR;
        if (dt < .008 && dtR < .5) return;
        if (dt > .5 || dtR > 1) { tr.x = s.x; tr.y = s.y; tr.vx = s.vx; tr.vy = s.vy; tr.ts = s.ts; tr.hist = []; tr.T = 0; tr.chk = -1; return; }
        if (sp0 > .05 && sp1 > .05) {
          var dh = Math.atan2(s.vy, s.vx) - Math.atan2(tr.vy, tr.vx);
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          tr.w = tr.w * .6 + Math.max(-6, Math.min(6, dh / dt)) * .4;
        } else tr.w *= .5;
        tr.ac = tr.ac * .6 + Math.max(-400, Math.min(400, (sp1 - sp0) * 60 / dt)) * .4;
        // Strafing (modes with RCS strafe): the server sends no strafe keys
        // for other ships, so a sideways push across the nose that the engine
        // (or coasting) can not explain is taken as one, as the bots do it
        var M = MODE(), slide = s.side || 0;
        if (!slide && M.strafe > 0 && tr.r != null && !(s.stun > 0)) {
          var dg = ENG[s.code] || [ 100, 50, 90 ], inr = Math.exp(Math.log(.5) / (3000 / dg[2])), nT = Math.max(1, dt * 60);
          var top = Math.max(.004 * dg[0] * M.speed, sp0), evx = tr.vx, evy = tr.vy;
          if (tr.up) { var ff = Math.pow(inr, nT), ttx = top * Math.cos(tr.r), tty = top * Math.sin(tr.r); evx = ttx + (evx - ttx) * ff; evy = tty + (evy - tty) * ff; }
          else if (!tr.glide) { var fc = Math.pow(inr, nT * M.fric); evx *= fc; evy *= fc; }
          var ax = (s.vx - evx) / nT, ay = (s.vy - evy) / nT, rr = s.angle * Math.PI / 180;
          var lat = -Math.sin(rr) * ax + Math.cos(rr) * ay, thr = .25 * (1 - inr) * top * M.strafe;
          slide = lat > thr ? 1 : lat < -thr ? -1 : tr.slide && lat * tr.slide > -.3 * thr ? tr.slide : 0;
        }
        // the ship's real top speed: under thrust the game moves its velocity
        // toward top along the nose each tick, v1 = v0 f + top (1 - f), so two
        // packets give top (upgrades included); and RCS (glide) when the flag
        // is not sent: engine off, yet no slowing down as coasting would
        var dgE = ENG[s.code] || [ 100, 50, 90 ], inrE = Math.exp(Math.log(.5) / (3000 / dgE[2])), nTE = Math.max(1, dt * 60);
        if (tr.code !== s.code) { tr.code = s.code; tr.topEst = 0; }
        if (tr.up && s.up && !(s.stun > 0) && tr.r != null && !slide) {
          var fE = Math.pow(inrE, nTE), rE = s.angle * Math.PI / 180, cE = Math.cos(rE), sE = Math.sin(rE);
          if (1 - fE > .03) {
            var v0E = tr.vx * cE + tr.vy * sE, v1E = s.vx * cE + s.vy * sE, eE = (v1E - v0E * fE) / (1 - fE);
            if (eE > .05 && eE < 3 && Math.abs(-s.vx * sE + s.vy * cE) < .5 * eE) tr.topEst = tr.topEst ? tr.topEst * .6 + eE * .4 : eE;
          }
        }
        if (s.up || s.glide || s.stun > 0 || sp0 < .05) tr.gInf = false;
        else {
          var fcE = Math.pow(inrE, nTE * M.fric), ratio = sp1 / sp0;
          if (1 - fcE > .01) { if (ratio > 1 - (1 - fcE) * .3) tr.gInf = true; else if (ratio < 1 - (1 - fcE) * .7) tr.gInf = false; }
        }
        if (tr.up !== !!s.up || tr.glide !== !!s.glide) tr.flagAt = tr.T;
        tr.slide = slide; tr.r = s.angle * Math.PI / 180; tr.up = !!s.up; tr.glide = !!s.glide;
        tr.x = s.x; tr.y = s.y; tr.vx = s.vx; tr.vy = s.vy; tr.ts = s.ts; tr.T += dt;
        tr.hist.push({ T: tr.T, x: s.x, y: s.y, vx: s.vx, vy: s.vy, w: tr.w, ac: tr.ac, r: s.angle * Math.PI / 180, aim: (s.steer || 0) * Math.PI / 180, up: !!s.up, code: s.code, glide: !!s.glide, side: slide, stun: s.stun || 0 });
        while (tr.hist.length && tr.T - tr.hist[0].T > .8) tr.hist.shift();
        if (tr.T - tr.chk < .1) return;
        var e = null;
        for (var i = 0; i < tr.hist.length && tr.T - tr.hist[i].T >= .35; i++) e = tr.hist[i];
        if (!e) return;
        var H = tr.T - e.T, n = Math.max(1, Math.round(H / DT));
        for (var m = 0; m < 5; m++) {
          var q = m === 4 ? engState(e, tr) : stateOf(e.x, e.y, e.vx, e.vy, e.w, e.ac);
          for (var j = 0; j < n; j++) step(m, q, H / n);
          var err = Math.hypot(wrap(s.x - q.x), wrap(s.y - q.y));
          tr.e[m] = tr.n ? tr.e[m] * .85 + err * .15 : err;
        }
        tr.n++; tr.chk = tr.T;
      };
      function modelOf(tr) {
        if (!tr) return 0;
        // the engine model follows the game's own physics from the ship's
        // keys (thrust, RCS, strafe), which the packets carry exactly: it
        // leads just after they change (the other models still remember the
        // old motion) and whenever it fits as well as they do
        if (!window.__synAimNoEngine && tr.n >= 1) {
          if (tr.flagAt != null && tr.T - tr.flagAt < .8) return 4;
          var lo = Math.min(tr.e[0], tr.e[1], tr.e[2], tr.e[3]);
          if (tr.e[4] <= lo * 1.25 + .05) return 4;
        }
        if (tr.n < 6) return 0;
        var m = 1, top = window.__synAimNoEngine ? 4 : 5;
        for (var i = 2; i < top; i++) if (tr.e[i] < tr.e[m]) m = i;
        return tr.e[m] < tr.e[0] * .8 ? m : 0;
      }
      // Own ship: energy (level, refill rate, full bar) and turn rate.
      function ownStat(s) {
        var sh = A.ship, my = A.my;
        if (sh.code !== s.code) { sh.code = s.code; sh.maxRec = 0; sh.maxVol = 0; sh.genMax = 0; sh.regen = 0; A.gun.n = 0; A.gun.fwd = 0; my.turn = 0; A.smallS = 0; A.smallAt = 0; A.bigPer = 0; }
        if (typeof s.gen === "number") {
          // refill rate over a quarter second or more of steady rise (packets
          // arrive bunched; a shot or a full bar starts the window again)
          if (my.gen == null || s.gen <= my.gen) my.gh = [];
          my.gh = my.gh || [];
          my.gh.push([s.ts, s.gen]);
          var g0 = my.gh[0];
          if (s.ts - g0[0] >= 250) {
            var r = (s.gen - g0[1]) / ((s.ts - g0[0]) / 1000);
            if (r > 0 && r < 2000) sh.regen = sh.regen ? sh.regen * .7 + r * .3 : r;
            my.gh = [[s.ts, s.gen]];
          }
          if (s.gen > sh.genMax) sh.genMax = s.gen;
          my.gen = s.gen; my.genTs = s.ts;
        }
        my.hist.push([s.ts, s.angle]);
        while (my.hist.length > 2 && s.ts - my.hist[1][0] >= 250) my.hist.shift();
        var h0 = my.hist[0];
        if (s.ts - h0[0] >= 200) {
          var rate = Math.abs(sdiff(s.angle, h0[1])) / ((s.ts - h0[0]) / 1000);
          if (rate < 1500) my.turn = Math.max(my.turn * .998, rate);
        }
      }
      // Our volleys: laser speed, inherited drift, the gun's spot on the hull,
      // what one volley costs (a shot costs its damage) and when the biggest
      // gun fired.
      window.__synAimVolley = function(b) {
        var me = myId();
        if (me == null || b[1] !== me) return;
        var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), bestO = -1, bestD = -1, sum = 0, now = Date.now(), sh = A.ship;
        for (var o = 8; o + 32 <= b.length; o += 32) { var d = b[o + 31]; sum += d; if (d > bestD) { bestD = d; bestO = o; } }
        if (bestO < 0) return;
        if (bestD > sh.maxRec) sh.maxRec = bestD;
        if (sum > sh.maxVol) sh.maxVol = sum;
        // Ships with guns of two kinds (the Condor's big gun and its quicker,
        // slower-flying side guns, the A-Speedster...): the small guns' speed
        // (by damage), and how often the big gun goes, so each shot can be led
        // for the gun that fires it
        var sS = 0, sW = 0;
        for (var o2 = 8; o2 + 32 <= b.length; o2 += 32) {
          var d2 = b[o2 + 31], sp2 = dv.getFloat32(o2 + 20, true);
          if (d2 < sh.maxRec * .9 && sp2 > 10 && sp2 < 2000) { sS += sp2 * Math.max(1, d2); sW += Math.max(1, d2); }
        }
        if (sW > 0) { A.smallS = A.smallS ? A.smallS * .7 + sS / sW * .3 : sS / sW; A.smallAt = now; }
        if (bestD >= sh.maxRec * .9) {
          var gap = A.lastBigAt ? now - A.lastBigAt : 0;
          // the big gun's reload: near the SHORTEST gap between its shots (a
          // shorter gap pulls it 30% of the way, so one shortened by bunched
          // packets doesn't stick; longer ones let it creep up 2%). It used
          // to average the gaps, and a ship short of energy fires every ~3 s,
          // so it learnt a 3 s "reload" (the Speedster's is 1 s) and then
          // held its fire (and led for the small guns) that long.
          if (gap > 150 && gap < 4000) A.bigPer = !A.bigPer ? gap : gap < A.bigPer ? A.bigPer * .7 + gap * .3 : Math.min(A.bigPer * 1.02, gap);
          A.lastBigAt = now; A.bigShots++;
        }
        var S = dv.getFloat32(bestO + 20, true), dx = dv.getFloat32(bestO + 12, true), dy = dv.getFloat32(bestO + 16, true);
        // (the biggest gun's speed: its shots are the ones that matter most)
        if (bestD < sh.maxRec * .9) return;
        if (S > 10 && S < 2000) A.speed = S;
        var my = _synStat[me];
        if (!my || now - my.ts > 400) return;
        var v2 = my.vx * my.vx + my.vy * my.vy;
        if (v2 > .04) {
          var kk = Math.max(0, Math.min(1.5, (dx * my.vx + dy * my.vy) / v2));
          A.k = A.kN ? A.k * .7 + kk * .3 : kk; A.kN++;
        }
        if (now - my.ts < 120) {
          var ds = (now - my.ts) / 1000, a = my.angle * Math.PI / 180;
          var rx = wrap(dv.getFloat32(bestO, true) - my.x - my.vx * 60 * ds), ry = wrap(dv.getFloat32(bestO + 4, true) - my.y - my.vy * 60 * ds);
          var fw = rx * Math.cos(a) + ry * Math.sin(a), lat = -rx * Math.sin(a) + ry * Math.cos(a);
          if (Math.abs(lat) < 2.5 && fw > -1 && fw < 8) { A.gun.fwd = A.gun.n ? A.gun.fwd * .8 + fw * .2 : fw; A.gun.n++; }
        }
      };
      // When a command sent now lands: the state's real age (its server time,
      // not when it arrived) plus the round trip. Other ships' states come
      // only when their keys change, and with the keys known the game's
      // physics flies them on exactly, so up to 2.5 s is followed (it was cut
      // at 0.6 s, which put a ship that coasted for a second well behind
      // where it was).
      function lead(s) { return Math.min(2.5, Math.max(0, (synAge(s) + ping()) / 1000)); }
      function own() {
        var me = myId();
        if (me == null) return null;
        var s = _synStat[me];
        if (s && s.alive && Date.now() - s.ts < 500) {
          // where you will be when the shot leaves, and how fast you will be
          // going (the bolt takes a share of that): your ship flown on by the
          // game's physics with the keys being sent now, so RCS off (glide),
          // strafing, braking and knock-back count, not a straight line
          var L = lead(s), w = A.sentWord != null ? A.sentWord : A.flags != null && A.userDeg != null ? A.flags + A.userDeg : null;
          var q = engState({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.angle * Math.PI / 180, aim: (s.steer || 0) * Math.PI / 180, up: !!s.up, code: s.code, glide: s.glide, side: s.side, stun: s.stun }, A.tracks[me]);
          if (w != null) { q.aim = (w % 4096 % 360) * Math.PI / 180; q.up = (w & 4096) !== 0; q.glide = (w & 16384) !== 0; q.side = w & 32768 ? 1 : w & 65536 ? -1 : 0; }
          for (var i = 0, n = Math.max(1, Math.round(L / DT)); i < n; i++) step(4, q, L / n);
          // (and how fast the nose is still turning then, per tick)
          var q1 = copyQ(q); step(4, q1, 1 / 60);
          return { id: me, x: q.x, y: q.y, v: { x: q.vx, y: q.vy }, r: q.r, w: Math.atan2(Math.sin(q1.r - q.r), Math.cos(q1.r - q.r)), s: s };
        }
        var gs = getGS(), st = gs && getMyStatus(gs);
        return st && st.alive !== false ? { id: me, x: st.x, y: st.y, v: { x: 0, y: 0 }, s: null } : null;
      }
      // (for checks: a ship's chosen model and where it puts the ship T s from its last packet)
      A.predict = function(id, T) {
        var s = _synStat[id], tr = A.tracks[id]; if (!s) return null;
        var m = modelOf(tr), q = m === 4 ? engState({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.angle * Math.PI / 180, aim: (s.steer || 0) * Math.PI / 180, up: !!s.up, code: s.code, glide: s.glide, side: s.side || tr && tr.slide || 0, stun: s.stun }, tr) : stateOf(s.x, s.y, s.vx, s.vy, tr ? tr.w : 0, tr ? tr.ac : 0);
        for (var i = 0, n = Math.max(1, Math.round(T / DT)); i < n; i++) step(m, q, T / n);
        return { m: m, e: tr && tr.e.map(function(x) { return +x.toFixed(3); }), x: q.x, y: q.y, vx: q.vx, vy: q.vy, sp: q.sp };
      };
      function onScreen(x, y) {
        var cam = getActiveCamera();
        if (!cam) return true;
        var p = worldToScreenPx(cam, x, y, getGS());
        return !!p && p.x > -20 && p.y > -20 && p.x < innerWidth + 20 && p.y < innerHeight + 20;
      }
      // Enemies we may shoot, with where they are from us.
      function enemies(me) {
        var wm = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode, myTeam = null, out = [], now = Date.now();
        // teammates count in team games only (survival also carries a
        // "friendly" index, the same for everyone)
        if (wm && (wm.id === "team" || Array.isArray(wm.teams) && wm.teams.length > 1)) myTeam = typeof window.__synMyTeam === "number" ? window.__synMyTeam : _aegisTeamOf[me.id];
        var tag = window.__SYN_TAG || "≜ ";
        for (var id in _synStat) {
          var s = _synStat[id];
          if (!s.alive || s.inv || synAge(s, now) > 2500 || s.id === me.id) continue;
          if (typeof myTeam === "number" && _aegisTeamOf[s.id] === myTeam) continue;
          var nm = _aegisNames[s.id];
          if (nm && nm.indexOf(tag) === 0 || window.__synProfiles && window.__synProfiles[s.id]) continue;
          var dx = wrap(s.x - me.x), dy = wrap(s.y - me.y);
          out.push({ s: s, d: Math.hypot(dx, dy), deg: Math.atan2(dy, dx) * 180 / Math.PI });
        }
        return out;
      }
      // The shot at one ship: target moved to fire time by its best model,
      // fired from the gun's spot, rounded to the better whole degree.
      function shotAt(me, s, S, k, exact) {
        var L = lead(s), tr = A.tracks[s.id], m = modelOf(tr);
        // (only the engine model knows the keys; the fitted ones drift off sooner)
        if (m !== 4) L = Math.min(L, 1);
        var q = m === 4 ? engState({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.angle * Math.PI / 180, aim: (s.steer || 0) * Math.PI / 180, up: !!s.up, code: s.code, glide: s.glide, side: s.side || tr && tr.slide || 0, stun: s.stun }, tr) : stateOf(s.x, s.y, s.vx, s.vy, m ? tr.w : 0, m ? tr.ac : 0);
        for (var i = 0, n = Math.max(1, Math.round(L / DT)); i < n; i++) step(m, q, L / n);
        var q0 = copyQ(q), o = { x: me.x, y: me.y }, r = solve(o, me.v, copyQ(q0), m, S, k);
        if (!r) return null;
        var fw = A.gun.n >= 2 ? A.gun.fwd : 0;
        if (fw > .3) {
          o = { x: me.x + Math.cos(r.deg * Math.PI / 180) * fw, y: me.y + Math.sin(r.deg * Math.PI / 180) * fw };
          r = solve(o, me.v, copyQ(q0), m, S, k) || r;
        }
        r.model = m; r.o = o; r.p = { x: q0.x, y: q0.y };
        r.dist = S * (1 - Math.exp(-r.t / 2));
        if (exact) {
          var lo = Math.floor(r.deg), hi = lo + 1;
          r.ideg = (missAt(lo, o, me.v, copyQ(q0), m, S, k) <= missAt(hi, o, me.v, copyQ(q0), m, S, k) ? lo : hi) % 360;
        }
        return r;
      }
      function active() {
        return C.act !== "fire" && A.keyHeld || C.act !== "key" && A.userFire;
      }
      // The speed to lead for: the big gun's, unless the ship also has small
      // guns of another speed and the big gun will not go with the next shot
      // (still reloading, or the bar can not pay for it); then theirs.
      function gunSpeed(now) {
        var S = A.speed || 160;
        if (!A.smallS || Math.abs(A.smallS - S) < 6 || now - A.smallAt > 4000) { A.gunKind = "big"; return S; }
        var e = energyAt(), P = A.pulse;
        var reloaded = !A.bigPer || now - A.lastBigAt >= A.bigPer - 60 - ping() * .5;
        var paid = e == null || e >= A.ship.maxRec * .95;
        var big = P.on || reloaded && paid;
        A.gunKind = big ? "big" : "small";
        return big ? S : A.smallS;
      }
      // Pick, confirm and keep the lock; choose who this shot goes to.
      // Q: lock at once on the enemy nearest the cursor (or, with none on
      // screen, nearest the ship)
      function snapPick(me, list, R) {
        var cam = getActiveCamera(), gs = getGS(), best = null, bd = 1e9;
        list.forEach(function(e) {
          var p = cam && worldToScreenPx(cam, e.s.x, e.s.y, gs);
          if (!p || p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) return;
          var d = Math.hypot(p.x - drag.real.x, p.y - drag.real.y);
          if (d < bd) { bd = d; best = e; }
        });
        if (best) return best;
        list.forEach(function(e) { if (e.d <= R * 1.6 && e.d < bd) { bd = e.d; best = e; } });
        return best;
      }
      function update() {
        var now = Date.now(), me = own(), user = active(), forced = !user && A.forceLock != null ? A.forceLock : null, act = user || forced != null;
        A.aim = null; A.shot = null; A.fire = false; A.lastSolve = null; A.forced = forced != null; A.tlpDeg = null;
        if (user) A.graceUntil = now + 400;
        // (True Laser Path steps in whenever no lock is in play, firing or
        // not, so the nose is already right when the first shot goes)
        function tlp() { try { if (me && forced == null) tlpAim(me, now); } catch (e) { A.tlpDeg = null; } }
        if (!me || A.userDeg == null && forced == null || (!act && now > A.graceUntil)) { A.lock = null; A.cand = null; A.engaged = false; tlp(); return; }
        var S = gunSpeed(now), k = A.kN ? A.k : 1, R = reach(A.speed || 160), list = enemies(me), byId = {};
        list.forEach(function(e) { byId[e.s.id] = e; });
        var L = null;
        if (forced != null) {
          // the autopilot's fight: its target, no confirming
          A.lock = byId[forced] ? forced : null; A.cand = null; L = byId[forced] || null;
        } else {
          // the lock goes when its ship dies, shields up, or is far off
          L = A.lock != null ? byId[A.lock] : null;
          if (A.lock != null && (!L || L.d > R * 2.6 || C.targets === "screen" && !onScreen(L.s.x, L.s.y))) { A.lock = null; L = null; }
          if (C.qsnap && A.keyHeld && C.act !== "fire") {
            if (A.snap || A.lock == null) {
              var sp = snapPick(me, list, R);
              if (sp) { A.lock = sp.s.id; L = sp; A.snap = false; }
            }
            A.cand = null;
          } else {
            // who the cursor (or the screen) offers
            var pick = null, ps = 1e9;
            list.forEach(function(e) {
              var ad = angDiff(e.deg, A.userDeg), sc;
              if (C.targets === "screen") {
                if (!onScreen(e.s.x, e.s.y)) return;
                sc = e.d + ad * .25 + (e.d > R * 1.1 ? 100 : 0);
              } else {
                if (e.d > R * 1.6 || ad > C.cone && e.d > 6) return;
                sc = ad + e.d * .15;
              }
              if (e.s.id === A.lock) sc -= 15;
              if (sc < ps) { ps = sc; pick = e; }
            });
            // confirm: the same ship has to stay picked for the confirm time; a
            // locked ship is only swapped for one the cursor sits on that long
            if (user) {
              var want = pick && pick.s.id !== A.lock ? pick.s.id : null;
              if (A.lock != null && C.targets === "screen") want = null;
              if (want != null) {
                if (A.cand !== want) { A.cand = want; A.candSince = now; }
                if (now - A.candSince >= C.confirm || A.lock == null && C.confirm <= 0) { A.lock = want; A.cand = null; L = byId[want]; }
              } else A.cand = null;
            }
          }
        }
        A.engaged = act && A.lock != null;
        if (!L) { tlp(); return; }
        // the shot: the lock, or while it is out of reach any enemy in reach
        var r = shotAt(me, L.s, S, k, true), shot = L;
        if (r && !r.hit && C.others) {
          var best = null;
          list.forEach(function(e) {
            if (e === L || e.d > R * 1.05) return;
            var rr = shotAt(me, e.s, S, k, false);
            if (rr && rr.hit && (!best || rr.t < best.r.t)) best = { e: e, r: rr };
          });
          if (best) { shot = best.e; r = shotAt(me, best.e.s, S, k, true); }
        }
        if (!r) return;
        A.shot = shot.s.id;
        A.aim = r.ideg;
        // the nose: where the ship will point when this command lands. The
        // window is the target's own hull (three quarters of its radius) as
        // seen from here, so a small ship far off asks for a finer nose.
        var hull = (RAD[shot.s.code] || HULL / .75) * .75;
        var ms = me.s, aligned = false, tol = Math.max(.6, Math.atan2(hull, Math.max(r.dist, 1)) * 180 / Math.PI);
        // ship playbook: Mercury holds its front pulse until the nose is near
        // the middle of the target (3 seeds against a Condor: 8.1 -> 12.6
        // damage/s; the same tried on the Howler and the X-3 lost damage)
        var careful = AIM_CAREFUL[A.ship.code];
        if (careful && (C.autofire === "big" || !need())) tol = Math.max(.6, tol * careful);
        // Where the nose really is when the command lands: our ship flown on
        // in the game's physics with the keys being sent (own()). The nose
        // eases into its last few degrees (a fifth of the gap each tick), so
        // assuming it turns at full rate all the way called shots "aligned"
        // that left while it was still turning, and missed.
        if (me.r != null) aligned = angDiff(me.r * 180 / Math.PI, r.deg) <= tol;
        // Steady shots (from the Duel Pilot's recorded duels: shots that left
        // with the nose still swinging across the target hit 53-73%, steady
        // ones 80-96%): the nose still on the shot 3 ticks on, and had the
        // press landed 6 ticks early (it reaches the server a few ticks
        // either side of when it's meant to); past 10 away, not straight after
        // a swing of 40 deg or more in the last 0.4 s.
        var rh = A.rh || (A.rh = []);
        if (me.r != null) { rh.push({ t: now, r: me.r }); while (rh.length && now - rh[0].t > 600) rh.shift(); }
        if (aligned && C.steady && me.r != null && me.w != null) {
          var wd = me.w * 180 / Math.PI;
          if (angDiff(me.r * 180 / Math.PI + 3 * wd, r.deg) > tol * 1.6 || angDiff(me.r * 180 / Math.PI - 6 * wd, r.deg) > tol * 1.6) { aligned = false; A.steadyHeld = (A.steadyHeld || 0) + 1; }
          else if (r.dist > 10) for (var rk = 0; rk < rh.length; rk++) if (now - rh[rk].t < 400 && angDiff(me.r * 180 / Math.PI, rh[rk].r * 180 / Math.PI) > 40) { aligned = false; A.steadyHeld = (A.steadyHeld || 0) + 1; break; }
        }
        else if (ms) {
          var d = sdiff(r.deg, ms.angle), turn = Math.max(A.my.turn, 40) * lead(ms);
          var face = Math.abs(d) <= turn ? r.deg : ms.angle + (d > 0 ? turn : -turn);
          aligned = angDiff(face, r.deg) <= tol;
        }
        A.fire = fireWanted(r.hit && aligned, now);
        A.lastSolve = { target: shot.s.id, lock: A.lock, deg: r.deg, hit: r.hit, t: r.t, ix: r.x, iy: r.y, px: r.p.x, py: r.p.y, ox: r.o.x, oy: r.o.y, S: S, k: k, model: r.model, aligned: aligned, w: me.w, fw: A.gun.n >= 2 ? A.gun.fwd : 0 };
      }
      // ---- True Laser Path ----
      // With lag the server fires from where your ship really is (ahead of the
      // ship you see, moving), so a bolt aimed by the mouse from the drawn ship
      // flies a parallel line beside the point you aimed at. With no lock in
      // play the point you aim at is taken from the screen: along your aim
      // from the ship you see, as far out as the cursor (within the bolt's
      // reach). The heading is solved as the Aim Assist solves a shot: from
      // your ship as the server will have it when the command lands, with its
      // velocity (the bolt takes a share) and the gun's spot, so the real bolt
      // passes through that point. Spinning, the aim leads by how far the
      // mouse turns before the command lands, so the nose keeps up.
      function tlpAim(me, now) {
        A.tlpWhy = "off";
        if ((localStorage.getItem("AEGIS_truelaser") || "0") !== "1" || A.userDeg == null || !me.s || !inGame()) { A.tlpW = 0; A.tlpPrev = null; return; }
        var tn = performance.now();
        if (A.tlpPrev == null) { A.tlpPrev = A.userDeg; A.tlpPrevT = tn; A.tlpW = 0; }
        else if (A.userDeg !== A.tlpPrev) {
          // (turn rate from the aim's own changes; still for 90 ms = not spinning)
          var wv = sdiff(A.userDeg, A.tlpPrev) / (Math.max(8, tn - A.tlpPrevT) / 1000);
          A.tlpW = (A.tlpW || 0) * .4 + wv * .6; A.tlpPrev = A.userDeg; A.tlpPrevT = tn;
        } else if (tn - A.tlpPrevT > 90) A.tlpW = 0;
        var lead = Math.abs(A.tlpW) > 40 ? Math.max(-30, Math.min(30, A.tlpW * (ping() / 2 + 17) / 1000)) : 0, aDeg = A.userDeg + lead;
        A.tlpWhy = "no view";
        var gs = getGS(), vs = gs && getMyStatus(gs), cam = getActiveCamera();
        if (!vs || typeof vs.x !== "number" || !cam) return;
        var p0 = worldToScreenPx(cam, vs.x, vs.y, gs), p1 = worldToScreenPx(cam, vs.x + 10, vs.y, gs);
        if (!p0 || !p1) return;
        var ppu = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10; if (!(ppu > .01)) return;
        var S = gunSpeed(now), k = A.kN ? A.k : 1, R = reach(A.speed || 160);
        var D = Math.max(12, Math.min(R * .95, Math.hypot(drag.real.x - p0.x, drag.real.y - p0.y) / ppu));
        var a = aDeg * Math.PI / 180, tx = vs.x + Math.cos(a) * D, ty = vs.y + Math.sin(a) * D, deg = aDeg;
        if (Math.hypot(wrap(me.x - vs.x), wrap(me.y - vs.y)) >= .15 || Math.hypot(me.v.x, me.v.y) >= .02) {
          var q = stateOf(me.x + wrap(tx - me.x), me.y + wrap(ty - me.y), 0, 0), o = { x: me.x, y: me.y };
          var r = solve(o, me.v, copyQ(q), 0, S, k);
          if (r) {
            var fw = A.gun.n >= 2 ? A.gun.fwd : 0;
            if (fw > .3) { o = { x: me.x + Math.cos(r.deg * Math.PI / 180) * fw, y: me.y + Math.sin(r.deg * Math.PI / 180) * fw }; r = solve(o, me.v, copyQ(q), 0, S, k) || r; }
            if (Math.abs(sdiff(r.deg, aDeg)) <= 20) deg = r.deg;
          }
        }
        var dd = sdiff(deg, A.userDeg);
        if (Math.abs(dd) < .5) { A.tlpWhy = "on line"; return; }
        A.tlpDeg = ((Math.round(deg) % 360) + 360) % 360;
        A.tlpFix = { dd: dd, lead: lead, D: D, at: now };
        A.tlpWhy = "fixing";
      }
      var AIM_CAREFUL = { 402: .6 };
      // Energy the next full volley needs (the biggest gun with the rest).
      function need() {
        var sh = A.ship;
        if (!sh.maxVol) return 0;
        return sh.genMax > 0 ? Math.min(sh.maxVol, sh.genMax * .97) : sh.maxVol;
      }
      // (projected from the last status by its age and a quarter of the ping,
      // not the whole ping: in a recorded duel the whole ping read 84 while
      // the server had 77-83, and those presses fired the side guns alone)
      function energyAt() {
        var my = A.my;
        if (my.gen == null) return null;
        return Math.min(A.ship.genMax || 1e9, my.gen + (A.ship.regen || 0) * Math.max(0, (Date.now() - my.genTs + ping() * .25) / 1000));
      }
      A.need = need; A.energyAt = energyAt;
      function fireWanted(onTarget, now) {
        var P = A.pulse;
        if (!A.engaged) { P.on = false; return false; }
        if (C.autofire === "off") return A.forced ? onTarget : A.userFire && (!C.gate || onTarget);
        if (C.autofire === "all" || !need()) { P.on = false; return onTarget; }
        // biggest shot: one short press once the bar pays for the volley; let go
        // the moment the nose leaves the target (a press held on would fire
        // the volley wherever the nose had swung to by the time it went)
        if (P.on) {
          if (A.lastBigAt > P.big0) { P.on = false; P.cool = now + 120; }
          else if (!onTarget) { P.on = false; P.cool = now; }
          // (a short press: held on, the side guns come back while the volley's
          // report is still on its way and fire on their own)
          else if (now - P.start > 50) { P.on = false; P.cool = now + ping() + 200; }
          return P.on;
        }
        var e = energyAt();
        if (onTarget && now >= P.cool && e != null && e >= need()) { P.on = true; P.start = now; P.big0 = A.lastBigAt; }
        return P.on;
      }
      function rawSend(n) {
        var ws = A.ws && A.ws.readyState === 1 ? A.ws : window.__synGameWS;
        if (!ws || ws.readyState !== 1) return;
        try { if (window.__synCtlSend) window.__synCtlSend(ws, A.numeric ? n : String(n)); else Object.getPrototypeOf(ws).send.call(ws, A.numeric ? n : String(n)); } catch (e) {}
      }
      function compose() { return (A.flags - (A.flags & 8192)) + (A.fire ? 8192 : 0) + A.aim; }
      function userWord() { return A.flags + A.userDeg; }
      // The autopilot's word (window.__synPilot), when it is flying.
      function pilotWord() { var P = window.__synPilot; return P && P.on && P.alive && P.ctl != null ? P.ctl : null; }
      // What goes out: the autopilot steers; the assist takes the shot whenever
      // it has one (your lock, or the autopilot's fight); null = the game's own.
      function baseWord() {
        var pw = pilotWord();
        if (pw == null) { var dw = duelWord(); if (dw != null) return dw; }
        if (pw == null) return A.engaged && A.aim != null ? compose() : A.tlpDeg != null && A.flags != null ? A.flags + A.tlpDeg : null;
        if (A.engaged && A.aim != null && A.lastSolve && A.lastSolve.hit) return (pw - pw % 4096 - (pw & 8192)) + (A.fire ? 8192 : 0) + A.aim;
        return pw;
      }
      // (a dodge under way takes the movement keys of whatever goes out: your
      // own controls, the assist's aim or the autopilot's)
      function finalWord() {
        var w = baseWord(), P = pilotWord() == null && duelWord() != null ? null : DG.plan || KB.plan;
        if (!P) return w;
        var b = w != null ? w : A.flags != null && A.userDeg != null ? userWord() : statusWord();
        return b == null ? w : dodgeWord(b, P);
      }
      A.finalWord = finalWord;

      // ---- Dodge Assist ----
      // Enemy bolts in flight (type 100 volleys, dropped when they hit
      // something or run out) are followed along the game's laser flight.
      // When one is on course to hit your ship, the ways out are flown ahead
      // in the game's own ship physics from the moment a command sent now
      // reaches the server: thrust across the bolt's path either way, thrust
      // along your nose, the engine off, other headings. The best that clears
      // every bolt in flight is flown until the bolt has gone by; when none
      // clears, the one that gets furthest from them.
      var DG = { inc: [], plan: null, state: "off", why: "", n: 0, miss: 0, at: 0, hitIn: 0 };
      A.dodgeState = DG;
      function foe(id, me) {
        if (id === me) return false;
        var wm = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode, myTeam = null;
        if (wm && (wm.id === "team" || Array.isArray(wm.teams) && wm.teams.length > 1)) myTeam = typeof window.__synMyTeam === "number" ? window.__synMyTeam : _aegisTeamOf[me];
        // (only teammates' bolts are harmless; a Syndicate-tagged player,
        // your own second tab included, hurts like anyone else)
        return !(typeof myTeam === "number" && _aegisTeamOf[id] === myTeam);
      }
      window.__synDodgeVolley = function(b) {
        try { duVolley(b); } catch (e) {}
        if (!C.dodge && !DU.on) return;
        var me = myId();
        if (me == null || b[1] === me || !foe(b[1], me)) return;
        var my = _synStat[me];
        if (!my || !my.alive) return;
        var dv = new DataView(b.buffer, b.byteOffset, b.byteLength), now = Date.now(), t0 = now - ping() / 2;
        for (var o = 8; o + 32 <= b.length; o += 32) {
          if (b[o + 30] === 6) continue;                                        // a healing laser
          var S = dv.getFloat32(o + 20, true), x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true);
          if (!(S > 1) || Math.hypot(wrap(x - my.x), wrap(y - my.y)) > 150) continue;
          // (a bolt has a width: the game draws it in proportion to (damage / 10)^0.75, so
          // a big shot is cleared by its own half-width as well as the hull's radius)
          var dmgB = b[o + 31];
          DG.inc.push({ id: b[o + 24] | b[o + 25] << 8, t0: t0, x: x, y: y, vx: dv.getFloat32(o + 12, true), vy: dv.getFloat32(o + 16, true), a: dv.getFloat32(o + 26, true), S: S, life: laserLife(S) * 1000, dmg: dmgB, r: Math.min(3, .3 * Math.pow(dmgB / 10, .75)) });
        }
        if (DG.inc.length > 120) DG.inc.splice(0, DG.inc.length - 120);
        // (in a tab you are not looking at the browser runs timers only once
        // a second, but messages still arrive: there it runs on them)
        if (document.hidden) try { pump(true); } catch (e) {}
      };
      window.__synDodgeGone = function(id) { for (var i = DG.inc.length - 1; i >= 0; i--) if (DG.inc[i].id === id) DG.inc.splice(i, 1); };
      // where a bolt is at server time T (ms), null once it is spent
      function boltAt(L, T) {
        var a = (T - L.t0) / 1000;
        if (a < 0 || T - L.t0 > L.life) return null;
        var D = L.S * (1 - Math.exp(-a / 2));
        return { x: L.x + Math.cos(L.a) * D + 60 * L.vx * a, y: L.y + Math.sin(L.a) * D + 60 * L.vy * a };
      }
      function statusWord() {
        var me = myId(), s = me != null ? _synStat[me] : null;
        return s && s.alive ? Math.round(s.steer || 0) % 360 + (s.up ? 4096 : 0) : null;
      }
      function ctlOf(w) { return { aim: (w % 4096 % 360) * Math.PI / 180, up: (w & 4096) !== 0, glide: (w & 16384) !== 0, side: w & 32768 ? 1 : w & 65536 ? -1 : 0 }; }
      function planCtl(p, c) {
        if (p.side) return { aim: c.aim, up: p.up != null ? p.up : c.up, glide: false, side: p.side };
        if (p.stop) return { aim: c.aim, up: false, glide: false, side: 0 };
        return { aim: p.ang, up: true, glide: false, side: 0 };
      }
      function dodgeWord(b, p) {
        var deg = b % 4096 % 360, fl = b - b % 4096;
        fl = fl - (fl & 32768) - (fl & 65536) - (fl & 16384);
        if (p.side) { if (p.up != null) fl = fl - (fl & 4096) + (p.up ? 4096 : 0); return fl + (p.side > 0 ? 32768 : 65536) + deg; }
        fl -= fl & 4096;
        if (p.stop) return fl + deg;
        return fl + 4096 + Math.round(((p.ang * 180 / Math.PI) % 360 + 360) % 360) % 360;
      }
      // your ship as the server last told it (with its own keys)
      function ownEng() {
        var me = myId(), s = me != null ? _synStat[me] : null;
        if (!s || !s.alive || Date.now() - s.ts > 600) return null;
        var q = engState({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.angle * Math.PI / 180, aim: (s.steer || 0) * Math.PI / 180, up: !!s.up, code: s.code, glide: s.glide, side: s.side, stun: s.stun }, A.tracks[me]);
        q.T = s.ts - ping() / 2; q.rad = RAD[s.code] || 3;
        return q;
      }
      // Closest any bolt comes to the hull (< 0: a hit) and when, flying
      // `pre` until the command lands at Tc and `post` after.
      function clearance(q0, pre, post, Tc, bolts, end) {
        var q = copyQ(q0), T = q0.T, worst = 1e9, at = 0, set = false;
        q.aim = pre.aim; q.up = pre.up; q.glide = pre.glide; q.side = pre.side;
        while (T < end) {
          if (!set && T >= Tc) { set = true; q.aim = post.aim; q.up = post.up; q.glide = post.glide; q.side = post.side; }
          step(4, q, 1 / 60); T += 1000 / 60;
          for (var i = 0; i < bolts.length; i++) {
            var p = boltAt(bolts[i], T);
            if (!p) continue;
            var d = Math.hypot(wrap(p.x - q.x), wrap(p.y - q.y)) - q.rad - (bolts[i].r || 0);
            if (d < worst) { worst = d; at = T; }
          }
        }
        return { gap: worst, at: at, x: q.x, y: q.y };
      }
      var HIT = .25, SAFE = .9, RELEASE = 1.4;
      function dodgeTick(force) {
        var now = Date.now();
        if (!force && now - DG.at < 30) return;
        DG.at = now;
        if (!C.dodge) { DG.plan = null; DG.state = "off"; if (!DU.on) DG.inc.length = 0; return; }
        if (!inGame()) { DG.plan = null; DG.state = "idle"; DG.inc.length = 0; return; }
        var pg = ping();
        DG.inc = DG.inc.filter(function(L) { return now - L.t0 < L.life + 60; });
        var q0 = ownEng(), w0 = baseWord();
        if (w0 == null && A.flags != null && A.userDeg != null) w0 = userWord();
        if (w0 == null) w0 = statusWord();
        var min = +C.dodgeMin || 0, bolts = DG.inc.filter(function(L) { return L.dmg >= min; });
        if (!q0 || w0 == null) { DG.plan = null; DG.state = q0 ? "watching" : "idle"; return; }
        if (!bolts.length) { if (!evade(q0, now)) { DG.plan = null; DG.state = "watching"; } return; }
        var end = 0;
        bolts.forEach(function(L) { end = Math.max(end, L.t0 + L.life); });
        end = Math.min(end, now + 2500);
        var Tc = now + pg / 2 + 12, c0 = ctlOf(w0), sent = A.sentWord != null ? ctlOf(A.sentWord) : c0;
        var base = clearance(q0, sent, c0, Tc, bolts, end);
        if (base.gap >= HIT) { if (!evade(q0, now)) { DG.plan = null; DG.state = "watching"; } return; }
        DG.hitIn = Math.max(0, base.at - now);
        // a dodge under way goes on while it still clears
        // A dodge under way stops the moment letting go would still clear the
        // bolt with room to spare (checked again every 30 ms on the ship's real
        // state), so the ship only moves as far as it needs to; otherwise it
        // goes on while it still clears.
        if (DG.plan && !DG.plan.ev) {
          if (clearance(q0, sent, c0, Tc, bolts, end).gap >= RELEASE) { DG.plan = null; DG.state = "watching"; return; }
          if (clearance(q0, sent, planCtl(DG.plan, c0), Tc, bolts, end).gap >= .3) { DG.state = "dodging"; return; }
        }
        // the ways out, in order: strafe away from the bolt (keeps the aim),
        // strafe the other way, thrust across its path (the side needing less
        // turn first), the engine off, thrust along the nose
        var hb = null, hd = 1e9;
        bolts.forEach(function(L) { var p = boltAt(L, base.at); if (p) { var d = Math.hypot(wrap(p.x - q0.x), wrap(p.y - q0.y)); if (d < hd) { hd = d; hb = L; } } });
        // (it moves the ship itself out of the way: turn and thrust, or cut the
        // engine; no strafing. The hull it has to clear is the game's own hit
        // circle for the ship, its type radius, whatever way the ship tilts)
        var ba = hb ? hb.a : q0.r, plans = [];
        {
          var a1 = ba + Math.PI / 2, a2 = ba - Math.PI / 2;
          if (Math.abs(sdiff(a1 * 180 / Math.PI, q0.r * 180 / Math.PI)) > Math.abs(sdiff(a2 * 180 / Math.PI, q0.r * 180 / Math.PI))) { var t = a1; a1 = a2; a2 = t; }
          plans.push({ ang: a1 }, { ang: a2 }, { stop: true }, { ang: q0.r });
          // (then every 30 degrees round, nearest the nose first)
          var more = [];
          for (var k = 0; k < 12; k++) more.push(q0.r + k * Math.PI / 6);
          more.sort(function(x, y) { return Math.abs(Math.atan2(Math.sin(x - q0.r), Math.cos(x - q0.r))) - Math.abs(Math.atan2(Math.sin(y - q0.r), Math.cos(y - q0.r))); });
          more.slice(1).forEach(function(x) { plans.push({ ang: x }); });
        }
        // every way out is scored: a clear margin, keeping away from where
        // the bolt came from (closing in makes the next one unescapable),
        // little turning; failing a clear margin, the one that clears by most
        // if it clears at all. (It is let go again as soon as it can be.)
        var pick = null, best = null, bg = .35, ps = -1e9, anyP = null, anyG = base.gap + .2, sx = hb ? hb.x : q0.x, sy = hb ? hb.y : q0.y;
        var d0 = Math.hypot(wrap(q0.x - sx), wrap(q0.y - sy));
        for (var i = 0; i < plans.length; i++) {
          var r = clearance(q0, sent, planCtl(plans[i], c0), Tc, bolts, end), pl = plans[i];
          if (r.gap >= SAFE) {
            var away = Math.hypot(wrap(r.x - sx), wrap(r.y - sy)) - d0;
            var turn = pl.ang != null ? Math.abs(Math.atan2(Math.sin(pl.ang - q0.r), Math.cos(pl.ang - q0.r))) / Math.PI : 0;
            var sc = Math.min(r.gap, 3) + .06 * Math.max(-25, Math.min(25, away)) - .6 * turn;
            if (sc > ps) { ps = sc; pick = pl; }
          } else if (r.gap > bg) { bg = r.gap; best = pl; }
          if (r.gap > anyG) { anyG = r.gap; anyP = pl; }
        }
        if (!pick) pick = best;
        // no clean way out: still fly the one that gets furthest from the bolts
        // (it may clear the side guns' bolts, and next time the ship is moving)
        if (!pick && anyP) { if (DG.state !== "trapped") DG.miss++; DG.plan = anyP; DG.state = "trapped"; DG.why = "best try"; return; }
        if (pick) {
          if (!DG.plan) DG.n++;
          DG.plan = pick; DG.state = "dodging";
          DG.why = (pick.stop ? "engine off" : "thrust " + Math.round(((pick.ang * 180 / Math.PI) % 360 + 360) % 360) + "°");
        } else {
          if (DG.state !== "trapped") DG.miss++;
          DG.plan = null; DG.state = "trapped";
        }
      }
      // Before the shot: an enemy close by with its nose on us. From a standstill
      // a fast bolt fired from close in can't be escaped (a slow-turning ship
      // needs ~0.4 s just to turn across its line), so while an enemy aims at
      // us the ship is kept moving across its line of fire, a little away from
      // it, switching sides every 0.9 to 1.8 s so its lead is wrong; when a
      // bolt comes, the dodge has speed to work with. Not while you fire.
      var EV = { side: 0, until: 0 };
      function aimedBy(me, q0) {
        var best = null, bd = 1e9, now = Date.now();
        for (var k in _synStat) {
          var s = _synStat[k];
          if (!s || !s.alive || s.id === me || now - s.ts > 700 || !foe(s.id, me)) continue;
          var dx = wrap(q0.x - s.x), dy = wrap(q0.y - s.y), d = Math.hypot(dx, dy);
          if (d > 80 || d < 1) continue;
          var err = Math.abs(sdiff(s.angle, Math.atan2(dy, dx) * 180 / Math.PI)), lat = d * Math.sin(Math.min(90, err) * Math.PI / 180);
          if (err < 35 && lat < q0.rad + 9 && d < bd) { bd = d; best = { d: d, a: Math.atan2(dy, dx) }; }
        }
        return best;
      }
      function evade(q0, now) {
        if (C.dodgePre !== true || A.userFire || A.forced) { EV.side = 0; return false; }
        var th = aimedBy(myId(), q0);
        if (!th) { EV.side = 0; return false; }
        if (!EV.side || now > EV.until) {
          if (!EV.side) { var a1 = th.a + Math.PI / 2, a2 = th.a - Math.PI / 2; EV.side = Math.abs(sdiff(a1 * 180 / Math.PI, q0.r * 180 / Math.PI)) <= Math.abs(sdiff(a2 * 180 / Math.PI, q0.r * 180 / Math.PI)) ? 1 : -1; }
          else EV.side = -EV.side;
          EV.until = now + 900 + Math.random() * 900;
        }
        if (!DG.plan || !DG.plan.ev) DG.ev = (DG.ev || 0) + 1;
        DG.plan = { ang: th.a + EV.side * (Math.PI / 2 - .3), ev: true }; DG.state = "evading"; DG.why = "off the line of fire";
        return true;
      }
      // ---- Knockback Recovery ----
      // A hit knocks the ship back: for the knocked-back ticks the server
      // turns and steers nothing (the status packet says how many are left),
      // so the knock itself can't be undone. What can be won is the time after:
      // the moment the server gives control back, the best counter is already
      // there (a command sent now lands half a ping later). The ways back are
      // flown ahead in the game's own ship physics from the knocked state:
      // RCS strafe either way with or without the engine (keeps your aim), the
      // engine along the nose, coasting, and (if allowed and you are not
      // firing) turning to thrust against the drift. The one that brings the
      // ship back to the way it was going before the hit soonest is flown
      // until it is (or 1.5 s); then your controls are yours again.
      var KB = { plan: null, state: "off", why: "", n: 0, act: false, pre: null, tgt: null, end: 0, gain: 0 };
      A.kbState = KB;
      function kbCost(q0, sent, ctl, Tc, tgt, T1) {
        var q = copyQ(q0), T = q0.T, set = false, cost = 0, n = 0;
        q.aim = sent.aim; q.up = sent.up; q.glide = sent.glide; q.side = sent.side;
        while (T < T1) {
          if (!set && T >= Tc) { set = true; q.aim = ctl.aim; q.up = ctl.up; q.glide = ctl.glide; q.side = ctl.side; }
          step(4, q, 1 / 60); T += 1000 / 60;
          if (T >= Tc) { var ex = q.vx - tgt.vx, ey = q.vy - tgt.vy; cost += ex * ex + ey * ey; n++; }
        }
        return n ? cost / n : 0;
      }
      function kbTick() {
        if (!C.kb) { KB.plan = null; KB.act = false; KB.state = "off"; return; }
        var me = myId(), s = me != null ? _synStat[me] : null, now = Date.now();
        if (!inGame() || !s || !s.alive || now - s.ts > 600) { KB.plan = null; KB.act = false; KB.state = "idle"; return; }
        if (!(s.stun > 0) && !KB.act) { KB.pre = { vx: s.vx, vy: s.vy }; KB.state = "watching"; KB.plan = null; return; }
        var q0 = ownEng(); if (!q0) return;
        if (s.stun > 0 && (!KB.act || KB.stun0 < s.stun)) {
          // a (new) knock: aim for the way it was going before
          if (!KB.act) KB.n++;
          KB.act = true; KB.tgt = KB.pre || { vx: 0, vy: 0 }; KB.end = 0; KB.aim0 = A.userDeg != null ? A.userDeg : s.steer;
        }
        KB.stun0 = s.stun || 0;
        var stunMs = (s.stun || 0) * 1000 / 60;
        // (it holds the ship only until control comes back: the counter sent
        // during the knock lands on the first tick you can steer, then your
        // controls are yours)
        if (!(s.stun > 0) && !KB.end) KB.end = now + ping() / 2 + 34;
        if (KB.end && now > KB.end) { KB.act = false; KB.plan = null; KB.state = "watching"; KB.pre = { vx: s.vx, vy: s.vy }; return; }
        var w0 = A.flags != null && A.userDeg != null ? userWord() : statusWord(); if (w0 == null) return;
        // (you steer somewhere new: that is yours, recovery steps aside)
        if (A.userDeg != null && KB.aim0 != null && Math.abs(sdiff(A.userDeg, KB.aim0)) > 45) { KB.act = false; KB.plan = null; KB.state = "watching"; return; }
        var pg = ping(), Tc = now + pg / 2 + 12, c0 = ctlOf(w0), sent = A.sentWord != null ? ctlOf(A.sentWord) : c0, T1 = Math.max(now, q0.T + stunMs) + 900;
        var plans = [ { ang: c0.aim, keep: true }, { stop: true } ];
        if (q0.M.strafe > 0) plans.push({ side: 1, up: true }, { side: 1, up: false }, { side: -1, up: true }, { side: -1, up: false });
        if (C.kbTurn !== false && !A.userFire && !A.engaged) {
          var ea = Math.atan2(KB.tgt.vy - q0.vy, KB.tgt.vx - q0.vx);
          [ 0, .5, -.5 ].forEach(function(o) { plans.push({ ang: ea + o }); });
        }
        var base = kbCost(q0, sent, c0, Tc, KB.tgt, T1), best = null, bc = base * .8;
        plans.forEach(function(p) {
          var c = kbCost(q0, sent, planCtl(p, c0), Tc, KB.tgt, T1);
          if (p.ang != null && !p.keep) c += base * .1 * Math.abs(Math.atan2(Math.sin(p.ang - c0.aim), Math.cos(p.ang - c0.aim))) / Math.PI;
          if (c < bc) { bc = c; best = p; }
        });
        KB.gain = base > 0 ? 1 - bc / base : 0;
        KB.plan = best;
        KB.state = s.stun > 0 ? "knocked" : best ? "recovering" : "watching";
        KB.why = !best ? "your controls are best" : best.side ? "RCS " + (best.side > 0 ? "left" : "right") + (best.up ? " + engine" : "") : best.stop ? "coasting" : best.keep ? "engine" : "thrust against the drift";
      }
      /*DUELCORE{*/
      // The duel brain: what to do this tick, from a plain description of the
      // fight (no game objects), so the same code flies the ship here and in
      // the offline duel simulator. Positions in world units, velocities per
      // 60 Hz tick, angles in radians, energy in the game's units. Everything
      // in the input is already moved on to when a command sent now lands.
      var DuelCore = (function() {
        var PI = Math.PI, TAU = 2 * PI, D2R = PI / 180;
        function sd(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
        function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
        function hy(x, y) { return Math.sqrt(x * x + y * y); }
        function wr(d, h) { if (!(h > 0)) return d; var s = 2 * h; d = ((d % s) + s) % s; return d > h ? d - s : d; }
        // The game's ship physics for one tick (ShipPhysics: the nose eases
        // towards the steering angle, its turn speed smoothed; knocked back it
        // neither turns nor steers and keeps its speed; RCS off (glide) with the
        // engine off it keeps its speed too, slowed only above top speed).
        function phys(q) {
          var dd = sd(q.aim, q.r), st = q.stun > 0;
          if (Math.abs(dd) < 5 * q.turn && !st) { var p = q.r; q.r += .2 * dd; q.w = q.r - p; }
          else { if (!st) q.w = .8 * (q.w || 0) + .2 * q.turn * (dd < 0 ? -1 : dd > 0 ? 1 : 0); q.r += q.w || 0; }
          var sdv = q.strafe > 0 ? q.side || 0 : 0, s = q.top, n = 0, a = 0;
          if (q.up) { n = s * Math.cos(q.r); a = s * Math.sin(q.r); }
          if (sdv) {
            n -= s * Math.sin(q.r) * q.strafe * sdv; a += s * Math.cos(q.r) * q.strafe * sdv;
            var l = hy(n, a); if (l > s) { n = n / l * s; a = a / l * s; }
          }
          var inr = q.up ? q.inr : Math.pow(q.inr, q.fric || 1);
          if (st || !q.up && !sdv && q.glide) {
            if (!st && hy(q.vx, q.vy) > q.top) { q.vx *= inr; q.vy *= inr; }
            if (st) q.stun = Math.max(0, q.stun - 1);
          } else { q.vx = q.vx * inr + n * (1 - inr); q.vy = q.vy * inr + a * (1 - inr); }
          q.x += q.vx; q.y += q.vy;
        }
        function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }
        function life(S) { return S >= 100 ? -2 * Math.log(1 - 63 / S) : 2; }
        // where a bolt is t s after now (null once spent)
        function boltAt(b, t) {
          var tt = b.age + t;
          if (tt < 0 || tt > life(b.S)) return null;
          var D = b.S * (1 - Math.exp(-tt / 2));
          return { x: b.x + Math.cos(b.a) * D + 60 * b.vx * tt, y: b.y + Math.sin(b.a) * D + 60 * b.vy * tt };
        }
        // Closest any bolt comes to the hull flying `ctl` (gap < 0: a hit).
        function clearance(me, ctl, bolts, H, half) {
          var q = copy(me), worst = 1e9, at = 0;
          q.aim = ctl.aim; q.up = ctl.up; q.glide = ctl.glide; q.side = ctl.side || 0;
          for (var k = 1; k <= H; k++) {
            phys(q);
            for (var i = 0; i < bolts.length; i++) {
              var p = boltAt(bolts[i], k / 60);
              if (!p) continue;
              var d = hy(wr(p.x - q.x, half), wr(p.y - q.y, half)) - me.rad - (bolts[i].r || 0);
              if (d < worst) { worst = d; at = k / 60; }
            }
          }
          return { gap: worst, at: at, x: q.x, y: q.y, r: q.r };
        }
        // A straight-line lead (for prefiring at where a ship should be).
        function lead(o, ov, k, p, pv, S) {
          var t = .2;
          for (var i = 0; i < 8; i++) {
            var rx = p.x + pv.x * 60 * t - o.x - ov.x * 60 * k * t, ry = p.y + pv.y * 60 * t - o.y - ov.y * 60 * k * t, d = hy(rx, ry);
            t = d >= S * .999 ? life(S) : -2 * Math.log(1 - d / S);
          }
          var rx2 = p.x + pv.x * 60 * t - o.x - ov.x * 60 * k * t, ry2 = p.y + pv.y * 60 * t - o.y - ov.y * 60 * k * t;
          return { a: Math.atan2(ry2, rx2), t: t, d: hy(rx2, ry2) };
        }
        function create(seed) {
          var s = (seed >>> 0) || 1234567;
          return {
            rnd: function() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; },
            mode: "PRESS", modeAt: -1e9, ev: null, evAt: -1e9, evData: null, glide: null, glideAt: -1e9,
            lastFire: -1e9, fE: null, fEAt: null, foeShotAt: -1e9, foeShots: 0,
            pool: null, reSide: 1, reAt: -1e9, bearing: null, start: null, lastSeen: null, why: [], n: { toggles: 0 }
          };
        }
        // The opponent's energy: exact when the game sends it for them,
        // otherwise estimated: full at first, minus what each of their shots
        // cost (a shot costs its damage), plus their regen.
        function foeEnergy(B, I) {
          var f = I.foe, cap = f.genMax || I.me.genMax, rg = f.regen || I.me.regen;
          if (f.genExact != null) { B.fE = f.genExact; B.fEAt = I.now; B.fEx = true; }
          else {
            B.fEx = false;
            if (B.fE == null) { B.fE = cap; B.fEAt = I.now; }
            B.fE = Math.min(cap, B.fE + rg * Math.max(0, I.now - B.fEAt) / 1000); B.fEAt = I.now;
          }
          (I.foeShots || []).forEach(function(s) {
            // (a shot we did not think they could afford: they had more)
            if (!B.fEx) B.fE = Math.max(0, Math.max(B.fE, s.cost) - s.cost);
            if (s.at > B.foeShotAt) B.foeShotAt = s.at;
            B.foeShots++;
          });
          return B.fE;
        }
        // The gem pool: the densest cluster of gems on the field.
        function poolOf(B, I) {
          var g = I.gems || [], half = I.half, best = null, bn = 0;
          for (var i = 0; i < g.length; i++) {
            var n = 0;
            for (var j = 0; j < g.length; j++) if (hy(wr(g[j].x - g[i].x, half), wr(g[j].y - g[i].y, half)) < 18) n++;
            if (n > bn || n === bn && best && hy(wr(g[i].x - I.me.x, half), wr(g[i].y - I.me.y, half)) < hy(wr(best.x - I.me.x, half), wr(best.y - I.me.y, half))) { bn = n; best = g[i]; }
          }
          if (!best) { if (B.pool && I.now - B.pool.at > 4000) B.pool = null; if (B.pool) B.pool.n = 0; return B.pool; }
          var sx = 0, sy = 0, c = 0, ss = 0;
          for (var k = 0; k < g.length; k++) {
            var dx = wr(g[k].x - best.x, half), dy = wr(g[k].y - best.y, half);
            if (hy(dx, dy) < 18) { sx += dx; sy += dy; c++; }
          }
          var cx = best.x + sx / c, cy = best.y + sy / c;
          for (var m = 0; m < g.length; m++) { var ex = wr(g[m].x - cx, half), ey = wr(g[m].y - cy, half), e2 = ex * ex + ey * ey; if (e2 < 400) ss += e2; }
          B.pool = { x: cx, y: cy, n: c, r: Math.max(7, Math.sqrt(ss / c) * 1.4), at: I.now };
          return B.pool;
        }
        // Turn a wanted velocity and a facing into the keys: thrust along the
        // nose when the velocity needs fixing, otherwise face where we want to
        // (the enemy or the shot) and coast: RCS off keeps the speed (glide),
        // RCS on brakes.
        function drive(B, I, vd, face, o) {
          var me = I.me, ex = vd.x - me.vx, ey = vd.y - me.vy, err = hy(ex, ey), top = me.top, sp = hy(me.vx, me.vy), vdl = hy(vd.x, vd.y);
          var thr = Math.atan2(ey, ex), out = { aim: face, up: false, glide: B.glide, side: 0 };
          // (with RCS on, coasting brakes: fix the velocity sooner)
          var lim = (I.rcs ? .3 : .2) * top;
          // (SP.dh/dT, against jitter: a burn, once begun, goes on until the
          // velocity is within dh of the limit or dT ms have passed, and a
          // coast lasts dT ms unless the error doubles. Without it the engine
          // and the nose flipped every ~95 ms between the burn heading and
          // the enemy: in recorded duels 4-6 thrust toggles a second up close
          // (60% of burns under 150 ms), the human players 0.75-1.8.)
          var SPd = B.SPd || {}, Dv = B.drv || (B.drv = { on: false, at: -1e9 }), burn = err > lim;
          if (SPd.dT) {
            burn = Dv.on ? err > lim * (SPd.dh || 1) || I.now - Dv.at < SPd.dT : err > lim && (I.now - Dv.at >= SPd.dT || err > 2 * lim);
            if (burn !== Dv.on) { Dv.on = burn; Dv.at = I.now; }
          }
          if (o.hold) {
            // a shot is wanted: the nose stays on it; thrust only when that
            // also fixes the velocity, otherwise coast (RCS off keeps the speed)
            out.aim = face;
            out.up = burn && Math.cos(sd(face, thr)) > .6;
            if (!out.up) out.glide = !!I.rcs && !(sp > vdl + .3 * top && vdl < .4 * top);
            else out.glide = B.glide;
          } else if (burn) {
            var h = thr;
            // never show the side to a shot that can come: thrust headings
            // within 60 degrees of facing them or of showing the back
            if (o.guard) {
              var bf = o.bearing, d1 = sd(h, bf), d2 = sd(h, bf + PI), dd = Math.abs(d1) < Math.abs(d2) ? d1 : d2, base = Math.abs(d1) < Math.abs(d2) ? bf : bf + PI;
              if (Math.abs(dd) > 60 * D2R) h = base + (dd > 0 ? 60 : -60) * D2R;
            }
            out.aim = h;
            out.up = Math.abs(sd(me.r, h)) < 50 * D2R && Math.cos(sd(h, thr)) > .3;
            // (engine on: the RCS state does nothing now and is left as it is)
          } else {
            out.aim = face;
            // keep the speed while it is what we want; brake when too fast
            out.glide = !!I.rcs && !(sp > vdl + .25 * top && vdl < .5 * top);
            out.slow = sp > vdl + .25 * top && vdl < .5 * top;
          }
          // strafing modes: slide across while the nose stays on the face
          if (I.strafe > 0 && o.side) { out.side = o.side; out.aim = face; out.up = false; out.glide = false; }
          B.dbg = (o.hold ? "H" : burn ? "T" : "C") + " err=" + (err / top).toFixed(2) + " vd=" + (vdl / top).toFixed(2) + " dn=" + Math.round(sd(me.r, out.aim) / D2R);
          return out;
        }
        // The matchup, from both ships' real specs (dueling mods ship several
        // Speedsters: heavier, more agile, faster): who is heavier, turns
        // better, is faster, and the style that suits it.
        //   BRAWL    heavier: bumps, ram contact, knockback, push them out
        //   SKIRMISH lighter or more agile: no contact, side-step, kite, counter
        //   ROAM     faster: own the pool by mobility, re-enter often, punish pickups
        //   ANCHOR   slower: hold the pool, prefire, save energy, counter
        //   DUEL     even
        var STYLES = {
          DUEL:     { dwA: 36, dwP: 15, dwR: 57, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 1, avoid: 0, reM: 14, reD: 28, poolW: 1.2, poke: .45, adv: 0, pre: 1.6 },
          BRAWL:    { dwA: 30, dwP: 0, dwR: 50, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 2, avoid: 0, reM: 14, reD: 28, poolW: 1.2, poke: .45, adv: .25, pre: 1.6 },
          SKIRMISH: { dwA: 44, dwP: 27, dwR: 60, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 0, avoid: 1, reM: 14, reD: 30, poolW: 1, poke: .4, adv: -.1, pre: 1.6 },
          ROAM:     { dwA: 40, dwP: 15, dwR: 58, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 1, avoid: 0, reM: 6, reD: 18, poolW: 1.7, poke: .45, adv: .1, pre: 1.6 },
          AGILE:    { dwA: 32, dwP: 15, dwR: 55, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 1, avoid: 0, reM: 14, reD: 28, poolW: 1.2, poke: .5, adv: 0, pre: 1.6 },
          ANCHOR:   { dwA: 32, dwP: 15, dwR: 50, bs: 16, ev: 14, evA: 1, evT: .35, sg: 6, rw: 500, aj: 6, cl: 1, clV: 25, clM: .25, clL: 1, kbT: 1, kbL: 14, kbC: 4, kbA: 1.5, rch: 3, bt: 1, sl: 40, slW: 80, bsS: 10, kg: 3, tS: 400, slQ: 1, tC: 10, dT: 250, dh: .5, gT: 1, gF: 1, tA: 1, tAg: 70, clA: 8, clAll: 1, fMin: 115, rcK: 1, fR: 32, lsP: .75, wD: 28, cut: 1, cutE: 1, cutM: .6, bump: 1, avoid: 0, reM: 8, reD: 22, poolW: 2.4, poke: .6, adv: 0, pre: 1.25 }
        };
        function tagOf(a, b) {
          var t = [], mr = a.mass / b.mass, tr = a.turn / b.turn, vr = a.top / b.top;
          if (mr > 1.15) t.push("HEAVY"); else if (mr < .87) t.push("LIGHT");
          if (tr > 1.15) t.push("AGILE");
          if (vr > 1.08) t.push("FAST"); else if (vr < .93) t.push("SLOW");
          return t.length ? t.join("+") : "EVEN";
        }
        // (a duel is normally the same variant on both sides: then the
        // variant itself sets the style, against the dueling mod's maxed
        // Legacy-Speedster, the one played: mass 175, rotation 80 (0.12 rad a
        // tick), speed 115 (0.46 a tick))
        var BASE = { mass: 175, turn: .12, top: .46 };
        // the dueling mod's two official Speedsters: A-Speedster ("NEW") and
        // Legacy-Speedster ("LEGACY", lighter, a little slower, turns less)
        function vtag(sp) { var n = String(sp && sp.name || ""); return /legacy/i.test(n) ? "LEGACY" : /speedster/i.test(n) ? "NEW" : null; }
        function matchup(I) {
          var a = I.me.spec, b = I.foe.spec;
          if (!a || !(a.mass > 0)) return { style: "DUEL", me: "?", foe: "?" };
          if (!b || !(b.mass > 0)) b = a;
          var mr = a.mass / b.mass, tr = a.turn / b.turn, vr = a.top / b.top;
          if (Math.abs(mr - 1) < .08 && Math.abs(tr - 1) < .08 && Math.abs(vr - 1) < .06) {
            var ar = a.mass / BASE.mass, at = a.turn / BASE.turn, av = a.top / BASE.top, v = "BASE", s0 = "DUEL";
            if (ar > 1.25) { v = "HEAVY"; s0 = "BRAWL"; } else if (at > 1.2) { v = "AGILE"; s0 = "AGILE"; } else if (av > 1.1) { v = "FAST"; s0 = "ROAM"; }
            v = vtag(a) || v;
            return { style: s0, me: v, foe: v, mirror: true };
          }
          // (NEW against LEGACY: heavier, so BRAWL; LEGACY against NEW: lighter, so SKIRMISH)
          var st = mr > 1.15 ? "BRAWL" : mr < .87 || tr > 1.15 ? "SKIRMISH" : vr > 1.08 ? "ROAM" : vr < .93 ? "ANCHOR" : "DUEL";
          return { style: st, me: (vtag(a) ? vtag(a) + " " : "") + tagOf(a, b), foe: (vtag(b) ? vtag(b) + " " : "") + tagOf(b, a) };
        }
        // ---- adapting to this opponent (SP.ad) ----
        // Some choices win against one kind of player and lose against
        // another (in the simulator, holding the spill after a body shot:
        // 63% v 50% against the rusher, 34% v 52% against the pilot itself;
        // the nose on the gems while taking them: 22% v 47% and 50% v 45%).
        // So at each such moment the pilot tries one way or the other, scores
        // it by the health swing over the next 2.5 s (shield + gems, theirs
        // taken off ours), and leans to what works against this opponent;
        // recent results count most, so it follows them if they change.
        var ADMEM = {}, ADM = ADMEM;
        function adStat(key) { return ADM[key] || (ADM[key] = { on: { n: 0, m: 0 }, off: { n: 1, m: 5 } }); }
        // (SP.ad: the moves it may vary, SP.adK, default rl,nw,bs,pn,bk:
        //   rl  touching them, their shot first and their gun loaded: hold off
        //       instead of 'ram it off us'
        //   nw  their shot first, ours not ready: keep pressing instead of waiting
        //   bs  a bump shot on: just shoot instead
        //   pn  their gun 0.45 s+ off: go in for the body shot from up to 22
        //   bk  they're stunned and ours is empty: take the gems, don't ram
        // "on" is the variation, "off" the usual move. One pick holds for 1.2 s,
        // and is scored by the health swing over the next 2.5 s.)
        function adHas(SP, key) { return !!SP.ad && ("," + (SP.adK || "rl,nw,bs,pn,bk") + ",").indexOf("," + key + ",") >= 0; }
        function adOn(B, SP, key, now, d0) {
          if (!adHas(SP, key)) return false;
          var A = B.adA || (B.adA = {}), a = A[key];
          if (!a || now - a.t > 1200) a = A[key] = { t: now, arm: adPick(B, key, now, d0) };
          return a.arm === "on";
        }
        function adPick(B, key, now, d0) {
          var st = adStat(key), g = function() { var u = 1 - B.rnd(), v = B.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); };
          var son = st.on.m + g() * 90 / Math.sqrt(st.on.n + 1), soff = st.off.m + g() * 90 / Math.sqrt(st.off.n + 1), arm = son > soff ? "on" : "off";
          (B.adP = B.adP || []).push({ key: key, arm: arm, t: now, d0: d0 });
          return arm;
        }
        function adSettle(B, now, d) {
          if (!B.adP) return;
          B.adP = B.adP.filter(function(p) {
            if (now - p.t < 2500) return true;
            var r = Math.max(-400, Math.min(400, d - p.d0)), a = adStat(p.key)[p.arm];
            a.n = a.n * .9 + 1; a.m += (r - a.m) / a.n;
            return false;
          });
        }
        function adInfo() { var o = []; for (var k in ADMEM) o.push(k + " " + Math.round(ADMEM[k].on.m) + "/" + Math.round(ADMEM[k].off.m)); return o.join(" "); }
        function tick(B, I) {
          var me = I.me, f = I.foe, now = I.now, half = I.half || 1e9, why = [];
          var cost = I.shot.cost, S = I.shot.S, reach = S >= 100 ? 63 : S * (1 - Math.exp(-1)), top = me.top;
          var dx = wr(f.x - me.x, half), dy = wr(f.y - me.y, half), dist = hy(dx, dy), bear = Math.atan2(dy, dx), rr = me.rad + f.rad;
          var E = me.gen, cap = me.genMax, fE = foeEnergy(B, I), gemLead = (me.crystals || 0) - (f.crystals || 0);
          var gunR = me.gunReadyIn <= 20, canFire = gunR && E >= cost * .995 && !(me.stun > 0);
          var foeGunR = f.gunReadyIn <= 80, foeCan = foeGunR && fE >= cost * .97 && !(f.stun > 0);
          // (their nose on us: how far off, and whether a shot from them now would land)
          var fBear = Math.atan2(-dy, -dx), fErr = Math.abs(sd(f.r, fBear)) / D2R, fLat = dist * Math.sin(Math.min(90, fErr) * D2R);
          var aimedAt = fErr < 30 && fLat < me.rad + 6 && dist < reach * 1.05;
          var imminent = foeCan && aimedAt;
          var P = poolOf(B, I), pd = P ? hy(wr(P.x - me.x, half), wr(P.y - me.y, half)) : 0, fpd = P ? hy(wr(P.x - f.x, half), wr(P.y - f.y, half)) : 0;
          if (B.start == null) B.start = now;
          if (B.glide == null) B.glide = !!me.glide;
          // ---- who is ahead: energy (in shots), stun, shield, gems ----
          var MU = matchup(I), SP = STYLES[MU.style]; ADM = I.adMem || ADMEM;
          if (I.tune) { var SPc = {}; for (var kk in SP) SPc[kk] = SP[kk]; for (var kt in I.tune) SPc[kt] = I.tune[kt]; SP = SPc; }
          // (SP.fSG: a stunned ship's gun still fires; only its nose is stuck.
          // v HEAVENLY (17 Nov, 0-11) he fired 85 of his 332 volleys while
          // stunned and hit 33, 12 of 27 right after a contact; after the
          // pilot drove into him with his bar up, his shot came a median
          // 78 ms after the touch (43 of 81 such contacts went to him, 13 to
          // the pilot): it read his stun as "can't shoot" and rammed on. So
          // stunned with the bar up and the nose within fSG deg of us
          // (35 by default) counts as loaded)
          var fArm = !!SP.fSG && f.stun > 0 && foeGunR && fE >= cost * .97 && fErr < (SP.fSG > 1 ? SP.fSG : 35) && dist < reach * 1.05;
          if (fArm) foeCan = true;
          B.SPd = SP;
          var adv = SP.adv + (SP.wE != null ? SP.wE : .45) * cl((E - fE) / cost, -2, 2) + (f.stun > 0 ? 1.1 : 0) - (me.stun > 0 ? .4 : 0) +
            (SP.wS != null ? SP.wS : 1.6) * (me.shield / me.shieldMax - f.shield / f.shieldMax) + (SP.wG != null ? SP.wG : .3) * cl(gemLead / 15, -1.5, 1.5) + (gunR ? .15 : 0) - (foeGunR ? .15 : 0);
          // (decision variants: SP.wH, the whole health lead (shield + gems)
          // in 300s; SP.wT, whose big gun is back first, in seconds)
          if (SP.wH) adv += SP.wH * cl(((me.shield || 0) + (me.crystals || 0) - (f.shield || 0) - (f.crystals || 0)) / 300, -1.5, 1.5);
          if (SP.wT) adv += SP.wT * cl(Math.max(0, cost - fE) / Math.max(1, f.regen || 45) + (f.stun > 0 ? f.stun / 60 : 0) - Math.max(me.gunReadyIn / 1000, Math.max(0, cost - E) / Math.max(1, me.regen || 45)), -1, 1);
          var m = B.mode, dwell = now - B.modeAt > 450;
          // Aggressive by default: PRESS (charge, bump, shove them out of the
          // pool) unless behind; ATTACK when somewhat behind; RETREAT only when
          // clearly losing (energy, shield and gems all against us).
          if (dwell) {
            var aP = SP.aP != null ? SP.aP : -.2, aA = SP.aA != null ? SP.aA : -.75, aR = SP.aR != null ? SP.aR : -1.6, aX = SP.aX != null ? SP.aX : -.8;
            if (m === "ATTACK" && adv > aP) m = "PRESS";
            else if (m === "PRESS" && adv < aA) m = "ATTACK";
            else if (m === "ATTACK" && adv < aR) m = "RETREAT";
            else if (m === "RETREAT" && adv > aX) m = "ATTACK";
          }
          if (m !== B.mode) { B.mode = m; B.modeAt = now; }
          why.push(m === "PRESS" ? "ahead " + adv.toFixed(1) : m === "RETREAT" ? "behind " + adv.toFixed(1) : "even " + adv.toFixed(1));
          // ---- re-enter the pool when out of it with gems in it ----
          var reenter = P && P.n >= 3 && pd > P.r + SP.reM && m !== "RETREAT" && dist > SP.reD && !(f.stun > 0) && !(m === "PRESS" && fpd < P.r + 30);
          // (faster: their pickups are punished, a pressing chance when they sit in the pool)
          if (MU.style === "ROAM" && P && fpd < P.r && m === "ATTACK" && E >= cost && dwell) { m = B.mode = "PRESS"; B.modeAt = now; }
          if (reenter && B.state !== "REENTER") { B.reSide = B.rnd() < .5 ? -1 : 1; B.reAt = now; }
          // ---- incoming bolts ----
          var bolts = I.bolts || [], ctl0 = me.ctl || { aim: me.r, up: false, glide: B.glide, side: 0 }, threat = null;
          // ---- where their shots pass us (SP.bt) ----
          // Each of their big lasers is followed to its closest pass, and
          // where it crossed the hull is noted: ahead of the nose, behind the
          // tail, or over the middle. In the recorded duels players shooting
          // at the pilot side-on missed ahead of its nose 47 times and behind
          // it 12 (they aim at the cockpit, which lets lasers through);
          // NO MERCY BOT, the pilot itself and the simulator's players aim
          // at the centre and don't.
          var BT = B.bt || (B.bt = { seen: {}, f: 0, b: 0, m: 0 });
          if (SP.bt) {
            var btNow = {};
            bolts.forEach(function(b) {
              if ((b.r || 0) < 1) return;
              var k = Math.round(b.x * 4) + ":" + Math.round(b.y * 4) + ":" + Math.round(b.a * 50), p = boltAt(b, 0);
              btNow[k] = 1; if (!p) return;
              var ex = wr(p.x - me.x, half), ey = wr(p.y - me.y, half), d = hy(ex, ey), sb = BT.seen[k] || (BT.seen[k] = { d: d, al: 0, done: false });
              if (sb.done) return;
              if (d < sb.d) { sb.d = d; sb.al = ex * Math.cos(me.r) + ey * Math.sin(me.r); }
              else if (d > sb.d + 1.5) { sb.done = true; if (sb.d < 7) { if (sb.al > 2.2) BT.f++; else if (sb.al < -2.8) BT.b++; else BT.m++; } }
            });
            for (var bk in BT.seen) if (!btNow[bk]) { var sb2 = BT.seen[bk]; if (!sb2.done && sb2.d < 7) { if (sb2.al > 2.2) BT.f++; else if (sb2.al < -2.8) BT.b++; else BT.m++; } delete BT.seen[bk]; }
          }
          // (they aim at the cockpit: at least 6 passes ahead of the nose, and
          // twice as many there as behind the tail)
          var baitOn = !!SP.bt && BT.f >= 6 && BT.f >= 2 * (BT.b + 1);
          if (bolts.length && !(me.stun > 0)) {
            var c0 = clearance(me, ctl0, bolts, 55, half);
            if (c0.gap < .4) threat = c0;
          }
          // a bolt on course: the ways out, flown ahead (across it either way,
          // forward or back at an angle, coasting, braking); one that clears
          // with room and keeps the nose near them is flown; none: brace for
          // it just before it lands (and keep weaving until then)
          var dplan = null, hb = null;
          if (!threat) B.dodge = null;
          if (threat) {
            var hd = 1e9;
            bolts.forEach(function(b) { var p = boltAt(b, threat.at); if (p) { var d = hy(wr(p.x - me.x, half), wr(p.y - me.y, half)); if (d < hd) { hd = d; hb = b; } } });
            var ba0 = hb ? hb.a : bear, plans = [];
            [90, -90, 60, -60].forEach(function(o) { plans.push({ aim: ba0 + o * D2R, up: true, glide: B.glide, side: 0 }); });
            plans.push({ aim: me.r, up: false, glide: !!I.rcs, side: 0, coast: 1 }, { aim: me.r, up: false, glide: false, side: 0, brake: 1 }, { aim: me.r, up: true, glide: B.glide, side: 0 });
            if (I.strafe > 0) plans.push({ aim: ctl0.aim, up: false, glide: false, side: 1 }, { aim: ctl0.aim, up: false, glide: false, side: -1 });
            var bs = -1e9;
            // (a dodge under way is kept while it still clears: no dithering between ways out)
            if (B.dodge && now - B.dodge.at < 1200) {
              var keep = B.dodge.p, ck = clearance(me, keep, bolts, 55, half);
              if (ck.gap >= .3) { dplan = { p: keep, c: ck }; bs = 1e9; }
            }
            var tryP = null, tryG = threat.gap + (SP.tryGain != null ? SP.tryGain : .6);
            if (!dplan) plans.forEach(function(p) {
              var c = clearance(me, p, bolts, 55, half), sc = Math.min(c.gap, 3) * 2;
              if (c.gap > tryG) { tryG = c.gap; tryP = { p: p, c: c, partial: true }; }
              if (c.gap < .6) return;
              sc += 1.1 * Math.cos(sd(c.r, bear));
              if (P) sc -= .02 * hy(wr(P.x - c.x, half), wr(P.y - c.y, half));
              sc -= .02 * Math.abs(hy(wr(f.x - c.x, half), wr(f.y - c.y, half)) - 30);
              if (sc > bs) { bs = sc; dplan = { p: p, c: c }; }
            });
            // (no clean way out: the one that gets furthest from it, if that is
            // much further than going on; the margin here is generous, so it
            // often still clears)
            if (!dplan && tryP && !SP.noTry) dplan = tryP;
          }
          var state = m, out = null, vd = { x: 0, y: 0 }, weave = false, guard = foeCan && dist < reach * 1.15, fireOk = true;
          // ---- the shot first: the nose goes where the shot is ----
          var aim = I.aim, aRad = aim ? aim.deg * D2R : null, tol = Math.max(.8, Math.atan2(f.rad * .55, Math.max(dist, 1)) / D2R) * D2R;
          // (SP.tC: never wider than tC deg, however close. Up close the
          // target fills more of the view and the margin grew past 20 deg;
          // in a 29-minute session the pilot's close shots hit 85 of 89 with
          // the nose under 10 deg off, 10 of 16 at 14-20, 19 of 35 at 20+.)
          // (SP.tCc: at touch range, under 9, the cap is tCc instead. Over the
          // recorded duels the pilot's shots from under 8 hit 88% at 10-14 deg
          // off and 71% at 14-18; against FIGHT OR DIE it touched them loaded,
          // free and 6-16 deg off 8 times without firing.)
          if (SP.tC) tol = Math.min(tol, (SP.tCc && dist < 9 ? SP.tCc : SP.tC) * D2R);
          // (the nose as it will be when the command lands, on the shot now and
          // still on it 3 ticks on: never a volley that leaves while the nose
          // swings through them)
          // (and still on it had the shot left SP.aj ticks early: the press
          // reaches the server a few ticks either side of when it's meant to,
          // and a turning nose is that far off. In the recorded duels the
          // pilot's shots after a turn of 60 deg or more in the last 300 ms
          // hit 68-73%, the players' 86-96%. The margin is in nose angle, so
          // the turn speed allowed scales with how wide the target is: about
          // 0.09 rad a tick at 10, 0.03 at 30.)
          var aligned = !!aim && Math.abs(sd(me.r, aRad)) * .8 <= tol && Math.abs(sd(me.r + 3 * (me.w || 0), aRad)) * .8 <= tol * 1.3 &&
            Math.abs(sd(me.r - (SP.aj || 0) * (me.w || 0), aRad)) * .8 <= tol * 1.3 &&
            (!SP.wG || Math.abs(me.w || 0) < SP.wG || Math.abs(sd(me.r, aRad)) < 5 * D2R);
          // (SP.tS: not past 10 while the nose has swung more than 40 deg in
          // the last tS ms. 1.3.30-1.3.32 v YILING and FIGHT OR DIE: shots after
          // a 90+ deg turn in 300 ms hit 53-67%, 15 deg or less 80-85%; the
          // slant and slide swing the nose off them and back)
          var rh = B.rh || (B.rh = []); rh.push({ t: now, r: me.r }); while (rh.length && now - rh[0].t > 600) rh.shift();
          // (SP.tSo: not while their gun is up and on us: v FIGHT OR DIE
          // (21:01) it was loaded, nose 2-9 deg on, settled, held because the
          // nose had swung 72-92 deg in the 0.3 s before, and was shot first
          // (1084, 1106, 1116, 1223 s). SP.tSw: settled once it turns under
          // tSw rad a tick, whatever the swing before)
          if (SP.tS && aligned && dist > 10 && !(SP.tSo && foeCan && fErr < 25) && !(SP.tSw && Math.abs(me.w || 0) < SP.tSw && Math.abs(sd(me.r, aRad)) < tol)) { for (var rk = 0; rk < rh.length; rk++) if (now - rh[rk].t < SP.tS && Math.abs(sd(me.r, rh[rk].r)) > 40 * D2R) { aligned = false; break; } }
          // the chance it lands: a hull of radius R against a spread that grows
          // with the flight time and with how well their path has been
          // predicted lately (perr: miss 0.4 s ahead), 1 - e^(-R^2 / 2 s^2)
          var pHit = 0;
          if (aim && aim.hit) {
            // (coasting, engine off, they go straight: a surer shot)
            var sg = (.5 + (f.perr != null ? f.perr : 2) * Math.pow(aim.t / .4, 1.3)) * (f.up === false && !(f.stun > 0) ? (SP.coastK || .7) : 1), R = f.rad + .5;
            // (SP.hbR: the hull's real width across the laser. Over ~2,200
            // replayed shots a laser passing 2-3 from the centre hit 78% of
            // side-on hulls and 20% of nose- or tail-on ones (3-4: 25% v 2%):
            // nose-on it is ~2.2 wide each side, side-on ~3, not rad + .5)
            if (SP.hbR) R = SP.hbR * (2.3 + .9 * Math.abs(Math.sin(f.r - aim.deg * D2R)));
            pHit = 1 - Math.exp(-R * R / (2 * sg * sg));
          }
          // A person dodges a long shot: in a real duel (recorded) the pilot's
          // shots from 32 or closer all landed, from 38 on only 8 of 17. Past
          // ~0.28 s of flight the chance falls to half by 0.45 s (not when
          // they're stunned for the whole flight).
          var downAll = aim && aim.hit && f.stun > aim.t * 60;
          if (aim && aim.hit && !downAll && aim.t > .28) pHit *= Math.max(SP.lsF || .65, 1 - (aim.t - .28) / .17 * .35);
          if (downAll) pHit = Math.max(pHit, .95);
          var overcap = E + me.regen * .35 >= cap - .5;
          var counter = now - B.foeShotAt < 380 && B.foeShotAt > B.lastFire;
          // closing speed (units a second, + = coming at us)
          var closing = dist > .01 ? -((f.vx - me.vx) * dx + (f.vy - me.vy) * dy) / dist * 60 : 0;
          // The full volley as soon as the big gun is ready, if the shot is
          // good enough for how the fight stands (no spacing shots out).
          var needP = m === "PRESS" ? .35 : m === "ATTACK" ? .45 : .6;
          if (f.stun > 0 || counter) needP = Math.min(needP, .25);
          if (overcap) needP = Math.min(needP, .15);
          // Out-time them: up close with their gun ready, shoot first: the
          // knock spoils their shot (the recording: the pilot let a player
          // shoot first at point blank while it held a full bar)
          var outTime = dist < 32 && foeGunR && fE >= cost * .9 && !(f.stun > 0);
          if (outTime) needP = Math.min(needP, .25);
          // (SP.bLn: both loaded at 15-30, the bar goes down to bLn: in the
          // players' duel (Wiktor v Noto, 22 min) they fired 54% of the time
          // there and held 16% (fire +31..+34 over the next 2 s, hold -54);
          // the pilot held 47% and fired 24%)
          if (SP.bLn && foeGunR && fE >= cost && dist >= 15 && dist < 30) needP = Math.min(needP, SP.bLn);
          // Long shots (over ~0.3 s of flight) only when they're sure or free:
          // they knock little, are easy to dodge, and spend the bar the close
          // fight needs. Not while they're coming in (keep the shot for when
          // they arrive) unless the bar is full anyway.
          var longShot = aim && aim.hit && aim.t > .3 && !downAll;
          if (longShot) {
            var tArrive = Math.max(0, dist - 20) / Math.max(8, closing);
            var backInTime = E - cost + me.regen * tArrive >= cost;
            // (SP.lsP: in that session its shots from 35 on missed 25 of 80,
            // and a miss leaves the gun empty as they come in)
            // (SP.lsO: the bar for a long shot when the bar is full anyway;
            // v YILING at 19:02, 9 of 13 shots from 35+ missed, several only
            // because the bar was full)
            needP = Math.max(needP, overcap ? (SP.lsO || .4) : (SP.lsP || .5));
            if (!overcap && closing > 12 && dist < 50 && !backInTime) needP = 2;
          }
          // (SP.lsE: their gun is empty, so there's no hurry: close in rather
          // than shoot from past lsE. Spectated NND v ZΣX: the shooters were
          // 13-15 from the spill when the hit landed, the pilot 25; hit from
          // far, an empty victim took back 54% of its own spill)
          if (SP.lsE && !overcap && !downAll && dist > SP.lsE && fE < (f.cost || cost) * .9) needP = 2;
          // (SP.chH: up close, not into an empty foe charging straight at us.
          // The knock adds ~13 u/s along the shot to whatever speed they had,
          // so one coming in at 20 still drifts back over its own spill. Over
          // the recorded duels, close hits on a foe coming at the shooter: the
          // shooter took 47% of the spill, the victim 36%; moving away: 70%
          // v 16%. 49% of the pilot's close hits were on a foe coming at it,
          // ZΣX's and Noto's 29-31%.)
          if (SP.chH && aim && aRad != null && dist < 18 && !overcap && !(f.stun > 0) && !foeCan && (f.vx * Math.cos(aRad) + f.vy * Math.sin(aRad)) * 60 < -SP.chH) needP = 2;
          if (dist < 15 && !(fE >= (f.cost || cost) && !(f.stun > 0))) needP = Math.min(needP, .15);
          // (SP.dn: deny the pickup. Their gun empty, a fresh spill (under
          // 1.4 s old) within 14 of them: shoot now on a lower bar, before
          // they're on it. v FIGHT OR DIE (21:01) with the pilot loaded and
          // them empty it fired before their first pickup 12 times of 50
          // (they kept 138 gems) and after it 37 (they kept 2,221); its shot
          // came at a median 1.34 s, their pickup 1.05 s. Theirs, the other
          // way round: 27 of 50 before.)
          if (SP.dn && !(fE >= (f.cost || cost)) && !(f.stun > 0) && (I.gems || []).some(function(g) { return g.age != null && g.age < 1.4 && hy(wr(g.x - f.x, half), wr(g.y - f.y, half)) < 14; })) needP = Math.min(needP, SP.dn);
          var goodShot = !!(aim && aim.hit) && pHit >= needP;
          // pre-aim: the nose is on the shot by the time the gun is ready
          var turnT = aRad != null ? Math.abs(sd(me.r, aRad)) / (me.turn * 60) + .1 : 0, readyT = Math.max(me.gunReadyIn / 1000, (cost - E) / Math.max(1, me.regen));
          var preAim = goodShot && !(me.stun > 0) && readyT <= turnT + .3;
          // They're stunned (knocked back: no steering, no shooting). Double
          // shot when our gun is back before the stun ends: hold the nose on
          // them and fire the moment it's ready, which stuns them again and
          // pushes them further. If it won't be back in time, ram them: the
          // contact keeps them stunned (and spills their gems) while our gun
          // and energy come back.
          var foeDown = f.stun > 3 && !(me.stun > 0) && !fArm;
          // the gem nearest us (within 35, and not nearer them)
          var gemNear = null, gnd = 1e9;
          (I.gems || []).forEach(function(g) {
            var a1 = hy(wr(g.x - me.x, half), wr(g.y - me.y, half)), a2 = hy(wr(g.x - f.x, half), wr(g.y - f.y, half));
            if (a1 < 35 && a1 < a2 * 1.2 && a1 < gnd) { gnd = a1; gemNear = g; }
          });
          var dblSoon = foeDown && E + me.regen * readyT >= cost && readyT <= f.stun / 60 + .06;
          if (dblSoon) preAim = true;
          // ---- shot priority: whose big shot comes first ----
          // (a strong duellist shoots when theirs is ready and, while the other
          // has the shot, takes gems and waits for their turn: in a recorded
          // duel one took 106 gems while behind on the shot and 37 while ahead)
          var fCost = f.cost || cost, fReg = f.regen || me.regen;
          var foeT = f.stun > 0 && !fArm ? f.stun / 60 + .1 : Math.max(f.gunReadyIn / 1000, (fCost - fE) / Math.max(1, fReg));
          var myT = me.stun > 0 ? Math.max(readyT, me.stun / 60) : readyT;
          // (a stunned foe counts too: after our double their stun ends while
          // our gun is still empty, and their bar is full. In a recorded duel
          // both sides took ~1.6 hits in the 3 s after landing a double.)
          // (only when their shot is near: up to 1.2 s it held back for most of
          // every reload after a trade, and read as passive)
          var theyLead = foeT + .3 < myT && foeT < .6;
          // ---- the health race: gems are health ----
          // In the dueling mod a hit takes the shield first and the rest from
          // the gems (720 at the start); the gems lost spill where the ship was
          // hit and a pickup adds its value back; out of gems, the ship dies.
          // So shield + gems is health, and every gem on the floor is health
          // for whoever takes it. (A tester: "it had gems beside it, on 30
          // gems, and went after me.")
          var myHP = (me.shield || 0) + (me.crystals || 0), fHP = f.crystals > 0 ? (f.shield || 0) + f.crystals : null;
          var adD = myHP - ((f.shield || 0) + (f.crystals || 0));
          if (SP.ad) adSettle(B, now, adD);
          var lethal = fHP != null && fHP <= cost * .95;
          var heal = null, healV = 0, healW = -1e9;
          (I.gems || []).forEach(function(g) {
            var gx = wr(g.x - me.x, half), gy = wr(g.y - me.y, half), a1 = hy(gx, gy); if (a1 > 30) return;
            var a2 = hy(wr(g.x - f.x, half), wr(g.y - f.y, half)); if (a1 > a2 * .9) return;
            // (a spilled gem can't be taken for its first ~0.95 s: only ones
            // that will be ready when we get there)
            if (g.age != null && g.age + a1 / Math.max(.1, top * 60) < .95) return;
            // in front of their gun while it is up: not worth the shot
            var off = Math.abs(sd(Math.atan2(wr(g.y - f.y, half), wr(g.x - f.x, half)), f.r));
            if (foeT < .4 && off < .45 && a2 < 40) return;
            var V = 0; (I.gems || []).forEach(function(h) { if (hy(wr(h.x - g.x, half), wr(h.y - g.y, half)) < 7) V += h.v || 1; });
            var w = V / (a1 + 8);
            if (w > healW) { healW = w; heal = g; healV = V; }
          });
          // Heal when low (under 300 of ~1020) and it's safe: no shot of our
          // own, and theirs is 0.6 s off or they're far. Wider rules (any gems
          // worth 8+, or cheap pickups beside us) were tried in the simulator
          // with the real health model: more time collecting, no more gems,
          // fewer wins (49-50% v 54% against 1.3.10 over 150 rounds).
          var lowHP = myHP < 300;
          // ---- claim the spill ----
          // In a recorded duel (sisyphus ai v a player, 2-8) the pilot landed
          // 67 more hits (292 v 225, 86% v 79%) and lost on gems: 10,363 v
          // 18,673. Of what its hits spilled it took 32% and the player took
          // back 48%; of what the player's hits spilled the player kept 66%.
          // The player follows the shot onto the gems (5-9 away when they
          // can be taken, even after shots from 20-30); the pilot was 17-26
          // away, firing from range. So: fresh gems (spilled in the last
          // 2.5 s), worth SP.clV or more, that we reach no later than them
          // (+SP.clM s): go and take them, shooting on the way when the shot
          // is there. Not into their loaded gun with ours empty up close.
          var claimG = null, claimV = 0, claimLead = 0, claimAge = 9;
          if (SP.cl && (!(me.stun > 0) || SP.spS)) {
            var topS = Math.max(1, top * 60), claimW = -1e9;
            // (SP.clA: gems up to clA s old, not only fresh spills; SP.clAll:
            // a pile's worth counts all its gems. Owner: it took the less
            // valuable pile; v Noto, 10 of 113 gem runs passed a pile worth
            // 1.5x+ as near and ours first, e.g. 52 gems 24 away over 82 at 5:
            // the 82 were more than 2.5 s old, so they didn't count)
            var clA = SP.clA || 2.5;
            (I.gems || []).forEach(function(g) {
              if (g.age == null || g.age > clA) return;
              var a1 = hy(wr(g.x - me.x, half), wr(g.y - me.y, half)); if (a1 > 45) return;
              var a2 = hy(wr(g.x - f.x, half), wr(g.y - f.y, half));
              // (or later than them, if we get there loaded with their gun
              // still empty: their pickup becomes our close shot)
              var tMe = a1 / topS + (me.stun > 0 ? me.stun / 60 : 0), tFo = a2 / topS + (f.stun > 0 ? f.stun / 60 : 0);
              // (SP.spV: a ship flying away from the gems first has to stop
              // and turn: its speed away, over top speed, times spV seconds)
              if (SP.spV && a2 > 1) { var fTow = (f.vx * wr(g.x - f.x, half) + f.vy * wr(g.y - f.y, half)) / a2 * 60; if (fTow < 0) tFo += -fTow / topS * SP.spV; }
              if (tMe > tFo + SP.clM && !(SP.clL && myT < .15 && foeT > tMe + .2)) return;
              var V = 0; (I.gems || []).forEach(function(h) { if ((SP.clAll || h.age != null && h.age <= clA) && hy(wr(h.x - g.x, half), wr(h.y - g.y, half)) < 7) V += h.v || 1; });
              if (V < SP.clV) return;
              var w = V / (a1 + 8);
              // (SP.clH: the gem we were already going for counts clH times:
              // in a real duel a third of the nose's reversals came in CLAIM,
              // 2.8 a second, the pick flipping between gems of a ring)
              if (SP.clH && B.clPrev && hy(wr(g.x - B.clPrev.x, half), wr(g.y - B.clPrev.y, half)) < 2) w *= SP.clH;
              if (w > claimW) { claimW = w; claimG = g; claimV = V; claimLead = tFo - tMe; claimAge = g.age; }
            });
            B.clPrev = claimG ? { x: claimG.x, y: claimG.y } : null;
            if (claimG && !(f.stun > 0) && foeT < .2 && !canFire && dist < (SP.clR || 25) && !(SP.clF && claimLead > SP.clF)) claimG = null;
          }
          var wantHeal = heal && lowHP && !lethal && !(me.stun > 0) && !canFire && (foeT > .6 || dist > 40);
          // ---- what to do, by situation (measured on real duels) ----
          // From 3 recorded duels, every 0.25 s scored by the health swing over
          // the next 2 s (shield + gems, theirs taken off ours), by who is
          // loaded, the distance and gems near (avg; players' sample sizes):
          //  only us loaded:   <15 fire +39..+48, holding the shot -266 (the
          //                    pilot: -158); 15-30 push in +34 / fire +36;
          //                    30+ fire +29..44 or collect +27, push in -10..-30
          //  only them loaded: push in -32..-59 everywhere; 15-30 back off +44 /
          //                    hold +35
          //  both empty, gems near: collect +12..+28 (back off / hold / push in
          //                    -16..-35)
          //  both loaded:      fire when it's there; 15-30 without a shot back
          //                    off +14 / hold +10, push in -18
          var loadedMe = canFire, loadedFoe = (!(f.stun > 0) || fArm) && foeT < .2;
          // (the "hold tight under 15" row, +207, was tried and left out: at
          // that range "distance unchanged" is mostly ships tangled after a
          // bump, so it says little about what to choose, and in the
          // simulator it cost fights: 44% v 49% won against 1.3.11)
          var holdTight = false;
          var holdOff = !SP.nH && loadedFoe && loadedMe && dist >= 15 && dist < 30 && !goodShot && !SP.avoid;
          // (collecting: in those duels the pilot already took gems about as
          // often as the players, ~60% of the time with both empty and gems
          // near; forcing more of it lost fights. Where it differed: it held a
          // loaded shot up close 28% of the time (players 4%), rammed a loaded
          // enemy, and fired 9% of the time loaded at range with gems near
          // (players 30%).)

          // ---- events first: contact knockback, a bump, a dodge ----
          var contact = dist - rr;
          // ---- the bump shot: in loaded, the shot at the touch ----
          // In a recorded duel the player got to contact with their shot ready
          // 26 times (fired at the touch 20, hit 18), the pilot 4: it fired as
          // soon as it was loaded, from further out (from 30+: 12 of 22 hit).
          // With only us loaded and close, it closes in and holds the shot for
          // the touch: it lands surer, and shot plus bump send them further.
          // Only while we get there before their gun is back.
          var fAway = dist > .01 ? (f.vx * dx + f.vy * dy) / dist * 60 : 0, topU = top * 60;
          var tC = Math.max(0, contact - 2) / Math.max(2, (closing + topU - Math.max(0, fAway)) / 2);
          // (SP.pnR, owner: they've just missed from mid range and ours is
          // ready: go in for the body shot from up to pnR away, while we'd
          // touch them 0.25 s before their gun is back; if they recover in
          // time this stops holding and it just shoots, keeping the priority)
          var pnRv = SP.pnR;
          if (SP.ad && ("," + (SP.adK || "rl,nw,bs,pn,bk") + ",").indexOf(",pn,") >= 0 && foeT > .45 && canFire && !(f.stun > 0) && dist < 35) pnRv = adOn(B, SP, "pn", now, adD) ? (SP.pnR || 22) : 0;
          var pnOn = !!pnRv && foeT > .45, bsR = pnOn ? Math.max(SP.bs || 0, pnRv) : SP.bs, bsT = pnOn ? Math.min(1.2, foeT - .25) : .6;
          var bsGo = !!SP.bs && canFire && !(me.stun > 0) && !(f.stun > 0) && !lethal && !SP.avoid && contact > (SP.kbC != null ? SP.kbC : 2.6) && contact < bsR &&
            tC < bsT && foeT > tC + (B.bsAt && now - B.bsAt < 900 ? .05 : pnOn ? .25 : .2);
          // (SP.ad bs: against some players the plain shot does better)
          if (bsGo && !pnOn && adOn(B, SP, "bs", now, adD)) bsGo = false;
          if (bsGo) { if (!(B.bsAt && now - B.bsAt < 900)) B.bsAt = now; } else B.bsAt = 0;
          // ---- cut them off on the way to the gems ----
          // (in a recorded duel, with them running for fresh gems, their gun
          // empty and ours loaded within 25, the pilot shot every time, from
          // ~13 away, and never closed in; one of ten was point blank.) When
          // they're heading for fresh gems with their gun empty, and we get
          // to those gems no later than them (+0.4 s) loaded: go to the gems
          // and take the shot at the touch (pushes them off, we're on them).
          // (SP.cutE: also with our gun empty, if it's back no later than
          // theirs: then it's a body block, ram them off the pile. In a
          // recorded duel every gem run the pilot could have cut off came with
          // its own gun empty, and the player was the one who got there; with
          // the pilot under 0.4 s behind them it took 11% of those gems, the
          // player 64%. SP.cutM: how far behind them it may start, s.)
          var cutG = null;
          if (SP.cut && (canFire || SP.cutE && myT <= foeT + .1) && !(me.stun > 0) && !(f.stun > 0) && !lethal && !SP.avoid && dist < (SP.cutR || 35)) {
            // (SP.cuA: older gems count for a cut too, up to cuA s; owner: more
            // cuts. v Noto at 14:55 it cut 12 times in 4.5 min, 1% of the time)
            (I.gems || []).forEach(function(g) {
              if (g.age == null || g.age > (SP.cuA || 2.5)) return;
              var gx = wr(g.x - f.x, half), gy = wr(g.y - f.y, half), gd = hy(gx, gy); if (gd > 25 || gd < 2) return;
              var tow = (f.vx * gx + f.vy * gy) / gd * 60; if (tow < (SP.cutT || 8)) return;
              // (not gems that lie on their way to us: that's a charge, not a gem run)
              if (Math.abs(sd(Math.atan2(gy, gx), Math.atan2(-dy, -dx))) < (SP.cutA != null ? SP.cutA : 1)) return;
              var tMe = hy(wr(g.x - me.x, half), wr(g.y - me.y, half)) / Math.max(1, topU), tFo = gd / Math.max(8, tow);
              if (tMe > tFo + (SP.cutM != null ? SP.cutM : .4) || foeT < tMe + .1) return;
              if (!cutG || gd < cutG.gd) cutG = { g: g, gd: gd, t: tMe };
            });
          }
          // ---- hold the spill (SP.spH, the Duel Pilot switch) ----
          // After our hit lands (their stun starts within 0.7 s of our shot),
          // for 1.6 s: the nose on the gems it spilled and hovering on them,
          // instead of ramming them while they're down. In the recorded
          // duels the strong players did this after their body shots: v the
          // pilot, Noto kept the nose on the spill (52-62%), thrust held, and
          // took 68-79% of those gems; the pilot, nose-on to them, 38-54%.
          // The simulator scores the ram higher (its spill races aren't
          // real enough), so this is a switch to try in real duels.
          var spillG = null;
          // (the older adaptive pair, spH and clN, only when SP.adK names them)
          if (SP.spH || adHas(SP, "spH") || SP.sL) {
            if (f.stun > 0 && !(B.fStun0 > 0) && now - (B.lastFire || 0) < 700) { B.spAt = now; B.spArm = adHas(SP, "spH") ? adPick(B, "spH", now, adD) : "on"; }
            B.fStun0 = f.stun;
            if (B.spAt && now - B.spAt < 1600 && B.spArm === "on") {
              var sgx = 0, sgy = 0, sgv = 0;
              (I.gems || []).forEach(function(g) { if (g.age == null || g.age > 1.8) return; var gx = wr(g.x - me.x, half), gy = wr(g.y - me.y, half); if (hy(gx, gy) > 20) return; var v = g.v || 1; sgx += gx * v; sgy += gy * v; sgv += v; });
              if (sgv >= (SP.clV || 25)) spillG = { x: me.x + sgx / sgv, y: me.y + sgy / sgv, v: sgv };
            }
          }
          // ---- their ram while only they're loaded: out of its line ----
          // In the recorded duels the pilot took 7 bumps a minute with only the
          // enemy loaded (the players: ~3), moving into them in 20 of 25. The
          // bumped ship is stunned twice as long (39 ticks v 20), and the
          // loaded one shoots it while it can't move: every hit the pilot took
          // on a stunned hull came 100-270 ms after a bump, and each knocked it
          // 33-41 units (a first hit: 5-10). So no ramming a loaded enemy;
          // with them coming in nose on us, sidestep their line (on every
          // ram it lost to the rusher in the simulator: 31-42% v 49%).
          var evade = !!SP.ev && loadedFoe && !canFire && !(me.stun > 0) && !SP.avoid && contact > 1.5 && contact < SP.ev && closing > 6 && contact / closing < .7 && contact / closing >= (SP.evT || 0) && (!SP.evA || aimedAt);
          // ms since our own stun ended (the nose is still swinging back)
          if (me.stun > 0) B.stunEnd = now;
          var recov = B.stunEnd > 0 ? now - B.stunEnd : 1e9;
          if (me.stun > 0 && SP.spS && claimG && claimAge < SP.spS && !loadedFoe) {
            // (stunned after our body shot: the nose on the spill, not on
            // them, so we're pointed at the gems when it ends)
            state = "CLAIM"; gemNear = claimG;
            why.unshift("stunned " + Math.round(me.stun) + "t: nose on the spill");
          } else if (me.stun > 0) {
            state = B.mode;
            why.unshift("stunned " + Math.round(me.stun) + "t: nose back on them");
          // (SP.kbC: how near the touch, in units between the hulls; 2.6 until
          // 1.3.25. Over a 25-minute duel v Noto, Noto's touch shots left
          // from under 8 (79 to the pilot's 48) and the pilot's from 8-12
          // (115 to 64): arriving, not touching. At 0.8, in the simulator
          // with the measured hull: 70-71% v 59-60%, better against all
          // three opponents and more of each spill taken.)
          } else if (contact < (SP.kbC != null ? SP.kbC : 2.6) + Math.max(0, closing) * Math.min(.12, (I.lag || .1) * .5) && canFire) {
            // (early by what we close while the press is on its way: the shot
            // has to leave at the touch, not after it)
            state = "KNOCKBACK";
            why.unshift("contact: shoot now");
          } else if (threat && (dplan || threat.at < .3) && !(SP.bump && contact < 9 && imminent) && !(canFire && goodShot && aligned)) {
            // (a good volley ready on the nose goes first: trade, don't flinch)
            state = "DODGE";
          } else if (evade) {
            state = "EVADE";
            why.unshift("they're loaded and ramming: off their line (" + Math.round(contact / closing * 1000) + " ms to contact)");
          } else if (SP.kd && loadedFoe && !canFire && myT > foeT + .2 && dist < SP.kd && !(f.stun > 0) && !(me.stun > 0)) {
            // (SP.kd: our gun empty, theirs loaded, and close: make space. In a
            // recorded round v MIXCANIX it took 8 of 8 touch shots this way:
            // the pilot had fired 1-1.8 s before (49-81 energy), sat 6-13
            // from them, and they charged in loaded at 16-21 a second; from
            // that close the contact came in under 0.3 s, too soon for the
            // sidestep. Owner's notes: up close, prone to bumps and knockback.)
            state = "SPACE";
            why.unshift("making space: their gun is loaded, ours back in " + Math.round(myT * 1000) + " ms");
          } else if (SP.sL && claimG && B.spAt && now - B.spAt < SP.sL * 1000 && claimAge < SP.sL + .3 && !(loadedFoe && contact < 6)) {
            // (SP.sL, from the players: after their clean short hits Wiktor
            // and Noto stayed on the spill until it could be taken and kept
            // 76-88% of it; the pilot pressed, shoved, rammed or shot again
            // in 60% of that time and kept 50-62%. So for sL s after our hit
            // lands, the spill comes before anything but a dodge or their ram)
            state = "CLAIM"; gemNear = claimG;
            why.unshift("on our spill: " + Math.round(claimV) + " gems");
          } else if (spillG && !(loadedFoe && contact < 6) && (!(SP.spH >= 2) || f.stun > 0 || !loadedFoe && foeT > (SP.spH >= 3 ? .4 : .15))) {
            state = "SPILL";
            why.unshift("holding the spill: " + Math.round(spillG.v) + " gems");
          } else if (cutG) {
            state = "CUT";
            why.unshift("cutting them off at the gems: shot at the touch (there in " + Math.round(cutG.t * 1000) + " ms)");
          } else if (bsGo) {
            state = "BUMPSHOT";
            why.unshift("bump shot: in loaded, fire at the touch (there in " + Math.round(tC * 1000) + " ms, their gun " + Math.round(foeT * 1000) + ")");
          } else if (SP.spP && claimG && claimAge < SP.spP) {
            // (a fresh spill we can get to first goes before ramming them)
            state = "CLAIM"; gemNear = claimG;
            why.unshift("claiming the spill: " + Math.round(claimV) + " gems");
          } else if (SP.bkC && foeDown && !canFire && !dblSoon && gemNear && (!SP.bkL || theyLead) && (function() {
              // (SP.bkC, owner: once they've been knocked about enough and we
              // have no shot left (gun empty, no double shot coming), pick up
              // the gems rather than keep ramming: a pile of at least bkC
              // fresh gems by the nearest one, while they're down. SP.bkL:
              // only when their gun is back first anyway, the next shot theirs)
              var v = 0; (I.gems || []).forEach(function(h) { if (h.age != null && h.age <= 3 && hy(wr(h.x - gemNear.x, half), wr(h.y - gemNear.y, half)) < 8) v += h.v || 1; });
              return v >= SP.bkC;
            })()) {
            state = "COLLECT";
            why.unshift("they're down " + Math.round(f.stun) + "t and the spill is big: taking the gems");
          } else if (foeDown && !canFire && !dblSoon && contact < 8 && (!theyLead || contact < 3) && !SP.avoid && !(gemNear && adOn(B, SP, "bk", now, adD)) &&
            // (SP.nbS: not when their gun is back by the time their stun ends
            // (+nbS s): v Noto (12:23, lost 2-5) 11 of his 63 body shots came
            // right after the pilot rammed him while he was stunned, and 21
            // within 0.4 s of a bump; the pilot's gun was empty for 60 of them)
            !(SP.nbS && foeT < f.stun / 60 + SP.nbS)) {
            state = "BUMP";
            why.unshift("they're stunned " + Math.round(f.stun) + "t: ram to keep them down");
          } else if (foeDown && !dblSoon && gemNear && !theyLead) {
            // knocked back, they can't come for the gems: take them
            state = "COLLECT";
            why.unshift("they're knocked back " + Math.round(f.stun) + "t: taking the gems");
          } else if (claimG) {
            state = "CLAIM"; gemNear = claimG;
            why.unshift("claiming the spill: " + Math.round(claimV) + " gems");
          } else if (SP.dsm && !canFire && !(f.stun > 0) && !(me.stun > 0) && foeT > .03 && foeT < SP.dsm && myT > foeT && contact < (SP.dsmR || 10) &&
            Math.abs(Math.sin(f.r - Math.atan2(-dy, -dx))) > .6) {
            // (SP.dsm, owner: disarm. Their gun is back first, within dsm s,
            // and their side is to us: ram it nose-first. A nose into a
            // shoulder stunned the shoulder 35-40 ticks and the nose 8-12 in
            // the recorded duels, so their shot waits and ours comes back.
            // v YILING (19:02) it was close, empty, with their side to it and
            // their shot due, and was shot.)
            state = "BUMP";
            why.unshift("disarm: their gun back in " + Math.round(foeT * 1000) + " ms, side to us: ram it");
          } else if (holdTight || holdOff) {
            state = "HOLD";
            why.unshift(holdTight ? "they're loaded, we're not, up close: hold tight (backing off or pushing in loses here)" : "both loaded, no shot yet: hold the gap, don't charge into theirs");
          } else if (wantHeal) {
            state = "COLLECT"; gemNear = heal;
            why.unshift((lowHP ? "low on health (" + Math.round(myHP) + "): " : "") + "taking " + Math.round(healV) + " gems" + (fHP != null ? " (health " + Math.round(myHP) + " v " + Math.round(fHP) + ")" : ""));
          } else if (SP.bump > 1 && contact < 7 && !canFire && !foeDown && !loadedFoe ||
            (m === "PRESS" || m === "ATTACK" && myT + .1 < foeT) && !SP.avoid && contact < 14 && !canFire && !dblSoon && !theyLead && !loadedFoe ||
            theyLead && !(f.stun > 0) && !SP.avoid && !canFire && contact < 1.5 && !(loadedFoe && (SP.rmL || adOn(B, SP, "rl", now, adD)))) {
            // (only when our gun is back no later than theirs: rammed while
            // they're loaded, we're the one stunned and shot. Already touching
            // with their shot first: nothing to lose, ram. SP.rmL: not when
            // their gun is loaded: v ZEX, 3 of his 7 body shots came while the
            // pilot was ramming him with his gun up.)
            state = "BUMP";
            why.unshift(theyLead ? "their shot first and they're on us: ram it off us" : "ram them: our gun is back first");
          } else if (theyLead && !canFire && m !== "RETREAT" && !(SP.nW || adOn(B, SP, "nw", now, adD))) {
            // (SP.nW: no waiting, it keeps pressing even with their shot first)
            // their shot first: don't walk into it; take gems off their nose
            // and come back when ours is ready
            state = "WAIT";
            why.unshift((f.stun > 0 ? "after our shots: they're up in " : "their shot first (") + Math.round(foeT * 1000) + " ms v ours " + Math.round(myT * 1000) + (f.stun > 0 ? ": off their nose, taking gems" : "): taking gems, off their nose"));
          } else if (reenter) state = "REENTER";
          // ---- where to be ----
          if (state === "DODGE") {
            // ways out, flown ahead: across the bolt either way, forward or
            // back at an angle, coasting, braking; the one that clears with
            // room and keeps the nose near them wins; none clears: brace
            var ba = hb ? hb.a : bear, best = dplan;
            if (best && (!B.dodge || B.dodge.p !== best.p)) B.dodge = { p: best.p, at: now };
            if (best) {
              out = { aim: best.p.aim, up: best.p.up, glide: best.p.glide, side: best.p.side, brake: best.p.brake, coast: best.p.coast };
              why.unshift(best.p.side ? "side-step (RCS strafe)" : best.p.up ? "side-step " + Math.round(((best.p.aim - ba) / D2R + 540) % 360 - 180) + "°" : best.p.coast ? "coast clear (RCS off)" : "brake clear (RCS on)");
              fireOk = !!best.p.side;
            } else {
              // counter knockback: RCS off, engine off, take it near-parallel:
              // face the shooter a little off line, or show the back
              var h1 = ba + PI + .26 * (sd(me.r, ba + PI) >= 0 ? 1 : -1), h2 = ba;
              out = { aim: Math.abs(sd(me.r, h1)) <= Math.abs(sd(me.r, h2)) + .3 ? h1 : h2, up: false, glide: !!I.rcs, side: 0, coast: 1 };
              why.unshift("brace: RCS off, nose along the bolt");
              // (facing the shooter is near-parallel too: the shot back may go)
              fireOk = I.aim && Math.abs(sd(I.aim.deg * D2R, ba + PI)) < 25 * D2R;
              if (fireOk) out.aim = I.aim.deg * D2R;
              state = "DODGE"; B.brace = now;
            }
          } else if (state === "WAIT") {
            // the best gem near us that isn't in front of their gun; none: a
            // spot ~28 out, well off their nose, on the side we're already on
            var gw = null, gws = -1e9;
            (I.gems || []).forEach(function(g) {
              var a1 = hy(wr(g.x - me.x, half), wr(g.y - me.y, half)); if (a1 > 45) return;
              var gfx = wr(g.x - f.x, half), gfy = wr(g.y - f.y, half), a2 = hy(gfx, gfy), off = Math.abs(sd(Math.atan2(gfy, gfx), f.r));
              var sc = -a1 / 10 - (off < .5 && a2 < 40 ? 3 : 0) - (a2 < 12 ? 2 : 0);
              // (SP.wD: their shot first, so not gems within wD of them: v
              // FIGHT OR DIE (21:01), empty with them loaded, the pilot moved
              // toward them 71% of the time (they, the other way round, 51%)
              // and from 12-45 that cost 0.31-0.47 of their hits a second)
              if (SP.wD && foeT < .3 && a2 < SP.wD) sc -= SP.wP || 4;
              if (sc > gws) { gws = sc; gw = g; }
            });
            var wx, wy;
            if (gw) { wx = wr(gw.x - me.x, half); wy = wr(gw.y - me.y, half); }
            else {
              var side0 = sd(Math.atan2(-dy, -dx), f.r) >= 0 ? 1 : -1, wa = f.r + side0 * 1.7;
              wx = wr(f.x + Math.cos(wa) * 28 - me.x, half); wy = wr(f.y + Math.sin(wa) * 28 - me.y, half);
            }
            var wl = hy(wx, wy) || 1;
            wx /= wl; wy /= wl;
            // (SP.wD: inside wD with their gun up, not closing in: what takes
            // us toward them is swapped for across)
            if (SP.wD && foeT < .3 && dist < SP.wD && dist > 8) {
              var tw = (wx * dx + wy * dy) / Math.max(dist, .01);
              if (tw > 0) { wx -= tw * dx / dist; wy -= tw * dy / dist; var wl2 = hy(wx, wy); if (wl2 < .2) { var sg2 = sd(Math.atan2(-dy, -dx), f.r) >= 0 ? 1 : -1; wx = -dy / dist * sg2; wy = dx / dist * sg2; } else { wx /= wl2; wy /= wl2; } why.push("not closing in on their loaded gun"); }
            }
            // their gun up (or nearly) and their nose on us: not straight
            // there, across their line first (straight in or out is easy to lead)
            var fmx = wr(me.x - f.x, half), fmy = wr(me.y - f.y, half), fml = hy(fmx, fmy) || 1, offN = sd(Math.atan2(fmy, fmx), f.r);
            if (foeT < .3 && Math.abs(offN) < .55) {
              var sg = offN >= 0 ? 1 : -1, px = -fmy / fml * sg, py = fmx / fml * sg;
              wx = wx * .5 + px; wy = wy * .5 + py; wl = hy(wx, wy) || 1; wx /= wl; wy /= wl;
              why.push("across their line");
            }
            vd.x = wx * top; vd.y = wy * top;
          } else if (state === "HOLD") {
            vd.x = f.vx; vd.y = f.vy;
            var hmx = wr(me.x - f.x, half), hmy = wr(me.y - f.y, half), hml = hy(hmx, hmy) || 1, hoff = sd(Math.atan2(hmy, hmx), f.r);
            if (Math.abs(hoff) < .5) { var hs = hoff >= 0 ? 1 : -1; vd.x += -hmy / hml * hs * top * .6; vd.y += hmx / hml * hs * top * .6; why.push("off their nose"); }
          } else if (state === "SPACE") {
            // away at an angle, to the side away from their nose (kept 0.6 s),
            // the tail to them
            var axx = -dx / Math.max(dist, .01), axy = -dy / Math.max(dist, .01), offK = sd(Math.atan2(-dy, -dx), f.r);
            if (!(B.kdAt && now - B.kdAt < 600)) { B.kdSide = Math.abs(offK) < .08 ? (B.rnd() < .5 ? -1 : 1) : offK > 0 ? 1 : -1; B.kdAt = now; }
            var kca = Math.cos(.6), ksa = Math.sin(.6) * B.kdSide, kvx = axx * kca - axy * ksa, kvy = axx * ksa + axy * kca;
            vd.x = kvx * top; vd.y = kvy * top;
          } else if (state === "SPILL") {
            // onto the gems and hover there, nose on them
            var spx = wr(spillG.x - me.x, half), spy = wr(spillG.y - me.y, half), spl = hy(spx, spy) || 1, spa = Math.atan2(spy, spx);
            var sps = top * Math.min(1, Math.max(0, (spl - 1.5) / 9));
            vd.x = spx / spl * sps; vd.y = spy / spl * sps;
            if (spl > 3) out = { aim: spa, up: Math.abs(sd(me.r, spa)) < 60 * D2R && spl > 4, glide: !!I.rcs, side: 0 };
          } else if (state === "COLLECT" || state === "CLAIM") {
            var cx = wr(gemNear.x - me.x, half), cy = wr(gemNear.y - me.y, half);
            // (SP.rch: a gem is taken from 6.0 away (4,451 pickups in the
            // recorded duels), and a spill lands as a ring 6-10 round where
            // the hit was; the players circled 5.5-8 from its middle and took
            // it all. So: aim up to rch inside the gem, towards the middle of
            // its pile, not at the gem itself)
            if (SP.rch) {
              var pmx = 0, pmy = 0, pmv = 0;
              (I.gems || []).forEach(function(h) { if (h.age == null || h.age > 2.5) return; var hx = wr(h.x - gemNear.x, half), hyy = wr(h.y - gemNear.y, half); if (hy(hx, hyy) > 16) return; var v = h.v || 1; pmx += hx * v; pmy += hyy * v; pmv += v; });
              if (pmv) { pmx /= pmv; pmy /= pmv; var pml = hy(pmx, pmy); if (pml > .5) { var sh = Math.min(SP.rch, pml) / pml; cx += pmx * sh; cy += pmy * sh; } }
            }
            var cl2 = hy(cx, cy) || 1;
            // (full speed until close, then ease in: at full speed it ran over
            // the gems and circled back)
            // (SP.gF: the floor of that, as a share of top speed; the owner:
            // keep the thrust on going for gems, the players flew through)
            var cs = top * Math.min(1, Math.max(SP.gF || .35, cl2 / 12));
            // (SP.rT: a spilled gem can't be taken for its first ~0.95 s; at
            // full speed the pilot got onto its spill early, passed over gems
            // it couldn't take yet and was off them when they could be. After
            // its clean short hits (Wiktor, Noto, Canim) it was 6-7 from the
            // pile at 0.4-0.7 s and 9-11 at 1.0-1.5 s, keeping 50-62%; the
            // players were 5.5-8 at 1.0 s and kept 76-88%. So: arrive as it
            // ripens, rT of top speed at least)
            if (SP.rT && gemNear.age != null && gemNear.age < .95 && cl2 > 1) cs = Math.min(cs, Math.max(top * SP.rT, cl2 / Math.max(.05, (.95 - gemNear.age) * 60)));
            vd.x = cx / cl2 * cs; vd.y = cy / cl2 * cs;
          } else if (state === "KNOCKBACK") {
            // point blank: the shot pushes them along our line, out of the
            // pool. Driving into it (SP.kbT): in the recorded duels a close
            // shot pushed 12.3 a second with the shooter backing off, 14.1 at
            // 0-6 a second into it, 16.0 at 6-12 and 17.8 above 12 (~2,000
            // hits); the pilot's were fired standing still (0-1 a second).
            out = { aim: bear, up: SP.kbT ? Math.abs(sd(me.r, bear)) < 40 * D2R : false, glide: !!I.rcs, side: 0 };
          } else if (state === "EVADE") {
            // across their line and a little back, to the side away from
            // their nose (a coin flip when it's dead on us), kept 0.7 s
            var ex = -dx / Math.max(dist, .01), ey = -dy / Math.max(dist, .01), offE = sd(Math.atan2(-dy, -dx), f.r);
            if (!(B.evAt && now - B.evAt < 700)) { B.evSide = Math.abs(offE) < .08 ? (B.rnd() < .5 ? -1 : 1) : offE > 0 ? 1 : -1; B.evAt = now; }
            var evb = SP.evB != null ? SP.evB : .5, evx = -ey * B.evSide * .85 + ex * evb, evy = ex * B.evSide * .85 + ey * evb, evl = hy(evx, evy) || 1;
            vd.x = evx / evl * top; vd.y = evy / evl * top;
          } else if (state === "CUT") {
            // to the gems they're heading for, nose on where they'll be
            var cgx = wr(cutG.g.x - me.x, half), cgy = wr(cutG.g.y - me.y, half), cga = Math.atan2(cgy, cgx);
            // (SP.cutP: not straight down their line of sight to the gems: a
            // waypoint off to the side of their path, so we come in from
            // outside their nose; the last stretch straight. Owner's notes:
            // Offensive Positioning.)
            if (SP.cutP && hy(cgx, cgy) > 12) {
              var fdx = wr(cutG.g.x - f.x, half), fdy = wr(cutG.g.y - f.y, half), fdl = hy(fdx, fdy) || 1, px0 = -fdy / fdl, py0 = fdx / fdl;
              if (px0 * -cgx + py0 * -cgy < 0) { px0 = -px0; py0 = -py0; }
              var wpx = cgx + px0 * SP.cutP, wpy = cgy + py0 * SP.cutP; cga = Math.atan2(wpy, wpx);
            }
            out = { aim: cga, up: Math.abs(sd(me.r, cga)) < 70 * D2R, glide: false, side: 0 };
            if (hy(cgx, cgy) < 6) out.aim = bear;
          } else if (state === "BUMPSHOT") {
            // straight in where they'll be, nose on them for the shot
            var lb = lead(me, { x: 0, y: 0 }, 0, f, { x: f.vx, y: f.vy }, 60);
            out = { aim: lb.a, up: Math.abs(sd(me.r, lb.a)) < 70 * D2R, glide: false, side: 0 };
          } else if (state === "BUMP") {
            // full speed into them: contact knocks their nose off us
            var lv = lead(me, { x: 0, y: 0 }, 0, f, { x: f.vx, y: f.vy }, 60);
            out = { aim: lv.a, up: Math.abs(sd(me.r, lv.a)) < 95 * D2R, glide: false, side: 0 };
            fireOk = false;
          } else {
            var bestT = null, shove = false;
            if (state === "PRESS" && !SP.avoid) {
              // Charge them head-on. With gems about, from the pool side: get
              // between them and the gems first, then drive straight through
              // them, so the contact and the point-blank volley send them out
              // of the pool.
              bestT = { x: f.x + f.vx * 12, y: f.y + f.vy * 12 }; shove = true;
              // (in their reach with their shot due, the line in wanders 5-10
              // either side, switching at odd times: a straight charge is easy
              // to lead. Any other time it goes straight: weaving all the way
              // in let a rusher reach us first, 83% -> 60% won)
              if (dist > 18 && dist < 40 && foeT < .8) {
                if (!(now < B.jkAt)) { B.jk = (B.rnd() < .5 ? -1 : 1) * (5 + B.rnd() * 5); B.jkAt = now + 350 + B.rnd() * 550; }
                bestT.x += -Math.sin(bear) * B.jk; bestT.y += Math.cos(bear) * B.jk;
              }
              if (P && P.n >= 2 && fpd < P.r + 30) {
                var pux = wr(P.x - f.x, half), puy = wr(P.y - f.y, half), pul = hy(pux, puy) || 1; pux /= pul; puy /= pul;
                var poolSide = (-dx * pux - dy * puy) / Math.max(dist, .01);
                if (poolSide > .45 || dist < rr + 5) why.unshift("shove: driving them out of the pool");
                else {
                  var bx = -dx / Math.max(dist, .01), by = -dy / Math.max(dist, .01);
                  bestT = { x: f.x + pux * (rr + 9) + bx * 7, y: f.y + puy * (rr + 9) + by * 7 };
                  why.unshift("getting between them and the gems");
                }
              } else why.unshift("charging");
            } else {
              // a point on a ring round them: the ring by mode; on it, the spot
              // nearest the pool, off their nose, below them early on, and near us
              var Dw = state === "RETREAT" ? SP.dwR : state === "PRESS" ? (SP.dwP || SP.dwA) : SP.dwA;
              var early = now - B.start < 6000 || dist > reach * 1.2;
              var bt = -1e9;
              for (var k = 0; k < 24; k++) {
                var th = k * TAU / 24, tx = f.x + Math.cos(th) * Dw, ty = f.y + Math.sin(th) * Dw, sc2 = 0;
                var mdx = wr(tx - me.x, half), mdy = wr(ty - me.y, half), md = hy(mdx, mdy);
                sc2 -= md / 25;
                if (P && P.n >= 2) {
                  var pdx = wr(P.x - tx, half), pdy = wr(P.y - ty, half);
                  sc2 -= (state === "RETREAT" ? .5 : SP.poolW) * Math.max(0, hy(pdx, pdy) - P.r * .6) / 15;
                  if (state === "PRESS") sc2 += 1.2 * Math.cos(sd(th, Math.atan2(wr(P.y - f.y, half), wr(P.x - f.x, half))));
                }
                if (foeCan) sc2 -= 1.3 * Math.max(0, Math.cos(sd(th, f.r)) - .5) * 2;
                if (early) sc2 += .9 * cl((f.y - ty) / Dw, -1, 1);
                if (state === "RETREAT") sc2 -= .4 * Math.max(0, Math.cos(sd(th, f.r)));
                if (sc2 > bt) { bt = sc2; bestT = { x: tx, y: ty }; }
              }
            }
            if (state === "REENTER" && P) {
              // a curved way back in, from one side, never in a straight line
              var px = wr(P.x - me.x, half), py = wr(P.y - me.y, half), pl = hy(px, py) || 1, ux = px / pl, uy = py / pl;
              var bend = pl > P.r + 22 ? (P.r + 10) * B.reSide : 0;
              bestT = { x: P.x - uy * bend, y: P.y + ux * bend };
              why.unshift("back to the pool (" + P.n + " gems), curving " + (B.reSide > 0 ? "left" : "right"));
            }
            var tx2 = bestT.x, ty2 = bestT.y;
            if ((!shove || SP.shG) && state !== "RETREAT") {
              // pick up the gem nearest us that is closer to us than to them
              // (SP.shG: charging too, gems within shG on the way: v HEAVENLY
              // 5,683 gems went to him while it charged him, 11 from him and
              // 19 from it 0.6 s before; charging, it took none in passing)
              var gt = null, gd = 1e9, gR = shove ? SP.shG : 16;
              (I.gems || []).forEach(function(g) {
                var a1 = hy(wr(g.x - me.x, half), wr(g.y - me.y, half)), a2 = hy(wr(g.x - f.x, half), wr(g.y - f.y, half));
                if (a1 < gR && a1 < a2 * .9 && a1 < gd && (!shove || g.age == null || g.age > .9)) { gd = a1; gt = g; }
              });
              if (gt) { tx2 = tx2 * .5 + (me.x + wr(gt.x - me.x, half)) * .5; ty2 = ty2 * .5 + (me.y + wr(gt.y - me.y, half)) * .5; }
            }
            var gx = wr(tx2 - me.x, half), gy = wr(ty2 - me.y, half), gl = hy(gx, gy);
            var spd = shove || state === "REENTER" ? top : Math.min(top, gl * .05 + (state === "PRESS" ? .15 * top : 0));
            if (gl > .01) { vd.x = gx / gl * spd; vd.y = gy / gl * spd; }
          }
          // ---- bump shots: at the touch, or once the bounce has settled ----
          // In a recorded duel the pilot's shots within 150 ms of a contact hit
          // 19 of 22 (and 23 of 27 just before it), but 150-400 ms after it only
          // 5 of 12: by then the knock has turned the nose and the drift. The
          // other player fired at the touch or waited (400 ms on: 20 of 24).
          if (contact < 1.2) { if (!(B.cAt > 0)) B.cAt = now; } else if (contact > 4) B.cAt = 0;
          var cdt = B.cAt > 0 ? now - B.cAt : -1, settling = cdt > 150 && cdt < 400;
          // (SP.bsS: not while the nose is already on them, within bsS deg and
          // steady: against FIGHT OR DIE and NO MERCY BOT it touched them
          // loaded, nose 2-6 deg off, held for the bounce and was rammed or
          // shot first; shots at a touch with the nose under 8 deg hit 34 of 34)
          if (settling && SP.bsS && aim && aRad != null && Math.abs(sd(me.r, aRad)) < SP.bsS * D2R && Math.abs(me.w || 0) < .03) settling = false;
          // ---- the volley ----
          var fire = false, fwhy = null, wantFace = false, soon = false;
          var visible = f.visible !== false;
          if (!fireOk || !canFire) {
            // (not ready, or the move can't take a shot)
          } else if (state === "BUMPSHOT") {
            fwhy = "bump shot: holding it for the touch";
          } else if (state === "CUT") {
            if (dist < 9 && goodShot) { wantFace = true; fire = aligned; fwhy = "cut: point blank"; } else fwhy = "cut: holding the shot for the touch";
          } else if (settling) {
            wantFace = true; fwhy = "bump: holding the shot till the bounce settles";
          } else if (state === "KNOCKBACK") {
            // (and steady: in a recorded duel most of the pilot's close misses
            // were touch shots fired with the nose 22-42 deg off and turning
            // 0.08-0.14 rad a tick; same timing margin as the other shots)
            // (SP.kbL: how far off the nose may be, at least; 20 deg until
            // 1.3.23. Over three duels the pilot's close shots hit 68 of 68
            // with the nose under 10 deg off, 19 of 24 at 10-20, 11 of 27 at
            // 20 and more. At 14 it won 56-57% v 55% in the simulator on two
            // sets of seeds; holding for a steady nose (kbW, kbS) didn't.)
            var kbLim = SP.kbL ? Math.max(tol, SP.kbL * D2R) : Math.max(tol, 20 * D2R);
            fire = Math.abs(sd(me.r, bear)) <= kbLim && (!SP.kbW || Math.abs(me.w || 0) < SP.kbW || Math.abs(sd(me.r, bear)) < 8 * D2R) && (!SP.kbS || Math.abs(sd(me.r - (SP.aj || 0) * (me.w || 0), bear)) <= kbLim && Math.abs(sd(me.r + 3 * (me.w || 0), bear)) <= kbLim * 1.3);
            // (SP.kbA: beyond kbA between the hulls it takes the ordinary aim
            // check, nose and swing on the lead: the 14 deg allowance was
            // set for shots at the touch, ~8 between centres. v Noto on
            // 1.3.50 (contact shot from 4 apart) 4 of the 8 misses were
            // these, from 9-12 with the nose 4-22 deg off and turning
            // 0.06-0.11 rad a tick; over five duels the contact shots that
            // missed turned 0.08-0.10 a tick, the ones that hit 0.04-0.06)
            if (SP.kbA && contact > SP.kbA && aim) fire = aligned;
            wantFace = true; fwhy = "knockback shot";
          } else if (!visible && !(aim && aim.hit)) {
            // FOV prefire: where they should be (last seen, pulled by the gems)
            if (f.seenAgo < 2500 && dist < reach * 1.15 && (overcap || E >= cost * SP.pre)) {
              var tp = { x: f.x, y: f.y };
              if (P && P.n >= 2) { tp.x = f.x * .65 + (f.x + wr(P.x - f.x, half)) * .35; tp.y = f.y * .65 + (f.y + wr(P.y - f.y, half)) * .35; }
              var pl2 = lead(me, { x: me.vx, y: me.vy }, I.shot.k || 1, tp, { x: f.vx, y: f.vy }, S);
              if (pl2.d < reach * 1.02) {
                aRad = pl2.a; wantFace = true;
                fire = Math.abs(sd(me.r, aRad)) * .8 <= 2.5 * D2R; fwhy = "prefire (off screen)";
              }
            }
          } else if (goodShot) {
            wantFace = true;
            fwhy = f.stun > 0 ? (now - B.lastFire < 1600 ? "double shot" : "they are stunned: full volley") : outTime && pHit < .35 ? "out-timing their shot" : counter ? "counter-shot after theirs" : overcap ? "energy full" : pHit > .8 ? "clean shot" : "full volley";
            fire = aligned;
            // (SP.fMin: keep a reserve: no ordinary shot under fMin energy,
            // unless they're stunned, it's point blank, the bar is full or
            // the hit is near certain. In the bullring duels ZEX fired at a
            // median 113-122 energy and CANIM 104-114, the pilot at 95-104:
            // its next shot came later)
            if (fire && SP.fMin && E < SP.fMin && !(f.stun > 0) && !overcap && dist > 12 && pHit < .9) { fire = false; why.push("keeping a reserve (" + Math.round(E) + " of " + SP.fMin + ")"); }
            // (SP.fR: no ordinary shot from further than fR: the spill lands by
            // them, not us. v Wiktor (22:31) the pilot landed 57 of its hits
            // from 25-40 and he took back 43% of what they spilled; he shot
            // from 12-25 (54 of his) and kept 69% of his. Not when they're
            // stunned, the bar is full or the shot is near certain.)
            if (fire && SP.fR && dist > SP.fR && !(f.stun > 0) && !overcap && pHit < .95) { fire = false; why.push("too far: the spill would be theirs (" + Math.round(dist) + ")"); }
          }
          // No shot while the nose is swinging fast: in a recorded duel the
          // misses that went far off were fired turning up to 0.21 rad a tick
          // with the nose 64-133 deg off (missed shots: turning 0.058 a tick,
          // hits 0.02). (Holding also when one of theirs was about to land, or
          // from 0.06 a tick, cost fights in the simulator: 40-44% v 51%.)
          if (fire && state !== "KNOCKBACK" && Math.abs(me.w || 0) > .09) { fire = false; why.push("steadying the shot"); }
          // Just out of a stun the nose is still swinging back: in the
          // recorded duels the pilot fired 33 shots in the first 300 ms after
          // its stun ended and hit 20 (61%); the player fired 2, the players in
          // a 25-minute duel once in 15-25 recoveries, waiting until 300 ms
          // on (90% and more). Wait too, unless they're stunned up close, or it's a
          // touch shot with the nose already steady on them. (SP.rw was 300
          // until 1.3.21; a simulator sweep put 500 ahead: 60-61% v 48-54%
          // against the pilot's own kind on three seed sets, level against
          // the rusher; 800 won more against its own kind but lost to the
          // rusher.)
          if (fire && recov < SP.rw && !(f.stun > 0 && dist < 15) &&
            (state !== "KNOCKBACK" || Math.abs(me.w || 0) > .09 || Math.abs(sd(me.r, bear)) > tol)) { fire = false; why.push("steadying after the knock (" + Math.round(recov) + " ms)"); }
          // (SP.sF: our own gun works stunned too: the nose can't be turned,
          // so it fires when the spin, flown on by the lag, brings it onto
          // the shot. v HEAVENLY he hit 33 of 85 that way, the pilot fired 14)
          if (SP.sF && !fire && me.stun > 0 && gunR && E >= cost * .995 && aim && aim.hit && visible) {
            var sfK = Math.round((I.lag || 0) * 60), sfR = me.r + (me.w || 0) * sfK, sfT = Math.max(tol, Math.atan2(f.rad * .7, Math.max(dist, 1)));
            if (Math.abs(sd(sfR, aRad)) <= sfT && Math.abs(sd(me.r, aRad)) <= sfT * 1.5) { fire = true; fwhy = "stunned shot: the spin is on them"; }
          }
          // (aim first: between shots it moves freely; from just before the
          // gun is ready the nose is on the shot and it only thrusts that way)
          // (SP.clN: taking gems, the nose goes to the gems, not onto the next
          // shot, unless they're loaded and near. Over a 25-minute duel v
          // Noto, nearer its own spilled gems (9 v 21 away) the pilot thrust
          // 44% of the time with the nose on the gems 30%, pre-aiming at
          // them, and took 46% of those gems; Noto in the same spot thrust
          // 91% and took 64%.)
          if ((state === "CLAIM" || state === "COLLECT") && B.state !== "CLAIM" && B.state !== "COLLECT") B.clArm = adHas(SP, "clN") ? adPick(B, "clN", now, adD) : SP.clN ? "on" : "off";
          if ((SP.clN || adHas(SP, "clN")) && B.clArm === "on" && (state === "CLAIM" || state === "COLLECT") && !fire && gemNear && hy(wr(gemNear.x - me.x, half), wr(gemNear.y - me.y, half)) > 3 && !(loadedFoe && dist < (SP.clN > 1 ? SP.clN : 20))) { wantFace = false; preAim = false; }
          soon = !wantFace && preAim;
          // ---- tip dodge (SP.tpD) ----
          // Their gun loaded and on us: the nose or the tail on them, never the
          // side. Over ~2,200 replayed shots a laser 2-3 off the centre hit
          // 78% of side-on hulls and 20% of nose- or tail-on ones. Moving
          // across their line, it thrusts that way and then glides with the
          // nose swung back on them (RCS), so the slide goes on, the side
          // doesn't show. (From the owner's notes: Tip Dodge; and re-entering
          // the pool, never show them the side.)
          var tipD = !!SP.tpD && !out && loadedFoe && aimedAt && !fire && !wantFace && !(me.stun > 0) && state !== "DODGE" && state !== "KNOCKBACK";
          if (tipD) {
            var vda = hy(vd.x, vd.y) > .01 ? Math.atan2(vd.y, vd.x) : me.r, tipA = Math.cos(vda - bear) >= 0 ? bear : bear + PI;
            if (Math.abs(sd(vda, tipA)) < (SP.tpD > 1 ? SP.tpD : 25) * D2R) tipA = vda;
            // (SP.tpA/tpV, the owner's angled tip: the nose or tail an angle
            // off them, up to tpA deg either side, swung slowly (tpV deg a
            // second) to a new random angle when it gets there, not snapped:
            // a hull that turns gradually is hard to read)
            if (SP.tpA) {
              var TP = B.tpO || (B.tpO = { a: 0, g: 0, at: now });
              var tdt = Math.min(.1, (now - TP.at) / 1000); TP.at = now;
              if (Math.abs(TP.g - TP.a) < 1) TP.g = (B.rnd() * 2 - 1) * SP.tpA;
              TP.a += cl(TP.g - TP.a, -(SP.tpV || 60) * tdt, (SP.tpV || 60) * tdt);
              tipA += TP.a * D2R;
            }
            out = drive(B, I, vd, tipA, { hold: true, guard: guard, bearing: bear });
            why.push("tip on them: their gun is loaded");
          }
          if (!out) {
            var faceAim = (wantFace || soon) && aRad != null ? aRad : bear;
            out = drive(B, I, vd, faceAim, { hold: wantFace || soon, guard: guard, bearing: bear });
            // (SP.gT: going for gems the engine stays on while the nose is
            // along the way we want to go, at speed: the speed match let it
            // coast. Players had thrust on 68-82% of the 0.6 s before a
            // pickup, the pilot 53-56%.)
            if (SP.gT && (state === "COLLECT" || state === "CLAIM") && !out.up && !out.slow) {
              var gvA = Math.atan2(vd.y, vd.x);
              if (hy(vd.x, vd.y) > .5 * top && Math.abs(sd(out.aim, gvA)) < 35 * D2R && Math.abs(sd(me.r, gvA)) < 35 * D2R) out.up = true;
            }
            if (soon) why.push(dblSoon ? "double shot: they're stunned " + Math.round(f.stun) + "t, gun back in " + Math.round(readyT * 1000) + " ms" : "pre-aiming: gun ready in " + Math.round(readyT * 1000) + " ms");
          } else if (wantFace && aRad != null && state !== "DODGE") out.aim = aRad;
          if (fwhy) why.push(fire ? fwhy : fwhy + " · lining up");
          // ---- after a knock: coast if the drift helps, otherwise brake or thrust back ----
          if (me.stun > 0) {
            out.up = false;
            out.aim = aRad != null ? aRad : bear;
            // (SP.spU: the last spU ticks of a stun, thrust held when the nose
            // is near where we go next, so it bites the moment the stun ends;
            // to a fresh spill if we can claim it and they're not loaded,
            // else at them. In a recorded session, knocked back by a body
            // shot, the players held thrust 50% of the time 0.75 s on and
            // 72% at 1 s, turned back to their spill and took 38% of it; the
            // pilot 25% and 43%, and 20%.)
            if (SP.spU && me.stun <= SP.spU) {
              var sgA = claimG && claimAge < 2 && !loadedFoe ? Math.atan2(wr(claimG.y - me.y, half), wr(claimG.x - me.x, half)) : bear;
              out.aim = sgA; out.up = Math.abs(sd(me.r, sgA)) < 75 * D2R;
            }
          }
          // ---- the bait (SP.bt, owner's notes: tip dodge with RCS) ----
          // Against a player who aims at the cockpit: crossing their line with
          // their gun loaded, slide nose-first (RCS glide, the nose leading
          // the drift), so the shot that leads the cockpit crosses ahead of
          // the hull, where it goes through. Side-on and sliding nose-first,
          // the players' hit rate on the pilot was ~46% (Noto 13/28, ADRIANA
          // 9/19, YILING 8/18); Noto's overall ~80%.
          if (baitOn && out && loadedFoe && !fire && !wantFace && !(me.stun > 0) && dist > 8 && dist < 40 && readyT > .25 &&
            (state === "EVADE" || state === "WAIT" || state === "RETREAT" || state === "COLLECT" || state === "CLAIM" || state === "REENTER" || state === "HOLD")) {
            var bvs = hy(me.vx, me.vy) * 60, bva = Math.atan2(me.vy, me.vx);
            if (bvs > 8 && Math.abs(Math.sin(bva - bear)) > .6) { out.aim = bva; out.up = !I.rcs; out.glide = !!I.rcs; why.push("bait: sliding nose-first (" + BT.f + " of their shots passed ahead of the nose)"); }
          }
          B.btInfo = SP.bt ? BT.f + "/" + BT.m + "/" + BT.b + (baitOn ? " BAIT" : "") : "";
          // ---- the slant (SP.sl, owner: dodge mid/long shots, don't run
          // straight into them) ----
          // Coming at them down their line with their gun up and on us: come
          // in at sl deg off it instead, one side for 0.6-1.1 s, then the
          // other. In the recorded duels shots from 18-50 hit 85% of hulls
          // moving under 3 u/s across the bolt and 75% of those over 10; the
          // pilot's median was 4.4, ZΣX's 7.6. Only while our own gun is a
          // while off or there's no good shot yet (the nose is back on the
          // shot before it's ready).
          // (SP.slG: also when our own gun is up but there's no good shot yet:
          // charging in nose-on, they shoot first. SP.slW: sitting still in
          // WAIT/HOLD with their shot on us, slide across at slW deg instead:
          // in the simulator that's where most of those moments were.)
          var slOn = SP.sl && out && out.aim != null && loadedFoe && fErr < 20 && !fire && !(me.stun > 0) &&
            dist >= (SP.slN || 20) && dist < (SP.slF || 50) && (!wantFace && readyT > (SP.slR || .4) || !SP.slQ && !goodShot && (!wantFace || SP.slG));
          if (slOn && (!B.slS || now > B.slT)) {
            var latV = -me.vx * Math.sin(bear) + me.vy * Math.cos(bear);
            B.slS = !B.slS ? (latV >= 0 ? 1 : -1) : -B.slS; B.slT = now + 600 + 500 * B.rnd();
          }
          if (slOn && out.up && Math.abs(sd(out.aim, bear)) < 35 * D2R &&
            (state === "PRESS" || state === "ATTACK" || state === "WAIT" || state === "COLLECT" || state === "CLAIM" || state === "HOLD" || state === "REENTER")) {
            out.aim = bear + B.slS * SP.sl * D2R; why.push("slant: their gun is up and on us, not straight down their line");
          } else if (slOn && SP.slW && !out.up && (state === "WAIT" || state === "HOLD") && hy(me.vx, me.vy) * 60 < 14) {
            out.aim = bear + B.slS * SP.slW * D2R; out.up = true; why.push("slant: not a still target with their shot on us");
          }
          // ---- the knock line (SP.kg, owner's idea) ----
          // Their gun up and on us, ours not ready, fresh gems near: stand
          // between them and the gems, kg in front of the gems on their line,
          // RCS off. Their hit adds ~13 u/s along the shot and, gliding, the
          // drift carries us through the gems (a full ship still takes them:
          // 164 pickups at 715+ gems in the FIGHT OR DIE duel). Only a trade
          // worth taking (owner): a shot it can't avoid anyway (inside kgR:
          // from under 25, 85-90% of shots land) and a pile worth at least kgM.
          var kgOn = false;
          if (SP.kg && out && !(me.stun > 0) && loadedFoe && fErr < 25 && !fire && (readyT > .3 || !goodShot) && dist > 8 && dist < (SP.kgR || 35) &&
            (state === "WAIT" || state === "HOLD" || state === "EVADE" || state === "RETREAT" || state === "COLLECT" || state === "CLAIM")) {
            var kgx = 0, kgy = 0, kgV = 0;
            (I.gems || []).forEach(function(g) {
              if (g.age == null || g.age > 3) return;
              var gx = wr(g.x - me.x, half), gy = wr(g.y - me.y, half);
              if (hy(gx, gy) < 16) { kgx += gx * (g.v || 1); kgy += gy * (g.v || 1); kgV += g.v || 1; }
            });
            if (kgV >= (SP.kgM || SP.clV || 25)) {
              kgx /= kgV; kgy /= kgV;
              var fgx = dx - kgx, fgy = dy - kgy, fgl = hy(fgx, fgy);
              if (fgl > 6) {
                var ktx = kgx + fgx / fgl * SP.kg, kty = kgy + fgy / fgl * SP.kg, ktl = hy(ktx, kty);
                out.aim = ktl > 1.5 ? Math.atan2(kty, ktx) : bear; out.up = ktl > 1.5; kgOn = true; B.kgUntil = now + 900;
                why.push("knock line: the gems behind us on their shot");
              }
            }
          }
          // ---- never take a bump side-on while they have the shot ----
          // (from the owner: bumping with the side of the ship in a high-risk
          // spot is the biggest taboo in duelling. In the recorded duels a
          // risky bump on the shoulder stunned that hull 35-40 ticks and the
          // other 8-12, and it was shot after 70-83% of them.) When their gun
          // comes back before ours and contact is about to happen, the hull
          // goes nose-on to them (or back-on, if already turning away) and
          // stops driving in. A sidestep only starts with time to clear
          // (SP.evT): moving across their line is side-on.
          // (only when the paths as they are now still meet: closest pass of
          // the two hulls under the hull sizes within 0.45 s. Bracing earlier
          // cut short sidesteps that would have cleared. In the simulator,
          // with side-on bumps modelled as measured, against the rusher: 43%
          // won v 29% for 1.3.15, side-on bumps while they're loaded 68 -> 38.)
          var rvx = (f.vx - me.vx) * 60, rvy = (f.vy - me.vy) * 60, rv2 = rvx * rvx + rvy * rvy;
          var tCl = rv2 > 1e-6 ? Math.max(0, -(dx * rvx + dy * rvy) / rv2) : 1e9, dCl = hy(dx + rvx * tCl, dy + rvy * tCl);
          var riskBump = !!SP.sg && !(f.stun > 0) && !(me.stun > 0) && foeT < .35 && foeT + .1 < myT && contact < SP.sg && closing > 2 &&
            tCl < .45 && dCl < rr + (SP.sgM != null ? SP.sgM : .5) && state !== "KNOCKBACK" && state !== "DODGE" && state !== "BUMPSHOT";
          if (riskBump && out.aim != null && Math.abs(Math.sin(sd(out.aim, bear))) > .5) {
            // (whichever is nearer the hull now: tail-on, driving straight
            // away; or nose-on, engine off so it doesn't drive in)
            var backOn = Math.abs(sd(me.r, bear)) > PI / 2;
            var ref = backOn ? bear + PI : bear;
            out.aim = ref + cl(sd(out.aim, ref), -.26, .26); out.up = backOn; out.side = 0;
            state = "BRACE"; why.unshift("bump coming while they're loaded: " + (backOn ? "back" : "nose") + " to them, never the side");
          }
          // ---- thrust on by default (SP.tA) ----
          // (owner: keep the engine on unless a stop is needed, e.g. a body
          // shot; a hull under thrust is harder to hit, and with RCS off it
          // slides on. The players had thrust on 64-79% of the time up close,
          // the pilot 57-61%.) Off for contact shots, braces, brake dodges,
          // settling, stuns and the shot itself; the nose not driven into
          // their loaded gun up close unless we mean to be on them; the nose
          // within tAg deg of where we want to go (or there's nowhere to go).
          if (SP.tA && !out.up && !fire && !(me.stun > 0) && !out.brake && !out.slow &&
            state !== "KNOCKBACK" && state !== "BUMPSHOT" && state !== "BRACE" && state !== "HOLD" && state !== "DODGE") {
            var tvl = hy(vd.x, vd.y), tvA = tvl > .01 ? Math.atan2(vd.y, vd.x) : me.r;
            var intoGun = loadedFoe && dist < 25 && Math.abs(sd(me.r, bear)) < 30 * D2R && state !== "PRESS" && state !== "BUMP" && state !== "CUT" && state !== "ATTACK";
            if (!intoGun && (tvl < .3 * top || Math.abs(sd(me.r, tvA)) < (SP.tAg || 45) * D2R)) { out.up = true; }
          }
          // ---- RCS: a real toggle, as a duellist taps Ctrl, each for a reason ----
          // Off (glide) is the fighting state: the momentum is kept while the
          // nose aims, shoots or braces. On (brake) only to stop: a brake
          // dodge, or settling into the pool out of a fight. Held at least
          // 1.5 s (a dodge or a brace: 0.3 s).
          if (I.rcs) {
            var g = B.glide, urgent = false, rwhy = null;
            // (SP.rcA: RCS on the whole time. SP.rcK, knocked back: 1 RCS on,
            // 2 RCS off (the knock carries on), 3 on only while it carries us
            // away from the pool, off when toward it. Owner's tests.)
            var rcKn = SP.rcK && me.stun > 0, rcAw = false;
            if (rcKn && SP.rcK === 3) { var pc = P && P.n ? P : null; rcAw = pc ? (me.vx * wr(pc.x - me.x, half) + me.vy * wr(pc.y - me.y, half)) < 0 : true; }
            if (SP.rcA) { g = false; urgent = true; rwhy = "RCS on (always)"; }
            else if (rcKn) { g = SP.rcK === 2 ? true : SP.rcK === 3 ? !rcAw : false; urgent = true; rwhy = g ? "RCS off: the knock carries on" : "RCS on: brake the knock"; }
            else if (out.brake) { g = false; urgent = true; rwhy = "RCS on: brake dodge"; }
            else if (out.coast) { g = true; urgent = true; rwhy = "RCS off: brace / coast clear"; }
            else if (SP.kg && (kgOn || me.stun > 0 && B.kgUntil > now)) { g = true; urgent = true; rwhy = "RCS off: their knock carries us into the gems"; }
            // Bumps: RCS on going in and while knocked back, so the bounce
            // bleeds off instead of carrying us out of the pool (gliding, the
            // knock keeps its whole speed: the pilot drifted away after every
            // bump in a real duel). Body shots and free movement stay RCS off.
            else if (state === "BUMP" || me.stun > 0 || contact < 6 && state !== "KNOCKBACK" && state !== "BUMPSHOT" && state !== "CUT" && !fire) { g = false; urgent = true; rwhy = "RCS on: bump, don't drift out of the pool"; }
            else if (state === "KNOCKBACK" || state === "BUMPSHOT" || state === "CUT" || fire && contact < 10) { g = true; urgent = true; rwhy = "RCS off: body shot"; }
            else if (out.slow && !weave) { g = false; rwhy = "RCS on: settle in the pool"; }
            else if (weave || dist < reach * 1.25 || state === "REENTER" || state === "COLLECT" || state === "CLAIM") { g = true; rwhy = "RCS off: free to turn and move unpredictably"; }
            if (g !== B.glide && now - B.glideAt > (urgent ? 300 : 1500)) { B.glide = g; B.glideAt = now; B.n.toggles++; B.rcsWhy = rwhy; }
          }
          out.glide = !!I.rcs && B.glide;
          // ---- a steadier nose ----
          // The pilot's nose reversed its turn ~3 times a second; the strong
          // players in a recorded duel 1.5-1.7. Much of it is noise: their
          // position is estimated between status packets, which come only when
          // their keys change, so the aim point jumps. Small heading changes
          // (under 20 deg) go half way each tick; big turns go straight.
          // Not while firing, dodging or on a contact shot.
          if (!fire && state !== "DODGE" && (SP.smK || state !== "KNOCKBACK" && state !== "BUMPSHOT" && state !== "CUT") && state !== "BRACE" && !(me.stun > 0) && out.aim != null && B.aimOut != null) {
            var dA = sd(out.aim, B.aimOut);
            if (Math.abs(dA) < 20 * D2R) out.aim = B.aimOut + dA * (SP.smF || .5);
          }
          B.aimOut = out.aim;
          // ---- a steadier engine (SP.uT) ----
          // Thrust spells last at least uT ms (on or off), except where a
          // switch is the point: dodging, bracing, a contact shot, firing,
          // stunned. Recorded up close, the pilot's burns had a median of
          // 98 ms (60% under 150), the human players' 280: users saw the bot
          // jitter.
          var upNow = !!out.up;
          if (SP.uT && B.upOut != null && upNow !== B.upOut && now - B.upAt < SP.uT && !fire && !(me.stun > 0) &&
            state !== "DODGE" && state !== "BRACE" && state !== "KNOCKBACK" && state !== "BUMPSHOT") out.up = upNow = B.upOut;
          if (upNow !== B.upOut) { B.upOut = upNow; B.upAt = now; }
          if (fire) B.lastFire = now;
          B.state = state; B.why = why;
          B.ev = state;
          return {
            aim: out.aim, up: !!out.up, glide: !!I.rcs && B.glide, side: out.side || 0, fire: fire, state: state, why: why,
            info: { bt: B.btInfo, hold: !!(wantFace || soon), weave: weave, style: MU.style, myTag: MU.me, foeTag: MU.foe, E: E, cap: cap, fE: fE, fEx: !!B.fEx, gemLead: gemLead, dist: dist, adv: adv, stun: me.stun || 0, fstun: f.stun || 0, pool: P, rcs: !!I.rcs && B.glide, imminent: imminent, pHit: pHit, needP: needP, al: !!aligned, m: m, threat: threat ? threat.gap : null }
          };
        }
        // The shot at a ship: it flown on in the game's physics (its keys,
        // `q`), the bolt from our gun (gunFwd ahead of the hull, along the
        // shot) taking k of our speed; the first meeting, or the closest pass.
        function aim(me, q0, S, k, gunFwd) {
          var o = { x: me.x, y: me.y }, res = null, L = life(S);
          for (var pass = 0; pass < 2; pass++) {
            var q = copy(q0), best = null, pg = null, prx = 0, pry = 0; res = null;
            for (var i = 1; i / 60 <= L; i++) {
              var t = i / 60; phys(q);
              var rx = q.x - o.x - 60 * k * me.vx * t, ry = q.y - o.y - 60 * k * me.vy * t, gap = hy(rx, ry) - S * (1 - Math.exp(-t / 2));
              if (gap <= 0) { var fr = pg != null && pg - gap > 0 ? pg / (pg - gap) : 1, ax = prx + (rx - prx) * fr, ay = pry + (ry - pry) * fr; res = { deg: Math.atan2(ay, ax) / D2R, t: t, hit: true, x: q.x, y: q.y }; break; }
              if (!best || gap < best.gap) best = { gap: gap, deg: Math.atan2(ry, rx) / D2R, t: t, hit: false, x: q.x, y: q.y };
              pg = gap; prx = rx; pry = ry;
            }
            res = res || best;
            if (!(gunFwd > .3)) break;
            var a = res.deg * D2R; o = { x: me.x + Math.cos(a) * gunFwd, y: me.y + Math.sin(a) * gunFwd };
          }
          return res;
        }
        return { create: create, tick: tick, phys: phys, clearance: clearance, boltAt: boltAt, life: life, lead: lead, aim: aim, matchup: matchup, STYLES: STYLES };
      })();
      /*}DUELCORE*/
      // ---- Duel Pilot ----
      // Flies and fights your Speedster in 1v1 duels (Combat window > DUEL
      // PILOT, its side panel switch, or its key). Its word goes out the way
      // the autopilot's does (window.__synDuel.ctl, the same priority, into
      // the game's own input and through the 90-a-second limit); what it knows
      // comes from the ship status packets, the Aim Assist's solver and bolt
      // list, and the game's own ship types (each variant's real specs) and
      // gems. RCS alone is switched as a person does it: a Ctrl tap the game
      // handles itself; its words carry the game's own RCS state unchanged.
      // The decisions are DuelCore's (above), the code the offline duel
      // simulator runs. Any real mouse or key input of yours takes the ship
      // back for a second.
      var DU_KEY = "syn_duel";
      var DU = { on: false, active: false, paused: false, why: "off", out: null, B: null, pauseUntil: 0, readout: true, warned: false,
        foe: null, mine: null, theirs: null, foeShots: [], foeLast: 0, fg: { vals: {}, n: 0 }, ctl: null, fireAt: 0, fireBig: 0, fireOn: false,
        tapAt: 0, tapping: false, taps: 0, n: 0, ring: [] };
      try { var dsv = JSON.parse(localStorage.getItem(DU_KEY) || "{}"); if (dsv.readout === false) DU.readout = false; if (dsv.warned) DU.warned = true; } catch (e) {}
      window.__synDuel = DU;
      DU.core = DuelCore;
      function duSave() { try { localStorage.setItem(DU_KEY, JSON.stringify({ readout: DU.readout, warned: DU.warned })); } catch (e) {} }
      // the duel opponent you picked (Combat window > DUEL OPPONENT), by name
      // so it holds across their respawns; "" = AUTO (the nearest enemy)
      DU.pick = "";
      function duName(id) { return String(_aegisNames[id] || "").replace(/^\s+|\s+$/g, ""); }
      DU.players = function() {
        var me = own(), mid = me ? me.id : null, now = Date.now(), out = [];
        for (var id in _synStat) {
          var st = _synStat[id], nm = duName(id);
          if (!st || st.id === mid || !nm) continue;
          var live = st.alive && synAge(st, now) < 2500;
          out.push({ id: st.id, name: nm, live: live, d: me && live ? Math.round(Math.hypot(wrap(st.x - me.x), wrap(st.y - me.y))) : null });
        }
        out.sort(function(a, b) { return (b.live - a.live) || ((a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d)) || a.name.localeCompare(b.name); });
        return out;
      };
      // Copy debug: the last ~4 s, newest last
      DU.debug = function() {
        var d0 = DU.ring.length ? DU.ring[0].t : 0;
        return JSON.stringify({ v: (typeof SYNDICATE_UPDATE_LOG !== "undefined" && SYNDICATE_UPDATE_LOG[0] && SYNDICATE_UPDATE_LOG[0].v) || "?", at: new Date().toISOString(), on: DU.on, why: DU.why, pick: DU.pick,
          ship: DU.mine && { name: DU.mine.name, code: DU.mine.code, S: DU.mine.S, cost: DU.mine.cost }, theirs: DU.theirs && { name: DU.theirs.name, code: DU.theirs.code }, ping: ping(), laserS: A.speed, k: A.k,
          keys: "t ms · st state · word sent · aim deg · up/fire/glide · me [x,y,nose,energy,gems,stun] · foe [id,x,y,energy,gems,stun] · shot [deg,hit,flight ms,p(hit)%] · dist",
          ticks: DU.ring.map(function(r) { var c = {}; for (var k in r) c[k] = r[k]; c.t = r.t - d0; return c; }) });
      };
      DU.setPick = function(name) { DU.pick = name || ""; DU.foe = null; if (DU.changed) DU.changed(); };
      // its key (Keybinds > Combat), off and unbound until you set one
      if (typeof KEYBIND_DEFAULTS === "object" && KEYBIND_DEFAULTS && !KEYBIND_DEFAULTS.duelpilot) KEYBIND_DEFAULTS.duelpilot = { key: "", on: false };
      window.__synCombatBindsExtra = [ { id: "duelpilot", label: "Duel Pilot on/off (Speedster duels)" } ];
      // ---- the game's ship types: each variant's real numbers ----
      function duWorld() {
        var g = getGS(), sc = g && g.IOOII, w = sc && sc.Ol110, me = sc && (sc.O1OI0 || sc.ship);
        if (!w || !me || !Array.isArray(w.ships)) return null;
        return { g: g, sc: sc, w: w, me: me, tick: typeof w.l11lI === "number" ? w.l11lI : null };
      }
      var duCtlOf = new WeakMap();
      function duCtl(e) {
        if (!e) return null;
        if (e.OOl01 && e.OOl01.status) return e.OOl01;
        var c = duCtlOf.get(e);
        if (c === undefined) { c = Object.values(e).find(function(o) { return o && o.status && typeof o.status.x === "number" && o.status.id != null; }) || null; duCtlOf.set(e, c); }
        return c;
      }
      function duCtlById(W, id) {
        if (W.me && W.me.status && W.me.status.id === id) return W.me;
        for (var i = 0; i < W.w.ships.length; i++) { var c = duCtl(W.w.ships[i]); if (c && c.status && c.status.id === id) return c; }
        return null;
      }
      // A ship's real numbers, from its type and its upgrades as the game
      // computes them (ShipInstance): top speed, inertia and turn per tick,
      // energy and shield, and its biggest gun (cost = damage x bolts).
      function duSpec(c, g) {
        var ins = c && c.instance, t = c && c.type || ins && ins.type;
        if (!ins || !t || !(ins.speed > 0)) return null;
        var sh = t.specs && t.specs.ship || {}, mo = g && g.mode && g.mode.options || {}, L = null;
        (ins.lasers || []).forEach(function(l) { if (l && l.type && (!L || l.damage * (l.type.number || 1) > L.damage * (L.type.number || 1))) L = l; });
        if (!L) return null;
        return { name: String(t.name || "#" + t.code), code: t.code, mass: +sh.mass || 100, top: ins.speed * (+mo.speed_mod || 1), inr: ins.OlIll, turn: ins.Il001, fric: +mo.friction_ratio || 1,
          genMax: ins.generator_capacity, regen: ins.generator_reload, shieldMax: ins.shield_capacity, cost: L.damage * (L.type.number || 1), mainDmg: L.damage, S: L.speed, rate: +L.type.rate || 1,
          rad: +t.radius || RAD[t.code] || 3, gunFwd: Math.max(0, -parseFloat(L.type.y) || 0) };
      }
      function duSpeedster(sp) { return !!sp && /speedster/i.test(sp.name); }
      // ---- the dueling mod's official Speedsters, recognised ----
      // Dueling mod 3.7.2 ships two, both maxed in a duel, with the same guns
      // (main 84 at speed 230, sides 12 at 130):
      //   A-Speedster (605, the mod's "NEW"): mass 230, speed 121, rotation 90, accel 135, size 1.6
      //   Legacy-Speedster (613, "LEGACY"):   mass 175, speed 115, rotation 80, accel 140, size 1.5
      // A ship is recognised by its name in the mode's ship list (a mod may
      // renumber them), else by those codes, else by its mass.
      var DU_OFFICIAL = { 605: { tag: "NEW", name: "A-Speedster", mass: 230 }, 613: { tag: "LEGACY", name: "Legacy-Speedster", mass: 175 } };
      var duModShips = { w: null, map: {} };
      function duModShip(code) {
        var wl = window.__synWelcome;
        if (duModShips.w !== wl) {
          duModShips.w = wl; duModShips.map = {};
          var list = wl && wl.data && wl.data.mode && wl.data.mode.ships;
          (Array.isArray(list) ? list : []).forEach(function(sj) {
            try {
              var o = typeof sj === "string" ? JSON.parse(sj) : sj, c = o && (o.typespec && o.typespec.code || (o.level && o.model ? o.level * 100 + o.model : null));
              if (c) duModShips.map[c] = { name: o.typespec && o.typespec.name || o.name, mass: o.specs && o.specs.ship && o.specs.ship.mass || o.typespec && o.typespec.specs && o.typespec.specs.ship && o.typespec.specs.ship.mass };
            } catch (e) {}
          });
        }
        return duModShips.map[code] || null;
      }
      // "NEW", "LEGACY" or null (not one of the duel Speedsters)
      function duKind(code) {
        var m = duModShip(code), nm = m && m.name || (DU_OFFICIAL[code] && DU_OFFICIAL[code].name) || "";
        if (!/speedster/i.test(nm)) return null;
        if (/legacy/i.test(nm)) return "LEGACY";
        if (m && m.mass && !DU_OFFICIAL[code]) return Math.abs(m.mass - 175) < Math.abs(m.mass - 230) ? "LEGACY" : "NEW";
        return "NEW";
      }
      function duKindName(code) { var m = duModShip(code), k = duKind(code); return (m && m.name || DU_OFFICIAL[code] && DU_OFFICIAL[code].name || "Speedster") + " (" + k + ")"; }
      DU.kind = duKind;
      // ---- Legacy or Revamp (the Combat Window's SPEEDSTER pick) ----
      // The pick sets which Speedster the pilot plays: its tuning, and on a
      // server whose mod offers it, the ship itself (the dueling mod's own
      // LEGACY / NEW button, "asLegacy", key 5; each press swaps the two).
      // ("AUTO", the default: the Speedster you're in, and never a switch)
      function duPickRaw() { try { var v = localStorage.getItem("AEGIS_duel_kind"); return v === "NEW" || v === "LEGACY" ? v : "AUTO"; } catch (e) { return "AUTO"; } }
      function duPick(code) { var v = duPickRaw(); return v !== "AUTO" ? v : duKind(code) || "LEGACY"; }
      DU.kindPick = duPick;
      // (the tuning was made on the Legacy-Speedster; for the Revamp's own
      // settings see the update log of the version that set them)
      // Revamp (A-Speedster both sides, simulator, 1,200 rounds a set v the
      // 1.3.33 pilot, itself and a fast shooter): only spills worth 40+ (25)
      // and no side-step off their ram (ev 0; heavier, it takes less knock):
      // 77.0% and 73.7% won v 69.0% and 71.3%
      // (1.3.55, overnight sweeps on the Revamp: contact shot from 6 apart
      // (4), the gem aim 4 inside the ring (3) and a slower last stretch onto
      // the gems (gF .6): +3.7, 0.0, +4.0, +2.0 points over four fresh sets)
      // (1.3.56, more aggressive: no waiting off their nose when their shot is
      // first (nW), leaning to PRESS (adv .5) and a closer stand-off (dwA 28,
      // 36): +5.7, +7.4, +4.0, +4.7 points over four fresh sets)
      var DU_REVAMP_TUNE = { clV: 40, ev: 0, kbC: 6, rch: 4, gF: .6, nW: 1, adv: .5, dwA: 28 };
      // three presses at most, 3 s apart, while the ship is the other duel
      // Speedster; then it says the server has no switch
      function duSwitchShip(ms, now) {
        if (duPickRaw() === "AUTO") { DU.swNote = null; return; }
        var S = DU.sw || (DU.sw = { n: 0, at: 0, key: "" }), want = duPick(ms.code), have = duKind(ms.code), key = want + ":" + ms.code;
        if (!have || have === want) { S.n = 0; S.key = key; DU.swNote = null; return; }
        if (S.key !== key) { S.key = key; S.n = 0; }
        if (S.n >= 3) { DU.swNote = "you're in the " + (have === "NEW" ? "A-Speedster" : "Legacy-Speedster") + ": this server has no Legacy / Revamp switch"; return; }
        if (now - S.at < 3000) return;
        var ws = window.__synGameWS;
        if (!ws || ws.readyState !== 1) return;
        S.at = now; S.n++; DU.swNote = "switching to the " + (want === "NEW" ? "A-Speedster" : "Legacy-Speedster");
        try { ws.send(JSON.stringify({ name: "modemsg", data: { name: "ui_component_clicked", id: "asLegacy" } })); } catch (e) {}
      }
      // While Dueling Mode is on: a chip at the top saying which Speedster you
      // fly and which your opponent flies, and what that matchup asks of you.
      (function duIdChip() {
        var el = null, last = "";
        function show(txt, sub) {
          if (!el) {
            el = document.createElement("div"); el.id = "syn-duel-id";
            el.style.cssText = "position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:9990;pointer-events:none;font-family:'JetBrains Mono',monospace;" +
              "padding:5px 12px 6px;background:rgba(12,15,15,.86);border:1px solid #474551;color:#e2e2e2;text-align:center;line-height:1.35;" +
              "clip-path:polygon(7px 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%,0 7px)";
            document.body.appendChild(el);
          }
          var h = '<div style="font-size:10.5px;font-weight:700;letter-spacing:.12em">' + txt + '</div>' + (sub ? '<div style="font-size:9px;letter-spacing:.1em;color:#928f9c">' + sub + "</div>" : "");
          if (h !== last) { last = h; el.innerHTML = h; }
          el.style.display = "block";
        }
        function hide() { if (el) el.style.display = "none"; }
        setInterval(function() {
          try {
            if (!document.body || !featOn("dueling") || !inGame()) return hide();
            var mid = myId(), ms = mid != null ? _synStat[mid] : null, now = Date.now();
            if (!ms || !ms.alive) return hide();
            var mk = duKind(ms.code);
            if (!mk) return hide();
            var fs = duFoe(ms, now), fk = fs ? duKind(fs.code) : null;
            var col = function(k) { return k === "LEGACY" ? "#ffb066" : "#c6c1ff"; };
            var txt = 'YOU <span style="color:' + col(mk) + '">' + duKindName(ms.code).toUpperCase() + "</span>" +
              (fs ? ' &nbsp;VS&nbsp; <span style="color:' + col(fk) + '">' + (fk ? duKindName(fs.code) : (duModShip(fs.code) || {}).name || "#" + fs.code).toUpperCase() + "</span>" : "");
            var sub = !fs ? "no opponent in view" : !fk ? "they are not in a duel Speedster" : mk === fk ? "mirror match" + (duName(fs.id) ? " · " + duName(fs.id) : "") :
              mk === "NEW" ? "you're heavier and turn better: bump, shove, knock them out of the pool" : "you're lighter and quicker off the mark: side-step their rams, counter-shoot, stay off their nose";
            show(txt, sub);
          } catch (e) { hide(); }
        }, 300);
      })();
      function duRcsMode(g) { var mo = g && g.mode && g.mode.options; return !!(mo && mo.rcs_toggle); }
      // a ship's status packet flown on to when a word sent now lands, in the
      // game's own physics with its keys (ours: the word going out)
      function duState(s, sp, w) {
        var q = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, r: s.angle * Math.PI / 180, w: s.spin || 0, stun: s.stun || 0,
          aim: (w != null ? w % 4096 % 360 : s.steer || 0) * Math.PI / 180, up: w != null ? (w & 4096) !== 0 : !!s.up, glide: w != null ? (w & 16384) !== 0 : !!s.glide,
          side: w != null ? (w & 32768 ? 1 : w & 65536 ? -1 : 0) : s.side || 0, top: sp.top, inr: sp.inr, turn: sp.turn, fric: sp.fric, strafe: MODE().strafe };
        for (var i = 0, n = Math.round(lead(s) * 60); i < n; i++) DuelCore.phys(q);
        return q;
      }
      // their volleys (from the Dodge Assist's feed): what each cost them
      function duVolley(b) {
        if (!DU.on || b[1] !== DU.foe) return;
        var c = 0;
        for (var o = 8; o + 32 <= b.length; o += 32) c += b[o + 31];
        if (c > 0) { DU.foeShots.push({ cost: c, at: Date.now() }); DU.foeLast = Date.now(); }
      }
      // the gems on the field (the game's own), where they will be when our word lands
      function duGems(W, H) {
        var cm = W.sc && W.sc.I0OIO, list = cm && cm.I0OIO, out = [], tick = W.tick;
        if (!Array.isArray(list)) return out;
        list.forEach(function(c) {
          if (!c || typeof c.x !== "number" || c.eater || c.eat_time > 0) return;
          var k = 1, age = 9;
          if (tick != null && typeof c.l00Il === "number") { age = (tick - c.l00Il) / 60 + H; k = age > 0 ? 1 - Math.exp(-age) : 0; }
          out.push({ x: c.x + (c.Ol11O || 0) * k, y: c.y + (c.OO001 || 0) * k, v: +c.points || 1, age: age });
        });
        return out;
      }
      // never an opponent: spectators and the dueling mod's own bot
      function duSkip(s) { return s.code === 191 || /^\s*(duel\s*bot|spectat)/i.test(duName(s.id)); }
      // The opponent: the one you picked, or the nearest live ship that is not
      // ours or a teammate. A ship whose keys have not changed sends no status
      // (gliding with RCS off: a second or more), so a state is kept for 2.5 s
      // by its real age; in a duel mod that puts both players on one team, the
      // nearest other ship is taken anyway.
      function duFoe(me, now) {
        if (DU.pick) {
          for (var pid in _synStat) {
            var ps = _synStat[pid];
            if (ps && ps.alive && ps.id !== me.id && synAge(ps, now) <= 2500 && duName(pid) === DU.pick) return ps;
          }
          return null;
        }
        var best = null, bd = 1e9, any = null, ad = 1e9;
        for (var id in _synStat) {
          var s = _synStat[id];
          if (!s || !s.alive || s.id === me.id || synAge(s, now) > 2500 || duSkip(s)) continue;
          var d = Math.hypot(wrap(s.x - me.x), wrap(s.y - me.y)) + (s.inv ? 200 : 0);
          if (d < ad) { ad = d; any = s; }
          if (foe(s.id, me.id) && d < bd) { bd = d; best = s; }
        }
        return best || any;
      }
      // Off screen (no status at all): the radar's spot for them, to close in on
      function duRadarFoe(me, now) {
        var best = null, bd = 1e9;
        for (var id in _aegisShips) {
          var r = _aegisShips[id], n = +id;
          if (!r || n === me.id || now - r.ts > 3000 || r.x === 0 && r.y === 0) continue;
          var nm = duName(n);
          if (DU.pick ? nm !== DU.pick : /^\s*(duel\s*bot|spectat)/i.test(nm)) continue;
          var d = Math.hypot(wrap(r.x - me.x), wrap(r.y - me.y));
          if (d < bd) { bd = d; best = { id: n, x: r.x, y: r.y, d: d, name: nm }; }
        }
        return best;
      }
      // their energy, exact when the packets show it changing for them
      function duFoeGen(fs, cap) {
        var v = fs.gen;
        if (typeof v !== "number") return null;
        var F = DU.fg;
        if (!F.vals[v]) { F.vals[v] = 1; F.n++; }
        return F.n >= 4 && v <= cap + 1 ? v : null;
      }
      // ---- the decision, every 16 ms (from the pump) ----
      function duTick(now) {
        DU.active = false; DU.out = null;
        if (!DU.on) { DU.why = "off"; return null; }
        if (!inGame()) { DU.why = "waiting for a match"; return null; }
        var mid = myId(), ms = mid != null ? _synStat[mid] : null;
        if (!ms || !ms.alive || now - ms.ts > 800) { DU.why = "waiting for your ship"; return null; }
        var W = duWorld(), msp = W && duSpec(duCtlById(W, mid), W.g);
        DU.mine = msp;
        if (!duSpeedster(msp)) { DU.why = "idle: not in a Speedster" + (msp ? " (" + msp.name + ")" : ""); return null; }
        var fs = duFoe(ms, now);
        // (the Legacy / Revamp pick: the ship swapped only with no one within 60)
        if (!fs || Math.hypot(wrap(fs.x - ms.x), wrap(fs.y - ms.y)) > 60) { try { duSwitchShip(ms, now); } catch (e) {} } else if (DU.sw) DU.sw.at = now;
        if (!fs) {
          DU.foe = null;
          // none in view: close in on the radar's spot for them, nose first
          var rf = duRadarFoe(ms, now), gi0 = gameInput();
          if (!rf) { DU.why = DU.pick ? "waiting for " + DU.pick + " (not on the radar)" : "idle: no opponent"; return null; }
          var ra = Math.atan2(wrap(rf.y - ms.y), wrap(rf.x - ms.x));
          DU.why = "closing in on " + (rf.name || "them") + " (radar, " + Math.round(rf.d) + " away)";
          DU.active = true;
          return DU.out = { aim: ra, up: Math.abs(Math.atan2(Math.sin(ra - ms.angle * Math.PI / 180), Math.cos(ra - ms.angle * Math.PI / 180))) < 1.2, fire: false, side: 0,
            glide: gi0 ? !!gi0.glide : !!ms.glide, state: "SEEK", why: [ DU.why ], info: null };
        }
        if (DU.foe !== fs.id) { DU.foe = fs.id; DU.fg = { vals: {}, n: 0 }; DU.foeShots = []; DU.foeLast = 0; DU.B = null; }
        var fsp = duSpec(duCtlById(W, fs.id), W.g) || msp;
        DU.theirs = fsp;
        var gi = gameInput(), pg = ping(), H = pg / 2000;
        if (!DU.B) { DU.B = DuelCore.create((now & 0x7fffffff) || 7); DU.B.glide = gi ? !!gi.glide : !!ms.glide; }
        // (RCS as the game has it, if it was switched by hand)
        if (gi && DU.B.glide !== !!gi.glide && now - DU.B.glideAt > 600) { DU.B.glide = !!gi.glide; DU.B.glideAt = now; }
        DU.paused = false;
        var meQ = duState(ms, msp, A.sentWord), fq = duState(fs, fsp, null), meO = own();
        // the shot: the Aim Assist's solver (ping lead, its model for their path)
        // (the big gun's real speed: measured from our own volleys, else the mod's ship type)
        var S = A.speed || msp.S, k = A.kN ? A.k : 1, sol = meO ? shotAt(meO, fs, S, k, true) : null, tr = A.tracks[fs.id];
        var bolts = [];
        DG.inc.forEach(function(L) {
          if (L.dmg < 1) return;
          var own2 = _synLaserOwner[L.id];
          if (own2 && own2[0] !== fs.id) return;
          bolts.push({ x: L.x, y: L.y, a: L.a, S: L.S, vx: L.vx, vy: L.vy, age: (now + pg / 2 - L.t0) / 1000, r: L.r || 0 });
        });
        var cam = getActiveCamera(), view = { w: 55, h: 31 };
        if (cam) { var p0 = worldToScreenPx(cam, ms.x, ms.y, W.g), p1 = worldToScreenPx(cam, ms.x + 10, ms.y, W.g); if (p0 && p1) { var ppu = Math.hypot(p1.x - p0.x, p1.y - p0.y) / 10; if (ppu > .01) view = { w: innerWidth / 2 / ppu, h: innerHeight / 2 / ppu }; } }
        // (the big gun's reload from the ship's own gun spec: the mod's A- and
        // Legacy-Speedster fire it once a second; energy is the real limit)
        var rate = msp.rate || 1, per = 1000 / rate, en = energyAt(), shots = DU.foeShots.splice(0);
        // A press is a 40 ms pulse. From then until our volley's report comes
        // back (or ping + 300 ms) the big gun counts as fired and its energy as
        // spent: held on meanwhile, the side guns came back and fired alone
        // (15 of the 25 side-only volleys in a recorded duel).
        // (no volley reported by ping + 160 ms: the press didn't take; the gun
        // is loaded again for the brain, not counted empty for another 140 ms)
        var pend = DU.press && !(A.lastBigAt > DU.press.big0) && now - DU.press.at < ping() + 160;
        if (DU.press && !pend) DU.press = null;
        var spent = pend && now - DU.press.at >= 40;
        // (the Combat Window's experimental "Spill first": the fresh spill
        // before ramming them, as the strong players play it)
        var duTune = {}; if (duPick(ms.code) === "NEW") for (var rvk in DU_REVAMP_TUNE) duTune[rvk] = DU_REVAMP_TUNE[rvk];
        try { if (localStorage.getItem("AEGIS_duel_spill") === "1") duTune.spP = 1.2; if (localStorage.getItem("AEGIS_duel_punish") !== "0") duTune.pnR = 22; var nrV = localStorage.getItem("AEGIS_duel_noram2"); if (nrV === "1" || nrV !== "0" && duPick(ms.code) === "NEW") { duTune.rmL = 1; duTune.fSG = 1; } if (localStorage.getItem("AEGIS_duel_adapt_on") === "1") duTune.ad = 1; } catch (e) { duTune.pnR = 22; }
        var I = {
          now: now, half: _aegisMapHalf || 1e9, rcs: duRcsMode(W.g), strafe: MODE().strafe, lag: (now - ms.ts + pg) / 1000, tune: duTune,
          me: { x: meQ.x, y: meQ.y, vx: meQ.vx, vy: meQ.vy, r: meQ.r, w: meQ.w, stun: meQ.stun, top: msp.top, inr: msp.inr, turn: msp.turn, fric: msp.fric, strafe: meQ.strafe,
            rad: msp.rad, shield: ms.shield, shieldMax: msp.shieldMax, gen: Math.max(0, Math.min(msp.genMax, en != null ? en : ms.gen) - (spent ? msp.cost : 0)), genMax: msp.genMax, regen: msp.regen, crystals: ms.crystals || 0,
            gunReadyIn: spent ? per : A.lastBigAt ? Math.max(0, per - (now - A.lastBigAt + pg)) : 0, glide: gi ? !!gi.glide : !!ms.glide,
            ctl: A.sentWord != null ? { aim: A.sentWord % 4096 % 360 * Math.PI / 180, up: (A.sentWord & 4096) !== 0, glide: (A.sentWord & 16384) !== 0, side: A.sentWord & 32768 ? 1 : A.sentWord & 65536 ? -1 : 0 } : null, spec: msp },
          foe: { x: fq.x, y: fq.y, vx: fq.vx, vy: fq.vy, r: fq.r, stun: fs.stun || 0, shield: fs.shield, shieldMax: fsp.shieldMax, crystals: fs.crystals || 0, rad: fsp.rad,
            gunReadyIn: DU.foeLast ? Math.max(0, 1000 / (fsp.rate || 1) - (now - DU.foeLast + pg)) : 0, genMax: fsp.genMax, regen: fsp.regen, cost: fsp.cost, genExact: duFoeGen(fs, fsp.genMax),
            visible: onScreen(fs.x, fs.y), seenAgo: now - fs.ts, perr: tr && tr.n ? tr.e[modelOf(tr)] : null, spec: fsp, up: !!fs.up },
          foeShots: shots, shot: { cost: msp.cost, S: S, rate: rate, k: k }, aim: sol ? { deg: sol.ideg != null ? sol.ideg : sol.deg, hit: sol.hit, t: sol.t } : null,
          bolts: bolts, gems: W ? duGems(W, H + .05) : [], view: view
        };
        // (what it has learnt against this player: kept per name, saved every 15 s)
        if (duTune.ad) {
          if (!DU.adMems) { try { DU.adMems = JSON.parse(localStorage.getItem("AEGIS_duel_adapt") || "{}") || {}; } catch (e) { DU.adMems = {}; } }
          var adKey = duName(fs.id) || "#" + fs.id, adM = DU.adMems[adKey] || (DU.adMems[adKey] = {});
          adM.__t = now; I.adMem = adM;
          if (!DU.adSaved || now - DU.adSaved > 15000) {
            DU.adSaved = now;
            try {
              var names = Object.keys(DU.adMems).sort(function(a, b) { return (DU.adMems[b].__t || 0) - (DU.adMems[a].__t || 0); });
              names.slice(40).forEach(function(n) { delete DU.adMems[n]; });
              localStorage.setItem("AEGIS_duel_adapt", JSON.stringify(DU.adMems));
            } catch (e) {}
          }
        }
        var out = DuelCore.tick(DU.B, I);
        DU.active = true; DU.out = out; DU.I = I; DU.why = out.state; DU.n++;
        if (window.__synRecPilot) try { window.__synRecPilot(out); } catch (e) {}
        return out;
      }
      // RCS, as a person switches it: a Ctrl tap (down, up 90 ms later; a tap
      // toggles, a hold is momentary) that the game's own key handler takes
      function duTapCtrl(now) {
        if (DU.tapping || now - DU.tapAt < 300) return;
        DU.tapping = true; DU.tapAt = now; DU.taps++;
        function ev(type) {
          var e = new KeyboardEvent(type, { key: "Control", code: "ControlLeft", bubbles: true, cancelable: true, ctrlKey: type === "keydown" });
          // (the game reads keyCode, which a made event leaves at 0)
          try { Object.defineProperty(e, "keyCode", { get: function() { return 17; } }); Object.defineProperty(e, "which", { get: function() { return 17; } }); } catch (x) {}
          (document.body || document.documentElement).dispatchEvent(e);
        }
        ev("keydown");
        setTimeout(function() { ev("keyup"); DU.tapping = false; }, 90);
      }
      // The word: heading, thrust, fire and strafe from the brain; RCS is the
      // game's own state, carried through as it is.
      function duWord(out, now) {
        var deg = ((Math.round(out.aim * 180 / Math.PI) % 360) + 360) % 360;
        // fire: pressed only while the brain says so (the nose on the shot and
        // steady). It used to stay pressed until the volley went or 250 ms
        // passed, whatever the nose did meanwhile: shots left mid-swing.
        // A press, once begun, is held at least 60 ms (until our volley is
        // seen sooner): the brain's fire sometimes flickered on for one frame
        // (median 17 ms), too short for the game to take, and the press was
        // still booked as a shot, so the gun counted as empty for ~0.4 s. In
        // a recorded duel 47 of 522 presses fired nothing, several of them
        // point blank at a contact.
        var was = DU.fireOn;
        DU.fireOn = !!out.fire || !!(DU.press && now - DU.press.at < 60 && !(A.lastBigAt > DU.press.big0));
        if (DU.fireOn && !was && !DU.press) DU.press = { at: now, big0: A.lastBigAt || 0 };
        // (no strafe from the pilot, even where the mode has it: only what a
        // player flies with, the owner's call)
        var side = 0;
        return deg + (out.up ? 4096 : 0) + (DU.fireOn ? 8192 : 0) + (side > 0 ? 32768 : side < 0 ? 65536 : 0);
      }
      function duelWord() {
        if (!DU.on || !DU.active || DU.paused || DU.ctl == null) return null;
        var gi = gameInput();
        return DU.ctl + (gi && gi.glide ? 16384 : 0);
      }
      DU.frame = function(now) {
        var out = null;
        try { out = duTick(now); } catch (e) { DU.why = "error: " + (e && e.message || e); DU.active = false; out = null; }
        if (!out) { DU.ctl = null; DU.fireOn = false; return; }
        DU.ctl = duWord(out, now);
        // (the last ~4 s, for Copy debug)
        var I0 = DU.I, nf = out.info;
        DU.ring.push({ t: now, st: out.state, why: (out.why || []).slice(0, 3).join(" · "), word: DU.ctl, aim: Math.round(out.aim * 573) / 10, up: out.up ? 1 : 0, fire: out.fire ? 1 : 0, glide: out.glide ? 1 : 0,
          me: I0 && nf ? [ Math.round(I0.me.x * 10) / 10, Math.round(I0.me.y * 10) / 10, Math.round(I0.me.r * 573) / 10, Math.round(nf.E), I0.me.crystals, I0.me.stun ] : null,
          foe: I0 && nf ? [ DU.foe, Math.round(I0.foe.x * 10) / 10, Math.round(I0.foe.y * 10) / 10, Math.round(nf.fE), I0.foe.crystals, I0.foe.stun ] : null,
          shot: I0 && I0.aim ? [ Math.round(I0.aim.deg * 10) / 10, I0.aim.hit ? 1 : 0, Math.round(I0.aim.t * 1000), nf ? Math.round(nf.pHit * 100) : null ] : null, dist: nf ? Math.round(nf.dist) : null });
        if (DU.ring.length > 260) DU.ring.splice(0, DU.ring.length - 240);
        var gi = gameInput();
        if (gi && DU.I && DU.I.rcs && !!gi.glide !== !!out.glide) duTapCtrl(now);
      };
      function duActive() { return duelWord() != null; }
      A.duelActive = duActive;
      // (your mouse and keys no longer take the ship back: only its switch,
      // its side-panel toggle or its key stop it)
      function duBindMatch(e) {
        var kb = window.__aegisGetKeybinds && window.__aegisGetKeybinds(), b = kb && kb.duelpilot;
        if (!b || !b.on || !b.key) return false;
        return b.key.length === 1 ? e.key && e.key.toLowerCase() === b.key.toLowerCase() : e.key === b.key;
      }
      document.addEventListener("keydown", function(e) {
        if (e.repeat || !e.isTrusted || e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (duBindMatch(e)) DU.toggle();
      }, true);
      // ---- switching it on: a clear warning, every time ----
      DU.set = function(on) {
        on = !!on;
        if (on === DU.on) return;
        if (on && !DU.warned) { duConfirm(); return; }
        DU.on = on; DU.B = null; DU.pauseUntil = 0;
        if (!on) { DU.ctl = null; DU.active = false; DU.fireOn = false; }
        duBanner(on);
        DU.changed && DU.changed();
      };
      DU.toggle = function() { DU.set(!DU.on); };
      DU.setReadout = function(v) { DU.readout = !!v; duSave(); DU.changed && DU.changed(); };
      var DU_CSS = "#syn-duel-ro{position:fixed;left:14px;top:252px;z-index:9991;pointer-events:none;width:300px;padding:1px;background:#474551;clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);display:none;font-family:'JetBrains Mono',monospace}" +
        "#syn-duel-ro .in{background:rgba(12,15,15,.9);clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px);padding:8px 10px 9px}" +
        "#syn-duel-ro .hd{display:flex;align-items:center;justify-content:space-between;font-size:9.5px;font-weight:700;letter-spacing:.16em;color:#c8c4d3;margin-bottom:6px}" +
        "#syn-duel-ro .tk{display:inline-block;width:7px;height:7px;background:#c6c1ff;clip-path:polygon(50% 0,100% 100%,0 100%);margin-right:7px}" +
        "#syn-duel-ro .st{font-size:10px;letter-spacing:.14em;padding:2px 7px;border:1px solid #474551;color:#c6c1ff;background:#0c0f0f}" +
        "#syn-duel-ro .st.hot{color:#2a2279;background:#c6c1ff;border-color:#c6c1ff}#syn-duel-ro .st.warn{color:#2a2279;background:#ffb066;border-color:#ffb066}#syn-duel-ro .st.dim{color:#928f9c}" +
        "#syn-duel-ro .row{display:grid;grid-template-columns:62px 1fr;gap:6px;font-size:10px;line-height:1.55;color:#e2e2e2}" +
        "#syn-duel-ro .k{color:#928f9c;letter-spacing:.12em;font-size:8.5px;font-weight:700;padding-top:1px}" +
        "#syn-duel-ro .bar{position:relative;height:4px;background:#2a2930;margin:5px 0 2px}#syn-duel-ro .bar i{position:absolute;left:0;top:0;bottom:0;background:#c6c1ff}#syn-duel-ro .bar b{position:absolute;top:-2px;width:2px;height:8px;background:#ffb066}" +
        "#syn-duel-ro .why{margin-top:5px;padding-top:5px;border-top:1px solid #2f2e36;font-size:9.5px;color:#c8c4d3;line-height:1.45}" +
        "#syn-duel-warn{position:fixed;inset:0;z-index:2147483000;background:rgba(5,6,8,.62);display:flex;align-items:center;justify-content:center}" +
        "#syn-duel-warn .box{width:420px;max-width:calc(100vw - 32px);padding:1px;background:#ffb066;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}" +
        "#syn-duel-warn .in{background:#0c0f0f;padding:16px 18px;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);font-family:'JetBrains Mono',monospace;color:#e2e2e2;font-size:11px;line-height:1.6}" +
        "#syn-duel-warn h3{margin:0 0 8px;font-size:12px;letter-spacing:.18em;color:#ffb066}#syn-duel-warn .bt{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}" +
        "#syn-duel-warn button{font-family:inherit;font-size:10px;font-weight:700;letter-spacing:.14em;padding:7px 14px;border:1px solid #474551;background:#15181a;color:#c8c4d3;cursor:pointer}" +
        "#syn-duel-warn button.go{background:#c6c1ff;color:#2a2279;border-color:#c6c1ff}" +
        "#syn-duel-ban{position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:9992;pointer-events:none;font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:700;letter-spacing:.12em;padding:7px 14px;background:rgba(12,15,15,.92);border:1px solid #ffb066;color:#ffb066;transition:opacity .4s}";
      function duStyle() { if (document.getElementById("syn-duel-css")) return; var st = document.createElement("style"); st.id = "syn-duel-css"; st.textContent = DU_CSS; (document.head || document.documentElement).appendChild(st); }
      function duConfirm() {
        duStyle();
        if (document.getElementById("syn-duel-warn")) return;
        var kb = window.__aegisGetKeybinds && window.__aegisGetKeybinds().duelpilot, key = kb && kb.on && kb.key ? kb.key.toUpperCase() : null;
        var d = document.createElement("div");
        d.id = "syn-duel-warn";
        d.innerHTML = '<div class="box"><div class="in"><h3>DUEL PILOT PLAYS FOR YOU</h3>' +
          'While it is on it flies, aims and fires your Speedster by itself (its controls replace yours, as the Autopilot\'s do; RCS it switches with Ctrl taps, as you would). ' +
          'It keeps flying until you switch it off: ' + (key ? "press " + key + ", or " : "") + 'use the Combat window or the side panel (your mouse and keys don\'t take over).' +
          '<div class="bt"><button class="no">CANCEL</button><button class="go">TURN ON</button></div></div></div>';
        document.body.appendChild(d);
        d.querySelector(".no").onclick = function() { d.remove(); DU.changed && DU.changed(); };
        d.querySelector(".go").onclick = function() { d.remove(); DU.warned = true; duSave(); DU.set(true); };
      }
      var banT = 0;
      function duBanner(on) {
        duStyle();
        var b = document.getElementById("syn-duel-ban");
        if (!b) { b = document.createElement("div"); b.id = "syn-duel-ban"; document.body.appendChild(b); }
        var kb = window.__aegisGetKeybinds && window.__aegisGetKeybinds().duelpilot, key = kb && kb.on && kb.key ? kb.key.toUpperCase() : null;
        b.textContent = on ? "▲ DUEL PILOT ON · IT PLAYS FOR YOU" + (key ? " · " + key + " = OFF" : " · SWITCH IT OFF IN THE SIDE PANEL") : "DUEL PILOT OFF · THE SHIP IS YOURS";
        b.style.borderColor = b.style.color = on ? "#ffb066" : "#c6c1ff";
        b.style.opacity = "1"; b.style.display = "block";
        clearTimeout(banT);
        banT = setTimeout(function() { b.style.opacity = "0"; setTimeout(function() { b.style.display = "none"; }, 450); }, on ? 4000 : 1800);
      }
      // ---- the on-screen readout ----
      var ro = null, roAt = 0;
      function esc2(s) { return String(s).replace(/[&<>"]/g, function(c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
      function duReadout(now) {
        if (now - roAt < 120) return;
        roAt = now;
        var show = DU.on && DU.readout && inGame();
        if (!show) { if (ro) ro.style.display = "none"; return; }
        duStyle();
        if (!ro) { ro = document.createElement("div"); ro.id = "syn-duel-ro"; ro.innerHTML = '<div class="in"></div>'; document.body.appendChild(ro); }
        ro.style.display = "block";
        // (beside the side panel when it is open, never under it)
        var hp = document.getElementById("aegis-hud"), hr = hp && getComputedStyle(hp).display !== "none" && getComputedStyle(hp).visibility !== "hidden" ? hp.getBoundingClientRect() : null;
        var lx = hr && hr.width > 20 && hr.left < 40 ? Math.round(hr.right + 10) : 14;
        if (ro.__lx !== lx) { ro.__lx = lx; ro.style.left = lx + "px"; }
        var o = DU.out, I = DU.I, h = '<div class="hd"><span><span class="tk"></span>DUEL PILOT</span>';
        if (!o || !DU.active || DU.paused || !o.info) {
          h += '<span class="st ' + (DU.paused ? "warn" : o && DU.active ? "hot" : "dim") + '">' + (DU.paused ? "PAUSED" : o && DU.active ? o.state : "IDLE") + "</span></div>" +
            '<div class="row"><span class="k">WHY</span><span>' + esc2(DU.why) + "</span></div>";
          if (DU.mine) h += '<div class="row"><span class="k">SHIP</span><span>' + esc2(DU.mine.name.toUpperCase()) + "</span></div>";
          ro.firstChild.innerHTML = h;
          return;
        }
        var inf = o.info, cls = o.state === "PRESS" || o.state === "KNOCKBACK" || o.state === "BUMP" || o.state === "BUMPSHOT" || o.state === "CLAIM" || o.state === "CUT" || o.state === "SPILL" ? "hot" : o.state === "RETREAT" || o.state === "DODGE" || o.state === "EVADE" || o.state === "BRACE" || o.state === "SPACE" ? "warn" : "";
        h += '<span class="st ' + cls + '">' + o.state + "</span></div>";
        var pf = window.__synPace && window.__synPace();
        if (pf && (pf.fps < 40 || pf.wps != null && pf.wps < 18)) h += '<div class="row"><span class="k">SLOW</span><span style="color:#ffb27a">game at ' + pf.fps + ' fps · ' + pf.wps + ' controls/s: keep this window visible, efficiency mode off</span></div>';
        var ef = Math.max(0, Math.min(1, inf.E / inf.cap)), ff = Math.max(0, Math.min(1, inf.fE / (I.foe.genMax || inf.cap))), cm = I.shot.cost / inf.cap;
        h += '<div class="row"><span class="k">VS</span><span>' + esc2(duName(DU.foe) || "#" + DU.foe) + (DU.pick ? "" : " · auto") + "</span></div>";
        h += '<div class="row"><span class="k">MATCH</span><span>' + esc2(inf.myTag) + (inf.foeTag !== inf.myTag ? " vs " + esc2(inf.foeTag) : " mirror") + " → " + inf.style + "</span></div>";
        h += '<div class="row"><span class="k">ENERGY</span><span>' + Math.round(inf.E) + " / " + Math.round(inf.cap) + ' · them ' + (inf.fEx ? "" : "~") + Math.round(inf.fE) + (inf.fEx ? "" : " est") +
          '<div class="bar"><i style="width:' + (ef * 100).toFixed(0) + '%"></i><b style="left:' + (cm * 100).toFixed(0) + '%"></b></div><div class="bar"><i style="width:' + (ff * 100).toFixed(0) + '%;background:#ff84a8"></i><b style="left:' + (Math.min(1, I.shot.cost / (I.foe.genMax || inf.cap)) * 100).toFixed(0) + '%"></b></div></span></div>';
        h += '<div class="row"><span class="k">GEMS</span><span>' + (inf.gemLead >= 0 ? "+" : "") + inf.gemLead + " (" + I.me.crystals + " v " + I.foe.crystals + ")" + (inf.pool ? " · pool " + inf.pool.n : "") + "</span></div>";
        h += '<div class="row"><span class="k">RANGE</span><span>' + Math.round(inf.dist) + " · hit " + Math.round(inf.pHit * 100) + "%" + (inf.imminent ? " · THEIR SHOT IS DUE" : "") + "</span></div>";
        h += '<div class="row"><span class="k">STUN</span><span>you ' + Math.round(inf.stun) + "t · them " + Math.round(inf.fstun) + "t</span></div>";
        h += '<div class="row"><span class="k">RCS</span><span>' + (I.rcs ? (inf.rcs ? "OFF (gliding)" : "ON") + (DU.B && DU.B.rcsWhy ? " · " + esc2(DU.B.rcsWhy.replace(/^RCS (on|off): /, "")) : "") : "no toggle in this mode") + "</span></div>";
        h += '<div class="why">' + o.why.slice(0, 4).map(esc2).join(" · ") + "</div>";
        ro.firstChild.innerHTML = h;
      }
      (function duLoop() { requestAnimationFrame(duLoop); duReadout(Date.now()); })();
      setInterval(function() { if (document.hidden) duReadout(Date.now()); }, 250);
      function pilotFight() { var P = window.__synPilot; A.forceLock = P && P.on && P.alive && P.aim && P.fight != null ? P.fight : null; }
      // Called by the socket hook with every control message the game sends.
      window.__synAimRewrite = function(d, ws) {
        var n = +d;
        if (!(n >= 0) || n !== Math.floor(n) || n >= 262144) return d;
        A.ws = ws; A.numeric = typeof d === "number";
        A.flags = n - n % 4096; A.userDeg = n % 4096 % 360; A.userFire = (A.flags & 8192) !== 0;
        pilotFight();
        update();
        var w = finalWord();
        if (w == null) { A.sentWord = null; return d; }
        A.sentWord = w; A.sentAt = performance.now();
        return A.numeric ? w : String(w);
      };
      function keyMatch(e) {
        var kb = window.__aegisGetKeybinds && window.__aegisGetKeybinds(), b = kb && kb.aimassist;
        if (!b || !b.on || !b.key) return false;
        return b.key.length === 1 ? e.key && e.key.toLowerCase() === b.key.toLowerCase() : e.key === b.key;
      }
      document.addEventListener("keydown", function(e) {
        if (e.repeat || !inGame() || e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        if (keyMatch(e)) { A.keyHeld = true; A.snap = true; }
      }, true);
      document.addEventListener("keyup", function(e) { if (keyMatch(e)) A.keyHeld = false; }, true);
      window.addEventListener("blur", function() { A.keyHeld = false; });
      // Between the game's own messages (it only sends on change) keep the
      // heading on the moving solution and the trigger where it should be
      // (at most ~40 times a second, and at least every 0.4 s); hand the
      // controls back when done.
      function pump(ev) {
        // (switched off in the \ panel: the controls go back to the game's own)
        if (!featOn("aim")) {
          if (A.sentWord != null) { var uw0 = A.flags != null && A.userDeg != null ? userWord() : statusWord(); if (uw0 != null) rawSend(uw0); }
          A.sentWord = null; A.flags = null; A.userDeg = null; A.keyHeld = false; A.lock = null; A.engaged = false; DG.plan = null; KB.plan = null;
          return;
        }
        if (DU.on) DU.frame(Date.now());
        var duel = duelWord() != null && pilotWord() == null;
        var dodgeOn = C.dodge && (DG.plan || DG.inc.length || inGame()) || C.kb && (KB.plan || inGame());
        if (A.flags == null && !pilotWord() && !duel && !dodgeOn && A.sentWord == null) return;
        if (!inGame()) { A.keyHeld = false; A.lock = null; }
        pilotFight();
        if (A.flags != null) update();
        if (duel) { var nT = Date.now(); DG.inc = DG.inc.filter(function(L) { return nT - L.t0 < L.life + 60; }); DG.plan = null; KB.plan = null; }
        else {
          try { dodgeTick(ev); } catch (e) { DG.plan = null; }
          if (!DG.plan) { try { kbTick(); } catch (e) { KB.plan = null; } } else KB.plan = null;
        }
        var w = finalWord(), t = performance.now();
        if (w == null) {
          if (A.sentWord != null) { var uw = A.flags != null && A.userDeg != null ? userWord() : statusWord(); if (uw != null) rawSend(uw); }
          A.sentWord = null;
          return;
        }
        if (w !== A.sentWord && (ev || A.tlpDeg != null || t - A.sentAt > 24) || t - A.sentAt > 400) {
          A.sentWord = w; A.sentAt = t;
          rawSend(w);
        }
      }
      A.pump = pump;
      setInterval(function() { pump(false); }, 16);

      // ---- the game's own controls ----
      // The game keeps the ship's input (angle, up, glide, strafe...) on an
      // object of its own and predicts our ship from it: the autopilot writes
      // its word there so what you see matches what the server gets.
      var GI = { owner: null, key: null, tried: 0 };
      function gameInput() {
        var o = GI.owner, v = o && o[GI.key];
        if (v && "strafe_left" in v && "release_crystal" in v) return v;
        if (Date.now() - GI.tried < 2000) return null;
        GI.tried = Date.now(); GI.owner = null;
        var root = getGS();
        if (!root) return null;
        var seen = new Set(), q = [[root, 0]], n = 0;
        while (q.length && n < 20000) {
          var it = q.shift(), obj = it[0];
          for (var key in obj) {
            if (++n > 20000) break;
            var x;
            try { x = obj[key]; } catch (e) { continue; }
            if (!x || typeof x !== "object" || seen.has(x)) continue;
            seen.add(x);
            if (x.nodeType || x.isObject3D || ArrayBuffer.isView(x) || Array.isArray(x) && x.length > 64) continue;
            // the ship's controller (it sends the word): its input object, not
            // the status object that carries the same names from the server
            if ("previous_shoot" in x && "send" in x) {
              for (var k2 in x) {
                var v2;
                try { v2 = x[k2]; } catch (e) { continue; }
                if (k2 !== "status" && v2 && typeof v2 === "object" && "strafe_left" in v2 && "release_crystal" in v2 && "angle" in v2) { GI.owner = x; GI.key = k2; return v2; }
              }
            }
            if (it[1] < 5) q.push([x, it[1] + 1]);
          }
        }
        return null;
      }
      function writeInput(w) {
        var inp = gameInput();
        if (!inp) return;
        var ch = false;
        function put(k, v) { if (inp[k] !== v) { inp[k] = v; ch = true; } }
        if (w == null) { put("up", false); put("glide", false); put("strafe_left", false); put("strafe_right", false); }
        else { put("angle", w % 4096 % 360); put("up", (w & 4096) !== 0); put("glide", (w & 16384) !== 0); put("strafe_left", (w & 32768) !== 0); put("strafe_right", (w & 65536) !== 0); }
        if (ch && GI.owner) GI.owner.send = true;
      }
      // The game's mouse: where the real one is, and (Q held) a dragged one
      // that glides onto the target and rides on the shot.
      var drag = { on: false, x: innerWidth / 2, y: innerHeight / 2, real: { x: innerWidth / 2, y: innerHeight / 2 }, t: 0, el: null };
      A.drag = drag;
      A.gameInput = gameInput;
      window.addEventListener("mousemove", function(e) {
        if (!e.isTrusted) return;
        drag.real.x = e.clientX; drag.real.y = e.clientY;
        // while dragging (or the autopilot flies, or a dodge has the ship)
        // your own mouse does not reach the game
        if (drag.on || pilotWord() != null || duelWord() != null || DG.plan) e.stopImmediatePropagation();
      }, true);
      function gameEl() {
        if (drag.el && drag.el.isConnected) return drag.el;
        var best = null, ba = 0;
        document.querySelectorAll("canvas").forEach(function(c) {
          if (c.__syn || getComputedStyle(c).pointerEvents === "none") return;
          var r = c.getBoundingClientRect(), ar = r.width * r.height;
          if (ar > ba) { ba = ar; best = c; }
        });
        return drag.el = best;
      }
      function moveGameMouse(x, y) {
        var el = gameEl();
        if (el) el.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window }));
      }
      var pilotWas = false, dodgeHeld = null, duelWas = false;
      // How fast the game is really running here: frames a second (the game
      // draws and sends from its frames) and control words a second. In a
      // recorded duel the pilot's words went out on a 100 ms beat for the
      // whole game (10 a second, normally ~30), its hits fell to 58% (86-88%
      // in other duels) and the enemy landed 87%: the browser was running
      // that window slowly (efficiency mode, a covered or minimised window).
      // Shown in the Duel Pilot readout, and in recordings ("perf" lines).
      var PF = { n: 0, at: 0, fps: 60 };
      window.__synPace = function() { return { fps: PF.fps, wps: window.__synCtlRate ? window.__synCtlRate() : null, ping: Math.round(ping()) }; };
      (function inputs() {
        requestAnimationFrame(inputs);
        PF.n++; var pfNow = performance.now(); if (pfNow - PF.at >= 1000) { PF.fps = Math.round(PF.n * 1000 / (pfNow - PF.at || 1000)); PF.n = 0; PF.at = pfNow; }
        var now = performance.now(), dt = Math.min(.1, (now - (drag.t || now)) / 1000);
        drag.t = now;
        // autopilot: its word into the game's own input
        var pw = pilotWord(), dwv = pw == null ? duelWord() : null;
        if (pw != null) { writeInput(finalWord()); pilotWas = true; }
        else if (pilotWas) { writeInput(null); pilotWas = false; }
        // (the Duel Pilot's word carries the game's own RCS state, so writing
        // it leaves RCS as it is; handing back clears thrust and strafe only)
        else if (dwv != null) { writeInput(finalWord()); duelWas = true; }
        else if (duelWas) {
          duelWas = false;
          var giD = gameInput();
          if (giD) { var chD = false; [ "up", "strafe_left", "strafe_right" ].forEach(function(k) { if (giD[k]) { giD[k] = false; chD = true; } }); if (chD && GI.owner) GI.owner.send = true; }
        }
        // Dodge Assist takes the ship the way the autopilot does: its word
        // goes into the game's own controls (the ship on your screen moves
        // with it) and your keys and mouse are set aside until the bolt has
        // passed; then what you had is put back
        else if (DG.plan || KB.plan) {
          if (!dodgeHeld) { var gi = gameInput(); dodgeHeld = gi ? { angle: gi.angle, up: gi.up, glide: gi.glide, strafe_left: gi.strafe_left, strafe_right: gi.strafe_right } : {}; }
          writeInput(finalWord());
        } else if (dodgeHeld) {
          var gi2 = gameInput();
          if (gi2) { var ch2 = false; for (var kk in dodgeHeld) if (gi2[kk] !== dodgeHeld[kk]) { gi2[kk] = dodgeHeld[kk]; ch2 = true; } if (ch2 && GI.owner) GI.owner.send = true; }
          dodgeHeld = null;
        }
        // Q drag
        var L = A.lastSolve, want = C.drag && C.qsnap && A.keyHeld && C.act !== "fire" && A.engaged && L && pw == null && dwv == null && inGame();
        if (want) {
          var cam = getActiveCamera(), gs = getGS(), me = own();
          var op = cam && me && worldToScreenPx(cam, me.x, me.y, gs), ip = cam && worldToScreenPx(cam, L.ix, L.iy, gs);
          // (3D mode: the game aims from the middle of its top-down view)
          if (op && window.__synCam3DOn && window.__synCam3DOn()) { var xf3 = getScreenXform(gs); op = xf3 ? { x: xf3.left + xf3.width / 2, y: xf3.top + xf3.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; }
          if (op && ip) {
            var R = Math.max(70, Math.hypot(ip.x - op.x, ip.y - op.y)), a = L.deg * Math.PI / 180;
            var gx = op.x + Math.cos(a) * R, gy = op.y - Math.sin(a) * R;
            if (!drag.on) { drag.on = true; drag.x = drag.real.x; drag.y = drag.real.y; }
            var f = 1 - Math.exp(-dt / .05);
            drag.x += (gx - drag.x) * f; drag.y += (gy - drag.y) * f;
            moveGameMouse(drag.x, drag.y);
          }
        } else if (drag.on) {
          drag.on = false;
          moveGameMouse(drag.real.x, drag.real.y);
        }
      })();

      // ---- the lock marker, in the Syndicate look ----
      var cv = document.createElement("canvas");
      cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999989;display:none";
      cv.__syn = true;
      document.body.appendChild(cv);
      var ctx = cv.getContext("2d"), dpr = 1;
      function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
      resize();
      addEventListener("resize", resize);
      var LIL = "198,193,255", HOT = "255,132,168", MONO = "'JetBrains Mono',monospace";
      function brackets(x, y, r, len, col, w) {
        ctx.strokeStyle = col; ctx.lineWidth = w || 1.6;
        for (var i = 0; i < 4; i++) {
          var sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(x + sx * r, y + sy * (r - len));
          ctx.lineTo(x + sx * r, y + sy * r);
          ctx.lineTo(x + sx * (r - len), y + sy * r);
          ctx.stroke();
        }
      }
      function diamond(x, y, r, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); }
      }
      // a bevelled tag (the client's clipped-corner plates)
      function plate(x, y, w, h) {
        var b = 6;
        ctx.beginPath();
        ctx.moveTo(x + b, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - b); ctx.lineTo(x + w - b, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + b); ctx.closePath();
        ctx.fillStyle = "rgba(12,15,15,.78)"; ctx.fill();
        ctx.strokeStyle = "rgba(" + LIL + ",.35)"; ctx.lineWidth = 1; ctx.stroke();
      }
      function scr(cam, gs, x, y) { return worldToScreenPx(cam, x, y, gs); }
      (function loop() {
        requestAnimationFrame(loop);
        var now = Date.now(), show = C.marker && inGame() && (A.lock != null || A.cand != null) && (active() || now < A.graceUntil || A.forced);
        if (!show) { if (cv.style.display !== "none") cv.style.display = "none"; return; }
        var gs = getGS(), cam = getActiveCamera();
        if (!cam) return;
        cv.style.display = "block";
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        var tms = performance.now(), live = active();
        ctx.save();
        ctx.lineCap = "square";
        // acquiring: brackets close in as the confirm time runs, with a ring
        if (A.cand != null && _synStat[A.cand]) {
          var cs = _synStat[A.cand], cp = scr(cam, gs, cs.x, cs.y);
          if (cp) {
            var pr = C.confirm > 0 ? Math.min(1, (now - A.candSince) / C.confirm) : 1, rr = 30 - 10 * pr, ring = rr * 1.42 + 6;
            brackets(cp.x, cp.y, rr, 7, "rgba(" + LIL + "," + (.35 + .5 * pr) + ")", 1.3);
            ctx.strokeStyle = "rgba(" + LIL + ",.14)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(cp.x, cp.y, ring, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = "rgba(" + LIL + ",.9)";
            ctx.beginPath(); ctx.arc(cp.x, cp.y, ring, -Math.PI / 2, -Math.PI / 2 + pr * Math.PI * 2); ctx.stroke();
            ctx.font = "700 8px " + MONO; ctx.fillStyle = "rgba(" + LIL + ",.8)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("LOCKING " + Math.round(pr * 100) + "%", cp.x, cp.y + ring + 10);
            ctx.textAlign = "left";
          }
        }
        var Ls = A.lock != null ? _synStat[A.lock] : null, sol = A.lastSolve;
        if (Ls) {
          var lp = scr(cam, gs, Ls.x, Ls.y);
          if (lp) {
            var firing = live && A.fire, onT = sol && sol.hit && sol.aligned, col = firing ? "255,255,255" : onT ? HOT : LIL;
            var rk = 20 + Math.sin(tms / 260) * 1.2;
            ctx.shadowColor = "rgba(" + col + ",.8)"; ctx.shadowBlur = firing ? 14 : 6;
            brackets(lp.x, lp.y, rk, 8, "rgba(" + col + ",.95)", 2);
            ctx.shadowBlur = 0;
            // ticks on the axes, slowly turning
            ctx.strokeStyle = "rgba(" + col + ",.45)"; ctx.lineWidth = 1;
            for (var q = 0; q < 4; q++) {
              var a = q * Math.PI / 2 + tms / 1400;
              ctx.beginPath(); ctx.moveTo(lp.x + Math.cos(a) * (rk + 5), lp.y + Math.sin(a) * (rk + 5)); ctx.lineTo(lp.x + Math.cos(a) * (rk + 10), lp.y + Math.sin(a) * (rk + 10)); ctx.stroke();
            }
            diamond(lp.x, lp.y, 2.2, "rgba(" + col + ",.9)");
            // the tag: state, name, range, and the charge for the big shot
            var nm = String(_aegisNames[A.lock] || "#" + A.lock).replace(/^\s+|\s+$/g, "").slice(0, 16).toUpperCase();
            var me = own(), dist = me ? Math.round(Math.hypot(wrap(Ls.x - me.x), wrap(Ls.y - me.y))) : 0;
            var state = !sol ? "LOCKED" : sol.target !== A.lock ? "OUT OF REACH · SWITCHED" : !sol.hit ? "OUT OF REACH" : firing ? "FIRING" : onT ? "ON TARGET" : "TRACKING";
            var tx = lp.x + rk + 14, ty = lp.y - rk - 6, nd = need(), en = energyAt(), big = C.autofire === "big" && nd > 0;
            ctx.font = "700 9px " + MONO;
            var w = Math.max(ctx.measureText(state).width, ctx.measureText(nm + "  " + dist).width + 4) + 22, h = big ? 44 : 34;
            if (tx + w > innerWidth - 8) tx = lp.x - rk - 14 - w;
            plate(tx, ty, w, h);
            ctx.fillStyle = "rgba(" + col + ",1)"; ctx.fillRect(tx + 7, ty + 9, 3, 3);
            ctx.fillStyle = "rgba(" + col + ",.95)"; ctx.textBaseline = "middle";
            ctx.fillText(state, tx + 15, ty + 11);
            ctx.font = "600 10px " + MONO; ctx.fillStyle = "#e2e2e2";
            ctx.fillText(nm, tx + 8, ty + 24);
            ctx.fillStyle = "rgba(" + LIL + ",.6)"; ctx.textAlign = "right";
            ctx.fillText(String(dist), tx + w - 7, ty + 24); ctx.textAlign = "left";
            if (big) {
              var f = en == null ? 0 : Math.max(0, Math.min(1, en / nd)), bw = w - 16;
              ctx.fillStyle = "rgba(" + LIL + ",.15)"; ctx.fillRect(tx + 8, ty + 34, bw, 3);
              ctx.fillStyle = f >= 1 ? "rgba(" + HOT + ",1)" : "rgba(" + LIL + ",.85)"; ctx.fillRect(tx + 8, ty + 34, bw * f, 3);
            }
            // leader line from the tag to the brackets
            ctx.strokeStyle = "rgba(" + LIL + ",.3)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(tx < lp.x ? tx + w : tx, ty + h / 2); ctx.lineTo(lp.x + (tx < lp.x ? -rk : rk), lp.y - rk + 4); ctx.stroke();
          }
        }
        // where the shot meets its ship (the lock, or the one shot meanwhile)
        if (sol) {
          var ss = _synStat[sol.target], sp = ss && scr(cam, gs, ss.x, ss.y), ip = scr(cam, gs, sol.ix, sol.iy);
          if (sol.target !== A.lock && sp) brackets(sp.x, sp.y, 13, 5, "rgba(" + HOT + ",.9)", 1.5);
          if (sp && ip) {
            var c2 = sol.hit ? HOT : LIL;
            ctx.setLineDash([2, 4]); ctx.strokeStyle = "rgba(" + c2 + ",.55)"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(ip.x, ip.y); ctx.stroke(); ctx.setLineDash([]);
            diamond(ip.x, ip.y, 4.5, sol.hit ? "rgba(" + c2 + ",.25)" : null, "rgba(" + c2 + ",.95)");
            diamond(ip.x, ip.y, 1.4, "rgba(255,255,255,.9)");
          }
        }
        ctx.restore();
      })();
    })();
    (function radarZoomFeature() {
      var NATIVE = null, TARGET = 1;
      window.__AEGIS_RADAR_UNIFORM__ = {
        value: 4
      };
      var patchedShader = false;
      var iv = setInterval(function() {
        if (patchedShader || !window.THREE || !window.THREE.ShaderMaterial) return;
        if (window.THREE.ShaderMaterial.__aegisRadarZoom) {
          patchedShader = true;
          clearInterval(iv);
          return;
        }
        var Orig = window.THREE.ShaderMaterial;
        function Patched(params) {
          try {
            if (params && params.vertexShader) {
              var vs = params.vertexShader;
              var sm = vs.match(/(\w+)\.xy\s*\*=\s*([\d.]+)\s*;/);
              var hasClamp = sm && vs.indexOf("clamp(" + sm[1] + ".xy") >= 0;
              if (sm && hasClamp) {
                var V = sm[1];
                params.vertexShader = "uniform float uRadarZoom;\n" + vs.replace(new RegExp(V + "\\.xy\\s*\\*=\\s*[\\d.]+\\s*;"), V + ".xy *= uRadarZoom;").replace(new RegExp("clamp\\(" + V + "\\.xy,-\\.?\\d*\\.?\\d+,\\.?\\d*\\.?\\d+\\)"), "clamp(" + V + ".xy,-.999,.999)");
                params.uniforms = params.uniforms || {};
                params.uniforms.uRadarZoom = window.__AEGIS_RADAR_UNIFORM__;
              }
            }
          } catch (e) {}
          return new Orig(params);
        }
        Patched.prototype = Orig.prototype;
        Object.setPrototypeOf(Patched, Orig);
        Patched.__aegisRadarZoom = true;
        window.THREE.ShaderMaterial = Patched;
        patchedShader = true;
        clearInterval(iv);
      }, 100);
      function findRadarBackground(g) {
        try {
          var scr = g.display && g.display.screen;
          if (!scr) return null;
          var hud = scr.IOOOI && typeof scr.IOOOI.showWeaponStore === "function" ? scr.IOOOI : null;
          if (!hud) for (var k in scr) {
            try {
              var v = scr[k];
              if (v && typeof v.showWeaponStore === "function") {
                hud = v;
                break;
              }
            } catch (e) {}
          }
          return hud && hud.IOOlI && hud.IOOlI.background;
        } catch (e) {
          return null;
        }
      }
      var _lastAppliedZoom = null;
      setInterval(function() {
        if (!inGame()) return;
        try {
          var g = getGS();
          if (!g || !g.mode) return;
          if (NATIVE === null) NATIVE = g.mode.radar_zoom || 4;
          var eff = featOn("radarzoom") ? TARGET : NATIVE;
          window.__AEGIS_RADAR_UNIFORM__.value = eff;
          g.mode.radar_zoom = eff;
          if (eff !== _lastAppliedZoom) {
            var bg = findRadarBackground(g);
            if (bg && bg.texture) {
              bg.texture.repeat.set(1 / eff, 1 / eff);
              _lastAppliedZoom = eff;
            }
          }
        } catch (e) {}
      }, 500);
    })();
    (function fullMapRadarNames() {
      // Names on the radar, each with its tier (Radar Tier Tags), over the
      // game's own dots, or (Radar Ship Icons) each ship drawn as its own
      // silhouette (the game's ship icon, coloured ally / enemy / neutral)
      // in place of its dot. The icons cost the most (an extra masked,
      // shadowed element per ship moved every frame), so they are off by default.
      // (survival switches the radar to message 201 once it starts; both are read)
      var wrap = null, pool = {}, ipool = {}, iconUrls = {};
      function iconUrl(code) {
        if (!code) return null;
        if (iconUrls[code] !== undefined) return iconUrls[code];
        var url = null;
        try { var cv = window.IOII0 && window.IOII0.getShipIcon && window.IOII0.getShipIcon(code); url = cv && cv.toDataURL ? cv.toDataURL() : null; } catch (e) {}
        if (url) iconUrls[code] = url;
        return url;
      }
      function ensureWrap() {
        if (wrap) return wrap;
        wrap = document.createElement("div");
        wrap.id = "aegis-fmr-labels";
        wrap.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;";
        document.body.appendChild(wrap);
        return wrap;
      }
      function findRadarPanel(g) {
        try {
          var scr = g.display && g.display.screen;
          if (!scr) return null;
          var hud = scr.IOOOI && typeof scr.IOOOI.showWeaponStore === "function" ? scr.IOOOI : null;
          if (!hud) for (var k in scr) {
            try {
              var v = scr[k];
              if (v && typeof v.showWeaponStore === "function") {
                hud = v;
                break;
              }
            } catch (e) {}
          }
          return hud && hud.IOOlI;
        } catch (e) {
          return null;
        }
      }
      var _diagLogged = false;
      function getCanvasXform(g) {
        var canvas = document.querySelector("#canvaswrapper canvas");
        if (!canvas) return null;
        var dw = g.display && g.display.width, dh = g.display && g.display.height;
        if (!(dw > 0) || !(dh > 0)) return null;
        var rect = canvas.getBoundingClientRect();
        if (!(rect.width > 0) || !(rect.height > 0)) return null;
        return {
          left: rect.left,
          top: rect.top,
          sx: rect.width / dw,
          sy: rect.height / dh
        };
      }
      // The game's own ship dots are blanked (stations and your own marker
      // stay) and each ship is drawn instead as its icon, pointing the way it
      // travels, gliding smoothly to each new radar position the way the
      // game's dots do, its name above it.
      function hookDots(panel) {
        var R = panel && (panel.lI1Ol || null);
        if (!R) for (var k in panel) { var v = panel[k]; if (v && v.lII0l && v.type && typeof v.IOIll === "function") { R = v; break; } }
        if (!R || R.__synDots) return;
        var orig = R.IOIll;
        R.IOIll = function() {
          var out = orig.apply(this, arguments);
          try {
            if (featOn("radarzoom") && featOn("radarnames") && featOn("radaricons") && this.type && this.lII0l) {
              var n = this.max_pindex || this.size;
              for (var g = 1; g < n; g++) { var ty = this.type[g]; if (ty >= 1 && ty <= 3) this.lII0l[g] = 0; }
              var at = this.geometry && this.geometry.getAttribute("lII0l"); if (at) at.needsUpdate = true;
            }
          } catch (e) {}
          return out;
        };
        R.__synDots = true;
      }
      var C = { t: 0, ok: false }, disp = {}, lastFrame = 0;
      function hideAll() {
        for (var k in pool) if (pool[k].style.display !== "none") pool[k].style.display = "none";
        for (var k2 in ipool) if (ipool[k2].style.display !== "none") ipool[k2].style.display = "none";
      }
      function angLerp(a, b, k) { var d = ((b - a) % 360 + 540) % 360 - 180; return a + d * k; }
      // Where the game draws each ship's dot right now, read from the radar's
      // own buffers: the game keeps each player's last radar position by id
      // (posmap) and moves its dot from the old position to the new one over
      // 60 ticks in the shader; the same sum here puts a name exactly on its
      // dot every frame (no catching up, no drift). Null when the buffers are
      // not as expected; the names then follow our own copy of the positions.
      var TIER_COL = [ "", "#c9d1d9", "#7ee787", "#56d4f5", "#7aa2ff", "#c08bff", "#ffa94d", "#ff5d73" ];
      function dotContacts(g, panel, zoom) {
        var P = panel && panel.lI1Ol, U = P && P.material && P.material.uniforms, me = U && U.mypos && U.mypos.value, tu = U && U.l01lO;
        if (!P || !P.posmap || !(P.iteration >= 0) || !me || !tu || !(isFinite(me.x) && isFinite(me.y) && isFinite(tu.value))) return null;
        var V = P.vertices, O = P.oldpos, T = P.type, TM = P.time, Z = P.lII0l;
        if (!V || !O || !T || !TM || !Z) return null;
        var n = Math.min(512, T.length, TM.length, Z.length, V.length / 3, O.length / 2), byPos = {}, i, k;
        for (i = 1; i < n; i++) {
          var ty = T[i];
          if (!(ty === 1 || ty === 2 || ty === 3 || ty === 12) || V[i * 3 + 2] !== 0 || !(Z[i] > 0 || featOn("radaricons"))) continue;
          k = V[i * 3] + "," + V[i * 3 + 1];
          byPos[k] = byPos[k] === undefined ? i : -1;
        }
        var it = P.iteration - (g.mode && typeof g.mode.updateRadar === "function" ? 0 : 1), cnt = {}, id, r;
        for (id = 0; id < 256; id++) { r = P.posmap[id]; if (r && r.iteration === it) { k = r.x + "," + r.y; cnt[k] = (cnt[k] || 0) + 1; } }
        var out = [], sc = U.I1011 && U.I1011.value || 1;
        function wrap(v) { return ((v + 1) % 2 + 2) % 2 - 1; }
        for (id = 0; id < 256; id++) {
          r = P.posmap[id];
          if (!r || r.iteration !== it) continue;
          k = r.x + "," + r.y; i = byPos[k];
          if (i == null || i < 0 || cnt[k] !== 1) continue;
          var pr = Math.max(0, Math.min(1, (tu.value - TM[i]) / 60));
          var x = T[i] === 12 ? 0 : wrap(O[i * 2] * (1 - pr) + V[i * 3] * pr - me.x) * zoom;
          var y = T[i] === 12 ? 0 : wrap(O[i * 2 + 1] * (1 - pr) + V[i * 3 + 1] * pr - me.y) * zoom;
          out.push({ id: id, x: Math.max(-.95, Math.min(.95, x)), y: Math.max(-.95, Math.min(.95, y)), size: (Z[i] || 4) * sc });
        }
        return out;
      }
      function sideCol(id) {
        if (C.team && typeof _aegisHueOf[id] === "number") return "hsl(" + Math.round(_aegisHueOf[id]) + ",100%,65%)";
        try {
          var side = _aegisNames[id] && window.__aegisSideForPlayer && window.__aegisSideForPlayer(_aegisNames[id]);
          if (side === "ally") return "#2ecc71"; if (side === "enemy") return "#e74c3c";
        } catch (e) {}
        return "#fff";
      }
      function placeName(container, id, sx, sy, col, code, tiers) {
        var el = pool[id];
        if (!el) {
          el = document.createElement("div");
          // (the radar name as UMBRA draws it: 9px semi-bold, a dark outline)
          el.style.cssText = "position:absolute;left:0;top:0;will-change:transform;font:600 9px Arial,Helvetica,sans-serif;color:#fff;white-space:nowrap;line-height:10px;" + "text-shadow:-1px 0 #071016,1px 0 #071016,0 -1px #071016,0 1px #071016,-1px -1px #071016,1px 1px #071016,-1px 1px #071016,1px -1px #071016;";
          el._n = document.createElement("span");
          el._t = document.createElement("span");
          el._t.style.cssText = "display:none;margin-left:3px;padding:0 2px;font-size:8px;line-height:9px;border:1px solid;border-radius:2px;vertical-align:1px;text-shadow:none;background:rgba(7,16,22,.7);";
          el.appendChild(el._n); el.appendChild(el._t);
          container.appendChild(el);
          pool[id] = el;
        }
        if (el.style.display !== "block") el.style.display = "block";
        el.style.transform = "translate(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px) translate(-50%,-100%)";
        var nm = _aegisNames[id] || "#" + id;
        if (el._aegisNm !== nm) { el._aegisNm = nm; el._n.textContent = nm; }
        // the tier is the hundreds of the ship's code (101 is T1, 704 is T7), each its own colour
        var tr = tiers && code ? Math.floor(code / 100) : 0, tt = tr >= 1 && tr <= 7 ? "T" + tr : "";
        if (el._aegisT !== tt) { el._aegisT = tt; el._t.textContent = tt; el._t.style.display = tt ? "inline-block" : "none"; if (tt) el._t.style.color = el._t.style.borderColor = TIER_COL[tr]; }
        if (el._aegisCol !== col) { el._aegisCol = col; el._n.style.color = col; }
      }
      function frame() {
        requestAnimationFrame(frame);
        var now = Date.now(), fdt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : .016; lastFrame = now;
        var on = featOn("radarzoom") && featOn("radarnames") && inGame();
        if (!on) { if (wrap) hideAll(); C.ok = false; return; }
        try {
          // the slow lookups, a few times a second
          if (now - C.t > 150) {
            C.t = now; C.ok = false;
            var g = getGS();
            if (!g || !g.mode) return;
            var panel = findRadarPanel(g);
            if (!panel || !(panel.l0llO > 0) || !(panel.IllIO > 0)) return;
            hookDots(panel);
            var xf = getCanvasXform(g);
            if (!xf) {
              if (!_diagLogged) { _diagLogged = true; console.log("[Syndicate] Full Map Radar names: canvas transform unavailable — canvas found:" + !!document.querySelector("#canvaswrapper canvas") + " display.width:" + (g.display && g.display.width)); }
              return;
            }
            var S = Math.min(panel.l0llO, panel.IllIO);
            C.g = g; C.panel = panel; C.xf = xf; C.S = S; C.cx = panel.px + panel.l0llO - S / 2; C.cy = panel.lIIlI + panel.IllIO - S / 2 - .15 * S;
            C.eff = window.__AEGIS_RADAR_UNIFORM__ && window.__AEGIS_RADAR_UNIFORM__.value || 1;
            C.mapHalf = _aegisMapHalf > 0 ? _aegisMapHalf : 400;
            var wm = window.__synWelcome && window.__synWelcome.data && window.__synWelcome.data.mode;
            C.team = !!(wm && (wm.id === "team" || Array.isArray(wm.teams) && wm.teams.length > 1 || wm.friendly_colors > 0));
            C.ok = true;
          }
          if (!C.ok) return;
          var myS = getMyStatus(C.g);
          if (!myS) return;
          var mapHalf = C.mapHalf, eff = C.eff, xf = C.xf, S = C.S, container = ensureWrap(), seen = {}, ease = 1 - Math.exp(-fdt * 7);
          var icons = featOn("radaricons"), tiers = featOn("radartier");
          var dots = icons ? null : dotContacts(C.g, C.panel, eff);
          if (dots) {
            for (var di = 0; di < dots.length; di++) {
              var dc = dots[di], did = dc.id;
              if (String(did) === String(myS.id)) continue;
              seen[did] = true;
              requestName(did);
              var dsx = xf.left + (C.cx + dc.x * (S / 2)) * xf.sx, dsy = xf.top + (C.cy - dc.y * (S / 2)) * xf.sy;
              var dship = _aegisShips[did];
              placeName(container, did, dsx, dsy - Math.max(3, dc.size * xf.sy / 2 + 1), sideCol(did), dship && dship.code, tiers);
            }
          } else for (var id in _aegisShips) {
            if (String(id) === String(myS.id)) continue;
            var s = _aegisShips[id];
            if (now - s.ts > SHIP_TTL) continue;
            if (s.zeroSince != null && now - s.zeroSince > BOT_ZERO_TTL) continue;
            // where it is now: like the game's own dots, it glides to its latest
            // radar position and stops there (no running on ahead of the data)
            var ex = s.x, ey = s.y;
            var D = disp[id];
            if (!D || now - D.seen > 1500) D = disp[id] = { x: ex, y: ey, ang: null, seen: now };
            D.x += wrapDelta2(ex - D.x, mapHalf) * ease; D.y += wrapDelta2(ey - D.y, mapHalf) * ease; D.seen = now;
            var sp = Math.hypot(s.vx || 0, s.vy || 0);
            if (sp > 1.5) { var ta = Math.atan2(-(s.vy || 0), s.vx || 0) * 180 / Math.PI + 90; D.ang = D.ang == null ? ta : angLerp(D.ang, ta, 1 - Math.exp(-fdt * 6)); D.ang = (D.ang % 360 + 360) % 360; }
            var dx = wrapDelta2(D.x - myS.x, mapHalf), dy = wrapDelta2(D.y - myS.y, mapHalf);
            var zx = dx / mapHalf * eff, zy = dy / mapHalf * eff;
            if (zx < -1.02 || zx > 1.02 || zy < -1.02 || zy > 1.02) continue;
            var sx = xf.left + (C.cx + zx * (S / 2)) * xf.sx, sy = xf.top + (C.cy - zy * (S / 2)) * xf.sy;
            seen[id] = true;
            requestName(id);
            var col = sideCol(id);
            var url = icons ? iconUrl(s.code) : null, ic = ipool[id];
            if (url) {
              if (!ic) {
                // (the shadow sits on a wrapper: a filter on the masked box itself would be masked away)
                ic = document.createElement("div");
                ic.style.cssText = "position:absolute;left:0;top:0;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;will-change:transform;filter:drop-shadow(0 0 1.5px #000) drop-shadow(0 0 1px #000);";
                ic._in = document.createElement("div");
                ic._in.style.cssText = "width:100%;height:100%;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;background:#fff;";
                ic.appendChild(ic._in);
                container.appendChild(ic);
                ipool[id] = ic;
              }
              if (ic._u !== url) { ic._u = url; ic._in.style.webkitMaskImage = ic._in.style.maskImage = "url(" + url + ")"; }
              if (ic.style.display !== "block") ic.style.display = "block";
              ic.style.transform = "translate(" + sx.toFixed(1) + "px," + sy.toFixed(1) + "px) rotate(" + (D.ang || 0).toFixed(1) + "deg)";
              if (ic._col !== col) { ic._col = col; ic._in.style.background = col; }
            } else if (ic && ic.style.display !== "none") ic.style.display = "none";
            placeName(container, id, sx, sy - (url ? 9 : 3), col, s.code, tiers);
          }
          for (var pid in pool) if (!seen[pid] && pool[pid].style.display !== "none") pool[pid].style.display = "none";
          for (var iid in ipool) if (!seen[iid] && ipool[iid].style.display !== "none") ipool[iid].style.display = "none";
        } catch (e) {}
      }
      requestAnimationFrame(frame);
      function wrapDelta2(d, mapHalf) {
        var size = mapHalf * 2;
        if (!(size > 0)) return d;
        d = (d % size + size) % size;
        if (d > size / 2) d -= size;
        return d;
      }
    })();
  }

  // ---- the \ panel's rows for these ----
  var AIM_CFG = "STUDIO_aim_cfg";
  function aimCfg() { try { return JSON.parse(LS(AIM_CFG) || "{}") || {}; } catch (e) { return {}; } }
  function aimKey() { return String(LS("STUDIO_aim_key") || "q").toUpperCase(); }
  window.__studioExt = {
    rows: function(row, sec) {
      var r = function(k, label) { return row(label, 'data-ext="' + k + '"', k === "dodge" ? aimCfg().dodge === true : featOn(k)); };
      return sec("Camera") +
        r("fov", "FOV zoom (mouse wheel · 0 resets)") +
        r("wide", "Extended FOV view (zoomed out: more of the map)") +
        sec("Visuals") +
        r("nostars", "Remove stars") +
        r("esp", "ESP lines and boxes on other ships") +
        '<div class="option">ESP shows<button type="button" data-ext-espmode>' + (espNear() ? "Near me" : "Everyone") + "</button></div>" +
        '<div class="option">Near distance <span data-ext-espdist-v>' + espDist() + '</span><input type="range" min="20" max="400" step="10" value="' + espDist() + '" data-ext-espdist style="flex:0 0 46%"></div>' +
        r("saturate", "Saturated ship colours") +
        r("highcontrast", "High contrast ships (full colour)") +
        r("teamhl", "Team highlight (allies green, enemies yellow)") +
        r("lbicons", "Ship icons on the leaderboard") +
        sec("Gameplay") +
        r("fastrespawn", "Fast respawn") +
        r("teamlock", "Team lock bypass (join closed teams)") +
        sec("Radar") +
        r("radarzoom", "Full map radar") +
        r("radarnames", "Player names (with full map radar)") +
        r("radaricons", "Ship icons in place of dots") +
        r("radartier", "Tier tags on names") +
        sec("Combat") +
        r("aim", "Aim Assist (hold the key, or fire)") +
        '<div class="option">Aim Assist key<button type="button" data-ext-key>' + aimKey() + "</button></div>" +
        r("dodge", "Dodge Assist (steers out of enemy shots)");
    },
    bind: function(P) {
      P.addEventListener("change", function(e) {
        var t = e.target, k = t && t.getAttribute && t.getAttribute("data-ext");
        if (!k) return;
        if (k === "dodge") {
          var c = aimCfg(); c.dodge = !!t.checked;
          try { localStorage.setItem(AIM_CFG, JSON.stringify(c)); } catch (x) {}
          try { window.dispatchEvent(new Event("syn-aim-cfg")); } catch (x) {}
          return;
        }
        featSet(k, !!t.checked);
      });
      var em = P.querySelector("[data-ext-espmode]"), ed = P.querySelector("[data-ext-espdist]"), edv = P.querySelector("[data-ext-espdist-v]");
      if (em) em.addEventListener("click", function(e) {
        e.preventDefault();
        try { localStorage.setItem("STUDIO_esp_range", espNear() ? "all" : "near"); } catch (x) {}
        em.textContent = espNear() ? "Near me" : "Everyone";
      });
      if (ed) ed.addEventListener("input", function() {
        try { localStorage.setItem("STUDIO_esp_dist", ed.value); } catch (x) {}
        if (edv) edv.textContent = ed.value;
      });
      var kb = P.querySelector("[data-ext-key]");
      if (!kb) return;
      kb.addEventListener("click", function(e) {
        e.preventDefault();
        kb.textContent = "press a key…";
        function grab(ev) {
          window.removeEventListener("keydown", grab, true);
          if (ev.key === "Escape" || ev.key === "\\") { kb.textContent = aimKey(); return; }
          ev.preventDefault(); ev.stopImmediatePropagation();
          if (ev.key && ev.key.length === 1 && ev.key !== " ") { try { localStorage.setItem("STUDIO_aim_key", ev.key.toLowerCase()); } catch (x) {} }
          kb.textContent = aimKey();
        }
        window.addEventListener("keydown", grab, true);
      });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

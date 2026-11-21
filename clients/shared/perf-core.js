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
      // (r125 on, three.js gives a texture its size once (texStorage2D) and
      // sends each new drawing with texSubImage2D: the whole canvas at 0,0 is
      // the same upload)
      function canvasUpload(f, gl, a, src, keyHead) {
          var s = S(gl), k = s.unit + ":" + a[0], tex = s.unit !== undefined ? s.tex[k] : undefined;
          if (tex && src && src.__is2d && src instanceof HTMLCanvasElement) {
            var key = keyHead.concat([s.ps[GL.UNPACK_FLIP_Y_WEBGL], s.ps[GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL], s.ps[GL.UNPACK_COLORSPACE_CONVERSION_WEBGL], s.ps[GL.UNPACK_ALIGNMENT], src.width, src.height]).join(",");
            var d = src.__cd;
            var unchanged = d && tex.__stUp && tex.__stUp === d.up && d.key === key && s.ps[GL.UNPACK_FLIP_Y_WEBGL] !== undefined && s.ps[GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL] !== undefined &&
              (d.n === 0 || d.ok && d.cur === d.last && fontEp === d.fe);
            if (unchanged) {
              if (VERIFY) verifyCanvas(src, d);
              d.cur = ""; d.n = 0; d.ok = false; d.started = false; d.bp = false;
              ST.uploadsSkipped++; return;
            }
            var r = f.apply(gl, a);
            var up = ++UPID; tex.__stUp = up;
            src.__cd = { up: up, key: key, last: d && d.ok ? d.cur : null, cur: "", n: 0, ok: false, started: false, bp: false, fe: fontEp };
            // (read twice: the first read of a GPU canvas comes back with a few
            // bytes off from the second, the copy every later read gives)
            if (VERIFY) try { var vg = src.getContext("2d"); vg.getImageData(0, 0, src.width, src.height); src.__cd.px = vg.getImageData(0, 0, src.width, src.height).data.slice(); } catch (e) {}
            ST.uploadsSent++; return r;
          }
          if (tex) tex.__stUp = 0; else if (keyHead[0] === "sub" && s.unit === undefined) BUMP++;
          return f.apply(gl, a);
      }
      patch(P, "texImage2D", function(f) {
        return function() { var a = arguments; return canvasUpload(f, this, a, a.length === 6 ? a[5] : null, [a[0], a[1], a[2], a[3], a[4]]); };
      });
      patch(P, "texSubImage2D", function(f) {
        return function() {
          var a = arguments;
          if (a.length === 7 && a[2] === 0 && a[3] === 0) return canvasUpload(f, this, a, a[6], ["sub", a[0], a[1], a[4], a[5]]);
          var s = S(this), x = s.unit !== undefined ? s.tex[s.unit + ":" + a[0]] : undefined; if (x) x.__stUp = 0; else if (s.unit === undefined) BUMP++;
          return f.apply(this, a);
        };
      });
      ["copyTexImage2D", "copyTexSubImage2D", "compressedTexImage2D", "compressedTexSubImage2D", "texStorage2D"].forEach(function(n) {
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
  // (made with Reflect.construct: a three.js whose WebGLRenderer is a class,
  // r125 on, can not be called as a function; older ones are made the same)
  function threeTraps(T) { trapProp(T, "WebGLRenderer", function(R0) { return wrapCtor(R0, function(O) { return function() { var r = Reflect.construct(O, arguments, new.target || O); onRenderer(r); return r; }; }); }); }
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

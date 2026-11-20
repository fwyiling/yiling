// counts WebGL (1 and 2) calls per frame (by method), texture uploads and their pixels, uniform calls that repeat the last value
(function(){
  var C = window.__glc = { frames: 0, calls: {}, texPx: 0, uniSame: 0, uniAll: 0, ms: 0, up: {} }, last = new WeakMap();
  function probe(P) {
    Object.getOwnPropertyNames(P).forEach(function(k){ var d = Object.getOwnPropertyDescriptor(P, k); if (!d || typeof d.value !== 'function') return; var f = d.value;
      P[k] = function(){ C.calls[k] = (C.calls[k] || 0) + 1;
        if (k === 'texImage2D') { var s = arguments[arguments.length - 1]; if (s && s.width) C.texPx += s.width * s.height; else if (arguments.length >= 9) C.texPx += arguments[3] * arguments[4]; }
        return f.apply(this, arguments); }; });
    var tx = P.texImage2D; P.texImage2D = function(){ var s = arguments[arguments.length - 1]; if (s && s.width && s.getContext) { var k = s.width + 'x' + s.height + (s.__up === s.__v ? ' same' : ' changed'); C.up[k] = (C.up[k] || 0) + 1; s.__up = s.__v; } else if (s && s.width) { var k2 = (s.constructor && s.constructor.name) + ' ' + s.width + 'x' + s.height; C.up[k2] = (C.up[k2] || 0) + 1; } return tx.apply(this, arguments); };
    ['uniform1f','uniform1i','uniform2f','uniform3f','uniform4f','uniform1fv','uniform2fv','uniform3fv','uniform4fv','uniformMatrix3fv','uniformMatrix4fv','uniform1iv'].forEach(function(k){ var f = P[k]; P[k] = function(loc){ C.uniAll++; var v = Array.prototype.slice.call(arguments, 1).map(function(a){ return a && a.length ? Array.prototype.join.call(a, ',') : String(a); }).join('|'); if (loc && last.get(loc) === v) C.uniSame++; if (loc) last.set(loc, v); return f.apply(this, arguments); }; });
  }
  probe(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) probe(WebGL2RenderingContext.prototype);
  var CP = CanvasRenderingContext2D.prototype; ['fillRect','clearRect','strokeRect','fillText','strokeText','drawImage','putImageData','fill','stroke'].forEach(function(k){ var f = CP[k]; CP[k] = function(){ this.canvas.__v = (this.canvas.__v || 0) + 1; return f.apply(this, arguments); }; });
  // a frame is one display refresh: every rAF callback in it shares the timestamp (a page can run many loops)
  var raf = window.requestAnimationFrame; window.requestAnimationFrame = function(cb){ return raf.call(window, function(t){ var t0 = performance.now(); cb(t); C.ms += performance.now() - t0; if (t !== C.lastT) { C.lastT = t; C.frames++; } }); };
})();

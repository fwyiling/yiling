// three.js r124 for Starblast: what the game (written for r85) needs from r124.
// compat(THREE) is called once r124 is loaded (see tools/build-r124.js).
// Checked in the mock match against the game's own code (index.js).
function sbThreeCompat(T) {
  if (!T || T.__sbCompat || !(+T.REVISION >= 100)) return;
  try { Object.defineProperty(T, "__sbCompat", { value: true }); } catch (e) { return; }
  // r124 draws with WebGL2, whose shaders (GLSL ES 3.0) have a built-in
  // texture() function; the game's own shaders use "texture" as a name
  var fix = function(src) { return typeof src === "string" ? src.replace(/\btexture\b(?!\s*\()/g, "sbTexture") : src; };
  var prev = T.Material.prototype.onBeforeCompile;
  T.Material.prototype.onBeforeCompile = function(shader, renderer) {
    shader.vertexShader = fix(shader.vertexShader);
    shader.fragmentShader = fix(shader.fragmentShader);
    // a sprite mirrored by a negative scale stays mirrored, as in r85: the
    // HUD's panels are mirrored in x, its crosshair in y (r124 takes the
    // scale's length, which turned the crosshair face-down: culled)
    if (this.isSpriteMaterial) shader.vertexShader = shader.vertexShader
      .replace("scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) );", "scale.x = length( vec3( modelMatrix[ 0 ].x, modelMatrix[ 0 ].y, modelMatrix[ 0 ].z ) ) * ( modelMatrix[ 0 ].x < 0.0 ? -1.0 : 1.0 );")
      .replace("scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) );", "scale.y = length( vec3( modelMatrix[ 1 ].x, modelMatrix[ 1 ].y, modelMatrix[ 1 ].z ) ) * ( modelMatrix[ 1 ].y < 0.0 ? -1.0 : 1.0 );");
    // (a uniform of that name is the same value under the new one)
    var U = shader.uniforms;
    if (U && U.texture && !U.sbTexture) U.sbTexture = U.texture;
    if (prev) return prev.call(this, shader, renderer);
  };
  // polyhedra (planets, asteroids): r85 split each face into 2^detail
  // rows, r124 into detail + 1; the game's detail is given as r85 meant it
  var r85detail = function(d) { return d > 0 ? Math.pow(2, Math.round(d)) - 1 : d; };
  ["Icosahedron", "Octahedron", "Tetrahedron", "Dodecahedron"].forEach(function(n) {
    [n + "Geometry", n + "BufferGeometry"].forEach(function(k) {
      var C = T[k];
      if (typeof C !== "function") return;
      var W = function(radius, detail) { return new C(radius, r85detail(detail)); };
      W.prototype = C.prototype;
      T[k] = W;
    });
  });
  ["PolyhedronGeometry", "PolyhedronBufferGeometry"].forEach(function(k) {
    var C = T[k];
    if (typeof C !== "function") return;
    var W = function(vertices, indices, radius, detail) { return new C(vertices, indices, radius, r85detail(detail)); };
    W.prototype = C.prototype;
    T[k] = W;
  });
  // renamed since r85: the same, without a console warning on every call
  T.BufferGeometry.prototype.addAttribute = function(name, attr) { return this.setAttribute(name, attr); };
  // (r124 locks .shading on Material itself: each kind of material gets its own)
  var shading = { configurable: true,
    get: function() { return this.flatShading ? T.FlatShading : T.SmoothShading; },
    set: function(v) { this.flatShading = v === T.FlatShading; } };
  Object.keys(T).forEach(function(k) {
    var C = T[k];
    if (/Material$/.test(k) && typeof C === "function" && C.prototype instanceof T.Material) try { Object.defineProperty(C.prototype, "shading", shading); } catch (e) {}
  });
  // (and in a material's options: { shading: FlatShading })
  var setValues = T.Material.prototype.setValues;
  T.Material.prototype.setValues = function(values) {
    if (values && values.shading !== undefined) {
      var v = {};
      for (var k in values) if (k !== "shading") v[k] = values[k];
      this.flatShading = values.shading === T.FlatShading;
      values = v;
    }
    return setValues.call(this, values);
  };
  // each renderer: renderer.context (r124 locks it on the prototype), and
  // faces as r85 drew them: r124 turns a mesh mirrored by a negative scale
  // inside out (front faces clockwise); r85 did not, and the game's HUD
  // (a flipped camera, panels mirrored back) is built on that
  var R = T.WebGLRenderer;
  var Renderer = function(p) {
    R.call(this, p);
    Object.defineProperty(this, "context", { configurable: true, get: function() { return this.getContext(); } });
    var st = this.state, setMaterial = st && st.setMaterial;
    if (setMaterial) st.setMaterial = function(material) { return setMaterial.call(this, material, false); };
  };
  Renderer.prototype = R.prototype;
  for (var sk in R) if (Object.prototype.hasOwnProperty.call(R, sk)) Renderer[sk] = R[sk];
  T.WebGLRenderer = Renderer;
}

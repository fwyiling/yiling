// three.js r125+ for Starblast: what three.js took out after r124 that the
// game (written for r85) builds on, put back. sbThreeLegacy(THREE, makeGeometry)
// runs once the new three.js is loaded, before sbThreeCompat (see
// tools/build-r159.js); makeGeometry(THREE) is three.js's own Geometry,
// kept as examples/jsm/deprecated/Geometry.js in r125 (built in from there).
//  - THREE.Geometry, THREE.Face3, and the shapes the game makes as Geometry
//    (Box, Plane, Icosahedron...), built as r124 built them;
//  - drawing them: while a renderer draws, a mesh's .geometry reads as a
//    BufferGeometry made from its Geometry (and remade when the game marks
//    it changed, as r124's renderer did); the game sees its Geometry;
//  - THREE.Math, VertexColors, FlatShading/SmoothShading, removeAttribute,
//    BufferGeometry.fromGeometry;
//  - the r124 look: no colour management, linear output, legacy lights
//    (r155 on: physically based), point lights fading as in r124 (decay 1).
function sbThreeLegacy(T, makeGeometry, rendererName) {
  if (!T || T.__sbLegacy || T.Geometry) return;
  try { Object.defineProperty(T, "__sbLegacy", { value: true }); } catch (e) { return; }
  // ---- the look
  try { if (T.ColorManagement) T.ColorManagement.enabled = false; } catch (e) {}
  // ---- names
  T.Math = T.MathUtils;
  if (T.FlatShading === undefined) { T.FlatShading = 1; T.SmoothShading = 2; }
  if (T.VertexColors === undefined) { T.NoColors = false; T.FaceColors = true; T.VertexColors = true; }
  T.BufferGeometry.prototype.removeAttribute = function(name) { return this.deleteAttribute(name); };
  // (the copies the old Geometry makes its buffers with)
  var BA = T.BufferAttribute.prototype;
  function filler(keys) {
    return function(list) {
      var a = this.array, o = 0;
      for (var i = 0; i < list.length; i++) { var v = list[i]; for (var k = 0; k < keys.length; k++) a[o++] = v[keys[k]]; }
      return this;
    };
  }
  if (!BA.copyColorsArray) BA.copyColorsArray = filler(["r", "g", "b"]);
  if (!BA.copyVector2sArray) BA.copyVector2sArray = filler(["x", "y"]);
  if (!BA.copyVector3sArray) BA.copyVector3sArray = filler(["x", "y", "z"]);
  if (!BA.copyVector4sArray) BA.copyVector4sArray = filler(["x", "y", "z", "w"]);
  // ---- Face3 (r124's) and Geometry
  function Face3(a, b, c, normal, color, materialIndex) {
    this.a = a; this.b = b; this.c = c;
    this.normal = normal && normal.isVector3 ? normal : new T.Vector3();
    this.vertexNormals = Array.isArray(normal) ? normal : [];
    this.color = color && color.isColor ? color : new T.Color();
    this.vertexColors = Array.isArray(color) ? color : [];
    this.materialIndex = materialIndex === undefined ? 0 : materialIndex;
  }
  Face3.prototype.clone = function() { return new this.constructor().copy(this); };
  Face3.prototype.copy = function(s) {
    this.a = s.a; this.b = s.b; this.c = s.c;
    this.normal.copy(s.normal); this.color.copy(s.color); this.materialIndex = s.materialIndex;
    for (var i = 0; i < s.vertexNormals.length; i++) this.vertexNormals[i] = s.vertexNormals[i].clone();
    for (var j = 0; j < s.vertexColors.length; j++) this.vertexColors[j] = s.vertexColors[j].clone();
    return this;
  };
  T.Face3 = Face3;
  var Geometry = makeGeometry(T);
  T.Geometry = Geometry;
  // (a mesh made with one reads its morph targets: there are none)
  Geometry.prototype.morphAttributes = {};
  T.BufferGeometry.prototype.fromGeometry = function(g) { return this.copy(g.toBufferGeometry()); };
  // the shapes, as Geometry: r124 made each from its BufferGeometry
  // (now the shape's own name) and merged the vertices; the BufferGeometry
  // keeps its r124 name
  ["Box", "Plane", "Circle", "Ring", "Sphere", "Cylinder", "Cone", "Torus", "TorusKnot", "Lathe", "Shape", "Extrude", "Tube",
   "Polyhedron", "Icosahedron", "Octahedron", "Tetrahedron", "Dodecahedron"].forEach(function(n) {
    var Buf = T[n + "Geometry"];
    if (typeof Buf !== "function" || T[n + "BufferGeometry"]) return;
    var L = function() {
      Geometry.call(this);
      this.type = n + "Geometry";
      var b = Reflect.construct(Buf, arguments);
      this.parameters = b.parameters;
      this.fromBufferGeometry(b);
      this.mergeVertices();
      b.dispose();
    };
    L.prototype = Object.create(Geometry.prototype);
    L.prototype.constructor = L;
    T[n + "BufferGeometry"] = Buf;
    T[n + "Geometry"] = L;
  });
  // ---- drawing a Geometry
  var drawing = 0, FLAGS = ["verticesNeedUpdate", "elementsNeedUpdate", "uvsNeedUpdate", "normalsNeedUpdate", "colorsNeedUpdate", "groupsNeedUpdate", "lineDistancesNeedUpdate"];
  function make(o, g) {
    return o.isMesh ? g.toBufferGeometry() : Geometry.createBufferGeometryFromObject({ isPoints: o.isPoints, isLine: o.isLine, geometry: g });
  }
  function bufferOf(o, g) {
    var key = o.isMesh ? "__sbBufM" : "__sbBufL", b = g[key], i, dirty = false;
    for (i = 0; i < FLAGS.length; i++) if (g[FLAGS[i]]) { dirty = true; g[FLAGS[i]] = false; }
    if (!b) {
      b = make(o, g);
      try { Object.defineProperty(g, key, { value: b, writable: true, configurable: true }); } catch (e) { g[key] = b; }
      g.addEventListener("dispose", function() { b.dispose(); });
      return b;
    }
    if (dirty) {
      var n = make(o, g);
      for (var k in n.attributes) {
        var a = b.attributes[k], na = n.attributes[k];
        if (a && a.array.length === na.array.length && a.itemSize === na.itemSize) { a.array.set(na.array); a.needsUpdate = true; }
        else b.setAttribute(k, na);
      }
      b.groups = n.groups;
      b.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : null;
      b.boundingBox = null;
    }
    return b;
  }
  var geometryProp = { configurable: true,
    get: function() { var g = this.__sbGeo; return drawing && g && g.isGeometry ? bufferOf(this, g) : g; },
    set: function(v) { this.__sbGeo = v; } };
  [T.Mesh, T.Line, T.Points].forEach(function(C) { if (C) Object.defineProperty(C.prototype, "geometry", geometryProp); });
  // ---- textures whose picture changes size
  // r124 uploaded a texture whole each time (texImage2D): any size. From
  // r125 the GPU copy is made once at the picture's size (texStorage2D) and
  // updated in place: a canvas the game makes bigger later (the radar, 512
  // to 1024 when the mode zooms it out) went in cropped and blown up. Its
  // GPU copy is now let go when the size changes, and made again; a canvas
  // with no size (nothing to upload; r124 uploaded it empty) is left as it was.
  var TP = T.Texture.prototype, nu = Object.getOwnPropertyDescriptor(TP, "needsUpdate");
  if (nu && nu.set) Object.defineProperty(TP, "needsUpdate", { configurable: true, enumerable: nu.enumerable, get: nu.get,
    set: function(v) {
      var im = v === true && this.image;
      if (im && typeof im.width === "number" && typeof im.height === "number" && !this.isRenderTargetTexture) {
        if (!(im.width > 0 && im.height > 0)) return;
        var sz = this.__sbSize;
        if (sz && (sz[0] !== im.width || sz[1] !== im.height)) this.dispose();
        this.__sbSize = [im.width, im.height];
      }
      nu.set.call(this, v);
    } });
  // ---- each renderer: its draws, its look
  var nm = rendererName || "WebGLRenderer", R = T[nm];
  var Renderer = function() {
    var r = Reflect.construct(R, arguments, new.target || Renderer);
    if ("_useLegacyLights" in r) r._useLegacyLights = true; else if ("useLegacyLights" in r) r.useLegacyLights = true; else if ("physicallyCorrectLights" in r) r.physicallyCorrectLights = false;
    if (T.LinearSRGBColorSpace && "outputColorSpace" in r) r.outputColorSpace = T.LinearSRGBColorSpace;
    var render = r.render;
    r.render = function() { drawing++; try { return render.apply(this, arguments); } finally { drawing--; } };
    return r;
  };
  Renderer.prototype = R.prototype;
  T[nm] = Renderer;
  // point and spot lights fade over their distance as in r124 (r155 made
  // the default fall-off 2)
  [["PointLight", 3], ["SpotLight", 5]].forEach(function(p) {
    var C = T[p[0]];
    if (typeof C !== "function") return;
    var W = function() {
      var a = Array.prototype.slice.call(arguments);
      if (a[p[1]] === undefined) { while (a.length < p[1]) a.push(undefined); a[p[1]] = 1; }
      return Reflect.construct(C, a, new.target || W);
    };
    W.prototype = C.prototype;
    T[p[0]] = W;
  });
}

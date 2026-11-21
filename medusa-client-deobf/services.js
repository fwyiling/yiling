function createGraphicsLifecycle(target) {
  'use strict';

  const weakSet = new WeakSet();
  const weakSet2 = new WeakSet();
  const map = new Map();
  let stopped = false;
  let failures = 0;
  let el = null;
  function fn1() {
    if (el) {
      el.remove();
      el = null;
    }
  }
  function fn2(text, value) {
    const document = target.document;
    if (stopped || !document || !document.documentElement) {
      return;
    }
    if (!el) {
      el = document.createElement("aside");
      el.id = "medusa-graphics-notice";
      el.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483600;width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:20px;border:1px solid #537b9b;border-radius:14px;background:#0a1425f5;color:#eef7ff;box-shadow:0 15px 50px #0009;font:14px/1.55 Segoe UI,Arial,sans-serif";
      document.documentElement.appendChild(el);
    }
    el.replaceChildren();
    el.setAttribute("role", "alert");
    el.setAttribute("data-state", value);
    const strongEl = document.createElement("strong");
    const pEl = document.createElement("p");
    strongEl.textContent = "Medusa Client · graphics";
    pEl.textContent = text;
    el.append(strongEl, pEl);
    const divEl = document.createElement("div");
    divEl.style.cssText = "display:flex;gap:10px;flex-wrap:wrap";
    for (const [item, item2] of [["Reload", false], ["Standard game", true]]) {
      const buttonEl = document.createElement("button");
      buttonEl.textContent = item;
      buttonEl.style.cssText = "border:1px solid #698db0;border-radius:7px;padding:8px 12px;background:#1a2d44;color:#fff;cursor:pointer;font:inherit";
      buttonEl.addEventListener("click", () => {
        const url = new URL(target.location && target.location.href || "https://starblast.io/");
        if (item2) {
          url.searchParams.set("medusa", "off");
        }
        target.location.replace(url.href);
      });
      divEl.appendChild(buttonEl);
    }
    el.appendChild(divEl);
    if (target.__MEDUSA_ENGINE && target.__MEDUSA_ENGINE.releaseControls) {
      target.__MEDUSA_ENGINE.releaseControls();
    }
  }
  function release(arg1) {
    if (!arg1 || !weakSet.has(arg1) || weakSet2.has(arg1)) {
      return false;
    }
    weakSet2.add(arg1);
    const v1 = map.get(arg1);
    if (v1) {
      v1.canvas.removeEventListener("webglcontextlost", v1.lost);
      v1.canvas.removeEventListener("webglcontextrestored", v1.restored);
      map.delete(arg1);
    }
    if (el && el.getAttribute("data-state") === "lost" && ![...map.values()].some(item => item.isLost)) {
      fn1();
    }
    if (target.__MEDUSA_ENGINE && target.__MEDUSA_ENGINE.forgetRenderer) {
      target.__MEDUSA_ENGINE.forgetRenderer(arg1);
    }
    if (target.__DT_ENGINE_TRAILS && target.__DT_ENGINE_TRAILS.unregisterRenderer) {
      target.__DT_ENGINE_TRAILS.unregisterRenderer(arg1);
    }
    try {
      if (typeof arg1.dispose === "function") {
        arg1.dispose();
      }
    } catch (err) {}
    try {
      if (typeof arg1.forceContextLoss === "function") {
        arg1.forceContextLoss();
      }
    } catch (err) {}
    return true;
  }
  function fn3(arg2) {
    const domElement = arg2.domElement;
    if (!domElement || typeof domElement.addEventListener !== "function") {
      return;
    }
    const v2 = {
      canvas: domElement,
      isLost: false,
      lost() {
        v2.isLost = true;
        fn2("The graphics connection was interrupted. Waiting for the browser to restore it.", "lost");
      },
      restored() {
        v2.isLost = false;
        if (![...map.values()].some(item => item.isLost) && el && el.getAttribute("data-state") === "lost") {
          fn1();
        }
      }
    };
    map.set(arg2, v2);
    domElement.addEventListener("webglcontextlost", v2.lost);
    domElement.addEventListener("webglcontextrestored", v2.restored);
  }
  function create(arg3, arg4) {
    let v3;
    try {
      if (stopped || !arg3 || typeof arg3.WebGLRenderer !== "function") {
        throw Error("Graphics library is unavailable");
      }
      v3 = new arg3.WebGLRenderer(arg4);
      weakSet.add(v3);
      if (typeof v3.getContext === "function") {
        const ctx = v3.getContext();
        if (!ctx || typeof ctx.isContextLost === "function" && ctx.isContextLost()) {
          throw Error("WebGL context is unavailable");
        }
      }
      fn3(v3);
      return v3;
    } catch (err) {
      if (v3) {
        release(v3);
      }
      failures++;
      fn2("This browser could not start WebGL. Check graphics acceleration, then reload or try the standard game.", "unavailable");
      const error = Error("Medusa Client: WebGL renderer could not start");
      error.code = "MEDUSA_WEBGL_START_FAILED";
      error.cause = err;
      throw error;
    }
  }
  function onPagehide() {
    if (stopped) {
      return;
    }
    stopped = true;
    for (const item of [...map.keys()]) {
      release(item);
    }
    fn1();
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("pagehide", onPagehide, {
      once: true
    });
  }
  return {
    create: create,
    release: release,
    shutdown: onPagehide,
    status: () => ({
      renderers: map.size,
      failures: failures,
      lost: [...map.values()].filter(item => item.isLost).length,
      stopped: stopped
    })
  };
}
function createMenuAtmosphere(target2, arg5) {
  'use strict';

  arg5 = arg5 || {};
  const document = target2.document;
  const list2 = [{
    id: "off",
    name: "Off"
  }, ...(arg5.menuAtmospheres || [])];
  const map = new Map((arg5.spaceBackgrounds || []).map(item => [item.id, item.src]));
  let value = "nebula";
  let el = null;
  let target = null;
  let el2 = null;
  let el3 = null;
  let open = false;
  let stopped = false;
  let v4 = 0;
  let v5 = 0;
  let v6 = 0;
  let v7 = 1;
  let v8 = 1;
  let v9 = null;
  let v10 = null;
  const v11 = {};
  const list = [];
  try {
    const medusa_menu_atmosphere_v1 = target2.localStorage.getItem("medusa_menu_atmosphere_v1");
    if (list2.some(item => item.id === medusa_menu_atmosphere_v1)) {
      value = medusa_menu_atmosphere_v1;
    }
  } catch (err) {}
  if (!list2.some(item => item.id === value)) {
    value = "off";
  }
  try {
    if (typeof target2.matchMedia === "function") {
      v10 = target2.matchMedia("(prefers-reduced-motion: reduce)");
    }
  } catch (err) {}
  function fn4(target2, eventName, handler, arg6) {
    if (target2 && typeof target2.addEventListener === "function") {
      target2.addEventListener(eventName, handler, arg6);
      list.push([target2, eventName, handler, arg6]);
    }
  }
  function fn5() {
    return !stopped && !!el && !!el.isConnected && !!target && !!target.isConnected && !!open && !el.hidden && !document.hidden && value !== "off";
  }
  function fn6() {
    return fn5() && (!v10 || !v10.matches) && (!document.documentElement || document.documentElement.getAttribute("data-dt-effects") !== "off");
  }
  function fn7() {
    if (v4 && typeof target2.cancelAnimationFrame === "function") {
      target2.cancelAnimationFrame(v4);
    }
    v4 = 0;
  }
  function fn8() {
    v5 = v6 = 0;
    if (el2) {
      el2.style.setProperty("--dt-menu-x", "0px");
      el2.style.setProperty("--dt-menu-y", "0px");
    }
  }
  function fn9() {
    v7 = Math.max(1, target2.innerWidth || document.documentElement && document.documentElement.clientWidth || 1000);
    v8 = Math.max(1, target2.innerHeight || document.documentElement && document.documentElement.clientHeight || 800);
  }
  function fn10() {
    v4 = 0;
    if (!fn6()) {
      return;
    }
    const found = list2.find(item => item.id === value);
    if (!found) {
      return;
    }
    el2.style.setProperty("--dt-menu-x", (v5 * found.depth).toFixed(2) + "px");
    el2.style.setProperty("--dt-menu-y", (v6 * found.depth).toFixed(2) + "px");
  }
  function onPointermove(event) {
    if (!fn6() || event.pointerType === "touch" || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }
    v5 = Math.max(-1, Math.min(1, event.clientX / v7 * 2 - 1));
    v6 = Math.max(-1, Math.min(1, event.clientY / v8 * 2 - 1));
    if (!v4 && typeof target2.requestAnimationFrame === "function") {
      v4 = target2.requestAnimationFrame(fn10);
    }
  }
  function onPointerleave() {
    fn7();
    fn8();
  }
  function fn11(arg7) {
    if (/^data:image\/webp;base64,/.test(arg7 || "")) {
      return "url(\"" + arg7 + "\")";
    } else {
      return "none";
    }
  }
  function fn12(arg8) {
    let v12 = arg8.seed >>> 0;
    function fn17() {
      v12 = Math.imul(v12, 1664525) + 1013904223 >>> 0;
      return v12 / 4294967296;
    }
    const list2 = [];
    for (let i = 0; i < 72; i++) {
      const v13 = Math.round(fn17() * 1200);
      const v14 = Math.round(fn17() * 800);
      const v15 = i % 13 === 0 ? 1.65 : 0.65 + fn17() * 0.5;
      const fixed = (0.25 + fn17() * 0.55).toFixed(2);
      list2.push("<circle cx=\"" + v13 + "\" cy=\"" + v14 + "\" r=\"" + v15.toFixed(2) + "\" opacity=\"" + fixed + "\"/>");
      if (i % 19 === 0) {
        list2.push("<path d=\"M" + (v13 - 4) + " " + v14 + "h8M" + v13 + " " + (v14 - 4) + "v8\" opacity=\".45\" stroke=\"rgb(" + arg8.first + ")\" stroke-width=\".6\"/>");
      }
    }
    return "url(\"data:image/svg+xml," + encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1200 800\" fill=\"rgb(" + arg8.first + ")\">" + list2.join("") + "</svg>") + "\")";
  }
  function fn13() {
    if (!el || !el2) {
      return;
    }
    if (value === "off") {
      el.removeAttribute("data-menu-scene");
      el.removeAttribute("data-menu-motion");
      el2.hidden = true;
      fn7();
      fn8();
      fn14();
      return;
    }
    el.setAttribute("data-menu-scene", value);
    el2.hidden = !open || !!document.hidden;
    const found = list2.find(item => item.id === value);
    if (!found) {
      return;
    }
    if (fn5() && v9 !== value) {
      v11.cosmos.style.backgroundImage = fn11(arg5.menuCosmicArt && arg5.menuCosmicArt.src);
      v11.texture.style.backgroundImage = fn11(map.get(found.background));
      v11.stars.style.backgroundImage = fn12(found);
      el2.style.setProperty("--dt-menu-hue", found.hue + "deg");
      el2.style.setProperty("--dt-menu-saturation", String(found.saturation));
      el2.style.setProperty("--dt-menu-first", found.first);
      el2.style.setProperty("--dt-menu-second", found.second);
      el2.style.setProperty("--dt-menu-mirror", String(found.mirror));
      el2.style.setProperty("--dt-menu-blend", String(found.blend));
      el2.style.setProperty("--dt-menu-drift", found.duration + "s");
      v9 = value;
    }
    el.setAttribute("data-menu-motion", fn6() ? "on" : "off");
    if (!fn6()) {
      fn7();
      fn8();
    }
  }
  function fn14() {
    for (const item of ["cosmos", "texture", "stars"]) {
      if (v11[item]) {
        v11[item].style.backgroundImage = "none";
      }
    }
    v9 = null;
  }
  function setOpen(arg9) {
    if (stopped) {
      return;
    }
    open = !!arg9;
    if (!open) {
      fn7();
      fn8();
      fn14();
    }
    fn9();
    fn13();
  }
  function refresh() {
    if (stopped) {
      return;
    }
    fn9();
    fn13();
  }
  function choose(id) {
    if (stopped || !list2.some(item => item.id === id)) {
      return;
    }
    value = id;
    try {
      target2.localStorage.setItem("medusa_menu_atmosphere_v1", id);
    } catch (err) {}
    fn7();
    fn8();
    fn13();
    fn15();
  }
  function fn15() {
    if (!el3) {
      return;
    }
    const selectEl = el3.querySelector("select");
    if (selectEl && selectEl.value !== value) {
      selectEl.value = value;
    }
  }
  function fn16() {
    fn7();
    fn14();
    if (target) {
      target.removeEventListener("pointermove", onPointermove);
      target.removeEventListener("pointerleave", onPointerleave);
      target.removeEventListener("pointercancel", onPointerleave);
    }
    if (el) {
      el.removeAttribute("data-menu-scene");
      el.removeAttribute("data-menu-motion");
    }
    if (el2) {
      el2.remove();
    }
    el2 = null;
    target = null;
    el = null;
    v9 = null;
  }
  function mount(el4, parentNode) {
    if (stopped || !el4) {
      return;
    }
    const dtDrawerEl = el4.querySelector(".dt-drawer");
    if (!dtDrawerEl) {
      return;
    }
    if (document.head && !document.getElementById("dt-menu-atmosphere-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "dt-menu-atmosphere-style";
      styleEl.textContent = arg5.menuAtmosphereCss || "";
      document.head.appendChild(styleEl);
    }
    if (el !== el4 || target !== dtDrawerEl || !el2 || !el2.isConnected) {
      fn16();
      el = el4;
      target = dtDrawerEl;
      el2 = document.createElement("div");
      el2.className = "dt-menu-atmosphere";
      el2.setAttribute("aria-hidden", "true");
      el2.hidden = true;
      for (const item of ["cosmos", "texture", "haze", "stars", "glow", "vignette"]) {
        const divEl = document.createElement("div");
        divEl.className = "dt-menu-plane dt-menu-plane-" + item;
        el2.appendChild(divEl);
        v11[item] = divEl;
      }
      target.insertBefore(el2, target.firstChild);
      target.addEventListener("pointermove", onPointermove, {
        passive: true
      });
      target.addEventListener("pointerleave", onPointerleave, {
        passive: true
      });
      target.addEventListener("pointercancel", onPointerleave, {
        passive: true
      });
      open = !el4.hidden;
      fn13();
    }
    if (parentNode && (!el3 || !el3.isConnected || el3.parentNode !== parentNode)) {
      if (el3) {
        el3.remove();
      }
      el3 = document.createElement("label");
      el3.className = "dt-setting-row dt-menu-atmosphere-control";
      el3.id = "dt-menu-atmosphere-control";
      el3.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center";
      const spanEl = document.createElement("span");
      spanEl.style.cssText = "flex:1;min-width:125px";
      const strongEl = document.createElement("strong");
      const smallEl = document.createElement("small");
      strongEl.textContent = "Menu atmosphere";
      smallEl.textContent = "20 scenes · Motion follows Interface effects";
      spanEl.append(strongEl, smallEl);
      const selectEl = document.createElement("select");
      selectEl.className = "dt-button";
      selectEl.setAttribute("aria-label", "Menu atmosphere");
      selectEl.setAttribute("data-menu-atmosphere-choice", "");
      selectEl.style.cssText = "max-width:100%;min-width:145px;color:var(--dt-text);background:var(--dt-panel,#101827)";
      for (const item of list2) {
        const optionEl = document.createElement("option");
        optionEl.value = item.id;
        optionEl.textContent = item.name;
        selectEl.appendChild(optionEl);
      }
      selectEl.value = value;
      selectEl.addEventListener("change", () => choose(selectEl.value));
      el3.append(spanEl, selectEl);
      const summaryEl = parentNode.querySelector("summary");
      if (summaryEl) {
        summaryEl.insertAdjacentElement("afterend", el3);
      } else {
        parentNode.appendChild(el3);
      }
    }
    fn15();
  }
  function shutdown() {
    if (stopped) {
      return;
    }
    stopped = true;
    fn7();
    fn14();
    fn16();
    if (el3) {
      el3.remove();
    }
    el3 = null;
    for (const [item, item2, item3, item4] of list) {
      if (typeof item.removeEventListener === "function") {
        item.removeEventListener(item2, item3, item4);
      }
    }
    list.length = 0;
    if (v10 && typeof v10.removeListener === "function" && typeof v10.addEventListener !== "function") {
      v10.removeListener(refresh);
    }
  }
  fn4(target2, "resize", refresh, {
    passive: true
  });
  fn4(target2, "pagehide", shutdown, {
    once: true
  });
  fn4(document, "visibilitychange", () => {
    if (document.hidden) {
      fn7();
      fn8();
      fn14();
    }
    fn13();
  });
  fn4(document, "dt-theme-change", refresh);
  if (v10) {
    if (typeof v10.addEventListener === "function") {
      fn4(v10, "change", refresh);
    } else if (typeof v10.addListener === "function") {
      v10.addListener(refresh);
    }
  }
  return {
    definitions: list2,
    mount: mount,
    setOpen: setOpen,
    refresh: refresh,
    choose: choose,
    shutdown: shutdown,
    status: () => ({
      selected: value,
      open: open,
      active: fn5(),
      moving: fn6(),
      pendingFrame: !!v4,
      layerCount: el2 ? 1 : 0,
      planeCount: el2 ? 6 : 0,
      artBound: v9 !== null,
      stopped: stopped
    })
  };
}
function createSpaceArt() {
  'use strict';

  const TAU = Math.PI * 2;
  const portals = [["cyan-warp", "Cyan Warp", "#62e9ff", 0], ["violet-rift", "Violet Rift", "#b390ff", 1], ["golden-gate", "Golden Gate", "#ffd27d", 2], ["crystal-portal", "Crystal Portal", "#a6e9ff", 3], ["emerald-gate", "Emerald Gate", "#79edbb", 4], ["solar-bloom", "Solar Bloom", "#ffc283", 5], ["frost-vortex", "Frost Vortex", "#c3f6ff", 6], ["ruby-hex", "Ruby Hex", "#ff91b4", 7], ["starlight", "Starlight", "#e4e6ff", 8], ["midnight-eye", "Midnight Eye", "#9691ee", 9], ["holo-grid", "Holo Grid", "#80e9e1", 10], ["aurora-loop", "Aurora Loop", "#8af0d0", 11], ["rose-spiral", "Rose Spiral", "#f4abdf", 12], ["cobalt-tunnel", "Cobalt Tunnel", "#8dbaff", 13], ["jade-runes", "Jade Runes", "#a3e7c8", 14], ["phoenix-rise", "Phoenix Rise", "#ffca8a", 15], ["pearl-ripple", "Pearl Ripple", "#e8dfef", 16], ["obsidian-shards", "Obsidian Shards", "#b4a5ef", 17], ["comet-gate", "Comet Gate", "#a3ddff", 18], ["medusa-gate", "Medusa Gate", "#7fdced", 19]].map(([item, item2, item3, item4]) => ({
    id: item,
    name: item2,
    color: item3,
    kind: item4
  }));
  const reactions = [["gentle", "Gentle", 0.08, 0.06, 1, "#9fefff"], ["playful", "Playful", 0.26, 0.16, 1.5, "#b8f6dc"], ["sentinel", "Sentinel", 0.04, 0.04, 0.8, "#a6caff"], ["cheerful", "Cheerful", 0.15, 0.2, 1.6, "#ffe0ac"], ["neon-beat", "Neon Beat", 0.18, 0.11, 1.9, "#c0b2ff"], ["medusa-dance", "Medusa Dance", 0.22, 0.13, 1.25, "#8deaff"], ["arctic", "Arctic", 0.05, 0.07, 0.9, "#d8f8ff"], ["solar", "Solar", 0.13, 0.12, 1.2, "#ffe2aa"], ["phantom", "Phantom", 0.11, 0.08, 0.65, "#c2b5ed"], ["royal", "Royal", 0.07, 0.09, 0.85, "#ecd4a7"], ["cyber", "Cyber", 0.09, 0.05, 1.8, "#8cebdd"], ["star-dance", "Star Dance", 0.23, 0.18, 1.4, "#e5e6ff"], ["ripple", "Ripple", 0.1, 0.14, 1.1, "#9be9f5"], ["spiral", "Spiral", 0.35, 0.1, 1.35, "#dbb0ec"], ["prism", "Prism", 0.16, 0.09, 1.55, "#c7eaf8"], ["pulse", "Pulse", 0.06, 0.22, 1.7, "#a4d9ff"], ["firefly", "Firefly", 0.12, 0.17, 1.45, "#eff4bb"], ["comet", "Comet", 0.28, 0.07, 1.65, "#b7d8fc"], ["orbit", "Orbit", 0.3, 0.12, 1.15, "#e8d7ac"], ["calm", "Calm", 0.025, 0.035, 0.55, "#c8e6ef"]].map(([item, item2, item3, item4, item5, item6], index) => ({
    id: item,
    name: item2,
    turn: item3,
    bounce: item4,
    rate: item5,
    color: item6,
    stretch: 0.07 + index % 5 * 0.022,
    hit: 0.12 + index % 4 * 0.025
  }));
  function drawPath(ctx, items, strokeStyle, lineWidth) {
    ctx.beginPath();
    items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
  }
  function drawPath2(ctx, items, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 2;
      ctx.stroke();
    }
  }
  function drawEllipse(ctx, radiusX, radiusY, strokeStyle, lineWidth, rotation = 0, startAngle = 0, endAngle = TAU) {
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX, radiusY, rotation, startAngle, endAngle);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
  }
  function portal(ctx, arg10, arg11, arg12) {
    ctx.save();
    ctx.clearRect(0, 0, arg11, arg11);
    if (!arg10) {
      ctx.restore();
      return;
    }
    ctx.scale(arg11 / 256, arg11 / 256);
    ctx.translate(128, 125);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const v16 = arg12 / 8 * TAU;
    const color = arg10.color;
    const kind = arg10.kind;
    const v17 = 74 + Math.sin(v16 * 0.5) * 8;
    const v18 = v17 * 0.56;
    ctx.scale(1 + Math.sin(v16) * 0.018, 1 + Math.cos(v16) * 0.025);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    if (kind === 0) {
      drawEllipse(ctx, v17, v18, color, 4);
      drawEllipse(ctx, v17 - 11, v18 - 7, color + "a0", 2);
      for (let i = 0; i < 12; i++) {
        const v19 = i * TAU / 12 + v16 * 0.15;
        drawPath(ctx, [[Math.cos(v19) * (v17 + 6), Math.sin(v19) * (v18 + 4)], [Math.cos(v19) * (v17 + 20), Math.sin(v19) * (v18 + 15)]], color + "c0", 2);
      }
    } else if (kind === 1) {
      drawEllipse(ctx, v17, v18, color, 5, 0.16, 0 + v16 * 0.3, Math.PI * 0.85 + v16 * 0.3);
      drawEllipse(ctx, v17, v18, color, 5, 0.16, Math.PI + v16 * 0.3, Math.PI * 1.85 + v16 * 0.3);
      drawPath(ctx, [[0, -87], [7, -36], [-5, 4], [5, 47], [0, 84]], color, 3);
    } else if (kind === 2) {
      for (let i = 0; i < 8; i++) {
        const v20 = i * TAU / 8 + v16 * 0.08;
        drawEllipse(ctx, v17, v18, color, 6, 0, v20, v20 + 0.48);
      }
      drawEllipse(ctx, v17 - 17, v18 - 9, color + "b0", 2);
      for (let i = 0; i < 12; i++) {
        const v21 = i * TAU / 12;
        drawPath2(ctx, [[Math.cos(v21) * 95 - 3, Math.sin(v21) * 56 - 3], [Math.cos(v21) * 95 + 3, Math.sin(v21) * 56 - 3], [Math.cos(v21) * 95 + 3, Math.sin(v21) * 56 + 3], [Math.cos(v21) * 95 - 3, Math.sin(v21) * 56 + 3]], color + "c0");
      }
    } else if (kind === 3 || kind === 17) {
      drawEllipse(ctx, v17 - 7, v18 - 5, color + "a0", 2);
      for (let i = 0; i < 9; i++) {
        const v22 = i * TAU / 9 + v16 * 0.12;
        const v23 = Math.cos(v22) * v17;
        const v24 = Math.sin(v22) * v18;
        const v25 = kind === 17 ? 18 : 12;
        drawPath2(ctx, [[v23, v24 - v25], [v23 + 7, v24], [v23, v24 + v25], [v23 - 7, v24]], kind === 17 ? "#393c68c0" : color + "90", color, 1.5);
      }
    } else if (kind === 4 || kind === 7) {
      const v26 = kind === 4 ? 8 : 6;
      const list = [];
      for (let i = 0; i < v26; i++) {
        const v27 = i * TAU / v26 + v16 * 0.06;
        list.push([Math.cos(v27) * v17, Math.sin(v27) * v18]);
      }
      drawPath2(ctx, list, null, color, 4);
      drawPath2(ctx, list.map(item => [item[0] * 0.8, item[1] * 0.8]), null, color + "80", 2);
      for (const [item, item2] of list) {
        fn18(item, item2, 3, color);
      }
    } else if (kind === 5) {
      for (let i = 0; i < 16; i++) {
        const v28 = i * TAU / 16;
        drawPath(ctx, [[Math.cos(v28) * 22, Math.sin(v28) * 12], [Math.cos(v28) * (v17 + Math.sin(v16 + i) * 9), Math.sin(v28) * (v18 + Math.sin(v16 + i) * 6)]], color + (i % 2 ? "aa" : "e0"), i % 2 ? 2 : 4);
      }
      drawEllipse(ctx, 42, 24, color, 3);
    } else if (kind === 6) {
      for (let i = 0; i < 6; i++) {
        const v29 = i * TAU / 6;
        drawPath(ctx, [[0, 0], [Math.cos(v29) * v17, Math.sin(v29) * v18]], color, 2);
        for (const item of [-1, 1]) {
          drawPath(ctx, [[Math.cos(v29) * v17 * 0.68, Math.sin(v29) * v18 * 0.68], [Math.cos(v29 + item * 0.2) * v17 * 0.46, Math.sin(v29 + item * 0.2) * v18 * 0.46]], color, 2);
        }
      }
      drawEllipse(ctx, v17, v18, color + "90", 2);
    } else if (kind === 8) {
      drawEllipse(ctx, v17 - 6, v18 - 4, color + "80", 2);
      for (let i = 0; i < 10; i++) {
        const v30 = i * TAU / 10 + v16 * 0.1;
        const v31 = Math.cos(v30) * v17;
        const v32 = Math.sin(v30) * v18;
        const v33 = 4 + i % 3;
        drawPath2(ctx, [[v31, v32 - v33], [v31 + 2, v32 - 2], [v31 + v33, v32], [v31 + 2, v32 + 2], [v31, v32 + v33], [v31 - 2, v32 + 2], [v31 - v33, v32], [v31 - 2, v32 - 2]], color);
      }
    } else if (kind === 9) {
      drawPath2(ctx, [[-92, 0], [-43, -32], [0, -46], [43, -32], [92, 0], [43, 32], [0, 46], [-43, 32]], null, color, 3);
      drawEllipse(ctx, 29, 39, color, 3, 0.2 + v16 * 0.1);
      drawEllipse(ctx, 9, 25, color + "c0", 3);
    } else if (kind === 10) {
      for (let v34 = -3; v34 <= 3; v34++) {
        drawPath(ctx, [[-88, v34 * 13], [88, v34 * 13]], color + "a0", 1.5);
        drawPath(ctx, [[v34 * 25, -42], [v34 * 25, 42]], color + "a0", 1.5);
      }
      drawPath2(ctx, [[-91, -47], [91, -47], [91, 47], [-91, 47]], null, color, 3);
      drawEllipse(ctx, 36, 23, color, 3);
    } else if (kind === 11) {
      for (let i = 0; i < 4; i++) {
        const list = [];
        for (let v35 = -94; v35 <= 94; v35 += 6) {
          list.push([v35, Math.sin(v35 * 0.04 + v16 + i * 0.7) * (18 + i * 3)]);
        }
        drawPath(ctx, list, i % 2 ? "#b5a8ffb0" : color + "d0", 3);
      }
      drawEllipse(ctx, v17, v18, color + "70", 2);
    } else if (kind === 12) {
      for (let i = 0; i < 3; i++) {
        const list = [];
        for (let j = 0; j < 35; j++) {
          const v36 = j * 0.18 + i * TAU / 3 + v16 * 0.2;
          const v37 = 12 + j * 2.2;
          list.push([Math.cos(v36) * v37, Math.sin(v36) * v37 * 0.56]);
        }
        drawPath(ctx, list, color, 3);
      }
    } else if (kind === 13 || kind === 16) {
      for (let i = 0; i < 5; i++) {
        const v38 = (i / 5 + arg12 / 40) % 1;
        drawEllipse(ctx, 20 + v38 * 76, 11 + v38 * 43, color, 1 + i % 2, kind === 16 ? 0.1 : 0);
      }
      if (kind === 16) {
        for (let i = 0; i < 6; i++) {
          fn18(Math.cos(i * TAU / 6 + v16 * 0.2) * v17, Math.sin(i * TAU / 6 + v16 * 0.2) * v18, 3, color);
        }
      }
    } else if (kind === 14) {
      drawEllipse(ctx, v17, v18, color, 3);
      for (let i = 0; i < 12; i++) {
        ctx.save();
        const v39 = i * TAU / 12;
        ctx.translate(Math.cos(v39) * v17, Math.sin(v39) * v18);
        ctx.rotate(v39);
        drawPath(ctx, [[0, -7], [0, 7]], color, 2);
        drawPath(ctx, [[0, -5], [6, 0], [0, 4]], color, 2);
        ctx.restore();
      }
    } else if (kind === 15) {
      drawEllipse(ctx, 67, 30, color + "70", 2);
      for (const item of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const v40 = item * (20 + i * 11);
          const v41 = -54 + i * 12 + Math.sin(v16 + i * 0.3) * 3;
          ctx.beginPath();
          ctx.moveTo(item * (9 + i * 4), 27);
          ctx.quadraticCurveTo(v40 * 0.55, v41 - 12, v40, v41);
          ctx.quadraticCurveTo(v40 + item * 5, v41 + 12, item * (15 + i * 4), 33);
          ctx.closePath();
          ctx.fillStyle = color + "55";
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      drawPath2(ctx, [[0, -23], [7, -3], [0, 19], [-7, -3]], color + "d0");
    } else if (kind === 18) {
      for (let i = 0; i < 6; i++) {
        const v42 = i * TAU / 6 + v16 * 0.12;
        ctx.save();
        ctx.rotate(v42);
        ctx.beginPath();
        ctx.moveTo(82, 0);
        ctx.bezierCurveTo(72, -21, 49, -20, 25, -7);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        fn18(82, 0, 4, color);
        ctx.restore();
      }
    } else if (kind === 19) {
      drawEllipse(ctx, v17, v18, color + "c0", 3);
      ctx.beginPath();
      ctx.ellipse(0, -13, 31, 23, 0, Math.PI, TAU);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-22 + i * 9, -10);
        ctx.bezierCurveTo(-32 + i * 10, 24, -17 + i * 10 + Math.sin(v16 + i) * 9, 49, -28 + i * 11, 75);
        ctx.strokeStyle = i % 2 ? "#b2a4f5" : color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
    function fn18(x, y, radius, fillStyle) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
  }
  function companion(ctx, image, arg13, arg14) {
    ctx.save();
    ctx.clearRect(0, 0, 128, 128);
    if (arg14 === 0) {
      ctx.drawImage(image, 0, 0);
    } else if (arg14 === 1) {
      ctx.translate(64, 64);
      ctx.transform(0.97, 0.025, 0, 1.06, -64, -65);
      ctx.drawImage(image, 0, 0);
    } else if (arg14 === 2) {
      ctx.drawImage(image, 0, 0, 128, 60, 3, 5, 122, 57);
      for (let i = 0; i < 4; i++) {
        const v43 = 117 - i * 11;
        const v44 = (128 - v43) / 2 + Math.sin(arg13 * 0.8 + i) * 3;
        ctx.drawImage(image, 0, 60 + i * 17, 128, 17, v44, 61 + i * 11, v43, 13);
      }
    } else {
      ctx.drawImage(image, 0, 0, 128, 62, 0, 0, 128, 62);
      ctx.drawImage(image, 0, 62, 128, 66, -6, 59, 140, 66);
      ctx.fillStyle = "#fff0af";
      for (let i = 0; i < 4; i++) {
        const v45 = [17, 110, 23, 105][i];
        const v46 = [24, 34, 83, 98][i] + Math.sin(arg13 * 0.8 + i) * 3;
        const v47 = 3 + i % 2;
        ctx.beginPath();
        ctx.moveTo(v45, v46 - v47);
        ctx.lineTo(v45 + 1, v46 - 1);
        ctx.lineTo(v45 + v47, v46);
        ctx.lineTo(v45 + 1, v46 + 1);
        ctx.lineTo(v45, v46 + v47);
        ctx.lineTo(v45 - 1, v46 + 1);
        ctx.lineTo(v45 - v47, v46);
        ctx.lineTo(v45 - 1, v46 - 1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }
  return {
    portals: portals,
    reactions: reactions,
    portal: portal,
    companion: companion
  };
}
function createSpaceEffects(target, arg15) {
  'use strict';

  arg15 = arg15 || {};
  const spaceArt = createSpaceArt();
  const supported = !arg15.compatibility || arg15.compatibility.spaceEffects !== false;
  const background = [{
    id: "native",
    name: "Original"
  }, ...(arg15.spaceBackgrounds || [])];
  const portal = [{
    id: "off",
    name: "Off"
  }, ...spaceArt.portals];
  const reaction = [{
    id: "off",
    name: "Off"
  }, ...spaceArt.reactions];
  const v48 = {
    background: background,
    portal: portal,
    reaction: reaction
  };
  const v49 = {
    background: "medusa_space_background_v1",
    portal: "medusa_spawn_portal_v1",
    reaction: "medusa_pet_reaction_v1"
  };
  const map = new Map();
  const map2 = new Map();
  const weakSet = new WeakSet();
  const weakSet2 = new WeakSet();
  const v50 = {
    background: fn20("background", "native"),
    portal: fn20("portal", "cyan-warp"),
    reaction: fn20("reaction", "gentle")
  };
  let v51 = null;
  let stopped = false;
  let v52 = null;
  let v53 = 0;
  let v54 = -Infinity;
  let v55 = null;
  let v56 = null;
  let v57 = null;
  let v58 = null;
  const v59 = {
    state: 0,
    x: 1,
    y: 1,
    rotation: 0,
    lift: 0,
    r: 1,
    g: 1,
    b: 1
  };
  const arr = [0, 240, 620, 1400];
  function fn19() {
    if (target.performance && typeof target.performance.now === "function") {
      return target.performance.now();
    } else {
      return Date.now();
    }
  }
  function fn20(arg16, arg17) {
    try {
      const stored = target.localStorage.getItem(v49[arg16]);
      if (v48[arg16].some(item => item.id === stored)) {
        return stored;
      } else {
        return arg17;
      }
    } catch (err) {
      return arg17;
    }
  }
  function createCanvas(width, height) {
    const canvasEl = target.document.createElement("canvas");
    canvasEl.width = width;
    canvasEl.height = height;
    return canvasEl;
  }
  function fn21() {
    const found = reaction.find(item => item.id === v50.reaction);
    v58 = found && found.id !== "off" ? {
      ...found,
      r: parseInt(found.color.slice(1, 3), 16) / 255,
      g: parseInt(found.color.slice(3, 5), 16) / 255,
      b: parseInt(found.color.slice(5, 7), 16) / 255
    } : null;
  }
  fn21();
  function fn22() {
    while (map.size > 2) {
      let v60 = false;
      for (const [item, item2] of map) {
        if (item === v50.background || v51 && v51.backgroundAsset === item2) {
          continue;
        }
        item2.image.onload = item2.image.onerror = null;
        if (item2.texture) {
          item2.texture.dispose();
        }
        map.delete(item);
        v60 = true;
        break;
      }
      if (!v60) {
        break;
      }
    }
  }
  function fn23(id, arg18) {
    if (id === "native") {
      return null;
    }
    let v61 = map.get(id);
    if (!v61) {
      const found = background.find(item => item.id === id);
      if (!found || !/^data:image\/webp;base64,/.test(found.src || "")) {
        return null;
      }
      const imgEl = target.document.createElement("img");
      v61 = {
        image: imgEl,
        ready: false,
        broken: false,
        texture: null,
        id: id
      };
      map.set(id, v61);
      imgEl.onload = () => {
        if (stopped || map.get(id) !== v61) {
          return;
        }
        v61.ready = imgEl.naturalWidth > 0 || imgEl.width > 0;
      };
      imgEl.onerror = () => {
        if (map.get(id) === v61) {
          v61.broken = true;
        }
      };
      imgEl.src = found.src;
      fn22();
    }
    if (arg18 && v61.ready && !v61.texture) {
      v61.texture = new arg18.Texture(v61.image);
      v61.texture.minFilter = v61.texture.magFilter = arg18.LinearFilter;
      v61.texture.generateMipmaps = false;
      v61.texture.needsUpdate = true;
    }
    return v61;
  }
  function fn24(id, arg19) {
    if (id === "off") {
      return null;
    }
    let v62 = map2.get(id);
    if (!v62) {
      const found = spaceArt.portals.find(portal => portal.id === id);
      if (!found) {
        return null;
      }
      const canvas = createCanvas(1024, 512);
      const canvas2 = createCanvas(256, 256);
      const ctx = canvas.getContext("2d");
      const ctx2 = canvas2.getContext("2d");
      if (!ctx || !ctx2) {
        throw Error("Portal canvas unavailable");
      }
      for (let i = 0; i < 8; i++) {
        spaceArt.portal(ctx2, found, 256, i);
        ctx.drawImage(canvas2, i % 4 * 256, Math.floor(i / 4) * 256);
      }
      v62 = {
        image: canvas,
        texture: null
      };
      map2.set(id, v62);
      while (map2.size > 2) {
        const value = map2.keys().next().value;
        const v63 = map2.get(value);
        if (v63.texture) {
          v63.texture.dispose();
        }
        map2.delete(value);
      }
    }
    if (arg19 && !v62.texture) {
      v62.texture = new arg19.Texture(v62.image);
      v62.texture.minFilter = v62.texture.magFilter = arg19.LinearFilter;
      v62.texture.generateMipmaps = false;
      v62.texture.repeat.set(0.25, 0.5);
      v62.texture.needsUpdate = true;
    }
    return v62;
  }
  function fn25(arg20) {
    if (arg20 && arg20.portal) {
      if (arg20.portal.parent) {
        arg20.portal.parent.remove(arg20.portal);
      }
      arg20.portal.material.dispose();
      arg20.portal = null;
      arg20.spawnTime = -Infinity;
    }
  }
  function fn26(arg21) {
    if (arg21 && arg21.backgroundAsset) {
      if (arg21.world.background === arg21.backgroundAsset.texture) {
        arg21.world.background = arg21.backgroundOriginal;
      }
      arg21.backgroundAsset = null;
    }
  }
  function dispose(scene) {
    if (v51 && (!scene || scene === v51.scene)) {
      fn25(v51);
      fn26(v51);
      v51 = null;
      fn22();
    }
  }
  function fn27(arg22) {
    return !!arg22 && !arg22.welcome && !!arg22.ship && !!arg22.O1Ol1 && !!arg22.O1Ol1.status && !!arg22.l1O0I && arg22.O1Ol1 === arg22.l1O0I.O1Ol1 && !!arg22.I0Oll;
  }
  function fn28(arg23) {
    if (v50.background === "native") {
      fn26(arg23);
      return;
    }
    const backgroundAsset = fn23(v50.background, arg23.T);
    if (!backgroundAsset || !backgroundAsset.texture) {
      return;
    }
    if (arg23.backgroundAsset !== backgroundAsset) {
      if (!arg23.backgroundAsset || arg23.world.background !== arg23.backgroundAsset.texture) {
        arg23.backgroundOriginal = arg23.world.background;
      }
      arg23.world.background = backgroundAsset.texture;
      arg23.backgroundAsset = backgroundAsset;
      fn22();
    }
  }
  function fn29(arg24, spawnTime) {
    if (v50.portal === "off") {
      return;
    }
    const oiii1 = arg24.scene.ship.OIII1;
    const v64 = oiii1 && oiii1.parent;
    if (!v64) {
      return;
    }
    const v65 = fn24(v50.portal, arg24.T);
    if (!v65) {
      return;
    }
    if (!arg24.portal) {
      arg24.portal = new arg24.T.Sprite(new arg24.T.SpriteMaterial({
        map: v65.texture,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false
      }));
      arg24.portal.name = "MedusaSpawnPortal";
      arg24.portal.frustumCulled = false;
    }
    v64.add(arg24.portal);
    arg24.portal.material.map = v65.texture;
    arg24.portal.position.copy(oiii1.position);
    arg24.portal.position.z -= 0.1;
    const geometry = arg24.scene.ship.geometry || arg24.scene.ship.IIl1l && arg24.scene.ship.IIl1l.geometry;
    if (geometry && !geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const v66 = geometry && geometry.boundingBox;
    arg24.portalSize = v66 ? Math.max((v66.max.x - v66.min.x) * Math.abs(oiii1.scale.x), (v66.max.y - v66.min.y) * Math.abs(oiii1.scale.y)) * 2.1 : 24;
    arg24.spawnTime = spawnTime;
    arg24.portal.visible = true;
  }
  function fn30(config, arg25) {
    if (!config.portal) {
      return;
    }
    const v67 = (arg25 - config.spawnTime) / 1150;
    if (!config.alive || v67 < 0 || v67 >= 1) {
      config.portal.visible = false;
      return;
    }
    const v68 = Math.min(7, Math.floor(v67 * 8));
    const v69 = config.portalSize * (0.6 + v67 * 0.55);
    config.portal.scale.set(v69, v69, 1);
    config.portal.material.opacity = Math.sin(Math.PI * v67) * Math.min(1, v67 * 12) * 0.9;
    config.portal.material.map.offset.set(v68 % 4 * 0.25, (1 - Math.floor(v68 / 4)) * 0.5);
  }
  function frame(scene, arg26) {
    if (stopped || !supported || !arg26 || weakSet.has(scene)) {
      return;
    }
    if (!fn27(scene)) {
      if (v51 && v51.scene === scene) {
        dispose(scene);
      }
      return;
    }
    try {
      if (v51 && (v51.scene !== scene || v51.player !== scene.O1Ol1 || v51.world !== scene.I0Oll)) {
        dispose();
      }
      if (!v51) {
        v51 = {
          scene: scene,
          player: scene.O1Ol1,
          world: scene.I0Oll,
          T: arg26,
          alive: false,
          type: null,
          shield: null,
          fire: -Infinity,
          hit: -Infinity,
          upgrade: -Infinity,
          spawnTime: -Infinity,
          portal: null,
          backgroundAsset: null,
          backgroundOriginal: scene.I0Oll.background
        };
      }
      const v70 = v51;
      const status = scene.O1Ol1.status;
      const upgrade = fn19();
      const alive = !!status.alive;
      const type = scene.O1Ol1.type && scene.O1Ol1.type.code != null ? scene.O1Ol1.type.code : status.type;
      const shield = Number.isFinite(status.shield) ? status.shield : null;
      const v71 = alive && !v70.alive;
      const v72 = alive && v70.alive && v70.type != null && type != null && v70.type !== type;
      if (v71) {
        v70.fire = v70.hit = v70.upgrade = -Infinity;
        fn29(v70, upgrade);
      } else if (v72) {
        v70.upgrade = upgrade;
      } else if (alive && v70.alive && shield !== null && v70.shield !== null && shield < v70.shield - 0.05) {
        v70.hit = upgrade;
      }
      v70.alive = alive;
      v70.type = type;
      v70.shield = shield;
      if (!alive) {
        v70.fire = v70.hit = v70.upgrade = -Infinity;
        if (v70.portal) {
          v70.portal.visible = false;
        }
      }
      fn28(v70);
      fn30(v70, upgrade);
    } catch (err) {
      dispose(scene);
      weakSet.add(scene);
    }
  }
  function shot(scene, arg27) {
    if (stopped || !supported || !v58 || !v51 || v51.scene !== scene || !v51.alive || !fn27(scene) || !scene.O1Ol1.status.alive || !arg27) {
      return;
    }
    if (arg27.shipid != null && arg27.shipid === scene.O1Ol1.status.id && Number.isInteger(arg27.type) && arg27.type >= 0 && arg27.type <= 3) {
      v51.fire = fn19();
    }
  }
  function reactionState(arg28, arg29) {
    if (!v58 || stopped || !supported) {
      return 0;
    }
    if (arg29) {
      return [0, 1, 2, 3][Math.floor(arg28 / 1650) % 4];
    }
    if (!v51 || !v51.alive) {
      return 0;
    }
    if (arg28 - v51.upgrade >= 0 && arg28 - v51.upgrade < arr[3]) {
      return 3;
    }
    if (arg28 - v51.hit >= 0 && arg28 - v51.hit < arr[2]) {
      return 2;
    }
    if (arg28 - v51.fire >= 0 && arg28 - v51.fire < arr[1]) {
      return 1;
    }
    return 0;
  }
  function companionPose(arg30, arg31) {
    v59.state = reactionState(arg30, arg31);
    v59.x = v59.y = v59.r = v59.g = v59.b = 1;
    v59.rotation = v59.lift = 0;
    if (!v59.state) {
      return v59;
    }
    const v73 = v58;
    const v74 = Math.sin(arg30 * 0.012 * v73.rate);
    const v75 = 0.5 + v74 * 0.5;
    if (v59.state === 1) {
      v59.x = 1 + v73.stretch * v75;
      v59.y = 1 - v73.stretch * 0.45 * v75;
      v59.rotation = v73.turn * v74;
      v59.lift = v73.bounce * 0.35 * v75;
    } else if (v59.state === 2) {
      v59.x = 1 - v73.hit;
      v59.y = 1 - v73.hit * 0.7;
      v59.rotation = v73.turn * 0.4 * v74;
      v59.r = 1;
      v59.g = 0.74;
      v59.b = 0.82;
    } else {
      v59.x = v59.y = 1 + v73.bounce * v75;
      v59.rotation = v73.turn * v74;
      v59.lift = v73.bounce * v75;
      v59.r = 0.8 + v73.r * 0.2;
      v59.g = 0.8 + v73.g * 0.2;
      v59.b = 0.8 + v73.b * 0.2;
    }
    return v59;
  }
  function applyCompanion(arg32, arg33) {
    if (!arg32 || !arg32.material) {
      return;
    }
    const point = companionPose(arg33, false);
    if (point.state) {
      arg32.scale.x *= point.x;
      arg32.scale.y *= point.y;
      arg32.position.y += Math.max(arg32.scale.x, arg32.scale.y) * point.lift;
      arg32.material.rotation += point.rotation;
      arg32.material.color.setRGB(point.r, point.g, point.b);
      weakSet2.add(arg32);
    } else if (weakSet2.has(arg32)) {
      arg32.material.color.setRGB(1, 1, 1);
      weakSet2.delete(arg32);
    }
  }
  function fn31(arg34, id) {
    if (stopped || !supported || !v48[arg34] || !v48[arg34].some(item => item.id === id)) {
      return;
    }
    v50[arg34] = id;
    try {
      target.localStorage.setItem(v49[arg34], id);
    } catch (err) {}
    if (arg34 === "reaction") {
      fn21();
    }
    if (arg34 === "portal") {
      fn25(v51);
      try {
        fn24(id);
      } catch (err) {}
    }
    if (arg34 === "background") {
      if (id === "native") {
        fn26(v51);
      } else {
        try {
          fn23(id);
        } catch (err) {}
      }
      fn22();
    }
    fn32();
    previewStart();
    if (target.__DT_ENGINE_TRAILS) {
      target.__DT_ENGINE_TRAILS.refreshPreview();
    }
  }
  function fn32() {
    if (!v52) {
      return;
    }
    for (const item of Object.keys(v48)) {
      const v76 = v52.root.querySelector("[data-space-select=\"" + item + "\"]");
      if (v76 && v76.value !== v50[item]) {
        v76.value = v50[item];
      }
    }
  }
  function fn33() {
    if (!v52 || stopped || !v52.root.open || !v52.root.isConnected || target.document.hidden) {
      return false;
    }
    for (let root = v52.root; root && root !== target.document; root = root.parentElement) {
      if (root.hidden || root.style && root.style.display === "none") {
        return false;
      }
    }
    return true;
  }
  function previewStop() {
    if (v53 && target.cancelAnimationFrame) {
      target.cancelAnimationFrame(v53);
    }
    v53 = 0;
  }
  function previewStart() {
    if (!fn33() || v53 || typeof target.requestAnimationFrame !== "function") {
      return;
    }
    v53 = target.requestAnimationFrame(fn34);
  }
  function fn34() {
    v53 = 0;
    if (!fn33()) {
      return;
    }
    const v77 = fn19();
    if (v77 - v54 >= 32) {
      v54 = v77;
      fn36(v77);
    }
    previewStart();
  }
  function fn35() {
    if (v55 || !arg15.spacePreviewShip) {
      return;
    }
    v55 = target.document.createElement("img");
    v55.src = arg15.spacePreviewShip;
  }
  function fn36(arg35) {
    if (!v52) {
      return;
    }
    let ctx;
    try {
      ctx = v52.canvas.getContext("2d");
    } catch (err) {
      return;
    }
    if (!ctx) {
      return;
    }
    const width = v52.canvas.width;
    const height = v52.canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#030a18";
    ctx.fillRect(0, 0, width, height);
    const v78 = fn23(v50.background);
    if (v78 && v78.ready) {
      ctx.drawImage(v78.image, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#cce5ff";
      for (let i = 0; i < 65; i++) {
        ctx.globalAlpha = 0.2 + i % 4 * 0.15;
        ctx.fillRect(i * 83.17 % width, i * 47.29 % height, i % 9 === 0 ? 1.5 : 1, i % 9 === 0 ? 1.5 : 1);
      }
      ctx.globalAlpha = 1;
    }
    const found = spaceArt.portals.find(portal => portal.id === v50.portal);
    const v79 = arg35 % 3200 / 3200;
    if (found && v79 < 0.4) {
      try {
        const image = fn24(found.id).image;
        const v83 = Math.min(7, Math.floor(v79 / 0.4 * 8));
        const v84 = (0.7 + v79) * 190;
        ctx.save();
        ctx.globalAlpha = Math.sin(v79 / 0.4 * Math.PI);
        ctx.drawImage(image, v83 % 4 * 256, Math.floor(v83 / 4) * 256, 256, 256, width * 0.43 - v84 / 2, height * 0.52 - v84 / 2, v84, v84);
        ctx.restore();
      } catch (err) {}
    }
    fn35();
    if (v55 && (v55.naturalWidth > 0 || v55.width > 0)) {
      ctx.drawImage(v55, width * 0.43 - 51, height * 0.48 - 51, 102, 102);
    }
    const dtShipCosmetics = target.__DT_SHIP_COSMETICS;
    const v80 = dtShipCosmetics && dtShipCosmetics.status();
    const v81 = v80 && v80.companion !== "off" ? v80.companion : "jellyfish";
    if (dtShipCosmetics && dtShipCosmetics.painter) {
      if (!v56) {
        v56 = createCanvas(128, 128);
        v57 = createCanvas(128, 128);
      }
      const ctx2 = v56.getContext("2d");
      const ctx3 = v57.getContext("2d");
      if (ctx2 && ctx3) {
        const v85 = Math.floor(arg35 / 130) % 8;
        const point = companionPose(arg35, true);
        dtShipCosmetics.painter.companion(ctx3, v81, 128, v85);
        spaceArt.companion(ctx2, v57, v85, point.state);
        ctx.save();
        ctx.translate(width * 0.74, height * 0.57 - point.lift * 42);
        ctx.rotate(point.rotation);
        ctx.scale(point.x, point.y);
        ctx.drawImage(v56, -27, -27, 54, 54);
        ctx.restore();
      }
    }
    const v82 = reactionState(arg35, true);
    const textContent = v50.reaction === "off" ? "Pet reactions off" : ["Idle", "Firing", "Taking a hit", "Ship upgrade"][v82];
    if (v52.label.textContent !== textContent) {
      v52.label.textContent = textContent;
    }
  }
  function mount(el) {
    if (stopped || !el || !supported) {
      return;
    }
    if (v52 && v52.root.isConnected) {
      fn32();
      return;
    }
    const document = target.document;
    const detailsEl = document.createElement("details");
    detailsEl.className = "dt-section dt-space-effects";
    detailsEl.id = "dt-space-effects";
    if (document.head && arg15.spaceCss && !document.getElementById("dt-space-menu-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "dt-space-menu-style";
      styleEl.textContent = arg15.spaceCss;
      document.head.appendChild(styleEl);
    }
    const summaryEl = document.createElement("summary");
    summaryEl.className = "dt-space-toggle";
    summaryEl.setAttribute("aria-label", "Space & reactions");
    summaryEl.setAttribute("aria-describedby", "dt-space-caption");
    const spanEl = document.createElement("span");
    spanEl.className = "dt-space-emblem";
    spanEl.setAttribute("aria-hidden", "true");
    spanEl.innerHTML = "<svg viewBox=\"0 0 48 48\" fill=\"none\" focusable=\"false\"><ellipse cx=\"24\" cy=\"29\" rx=\"17\" ry=\"9\" stroke=\"currentColor\" stroke-width=\"1.7\"/><ellipse cx=\"24\" cy=\"27\" rx=\"15\" ry=\"6\" stroke=\"currentColor\" stroke-opacity=\".55\" stroke-width=\"1.2\" transform=\"rotate(-28 24 27)\"/><path d=\"M24 11l2.8 8.2L35 22l-8.2 2.8L24 33l-2.8-8.2L13 22l8.2-2.8L24 11Z\" fill=\"currentColor\" fill-opacity=\".22\" stroke=\"currentColor\" stroke-width=\"1.2\"/><circle cx=\"38\" cy=\"17\" r=\"1.7\" fill=\"currentColor\"/><circle cx=\"10\" cy=\"14\" r=\"1\" fill=\"currentColor\" fill-opacity=\".6\"/></svg>";
    const spanEl2 = document.createElement("span");
    spanEl2.className = "dt-space-heading";
    const strongEl = document.createElement("strong");
    strongEl.className = "dt-space-title";
    strongEl.textContent = "Space & reactions";
    const smallEl = document.createElement("small");
    smallEl.className = "dt-space-caption";
    smallEl.id = "dt-space-caption";
    smallEl.textContent = "20 backgrounds · 20 portals · Pet reactions";
    spanEl2.append(strongEl, smallEl);
    const spanEl3 = document.createElement("span");
    spanEl3.className = "dt-space-open";
    spanEl3.setAttribute("aria-hidden", "true");
    spanEl3.innerHTML = "<svg class=\"dt-space-chevron\" viewBox=\"0 0 16 16\" fill=\"none\" focusable=\"false\"><path d=\"m4 6 4 4 4-4\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>";
    summaryEl.append(spanEl, spanEl2, spanEl3);
    detailsEl.appendChild(summaryEl);
    const v86 = {
      background: ["Space background", "20 space scenes + Original"],
      portal: ["Spawn portal", "A short effect when your ship appears"],
      reaction: ["Pet reactions", "Fire, hit and ship upgrade reactions"]
    };
    for (const item of Object.keys(v48)) {
      const labelEl = document.createElement("label");
      labelEl.className = "dt-setting-row";
      labelEl.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;align-items:center";
      const spanEl4 = document.createElement("span");
      const strongEl2 = document.createElement("strong");
      const smallEl2 = document.createElement("small");
      strongEl2.textContent = v86[item][0];
      smallEl2.textContent = v86[item][1];
      spanEl4.style.cssText = "flex:1;min-width:125px";
      spanEl4.append(strongEl2, smallEl2);
      const selectEl = document.createElement("select");
      selectEl.className = "dt-button";
      selectEl.style.cssText = "max-width:100%;min-width:145px;color:var(--dt-text);background:var(--dt-panel,#101827)";
      selectEl.setAttribute("aria-label", v86[item][0]);
      selectEl.setAttribute("data-space-select", item);
      for (const item2 of v48[item]) {
        const optionEl = document.createElement("option");
        optionEl.value = item2.id;
        optionEl.textContent = item2.name;
        selectEl.appendChild(optionEl);
      }
      selectEl.value = v50[item];
      selectEl.addEventListener("change", () => fn31(item, selectEl.value));
      labelEl.append(spanEl4, selectEl);
      detailsEl.appendChild(labelEl);
    }
    const figureEl = document.createElement("figure");
    figureEl.style.cssText = "margin:12px 16px 16px;position:relative";
    const canvas = createCanvas(360, 220);
    canvas.style.cssText = "display:block;width:100%;height:auto;border-radius:10px;background:#030a18";
    canvas.setAttribute("aria-label", "Preview of your space background, spawn portal and pet reactions");
    const figcaptionEl = document.createElement("figcaption");
    figcaptionEl.textContent = "Preview";
    figcaptionEl.style.cssText = "margin-top:8px;font-size:11px;color:var(--dt-muted)";
    figureEl.append(canvas, figcaptionEl);
    detailsEl.appendChild(figureEl);
    el.insertBefore(detailsEl, el.children[1] || null);
    v52 = {
      root: detailsEl,
      canvas: canvas,
      label: figcaptionEl
    };
    detailsEl.addEventListener("toggle", () => {
      v54 = -Infinity;
      if (detailsEl.open) {
        previewStart();
      } else {
        previewStop();
      }
    });
    try {
      fn24(v50.portal);
      if (v50.background !== "native") {
        fn23(v50.background);
      }
    } catch (err) {}
    fn32();
  }
  function onPagehide() {
    stopped = true;
    previewStop();
    dispose();
    for (const item of map.values()) {
      item.image.onload = item.image.onerror = null;
      if (item.texture) {
        item.texture.dispose();
      }
    }
    map.clear();
    for (const item of map2.values()) {
      if (item.texture) {
        item.texture.dispose();
      }
    }
    map2.clear();
    v52 = null;
    v55 = v56 = v57 = null;
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("pagehide", onPagehide, {
      once: true
    });
  }
  if (target.document && typeof target.document.addEventListener === "function") {
    target.document.addEventListener("visibilitychange", () => {
      if (target.document.hidden) {
        previewStop();
      } else {
        previewStart();
      }
    });
  }
  return {
    backgrounds: background,
    portals: portal,
    reactions: reaction,
    art: spaceArt,
    mount: mount,
    frame: frame,
    shot: shot,
    dispose: dispose,
    applyCompanion: applyCompanion,
    companionPose: companionPose,
    reactionState: reactionState,
    previewStart: previewStart,
    previewStop: previewStop,
    companionArtEnabled: () => supported && !stopped && !!v58,
    chooseBackground: id => fn31("background", id),
    choosePortal: id => fn31("portal", id),
    chooseReaction: id => fn31("reaction", id),
    status: () => ({
      supported: supported,
      ...v50,
      active: !!v51,
      alive: !!v51 && !!v51.alive,
      reactionState: reactionState(fn19(), false),
      backgroundTextures: map.size,
      portalAtlases: map2.size,
      portalVisible: !!v51 && !!v51.portal && !!v51.portal.visible,
      stopped: stopped
    })
  };
}
function createCosmeticExpansionPainter() {
  'use strict';

  const TAU = Math.PI * 2;
  const patterns = [["solar-circuit", "Solar Circuit"], ["obsidian", "Obsidian"], ["ember-core", "Ember Core"], ["frostbite", "Frostbite"], ["aurora", "Aurora"], ["royal-filigree", "Royal Filigree"], ["biohazard", "Biohazard"], ["carbon-hex", "Carbon Hex"], ["samurai", "Samurai"], ["oceanic", "Oceanic"], ["star-map", "Star Map"], ["void-vortex", "Void Vortex"], ["plasma-stripes", "Plasma Stripes"], ["digital-camo", "Digital Camo"], ["pearlescent", "Pearlescent"], ["ancient-runes", "Ancient Runes"], ["dragon-scale", "Dragon Scale"], ["toxic-slime", "Toxic Slime"], ["porcelain", "Porcelain"], ["golden-phoenix", "Golden Phoenix"]].map(([item, item2]) => ({
    id: item,
    name: item2
  }));
  const companions = [["firefly", "Firefly"], ["crystal-wisp", "Crystal Wisp"], ["paper-crane", "Paper Crane"], ["moon-spirit", "Moon Spirit"], ["neon-butterfly", "Neon Butterfly"], ["star-sprite", "Star Sprite"], ["octopus", "Octopus"], ["solar-phoenix", "Solar Phoenix"], ["ice-ray", "Ice Ray"], ["void-eye", "Void Eye"], ["clockwork-owl", "Clockwork Owl"], ["comet-koi", "Comet Koi"], ["mini-saturn", "Mini Saturn"]].map(([item, item2]) => ({
    id: item,
    name: item2
  }));
  const set = new Set(patterns.map(item => item.id));
  const set2 = new Set(companions.map(item => item.id));
  function drawPath(ctx, items, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 2;
      ctx.stroke();
    }
  }
  function drawPath2(ctx, items, strokeStyle, lineWidth) {
    ctx.beginPath();
    items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
  }
  function drawEllipse(ctx, x, y, radiusX, radiusY, rotation, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, TAU);
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 2;
      ctx.stroke();
    }
  }
  function fn37(ctx, x, y, radiusX, fillStyle, strokeStyle, lineWidth) {
    drawEllipse(ctx, x, y, radiusX, radiusX, 0, fillStyle, strokeStyle, lineWidth);
  }
  function drawCurve(ctx, arg36, arg37, strokeStyle, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(...arg36);
    ctx.bezierCurveTo(...arg37);
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth || 2;
    ctx.stroke();
  }
  function fn38(ctx, arg38, arg39, arg40, arg41, arg42, fillStyle, strokeStyle, lineWidth, arg43 = 0) {
    const list = [];
    for (let i = 0; i < arg42 * 2; i++) {
      const v87 = i * Math.PI / arg42 - Math.PI / 2 + arg43;
      const v88 = i % 2 ? arg41 : arg40;
      list.push([arg38 + Math.cos(v87) * v88, arg39 + Math.sin(v87) * v88]);
    }
    drawPath(ctx, list, fillStyle, strokeStyle, lineWidth);
  }
  function getGradient(ctx, x0, y0, r1, color, color2) {
    const gradient = ctx.createRadialGradient(x0, y0, 1, x0, y0, r1);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, color2);
    return gradient;
  }
  function pattern(ctx, arg44, arg45) {
    if (!set.has(arg44)) {
      return false;
    }
    ctx.save();
    ctx.clearRect(0, 0, arg45, arg45);
    ctx.scale(arg45 / 512, arg45 / 512);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const fn39 = fillStyle => {
      ctx.fillStyle = fillStyle;
      ctx.fillRect(0, 0, 512, 512);
    };
    switch (arg44) {
      case "solar-circuit":
        fn39("#111f39c0");
        for (let i = 0; i < 10; i++) {
          const v89 = 20 + i * 53;
          const v90 = 40 + i * 71 % 230;
          drawPath2(ctx, [[v89, 0], [v89, v90], [v89 + 22, v90 + 22], [v89 + 22, 512]], i % 2 ? "#ffd482b0" : "#cc8f43aa", 3);
          for (const item of [v90 + 22, v90 + 115, v90 + 230]) {
            fn37(ctx, v89 + 22, item, 6, "#15233d", "#ffe1a9", 2);
            fn37(ctx, v89 + 22, item, 2, "#fff5c8");
          }
        }
        drawPath(ctx, [[211, 181], [301, 181], [328, 223], [301, 266], [211, 266], [184, 223]], "#48331ac9", "#ffce71", 5);
        fn38(ctx, 256, 223, 35, 14, 8, "#ffe3a9");
        break;
      case "obsidian":
        {
          fn39("#111021ce");
          const v91 = ["#1b213bdc", "#303754d9", "#181b31dc", "#474769c8", "#11162ddd"];
          for (let v92 = -1; v92 < 7; v92++) {
            for (let v93 = -1; v93 < 7; v93++) {
              const v94 = v93 * 103 + v92 % 2 * 37;
              const v95 = v92 * 97;
              drawPath(ctx, [[v94, v95], [v94 + 110, v95 + 17], [v94 + 83, v95 + 111]], v91[(v93 + v92 + 30) % 5], "#8d77c550", 1);
              drawPath(ctx, [[v94, v95], [v94 + 83, v95 + 111], [v94 - 9, v95 + 83]], v91[(v93 * 2 + v92 + 31) % 5]);
            }
          }
          drawPath2(ctx, [[249, 0], [278, 101], [231, 184], [270, 255], [242, 361], [278, 445], [254, 512]], "#a293df95", 2);
          break;
        }
      case "ember-core":
        fn39("#24150fbe");
        for (let i = 0; i < 13; i++) {
          const v96 = 15 + i * 42;
          const v97 = [[0, v96], [75, v96 + 18], [126, v96 - 8], [210, v96 + 22], [277, v96 - 6], [355, v96 + 25], [421, v96 - 4], [512, v96 + 13]];
          drawPath2(ctx, v97, "#ff4c237d", 17);
          drawPath2(ctx, v97, "#ffba548e", 6);
          drawPath2(ctx, v97, "#ffe7a9ae", 1.5);
        }
        drawEllipse(ctx, 256, 237, 42, 88, 0, getGradient(ctx, 256, 237, 95, "#ffe5a4e6", "#e96c2900"));
        break;
      case "frostbite":
        fn39("#a9d4eab8");
        for (let i = 0; i < 14; i++) {
          const v98 = (i * 113 + 37) % 512;
          const v99 = (i * 83 + 35) % 512;
          const v100 = 24 + i % 4 * 13;
          for (let j = 0; j < 6; j++) {
            const v101 = j * TAU / 6;
            const v102 = Math.cos(v101);
            const v103 = Math.sin(v101);
            drawPath2(ctx, [[v98, v99], [v98 + v102 * v100, v99 + v103 * v100]], "#f4ffffcf", 3);
            for (const item of [-1, 1]) {
              drawPath2(ctx, [[v98 + v102 * v100 * 0.62, v99 + v103 * v100 * 0.62], [v98 + v102 * v100 * 0.45 - v103 * item * v100 * 0.17, v99 + v103 * v100 * 0.45 + v102 * item * v100 * 0.17]], "#d4f5ffb0", 2);
            }
          }
        }
        drawPath2(ctx, [[186, 0], [205, 103], [179, 210], [217, 316], [193, 512]], "#ffffff88", 3);
        break;
      case "aurora":
        fn39("#071b32b5");
        for (let i = 0; i < 7; i++) {
          const list = [];
          for (let v104 = -20; v104 <= 550; v104 += 12) {
            list.push([45 + i * 77 + Math.sin(v104 * 0.012 + i * 0.7) * 42, v104]);
          }
          drawPath2(ctx, list, ["#68f0bb70", "#65e9de88", "#7798f690", "#b58bea77"][i % 4], 30);
          drawPath2(ctx, list, "#d0ffec6c", 2);
        }
        for (let i = 0; i < 40; i++) {
          fn37(ctx, i * 83 % 512, i * 137 % 512, i % 3 ? 1 : 2, "#c0ffea99");
        }
        break;
      case "royal-filigree":
        fn39("#231731ca");
        for (let v105 = -1; v105 < 5; v105++) {
          for (let v106 = -1; v106 < 5; v106++) {
            const v107 = v106 * 128 + 64;
            const v108 = v105 * 128 + 64;
            for (const item of [-1, 1]) {
              drawCurve(ctx, [v107, v108 - 50], [v107 + item * 78, v108 - 49, v107 + item * 66, v108 + 51, v107, v108 + 34], "#e7c27dcd", 3);
              drawCurve(ctx, [v107, v108 + 34], [v107 + item * 40, v108 + 4, v107 + item * 19, v108 - 27, v107, v108 - 11], "#b7956baa", 2);
            }
            drawPath(ctx, [[v107, v108 - 63], [v107 + 11, v108 - 48], [v107, v108 - 34], [v107 - 11, v108 - 48]], "#efd9a6ae");
          }
        }
        drawPath2(ctx, [[256, 0], [256, 512]], "#f2dda588", 2);
        break;
      case "biohazard":
        fn39("#142820bd");
        for (let i = 24; i < 512; i += 90) {
          for (let j = 20; j < 512; j += 90) {
            fn37(ctx, j, i, 17, null, "#7fa9506b", 2);
            fn37(ctx, j, i, 5, "#c9f17065");
          }
        }
        for (let i = 0; i < 3; i++) {
          const v109 = i * TAU / 3 - Math.PI / 2;
          const v110 = 256 + Math.cos(v109) * 57;
          const v111 = 238 + Math.sin(v109) * 57;
          ctx.beginPath();
          ctx.arc(v110, v111, 52, v109 - 0.5, v109 + Math.PI + 0.5);
          ctx.strokeStyle = "#c5f45be0";
          ctx.lineWidth = 16;
          ctx.stroke();
        }
        fn37(ctx, 256, 238, 38, "#172921", "#d6ff79e5", 10);
        fn37(ctx, 256, 238, 10, "#edffbc");
        break;
      case "carbon-hex":
        fn39("#121e29cf");
        for (let v112 = -32; v112 < 560; v112 += 48) {
          for (let v113 = -30; v113 < 560; v113 += 56) {
            const v114 = v113 + Math.floor(v112 / 48) % 2 * 28;
            const list = [];
            for (let i = 0; i < 6; i++) {
              const v115 = i * TAU / 6;
              list.push([v114 + Math.cos(v115) * 29, v112 + Math.sin(v115) * 29]);
            }
            drawPath(ctx, list, (Math.floor(v113 / 56) + Math.floor(v112 / 48)) % 2 ? "#2c3f4faf" : "#142635d0", "#6c91a88a", 2);
            drawPath2(ctx, [[v114 - 16, v112 - 9], [v114 + 13, v112 + 8]], "#9ebbc24a", 2);
          }
        }
        drawPath2(ctx, [[256, 0], [256, 512]], "#7df6e9bb", 5);
        break;
      case "samurai":
        fn39("#27141dcc");
        for (let v116 = -30; v116 < 550; v116 += 70) {
          drawPath(ctx, [[0, v116], [210, v116 + 48], [256, v116 + 25], [302, v116 + 48], [512, v116], [512, v116 + 34], [300, v116 + 77], [256, v116 + 54], [212, v116 + 77], [0, v116 + 34]], "#a83f4bb0", "#f3a1877a", 2);
        }
        fn37(ctx, 256, 189, 43, "#d45b4fe0", "#ffdfae", 4);
        drawPath2(ctx, [[225, 188], [288, 188]], "#fff0be", 7);
        drawPath2(ctx, [[256, 157], [256, 227]], "#fff0be", 7);
        break;
      case "oceanic":
        fn39("#124762c0");
        for (let v117 = -1; v117 < 10; v117++) {
          for (let v118 = -1; v118 < 8; v118++) {
            const v119 = v118 * 78 + v117 % 2 * 39;
            const v120 = v117 * 65;
            ctx.beginPath();
            ctx.arc(v119, v120, 48, 0, Math.PI);
            ctx.strokeStyle = "#87efed9e";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(v119, v120, 35, 0, Math.PI);
            ctx.strokeStyle = "#58bcd58c";
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
        for (let i = 0; i < 20; i++) {
          fn37(ctx, (i * 97 + 17) % 512, (i * 131 + 11) % 512, 3 + i % 4, null, "#d4fcff93", 2);
        }
        break;
      case "star-map":
        fn39("#091a38c7");
        for (let i = 0; i < 65; i++) {
          fn37(ctx, (i * 83 + 19) % 512, (i * 173 + 37) % 512, i % 9 === 0 ? 3 : 1, "#d9e8ffc9");
        }
        for (const item of [[[91, 59], [132, 127], [97, 212], [175, 246], [213, 351]], [[358, 41], [322, 137], [394, 193], [341, 276], [402, 373], [362, 463]], [[22, 363], [106, 331], [176, 399], [243, 442]]]) {
          drawPath2(ctx, item, "#8fbbd5a0", 2);
          for (const [item2, item3] of item) {
            fn37(ctx, item2, item3, 4, "#effbff");
          }
        }
        fn37(ctx, 256, 223, 76, null, "#9cd5e59c", 2);
        fn37(ctx, 256, 223, 63, null, "#8ab9d35e", 1);
        drawPath2(ctx, [[166, 223], [346, 223]], "#acddec83", 1);
        drawPath2(ctx, [[256, 133], [256, 313]], "#acddec83", 1);
        break;
      case "void-vortex":
        fn39("#11102fc9");
        for (let i = 0; i < 11; i++) {
          ctx.beginPath();
          ctx.ellipse(256, 245, 30 + i * 26, 19 + i * 18, -0.45, 0, TAU);
          ctx.strokeStyle = ["#8e79df99", "#4c95bf99", "#ab8cdd77"][i % 3];
          ctx.lineWidth = i % 2 ? 9 : 3;
          ctx.stroke();
        }
        fn37(ctx, 256, 245, 42, "#070f22f0", "#c4a7fbb9", 5);
        fn37(ctx, 245, 233, 7, "#e4e5ffb0");
        break;
      case "plasma-stripes":
        fn39("#211334c7");
        for (let v121 = -7; v121 < 12; v121++) {
          const v122 = v121 * 58;
          drawPath(ctx, [[v122, -30], [v122 + 24, -30], [v122 + 272, 542], [v122 + 245, 542]], v121 % 2 ? "#fa8be1a8" : "#7dc5f3ac");
          drawPath2(ctx, [[v122 + 28, -20], [v122 + 277, 542]], "#f9c4f5b0", 2);
        }
        drawPath(ctx, [[225, 171], [278, 171], [299, 228], [277, 284], [225, 284], [207, 228]], "#18203ed1", "#faacede0", 4);
        fn38(ctx, 253, 226, 36, 9, 4, "#f5c7f9df");
        break;
      case "digital-camo":
        {
          fn39("#283d45ca");
          const v123 = ["#7fa0a5b9", "#1c323dce", "#a8b8a6a4", "#455f64b3"];
          for (let i = 0; i < 145; i++) {
            const v124 = i * 53 % 32 * 16;
            const v125 = i * 71 % 32 * 16;
            ctx.fillStyle = v123[i % 4];
            ctx.fillRect(v124, v125, (1 + i % 4) * 16, (1 + i % 3) * 16);
            if (i % 4 === 0) {
              ctx.fillRect(v124 + 16, v125 + 16, 48, 32);
            }
          }
          drawPath2(ctx, [[256, 0], [256, 512]], "#c7dbac65", 2);
          break;
        }
      case "pearlescent":
        {
          const gradient = ctx.createLinearGradient(0, 0, 512, 512);
          gradient.addColorStop(0, "#e6e7f6c9");
          gradient.addColorStop(0.3, "#b7e8eac8");
          gradient.addColorStop(0.6, "#eabbd3c8");
          gradient.addColorStop(1, "#c9e6c6c8");
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, 512, 512);
          for (let v126 = -60; v126 < 620; v126 += 46) {
            const list = [];
            for (let v127 = -20; v127 <= 540; v127 += 12) {
              list.push([v127, v126 + Math.sin(v127 * 0.012 + v126 * 0.01) * 25]);
            }
            drawPath2(ctx, list, "#fcfffbc8", 6);
            drawPath2(ctx, list, "#d2b9e73d", 18);
          }
          break;
        }
      case "ancient-runes":
        fn39("#14242ec9");
        for (let i = 0; i < 8; i++) {
          for (let j = 0; j < 6; j++) {
            const v128 = 30 + j * 89;
            const v129 = 14 + i * 67;
            const v130 = (i * 5 + j) % 5;
            drawPath2(ctx, [[v128, v129], [v128, v129 + 42]], "#c7d9bbbe", 3);
            if (v130 < 3) {
              drawPath2(ctx, [[v128, v129 + 4], [v128 + 18, v129 + 15], [v128, v129 + 26]], "#a5d1c3b0", 3);
            }
            if (v130 % 2) {
              drawPath2(ctx, [[v128 - 14, v129 + 15], [v128 + 14, v129 + 30]], "#b9d8c8bf", 3);
            } else {
              drawPath2(ctx, [[v128 - 12, v129 + 36], [v128 + 12, v129 + 20]], "#b9d8c8bf", 3);
            }
          }
        }
        fn37(ctx, 256, 236, 64, "#112631b5", "#d0e8cab0", 4);
        fn38(ctx, 256, 236, 43, 21, 6, null, "#d7efcbd9", 4);
        break;
      case "dragon-scale":
        fn39("#411d2ac8");
        for (let v131 = -1; v131 < 9; v131++) {
          for (let v132 = -1; v132 < 9; v132++) {
            const v133 = v132 * 70 + v131 % 2 * 35;
            const v134 = v131 * 68;
            drawPath(ctx, [[v133, v134], [v133 + 34, v134 + 18], [v133 + 30, v134 + 42], [v133, v134 + 65], [v133 - 30, v134 + 42], [v133 - 34, v134 + 18]], v131 % 2 ? "#a24b4eaf" : "#6e3345bd", "#d5a46ea1", 2);
            drawPath2(ctx, [[v133, v134 + 13], [v133, v134 + 52]], "#f2c29573", 2);
          }
        }
        break;
      case "toxic-slime":
        fn39("#233329c4");
        for (let i = 0; i < 29; i++) {
          const v135 = (i * 131 + 33) % 512;
          const v136 = (i * 79 + 17) % 512;
          const v137 = 15 + i % 5 * 10;
          fn37(ctx, v135, v136, v137, "#85bb4e55", "#b9ef6bb8", 4);
          fn37(ctx, v135 - v137 * 0.25, v136 - v137 * 0.3, Math.max(2, v137 * 0.15), "#efffba99");
        }
        for (let i = 0; i < 7; i++) {
          drawCurve(ctx, [40 + i * 76, -20], [19 + i * 76, 140, 102 + i * 76, 240, 53 + i * 76, 532], "#a1db705b", 17);
        }
        break;
      case "porcelain":
        fn39("#e7eff1da");
        for (let v138 = -1; v138 < 5; v138++) {
          for (let v139 = -1; v139 < 5; v139++) {
            const v140 = v139 * 137 + 49;
            const v141 = v138 * 133 + 39;
            for (let i = 0; i < 5; i++) {
              const v142 = i * TAU / 5;
              drawEllipse(ctx, v140 + Math.cos(v142) * 20, v141 + Math.sin(v142) * 20, 10, 22, v142, "#426da7c5", "#184d89b0", 1);
            }
            fn37(ctx, v140, v141, 10, "#e3edf4", "#3b659cb8", 2);
            drawCurve(ctx, [v140 + 24, v141 + 15], [v140 + 72, v141 + 30, v140 + 13, v141 + 65, v140 + 70, v141 + 93], "#316b9b99", 3);
          }
        }
        break;
      case "golden-phoenix":
        fn39("#291d2ec7");
        for (const item of [-1, 1]) {
          for (let i = 0; i < 7; i++) {
            const v143 = 256 + item * (32 + i * 22);
            const v144 = 178 + i * 15;
            drawPath(ctx, [[256 + item * 15, 215], [v143, v144], [256 + item * (120 + i * 28), 85 + i * 28], [256 + item * (73 + i * 27), 266 + i * 20]], i % 2 ? "#e5a550d0" : "#f8d08ec0", "#fff0bf9c", 2);
          }
        }
        drawPath(ctx, [[256, 149], [275, 176], [269, 229], [292, 340], [256, 299], [222, 340], [243, 229], [237, 176]], "#f9d58be0", "#fff1bf", 3);
        drawPath(ctx, [[251, 151], [260, 132], [276, 145], [288, 154], [267, 162]], "#ffdf96");
        for (const item of [-1, 1]) {
          drawCurve(ctx, [256, 279], [256 + item * 94, 341, 256 + item * 19, 393, 256 + item * 68, 491], "#d9a26ca8", 8);
        }
        break;
    }
    ctx.restore();
    return true;
  }
  function companion(ctx, arg46, arg47, arg48) {
    if (!set2.has(arg46)) {
      return false;
    }
    const v145 = arg48 * TAU / 8;
    const v146 = Math.sin(v145);
    const v147 = Math.cos(v145);
    const v148 = 0.7 + v147 * 0.3;
    ctx.save();
    ctx.clearRect(0, 0, arg47, arg47);
    ctx.scale(arg47 / 128, arg47 / 128);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.translate(64, 64 + v146 * 1.7);
    ctx.rotate(v147 * 0.035);
    ctx.translate(-64, -64);
    switch (arg46) {
      case "firefly":
        drawEllipse(ctx, 64, 78, 31, 36, 0, getGradient(ctx, 64, 78, 36, "#f7ffc362", "#a4f57900"));
        for (const item of [-1, 1]) {
          drawEllipse(ctx, 64 + item * 20, 52, 11 + v148 * 9, 27, -item * 0.45, "#c5faff86", "#e4ffffb0", 1.5);
        }
        drawEllipse(ctx, 64, 73, 10, 25, 0, "#badb5e", "#efffb5", 2);
        fn37(ctx, 64, 48, 12, "#3a626c", "#c1eef0", 2);
        fn37(ctx, 60, 46, 2, "#d8ffff");
        fn37(ctx, 68, 46, 2, "#d8ffff");
        for (const item of [-1, 1]) {
          drawCurve(ctx, [64 + item * 5, 39], [64 + item * 9, 27, 64 + item * 12, 28, 64 + item * 16, 26], "#bfe6d8", 2);
        }
        break;
      case "crystal-wisp":
        for (let i = 0; i < 3; i++) {
          drawCurve(ctx, [55 + i * 9, 68], [42 + i * 12, 90, 71 + i * 8 + v146 * 6, 93, 52 + i * 11, 118], "#8ccaf187", 4 - i);
        }
        drawPath(ctx, [[64, 15], [88, 42], [80, 70], [64, 85], [48, 70], [40, 42]], "#a6d9f3", "#efffff", 2);
        drawPath(ctx, [[64, 15], [64, 85], [48, 70], [40, 42]], "#64a8de");
        drawPath(ctx, [[64, 15], [88, 42], [64, 50]], "#d6f9ff");
        drawPath2(ctx, [[64, 50], [80, 70]], "#f0ffff", 2);
        for (let i = 0; i < 3; i++) {
          fn38(ctx, 27 + i * 37, 40 + i % 2 * 38, 5, 2, 4, "#dcfbff", null, 0, v145 * 0.25);
        }
        break;
      case "paper-crane":
        drawPath(ctx, [[62, 58], [18, 31 - v148 * 7], [35, 73], [61, 83]], "#d9eef8", "#f5ffff", 2);
        drawPath(ctx, [[66, 58], [110, 31 - v148 * 7], [93, 73], [67, 83]], "#8fbad9", "#daefff", 2);
        drawPath(ctx, [[64, 45], [81, 67], [64, 93], [47, 67]], "#bcdced", "#effcff", 2);
        drawPath(ctx, [[66, 59], [72, 24], [84, 15], [91, 23], [80, 28], [78, 70]], "#e5f4fa", "#b1d7ed", 1);
        drawPath(ctx, [[85, 18], [104, 22], [90, 26]], "#e9bd86");
        drawPath(ctx, [[62, 77], [70, 83], [51 + v146 * 5, 111]], "#92bfdc");
        drawPath2(ctx, [[35, 73], [62, 58], [18, 31 - v148 * 7]], "#7ba3c0", 1);
        break;
      case "moon-spirit":
        fn37(ctx, 63, 58, 45, getGradient(ctx, 63, 58, 45, "#c8c0ff46", "#8085e600"));
        ctx.beginPath();
        ctx.moveTo(77, 22);
        ctx.bezierCurveTo(21, 26, 21, 96, 77, 98);
        ctx.bezierCurveTo(51, 81, 51, 42, 77, 22);
        ctx.fillStyle = "#dedcfc";
        ctx.fill();
        ctx.strokeStyle = "#fff4cf";
        ctx.lineWidth = 2;
        ctx.stroke();
        fn37(ctx, 51, 56, 3, "#7d83ba");
        drawCurve(ctx, [45, 68], [49, 72, 53, 72, 57, 68], "#8c8dc1", 2);
        fn38(ctx, 91, 37 + v146 * 4, 11, 5, 5, "#fff0b4");
        fn38(ctx, 95, 82 - v146 * 3, 6, 3, 4, "#b4e9ff");
        break;
      case "neon-butterfly":
        for (const item of [-1, 1]) {
          drawEllipse(ctx, 64 + item * (v148 * 23 + 6), 45, v148 * 17 + 4, 28, item * 0.5, "#bc86e3b3", "#e6bcff", 2);
          drawEllipse(ctx, 64 + item * (v148 * 20 + 5), 79, v148 * 13 + 4, 20, -item * 0.4, "#5acbdac4", "#b9fbff", 2);
          fn37(ctx, 64 + item * (v148 * 25 + 6), 44, 6, "#d3f6ffa6");
        }
        drawEllipse(ctx, 64, 62, 5, 30, 0, "#d1e4ff");
        for (const item of [-1, 1]) {
          drawCurve(ctx, [64 + item * 3, 37], [64 + item * 8, 21, 64 + item * 13, 23, 64 + item * 14, 29], "#c4dcff", 2);
        }
        break;
      case "star-sprite":
        fn37(ctx, 64, 63, 46, getGradient(ctx, 64, 63, 46, "#fff0ab54", "#f9b95d00"));
        fn38(ctx, 64, 59, 43, 21, 5, "#f8d886", "#fff0bc", 2, v146 * 0.08);
        drawPath(ctx, [[64, 16], [64, 59], [38, 72], [25, 47]], "#ffe9a5");
        fn37(ctx, 56, 57, 3, "#725c77");
        fn37(ctx, 73, 57, 3, "#725c77");
        drawCurve(ctx, [59, 68], [63, 72, 67, 72, 71, 68], "#c17a70", 2);
        for (const item of [-1, 1]) {
          fn38(ctx, 64 + item * 45, 87 + item * 4 * v146, 5, 2, 4, "#e2f7ff");
        }
        break;
      case "octopus":
        for (let i = 0; i < 8; i++) {
          const v149 = 39 + i * 7;
          const v150 = 22 + i * 12;
          drawCurve(ctx, [v149, 67], [v149 - 11, 95, v150 + Math.sin(v145 + i) * 10, 114, v150, 91 + Math.cos(v145 + i) * 6], "#bc83dbe0", 7);
          drawCurve(ctx, [v149, 70], [v149 - 8, 94, v150 + Math.sin(v145 + i) * 10, 110, v150, 93 + Math.cos(v145 + i) * 6], "#e9b9f99e", 2);
        }
        drawEllipse(ctx, 64, 48, 30, 32, 0, "#a47bcf", "#e9beff", 2);
        drawEllipse(ctx, 55, 34, 11, 7, -0.4, "#cda4eb");
        fn37(ctx, 53, 55, 5, "#f0f7ff");
        fn37(ctx, 76, 55, 5, "#f0f7ff");
        fn37(ctx, 53, 55, 2, "#4e527f");
        fn37(ctx, 76, 55, 2, "#4e527f");
        break;
      case "solar-phoenix":
        for (const item of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            drawPath(ctx, [[64 + item * 6, 57], [64 + item * (22 + i * 8), 27 + i * 8 - v148 * 8], [64 + item * (44 + i * 3), 48 + i * 10], [64 + item * 15, 78]], i % 2 ? "#f9bd5d" : "#df874e", "#ffe1a2", 1);
          }
        }
        drawPath(ctx, [[64, 30], [77, 45], [71, 72], [81, 104 + v146 * 3], [64, 93], [48, 107 - v146 * 3], [57, 72], [51, 45]], "#ffdc8b", "#fff4bd", 2);
        drawPath(ctx, [[59, 32], [65, 20], [73, 27], [86, 32], [71, 39]], "#ffe9ac");
        drawCurve(ctx, [64, 86], [39, 96, 55, 107, 46 + v146 * 4, 118], "#f0a861", 3);
        break;
      case "ice-ray":
        drawCurve(ctx, [64, 78], [51, 98, 76 + v146 * 5, 104, 62, 119], "#bce6ff", 3);
        drawPath(ctx, [[64, 19], [83, 44], [111, 41 - v148 * 7], [99, 75], [78, 79], [64, 96], [49, 79], [28, 75], [17, 41 - v148 * 7], [45, 44]], "#94d5edbd", "#edffff", 2);
        drawPath(ctx, [[64, 19], [64, 96], [49, 79], [45, 44]], "#4f99ccc9");
        drawPath2(ctx, [[64, 36], [45, 60], [29, 70]], "#dcfaff", 2);
        drawPath2(ctx, [[64, 36], [84, 60], [99, 70]], "#dcfaff", 2);
        fn37(ctx, 58, 47, 3, "#efffff");
        fn37(ctx, 71, 47, 3, "#efffff");
        break;
      case "void-eye":
        drawEllipse(ctx, 64, 63, 48, 31, 0, getGradient(ctx, 64, 63, 49, "#8b8cdf7b", "#574ca900"));
        drawPath(ctx, [[16, 62], [38, 39], [64, 30], [89, 39], [113, 62], [89, 84], [64, 93], [38, 84]], "#262b50", "#b2a1ed", 3);
        drawEllipse(ctx, 64, 62, 24, 27, 0, "#bbb0e6", "#ede9ff", 2);
        drawEllipse(ctx, 64 + v146 * 4, 61, 9, 21, 0, "#34406e");
        fn37(ctx, 58 + v146 * 4, 52, 5, "#fff6ff");
        for (const item of [-1, 1]) {
          drawPath2(ctx, [[64 + item * 24, 36], [64 + item * 38, 19]], "#9d9fdb", 3);
        }
        break;
      case "clockwork-owl":
        for (const item of [-1, 1]) {
          drawPath(ctx, [[64 + item * 18, 58], [64 + item * 43, 48 - v148 * 7], [64 + item * 38, 85], [64 + item * 21, 97]], "#9f845e", "#e2cca1", 2);
        }
        drawPath(ctx, [[38, 27], [48, 36], [80, 36], [91, 27], [88, 75], [75, 99], [52, 99], [38, 75]], "#9e805e", "#ead6aa", 2);
        for (const item of [49, 78]) {
          fn37(ctx, item, 53, 16, "#594f50", "#efdfb7", 3);
          fn37(ctx, item, 53, 9, "#a6e7e5");
          fn37(ctx, item + v146 * 2, 53, 4, "#344b65");
        }
        drawPath(ctx, [[59, 65], [69, 65], [64, 76]], "#e6bf73");
        fn37(ctx, 64, 87, 8, "#655a54", "#ddc291", 2);
        drawPath2(ctx, [[64, 81], [64 + v147 * 4, 87 + v146 * 4]], "#e9dbac", 2);
        break;
      case "comet-koi":
        drawPath(ctx, [[60, 78], [34 + v146 * 4, 111], [62, 99], [89 - v146 * 4, 113], [72, 79]], "#eef1e0b5", "#f6ffffba", 1);
        for (const item of [-1, 1]) {
          drawPath(ctx, [[64 + item * 12, 50], [64 + item * 33, 65], [64 + item * 14, 75]], "#e5f7f4b0", "#d9f9ff", 1);
        }
        drawEllipse(ctx, 64, 55, 19, 35, 0, "#e0eceb", "#f7ffff", 2);
        drawEllipse(ctx, 58, 42, 10, 13, -0.3, "#e29b7d");
        drawEllipse(ctx, 70, 64, 10, 15, 0.2, "#da8e75");
        fn37(ctx, 56, 31, 3, "#3d576c");
        fn37(ctx, 72, 31, 3, "#3d576c");
        drawCurve(ctx, [59, 89], [48, 102, 54 + v146 * 6, 109, 41, 119], "#8be7ef99", 2);
        break;
      case "mini-saturn":
        fn37(ctx, 64, 62, 31, "#d1b38c", "#f6e2b5", 2);
        drawEllipse(ctx, 64, 55, 29, 5, -0.2, "#f2d8aad5");
        drawEllipse(ctx, 64, 69, 29, 5, -0.2, "#ad8b7fa6");
        drawEllipse(ctx, 64, 62, 50, 15, -0.4, null, "#a3e1efbc", 8);
        drawEllipse(ctx, 64, 62, 50, 15, -0.4, null, "#e8f6e5ce", 2);
        fn37(ctx, 64 + Math.cos(v145) * 46, 62 + Math.sin(v145) * 21, 5, "#d3e9f0", "#fff7db", 1);
        break;
    }
    ctx.restore();
    return true;
  }
  return {
    patterns: patterns,
    companions: companions,
    pattern: pattern,
    companion: companion
  };
}
function createHardwarePainter() {
  'use strict';

  const TAU = Math.PI * 2;
  const patterns = [["arc-surge", "Arc Surge", "#56e8ff", "#a8caff"], ["solar-flare", "Solar Flare", "#ff982e", "#ffe9a2"], ["quantum-grid", "Quantum Grid", "#30ffcd", "#76acff"], ["magma-pulse", "Magma Pulse", "#ff4826", "#ffc650"], ["glacial-stream", "Glacial Stream", "#b9f4ff", "#6a96ff"], ["neon-runner", "Neon Runner", "#ff58e3", "#49eaff"], ["reactor-heart", "Reactor Heart", "#8bff75", "#f4ffad"], ["void-orbit", "Void Orbit", "#b57aff", "#63cfff"], ["aurora-flow", "Aurora Flow", "#47ffd7", "#8c87ff"], ["meteor-sparks", "Meteor Sparks", "#ffbc61", "#fff4c5"]].map(([item, item2, item3, item4], index) => ({
    id: item,
    name: item2,
    accent: item3,
    secondary: item4,
    animated: true,
    motion: index + 1
  }));
  const companions = [["aegis-drone", "Aegis Drone"], ["survey-satellite", "Survey Satellite"], ["ion-turbine", "Ion Turbine"], ["radar-sentinel", "Radar Sentinel"], ["fusion-reactor", "Fusion Reactor"], ["tesla-array", "Tesla Array"], ["repair-module", "Repair Module"], ["gyro-stabilizer", "Gyro Stabilizer"], ["deep-probe", "Deep Probe"], ["signal-beacon", "Signal Beacon"]].map(([item, item2]) => ({
    id: item,
    name: item2,
    kind: "device"
  }));
  const map = new Map(patterns.map(item => [item.id, item]));
  const set = new Set(companions.map(item => item.id));
  function drawPath(ctx, arg49, fillStyle, strokeStyle, lineWidth = 1) {
    ctx.beginPath();
    for (let i = 0; i < arg49.length; i++) {
      if (i) {
        ctx.lineTo(...arg49[i]);
      } else {
        ctx.moveTo(...arg49[i]);
      }
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }
  function drawPath2(ctx, arg50, strokeStyle, lineWidth = 2) {
    ctx.beginPath();
    for (let i = 0; i < arg50.length; i++) {
      if (i) {
        ctx.lineTo(...arg50[i]);
      } else {
        ctx.moveTo(...arg50[i]);
      }
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  function drawEllipse(ctx, x, y, radiusX, radiusY, fillStyle, strokeStyle, lineWidth = 1, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, TAU);
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }
  function getGradient(ctx, x0, y0, arg51, arg52, items) {
    const gradient = ctx.createLinearGradient(x0, y0, x0 + arg51, y0 + arg52);
    items.forEach((item, index) => gradient.addColorStop(index / (items.length - 1), item));
    return gradient;
  }
  function fn40(ctx, arr, arg53 = false) {
    const gradient = getGradient(ctx, 10, 10, 94, 100, arg53 ? ["#6d7d8c", "#192330", "#4b5d70", "#111a26"] : ["#f2f6f7", "#7e94a7", "#dae4e9", "#35495e"]);
    drawPath(ctx, arr, gradient, "#101a26", 1.5);
    drawPath2(ctx, [arr.at(-1), arr[0], arr[1]], arg53 ? "#bdcbdc77" : "#ffffffb0", 1);
  }
  function fn41(ctx, x, y) {
    drawEllipse(ctx, x + 0.5, y + 0.9, 2.2, 2.2, "#101723");
    drawEllipse(ctx, x, y, 1.5, 1.5, "#aab9c5");
    drawPath2(ctx, [[x - 1, y], [x + 1, y]], "#354658", 0.7);
  }
  function fn42(ctx, x, y, fillStyle, radiusX = 2) {
    drawEllipse(ctx, x, y, radiusX * 2.8, radiusX * 2.8, fillStyle + "15");
    drawEllipse(ctx, x, y, radiusX, radiusX, fillStyle);
    drawEllipse(ctx, x - 0.5, y - 0.5, radiusX * 0.3, radiusX * 0.3, "#ffffff");
  }
  function fn43(ctx, x, y, radiusX, arg54 = "#49ddff") {
    drawEllipse(ctx, x, y, radiusX + 3, radiusX + 3, getGradient(ctx, x - radiusX, y - radiusX, radiusX * 2, radiusX * 2, ["#ecf4f7", "#516b7f", "#a0b3c1"]), "#172532", 1);
    drawEllipse(ctx, x, y, radiusX, radiusX, getGradient(ctx, x - radiusX, y - radiusX, radiusX * 1.5, radiusX * 2, ["#061523", "#154368", arg54, "#071728"]), "#0a1826", 1);
    drawEllipse(ctx, x - radiusX * 0.3, y - radiusX * 0.4, radiusX * 0.37, radiusX * 0.17, "#e4ffffbb", null, 1, -0.5);
  }
  function drawRect(ctx, x, y, width, height, arg55 = 5) {
    ctx.fillStyle = "#111b27";
    ctx.fillRect(x, y, width, height);
    for (let i = 0; i < arg55; i++) {
      drawPath2(ctx, [[x + 2, y + 2 + i * (height - 4) / arg55], [x + width - 2, y + 2 + i * (height - 4) / arg55]], "#687e90", 1);
    }
  }
  function fn44(ctx, x, y, radiusX, radiusY, arg56, strokeStyle = "#aabcca", arg57 = 0) {
    drawEllipse(ctx, x, y, radiusX, radiusY, null, "#0a1520", arg56 + 2, arg57);
    drawEllipse(ctx, x, y, radiusX, radiusY, null, strokeStyle, arg56, arg57);
    drawEllipse(ctx, x - 1, y - 1, radiusX, radiusY, null, "#f6ffff9c", Math.max(0.6, arg56 * 0.22), arg57);
  }
  function pattern(ctx, arg58, arg59) {
    const v151 = map.get(arg58);
    if (!v151) {
      return false;
    }
    ctx.save();
    ctx.clearRect(0, 0, arg59, arg59);
    ctx.scale(arg59 / 512, arg59 / 512);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = getGradient(ctx, 0, 0, 512, 512, ["#26394ab0", "#0b1426bd", "#3b4b5ba8", "#102037c9"]);
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 64) {
      for (let j = 0; j < 512; j += 64) {
        drawPath(ctx, [[j + 2, i + 2], [j + 61, i + 2], [j + 61, i + 61], [j + 2, i + 61]], (j / 64 + i / 64) % 2 ? "#d8eeff0a" : "#02071326", "#c0d9f51b", 1);
      }
    }
    const accent = v151.accent;
    if (v151.motion === 1 || v151.motion === 4) {
      for (let v152 = -1; v152 <= 1; v152++) {
        const list = [];
        for (let i = 0; i < 13; i++) {
          list.push([256 + v152 * 130 + Math.sin(i * 3.7 + v152) * 34, i * 43]);
        }
        drawPath2(ctx, list, "#010614aa", 13);
        drawPath2(ctx, list, accent + "77", 6);
        for (let i = 2; i < 12; i += 3) {
          drawPath2(ctx, [list[i], [list[i][0] + 70, list[i][1] + 33], [list[i][0] + 92, list[i][1] + 96]], accent + "65", 3);
        }
      }
    } else if (v151.motion === 2 || v151.motion === 9) {
      for (let v153 = -1; v153 <= 1; v153++) {
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(256 + v153 * (45 + i * 33), 0);
          ctx.bezierCurveTo(80 + v153 * 90, 155, 400 + v153 * 80, 350, 256 + v153 * (70 + i * 42), 512);
          ctx.strokeStyle = (i % 2 ? v151.secondary : accent) + "60";
          ctx.lineWidth = i % 2 ? 3 : 10;
          ctx.stroke();
        }
      }
    } else if (v151.motion === 3) {
      for (let i = 0; i < 512; i += 64) {
        drawPath2(ctx, [[0, i], [512, i]], accent + "6b", 2);
        drawPath2(ctx, [[i, 0], [i, 512]], accent + "6b", 2);
        for (let j = 0; j < 512; j += 64) {
          ctx.fillStyle = "#baffebaa";
          ctx.fillRect(j - 2, i - 2, 4, 4);
        }
      }
    } else if (v151.motion === 5) {
      for (let v154 = -128; v154 < 640; v154 += 128) {
        for (let v155 = -64; v155 < 640; v155 += 128) {
          drawPath(ctx, [[v155, v154], [v155 + 91, v154 + 23], [v155 + 128, v154 + 110], [v155 + 36, v154 + 128]], "#b2e8ff19", accent + "6c", 2);
          drawPath2(ctx, [[v155 + 91, v154 + 23], [v155 + 36, v154 + 128]], "#ffffff79", 2);
        }
      }
    } else if (v151.motion === 6 || v151.motion === 10) {
      for (const item of [100, 160, 352, 412]) {
        drawPath2(ctx, [[item, 0], [item, 512]], "#030b17aa", 17);
        drawPath2(ctx, [[item, 0], [item, 512]], accent + "7e", 4);
        for (let i = 0; i < 512; i += 48) {
          drawPath2(ctx, [[item - 8, i], [item + 8, i + 13]], v151.secondary + "8e", 2);
        }
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const v156 = i * TAU / 8;
        drawPath2(ctx, [[256 + Math.cos(v156) * 85, 256 + Math.sin(v156) * 85], [256 + Math.cos(v156) * 240, 256 + Math.sin(v156) * 240]], accent + "73", 5);
      }
      for (const item of [60, 112, 192]) {
        drawEllipse(ctx, 256, 256, item, item * 0.75, null, accent + "85", 3);
      }
    }
    for (const [item, item2] of [[24, 24], [488, 24], [24, 488], [488, 488]]) {
      drawEllipse(ctx, item, item2, 6, 6, "#03102099", "#daefff80", 1);
      drawPath2(ctx, [[item - 3, item2], [item + 3, item2]], "#cfe6ff99", 1);
    }
    ctx.restore();
    return true;
  }
  function motion(ctx, arg60, arg61, arg62) {
    const v157 = map.get(arg60);
    if (!v157) {
      return;
    }
    ctx.save();
    ctx.scale(arg61 / 512, arg61 / 512);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const v158 = arg62 * 0.001;
    const accent = v157.accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    if (v157.motion === 1 || v157.motion === 4) {
      const v159 = v158 * 0.28 % 1 * 780 - 130;
      const list = [];
      for (let i = 0; i < 22; i++) {
        list.push([v159 + Math.sin(i * 2.6 + v158) * 29 + Math.sin(i * 0.8) * 13, i * 25]);
      }
      drawPath2(ctx, list, accent + "55", 15);
      drawPath2(ctx, list, "#f1ffff", 3);
      for (const item of [6, 13]) {
        drawPath2(ctx, [list[item], [list[item][0] + 65, list[item][1] + 24], [list[item][0] + 38, list[item][1] + 75]], accent, 2);
      }
    } else if (v157.motion === 3) {
      const v160 = v158 * 0.23 % 1 * 680 - 84;
      ctx.fillStyle = getGradient(ctx, 0, v160, 0, 76, ["#51ffe100", accent + "88", "#e0ffffbb", "#51ffe100"]);
      ctx.fillRect(0, v160, 512, 76);
    } else if (v157.motion === 6 || v157.motion === 10) {
      for (let i = 0; i < 8; i++) {
        const v161 = 74 + i * 53;
        const v162 = (v158 * 0.5 + i * 0.173) % 1 * 710 - 110;
        drawPath2(ctx, [[v161, v162], [v161 + 7, v162 + 96]], i % 2 ? accent : v157.secondary, 4);
      }
    } else if (v157.motion === 7 || v157.motion === 8) {
      for (let i = 0; i < 3; i++) {
        const v163 = (v158 * 0.19 + i / 3) % 1 * 330;
        drawEllipse(ctx, 256, 256, v163, v163 * (v157.motion === 8 ? 0.58 : 1), null, accent + "ba", 5, v158 * 0.3);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const list = [];
        for (let j = 0; j < 36; j++) {
          const v164 = j * 15;
          const v165 = (v158 * 0.2 + i * 0.23) % 1 * 800 - 140 + Math.sin(j * 0.14 + v158 * 0.8 + i) * 65;
          list.push([v164, v165]);
        }
        drawPath2(ctx, list, i % 2 ? accent : v157.secondary, 6 - i);
      }
    }
    ctx.restore();
  }
  function companion(ctx, arg63, arg64, arg65) {
    if (!set.has(arg63)) {
      return false;
    }
    ctx.save();
    ctx.clearRect(0, 0, arg64, arg64);
    ctx.scale(arg64 / 128, arg64 / 128);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const v166 = arg65 * TAU / 8;
    const v167 = Math.sin(v166);
    const v168 = Math.cos(v166);
    if (arg63 === "aegis-drone") {
      for (const [item, item2] of [[28, 34], [99, 34], [28, 88], [99, 88]]) {
        drawPath2(ctx, [[64, 64], [item, item2]], "#0b131c", 11);
        drawPath2(ctx, [[64, 62], [item, item2 - 2]], "#8b9eac", 5);
        drawEllipse(ctx, item, item2 + 2, 20, 12, "#040a13a6");
        fn44(ctx, item, item2, 18, 11, 2);
        ctx.save();
        ctx.translate(item, item2);
        ctx.scale(1, 0.55);
        ctx.rotate(v166);
        for (let i = 0; i < 3; i++) {
          ctx.rotate(TAU / 3);
          drawPath(ctx, [[0, -2], [17, -5], [19, 0], [2, 3]], "#61798fa8", "#d9efff88", 0.6);
        }
        ctx.restore();
        drawEllipse(ctx, item, item2, 3, 3, "#dce7eb");
      }
      fn40(ctx, [[50, 42], [77, 42], [88, 55], [83, 78], [65, 89], [45, 78], [40, 55]], true);
      fn40(ctx, [[50, 42], [77, 42], [84, 52], [45, 52]]);
      drawRect(ctx, 51, 56, 25, 10, 4);
      fn43(ctx, 64, 76, 7);
      fn41(ctx, 48, 54);
      fn41(ctx, 79, 54);
      fn42(ctx, 49, 74, "#5affbe");
    } else if (arg63 === "survey-satellite") {
      for (const item of [-1, 1]) {
        drawPath2(ctx, [[64, 68], [64 + item * 29, 68]], "#8298a5", 5);
        const v169 = item < 0 ? 6 : 87;
        drawPath(ctx, [[v169, 38], [v169 + 33, 43], [v169 + 33, 90], [v169, 84]], getGradient(ctx, v169, 38, 33, 50, ["#6b92bd", "#122f58", "#3078ad"]), "#c4d3dd", 2);
        for (let i = 1; i < 4; i++) {
          drawPath2(ctx, [[v169 + i * 8, 40 + i], [v169 + i * 8, 85 + i]], "#8ec4f0a0", 0.7);
        }
        for (let i = 0; i < 5; i++) {
          drawPath2(ctx, [[v169 + 2, 46 + i * 8], [v169 + 31, 51 + i * 8]], "#76b2eb9a", 0.7);
        }
      }
      fn40(ctx, [[46, 47], [69, 40], [84, 52], [82, 88], [58, 97], [44, 83]]);
      drawPath(ctx, [[48, 55], [61, 59], [61, 90], [48, 81]], "#c5a050", "#f0dc9c", 1);
      drawRect(ctx, 66, 59, 13, 23, 6);
      drawPath2(ctx, [[63, 42], [63, 24]], "#aabfce", 3);
      drawEllipse(ctx, 63, 23, 18, 8, getGradient(ctx, 46, 15, 30, 15, ["#ecf4f5", "#617585", "#c2d7df"]), "#52687b", 1, -0.25 + v167 * 0.08);
      drawPath2(ctx, [[63, 22], [70, 12]], "#f0f5eb", 2);
      fn42(ctx, 76, 84, "#ffb953");
      fn41(ctx, 69, 49);
    } else if (arg63 === "ion-turbine") {
      for (let i = 0; i < 3; i++) {
        const v170 = i * TAU / 3;
        fn40(ctx, [[64 + Math.cos(v170) * 23, 63 + Math.sin(v170) * 23], [64 + Math.cos(v170 - 0.13) * 49, 63 + Math.sin(v170 - 0.13) * 49], [64 + Math.cos(v170 + 0.13) * 49, 63 + Math.sin(v170 + 0.13) * 49]], true);
      }
      fn44(ctx, 64, 63, 33, 33, 9);
      drawEllipse(ctx, 64, 63, 27, 27, "#07121d");
      ctx.save();
      ctx.translate(64, 63);
      ctx.rotate(v166);
      for (let i = 0; i < 7; i++) {
        ctx.rotate(TAU / 7);
        drawPath(ctx, [[6, -4], [22, -13], [24, -2], [9, 4]], getGradient(ctx, 0, -18, 27, 27, ["#f0f4f6", "#4c687d", "#c1dae7"]), "#182d40", 0.7);
      }
      ctx.restore();
      fn43(ctx, 64, 63, 9);
      for (let i = 0; i < 8; i++) {
        const v171 = i * TAU / 8;
        fn41(ctx, 64 + Math.cos(v171) * 33, 63 + Math.sin(v171) * 33);
      }
      fn42(ctx, 64, 22, "#41eaff");
    } else if (arg63 === "radar-sentinel") {
      fn40(ctx, [[37, 89], [87, 89], [101, 107], [26, 107]], true);
      fn40(ctx, [[42, 82], [82, 82], [87, 96], [37, 96]]);
      drawRect(ctx, 44, 91, 39, 9, 3);
      drawPath2(ctx, [[64, 84], [64, 55]], "#b3c6cf", 10);
      drawPath2(ctx, [[61, 82], [61, 57]], "#e8eef1", 2);
      fn44(ctx, 64, 53, 36, 22, 3, "#a9becd", -0.15 + v167 * 0.12);
      drawEllipse(ctx, 64, 53, 33, 20, getGradient(ctx, 35, 36, 60, 35, ["#eff4f5", "#667d90", "#c3d5df"]), "#223a4e", 1, -0.15 + v167 * 0.12);
      for (let i = 0; i < 6; i++) {
        const v172 = i * TAU / 6;
        drawPath2(ctx, [[64, 53], [64 + Math.cos(v172) * 31, 53 + Math.sin(v172) * 19]], "#5d78888c", 1);
      }
      drawPath2(ctx, [[64, 53], [82, 33], [89, 15]], "#d7edf2", 2);
      fn42(ctx, 89, 15, "#ff9c55");
      fn41(ctx, 37, 101);
      fn41(ctx, 92, 101);
      fn42(ctx, 64, 103, "#51f5b0");
    } else if (arg63 === "fusion-reactor") {
      fn40(ctx, [[44, 28], [84, 28], [96, 45], [96, 86], [80, 104], [47, 104], [32, 85], [32, 44]], true);
      drawPath(ctx, [[50, 31], [78, 31], [84, 46], [84, 87], [74, 99], [51, 96], [44, 85], [44, 46]], getGradient(ctx, 42, 37, 44, 52, ["#071c2c", "#2e98ad", "#9bfff0", "#133b58"]), "#9ce4ef", 1);
      for (let i = 0; i < 6; i++) {
        const v173 = 38 + i * 10;
        drawPath2(ctx, [[36, v173], [47, v173]], "#c5d1d7", 3);
        drawPath2(ctx, [[81, v173], [93, v173]], "#c5d1d7", 3);
      }
      for (const item of [29, 99]) {
        fn44(ctx, 64, item, 22, 7, 5);
        fn41(ctx, 47, item);
        fn41(ctx, 81, item);
      }
      fn42(ctx, 64, 65, "#aaffd7", 5 + Math.sin(v166) * 0.6);
      drawRect(ctx, 48, 13, 32, 10, 3);
      drawRect(ctx, 48, 111, 32, 7, 2);
    } else if (arg63 === "tesla-array") {
      fn40(ctx, [[34, 84], [92, 84], [103, 105], [24, 105]], true);
      fn40(ctx, [[43, 76], [85, 76], [92, 88], [35, 88]]);
      for (const [item, item2] of [[38, 36], [64, 19], [90, 36]]) {
        drawPath2(ctx, [[item, 81], [item, item2]], "#7f5b3d", 8);
        for (let i = item2 + 6; i < 78; i += 6) {
          drawEllipse(ctx, item, i, 8, 3, null, "#d3ae73", 3);
        }
        drawEllipse(ctx, item, item2, 9, 5, "#d7e8ed", "#728b9e", 1);
      }
      const v174 = [[38, 35], [46, 25 + v167 * 4], [53, 37], [64, 18], [72, 29 - v168 * 4], [79, 22], [90, 35]];
      drawPath2(ctx, v174, "#3297ff70", 7);
      drawPath2(ctx, v174, "#bdffff", 1.5);
      drawRect(ctx, 43, 91, 40, 8, 3);
      fn41(ctx, 32, 99);
      fn41(ctx, 96, 99);
      fn42(ctx, 64, 104, "#60dfff");
    } else if (arg63 === "repair-module") {
      for (const item of [-1, 1]) {
        const v175 = 64 + item * 35;
        const v176 = 61 + v167 * 8;
        drawPath2(ctx, [[64 + item * 21, 68], [v175, v176], [64 + item * 49, 83 - v167 * 6]], "#112033", 9);
        drawPath2(ctx, [[64 + item * 21, 65], [v175, v176 - 2], [64 + item * 49, 80 - v167 * 6]], "#b2c5d1", 4);
        fn44(ctx, v175, v176, 5, 5, 2);
        drawPath2(ctx, [[64 + item * 49, 81 - v167 * 6], [64 + item * 55, 74 - v167 * 6]], "#ccd7dd", 3);
        drawPath2(ctx, [[64 + item * 49, 81 - v167 * 6], [64 + item * 53, 89 - v167 * 6]], "#9dafbb", 3);
      }
      fn40(ctx, [[45, 34], [82, 34], [91, 46], [87, 92], [42, 92], [37, 45]], true);
      drawPath(ctx, [[46, 41], [80, 41], [85, 49], [82, 69], [45, 69], [42, 49]], getGradient(ctx, 40, 39, 48, 40, ["#f0cd78", "#9a6c2b", "#e8b856"]), "#312c22", 1);
      drawRect(ctx, 49, 75, 29, 11, 4);
      drawPath(ctx, [[58, 46], [66, 42], [73, 48], [70, 57], [62, 61], [55, 55]], "#213b49", "#afc9d3", 1);
      fn42(ctx, 64, 52, "#b3ffd2", 3);
      for (const [item, item2] of [[46, 45], [80, 45], [47, 87], [80, 87]]) {
        fn41(ctx, item, item2);
      }
    } else if (arg63 === "gyro-stabilizer") {
      drawPath2(ctx, [[64, 22], [64, 103]], "#617b8d", 5);
      fn40(ctx, [[51, 103], [77, 103], [86, 113], [42, 113]], true);
      fn44(ctx, 64, 62, 45, 36, 3, "#d2b47a", v167 * 0.18);
      fn44(ctx, 64, 62, 34, 21, 4, "#c7d5df", v166 + 0.5);
      fn44(ctx, 64, 62, 20, 34, 3, "#92aebf", -v166);
      fn43(ctx, 64, 62, 10, "#8df8ff");
      for (const item of [v166, v166 + Math.PI]) {
        const v177 = 64 + Math.cos(item) * 43;
        const v178 = 62 + Math.sin(item) * 32;
        fn41(ctx, v177, v178);
      }
      fn42(ctx, 64, 109, "#47f5c9");
    } else if (arg63 === "deep-probe") {
      drawPath2(ctx, [[64, 28], [64, 7]], "#becbd5", 2);
      fn42(ctx, 64, 8, "#ffb276", 1.5);
      fn40(ctx, [[52, 25], [76, 25], [85, 45], [83, 91], [73, 104], [54, 104], [45, 90], [43, 44]]);
      for (const item of [-1, 1]) {
        fn40(ctx, [[64 + item * 17, 62], [64 + item * 37, 85], [64 + item * 35, 102], [64 + item * 19, 89]], true);
        drawPath2(ctx, [[64 + item * 23, 45], [64 + item * 32, 26]], "#94a7b4", 2);
        drawEllipse(ctx, 64 + item * 33, 24, 3, 3, "#b5d7e7");
      }
      drawPath(ctx, [[54, 42], [73, 42], [78, 68], [50, 68]], "#14293d", "#a2c4d4", 1);
      fn43(ctx, 64, 55, 8);
      drawRect(ctx, 53, 77, 22, 15, 5);
      fn44(ctx, 64, 103, 10, 5, 3);
      drawPath(ctx, [[57, 106], [71, 106], [66, 121 + v167 * 2], [62, 121 - v167 * 2]], getGradient(ctx, 0, 106, 0, 18, ["#c9ffff", "#48bbff99", "#1c62ff00"]));
      fn41(ctx, 52, 32);
      fn41(ctx, 75, 32);
    } else {
      for (let i = 0; i < 4; i++) {
        const v179 = i * TAU / 4 + v167 * 0.08;
        const v180 = 64 + Math.cos(v179) * 35;
        const v181 = 64 + Math.sin(v179) * 35;
        drawPath2(ctx, [[64, 64], [v180, v181]], "#849eaf", 5);
        ctx.save();
        ctx.translate(v180, v181);
        ctx.rotate(v179);
        fn40(ctx, [[-7, -12], [9, -12], [13, 13], [-7, 13]], true);
        drawPath2(ctx, [[1, -8], [1, 8]], "#75ffe1", 2);
        ctx.restore();
      }
      const list = [];
      for (let i = 0; i < 8; i++) {
        const v182 = i * TAU / 8;
        list.push([64 + Math.cos(v182) * 27, 64 + Math.sin(v182) * 27]);
      }
      fn40(ctx, list);
      fn43(ctx, 64, 64, 16, "#7cf3d2");
      for (let i = 0; i < 8; i++) {
        const v183 = i * TAU / 8;
        fn41(ctx, 64 + Math.cos(v183) * 24, 64 + Math.sin(v183) * 24);
      }
      fn42(ctx, 64 + v168 * 10, 64 + v167 * 10, "#e4ffb6", 2);
    }
    ctx.restore();
    return true;
  }
  const fragment = "uniform sampler2D uPattern;uniform float uOpacity;uniform float uTime;uniform float uMotion;uniform vec3 uAccent;uniform vec3 uSecondary;varying vec2 vUV;varying float vLight;void main(){vec2 p=clamp(vUV,0.001,0.999);vec4 c=texture2D(uPattern,p);if(c.a<0.004)discard;float t=uTime;float ink=0.0;float second=0.0;vec2 q=p-0.5;if(uMotion<0.5){}else if(uMotion<1.5){float x=fract(t*0.28)*1.7-0.35+0.055*sin(p.y*53.0+t*2.0)+0.025*sin(p.y*127.0-t);ink=exp(-abs(p.x-x)*140.0);second=exp(-abs(p.x-x-0.16*(p.y-0.5))*95.0)*0.55;}else if(uMotion<2.5){float y=fract(t*0.2)*1.6-0.3;ink=exp(-abs(p.y-y-0.13*sin(p.x*8.0+t))*35.0);second=exp(-abs(p.y-y-0.26-0.08*sin(p.x*11.0-t))*43.0)*0.65;}else if(uMotion<3.5){float y=fract(t*0.23)*1.4-0.2;float grid=pow(max(0.0,cos(p.x*50.2655)),18.0)+pow(max(0.0,cos(p.y*50.2655)),18.0);ink=exp(-abs(p.y-y)*32.0)*(0.25+0.75*min(1.0,grid));second=exp(-abs(p.y-y+0.06)*60.0)*0.4;}else if(uMotion<4.5){float seam=pow(max(0.0,cos(p.x*24.0+sin(p.y*31.0)*1.7)),24.0);ink=seam*(0.38+0.62*pow(max(0.0,sin(p.y*10.0-t*2.4)),4.0));second=exp(-abs(length(q)-fract(t*0.2)*0.8)*42.0)*0.45;}else if(uMotion<5.5){float y=fract(t*0.17)*1.8-0.4;ink=exp(-abs(p.x+p.y*0.5-y)*54.0);second=exp(-abs(p.x-p.y*0.7+fract(t*0.13)*1.6-0.7)*70.0)*0.65;}else if(uMotion<6.5){float track=pow(max(0.0,cos(p.x*31.4159)),24.0);ink=track*pow(max(0.0,cos(p.y*25.0-t*4.0)),10.0);second=pow(max(0.0,sin(p.x*31.4159)),24.0)*pow(max(0.0,cos(p.y*25.0+t*3.0)),10.0);}else if(uMotion<7.5){float r=length(q);ink=pow(max(0.0,cos(r*35.0-t*3.0)),12.0)*0.85;second=exp(-r*12.0)*(0.5+0.5*sin(t*2.0));}else if(uMotion<8.5){float angle=atan(q.y,q.x);float r=length(q);ink=pow(max(0.0,cos(angle*3.0+r*18.0-t*2.0)),16.0)*smoothstep(0.05,0.25,r);second=exp(-abs(r-0.29-0.035*sin(angle*4.0+t))*65.0)*0.65;}else if(uMotion<9.5){float wave=p.y+0.13*sin(p.x*8.0+t*0.7);ink=pow(max(0.0,sin(wave*16.0-t*1.4)),8.0)*0.8;second=pow(max(0.0,sin(wave*16.0-t*1.4+1.8)),12.0)*0.6;}else{float lane=floor(p.x*11.0);float x=(lane+0.5)/11.0;float y=fract(t*0.35+lane*0.173)*1.5-0.25;ink=exp(-abs(p.x-x)*240.0)*exp(-abs(p.y-y)*28.0);second=ink*pow(max(0.0,sin(t*3.0+lane)),3.0);}gl_FragColor=vec4(min(vec3(1.0),c.rgb*vLight+uAccent*ink*0.85+uSecondary*second*0.7),c.a*uOpacity);}";
  return {
    patterns: patterns,
    companions: companions,
    pattern: pattern,
    companion: companion,
    motion: motion,
    spec: arg66 => map.get(arg66) || null,
    fragment: fragment
  };
}
function createCosmeticPainter() {
  'use strict';

  const TAU = Math.PI * 2;
  const cosmeticExpansionPainter = createCosmeticExpansionPainter();
  const hardwarePainter = createHardwarePainter();
  function drawPath(ctx, arg67, fillStyle, strokeStyle, lineWidth) {
    ctx.beginPath();
    for (let i = 0; i < arg67.length; i++) {
      if (i) {
        ctx.lineTo(...arg67[i]);
      } else {
        ctx.moveTo(...arg67[i]);
      }
    }
    ctx.closePath();
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }
  function drawPath2(ctx, arg68, strokeStyle, lineWidth) {
    ctx.beginPath();
    for (let i = 0; i < arg68.length; i++) {
      if (i) {
        ctx.lineTo(...arg68[i]);
      } else {
        ctx.moveTo(...arg68[i]);
      }
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  function pattern(ctx, arg69, arg70) {
    if (hardwarePainter.pattern(ctx, arg69, arg70)) {
      return;
    }
    if (cosmeticExpansionPainter.pattern(ctx, arg69, arg70)) {
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, arg70, arg70);
    ctx.scale(arg70 / 512, arg70 / 512);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (arg69 === "neon-cracks") {
      ctx.fillStyle = "#05132166";
      ctx.fillRect(0, 0, 512, 512);
      const v184 = [[[240, 0], [228, 87], [255, 132], [224, 194], [248, 237], [225, 297], [244, 360], [218, 424], [233, 512]], [[0, 194], [86, 224], [130, 214], [183, 267], [225, 297]], [[512, 132], [437, 183], [380, 182], [337, 234], [248, 237]], [[0, 430], [72, 397], [122, 411], [177, 367], [244, 360]], [[512, 457], [431, 421], [397, 365], [316, 343], [225, 297]], [[228, 87], [170, 120], [140, 97]], [[337, 234], [374, 289], [431, 300]], [[183, 267], [143, 301], [95, 293]]];
      ctx.shadowColor = "#26e3ff";
      ctx.shadowBlur = 9;
      for (const item of v184) {
        drawPath2(ctx, item, "#2cd9ed88", 8);
      }
      ctx.shadowBlur = 0;
      for (const item of v184) {
        drawPath2(ctx, item, "#99f6ff", 2.5);
      }
    } else if (arg69 === "medusa") {
      const gradient = ctx.createLinearGradient(0, 0, 512, 512);
      gradient.addColorStop(0, "#0a375b88");
      gradient.addColorStop(1, "#11183399");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      for (const item of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(256 + item * (43 + i * 14), 193 + i * 19);
          ctx.bezierCurveTo(256 + item * 220, 230 + i * 24, 256 + item * 100, 310 + i * 26, 256 + item * (210 + i * 12), 420 + i * 12);
          ctx.strokeStyle = i % 2 ? "#8b9ed17d" : "#59d7e899";
          ctx.lineWidth = i % 2 ? 2 : 4;
          ctx.stroke();
        }
      }
      ctx.shadowColor = "#50e6ff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(190, 213);
      ctx.bezierCurveTo(181, 116, 331, 116, 322, 213);
      ctx.bezierCurveTo(300, 235, 287, 203, 272, 217);
      ctx.bezierCurveTo(251, 238, 238, 204, 220, 218);
      ctx.bezierCurveTo(207, 226, 196, 222, 190, 213);
      ctx.fillStyle = "#62dffce8";
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(241, 162, 29, 10, -0.45, 0, TAU);
      ctx.fillStyle = "#d6fbff9c";
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const v185 = 218 + i * 15;
        ctx.beginPath();
        ctx.moveTo(v185, 218);
        ctx.bezierCurveTo(v185 - 28, 265, v185 + 31, 298, v185 - 12 + (i - 2.5) * 8, 354 + i % 3 * 19);
        ctx.strokeStyle = i % 2 ? "#7bafff" : "#63e7ff";
        ctx.lineWidth = i % 2 ? 4 : 6;
        ctx.stroke();
      }
    } else if (arg69 === "crystal") {
      ctx.fillStyle = "#64bddbb8";
      ctx.fillRect(0, 0, 512, 512);
      const v186 = ["#dafaffbc", "#5eb6dfbb", "#a3e4f2cc", "#2483b0b3", "#b6f4ffc9", "#418dbfb5"];
      for (let v187 = -1; v187 < 7; v187++) {
        for (let v188 = -1; v188 < 7; v188++) {
          const v189 = v188 * 92 + v187 % 2 * 36;
          const v190 = v187 * 90;
          const v191 = v189 + 37 + (v188 * 13 + v187 * 7 + 80) % 31;
          const v192 = v190 + 38 + (v188 * 3 + v187 * 17 + 80) % 29;
          drawPath(ctx, [[v189, v190], [v189 + 92, v190], [v191, v192]], v186[(v188 + v187 * 2 + 100) % 6], "#e5ffff5c", 1.5);
          drawPath(ctx, [[v189 + 92, v190], [v189 + 92, v190 + 90], [v191, v192]], v186[(v188 + v187 * 3 + 101) % 6], "#d7f8ff44", 1);
          drawPath(ctx, [[v189 + 92, v190 + 90], [v189, v190 + 90], [v191, v192]], v186[(v188 + v187 * 2 + 102) % 6]);
          drawPath(ctx, [[v189, v190 + 90], [v189, v190], [v191, v192]], v186[(v188 + v187 * 3 + 103) % 6]);
        }
      }
    } else if (arg69 === "titanium") {
      const gradient = ctx.createLinearGradient(0, 0, 512, 0);
      gradient.addColorStop(0, "#607587bd");
      gradient.addColorStop(0.28, "#b3c4d5d4");
      gradient.addColorStop(0.49, "#3a485bce");
      gradient.addColorStop(0.51, "#cbdbe3d0");
      gradient.addColorStop(0.75, "#72879dca");
      gradient.addColorStop(1, "#2c3a50c0");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 240; i++) {
        const v193 = i * 53 % 512;
        const v194 = i * 97 % 512;
        drawPath2(ctx, [[v194, v193], [Math.min(512, v194 + 18 + i % 43), v193]], i % 3 ? "#effaff13" : "#09132120", 1);
      }
      for (const item of [-1, 1]) {
        drawPath2(ctx, [[256 + item * 82, 0], [256 + item * 61, 143], [256 + item * 94, 232], [256 + item * 65, 336], [256 + item * 112, 512]], "#162438df", 10);
        drawPath2(ctx, [[256 + item * 82, 0], [256 + item * 61, 143], [256 + item * 94, 232], [256 + item * 65, 336], [256 + item * 112, 512]], "#e6b86dbf", 3);
        drawPath2(ctx, [[256 + item * 94, 232], [256 + item * 215, 293], [256 + item * 256, 282]], "#dcaf69aa", 3);
      }
    }
    ctx.restore();
  }
  function companion(ctx, arg71, arg72, arg73) {
    if (hardwarePainter.companion(ctx, arg71, arg72, arg73)) {
      return;
    }
    if (cosmeticExpansionPainter.companion(ctx, arg71, arg72, arg73)) {
      return;
    }
    ctx.save();
    ctx.clearRect(0, 0, arg72, arg72);
    ctx.scale(arg72 / 128, arg72 / 128);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const v195 = arg73 * TAU / 8;
    if (arg71 === "jellyfish") {
      for (let i = 0; i < 6; i++) {
        const v196 = 45 + i * 7;
        const v197 = v196 + (i - 2.5) * 3 + Math.sin(v195 + i * 0.8) * 8;
        const gradient = ctx.createLinearGradient(v196, 45, v197, 118);
        gradient.addColorStop(0, "#87ebfff0");
        gradient.addColorStop(0.55, "#82a5f5ca");
        gradient.addColorStop(1, "#9471e61a");
        ctx.beginPath();
        ctx.moveTo(v196, 49);
        ctx.bezierCurveTo(v196 - 12 + Math.sin(v195) * 7, 72, v197 + 13, 91, v197, 110 + i % 2 * 9);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4 - i % 2;
        ctx.stroke();
      }
      drawPath(ctx, [[33, 43], [37, 27], [51, 17], [69, 15], [86, 23], [96, 39], [92, 51], [80, 57], [66, 52], [51, 57], [38, 53]], "#74ceeedb", "#b2f5ffed", 1.5);
      drawPath(ctx, [[37, 27], [51, 17], [57, 36], [33, 43]], "#b9f6ffc9");
      drawPath(ctx, [[51, 17], [69, 15], [57, 36]], "#e0fdffda");
      drawPath(ctx, [[69, 15], [86, 23], [77, 39], [57, 36]], "#91d9f1d4");
      drawPath(ctx, [[86, 23], [96, 39], [77, 39]], "#5aafdecc");
      drawPath(ctx, [[57, 36], [77, 39], [66, 52], [51, 57]], "#887fdbba");
      drawPath(ctx, [[33, 43], [57, 36], [51, 57], [38, 53]], "#92e6f3bc");
      ctx.beginPath();
      ctx.ellipse(51, 27, 9, 3, -0.5, 0, TAU);
      ctx.fillStyle = "#e9ffffd0";
      ctx.fill();
    } else if (arg71 === "drone") {
      const gradient = ctx.createLinearGradient(0, 85, 0, 123);
      gradient.addColorStop(0, "#e5ffff");
      gradient.addColorStop(0.2, "#49dfffdd");
      gradient.addColorStop(1, "#198cfa00");
      drawPath(ctx, [[55, 83], [73, 83], [69, 102 + Math.sin(v195) * 4], [64, 123], [59, 102 + Math.sin(v195) * 4]], gradient);
      drawPath(ctx, [[48, 31], [76, 31], [92, 49], [92, 73], [76, 90], [48, 90], [32, 73], [32, 49]], "#293e58", "#a8bacd", 3);
      drawPath(ctx, [[48, 31], [76, 31], [85, 43], [42, 43]], "#d4e4ef");
      drawPath(ctx, [[92, 49], [92, 73], [76, 90], [76, 76], [82, 65], [82, 50]], "#687f99");
      drawPath(ctx, [[32, 49], [42, 43], [42, 76], [48, 90], [32, 73]], "#90a9bd");
      for (const item of [-1, 1]) {
        drawPath(ctx, [[64 + item * 30, 43], [64 + item * 46, 34], [64 + item * 50, 49], [64 + item * 48, 76], [64 + item * 36, 84], [64 + item * 30, 69]], "#6c839c", "#b2d6e4", 2);
      }
      const list = [];
      for (let i = 0; i < 6; i++) {
        const v198 = i * TAU / 6;
        list.push([64 + Math.cos(v198) * 18, 60 + Math.sin(v198) * 18]);
      }
      drawPath(ctx, list, "#1685bf", "#c6f9ff", 3);
      ctx.beginPath();
      ctx.arc(64, 60, 10, 0, TAU);
      ctx.fillStyle = "#8cecff";
      ctx.fill();
      drawPath2(ctx, [[18, 49], [18, 70]], "#65e5ff", 3);
      drawPath2(ctx, [[110, 49], [110, 70]], "#65e5ff", 3);
    }
    ctx.restore();
  }
  return {
    pattern: pattern,
    companion: companion,
    patterns: [...cosmeticExpansionPainter.patterns, ...hardwarePainter.patterns],
    companions: [...cosmeticExpansionPainter.companions, ...hardwarePainter.companions],
    motion: hardwarePainter.motion,
    motionSpec: hardwarePainter.spec,
    animatedFragment: hardwarePainter.fragment
  };
}
function createShipCosmetics(target, arg74) {
  'use strict';

  const cosmeticPainter = createCosmeticPainter();
  const patterns = [{
    id: "native",
    name: "Original"
  }, {
    id: "neon-cracks",
    name: "Neon Cracks"
  }, {
    id: "medusa",
    name: "Medusa"
  }, {
    id: "crystal",
    name: "Crystal"
  }, {
    id: "titanium",
    name: "Titanium"
  }, ...cosmeticPainter.patterns];
  const companions = [{
    id: "off",
    name: "Off"
  }, {
    id: "jellyfish",
    name: "Jellyfish"
  }, {
    id: "drone",
    name: "Drone"
  }, ...cosmeticPainter.companions];
  const map = new Map();
  const map2 = new Map();
  const weakSet = new WeakSet();
  const patternCacheLimit = 4;
  const companionCacheLimit = 3;
  const vertexShader = "uniform vec4 uBounds;varying vec2 vUV;varying float vLight;void main(){vUV=vec2((position.y-uBounds.x)*uBounds.z,1.0-(position.x-uBounds.y)*uBounds.w);float n2=dot(normal,normal);vLight=0.82;if(n2>0.00001&&n2<100000.0)vLight=0.58+0.42*max(0.0,dot(normal/sqrt(n2),normalize(vec3(-0.3,0.4,1.0))));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}";
  const fragment = "uniform sampler2D uPattern;uniform float uOpacity;varying vec2 vUV;varying float vLight;void main(){vec4 c=texture2D(uPattern,clamp(vUV,0.001,0.999));if(c.a<0.004)discard;gl_FragColor=vec4(c.rgb*vLight,c.a*uOpacity);}";
  const supported = !arg74 || !arg74.compatibility || arg74.compatibility.shipCosmetics !== false;
  let medusaPattern = "native";
  let companion = "off";
  let v199 = null;
  let v200 = null;
  let v201 = false;
  let v202 = null;
  function fn45() {
    if (target.performance && typeof target.performance.now === "function") {
      return target.performance.now();
    } else {
      return Date.now();
    }
  }
  function patternAnimated() {
    return !!supported && !v201 && !!cosmeticPainter.motionSpec(medusaPattern);
  }
  const set = new Set(["orbit-bot", "mini-ufo", "space-manta", "cyber-bee", "rocket-pup", "astro-cat", "dragonling"]);
  function fn46(key, items, arg75) {
    try {
      const stored = target.localStorage.getItem(key);
      if (key === "medusa_companion_v1" && set.has(stored)) {
        target.localStorage.removeItem(key);
        return arg75;
      }
      if (items.some(item => item.id === stored)) {
        return stored;
      } else {
        return arg75;
      }
    } catch (err) {
      return arg75;
    }
  }
  medusaPattern = fn46("medusa_ship_pattern_v1", patterns, "native");
  companion = fn46("medusa_companion_v1", companions, "off");
  function createCanvas(width, height) {
    const canvasEl = target.document.createElement("canvas");
    canvasEl.width = width;
    canvasEl.height = height;
    return canvasEl;
  }
  function fn47(arg76, arg77, arg78, arg79) {
    arg76.set(arg77, arg78);
    if (arg76.size > arg79) {
      const value = arg76.keys().next().value;
      const v203 = arg76.get(value);
      if (v203.texture) {
        v203.texture.dispose();
      }
      arg76.delete(value);
    }
  }
  function fn48(arg80, arg81) {
    let v204 = map.get(arg80);
    if (!v204) {
      const canvas = createCanvas(512, 512);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw Error("Pattern canvas unavailable");
      }
      cosmeticPainter.pattern(ctx, arg80, 512);
      v204 = {
        image: canvas,
        texture: null
      };
      fn47(map, arg80, v204, patternCacheLimit);
    }
    if (arg81 && !v204.texture) {
      v204.texture = new arg81.Texture(v204.image);
      v204.texture.minFilter = v204.texture.magFilter = arg81.LinearFilter;
      v204.texture.generateMipmaps = false;
      v204.texture.needsUpdate = true;
    }
    return v204;
  }
  function fn49(arg82, arg83) {
    const dtSpaceEffects = target.__DT_SPACE_EFFECTS;
    const v205 = !!dtSpaceEffects && !!dtSpaceEffects.companionArtEnabled();
    const v206 = arg82 + (v205 ? "#reactions" : "");
    let v207 = map2.get(v206);
    if (!v207) {
      const rows = v205 ? 8 : 2;
      const canvas = createCanvas(512, rows * 128);
      const canvas2 = createCanvas(128, 128);
      const ctx = canvas.getContext("2d");
      const ctx2 = canvas2.getContext("2d");
      const v208 = v205 ? createCanvas(128, 128) : null;
      const v209 = v208 && v208.getContext("2d");
      if (!ctx || !ctx2 || v205 && !v209) {
        throw Error("Companion canvas unavailable");
      }
      for (let i = 0; i < 8; i++) {
        cosmeticPainter.companion(ctx2, arg82, 128, i);
        ctx.drawImage(canvas2, i % 4 * 128, Math.floor(i / 4) * 128);
        if (v205) {
          for (let j = 1; j < 4; j++) {
            dtSpaceEffects.art.companion(v209, canvas2, i, j);
            ctx.drawImage(v208, i % 4 * 128, (Math.floor(i / 4) + j * 2) * 128);
          }
        }
      }
      v207 = {
        image: canvas,
        rows: rows,
        texture: null
      };
      fn47(map2, v206, v207, companionCacheLimit);
    }
    if (arg83 && !v207.texture) {
      const v210 = v207.texture = new arg83.Texture(v207.image);
      v210.minFilter = v210.magFilter = arg83.LinearFilter;
      v210.generateMipmaps = false;
      v210.repeat.set(0.25, 1 / v207.rows);
      v210.needsUpdate = true;
    }
    return v207;
  }
  function fn50(arg84) {
    if (arg84 && arg84.hull) {
      if (arg84.hull.parent) {
        arg84.hull.parent.remove(arg84.hull);
      }
      arg84.hull.material.dispose();
      arg84.hull = null;
    }
  }
  function fn51(arg85) {
    if (arg85 && arg85.sprite) {
      if (arg85.sprite.parent) {
        arg85.sprite.parent.remove(arg85.sprite);
      }
      arg85.sprite.material.dispose();
      arg85.sprite = null;
      arg85.time = null;
    }
  }
  function dispose(scene) {
    if (v199 && (!scene || v199.scene === scene)) {
      fn50(v199);
      fn51(v199);
      v199 = null;
    }
  }
  function fn52(model, scene, arg86) {
    const geometry = model.geometry || model.IIl1l && model.IIl1l.geometry;
    if (!geometry || !model.OIII1) {
      return null;
    }
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }
    const boundingBox = geometry.boundingBox;
    const dx = boundingBox.max.x - boundingBox.min.x;
    const dy = boundingBox.max.y - boundingBox.min.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(dx > 0) || !(dy > 0)) {
      return null;
    }
    return {
      model: model,
      geometry: geometry,
      scene: scene,
      T: arg86,
      minX: boundingBox.min.x,
      minY: boundingBox.min.y,
      maxX: boundingBox.max.x,
      maxZ: boundingBox.max.z,
      dx: dx,
      dy: dy,
      hull: null,
      sprite: null,
      time: null,
      target: new arg86.Vector3(),
      last: new arg86.Vector3(),
      bounds: new arg86.Vector4(boundingBox.min.y, boundingBox.min.x, 1 / dy, 1 / dx)
    };
  }
  function fn53(arg87, arg88 = 0, arg89 = true) {
    if (medusaPattern === "native") {
      fn50(arg87);
      return;
    }
    const v211 = arg87.T;
    const iIl1l = arg87.model.IIl1l;
    if (!iIl1l || iIl1l.geometry !== arg87.geometry) {
      return;
    }
    const v212 = cosmeticPainter.motionSpec(medusaPattern);
    const fragmentShader = v212 ? cosmeticPainter.animatedFragment : fragment;
    if (!arg87.hull) {
      const v213 = new v211.ShaderMaterial({
        uniforms: {
          uBounds: {
            value: arg87.bounds
          },
          uPattern: {
            value: null
          },
          uOpacity: {
            value: 1
          },
          uTime: {
            value: 0
          },
          uMotion: {
            value: 0
          },
          uAccent: {
            value: new v211.Color()
          },
          uSecondary: {
            value: new v211.Color()
          }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: v211.FrontSide
      });
      arg87.hull = new v211.Mesh(arg87.geometry, v213);
      arg87.hull.name = "MedusaHullPattern";
      arg87.hull.renderOrder = (iIl1l.renderOrder || 0) + 1;
      iIl1l.add(arg87.hull);
    }
    const material = arg87.hull.material;
    if (material.fragmentShader !== fragmentShader) {
      material.fragmentShader = fragmentShader;
      material.needsUpdate = true;
    }
    if (material._medusaPattern !== medusaPattern) {
      material._medusaPattern = medusaPattern;
      material.uniforms.uMotion.value = v212 ? v212.motion : 0;
      if (v212) {
        material.uniforms.uAccent.value.set(v212.accent);
        material.uniforms.uSecondary.value.set(v212.secondary);
      }
    }
    material.uniforms.uTime.value = v212 ? arg88 * 0.001 % 3600 : 0;
    material.uniforms.uMotion.value = v212 && arg89 ? v212.motion : 0;
    material.uniforms.uPattern.value = fn48(medusaPattern, v211).texture;
    material.uniforms.uOpacity.value = Number.isFinite(arg87.model.material && arg87.model.material.opacity) ? arg87.model.material.opacity : 1;
    arg87.hull.visible = true;
  }
  function fn54(arg90, id) {
    if (v201 || !supported) {
      return;
    }
    const v214 = arg90 === "pattern" ? patterns : companions;
    if (!v214.some(item => item.id === id)) {
      return;
    }
    if (arg90 === "pattern") {
      medusaPattern = id;
    } else {
      companion = id;
    }
    try {
      target.localStorage.setItem(arg90 === "pattern" ? "medusa_ship_pattern_v1" : "medusa_companion_v1", id);
    } catch (err) {}
    if (arg90 === "pattern" && id !== "native") {
      try {
        fn48(id);
      } catch (err) {}
    }
    if (arg90 === "companion" && id !== "off") {
      try {
        fn49(id);
      } catch (err) {}
    }
    if (v199) {
      if (medusaPattern === "native") {
        fn50(v199);
      }
      if (companion === "off") {
        fn51(v199);
      }
      if (medusaPattern === "native" && companion === "off") {
        dispose();
      }
    }
    fn55();
    if (target.__DT_ENGINE_TRAILS) {
      target.__DT_ENGINE_TRAILS.refreshPreview();
    }
  }
  function fn55() {
    if (!target.document.querySelectorAll) {
      return;
    }
    for (const item of ["pattern", "companion"]) {
      const v215 = item === "pattern" ? patterns : companions;
      const v216 = item === "pattern" ? medusaPattern : companion;
      const found = v215.find(item2 => item2.id === v216);
      target.document.querySelectorAll(".dt-" + item + "-row").forEach(item2 => {
        item2.setAttribute("data-cosmetic-id", v216);
        item2.setAttribute("aria-disabled", String(!supported));
        const dtCosmeticNameEl = item2.querySelector(".dt-cosmetic-name");
        if (dtCosmeticNameEl) {
          dtCosmeticNameEl.textContent = (item === "pattern" ? "Pattern: " : "Pet: ") + (supported ? found.name : "Unavailable");
        }
      });
    }
  }
  function mount() {
    const document = target.document;
    if (!document.querySelectorAll) {
      return;
    }
    document.querySelectorAll(".customtable [data-type=\"laser\"]").forEach(item => {
      const parentNode = item.parentNode;
      if (!parentNode) {
        return;
      }
      let dtTrailRowEl = parentNode.querySelector(".dt-trail-row") || item;
      for (const item2 of ["pattern", "companion"]) {
        let el = parentNode.querySelector(".dt-" + item2 + "-row");
        if (el) {
          dtTrailRowEl = el;
          continue;
        }
        el = document.createElement("div");
        el.className = "dt-cosmetic-row dt-" + item2 + "-row";
        el.setAttribute("role", "group");
        el.setAttribute("aria-label", item2 === "pattern" ? "Ship pattern" : "Ship companion");
        const divEl = document.createElement("div");
        divEl.className = "title frozenbg dt-cosmetic-name";
        divEl.setAttribute("role", "status");
        divEl.setAttribute("aria-live", "polite");
        const arr = [-1, 1].map(item3 => {
          const iEl = document.createElement("i");
          iEl.className = "fa fa-caret-" + (item3 < 0 ? "left" : "right") + " dt-trail-arrow";
          iEl.setAttribute("role", "button");
          iEl.setAttribute("tabindex", "0");
          iEl.setAttribute("aria-label", (item3 < 0 ? "Previous " : "Next ") + (item2 === "pattern" ? "ship pattern" : "ship companion"));
          function onClick(event) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const v217 = item2 === "pattern" ? patterns : companions;
            const v218 = item2 === "pattern" ? medusaPattern : companion;
            const idx = v217.findIndex(item4 => item4.id === v218);
            fn54(item2, v217[(idx + item3 + v217.length) % v217.length].id);
          }
          iEl.addEventListener("click", onClick);
          iEl.addEventListener("keydown", event => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
              onClick(event);
            }
          });
          return iEl;
        });
        el.append(arr[0], document.createTextNode(" "), divEl, document.createTextNode(" "), arr[1]);
        dtTrailRowEl.insertAdjacentElement("afterend", el);
        dtTrailRowEl = el;
      }
    });
    fn55();
  }
  function frame(scene, arg91) {
    if (v201 || !supported || medusaPattern === "native" && companion === "off") {
      return;
    }
    if (!scene || scene.welcome || !scene.ship || !scene.O1Ol1 || !scene.l1O0I || scene.O1Ol1 !== scene.l1O0I.O1Ol1 || !arg91 || weakSet.has(scene)) {
      if (v199 && v199.scene === scene) {
        dispose(scene);
      }
      return;
    }
    try {
      if (v199 && (v199.scene !== scene || v199.model !== scene.ship || v199.geometry !== (scene.ship.geometry || scene.ship.IIl1l && scene.ship.IIl1l.geometry))) {
        dispose();
      }
      if (!v199) {
        v199 = fn52(scene.ship, scene, arg91);
      }
      const event = v199;
      if (!event) {
        return;
      }
      const model = event.model;
      const oiii1 = model.OIII1;
      const v219 = !!scene.O1Ol1.status && !!scene.O1Ol1.status.alive;
      const v220 = v219 && oiii1.visible !== false && (!model.IIl1l || model.IIl1l.visible !== false);
      if (!v220) {
        if (event.hull) {
          event.hull.visible = false;
        }
        if (event.sprite) {
          event.sprite.visible = false;
        }
        event.time = null;
        return;
      }
      const v221 = patternAnimated() ? fn45() : null;
      fn53(event, v221 || 0);
      if (companion === "off") {
        fn51(event);
        return;
      }
      const v222 = fn49(companion, arg91);
      const parent = oiii1.parent;
      if (!parent) {
        return;
      }
      if (!event.sprite) {
        event.sprite = new arg91.Sprite(new arg91.SpriteMaterial({
          map: v222.texture,
          transparent: true,
          depthWrite: false,
          depthTest: true
        }));
        event.sprite.name = "MedusaCompanion";
        event.sprite.frustumCulled = false;
        parent.add(event.sprite);
      }
      if (event.sprite.parent !== parent) {
        parent.add(event.sprite);
      }
      const time = v221 === null ? fn45() : v221;
      const v223 = event.time === null ? 0 : (time - event.time) / 1000;
      event.time = time;
      if (oiii1.matrixAutoUpdate) {
        oiii1.updateMatrix();
      }
      event.target.set(event.maxX + event.dx * 0.5, event.minY + event.dy * 0.5 + event.dy * 0.55, event.maxZ + 0.06).applyMatrix4(oiii1.matrix);
      const v224 = event.last.distanceToSquared(oiii1.position) > 2500;
      if (v223 <= 0 || v223 > 0.25 || v224) {
        event.sprite.position.copy(event.target);
      } else {
        event.sprite.position.lerp(event.target, 1 - Math.exp(v223 * -9));
      }
      event.last.copy(oiii1.position);
      const v225 = Math.max(event.dx * Math.abs(oiii1.scale.x), event.dy * Math.abs(oiii1.scale.y)) * 0.35;
      const v226 = 1 + Math.sin(time * 0.003) * 0.035;
      event.sprite.scale.set(v225 * v226, v225 * v226, 1);
      event.sprite.material.rotation = oiii1.rotation.z + Math.PI / 2;
      event.sprite.material.map = v222.texture;
      event.sprite.material.opacity = (Number.isFinite(model.material && model.material.opacity) ? model.material.opacity : 1) * 0.95;
      event.sprite.visible = true;
      const dtSpaceEffects = target.__DT_SPACE_EFFECTS;
      const v227 = v222.rows === 8 && dtSpaceEffects ? dtSpaceEffects.reactionState(time, false) : 0;
      const v228 = Math.floor(time / 130) % 8;
      v222.texture.offset.set(v228 % 4 * 0.25, (v222.rows - 1 - Math.floor(v228 / 4) - v227 * 2) / v222.rows);
      if (dtSpaceEffects) {
        dtSpaceEffects.applyCompanion(event.sprite, time);
      }
    } catch (err) {
      dispose(scene);
      weakSet.add(scene);
    }
  }
  function beforeThumbnail(model, arg92) {
    afterThumbnail();
    if (v201 || !supported || medusaPattern === "native" || !arg92) {
      return;
    }
    try {
      v200 = fn52(model, null, arg92);
      if (v200) {
        fn53(v200, 0, false);
      }
    } catch (err) {
      afterThumbnail();
    }
  }
  function afterThumbnail() {
    if (v200) {
      fn50(v200);
      v200 = null;
    }
  }
  function drawPatternPreview(ctx2, image, arg93) {
    if (!patternAnimated()) {
      return;
    }
    try {
      if (!v202 || v202.width !== image.width || v202.height !== image.height) {
        v202 = createCanvas(image.width, image.height);
      }
      const ctx = v202.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, image.width, image.height);
      ctx.save();
      try {
        cosmeticPainter.motion(ctx, medusaPattern, image.width, arg93);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(image, 0, 0);
      } finally {
        ctx.restore();
      }
      ctx2.save();
      try {
        ctx2.globalCompositeOperation = "screen";
        ctx2.drawImage(v202, 0, 0);
      } finally {
        ctx2.restore();
      }
    } catch (err) {}
  }
  function drawPreview(ctx, arg94, arg95) {
    if (companion === "off" || v201 || !supported) {
      return;
    }
    try {
      const v229 = fn49(companion);
      const dtSpaceEffects = target.__DT_SPACE_EFFECTS;
      const v230 = v229.rows === 8 && dtSpaceEffects ? dtSpaceEffects.reactionState(arg95, true) : 0;
      const v231 = Math.floor(arg95 / 130) % 8;
      const v232 = arg94.width * 0.28 * (1 + Math.sin(arg95 * 0.003) * 0.035);
      ctx.save();
      try {
        ctx.globalAlpha = 0.95;
        ctx.drawImage(v229.image, v231 % 4 * 128, (Math.floor(v231 / 4) + v230 * 2) * 128, 128, 128, arg94.width * 0.79 - v232 / 2, arg94.height * 0.87 - v232 * 0.1, v232, v232);
      } finally {
        ctx.restore();
      }
    } catch (err) {}
  }
  function onPagehide() {
    v201 = true;
    dispose();
    afterThumbnail();
    v202 = null;
    for (const item of [map, map2]) {
      for (const item2 of item.values()) {
        if (item2.texture) {
          item2.texture.dispose();
        }
      }
      item.clear();
    }
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("pagehide", onPagehide, {
      once: true
    });
  }
  return {
    patterns: patterns,
    companions: companions,
    painter: cosmeticPainter,
    mount: mount,
    frame: frame,
    dispose: dispose,
    beforeThumbnail: beforeThumbnail,
    afterThumbnail: afterThumbnail,
    drawPreview: drawPreview,
    drawPatternPreview: drawPatternPreview,
    patternAnimated: patternAnimated,
    companionEnabled: () => supported && !v201 && companion !== "off",
    choosePattern: id => fn54("pattern", id),
    chooseCompanion: id => fn54("companion", id),
    status: () => ({
      supported: supported,
      pattern: medusaPattern,
      companion: companion,
      active: !!v199,
      patternTextures: map.size,
      companionAtlases: map2.size,
      patternCacheLimit: patternCacheLimit,
      companionCacheLimit: companionCacheLimit
    }),
    shader: {
      vertex: vertexShader,
      fragment: fragment,
      animatedFragment: cosmeticPainter.animatedFragment
    }
  };
}
function createWorldShapes() {
  const weakMap = new WeakMap();
  const weakSet = new WeakSet();
  function fn56(arg96) {
    if (!arg96 || !Array.isArray(arg96.vertices) || arg96.vertices.length < 4) {
      return 0;
    }
    let v233 = 0;
    for (const vertice of arg96.vertices) {
      if (!Number.isFinite(vertice.x) || !Number.isFinite(vertice.y) || !Number.isFinite(vertice.z)) {
        return 0;
      }
      v233 = Math.max(v233, vertice.x * vertice.x + vertice.y * vertice.y + vertice.z * vertice.z);
    }
    return Math.sqrt(v233);
  }
  function crystal(arg97, arg98) {
    if (weakMap.has(arg98)) {
      return weakMap.get(arg98);
    }
    const radius = fn56(arg98);
    if (!radius || !arg97 || !arg97.Geometry || !arg97.Vector3 || !arg97.Face3) {
      return arg98;
    }
    let v234;
    try {
      v234 = new arg97.Geometry();
      function fn57(arg99, arg100, arg101, arg102) {
        const v236 = [[-arg99 + arg101, -arg100], [arg99 - arg101, -arg100], [arg99, -arg100 + arg101], [arg99, arg100 - arg101], [arg99 - arg101, arg100], [-arg99 + arg101, arg100], [-arg99, arg100 - arg101], [-arg99, -arg100 + arg101]];
        for (const item of v236) {
          v234.vertices.push(new arg97.Vector3(item[0], item[1], arg102));
        }
      }
      fn57(0.4, 0.69, 0.11, 0.38);
      fn57(0.61, 0.91, 0.19, 0.055);
      fn57(0.6, 0.9, 0.19, -0.08);
      v234.vertices.push(new arg97.Vector3(0, 0, -0.63));
      function fn58(arg103, arg104, arg105) {
        const point = v234.vertices[arg103];
        const point2 = v234.vertices[arg104];
        const point3 = v234.vertices[arg105];
        const v237 = point2.x - point.x;
        const v238 = point2.y - point.y;
        const v239 = point2.z - point.z;
        const v240 = point3.x - point.x;
        const v241 = point3.y - point.y;
        const v242 = point3.z - point.z;
        const v243 = (v238 * v242 - v239 * v241) * (point.x + point2.x + point3.x) + (v239 * v240 - v237 * v242) * (point.y + point2.y + point3.y) + (v237 * v241 - v238 * v240) * (point.z + point2.z + point3.z);
        v234.faces.push(v243 < 0 ? new arg97.Face3(arg103, arg105, arg104) : new arg97.Face3(arg103, arg104, arg105));
      }
      for (let i = 1; i < 7; i++) {
        fn58(0, i, i + 1);
      }
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 8; j++) {
          const v244 = (j + 1) % 8;
          const v245 = i * 8 + j;
          const v246 = i * 8 + v244;
          const v247 = (i + 1) * 8 + v244;
          const v248 = (i + 1) * 8 + j;
          fn58(v245, v246, v247);
          fn58(v245, v247, v248);
        }
      }
      for (let i = 0; i < 8; i++) {
        fn58(16 + i, 16 + (i + 1) % 8, 24);
      }
      const v235 = radius / fn56(v234);
      for (const vertice of v234.vertices) {
        vertice.multiplyScalar(v235);
      }
      v234.computeFaceNormals();
      v234.computeVertexNormals();
      v234.computeBoundingSphere();
      v234.computeBoundingBox();
      v234.boundingSphere.center.set(0, 0, 0);
      v234.boundingSphere.radius = radius;
      if (typeof arg98.dispose === "function") {
        try {
          arg98.dispose();
        } catch (err) {}
      }
      weakMap.set(arg98, v234);
      weakMap.set(v234, v234);
      return v234;
    } catch (err) {
      if (v234 && typeof v234.dispose === "function") {
        v234.dispose();
      }
      return arg98;
    }
  }
  function asteroid(arg106) {
    if (!arg106 || weakSet.has(arg106)) {
      return arg106;
    }
    const v249 = fn56(arg106);
    if (!v249) {
      return arg106;
    }
    const vertices = arg106.vertices;
    const float64Array = new Float64Array(vertices.length * 3);
    let v250 = 0;
    for (let i = 0; i < vertices.length; i++) {
      const point = vertices[i];
      const v252 = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
      if (v252 <= 1e-12) {
        return arg106;
      }
      const v253 = point.x / v252;
      const v254 = point.y / v252;
      const v255 = point.z / v252;
      const v256 = Math.pow(Math.pow(Math.abs(v253), 12) + Math.pow(Math.abs(v254), 12) + Math.pow(Math.abs(v255), 12), 1 / 12);
      const v257 = 0.78 + v252 * 0.22 / v249;
      const v258 = v257 / v256;
      const v259 = v253 * v258;
      const v260 = v254 * v258;
      const v261 = v255 * v258;
      float64Array[i * 3] = v259;
      float64Array[i * 3 + 1] = v260;
      float64Array[i * 3 + 2] = v261;
      v250 = Math.max(v250, v259 * v259 + v260 * v260 + v261 * v261);
    }
    const v251 = v249 / Math.sqrt(v250);
    for (let i = 0; i < vertices.length; i++) {
      vertices[i].set(float64Array[i * 3] * v251, float64Array[i * 3 + 1] * v251, float64Array[i * 3 + 2] * v251);
    }
    weakSet.add(arg106);
    return arg106;
  }
  return {
    crystal: crystal,
    asteroid: asteroid
  };
}
function createLaserColors() {
  function emit(arg107, arg108) {
    if (!arg107 || !arg108 || !arg107.dtChromatic || !arg107.geometry) {
      return;
    }
    const i0Oll = arg107.I0Oll;
    const core_size = arg107.core_size;
    const trail_size = arg107.trail_size;
    if (!Number.isInteger(core_size) || core_size < 1 || !Number.isInteger(trail_size) || trail_size < 1 || !Number.isInteger(arg108.core_index) || arg108.core_index < 0 || arg108.core_index >= core_size || !Number.isInteger(arg108.index) || arg108.index < core_size || arg108.index >= core_size + trail_size) {
      return;
    }
    const v262 = !!i0Oll && !i0Oll.welcome && !!i0Oll.O1Ol1 && !!i0Oll.O1Ol1.status && arg108.shipid != null && arg108.shipid === i0Oll.O1Ol1.status.id && !!Number.isInteger(arg108.type) && !!(arg108.type >= 0) && !!(arg108.type <= 3);
    let v263 = 0;
    if (v262) {
      arg107.dtShotSerial = ((arg107.dtShotSerial || 0) + 1) % 24;
      v263 = 1 + arg107.dtShotSerial / 24;
    }
    const dtChromatic = arg107.dtChromatic;
    dtChromatic[arg108.core_index] = v263;
    const v264 = arg108.type === 1 || arg108.type === 2 || arg108.type === 3 ? 9 : 19;
    for (let i = 0; i < v264; i++) {
      dtChromatic[core_size + (arg108.index - core_size + i) % trail_size] = v262 ? v263 + i * 0.035 : 0;
    }
    const attribute = arg107.geometry.getAttribute("dtChromatic");
    if (attribute) {
      attribute.needsUpdate = true;
    }
  }
  return {
    emit: emit
  };
}
function createShipColors(list2, target) {
  'use strict';

  var v265 = Object.create(null);
  var dt_ship_color_v1Key = "dt_ship_color_v1";
  var v266 = null;
  var weakMap = new WeakMap();
  var weakMap2 = new WeakMap();
  const medusa_ship_color_animation_v1Key = "medusa_ship_color_animation_v1";
  const v267 = ["map", "emissiveMap", "specularMap"];
  const v268 = ["color", "emissive", "specular"];
  let v269 = true;
  try {
    v269 = target.localStorage.getItem(medusa_ship_color_animation_v1Key) !== "0";
  } catch (err) {}
  function fn59() {
    if (target.performance && typeof target.performance.now === "function") {
      return target.performance.now();
    } else {
      return Date.now();
    }
  }
  function setAnimated(arg109) {
    v269 = !!arg109;
    try {
      target.localStorage.setItem(medusa_ship_color_animation_v1Key, v269 ? "1" : "0");
    } catch (err) {}
    if (target.__DT_ENGINE_TRAILS && typeof target.__DT_ENGINE_TRAILS.refreshPreview === "function") {
      target.__DT_ENGINE_TRAILS.refreshPreview();
    }
  }
  function fn60(arg110, arg111) {
    if (!v269) {
      return;
    }
    const v274 = fn59() * Math.PI * 2 / 6500;
    const v275 = 0.92 + Math.cos(v274) * 0.08;
    const material = arg110.material;
    if (typeof material.color.getHSL === "function" && typeof material.color.setHSL === "function") {
      material.color.getHSL(arg111.hsl);
      material.color.setHSL(arg111.hsl.h + (v266 ? 0 : Math.sin(v274) * 0.075), arg111.hsl.s, arg111.hsl.l * v275);
    }
    if (material.emissive && typeof material.emissive.multiplyScalar === "function") {
      material.emissive.multiplyScalar(0.8 + Math.sin(v274) * 0.2);
    }
  }
  function drawPreview(ctx, image, arg112) {
    if (!v269) {
      ctx.drawImage(image, 0, 0);
      return;
    }
    const v276 = arg112 * Math.PI * 2 / 6500;
    ctx.save();
    ctx.filter = "hue-rotate(" + (v266 ? 0 : Math.sin(v276) * 27) + "deg) brightness(" + (0.92 + Math.cos(v276) * 0.08) + ")";
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }
  list2.forEach(function (item) {
    v265[item.id] = item;
  });
  try {
    const stored = target.localStorage.getItem(dt_ship_color_v1Key);
    v266 = v265[stored] || null;
    if (stored === "black-white") {
      target.localStorage.removeItem(dt_ship_color_v1Key);
    }
  } catch (err) {}
  function sync() {
    var colorsEl = target.document.getElementById("colors");
    if (!colorsEl) {
      return;
    }
    colorsEl.querySelectorAll("[data-dt-color]").forEach(function (item) {
      var v277 = !!v266 && item.getAttribute("data-dt-color") === v266.id;
      item.classList.toggle("selected", v277);
      item.setAttribute("aria-pressed", String(v277));
    });
    if (!v266) {
      return;
    }
    colorsEl.querySelectorAll("span[data-hue]").forEach(function (item) {
      item.classList.remove("selected");
    });
    var colorchosenEl = target.document.querySelector(".colorchosen");
    if (colorchosenEl) {
      colorchosenEl.style.background = v266.swatch;
    }
  }
  function choose(arg113) {
    v266 = v265[arg113] || null;
    try {
      if (v266) {
        target.localStorage.setItem(dt_ship_color_v1Key, v266.id);
      } else {
        target.localStorage.removeItem(dt_ship_color_v1Key);
      }
    } catch (err) {}
    sync();
    return v266;
  }
  function mount() {
    var colorsEl = target.document.getElementById("colors");
    if (!colorsEl) {
      return;
    }
    if (colorsEl.querySelector(".dt-extra-colors")) {
      return;
    }
    var divEl = target.document.createElement("div");
    var divEl2 = target.document.createElement("div");
    divEl.className = "dt-extra-color-title";
    divEl.textContent = "Extra colors";
    divEl2.className = "dt-extra-colors";
    divEl2.setAttribute("role", "group");
    divEl2.setAttribute("aria-label", "Extra ship colors");
    list2.forEach(function (item) {
      var spanEl = target.document.createElement("span");
      spanEl.className = "dt-ship-swatch";
      spanEl.style.background = item.swatch;
      spanEl.setAttribute("data-dt-color", item.id);
      spanEl.setAttribute("role", "button");
      spanEl.setAttribute("tabindex", "0");
      spanEl.setAttribute("aria-label", item.name + " ship color");
      spanEl.title = item.name + " · local ship appearance";
      spanEl.addEventListener("click", function () {
        choose(item.id);
      });
      divEl2.appendChild(spanEl);
    });
    colorsEl.appendChild(divEl);
    colorsEl.appendChild(divEl2);
    sync();
  }
  const list = [];
  const set = new Set();
  let v270 = false;
  let v271 = false;
  let v272 = null;
  let v273 = false;
  function onPagehide() {
    if (v271) {
      return;
    }
    v271 = true;
    if (v272 != null) {
      try {
        if (v273 && typeof target.cancelIdleCallback === "function") {
          target.cancelIdleCallback(v272);
        } else if (!v273 && typeof target.clearTimeout === "function") {
          target.clearTimeout(v272);
        }
      } catch (err) {}
      v272 = null;
    }
    list.length = 0;
    v270 = false;
    weakMap2 = new WeakMap();
    for (const item of set) {
      try {
        const v278 = typeof item.deref === "function" ? item.deref() : item;
        if (v278) {
          v278.dispose();
        }
      } catch (err) {}
    }
    set.clear();
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("pagehide", onPagehide, {
      once: true
    });
  }
  function fn61() {
    if (v271 || v270 || !list.length) {
      return;
    }
    v270 = true;
    v273 = typeof target.requestIdleCallback === "function";
    if (v273) {
      v272 = target.requestIdleCallback(fn62, {
        timeout: 200
      });
    } else {
      v272 = target.setTimeout(fn62, 16);
    }
  }
  function fn62(arg114) {
    v272 = null;
    if (v271) {
      return;
    }
    v270 = false;
    const now = Date.now();
    let v279 = 0;
    while (list.length && v279 < 8) {
      if (v279 && (Date.now() - now >= 3 || arg114 && arg114.timeRemaining() < 1)) {
        break;
      }
      const point = list[0];
      try {
        if (point.texture.image !== point.source) {
          throw Error("changed");
        }
        if (!point.context) {
          point.canvas = target.document.createElement("canvas");
          point.canvas.width = point.width;
          point.canvas.height = point.height;
          point.context = point.canvas.getContext("2d", {
            willReadFrequently: true
          });
          if (!point.context) {
            throw Error("canvas");
          }
        }
        const x = Math.min(256, point.width - point.x);
        const y = Math.min(32, point.height - point.y);
        point.context.drawImage(point.source, point.x, point.y, x, y, point.x, point.y, x, y);
        const imageData = point.context.getImageData(point.x, point.y, x, y);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const v280 = Math.round(data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
          data[i] = data[i + 1] = data[i + 2] = v280;
        }
        point.context.putImageData(imageData, point.x, point.y);
        point.x += x;
        v279++;
        if (point.x >= point.width) {
          point.x = 0;
          point.y += y;
        }
        if (point.y >= point.height) {
          const v281 = point.texture.clone();
          for (const item of set) {
            if (typeof item.deref === "function" && !item.deref()) {
              set.delete(item);
            }
          }
          set.add(typeof WeakRef === "function" ? new WeakRef(v281) : v281);
          v281.image = point.canvas;
          v281.needsUpdate = true;
          point.cache[point.kind] = v281;
          point.cache[point.kind + "Pending"] = false;
          list.shift();
        }
      } catch (err) {
        point.cache[point.kind + "Failed"] = true;
        point.cache[point.kind + "Pending"] = false;
        list.shift();
        v279++;
      }
    }
    fn61();
  }
  function getTexture(texture) {
    if (v271 || !texture || !texture.image || typeof texture.clone !== "function") {
      return texture;
    }
    const image = texture.image;
    const kind = "gray";
    let cache = weakMap2.get(texture);
    if (!cache || cache.source !== image) {
      cache = {
        source: image
      };
      weakMap2.set(texture, cache);
    }
    if (cache[kind]) {
      return cache[kind];
    }
    if (cache[kind + "Pending"] || cache[kind + "Failed"]) {
      return texture;
    }
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (!Number.isInteger(naturalWidth) || !Number.isInteger(naturalHeight) || naturalWidth < 1 || naturalHeight < 1 || naturalWidth * naturalHeight > 4194304 || image.complete === false) {
      return texture;
    }
    cache[kind + "Pending"] = true;
    list.push({
      texture: texture,
      source: image,
      kind: kind,
      cache: cache,
      width: naturalWidth,
      height: naturalHeight,
      x: 0,
      y: 0,
      context: null
    });
    fn61();
    return texture;
  }
  function fn63(arg115) {
    if (arg115 && typeof arg115.getHex === "function") {
      return arg115.getHex();
    } else {
      return null;
    }
  }
  function fn64(arg116) {
    return Math.max(arg116 >>> 16 & 255, arg116 >>> 8 & 255, arg116 & 255) / 255;
  }
  function fn65(arg117) {
    var v282 = Math.max(0, Math.min(255, Math.round(arg117 * 255)));
    return v282 * 65793;
  }
  function fn66(arg118) {
    var v283 = weakMap.get(arg118);
    if (!v283 || !v283.applied) {
      return;
    }
    var material = v283.material;
    for (const item of v267) {
      material[item] = v283[item];
    }
    for (const item of v268) {
      if (v283[item] != null && material[item]) {
        material[item].setHex(v283[item]);
      }
    }
    if (v283.propulsion != null && arg118.l0I1I && arg118.l0I1I.color) {
      arg118.l0I1I.color.setHex(v283.propulsion);
    }
    v283.applied = false;
  }
  function fn67(arg119) {
    if (!v266 && !v269 || !arg119 || !arg119.material || !arg119.material.color) {
      return;
    }
    var material = arg119.material;
    var v284 = weakMap.get(arg119);
    if (!v284 || v284.material !== material) {
      v284 = {
        material: material,
        hsl: {}
      };
      weakMap.set(arg119, v284);
    }
    for (const item of v267) {
      v284[item] = material[item];
    }
    for (const item of v268) {
      v284[item] = fn63(material[item]);
    }
    v284.propulsion = fn63(arg119.l0I1I && arg119.l0I1I.color);
    v284.applied = true;
    if (v266) {
      material.map = getTexture(v284.map);
      material.emissiveMap = getTexture(v284.emissiveMap);
      material.specularMap = getTexture(v284.specularMap);
      var v285 = arg119.base_color != null && fn64(arg119.base_color) > 0 ? Math.min(1, fn64(v284.color) / fn64(arg119.base_color)) : 1;
      material.color.setHex(fn65(v266.body * v285));
      if (v284.emissive != null) {
        material.emissive.setHex(fn65(fn64(v284.emissive) * v266.glow));
      }
      if (v284.specular != null) {
        material.specular.setHex(fn65(fn64(v284.specular)));
      }
      if (v284.propulsion != null) {
        arg119.l0I1I.color.setHex(fn65(fn64(v284.propulsion) * v266.glow));
      }
    }
    fn60(arg119, v284);
  }
  function fn68(arg120) {
    return arg120 && !arg120.welcome && arg120.ship && arg120.O1Ol1 && arg120.l1O0I && arg120.O1Ol1 === arg120.l1O0I.O1Ol1;
  }
  const weakSet = new WeakSet();
  return {
    dispose: onPagehide,
    animationEnabled: () => v269,
    setAnimated: setAnimated,
    drawPreview: drawPreview,
    current: function () {
      return v266;
    },
    choose: choose,
    mount: mount,
    sync: sync,
    nativeSelected: function () {
      choose(null);
    },
    beforeFrame: function (ship, arg121) {
      try {
        if (fn68(arg121) && ship === arg121.ship) {
          fn66(ship);
        }
      } catch (err) {}
    },
    afterFrame: function (ship, arg122) {
      if (ship && ship.material && weakSet.has(ship.material)) {
        return;
      }
      try {
        if (fn68(arg122) && ship === arg122.ship) {
          fn67(ship);
        }
      } catch (err) {
        if (ship && ship.material) {
          weakSet.add(ship.material);
        }
      }
    },
    preview: function (arg123) {
      try {
        fn66(arg123);
        fn67(arg123);
      } catch (err) {}
    }
  };
}
function createChatEmojis(definitions, arg124) {
  'use strict';

  var v286 = Object.create(null);
  var v287 = Object.create(null);
  definitions.forEach(function (item) {
    if (item.kind !== "native") {
      v286["dt-emote-" + item.id] = item;
    }
  });
  function extend(items) {
    if (!Array.isArray(items) || !items.length) {
      return items;
    }
    if (items.some(function (item) {
      return !item || typeof item.key !== "string" || typeof item.text !== "string" || typeof item.icon !== "string";
    })) {
      return items;
    }
    var list = items.slice();
    var set = new Set(["C", "U", "R"]);
    var set2 = new Set();
    list.forEach(function (item) {
      Array.from(item.key).forEach(function (item2) {
        set.add(item2.toUpperCase());
      });
      set2.add(item.text.trim().toLowerCase());
    });
    definitions.forEach(function (item) {
      if (set2.has(item.name.toLowerCase()) || list.some(function (item2) {
        return item2.icon === "dt-emote-" + item.id;
      })) {
        return;
      }
      if (item.kind === "native" && list.some(function (item2) {
        return item2.icon === item.glyph;
      })) {
        return;
      }
      var found = [item.key, "K", "L", "N", "B", "Y", "2", "3", "4", "5", "6", "7", "8", "9"].find(function (item2) {
        return !set.has(item2);
      });
      if (!found) {
        return;
      }
      set.add(found);
      set2.add(item.name.toLowerCase());
      list.push({
        text: item.name,
        icon: item.kind === "native" ? item.glyph : "dt-emote-" + item.id,
        key: found
      });
    });
    return list;
  }
  function fn69(arg125) {
    return Math.max(4, Math.ceil(arg125.buttons.length / 4));
  }
  function layoutPanel(arg126) {
    if (!arg126 || !arg126.buttons || arg126.buttons.length <= 16) {
      return;
    }
    var v288 = 4 / fn69(arg126);
    arg126.buttons.forEach(function (button, index) {
      button.llOl1 = button.OI0l0 = [(index % 4 + 1) / 5 + 0.01, (Math.floor(index / 4) * 0.25 + 0.01) * v288, 0.18, v288 * 0.23];
    });
    arg126.open_button.llOl1 = arg126.open_button.OI0l0 = [0, 1 - v288 * 0.2, 0.2, v288 * 0.2];
  }
  function panelRect(arg127) {
    if (!arg127 || !arg127.buttons || arg127.buttons.length <= 16) {
      return [0, 0.5, 0.25, 0.4];
    }
    var v289 = Math.min(0.8, fn69(arg127) * 0.1);
    return [0, 0.9 - v289, 0.25, v289];
  }
  function draw(ctx, arg128, x, y, arg129, fillStyle) {
    var v290 = v286[arg128];
    if (!v290) {
      return false;
    }
    if (v290.kind === "blank") {
      return true;
    }
    ctx.save();
    try {
      if (v290.kind === "emoji" || typeof arg124.Path2D !== "function") {
        ctx.font = arg129 + "px \"Segoe UI Emoji\",\"Apple Color Emoji\",\"Noto Color Emoji\",sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = fillStyle;
        ctx.fillText(v290.emoji || v290.fallback, x, y);
        return true;
      }
      if (!v287[arg128]) {
        v287[arg128] = v290.paths.map(function (path) {
          return new arg124.Path2D(path.d);
        });
      }
      ctx.translate(x - arg129 / 2, y - arg129 / 2);
      ctx.scale(arg129 / (v290.viewBox || 24), arg129 / (v290.viewBox || 24));
      v290.paths.forEach(function (path, index) {
        ctx.fillStyle = path.fill || fillStyle;
        ctx.fill(v287[arg128][index], path.rule || "nonzero");
      });
      return true;
    } finally {
      ctx.restore();
    }
  }
  return {
    definitions: definitions,
    extend: extend,
    layoutPanel: layoutPanel,
    panelRect: panelRect,
    draw: draw
  };
}
function createProfileBackgrounds(definitions, config, arg130) {
  'use strict';

  arg130 = arg130 || {};
  var v291 = Object.create(null);
  var v292 = Object.create(null);
  var v293 = Object.create(null);
  var set = new Set();
  var v294 = arg130.preview ? "dt_profile_preview_v1" : "dt_profile_background_v1";
  var v295 = null;
  var persisted = true;
  var prepared = null;
  var echoed = null;
  var draws = 0;
  definitions.forEach(function (item) {
    v291[item.id] = item;
    v292[item.code] = item;
  });
  try {
    var stored = config.localStorage.getItem(v294);
    var parsed;
    try {
      parsed = JSON.parse(stored);
    } catch (err) {
      parsed = stored;
    }
    if (parsed && typeof parsed === "object") {
      parsed = parsed.id;
    }
    v295 = v291[parsed] || null;
  } catch (err) {
    persisted = false;
  }
  function fn70() {
    try {
      if (config.document && typeof config.CustomEvent === "function") {
        config.document.dispatchEvent(new config.CustomEvent("dt-profile-change"));
      }
    } catch (err) {}
  }
  function onload() {
    set.forEach(function (item) {
      item.IOI1I = true;
    });
    fn70();
  }
  function choose(arg131) {
    v295 = v291[arg131] || null;
    prepared = null;
    echoed = null;
    try {
      config.localStorage.setItem(v294, JSON.stringify(v295 ? v295.id : null));
      persisted = true;
    } catch (err) {
      persisted = false;
    }
    onload();
    return v295;
  }
  function fn71(arg132) {
    if (arg132 && arg132.I0Oll && arg132.I0Oll.O1Ol1 && arg132.I0Oll.O1Ol1.status) {
      return arg132.I0Oll.O1Ol1.status.id;
    } else if (arg132 && arg132.O1Ol1 && arg132.O1Ol1.status) {
      return arg132.O1Ol1.status.id;
    } else {
      return null;
    }
  }
  function decode(arg133) {
    if (!arg133 || typeof arg133.finish !== "string") {
      return arg133;
    }
    var match = /^dtp1_(\d{2})_([a-z][a-z0-9_-]{0,23})$/.exec(arg133.finish);
    var v296 = match && v292[match[1]];
    if (!v296) {
      return arg133;
    }
    return Object.assign({}, arg133, {
      finish: match[2],
      _dtProfileV1: v296.id
    });
  }
  const weakMap = new WeakMap();
  function receive(arg134, arg135, arg136) {
    if (!arg134 || typeof arg134 !== "object") {
      return arg134;
    }
    const custom = decode(arg134.custom);
    const v297 = custom && custom._dtProfileV1 || null;
    let v298 = false;
    if (arg135 && typeof arg135 === "object") {
      let v300 = weakMap.get(arg135);
      if (!v300) {
        v300 = new Map();
        weakMap.set(arg135, v300);
      }
      v298 = (v300.get(arg136) || null) !== v297;
      v300.set(arg136, v297);
      if (v300.size > 512) {
        v300.delete(v300.keys().next().value);
      }
    } else {
      v298 = custom !== arg134.custom;
    }
    const v299 = !arg130.preview && arg136 === fn71(arg135) && v295 && v297 === v295.id && echoed !== v297;
    if (v299) {
      echoed = v297;
    }
    if (v298 || v299) {
      onload();
    }
    if (custom === arg134.custom) {
      return arg134;
    } else {
      return Object.assign({}, arg134, {
        custom: custom
      });
    }
  }
  function toWire(arg137) {
    if (arg130.preview || !v295 || !arg137 || typeof arg137 !== "object") {
      return arg137;
    }
    var v301 = decode(arg137);
    var v302 = v301.finish == null ? "alloy" : v301.finish;
    if (typeof v302 !== "string" || !/^[a-z][a-z0-9_-]{0,23}$/.test(v302)) {
      return arg137;
    }
    var v303 = Object.assign({}, arg137, {
      finish: "dtp1_" + v295.code + "_" + v302
    });
    delete v303._dtProfileV1;
    if (prepared !== v295.id) {
      prepared = v295.id;
      fn70();
    }
    return v303;
  }
  function forPlayer(arg138, arg139) {
    if (arg139 === fn71(arg138)) {
      return v295;
    }
    var v304 = arg138 && arg138.names && arg138.names.custom && arg138.names.custom[arg139];
    return v304 && v291[v304._dtProfileV1] || null;
  }
  function fn72(arg140) {
    if (v293[arg140.id]) {
      return v293[arg140.id];
    }
    if (typeof config.Image !== "function") {
      return null;
    }
    var v305 = new config.Image();
    v293[arg140.id] = v305;
    v305.onload = onload;
    v305.onerror = function () {
      v305.dtFailed = true;
      onload();
    };
    v305.src = arg140.image;
    return v305;
  }
  function paintRow(ctx, arg141, arg142, x, y, width, height) {
    if (!arg141 || !arg141.l1O0I || ![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || width > 4096 || height > 2048) {
      return false;
    }
    set.add(arg141);
    if (set.size > 16) {
      set.delete(set.values().next().value);
    }
    var v306 = forPlayer(arg141.l1O0I, arg142);
    if (!v306) {
      return false;
    }
    var v307 = fn72(v306);
    if (!v307 || v307.dtFailed || !v307.complete || !v307.naturalWidth && !v307.width) {
      return false;
    }
    var naturalWidth = v307.naturalWidth || v307.width;
    var naturalHeight = v307.naturalHeight || v307.height;
    var v308 = Math.max(width / naturalWidth, height / naturalHeight);
    var v309 = width / v308;
    var v310 = height / v308;
    ctx.save();
    try {
      const v311 = v306.position ? v306.position[0] : 0.5;
      const v312 = v306.position ? v306.position[1] : 0.5;
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.9;
      ctx.drawImage(v307, (naturalWidth - v309) * v311, (naturalHeight - v310) * v312, v309, v310, x, y, width, height);
      ctx.globalAlpha = 1;
      var gradient = ctx.createLinearGradient(x, y, x + width, y);
      gradient.addColorStop(0, "rgba(2,6,15,.55)");
      gradient.addColorStop(0.6, "rgba(2,6,15,.16)");
      gradient.addColorStop(1, "rgba(2,6,15,.48)");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = v306.accent;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y, Math.max(1, width / 256), height);
      draws++;
      fn73(arg141);
      return true;
    } catch (err) {
      return false;
    } finally {
      ctx.restore();
    }
  }
  const weakMap2 = new WeakMap();
  function beginPanel(arg143) {
    if (!arg143 || typeof arg143.blending !== "number") {
      return;
    }
    let v313 = weakMap2.get(arg143);
    if (!v313) {
      v313 = {
        native: arg143.blending,
        painted: false
      };
      weakMap2.set(arg143, v313);
    }
    v313.painted = false;
  }
  function fn73(arg144) {
    const v314 = weakMap2.get(arg144);
    if (v314) {
      v314.painted = true;
    }
  }
  function endPanel(arg145) {
    const v315 = weakMap2.get(arg145);
    if (!v315) {
      return;
    }
    const v316 = config.THREE ? config.THREE.NormalBlending : 1;
    const blending = v315.painted ? v316 : v315.native;
    arg145.blending = blending;
    if (arg145.material && arg145.material.blending !== blending) {
      arg145.material.blending = blending;
      arg145.material.needsUpdate = true;
    }
  }
  return {
    beginPanel: beginPanel,
    endPanel: endPanel,
    schema: 1,
    definitions: definitions,
    current: function () {
      return v295;
    },
    choose: choose,
    decode: decode,
    receive: receive,
    toWire: toWire,
    forPlayer: forPlayer,
    paintRow: paintRow,
    status: function () {
      return {
        selected: v295 && v295.id,
        prepared: prepared,
        echoed: echoed,
        shareConfirmed: !!v295 && echoed === v295.id,
        persisted: persisted,
        draws: draws,
        preview: !!arg130.preview
      };
    }
  };
}
function createTrailPainter() {
  return function fn74(ctx, arg146, arg147) {
    if (!ctx) {
      return;
    }
    const v317 = arg146 && arg146.id || "native";
    const TAU = Math.PI * 2;
    ctx.save();
    ctx.clearRect(0, 0, arg147, arg147);
    ctx.scale(arg147 / 128, arg147 / 128);
    ctx.translate(64, 64);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    function fn75(x, y, radius, fillStyle, strokeStyle, lineWidth) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth || 3;
        ctx.stroke();
      }
    }
    function fn76(items, fillStyle, strokeStyle, lineWidth) {
      ctx.beginPath();
      items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
      ctx.closePath();
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth || 3;
        ctx.stroke();
      }
    }
    function fn77(items, strokeStyle, lineWidth) {
      ctx.beginPath();
      items.forEach((item, index) => index ? ctx.lineTo(item[0], item[1]) : ctx.moveTo(item[0], item[1]));
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth || 3;
      ctx.stroke();
    }
    function fn78(x, y, radiusX, radiusY, rotation, fillStyle, strokeStyle, lineWidth) {
      ctx.beginPath();
      ctx.ellipse(x, y, radiusX, radiusY, rotation, 0, TAU);
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
      }
      if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth || 3;
        ctx.stroke();
      }
    }
    function getGradient(x0, y0, r1, color, color2) {
      const gradient = ctx.createRadialGradient(x0, y0, 1, x0, y0, r1);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color2);
      return gradient;
    }
    function fn79(arg148, arg149, arg150, fillStyle) {
      const list = [];
      for (let i = 0; i < arg148 * 2; i++) {
        const v318 = i * Math.PI / arg148 - Math.PI / 2;
        const v319 = i % 2 ? arg150 : arg149;
        list.push([Math.cos(v318) * v319, Math.sin(v318) * v319]);
      }
      fn76(list, fillStyle);
    }
    function fn80(fillStyle) {
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.bezierCurveTo(-7, -24, -34, -2, -32, 18);
      ctx.bezierCurveTo(-30, 54, 30, 54, 32, 18);
      ctx.bezierCurveTo(34, -2, 7, -24, 0, -46);
      ctx.fillStyle = fillStyle;
      ctx.fill();
      fn77([[-14, 9], [-18, 20], [-14, 30]], "#e9fcff", 4);
    }
    function fn81(radius, arg151) {
      fn75(0, 0, radius, getGradient(-12, -14, radius * 1.6, "#d3fbff55", "#6acbff0c"), arg151 ? "#e6c1ff" : "#9eeeff", 4);
      ctx.beginPath();
      ctx.arc(0, 0, radius - 6, 3.65, 4.8);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 5;
      ctx.stroke();
      if (arg151) {
        ctx.beginPath();
        ctx.arc(0, 0, radius - 2, 0.2, 1.8);
        ctx.strokeStyle = "#ffb8df";
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      fn75(-17, -19, 5, "#ffffffc9");
    }
    switch (v317) {
      case "bubbles":
        fn81(43, false);
        break;
      case "soap-bubbles":
        fn81(44, true);
        fn75(23, 25, 5, "#a1ffef");
        break;
      case "foam":
        for (const [item, item2, item3] of [[-20, 14, 25], [21, 17, 23], [0, -17, 28], [-30, -16, 16], [29, -18, 15]]) {
          fn75(item, item2, item3, "#e0f8ffee", "#a1dce8", 2);
        }
        fn75(-7, -28, 6, "#fff");
        fn75(18, 8, 5, "#fff");
        break;
      case "water-drops":
        fn80(getGradient(-12, -4, 70, "#caf7ff", "#218bdf"));
        break;
      case "water-splash":
        {
          const list = [];
          for (let i = 0; i < 24; i++) {
            const v320 = i * TAU / 24;
            const v321 = i % 2 ? 22 : 44 + i % 3 * 3;
            list.push([Math.cos(v320) * v321, Math.sin(v320) * v321]);
          }
          fn76(list, "#68d5f5", "#c9f7ff", 3);
          fn75(-8, -8, 13, "#d5fbff8a");
          break;
        }
      case "coffee":
        fn78(35, -3, 13, 20, 0, null, "#f2dcbd", 8);
        fn76([[-36, -22], [30, -22], [24, 28], [12, 38], [-20, 34]], "#f8ecd9", "#d0a474", 3);
        fn78(-3, -23, 33, 11, 0, "#5c301b", "#f4d9b5", 5);
        fn77([[-21, 1], [-18, 22]], "#fff", 4);
        fn78(-4, 40, 46, 7, 0, "#cf9c6c");
        break;
      case "coffee-beans":
        fn78(0, 0, 33, 47, 0.5, "#875331", "#dfa172", 3);
        ctx.beginPath();
        ctx.moveTo(17, -37);
        ctx.bezierCurveTo(-25, -16, 23, 13, -17, 37);
        ctx.strokeStyle = "#3d2318";
        ctx.lineWidth = 6;
        ctx.stroke();
        break;
      case "keyboard-keys":
        fn76([[-40, -35], [28, -42], [45, -25], [38, 42], [-30, 47], [-45, 30]], "#66627f", "#e1dcff", 3);
        fn76([[-40, -35], [28, -42], [27, 24], [-41, 29]], "#e6e1ff");
        fn76([[27, -42], [45, -25], [38, 42], [27, 24]], "#9390b5");
        ctx.fillStyle = "#303044";
        ctx.font = "bold 53px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("W", -7, -3);
        break;
      case "ice-cubes":
        fn76([[0, -47], [44, -25], [43, 24], [0, 47], [-44, 24], [-44, -25]], "#9cdef3", "#e8fcff", 3);
        fn76([[0, -47], [44, -25], [0, -2], [-44, -25]], "#e4faff");
        fn76([[0, -2], [44, -25], [43, 24], [0, 47]], "#5fb3dd");
        fn77([[-30, -13], [-30, 16], [-8, 29]], "#f8ffff", 4);
        fn77([[0, -2], [0, 47]], "#d7f8ff", 2);
        break;
      case "snowflakes":
        for (let i = 0; i < 6; i++) {
          ctx.save();
          ctx.rotate(i * TAU / 6);
          fn77([[0, 0], [0, -46]], "#e0faff", 5);
          fn77([[-13, -28], [0, -17], [13, -28]], "#9ee8ff", 4);
          fn77([[-10, -42], [0, -34], [10, -42]], "#e0faff", 3);
          ctx.restore();
        }
        break;
      case "stardust":
        ctx.fillStyle = getGradient(0, 0, 57, "#ffdd934f", "#ffdd9300");
        ctx.fillRect(-57, -57, 114, 114);
        fn79(5, 43, 19, "#ffe2a0");
        fn75(-9, -12, 5, "#fff5d7");
        break;
      case "hearts":
        ctx.beginPath();
        ctx.moveTo(0, 43);
        ctx.bezierCurveTo(-66, 3, -47, -50, -15, -32);
        ctx.bezierCurveTo(-5, -27, 0, -17, 0, -17);
        ctx.bezierCurveTo(14, -53, 62, -38, 47, 0);
        ctx.bezierCurveTo(40, 20, 14, 36, 0, 43);
        ctx.fillStyle = "#ff85ae";
        ctx.fill();
        fn77([[-29, -18], [-34, -8]], "#ffe3eb", 6);
        break;
      case "diamonds":
        fn76([[0, -48], [36, 0], [0, 48], [-36, 0]], "#7be9fc", "#d9ffff", 3);
        fn76([[0, -48], [0, 48], [-36, 0]], "#c6fbff");
        fn76([[0, -48], [36, 0], [0, 7]], "#87a9ee");
        fn77([[-22, 0], [20, 0]], "#f4ffff", 3);
        break;
      case "neon-rings":
        fn75(0, 0, 44, null, "#7a74e83d", 15);
        fn75(0, 0, 39, null, "#afaaff", 6);
        ctx.beginPath();
        ctx.arc(0, 0, 39, 3.5, 5);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 4;
        ctx.stroke();
        break;
      case "rainbow-orbs":
        {
          const gradient = ctx.createLinearGradient(-35, -40, 38, 40);
          gradient.addColorStop(0, "#9ef8ff");
          gradient.addColorStop(0.45, "#ccb5ff");
          gradient.addColorStop(0.8, "#ffa9ce");
          gradient.addColorStop(1, "#ffe9ad");
          fn75(0, 0, 43, gradient, "#edf6ff", 2);
          fn78(-14, -17, 10, 17, 0.6, "#ffffffb0");
          break;
        }
      case "jellyfish":
        for (let v322 = -2; v322 <= 2; v322++) {
          ctx.beginPath();
          ctx.moveTo(v322 * 14, 8);
          ctx.bezierCurveTo(v322 * 14 - 13, 29, v322 * 14 + 15, 35, v322 * 14 - 4, 52);
          ctx.strokeStyle = v322 % 2 ? "#bba4ff" : "#f3b4ed";
          ctx.lineWidth = 4;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 1, 40, Math.PI, TAU);
        ctx.quadraticCurveTo(36, 24, 0, 15);
        ctx.quadraticCurveTo(-36, 24, -40, 1);
        ctx.fillStyle = "#c7a1ef";
        ctx.fill();
        fn78(-13, -15, 8, 13, 0.8, "#f9e5ffb0");
        fn75(-13, 3, 3, "#554870");
        fn75(13, 3, 3, "#554870");
        break;
      case "leaves":
        ctx.beginPath();
        ctx.moveTo(-35, 40);
        ctx.bezierCurveTo(-57, -29, 1, -48, 42, -39);
        ctx.bezierCurveTo(44, 14, 14, 51, -35, 40);
        ctx.fillStyle = "#94d67e";
        ctx.fill();
        fn77([[-35, 40], [30, -29]], "#3d8958", 4);
        fn77([[-16, 18], [-30, -5]], "#61a461", 3);
        fn77([[1, 0], [25, 6]], "#61a461", 3);
        break;
      case "petals":
        for (let i = 0; i < 5; i++) {
          const v323 = i * TAU / 5;
          fn78(Math.sin(v323) * 22, Math.cos(v323) * 22, 15, 27, -v323, "#f9b0da", "#ffdeee", 2);
        }
        fn75(0, 0, 9, "#ffe3a0");
        break;
      case "lightning":
        fn76([[8, -49], [-33, 7], [-5, 7], [-14, 49], [37, -15], [7, -15]], "#ffe48c", "#fff5c1", 3);
        break;
      case "fireflies":
        fn75(0, 0, 53, getGradient(0, 0, 53, "#e5ff986f", "#d5ff8300"));
        fn78(-12, -8, 13, 20, -0.5, "#dff7d9a0");
        fn78(12, -8, 13, 20, 0.5, "#dff7d9a0");
        fn75(0, 9, 13, "#e8ffad");
        fn75(0, -7, 8, "#a6bc71");
        break;
      case "crystals":
        fn76([[-26, -28], [-10, -44], [3, -21], [4, 39], [-24, 44]], "#c4b4f2", "#f4e5ff", 2);
        fn76([[6, -39], [22, -50], [35, -26], [34, 35], [7, 43]], "#93b3f3", "#d4edff", 2);
        fn77([[22, -42], [22, 33]], "#e4f7ff", 3);
        fn77([[-10, -35], [-9, 33]], "#9e8cd1", 3);
        break;
      case "pixel-blocks":
        for (const [item, item2, item3] of [[-38, -38, "#a1bcff"], [-3, -38, "#b8a1ff"], [-3, -3, "#8ce7d9"], [32, -3, "#ffd794"]]) {
          ctx.fillStyle = item3;
          ctx.fillRect(item, item2, 33, 33);
          fn77([[item + 3, item2 + 28], [item + 3, item2 + 3], [item + 28, item2 + 3]], "#ffffff8a", 3);
        }
        break;
      case "music-notes":
        fn78(-25, 28, 15, 11, -0.4, "#d0b5ff");
        fn78(24, 16, 15, 11, -0.4, "#d0b5ff");
        fn77([[-12, 25], [-12, -31], [37, -43], [37, 13]], "#e4d4ff", 9);
        fn77([[-12, -20], [36, -32]], "#a798f1", 6);
        break;
      case "coins":
        fn75(0, 0, 43, "#c89232", "#ffe7a5", 4);
        fn75(-2, -3, 34, "#ffda74", "#e7ae45", 4);
        ctx.fillStyle = "#bc8530";
        ctx.font = "bold 51px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("$", -2, 0);
        break;
      case "gears":
        {
          ctx.beginPath();
          for (let i = 0; i < 48; i++) {
            const v324 = i * TAU / 48;
            const v325 = i % 4 < 2 ? 46 : 35;
            if (i) {
              ctx.lineTo(Math.cos(v324) * v325, Math.sin(v324) * v325);
            } else {
              ctx.moveTo(Math.cos(v324) * v325, Math.sin(v324) * v325);
            }
          }
          ctx.closePath();
          ctx.moveTo(15, 0);
          ctx.arc(0, 0, 15, 0, TAU, true);
          ctx.fillStyle = "#a8bfd1";
          ctx.fill("evenodd");
          ctx.strokeStyle = "#e2edf4";
          ctx.lineWidth = 2;
          ctx.stroke();
          fn75(0, 0, 22, null, "#6d889d", 5);
          break;
        }
      case "confetti":
        for (const [item, item2, item3, item4] of [[-32, -27, 0.3, "#ff9dbe"], [10, -35, -0.4, "#9fdaff"], [27, 0, 0.6, "#d5afff"], [-18, 8, -0.7, "#ffe18e"], [-6, 36, 0.2, "#a8edc9"]]) {
          ctx.save();
          ctx.translate(item, item2);
          ctx.rotate(item3);
          ctx.fillStyle = item4;
          ctx.fillRect(-7, -12, 14, 24);
          ctx.restore();
        }
        break;
      case "candy":
        fn76([[-24, 0], [-50, -22], [-50, 22]], "#ffbdd9", "#ffe6f1", 2);
        fn76([[24, 0], [50, -22], [50, 22]], "#ffbdd9", "#ffe6f1", 2);
        fn75(0, 0, 32, "#fff4f4", "#f39abf", 3);
        for (let i = 0; i < 5; i++) {
          ctx.save();
          ctx.rotate(i * TAU / 5);
          fn76([[0, 0], [26, -15], [30, 0]], "#ef8fb8");
          ctx.restore();
        }
        break;
      case "donuts":
        for (const [item, item2] of [[45, "#c78d55"], [38, "#f5a0c6"]]) {
          ctx.beginPath();
          ctx.arc(0, 0, item, 0, TAU);
          ctx.moveTo(14, 0);
          ctx.arc(0, 0, 14, 0, TAU, true);
          ctx.fillStyle = item2;
          ctx.fill("evenodd");
        }
        for (const [item, item2, item3] of [[-22, -14, 0.4], [10, -28, 1], [27, 5, -0.4], [-20, 20, 1.1], [10, 25, 0.1]]) {
          ctx.save();
          ctx.translate(item, item2);
          ctx.rotate(item3);
          fn77([[-4, 0], [4, 0]], "#fff2b1", 3);
          ctx.restore();
        }
        break;
      case "comets":
        {
          const gradient = ctx.createLinearGradient(-54, 0, 25, 0);
          gradient.addColorStop(0, "#a4dfff00");
          gradient.addColorStop(1, "#b4ecff");
          fn76([[-55, -22], [24, -20], [39, 4], [21, 23]], gradient);
          fn75(23, 1, 24, "#b6edff", "#e9fbff", 2);
          fn75(19, -5, 9, "#fff");
          break;
        }
      case "mini-planets":
        fn78(0, 0, 53, 17, -0.4, null, "#c4b0f1", 7);
        fn75(0, 0, 32, "#e5bb8e", "#ffdfb3", 2);
        fn77([[-21, -9], [11, -16], [25, -11]], "#ba927a", 5);
        fn77([[-19, 14], [12, 8]], "#f7d6a4", 5);
        ctx.beginPath();
        ctx.ellipse(0, 0, 53, 17, -0.4, 0, Math.PI);
        ctx.strokeStyle = "#d9cbff";
        ctx.lineWidth = 6;
        ctx.stroke();
        break;
      case "ember-sparks":
        ctx.fillStyle = getGradient(0, 0, 58, "#ffb45e66", "#ff703000");
        ctx.fillRect(-58, -58, 116, 116);
        fn76([[-9, -49], [8, -16], [4, 19], [-13, 42], [-23, 13]], "#ffb967", "#ffe5a2", 2);
        fn76([[20, -34], [35, -6], [28, 15], [16, 3]], "#ff815e");
        fn76([[-39, -13], [-24, 7], [-30, 28], [-43, 11]], "#ffd786");
        fn77([[-8, -17], [-10, 15]], "#fff6c9", 4);
        fn75(37, 37, 4, "#ffd790");
        break;
      case "aurora-smoke":
        for (const [item, item2, item3, item4] of [[-24, 11, 28, "#83e9d98c"], [-3, -18, 31, "#94c2ffb0"], [27, 8, 27, "#d7adf59c"], [1, 26, 25, "#a8f3e3a8"]]) {
          fn75(item, item2, item3, getGradient(item - 5, item2 - 8, item3 * 1.5, item4, item4.slice(0, 7) + "00"));
        }
        ctx.beginPath();
        ctx.moveTo(-42, 14);
        ctx.bezierCurveTo(-14, -17, 10, 36, 41, -2);
        ctx.strokeStyle = "#dcfff6b0";
        ctx.lineWidth = 3;
        ctx.stroke();
        break;
      case "ink-clouds":
        for (const [item, item2, item3, item4] of [[-23, 11, 25, "#7762b9"], [-7, -17, 31, "#9b80d2"], [25, -1, 27, "#7f6bc4"], [12, 29, 22, "#b49ae8"]]) {
          fn75(item, item2, item3, item4);
        }
        ctx.beginPath();
        ctx.moveTo(-23, 12);
        ctx.bezierCurveTo(-31, -12, 9, -20, 19, -3);
        ctx.bezierCurveTo(35, 19, -5, 33, -10, 12);
        ctx.bezierCurveTo(-15, -3, 9, -6, 8, 7);
        ctx.strokeStyle = "#e6d5ffb3";
        ctx.lineWidth = 4;
        ctx.stroke();
        break;
      case "paper-planes":
        fn76([[-49, -30], [51, -11], [-13, 46], [-10, 9]], "#cfe7fb", "#f4fcff", 2);
        fn76([[-49, -30], [-10, 9], [51, -11]], "#f4fbff");
        fn76([[-10, 9], [-13, 46], [8, 17], [51, -11]], "#8eb9dc");
        fn77([[-36, -23], [-10, 9], [34, -8]], "#688eaf", 3);
        break;
      case "butterflies":
        fn78(-24, -17, 21, 30, -0.5, "#c6abef", "#eee0ff", 2);
        fn78(24, -17, 21, 30, 0.5, "#92d8f3", "#d9f8ff", 2);
        fn78(-20, 25, 19, 20, 0.5, "#92c7e7", "#d8efff", 2);
        fn78(20, 25, 19, 20, -0.5, "#cf9ee5", "#f5daff", 2);
        fn78(0, 1, 5, 34, 0, "#514b75");
        fn77([[-2, -28], [-14, -43]], "#ece0ff", 2);
        fn77([[2, -28], [14, -43]], "#ece0ff", 2);
        fn75(-29, -24, 5, "#f6eaff");
        fn75(29, -24, 5, "#edfaff");
        break;
      case "feathers":
        ctx.beginPath();
        ctx.moveTo(-31, 43);
        ctx.bezierCurveTo(-58, -7, -17, -51, 33, -46);
        ctx.bezierCurveTo(49, -7, 27, 31, -31, 43);
        ctx.fillStyle = "#cee4f4";
        ctx.fill();
        ctx.strokeStyle = "#f4fcff";
        ctx.lineWidth = 2;
        ctx.stroke();
        fn77([[-42, 53], [24, -37]], "#7a9cb7", 4);
        for (let i = 0; i < 6; i++) {
          const v326 = -29 + i * 12;
          const v327 = 18 - i * 8;
          fn77([[v327 - 22, v326 - 6], [v327, v326 + 3], [v327 + 17, v326 + 5]], i % 2 ? "#98b5ce" : "#f2fbff", 2);
        }
        break;
      case "tiny-rockets":
        ctx.fillStyle = getGradient(0, 34, 34, "#ffca7266", "#ff9b5500");
        ctx.fillRect(-34, 0, 68, 68);
        fn76([[-11, 26], [0, 53], [11, 26]], "#ffc780", "#fff1ae", 2);
        fn76([[-22, 7], [-34, 37], [-12, 24], [12, 24], [34, 37], [22, 7]], "#e99d9f", "#ffe1dc", 2);
        fn76([[0, -50], [21, -17], [17, 24], [-17, 24], [-21, -17]], "#e4edf4", "#fcffff", 2);
        fn76([[0, -50], [21, -17], [-21, -17]], "#ef9996");
        fn75(0, -4, 9, "#86cbe2", "#647d99", 3);
        fn77([[-10, 16], [10, 16]], "#9bb5cc", 3);
        break;
      case "honeycombs":
        for (const [item, item2] of [[-23, -13], [22, -13], [0, 27]]) {
          const list = [];
          for (let i = 0; i < 6; i++) {
            const v328 = i * TAU / 6;
            list.push([item + Math.cos(v328) * 24, item2 + Math.sin(v328) * 24]);
          }
          fn76(list, "#e6b95f8c", "#ffe3a0", 4);
          fn75(item - 6, item2 - 8, 4, "#fff2b6");
        }
        break;
      case "dna-helix":
        for (const [item, item2] of [["#9edff4", 0], ["#e9b1e4", Math.PI]]) {
          ctx.beginPath();
          for (let i = 0; i <= 32; i++) {
            const v329 = -48 + i * 3;
            const v330 = Math.sin(i / 32 * TAU + item2) * 26;
            if (i) {
              ctx.lineTo(v330, v329);
            } else {
              ctx.moveTo(v330, v329);
            }
          }
          ctx.strokeStyle = item;
          ctx.lineWidth = 7;
          ctx.stroke();
        }
        for (let i = 0; i < 9; i++) {
          const v331 = -44 + i * 11;
          const v332 = Math.sin((v331 + 48) / 96 * TAU) * 26;
          fn77([[-v332, v331], [v332, v331]], "#d8c9f4aa", 3);
          fn75(v332, v331, 4, "#c0eeff");
          fn75(-v332, v331, 4, "#ffd0ef");
        }
        break;
      case "arcane-runes":
        fn75(0, 0, 45, null, "#a5b6ef", 3);
        fn75(0, 0, 36, getGradient(0, 0, 53, "#aebeff20", "#aebeff00"));
        fn76([[0, -39], [34, 0], [0, 39], [-34, 0]], null, "#d1d4ff", 2);
        fn77([[0, -28], [0, 28]], "#e9e8ff", 5);
        fn77([[0, -24], [18, -10], [0, 3], [-17, -9]], "#bddbff", 4);
        fn77([[0, 13], [17, 25]], "#bddbff", 4);
        for (let i = 0; i < 8; i++) {
          const v333 = i * TAU / 8;
          fn77([[Math.cos(v333) * 41, Math.sin(v333) * 41], [Math.cos(v333) * 49, Math.sin(v333) * 49]], "#e4dcff", 2);
        }
        break;
      default:
        fn76([[-32, -39], [0, 48], [32, -39]], getGradient(0, -30, 100, "#e6fbff", "#79bfff00"));
        break;
    }
    ctx.restore();
  };
}
function createEngineTrails(definitions, target) {
  const map = new Map(definitions.map(item => [item.id, item]));
  const choices = [{
    id: "native",
    name: "Original engine"
  }, ...definitions];
  const medusa_engine_trail_v1Key = "medusa_engine_trail_v1";
  const trailPainter = createTrailPainter();
  let bubbles = map.get("bubbles") || null;
  let v334 = null;
  let v335 = null;
  let value = null;
  let revision = 0;
  let v336 = null;
  let v337 = null;
  let v338 = 0;
  let v339 = null;
  let v340 = null;
  let v341 = false;
  let v342 = null;
  let v343 = null;
  const weakSet = new WeakSet();
  const limit = 128;
  const map2 = new Map();
  try {
    const stored = target.localStorage.getItem(medusa_engine_trail_v1Key);
    if (stored === "native") {
      bubbles = null;
    } else if (stored && map.has(stored)) {
      bubbles = map.get(stored);
    }
  } catch (err) {}
  function atlas() {
    if (v341) {
      return null;
    }
    if (v335) {
      return v335;
    }
    const canvasEl = target.document.createElement("canvas");
    canvasEl.width = 1024;
    canvasEl.height = Math.pow(2, Math.ceil(Math.log2(Math.ceil(definitions.length / 8)))) * 128;
    const ctx2 = canvasEl.getContext && canvasEl.getContext("2d");
    if (!ctx2) {
      return null;
    }
    const canvasEl2 = target.document.createElement("canvas");
    canvasEl2.width = canvasEl2.height = 128;
    const ctx = canvasEl2.getContext("2d");
    if (!ctx) {
      return null;
    }
    for (const item of definitions) {
      trailPainter(ctx, item, 128);
      ctx2.drawImage(canvasEl2, item.tile % 8 * 128, Math.floor(item.tile / 8) * 128);
    }
    v335 = canvasEl;
    return v335;
  }
  function fn82() {
    v342 = null;
    if (v341 || !bubbles) {
      return;
    }
    try {
      atlas();
    } catch (err) {}
  }
  if (bubbles) {
    if (typeof target.requestIdleCallback === "function") {
      v343 = "idle";
      v342 = target.requestIdleCallback(fn82, {
        timeout: 1200
      });
    } else if (typeof target.setTimeout === "function") {
      v343 = "timer";
      v342 = target.setTimeout(fn82, 0);
    }
  }
  function fn83(arg152) {
    arg152.life.fill(0);
    arg152.alpha.fill(0);
    arg152.cursor = 0;
    arg152.count = 0;
    arg152.carry = 0;
    arg152.points.visible = false;
    arg152.geometry.attributes.aAlpha.needsUpdate = true;
  }
  function fn84(arg153) {
    if (arg153 && arg153.model && arg153.model.OOOlO) {
      arg153.model.OOOlO.visible = arg153.model.I0lOI > 0.01;
    }
  }
  function dispose(scene) {
    if (!v334 || scene && scene !== v334.scene) {
      return;
    }
    fn84(v334);
    v334.scene.I0Oll.remove(v334.points);
    v334.geometry.dispose();
    v334.material.dispose();
    v334 = null;
  }
  function choose(arg154) {
    if (v341 || arg154 !== "native" && !map.has(arg154)) {
      return bubbles;
    }
    bubbles = map.get(arg154) || null;
    revision++;
    if (v334) {
      fn84(v334);
      fn83(v334);
    }
    try {
      target.localStorage.setItem(medusa_engine_trail_v1Key, bubbles ? bubbles.id : "native");
    } catch (err) {}
    fn85();
    refreshPreview();
    return bubbles;
  }
  function step(arg155) {
    const idx = choices.findIndex(item => item.id === (bubbles ? bubbles.id : "native"));
    return choose(choices[(idx + (arg155 < 0 ? -1 : 1) + choices.length) % choices.length].id);
  }
  function fn85() {
    if (!target.document.querySelectorAll) {
      return;
    }
    target.document.querySelectorAll(".dt-trail-row").forEach(item => {
      const dtTrailNameEl = item.querySelector(".dt-trail-name");
      if (dtTrailNameEl) {
        dtTrailNameEl.textContent = bubbles ? bubbles.name : "Original engine";
      }
      item.setAttribute("data-trail-id", bubbles ? bubbles.id : "native");
    });
  }
  function mount() {
    if (v341) {
      return;
    }
    const document = target.document;
    if (!document.querySelectorAll) {
      return;
    }
    document.querySelectorAll(".customtable [data-type=\"laser\"]").forEach(item => {
      const parentNode = item.parentNode;
      if (!parentNode || parentNode.querySelector(".dt-trail-row")) {
        return;
      }
      const divEl = document.createElement("div");
      divEl.className = "dt-trail-row";
      divEl.setAttribute("role", "group");
      divEl.setAttribute("aria-label", "Engine trail");
      const iEl = document.createElement("i");
      const iEl2 = document.createElement("i");
      const divEl2 = document.createElement("div");
      iEl.className = "fa fa-caret-left dt-trail-arrow";
      iEl2.className = "fa fa-caret-right dt-trail-arrow";
      divEl2.className = "title frozenbg dt-trail-name";
      iEl.setAttribute("aria-label", "Previous engine trail");
      iEl2.setAttribute("aria-label", "Next engine trail");
      for (const [item2, item3] of [[iEl, -1], [iEl2, 1]]) {
        item2.setAttribute("role", "button");
        item2.setAttribute("tabindex", "0");
        item2.addEventListener("click", event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          step(item3);
        });
        item2.addEventListener("keydown", event => {
          if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
            event.preventDefault();
            event.stopPropagation();
            step(item3);
          }
        });
      }
      divEl2.setAttribute("role", "status");
      divEl2.setAttribute("aria-live", "polite");
      divEl.append(iEl, document.createTextNode(" "), divEl2, document.createTextNode(" "), iEl2);
      item.insertAdjacentElement("afterend", divEl);
      fn85();
    });
    fn93();
  }
  function fn86(arg156) {
    const list = [];
    const v344 = arg156.data && arg156.data.bodies || {};
    for (const item of Object.keys(v344)) {
      const v345 = v344[item];
      if (!v345.propeller || !v345.position || !v345.offset || !Array.isArray(v345.position.y)) {
        continue;
      }
      let v346 = -1;
      let v347 = -Infinity;
      for (let i = 0; i < v345.position.y.length; i++) {
        if (Number.isFinite(v345.position.y[i]) && v345.position.y[i] > v347) {
          v347 = v345.position.y[i];
          v346 = i;
        }
      }
      if (v346 < 0) {
        continue;
      }
      const width = Math.max(0.03, (v345.width && v345.width[v346] || 1) * 0.01);
      const x = (v347 + (v345.offset.y || 0)) * 0.01 - Math.max(0.015, width * 0.22);
      const y = ((v345.position.x && v345.position.x[v346] || 0) + (v345.offset.x || 0)) * 0.01;
      const v348 = (v345.offset.z || 0) * 0.01;
      list.push({
        x: x,
        y: y,
        z: v348,
        width: width
      });
      if (v345.offset.x) {
        list.push({
          x: x,
          y: -y,
          z: v348,
          width: width
        });
      }
      if (list.length >= 8) {
        break;
      }
    }
    return list.slice(0, 8);
  }
  function fn87() {
    if (v338 && typeof target.cancelAnimationFrame === "function") {
      target.cancelAnimationFrame(v338);
    }
    v338 = 0;
  }
  function fn88() {
    return !!target.__DT_SHIP_COSMETICS && !!target.__DT_SHIP_COSMETICS.companionEnabled();
  }
  function fn89() {
    return !!target.__DT_SHIP_COSMETICS && typeof target.__DT_SHIP_COSMETICS.patternAnimated === "function" && !!target.__DT_SHIP_COSMETICS.patternAnimated();
  }
  function fn90() {
    return !!target.__DT_SHIP_COLORS && typeof target.__DT_SHIP_COLORS.animationEnabled === "function" && !!target.__DT_SHIP_COLORS.animationEnabled();
  }
  function fn91(arg157) {
    return arg157 && arg157.canvas.isConnected !== false && !target.document.hidden && (!arg157.canvas.getClientRects || arg157.canvas.getClientRects().length > 0);
  }
  function fn92(arg158, arg159) {
    if (!arg158) {
      return;
    }
    const ctx = arg158.canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, arg158.canvas.width, arg158.canvas.height);
    if (bubbles) {
      if (!v339 || v340 !== bubbles.id) {
        v339 = target.document.createElement("canvas");
        v339.width = v339.height = 128;
        trailPainter(v339.getContext("2d"), bubbles, 128);
        v340 = bubbles.id;
      }
      const v349 = Math.max(0.4, bubbles.lifetime);
      const v350 = Math.min(24, Math.ceil(bubbles.rate * v349));
      const v351 = v349 * 1000;
      for (let i = 0; i < arg158.nozzles.length; i++) {
        const point = arg158.nozzles[i];
        for (let j = 0; j < v350; j++) {
          const v352 = ((arg159 / v351 + j / v350 + i * 0.19) % 1 + 1) % 1;
          const v353 = arg158.base.width * bubbles.size * 0.43 * (0.2 + Math.min(1, v352 * 5) * 0.8);
          const v354 = v352 * arg158.base.width * 0.3;
          const v355 = point.x + Math.sin(j * 2.4 + i) * arg158.base.width * 0.012 * v352;
          const v356 = point.y + v354;
          ctx.save();
          ctx.globalAlpha = Math.min(1, v352 * 14) * Math.min(1, (1 - v352) * 4) * 0.9;
          ctx.translate(v355, v356);
          ctx.rotate(v352 * (j % 2 ? 1 : -1));
          ctx.drawImage(v339, -v353 / 2, -v353 / 2, v353, v353);
          ctx.restore();
        }
      }
    }
    if (fn88()) {
      target.__DT_SHIP_COSMETICS.drawPreview(ctx, arg158.base, arg159);
    }
    if (target.__DT_SHIP_COLORS && typeof target.__DT_SHIP_COLORS.drawPreview === "function") {
      target.__DT_SHIP_COLORS.drawPreview(ctx, arg158.base, arg159);
    } else {
      ctx.drawImage(arg158.base, 0, 0);
    }
    if (fn89()) {
      target.__DT_SHIP_COSMETICS.drawPatternPreview(ctx, arg158.base, arg159);
    }
  }
  function fn93() {
    if (v341 || v338 || !v336 || !bubbles && !fn90() && !fn88() && !fn89() || typeof target.requestAnimationFrame !== "function") {
      return;
    }
    v338 = target.requestAnimationFrame(function fn95(last) {
      v338 = 0;
      if (!fn91(v336) || !bubbles && !fn90() && !fn88() && !fn89()) {
        return;
      }
      if (!Number.isFinite(v336.last) || last - v336.last >= 1000 / 30) {
        v336.last = last;
        fn92(v336, last);
      }
      fn93();
    });
  }
  function beforeThumbnail(arg160) {
    if (bubbles && arg160 && arg160.OOOlO) {
      arg160.OOOlO.visible = false;
    }
  }
  function decorateThumbnail(base, arg161) {
    fn87();
    v336 = null;
    if (!bubbles && !fn90() && !fn88() && !fn89()) {
      return base;
    }
    const v357 = bubbles ? fn86(arg161) : [];
    const oiii1 = arg161.OIII1;
    const three = target.THREE;
    if (v357.length && three && oiii1) {
      oiii1.updateMatrixWorld(true);
    }
    const nozzles = v357.length && three && oiii1 ? v357.map(item => {
      const point = new three.Vector3(item.x, item.y, item.z).applyMatrix4(oiii1.matrixWorld);
      return {
        x: point.x,
        y: point.y
      };
    }) : [];
    if (!nozzles.length && !fn90() && !fn88() && !fn89()) {
      return base;
    }
    const canvasEl = target.document.createElement("canvas");
    canvasEl.width = base.width;
    canvasEl.height = base.height + (nozzles.length || fn88() ? Math.ceil(base.height * 0.28) : 0);
    canvasEl.className = "dt-trail-preview";
    if (canvasEl.setAttribute) {
      canvasEl.setAttribute("aria-label", (bubbles ? bubbles.name : "Original engine") + " ship preview");
    }
    v336 = {
      canvas: canvasEl,
      base: base,
      nozzles: nozzles,
      last: NaN
    };
    fn92(v336, 350);
    fn93();
    return canvasEl;
  }
  function makeThumbnail(Type, ...args) {
    v337 = {
      Type: Type,
      args: args
    };
    return Type.exportThumbnail(...args, true);
  }
  function refreshPreview() {
    const el = v336 && v336.canvas.parentNode || target.document.querySelector && target.document.querySelector(".shippreview");
    if (!el || !v337) {
      return;
    }
    try {
      const {
        Type: v358,
        args: v359
      } = v337;
      const thumbnail = makeThumbnail(v358, ...v359);
      el.replaceChildren(thumbnail);
    } catch (err) {
      fn93();
    }
  }
  function unregisterRenderer(arg162) {
    const v360 = map2.get(arg162);
    if (v360) {
      v360.geometry.dispose();
      v360.material.dispose();
      map2.delete(arg162);
    }
  }
  function registerRenderer(arg163, config) {
    if (v341 || !bubbles || !arg163 || !config || typeof arg163.compile !== "function" || map2.has(arg163)) {
      return;
    }
    let v361;
    try {
      const v362 = {
        I0Oll: new config.Scene()
      };
      v361 = fn94(v362, config);
      v361.points.visible = true;
      arg163.compile(v362.I0Oll, new config.PerspectiveCamera(60, 1, 1, 3000));
      map2.set(arg163, v361);
      while (map2.size > 2) {
        const value = map2.keys().next().value;
        const v363 = map2.get(value);
        v363.geometry.dispose();
        v363.material.dispose();
        map2.delete(value);
      }
    } catch (err) {
      if (v361) {
        v361.geometry.dispose();
        v361.material.dispose();
      }
    }
  }
  function fn94(scene, config) {
    const v364 = atlas();
    if (!v364) {
      throw Error("Trail canvas unavailable");
    }
    if (!value) {
      value = new config.Texture(v364);
      value.minFilter = value.magFilter = config.LinearFilter;
      value.generateMipmaps = false;
      value.needsUpdate = true;
    }
    const float32Array = new Float32Array(limit * 3);
    const float32Array2 = new Float32Array(limit);
    const float32Array3 = new Float32Array(limit);
    const float32Array4 = new Float32Array(limit);
    const float32Array5 = new Float32Array(limit);
    const geometry = new config.BufferGeometry();
    for (const [item, item2, item3] of [["position", float32Array, 3], ["aAlpha", float32Array2, 1], ["aSize", float32Array3, 1], ["aAngle", float32Array4, 1], ["aTile", float32Array5, 1]]) {
      geometry.addAttribute(item, new config.BufferAttribute(item2, item3).setDynamic(true));
    }
    const material = new config.ShaderMaterial({
      uniforms: {
        uAtlas: {
          value: value
        },
        uViewport: {
          value: 720
        },
        uRows: {
          value: v364.height / 128
        }
      },
      vertexShader: "attribute float aAlpha;attribute float aSize;attribute float aAngle;attribute float aTile;uniform float uViewport;varying float vAlpha;varying float vAngle;varying float vTile;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=aAlpha>0.001?clamp(aSize*uViewport*projectionMatrix[1][1]/max(1.0,-p.z),1.0,48.0):0.0;vAlpha=aAlpha;vAngle=aAngle;vTile=aTile;}",
      fragmentShader: "uniform sampler2D uAtlas;uniform float uRows;varying float vAlpha;varying float vAngle;varying float vTile;void main(){if(vAlpha<0.002)discard;vec2 q=gl_PointCoord-0.5;float c=cos(vAngle),s=sin(vAngle);vec2 uv=mat2(c,-s,s,c)*q+0.5;if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0)discard;vec2 cell=vec2(mod(vTile,8.0),uRows-1.0-floor(vTile/8.0));vec4 color=texture2D(uAtlas,(cell+vec2(uv.x,1.0-uv.y))/vec2(8.0,uRows));gl_FragColor=vec4(color.rgb,color.a*vAlpha);}",
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: config.NormalBlending
    });
    const points = new config.Points(geometry, material);
    points.name = "MedusaEngineTrail";
    points.frustumCulled = false;
    points.visible = false;
    scene.I0Oll.add(points);
    return {
      scene: scene,
      geometry: geometry,
      material: material,
      points: points,
      position: float32Array,
      alpha: float32Array2,
      size: float32Array3,
      angle: float32Array4,
      tile: float32Array5,
      velocity: new Float32Array(limit * 3),
      life: new Float32Array(limit),
      ttl: new Float32Array(limit),
      baseSize: new Float32Array(limit),
      spin: new Float32Array(limit),
      model: null,
      nozzles: [],
      vector: new config.Vector3(),
      emitterMatrix: new config.Matrix4(),
      cursor: 0,
      count: 0,
      carry: 0,
      time: null,
      x: NaN,
      y: NaN,
      emitter: 0,
      revision: revision
    };
  }
  function frame(scene, config) {
    if (v341 || !scene || scene.welcome || !scene.ship || !scene.O1Ol1 || !scene.l1O0I || scene.O1Ol1 !== scene.l1O0I.O1Ol1 || !scene.I0Oll || !config || weakSet.has(scene)) {
      return;
    }
    if (!bubbles) {
      if (v334 && v334.scene === scene) {
        fn84(v334);
        if (v334.count) {
          fn83(v334);
        }
      }
      return;
    }
    try {
      if (v334 && v334.scene !== scene) {
        dispose();
      }
      if (!v334) {
        v334 = fn94(scene, config);
      }
      const point = v334;
      const ship = scene.ship;
      const oiii1 = ship.OIII1;
      const o1Ol1 = scene.O1Ol1;
      if (!oiii1 || !ship.OOOlO) {
        return;
      }
      if (point.model !== ship) {
        fn84(point);
        fn83(point);
        point.model = ship;
        point.nozzles = fn86(ship);
        point.time = null;
      }
      if (!point.nozzles.length) {
        fn84(point);
        return;
      }
      const time = target.performance && typeof target.performance.now === "function" ? target.performance.now() : Date.now();
      let v365 = point.time === null ? 1 / 60 : (time - point.time) / 1000;
      point.time = time;
      const x = oiii1.position.x;
      const y = oiii1.position.y;
      if (v365 > 0.25 || Number.isFinite(point.x) && (x - point.x) * (x - point.x) + (y - point.y) * (y - point.y) > 2500) {
        fn83(point);
      }
      point.x = x;
      point.y = y;
      v365 = Math.max(0, Math.min(0.05, v365));
      if (point.revision !== revision) {
        fn83(point);
        point.revision = revision;
      }
      const v366 = !!o1Ol1.status && !!o1Ol1.status.alive;
      ship.OOOlO.visible = false;
      if (!v366) {
        fn83(point);
        return;
      }
      let v367 = 0;
      for (let i = 0; i < limit; i++) {
        if (point.life[i] <= 0) {
          continue;
        }
        point.life[i] -= v365;
        if (point.life[i] <= 0) {
          point.alpha[i] = 0;
          continue;
        }
        const v370 = i * 3;
        point.position[v370] += point.velocity[v370] * v365;
        point.position[v370 + 1] += point.velocity[v370 + 1] * v365;
        point.position[v370 + 2] += point.velocity[v370 + 2] * v365;
        const v371 = 1 - point.life[i] / point.ttl[i];
        point.alpha[i] = Math.min(1, v371 * 12) * Math.min(1, point.life[i] / 0.3) * 0.92;
        point.size[i] = point.baseSize[i] * (0.2 + Math.min(1, v371 * 5) * 0.8);
        point.angle[i] += point.spin[i] * v365;
        v367++;
      }
      const v368 = o1Ol1.I1IIl && (o1Ol1.I1IIl.up || o1Ol1.status.dash);
      let v369 = false;
      if (v368 && v365 > 0) {
        point.carry += v365 * bubbles.rate;
        const v372 = Math.min(6, Math.floor(point.carry));
        point.carry = Math.min(1, point.carry - v372);
        if (v372 > 0) {
          if (oiii1.matrixAutoUpdate) {
            oiii1.updateMatrix();
          }
          if (oiii1.parent) {
            point.emitterMatrix.multiplyMatrices(oiii1.parent.matrixWorld, oiii1.matrix);
          } else {
            point.emitterMatrix.copy(oiii1.matrix);
          }
          const elements = point.emitterMatrix.elements;
          const v373 = Math.sqrt(elements[0] * elements[0] + elements[1] * elements[1] + elements[2] * elements[2]) || 1;
          const v374 = elements[0] / v373;
          const v375 = elements[1] / v373;
          const v376 = elements[2] / v373;
          v369 = true;
          for (let i = 0; i < v372; i++) {
            const point2 = point.nozzles[point.emitter++ % point.nozzles.length];
            const v377 = point.cursor++ % limit;
            const v378 = v377 * 3;
            const point3 = point.vector.set(point2.x, point2.y, point2.z).applyMatrix4(point.emitterMatrix);
            const v379 = (Math.random() - 0.5) * point2.width * v373;
            point.position[v378] = point3.x - v375 * v379;
            point.position[v378 + 1] = point3.y + v374 * v379;
            point.position[v378 + 2] = point3.z - 0.08;
            const v380 = 3 + Math.random() * 2;
            const v381 = (Math.random() - 0.5) * 2;
            point.velocity[v378] = v374 * v380 - v375 * v381;
            point.velocity[v378 + 1] = v375 * v380 + v374 * v381;
            point.velocity[v378 + 2] = v376 * v380 * 0.2;
            point.life[v377] = point.ttl[v377] = bubbles.lifetime * (0.8 + Math.random() * 0.4);
            point.baseSize[v377] = bubbles.size * (0.7 + Math.random() * 0.5);
            point.size[v377] = point.baseSize[v377] * 0.2;
            point.alpha[v377] = 0.15;
            point.angle[v377] = Math.random() * Math.PI * 2;
            point.spin[v377] = (Math.random() - 0.5) * 2;
            point.tile[v377] = bubbles.tile;
            v367++;
          }
        }
      } else {
        point.carry = 0;
      }
      point.count = Math.min(limit, v367);
      point.points.visible = point.count > 0;
      point.material.uniforms.uViewport.value = scene.l1O0I.display && scene.l1O0I.display.height || 720;
      const attributes = point.geometry.attributes;
      attributes.position.needsUpdate = attributes.aAlpha.needsUpdate = attributes.aSize.needsUpdate = attributes.aAngle.needsUpdate = true;
      if (v369) {
        attributes.aTile.needsUpdate = true;
      }
    } catch (err) {
      dispose(scene);
      weakSet.add(scene);
    }
  }
  function onVisibilitychange() {
    if (v341) {
      return;
    }
    if (target.document.hidden) {
      fn87();
    } else {
      fn93();
    }
  }
  if (target.document && typeof target.document.addEventListener === "function") {
    target.document.addEventListener("visibilitychange", onVisibilitychange);
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("pagehide", () => {
      if (v341) {
        return;
      }
      v341 = true;
      if (v342 !== null) {
        if (v343 === "idle" && typeof target.cancelIdleCallback === "function") {
          target.cancelIdleCallback(v342);
        } else if (v343 === "timer" && typeof target.clearTimeout === "function") {
          target.clearTimeout(v342);
        }
        v342 = null;
      }
      if (target.document && typeof target.document.removeEventListener === "function") {
        target.document.removeEventListener("visibilitychange", onVisibilitychange);
      }
      fn87();
      v336 = null;
      v337 = null;
      v339 = null;
      dispose();
      for (const item of map2.values()) {
        item.geometry.dispose();
        item.material.dispose();
      }
      map2.clear();
      if (value) {
        value.dispose();
        value = null;
      }
      v335 = null;
    }, {
      once: true
    });
  }
  return {
    definitions: definitions,
    choices: choices,
    current: () => bubbles,
    choose: choose,
    step: step,
    mount: mount,
    frame: frame,
    dispose: dispose,
    paint: trailPainter,
    atlas: atlas,
    registerRenderer: registerRenderer,
    unregisterRenderer: unregisterRenderer,
    makeThumbnail: makeThumbnail,
    beforeThumbnail: beforeThumbnail,
    decorateThumbnail: decorateThumbnail,
    refreshPreview: refreshPreview,
    status: () => ({
      active: !!v334,
      count: v334 ? v334.count : 0,
      limit: limit,
      style: bubbles ? bubbles.id : "native"
    })
  };
}
function createMedusaEngine(target, arg164) {
  const map = new Map();
  const map2 = new Map();
  let v382 = true;
  const memory = {
    get(key, arg165) {
      if (map.has(key)) {
        return map.get(key);
      }
      try {
        const stored = target.localStorage.getItem(key);
        if (stored !== null) {
          const parsed = JSON.parse(stored);
          map.set(key, parsed);
          return parsed;
        }
      } catch (err) {
        v382 = false;
      }
      map.set(key, arg165);
      return arg165;
    },
    set(key, arg166) {
      map.set(key, arg166);
      const json = JSON.stringify(arg166);
      if (map2.get(key) === json) {
        return v382;
      }
      try {
        target.localStorage.setItem(key, json);
        map2.set(key, json);
        v382 = true;
      } catch (err) {
        v382 = false;
      }
      return v382;
    },
    raw(key, arg167) {
      try {
        return target.localStorage.getItem(key) || arg167;
      } catch (err) {
        return arg167;
      }
    },
    rawSet(key, value) {
      try {
        if (target.localStorage.getItem(key) !== value) {
          target.localStorage.setItem(key, value);
        }
        return true;
      } catch (err) {
        return false;
      }
    }
  };
  const colors = {};
  const set = new Set();
  const set2 = new Set();
  function refreshColors() {
    [["gemcolor1", "#ff0000"], ["gemcolor2", "#ff8080"], ["bgcolor", "#000819"]].forEach(([item, item2]) => {
      const v384 = memory.get(item, item2);
      colors[item] = /^#[\da-f]{6}$/i.test(v384) ? v384 : item2;
    });
    set.forEach(item => {
      try {
        item.setClearColor(colors.bgcolor, 1);
      } catch (err) {}
    });
  }
  refreshColors();
  const raf = target.requestAnimationFrame.bind(target);
  const caf = target.cancelAnimationFrame.bind(target);
  let v383 = null;
  const weakMap = new WeakMap();
  function acceptNativePointer(arg168, x, y, event) {
    if (!arg168 || !Number.isFinite(x) || !Number.isFinite(y) || event && event.isTrusted === false) {
      return;
    }
    let point = weakMap.get(arg168);
    let v385 = false;
    const v386 = event && (Number.isFinite(event.movementX) || Number.isFinite(event.movementY));
    if (v386) {
      v385 = !!event.movementX || !!event.movementY;
    } else if (point) {
      v385 = x !== point.x || y !== point.y;
    }
    if (point) {
      point.x = x;
      point.y = y;
    } else {
      weakMap.set(arg168, {
        x: x,
        y: y
      });
    }
    if (!v385 || arg168.navigation_listener && arg168.navigation_listener.block_ship_control) {
      return;
    }
    arg168.last_keyboard_action = arg168.last_gamepad_action = 0;
    arg168.left = arg168.right = false;
  }
  function bindScreen(arg169) {
    v383 = arg169;
    return arg169;
  }
  function onBlur() {
    const v387 = v383 && v383.control_listener;
    let v388 = v383;
    let v389 = 0;
    while (v388 && v389++ < 32) {
      v388.mousepressed = false;
      v388.pressed = false;
      const v392 = v388.Ol0I1 && v388.Ol0I1.mouse;
      if (v392) {
        delete v388.Ol0I1.mouse;
      }
      v388 = v392;
    }
    if (!v387) {
      return;
    }
    v387.left = v387.right = v387.O0lll = v387.mousepressed = v387.control_pressed = v387.alt_pressed = false;
    v387.last_keyboard_action = v387.last_gamepad_action = 0;
    const v390 = v387.ship && v387.ship.I1IIl;
    let v391 = false;
    if (v390) {
      for (const item of ["up", "OOIII", "strafe_left", "strafe_right", "release_crystal"]) {
        if (v390[item]) {
          v390[item] = false;
          v391 = true;
        }
      }
    }
    if (v391 && v387.ship && typeof v387.ship.lII00 === "function") {
      try {
        v387.ship.lII00();
      } catch (err) {}
    }
  }
  function setModal(arg170) {
    if (arg170) {
      onBlur();
    }
  }
  if (typeof target.addEventListener === "function") {
    target.addEventListener("blur", onBlur);
  }
  if (target.document && typeof target.document.addEventListener === "function") {
    target.document.addEventListener("visibilitychange", () => {
      if (target.document.hidden) {
        onBlur();
      }
    });
  }
  function gem(arg171) {
    try {
      if (arg171.color) {
        arg171.color.set(colors.gemcolor1);
      }
      if (arg171.specular) {
        arg171.specular.set(colors.gemcolor2);
      }
    } catch (err) {}
  }
  function renderer(arg172, arg173 = true) {
    set.add(arg172);
    if (set.size > 2) {
      set.delete(set.values().next().value);
    }
    try {
      arg172.setClearColor(colors.bgcolor, 1);
      if (arg173 && target.__DT_ENGINE_TRAILS) {
        target.__DT_ENGINE_TRAILS.registerRenderer(arg172, target.THREE);
      }
    } catch (err) {}
    return arg172;
  }
  function hud(arg174) {
    arg174.dtHudForce = {
      type: "f",
      value: memory.get("hud_theme", "default") === "black_force" ? 1 : 0
    };
    set2.add(arg174);
    if (set2.size > 4) {
      set2.delete(set2.values().next().value);
    }
    return arg174;
  }
  function refreshHud() {
    set2.forEach(item => item.dtHudForce.value = memory.get("hud_theme", "default") === "black_force" ? 1 : 0);
  }
  return {
    version: "3.11.0",
    memory: memory,
    colors: colors,
    refreshColors: refreshColors,
    refreshHud: refreshHud,
    gem: gem,
    renderer: renderer,
    forgetRenderer: arg175 => set.delete(arg175),
    hud: hud,
    bindScreen: bindScreen,
    releaseControls: onBlur,
    setModal: setModal,
    acceptNativePointer: acceptNativePointer,
    raf: raf,
    caf: caf,
    compatibility: arg164.compatibility || {}
  };
}
function createLaserVisuals(items, arg176) {
  const map = new Map(items.map(item => [String(item.id), item]));
  let v393 = null;
  let v394 = null;
  function capture(arg177) {
    v393 = arg177;
    let laser;
    try {
      laser = arg176.localStorage.getItem("laser");
    } catch (err) {}
    v394 = map.get(laser) || null;
  }
  capture(null);
  function current() {
    if (v393 && v393.laser != null) {
      return map.get(String(v393.laser)) || null;
    } else {
      return v394;
    }
  }
  return {
    capture: capture,
    current: current,
    toWire(arg178) {
      v393 = arg178;
      if (!arg178 || !map.has(String(arg178.laser))) {
        return arg178;
      }
      return Object.assign({}, arg178, {
        laser: "0"
      });
    },
    resolveType(arg179, arg180) {
      if (!arg179 || !arg180 || arg180.welcome || arg179.type < 0 || arg179.type > 3 || arg179.shipid == null || !arg180.O1Ol1 || !arg180.O1Ol1.status || arg179.shipid !== arg180.O1Ol1.status.id) {
        return null;
      }
      const v395 = current();
      if (v395) {
        return v395.atlasIndex;
      } else {
        return null;
      }
    }
  };
}
function createRadarMarkers(items) {
  const map = new Map(items.map(item => [item.index, item]));
  const set = new Set();
  function draw(ctx, arg181, x, y) {
    const v396 = map.get(arg181);
    if (!v396) {
      return false;
    }
    ctx.save();
    try {
      ctx.translate(x, y);
      ctx.fillStyle = "#fff";
      for (const polygon of v396.polygons) {
        ctx.beginPath();
        polygon.forEach((item, index) => {
          if (index) {
            ctx.lineTo(item[0], item[1]);
          } else {
            ctx.moveTo(item[0], item[1]);
          }
        });
        ctx.closePath();
        ctx.fill();
      }
      set.add(arg181);
      return true;
    } catch (err) {
      return false;
    } finally {
      ctx.restore();
    }
  }
  return {
    schema: 3,
    draw: draw,
    status() {
      return {
        player: set.has(1),
        leader: set.has(3),
        active: set.has(1) && set.has(3)
      };
    }
  };
}
function createBranding(arg182, arg183) {
  const weakSet = new WeakSet();
  const weakMap = new WeakMap();
  const weakSet2 = new WeakSet();
  function refresh() {
    arg183.document.querySelectorAll("#logo,#infologo").forEach(item => {
      if (weakMap.has(item)) {
        const el = weakMap.get(item);
        item.querySelectorAll("img").forEach(item2 => {
          if (item2 !== el) {
            item2.remove();
          }
        });
        if (el.parentNode !== item) {
          item.appendChild(el);
        }
        return;
      }
      if (weakSet.has(item) || weakSet2.has(item)) {
        return;
      }
      weakSet.add(item);
      const imgEl = arg183.document.createElement("img");
      imgEl.alt = arg182.name;
      imgEl.draggable = false;
      imgEl.decoding = "async";
      imgEl.dataset.medusaLogo = "";
      let v397 = false;
      function fn96(arg184) {
        if (v397) {
          return;
        }
        v397 = true;
        arg183.clearTimeout(timer);
        weakSet.delete(item);
        imgEl.onload = imgEl.onerror = null;
        if (!arg184) {
          weakSet2.add(item);
          return;
        }
        if (!item.isConnected) {
          return;
        }
        item.replaceChildren(imgEl);
        weakMap.set(item, imgEl);
      }
      const timer = arg183.setTimeout(() => fn96(false), 8000);
      imgEl.onload = () => fn96(true);
      imgEl.onerror = () => fn96(false);
      imgEl.src = arg182.logo;
      if (typeof imgEl.decode === "function") {
        imgEl.decode().then(() => fn96(true), () => {});
      }
    });
    arg183.document.title = "Meduza client";
    const document = arg183.document;
    if (document.head && typeof document.querySelector === "function") {
      let linkEl = document.querySelector("link[rel~=icon]");
      if (!linkEl) {
        linkEl = document.createElement("link");
        linkEl.rel = "icon";
        document.head.appendChild(linkEl);
      }
      const v398 = "https://i.pinimg.com/736x/7d/67/7a/7d677af0900d87d7c5dd5b16d76acdcc.jpg";
      if (linkEl.getAttribute("href") !== v398) {
        linkEl.type = "image/jpeg";
        linkEl.setAttribute("href", v398);
      }
    }
  }
  return {
    refresh: refresh
  };
}
function createUIRefreshScheduler(target, arg185) {
  'use strict';

  const v399 = "#overlay,.modal,#modals,.modals,.social,#player,#colors,#logo,#infologo,table.customtable,td.ecpverifiedlogo,td.shippreview";
  const v400 = ".social,#player,#colors,#logo,#infologo,.customtable,.ecpverifiedlogo,.shippreview";
  const v401 = ".dt-studio,.dt-badges,.dt-trail-row,.dt-cosmetic-row,.dt-extra-colors,.dt-extra-color-title,.dt-studio-trigger,[data-medusa-logo]";
  const v402 = ".dt-studio,.dt-studio-trigger,.dt-badges,.dt-trail-row,.dt-cosmetic-row,.dt-extra-colors";
  let v403 = null;
  let v404 = false;
  function fn97(el) {
    return el && el.nodeType === 1 && typeof el.closest === "function" && !!el.closest(v401);
  }
  function fn98(el) {
    return el && el.nodeType === 1 && !fn97(el) && typeof el.matches === "function" && (el.matches(v399) || !!el.querySelector(v399));
  }
  function fn99(config) {
    const el = config.target && config.target.nodeType === 1 ? config.target : config.target && config.target.parentElement;
    if (!el) {
      return false;
    }
    if (config.type === "attributes") {
      return el.matches(v399) && !fn97(el);
    }
    const addedNodes = config.addedNodes;
    const removedNodes = config.removedNodes;
    let v406 = false;
    if (addedNodes) {
      for (let i = 0; i < addedNodes.length; i++) {
        if (addedNodes[i].nodeType === 1) {
          v406 = true;
          break;
        }
      }
    }
    if (!v406 && removedNodes) {
      for (let i = 0; i < removedNodes.length; i++) {
        if (removedNodes[i].nodeType === 1) {
          v406 = true;
          break;
        }
      }
    }
    if (!v406 || fn97(el)) {
      return false;
    }
    if (removedNodes) {
      for (let i = 0; i < removedNodes.length; i++) {
        const v408 = removedNodes[i];
        if (v408.nodeType === 1 && v408.matches && v408.matches(v402)) {
          return true;
        }
      }
    }
    const v407 = el.matches(v399) || el.closest(v400);
    if (addedNodes) {
      for (let i = 0; i < addedNodes.length; i++) {
        const v409 = addedNodes[i];
        if (v409.nodeType === 1 && (v407 && !fn97(v409) || fn98(v409))) {
          return true;
        }
      }
    }
    if (removedNodes) {
      for (let i = 0; i < removedNodes.length; i++) {
        const v410 = removedNodes[i];
        if (v410.nodeType === 1 && (v407 && !fn97(v410) || fn98(v410))) {
          return true;
        }
      }
    }
    return false;
  }
  function fn100(items) {
    if (v404 || v403 !== null || !items.some(fn99)) {
      return;
    }
    v403 = target.setTimeout(() => {
      v403 = null;
      if (!v404) {
        arg185();
      }
    }, 80);
  }
  const v405 = new target.MutationObserver(fn100);
  v405.observe(target.document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "hidden", "class"]
  });
  function onPagehide() {
    v404 = true;
    v405.disconnect();
    if (v403 !== null) {
      target.clearTimeout(v403);
      v403 = null;
    }
  }
  target.addEventListener("pagehide", onPagehide, {
    once: true
  });
  return {
    dispose: onPagehide
  };
}
function installMedusaServices(arg186) {
  if (window.__MEDUSA_ENGINE && window.__MEDUSA_ENGINE.version === "3.11.0") {
    return;
  }
  for (const item of ["badge", "cc_badge"]) {
    try {
      const stored = window.localStorage.getItem(item);
      const v411 = item === "cc_badge" ? JSON.parse(stored) : stored;
      if (v411 === "dt-focus-v1" || v411 === "dt-smart-v1" || v411 === "dt-project-v1") {
        window.localStorage.removeItem(item);
      } else if (v411 === "cursed" || v411 === "founderswill") {
        window.localStorage.setItem(item, item === "cc_badge" ? JSON.stringify("dev") : "dev");
      }
    } catch (err) {}
  }
  window.__DT_GRAPHICS = createGraphicsLifecycle(window);
  window.__MEDUSA_ENGINE = createMedusaEngine(window, arg186);
  window.__DT_BADGE_IMAGES = Object.create(null);
  window.__DT_BADGE_PRECOMPOSED = Object.create(null);
  for (const badge of arg186.badges) {
    if (badge.scope === "client") {
      window.__DT_BADGE_IMAGES[badge.id] = badge.icon;
      if (badge.displayPrecomposed === 112) {
        window.__DT_BADGE_PRECOMPOSED[badge.id] = 112;
      }
    }
  }
  window.__DT_MENU_ATMOSPHERE = createMenuAtmosphere(window, arg186);
  window.__DT_SPACE_EFFECTS = createSpaceEffects(window, arg186);
  window.__DT_SHIP_COSMETICS = createShipCosmetics(window, arg186);
  window.__DT_WORLD_SHAPES = createWorldShapes();
  window.__DT_RADAR_MARKERS = createRadarMarkers(arg186.radarMarkers);
  window.__DT_LASER_VISUALS = createLaserVisuals(arg186.laserStyles, window);
  window.__DT_LASER_COLORS = createLaserColors();
  window.__DT_SHIP_COLORS = createShipColors(arg186.shipColors, window);
  window.__DT_CHAT_EMOJIS = createChatEmojis(arg186.chatEmojis, window);
  window.__DT_PROFILES = createProfileBackgrounds(arg186.profileBackgrounds, window);
  window.__DT_BRANDING = createBranding(arg186.branding, window);
  window.__DT_ENGINE_TRAILS = createEngineTrails(arg186.engineTrails, window);
}
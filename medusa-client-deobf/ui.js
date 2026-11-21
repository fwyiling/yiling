function mountMedusaUI(config) {
  'use strict';

  if (window.DT_UI && window.DT_UI.version === "3.11.0") {
    return;
  }
  var medusaEngine = window.__MEDUSA_ENGINE;
  var themes = config.themes || [];
  var badges = config.badges || [];
  var len = badges.filter(function (badge) {
    return badge.scope === "client";
  }).length;
  var laserStyles = config.laserStyles || [];
  var shipColors = config.shipColors || [];
  var chatEmojis = config.chatEmojis || [];
  var profileBackgrounds = config.profileBackgrounds || [];
  var set = new Set();
  var groups = config.groups || [];
  var v1 = Object.create(null);
  var v2 = true;
  var root = document.documentElement;
  var dtBranding = window.__DT_BRANDING;
  var divEl6;
  var divEl7;
  var el;
  var spanEl8;
  var activeElement;
  var set2 = new Set();
  var divEl8;
  var divEl9;
  var divEl10;
  var el2;
  var el3;
  var el4;
  var pEl4;
  var v3 = {
    theme: config.defaultTheme || "solar-forge",
    density: "comfortable",
    effects: true
  };
  var v4 = Object.create(null);
  badges.forEach(function (badge) {
    v4[badge.id] = badge;
  });
  function get(arg1, arg2) {
    return medusaEngine.memory.get(arg1, arg2);
  }
  function set3(arg3, arg4) {
    var v11 = medusaEngine.memory.set(arg3, arg4);
    if (arg3 === "hud_theme") {
      medusaEngine.refreshHud();
    }
    if (/^gemcolor[12]$|^bgcolor$/.test(arg3)) {
      medusaEngine.refreshColors();
    }
    if (spanEl8) {
      spanEl8.textContent = v11 ? "Saved on this device" : "Applied for this session";
    }
    return v11;
  }
  var v5 = {
    get: get,
    set: set3
  };
  var v6 = get("hud_theme", "default");
  function log(arg5) {
    console.log("[Medusa Client] " + arg5);
  }
  function warn(arg6) {
    console.warn("[Medusa Client] " + arg6);
  }
  function createEl(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }
  function createButton(className, text, handler) {
    var buttonEl = createEl("button", className, text);
    buttonEl.type = "button";
    if (handler) {
      buttonEl.addEventListener("click", handler);
    }
    return buttonEl;
  }
  function createSvg(arg7) {
    var v12 = {
      spark: "M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3Z",
      close: "m6 6 12 12M18 6 6 18",
      palette: "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.8 1.6 1.6 0 0 1 1-2.9h2a4 4 0 0 0 4-4C21 6 17 3 12 3ZM7 10h.01M9 6.5h.01M14 6h.01M17.5 9h.01",
      skull: "M7 17v3h3v-3h4v3h3v-3c2-1 3-3 3-6a8 8 0 0 0-16 0c0 3 1 5 3 6ZM7 11h2v2H7ZM15 11h2v2h-2ZM11 15l1-2 1 2Z",
      external: "M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
      play: "m9 5 11 7-11 7Z",
      chat: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8Z"
    };
    var svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "dt-icon");
    svgEl.setAttribute("viewBox", "0 0 24 24");
    svgEl.setAttribute("aria-hidden", "true");
    var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", v12[arg7] || v12.spark);
    svgEl.appendChild(pathEl);
    return svgEl;
  }
  function findTheme(id) {
    return themes.find(function (theme) {
      return theme.id === id;
    }) || themes[0];
  }
  function fn1(arg8) {
    var theme = findTheme(v3.theme);
    if (!theme) {
      return;
    }
    v3.theme = theme.id;
    root.setAttribute("data-dt-ui", theme.id);
    root.setAttribute("data-dt-ui-version", "3.11.0");
    root.setAttribute("data-dt-density", v3.density);
    root.setAttribute("data-dt-effects", v3.effects ? "on" : "off");
    root.setAttribute("data-dt-finish", theme.finish);
    root.setAttribute("data-dt-scenic", theme.scene ? "on" : "off");
    ["accent", "accent2", "bg", "surface", "raised", "line", "muted"].forEach(function (item) {
      root.style.setProperty("--dt-" + item, theme[item]);
    });
    root.style.setProperty("--dt-scene", theme.scene || "radial-gradient(ellipse at 85% 0%," + theme.raised + ",transparent 65%),linear-gradient(145deg," + theme.surface + "," + theme.bg + ")");
    root.style.setProperty("--dt-control", theme.control || "linear-gradient(165deg," + theme.raised + "," + theme.surface + ")");
    root.style.setProperty("--dt-primary", theme.primary || "linear-gradient(165deg," + theme.accent + "," + theme.accent2 + ")");
    root.style.setProperty("--dt-panel", theme.panel || "linear-gradient(150deg," + theme.raised + "," + theme.surface + " 40%," + theme.bg + ")");
    root.style.setProperty("--dt-rim", theme.rim || "linear-gradient(135deg," + theme.accent + "88," + theme.line + ")");
    root.style.setProperty("--dt-detail", theme.detail || "linear-gradient(transparent,transparent)");
    root.style.setProperty("--dt-shadow", theme.shadow || "inset 0 1px 0 #ffffff12,0 7px 20px #00000042");
    root.style.setProperty("--dt-heading-font", theme.headingFont === "serif" ? "Georgia,\"Times New Roman\",serif" : "var(--dt-font)");
    root.style.setProperty("--dt-radius", theme.radius + "px");
    var geometry = theme.geometry || {};
    var v13 = {
      "control-radius": theme.radius + "px",
      "primary-radius": theme.radius + "px",
      "entry-radius": theme.radius + "px",
      "panel-radius": theme.radius + 6 + "px",
      "icon-radius": "50%",
      "field-radius": theme.radius + "px",
      "control-cut": "none",
      "primary-cut": "none",
      edge: "inset 0 1px 0 #ffffff18",
      "button-tracking": ".02em",
      "button-weight": "700",
      "control-border": "1px",
      "border-style": "solid",
      "control-border-color": "transparent",
      "switch-radius": "20px"
    };
    Object.keys(v13).forEach(function (item) {
      root.style.setProperty("--dt-" + item, geometry[item] || v13[item]);
    });
    root.style.setProperty("--dt-shadow", (geometry.edge || v13.edge) + "," + (theme.shadow || "0 7px 20px #00000042"));
    root.style.setProperty("--dt-font", theme.font === "mono" ? "\"Cascadia Code\",Consolas,monospace" : "Inter,\"Segoe UI\",Arial,sans-serif");
    var list = theme.accent.match(/[a-f\d]{2}/gi).map(function (item) {
      return parseInt(item, 16);
    });
    root.style.setProperty("--dt-rgb", list.join(","));
    var arr = list.map(function (item) {
      return item / 255;
    });
    var v14 = Math.max.apply(null, arr);
    var v15 = Math.min.apply(null, arr);
    var v16 = v14 - v15;
    var v17 = 0;
    var v18 = (v14 + v15) / 2;
    var v19 = v16 === 0 ? 0 : v16 / (1 - Math.abs(v18 * 2 - 1));
    if (v16) {
      if (v14 === arr[0]) {
        v17 = ((arr[1] - arr[2]) / v16 + 6) % 6;
      } else if (v14 === arr[1]) {
        v17 = (arr[2] - arr[0]) / v16 + 2;
      } else {
        v17 = (arr[0] - arr[1]) / v16 + 4;
      }
      v17 *= 60;
    }
    root.style.setProperty("--dt-hue", String(Math.round(v17 * 100) / 100));
    root.style.setProperty("--dt-saturation", String(Math.round(v19 * 10000) / 100) + "%");
    var ornament = theme.ornament || {};
    var chassis = theme.chassis || {};
    var v20 = {
      sceneArt: "scene-art",
      panelArt: "panel-art",
      thumbnailArt: "thumbnail-art",
      sigil: "sigil",
      controlFace: "control-face",
      primaryFace: "primary-face"
    };
    Object.keys(v20).forEach(function (item) {
      root.style.setProperty("--dt-" + v20[item], ornament[item] ? "url(\"" + ornament[item] + "\")" : "none");
    });
    var v21 = {
      shadow: "shadow",
      primaryShadow: "primary-shadow",
      hoverShadow: "hover-shadow",
      primaryHoverShadow: "primary-hover-shadow",
      pressedShadow: "pressed-shadow",
      panelShadow: "panel-shadow",
      lift: "lift",
      press: "press",
      duration: "feedback-time"
    };
    Object.keys(v21).forEach(function (item) {
      if (chassis[item]) {
        root.style.setProperty("--dt-" + v21[item], chassis[item]);
      }
    });
    if (chassis.controlGlaze) {
      root.style.setProperty("--dt-control", chassis.controlGlaze + "," + theme.control);
    }
    if (chassis.primaryGlaze) {
      root.style.setProperty("--dt-primary", chassis.primaryGlaze + "," + theme.primary);
    }
    document.querySelectorAll(".dt-preset[data-theme]").forEach(function (item) {
      item.setAttribute("aria-pressed", String(item.dataset.theme === theme.id));
    });
    document.querySelectorAll("[data-dt-theme-name]").forEach(function (item) {
      item.textContent = theme.name;
    });
    if (arg8) {
      set3("dt_ui_preferences_v1", v3);
    }
    document.dispatchEvent(new CustomEvent("dt-theme-change", {
      detail: {
        theme: theme.id,
        name: theme.name
      }
    }));
  }
  function setTheme(id) {
    v3.theme = findTheme(id).id;
    fn1(true);
  }
  function formatNickname(arg9) {
    return String(arg9 == null ? "" : arg9).slice(0, 16);
  }
  function fn2() {
    try {
      if (dtBranding) {
        dtBranding.refresh();
      }
    } catch (err) {
      warn("Logo decoration skipped: " + err.message);
    }
    if (!config.preview && document.title !== "Meduza client") {
      document.title = "Meduza client";
    }
  }
  var weakSet = new WeakSet();
  var weakSet2 = new WeakSet();
  function fn3(el5, arg10) {
    var value = el5.value;
    var value2 = formatNickname(value);
    if (value !== value2) {
      var selectionStart = el5.selectionStart;
      var selectionEnd = el5.selectionEnd;
      el5.value = value2;
      if (typeof selectionStart === "number" && typeof el5.setSelectionRange === "function") {
        try {
          el5.setSelectionRange(Math.min(selectionStart, value2.length), Math.min(selectionEnd, value2.length));
        } catch (err) {}
      }
    }
    if (arg10 && el5.closest("#player")) {
      try {
        if (localStorage.getItem("lastNickname") !== value2) {
          localStorage.setItem("lastNickname", value2);
        }
      } catch (err) {}
    }
  }
  function fn4() {
    document.querySelectorAll("#player input[type=\"text\"],input[data-dt-nickname]").forEach(function (item) {
      if (!weakSet.has(item)) {
        weakSet.add(item);
        item.setAttribute("autocapitalize", "off");
        item.setAttribute("autocorrect", "off");
        item.setAttribute("spellcheck", "false");
        item.addEventListener("input", function (event) {
          if (!event.isComposing) {
            fn3(item, true);
          }
        }, true);
        item.addEventListener("compositionstart", function () {
          weakSet2.add(item);
        });
        item.addEventListener("compositionend", function () {
          weakSet2.delete(item);
          fn3(item, true);
        });
        item.addEventListener("change", function () {
          fn3(item, true);
        });
        if (!item.value && item.closest("#player")) {
          try {
            var lastNickname = localStorage.getItem("lastNickname");
            if (lastNickname) {
              item.value = lastNickname;
            }
          } catch (err) {}
        }
      }
      if (!weakSet2.has(item)) {
        fn3(item, !!item.value);
      }
    });
  }
  function fn5() {
    var el5 = config.preview ? document.querySelector("[data-dt-preview-dock]") : document.querySelector("#overlay .social,.social");
    if (!el5 || !el) {
      return;
    }
    var sbgGearsEl = el5.querySelector(".sbg-gears,[data-dt-preview-settings]");
    if (el.parentElement !== el5 || sbgGearsEl && el.previousElementSibling !== sbgGearsEl) {
      if (sbgGearsEl) {
        sbgGearsEl.after(el);
      } else {
        el5.appendChild(el);
      }
    }
    el.hidden = false;
    el.classList.remove("medusa-floating");
  }
  function renderThemes(el5) {
    el5.replaceChildren();
    el5.classList.add("dt-preset-grid");
    themes.forEach(function (theme) {
      var button = createButton("dt-preset", undefined, function () {
        setTheme(theme.id);
      });
      button.dataset.theme = theme.id;
      button.setAttribute("aria-pressed", String(theme.id === v3.theme));
      button.setAttribute("aria-label", theme.name + " — " + theme.note);
      ["accent", "bg", "surface", "raised", "line", "muted"].forEach(function (item) {
        button.style.setProperty("--tile-" + item, theme[item]);
      });
      button.style.setProperty("--tile-scene", theme.scene || "linear-gradient(135deg," + theme.raised + "," + theme.bg + ")");
      button.style.setProperty("--tile-primary", theme.primary || "linear-gradient(165deg," + theme.accent + "," + theme.accent2 + ")");
      button.style.setProperty("--tile-control", theme.control || "linear-gradient(165deg," + theme.raised + "," + theme.surface + ")");
      button.style.setProperty("--tile-rim", theme.rim || "linear-gradient(135deg," + theme.accent + "," + theme.line + ")");
      button.style.setProperty("--tile-detail", theme.detail || "linear-gradient(transparent,transparent)");
      button.style.setProperty("--tile-radius", Math.min(theme.radius, 7) + "px");
      if (theme.ornament) {
        var v22 = {
          sceneArt: "scene-art",
          panelArt: "panel-art",
          thumbnailArt: "thumbnail-art",
          sigil: "sigil",
          controlFace: "control-face",
          primaryFace: "primary-face"
        };
        Object.keys(v22).forEach(function (item) {
          button.style.setProperty("--tile-" + v22[item], "url(\"" + theme.ornament[item] + "\")");
        });
      }
      var geometry = theme.geometry || {};
      ["control-radius", "primary-radius", "panel-radius", "icon-radius", "control-cut", "primary-cut", "edge", "border-style", "control-border"].forEach(function (item) {
        button.style.setProperty("--tile-" + item, geometry[item] || (item.indexOf("cut") >= 0 ? "none" : item === "edge" ? "inset 0 1px 0 #ffffff18" : item === "border-style" ? "solid" : item === "control-border" ? "1px" : theme.radius + "px"));
      });
      if (theme.collection) {
        button.dataset.newTheme = "true";
        button.appendChild(createEl("span", "dt-preset-new", "NEW"));
      }
      var spanEl = createEl("span", "dt-preset-mini");
      spanEl.setAttribute("aria-hidden", "true");
      spanEl.append(createEl("i", "", "PLAY"), createEl("i", "", "Menu"), createEl("i", "", "›"));
      var spanEl2 = createEl("span", "dt-preset-caption");
      spanEl2.append(createEl("strong", "", theme.name), createEl("small", "", (geometry.name ? geometry.name + " · " : "") + theme.note));
      var spanEl3 = createEl("span", "dt-preset-check", "✓");
      spanEl3.setAttribute("aria-hidden", "true");
      button.append(spanEl, spanEl2, spanEl3);
      el5.appendChild(button);
    });
  }
  function renderLaserPreview(el5) {
    if (!el5 || !config.preview) {
      return;
    }
    el5.replaceChildren();
    var divEl = createEl("div", "dt-laser-grid");
    var pEl = createEl("p", "dt-laser-caption");
    pEl.setAttribute("role", "status");
    laserStyles.forEach(function (laserStyle, index) {
      var button = createButton("dt-laser-card", undefined, function () {
        divEl.querySelectorAll("button").forEach(function (item) {
          item.setAttribute("aria-pressed", String(item.dataset.laser === laserStyle.id));
        });
        pEl.textContent = laserStyle.name + " · Visual preview. Select this in ECP → Laser after installation.";
      });
      button.dataset.laser = laserStyle.id;
      button.setAttribute("aria-label", laserStyle.name + " laser preview");
      button.setAttribute("aria-pressed", String(index === 0));
      var svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("class", "dt-laser-symbol");
      svgEl.setAttribute("viewBox", "-1.6 -1.6 3.2 3.2");
      svgEl.setAttribute("aria-hidden", "true");
      laserStyle.polygons.forEach(function (polygon) {
        var polygonEl = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        polygonEl.setAttribute("points", polygon.map(function (item) {
          return item[1] + "," + -item[0];
        }).join(" "));
        svgEl.appendChild(polygonEl);
      });
      button.append(svgEl, createEl("strong", "", laserStyle.name));
      divEl.appendChild(button);
    });
    pEl.textContent = laserStyles.length + " local laser shapes · select one to inspect its shape.";
    el5.append(divEl, pEl);
  }
  function fn6(arg11) {
    return "linear-gradient(135deg,hsl(" + arg11 + ",70%,60%) 0%,hsl(" + arg11 + ",70%,40%) 100%)";
  }
  function renderEmojiPreview(el5) {
    if (!el5 || !config.preview) {
      return;
    }
    el5.replaceChildren();
    var divEl = createEl("div", "dt-emoji-preview-grid");
    var pEl = createEl("p", "dt-laser-caption");
    pEl.setAttribute("role", "status");
    chatEmojis.forEach(function (chatEmoji, index) {
      var button = createButton("dt-emoji-card", undefined, function () {
        divEl.querySelectorAll("button").forEach(function (item) {
          item.setAttribute("aria-pressed", String(item.dataset.emoji === chatEmoji.id));
        });
        pEl.textContent = chatEmoji.name + " · Preview. Open TALK (C) after installation. Shortcuts adapt to the game mode.";
      });
      button.dataset.emoji = chatEmoji.id;
      button.setAttribute("aria-label", chatEmoji.name + " emoji preview");
      button.setAttribute("aria-pressed", String(index === 0));
      if (chatEmoji.kind === "emoji") {
        button.appendChild(createEl("span", "dt-emoji-unicode", chatEmoji.emoji));
      } else {
        var svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgEl.setAttribute("class", "dt-emoji-vector");
        svgEl.setAttribute("viewBox", "0 0 " + (chatEmoji.viewBox || 24) + " " + (chatEmoji.viewBox || 24));
        svgEl.setAttribute("aria-hidden", "true");
        (chatEmoji.paths || []).forEach(function (item) {
          var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
          pathEl.setAttribute("d", item.d);
          pathEl.setAttribute("fill", item.fill || "currentColor");
          pathEl.setAttribute("fill-rule", item.rule || "nonzero");
          svgEl.appendChild(pathEl);
        });
        button.appendChild(svgEl);
      }
      button.append(createEl("strong", "", chatEmoji.name), createEl("kbd", "", chatEmoji.key));
      divEl.appendChild(button);
    });
    pEl.textContent = chatEmojis.map(function (chatEmoji) {
      return chatEmoji.name;
    }).join(" · ") + ". Open TALK (C) in the game. Custom artwork needs this client.";
    el5.append(divEl, pEl);
  }
  function renderRadarPreview(el5) {
    if (!el5 || !config.preview) {
      return;
    }
    el5.replaceChildren();
    var v23 = "http://www.w3.org/2000/svg";
    var svgEl = document.createElementNS(v23, "svg");
    svgEl.setAttribute("viewBox", "0 0 220 220");
    svgEl.setAttribute("class", "preview-radar-map");
    svgEl.setAttribute("role", "img");
    svgEl.setAttribute("aria-label", "Sample minimap with person silhouettes and a gold leader crown");
    function getElementNS(arg12, arg13) {
      var elementNS = document.createElementNS(v23, arg12);
      Object.keys(arg13).forEach(function (item) {
        elementNS.setAttribute(item, String(arg13[item]));
      });
      return elementNS;
    }
    svgEl.appendChild(getElementNS("rect", {
      x: 1,
      y: 1,
      width: 218,
      height: 218,
      rx: 12,
      fill: "#08121c",
      stroke: "#28404f"
    }));
    for (var i = 1; i < 11; i++) {
      svgEl.appendChild(getElementNS("path", {
        d: "M" + i * 20 + " 8V212M8 " + i * 20 + "H212",
        fill: "none",
        stroke: "#17303e",
        "stroke-width": 0.7
      }));
    }
    [[25, 30, 6], [76, 130, 8], [145, 174, 10], [193, 106, 6], [110, 190, 5], [87, 25, 4]].forEach(function (item) {
      svgEl.appendChild(getElementNS("circle", {
        cx: item[0],
        cy: item[1],
        r: item[2],
        fill: "#71434a",
        opacity: 0.7
      }));
    });
    var radarMarkers = config.radarMarkers || [];
    function fn19(id, arg14, arg15, arg16, fill) {
      var found = radarMarkers.find(function (radarMarker) {
        return radarMarker.id === id;
      });
      if (!found) {
        return;
      }
      var elementNS = getElementNS("g", {
        "data-radar-marker": id,
        transform: "translate(" + arg14 + " " + arg15 + ") scale(" + arg16 + ")",
        fill: fill
      });
      found.polygons.forEach(function (polygon) {
        elementNS.appendChild(getElementNS("polygon", {
          points: polygon.map(function (item) {
            return item.join(",");
          }).join(" ")
        }));
      });
      svgEl.appendChild(elementNS);
    }
    [[48, 57], [98, 76], [49, 159], [174, 150]].forEach(function (item) {
      fn19("player", item[0], item[1], 0.65, "#a4bbc6");
    });
    fn19("leader", 166, 56, 0.9, "#ffd24d");
    svgEl.appendChild(getElementNS("circle", {
      cx: 110,
      cy: 110,
      r: 8,
      fill: "none",
      stroke: "#f4f9fb",
      "stroke-width": 1.5
    }));
    svgEl.appendChild(getElementNS("path", {
      d: "M110 97v8m0 10v8m-13-13h8m10 0h8",
      stroke: "#f4f9fb",
      "stroke-width": 1.5
    }));
    var divEl = createEl("div", "preview-radar-legend");
    divEl.append(createEl("strong", "", "Players · person icons"), createEl("strong", "", "Leader · gold crown"), createEl("p", "dt-laser-caption", "Sample minimap. Installed client uses the game’s existing radar positions and colors."));
    el5.append(svgEl, divEl);
  }
  function onDtProfileChange() {
    if (!divEl7 || divEl7.hidden || divEl10.hidden) {
      return;
    }
    set.forEach(function (item) {
      item();
    });
  }
  function renderProfileEditor(el5) {
    var dtProfiles = window.__DT_PROFILES;
    if (!el5 || !dtProfiles || !profileBackgrounds.length) {
      return;
    }
    el5.replaceChildren();
    el5.classList.add("dt-profile-editor");
    var sectionEl = createEl("section", "dt-profile-sample");
    var divEl = createEl("div", "dt-profile-sample-head");
    divEl.append(createEl("span", "dt-eyebrow", "Your leaderboard profile"), createEl("span", "dt-count", "PREVIEW"));
    var divEl2 = createEl("div", "dt-profile-preview-row");
    var spanEl = createEl("span", "dt-profile-rank", "19.");
    var spanEl2 = createEl("span", "dt-profile-mark");
    var strongEl = createEl("strong", "dt-profile-pilot");
    var spanEl3 = createEl("span", "dt-profile-score", "0");
    divEl2.append(spanEl2, spanEl, strongEl, spanEl3);
    var divEl3 = createEl("div", "dt-profile-view");
    var v24 = false;
    var button = createButton("dt-theme-filter-button", "Our client", function () {
      v24 = false;
      fn20(true);
    });
    var button2 = createButton("dt-theme-filter-button", "Standard client", function () {
      v24 = true;
      fn20(true);
    });
    divEl3.setAttribute("role", "group");
    divEl3.setAttribute("aria-label", "Profile appearance preview");
    divEl3.append(button, button2);
    var pEl = createEl("p", "dt-profile-summary");
    var pEl2 = createEl("p", "dt-profile-share");
    pEl2.setAttribute("role", "status");
    sectionEl.append(divEl, divEl2, divEl3, pEl, pEl2);
    var divEl4 = createEl("div", "dt-profile-controls");
    var inputEl = createEl("input", "dt-profile-search");
    inputEl.type = "search";
    inputEl.placeholder = "Find a background…";
    inputEl.setAttribute("aria-label", "Find a profile background");
    var button3 = createButton("dt-button", "No background", function () {
      dtProfiles.choose(null);
      onDtProfileChange();
    });
    button3.setAttribute("aria-label", "Use the standard profile without a background");
    divEl4.append(inputEl, button3);
    var divEl5 = createEl("div", "dt-profile-categories");
    var v25 = "All";
    var list = [];
    const len2 = profileBackgrounds.filter(profileBackground => profileBackground.collection === "uploaded").length;
    [["All", "All " + profileBackgrounds.length], ["Uploaded", "New " + len2], ["Original", "Original " + (profileBackgrounds.length - len2)]].forEach(function (item) {
      var button4 = createButton("dt-theme-filter-button", item[1], function () {
        v25 = item[0];
        onInput();
      });
      button4.dataset.profileFilter = item[0];
      button4.setAttribute("aria-pressed", String(item[0] === "All"));
      divEl5.appendChild(button4);
      list.push(button4);
    });
    divEl5.setAttribute("role", "group");
    divEl5.setAttribute("aria-label", "Background categories");
    var divEl6 = createEl("div", "dt-profile-grid");
    var pEl3 = createEl("p", "dt-profile-results");
    pEl3.setAttribute("role", "status");
    profileBackgrounds.forEach(function (profileBackground, index) {
      var button4 = createButton("dt-profile-card", undefined, function () {
        dtProfiles.choose(profileBackground.id);
        onDtProfileChange();
      });
      button4.dataset.profile = profileBackground.id;
      button4.setAttribute("aria-label", profileBackground.name + " profile background");
      button4.setAttribute("aria-pressed", "false");
      var imgEl = createEl("img");
      imgEl.src = profileBackground.image;
      imgEl.alt = "";
      imgEl.loading = "lazy";
      imgEl.decoding = "async";
      if (profileBackground.position) {
        imgEl.style.objectPosition = profileBackground.position[0] * 100 + "% " + profileBackground.position[1] * 100 + "%";
      }
      var spanEl4 = createEl("span", "dt-profile-card-caption");
      spanEl4.append(createEl("small", "", String(index + 1).padStart(2, "0")), createEl("strong", "", profileBackground.name), createEl("span", "dt-profile-selected", "✓"));
      button4.append(imgEl, spanEl4);
      divEl6.appendChild(button4);
    });
    function onInput() {
      var value = inputEl.value.trim().toLowerCase();
      var v27 = 0;
      divEl6.querySelectorAll("[data-profile]").forEach(function (item) {
        var found = profileBackgrounds.find(function (profileBackground) {
          return profileBackground.id === item.dataset.profile;
        });
        var v28 = (!value || (found.name + " " + found.category).toLowerCase().includes(value)) && (v25 === "All" || (v25 === "Uploaded" ? found.collection === "uploaded" : found.collection !== "uploaded"));
        item.hidden = !v28;
        if (v28) {
          v27++;
        }
      });
      list.forEach(function (item) {
        item.setAttribute("aria-pressed", String(item.dataset.profileFilter === v25));
      });
      pEl3.textContent = v27 ? v27 + " backgrounds" : "No matching backgrounds";
    }
    inputEl.addEventListener("input", onInput);
    var v26 = "";
    function fn20(arg17) {
      var v29 = dtProfiles.current();
      var v30 = dtProfiles.status();
      var playerInputInputEl = document.querySelector("#player input[type=\"text\"],input[data-dt-nickname]");
      var textContent = playerInputInputEl && playerInputInputEl.value;
      if (!textContent) {
        try {
          textContent = localStorage.getItem("lastNickname");
        } catch (err) {}
      }
      textContent = formatNickname(textContent || "EOT pilot");
      var badge;
      try {
        badge = localStorage.getItem("badge") || get("cc_badge", "star");
      } catch (err) {
        badge = "star";
      }
      var json = JSON.stringify([v29 && v29.id, v24, textContent, badge, v30.shareConfirmed, v30.prepared, v30.persisted]);
      if (!arg17 && json === v26) {
        return;
      }
      divEl2.style.backgroundPosition = v29 && v29.position ? "center, " + v29.position[0] * 100 + "% " + v29.position[1] * 100 + "%" : "center";
      v26 = json;
      divEl2.style.backgroundImage = v29 && !v24 ? "linear-gradient(90deg,rgba(3,7,17,.4),rgba(3,7,17,.04),rgba(3,7,17,.35)),url(\"" + v29.image + "\")" : "none";
      divEl2.dataset.profileView = v24 ? "standard" : "client";
      divEl2.dataset.profileBackground = v29 && !v24 ? v29.id : "none";
      strongEl.textContent = textContent;
      spanEl2.replaceChildren();
      var v31 = v4[badge];
      if (!v24 && v31 && v31.scope === "client") {
        var imgEl = createEl("img");
        imgEl.src = v31.icon;
        imgEl.alt = v31.name;
        spanEl2.appendChild(imgEl);
      } else {
        spanEl2.appendChild(createEl("span", "", "★"));
      }
      button.setAttribute("aria-pressed", String(!v24));
      button2.setAttribute("aria-pressed", String(v24));
      button3.setAttribute("aria-pressed", String(!v29));
      divEl6.querySelectorAll("[data-profile]").forEach(function (item) {
        item.setAttribute("aria-pressed", String(!!v29 && item.dataset.profile === v29.id));
      });
      pEl.textContent = v24 ? "Standard client preview · ordinary row, without the custom background." : v29 ? v29.name + " · visible behind your leaderboard row." : "Choose one of the " + profileBackgrounds.length + " backgrounds below.";
      pEl2.dataset.profileShare = config.preview ? "preview" : v30.shareConfirmed ? "confirmed" : v29 ? "local" : "none";
      pEl2.textContent = config.preview ? "Preview only · the game selection is unchanged." : config.compatibility && config.compatibility.customProfiles === false ? "Profile backgrounds are unavailable in this game version." : !v29 ? "Standard profile · rejoin after changing this choice." : v30.shareConfirmed ? "Server returned this selection · updated clients can read it." : v30.prepared ? "Waiting for the server to return this choice." : "Saved " + (v30.persisted ? "on this device" : "for this session") + " · rejoin to share. Server confirmation pending.";
    }
    el5.append(sectionEl, divEl4, divEl5, pEl3, divEl6, createEl("p", "dt-profile-help", "Only updated clients draw these backgrounds. A standard client keeps its ordinary leaderboard. Rejoin after changing your selection."));
    set.add(fn20);
    onInput();
    fn20(true);
  }
  function renderShipColorsPreview(el5) {
    if (!el5 || !config.preview) {
      return;
    }
    el5.replaceChildren();
    var divEl = createEl("div", "dt-ship-color-sample");
    var strongEl = createEl("strong", "", "eot pilot");
    var iEl = createEl("i", "dt-ship-preview-current");
    iEl.setAttribute("aria-hidden", "true");
    divEl.append(strongEl, iEl);
    var divEl2 = createEl("div", "dt-ship-base-grid");
    var divEl3 = createEl("div", "dt-extra-colors");
    var pEl = createEl("p", "dt-laser-caption");
    divEl2.setAttribute("aria-label", "Original ship color preview");
    divEl3.setAttribute("role", "group");
    divEl3.setAttribute("aria-label", "Extra ship colors preview");
    pEl.setAttribute("role", "status");
    function fn21(el6, arg18, title, arg19) {
      var background = arg19 ? arg19.swatch : fn6(arg18);
      var button = createButton("dt-ship-swatch", undefined, function () {
        fn22(arg18, title, background, arg19);
      });
      button.setAttribute(arg19 ? "data-preview-color" : "data-preview-hue", String(arg18));
      button.title = title;
      button.setAttribute("aria-label", title + " ship color preview");
      button.setAttribute("aria-pressed", "false");
      button.style.background = background;
      el6.appendChild(button);
    }
    function fn22(arg20, arg21, background, arg22) {
      iEl.style.background = background;
      strongEl.style.color = arg22 ? "#eee" : "hsl(" + arg20 + ",100%,90%)";
      el5.querySelectorAll(".dt-ship-swatch").forEach(function (item) {
        item.setAttribute("aria-pressed", String((arg22 ? item.dataset.previewColor : item.dataset.previewHue) === String(arg20)));
      });
      pEl.textContent = arg21 + " · " + (arg22 ? "Local ship appearance. " : "") + "Use the lobby palette after installation.";
    }
    for (var i = 0; i < 360; i += 12) {
      fn21(divEl2, i, "Hue " + i + "°");
    }
    shipColors.forEach(function (shipColor) {
      fn21(divEl3, shipColor.id, shipColor.name, shipColor);
    });
    el5.append(divEl, divEl2, createEl("div", "dt-extra-color-title", "Extra colors"), divEl3, pEl);
    fn22(60, "Hue 60°", fn6(60), null);
  }
  var weakSet3 = new WeakSet();
  var weakSet4 = new WeakSet();
  function onClick() {
    var colorsEl = document.getElementById("colors");
    if (!colorsEl) {
      return;
    }
    if (window.__DT_SHIP_COLORS) {
      window.__DT_SHIP_COLORS.sync();
    }
    if (!weakSet4.has(colorsEl)) {
      weakSet4.add(colorsEl);
      colorsEl.addEventListener("click", onClick);
    }
    colorsEl.querySelectorAll(".dt-ship-swatch[data-dt-color]").forEach(function (item) {
      if (!weakSet3.has(item)) {
        weakSet3.add(item);
        item.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            item.click();
          }
        });
      }
      var v32 = String(item.classList.contains("selected"));
      if (item.getAttribute("aria-pressed") !== v32) {
        item.setAttribute("aria-pressed", v32);
      }
    });
  }
  function createDiv(text, text2, arg23, arg24) {
    var divEl = createEl("div", "dt-setting-row");
    var spanEl = createEl("span");
    spanEl.append(createEl("strong", "", text), createEl("small", "", text2));
    var labelEl = createEl("label", "dt-switch");
    var inputEl = createEl("input");
    inputEl.type = "checkbox";
    inputEl.checked = !!arg23;
    inputEl.setAttribute("aria-label", text);
    inputEl.addEventListener("change", function () {
      arg24(inputEl.checked);
    });
    labelEl.append(inputEl, createEl("span", "dt-switch-track"));
    divEl.append(spanEl, labelEl);
    return divEl;
  }
  function close() {
    if (!divEl7 || divEl7.hidden) {
      return;
    }
    if (medusaEngine && medusaEngine.setModal) {
      medusaEngine.setModal(false);
    }
    if (window.__DT_MENU_ATMOSPHERE) {
      window.__DT_MENU_ATMOSPHERE.setOpen(false);
    }
    if (window.__DT_SPACE_EFFECTS) {
      window.__DT_SPACE_EFFECTS.previewStop();
    }
    divEl7.hidden = true;
    el.setAttribute("aria-expanded", "false");
    if (activeElement && activeElement.isConnected && activeElement.focus) {
      activeElement.focus();
    }
  }
  function fn7(arg25) {
    var el5 = arg25 === "themes" ? divEl9 : arg25 === "profiles" ? divEl10 : null;
    el5 = el5 && el5.querySelector("[data-dt-lazy]");
    if (el5) {
      el5.removeAttribute("data-dt-lazy");
      if (arg25 === "themes") {
        renderThemes(el5);
      } else {
        renderProfileEditor(el5);
      }
    }
    if (!divEl8 || !divEl9 || !divEl10) {
      return;
    }
    var v33 = arg25 === "themes";
    var v34 = arg25 === "profiles";
    divEl8.hidden = v33 || v34;
    divEl9.hidden = !v33;
    divEl10.hidden = !v34;
    divEl7.dataset.page = v33 ? "themes" : v34 ? "profiles" : "menu";
    el2.textContent = v33 ? "Interface themes" : v34 ? "Custom profile" : "Medusa Client";
    el3.setAttribute("aria-expanded", String(v33));
    el4.setAttribute("aria-expanded", String(v34));
    if (window.__DT_SPACE_EFFECTS) {
      window.__DT_SPACE_EFFECTS.previewStop();
      window.__DT_SPACE_EFFECTS.previewStart();
    }
    if (v34) {
      onDtProfileChange();
    }
  }
  function open(arg26) {
    if (!divEl7) {
      return;
    }
    if (medusaEngine && medusaEngine.setModal) {
      medusaEngine.setModal(true);
    }
    if (divEl7.hidden) {
      activeElement = document.activeElement;
    }
    fn7(arg26);
    divEl7.hidden = false;
    el.setAttribute("aria-expanded", "true");
    if (window.__DT_MENU_ATMOSPHERE) {
      window.__DT_MENU_ATMOSPHERE.setOpen(true);
    }
    if (window.__DT_SPACE_EFFECTS) {
      window.__DT_SPACE_EFFECTS.previewStart();
    }
    if (arg26 === "profiles") {
      onDtProfileChange();
    }
    fn17();
    divEl7.querySelector(arg26 === "themes" ? ".dt-theme-search" : arg26 === "profiles" ? ".dt-profile-search" : "[data-dt-close]").focus();
  }
  function openInterface() {
    open("themes");
  }
  function openProfile() {
    open("profiles");
  }
  function fn8() {
    if (document.getElementById("dt-client-studio")) {
      return;
    }
    divEl6 = createEl("div", "dt-studio");
    divEl6.id = "dt-client-studio";
    el = createButton("dt-native-control dt-studio-trigger", undefined, function (event) {
      event.stopPropagation();
      open();
    });
    el.title = "Medusa Client 3.11.0 · Alt + U";
    el.hidden = false;
    el.classList.add("medusa-floating");
    divEl6.appendChild(el);
    el.setAttribute("aria-label", "Open Medusa Client menu");
    el.setAttribute("aria-expanded", "false");
    el.setAttribute("aria-controls", "dt-appearance-dialog");
    el.appendChild(createSvg("skull"));
    divEl7 = createEl("div", "dt-backdrop");
    divEl7.hidden = true;
    var sectionEl = createEl("section", "dt-drawer");
    sectionEl.id = "dt-appearance-dialog";
    sectionEl.setAttribute("role", "dialog");
    sectionEl.setAttribute("aria-modal", "true");
    sectionEl.setAttribute("aria-labelledby", "dt-studio-title");
    var headerEl = createEl("header", "dt-drawer-head");
    var spanEl = createEl("span", "dt-emblem");
    if (config.branding && config.branding.menuLogo) {
      spanEl.classList.add("dt-emblem-logo");
      var imgEl = createEl("img", "dt-menu-logo");
      imgEl.alt = config.branding.menuAlt || "Starblast Project Server";
      imgEl.width = 64;
      imgEl.height = 64;
      imgEl.draggable = false;
      imgEl.decoding = "async";
      imgEl.onerror = function () {
        spanEl.classList.remove("dt-emblem-logo");
        spanEl.replaceChildren(createSvg("spark"));
      };
      imgEl.src = config.branding.menuLogo;
      spanEl.appendChild(imgEl);
    } else {
      spanEl.appendChild(createSvg("spark"));
    }
    var divEl = createEl("div", "dt-grow");
    var h2El = createEl("h2", "", "Medusa Client");
    h2El.id = "dt-studio-title";
    el2 = h2El;
    var pEl = createEl("p", "dt-brand-caption", findTheme(v3.theme).name);
    pEl.setAttribute("data-dt-theme-name", "");
    divEl.append(createEl("p", "dt-eyebrow", "Medusa Client / 3.11.0"), h2El, pEl);
    var button = createButton("dt-icon-button", undefined, close);
    button.dataset.dtClose = "";
    button.setAttribute("aria-label", "Close appearance");
    button.appendChild(createSvg("close"));
    headerEl.append(spanEl, divEl, button);
    var divEl2 = createEl("div", "dt-drawer-body");
    divEl8 = createEl("div", "dt-menu-page");
    divEl8.id = "dt-menu-page";
    divEl9 = createEl("div", "dt-theme-page");
    divEl9.id = "dt-theme-page";
    divEl9.hidden = true;
    divEl10 = createEl("div", "dt-profile-page");
    divEl10.id = "dt-profile-page";
    divEl10.hidden = true;
    var sectionEl2 = createEl("section", "dt-section");
    sectionEl2.appendChild(createEl("h3", "dt-section-title", "Quick controls"));
    el3 = createButton("dt-interface-entry", undefined, function () {
      fn7("themes");
      divEl9.querySelector(".dt-theme-search").focus();
    });
    el3.setAttribute("aria-controls", "dt-theme-page");
    el3.setAttribute("aria-expanded", "false");
    el3.setAttribute("aria-label", "Interface — change your theme");
    var spanEl2 = createEl("span", "dt-interface-copy");
    var smallEl = createEl("small");
    smallEl.setAttribute("data-dt-theme-name", "");
    smallEl.textContent = findTheme(v3.theme).name;
    spanEl2.append(createEl("strong", "", "Interface"), smallEl);
    var spanEl3 = createEl("span", "dt-interface-chevron", "›");
    spanEl3.setAttribute("aria-hidden", "true");
    var spanEl4 = createEl("span", "dt-entry-emblem");
    spanEl4.appendChild(createSvg("palette"));
    el3.append(spanEl4, spanEl2, createEl("span", "dt-count", themes.length + " themes"), spanEl3);
    sectionEl2.appendChild(el3);
    divEl8.appendChild(sectionEl2);
    el4 = createButton("dt-interface-entry dt-profile-entry", undefined, function () {
      fn7("profiles");
      divEl10.querySelector(".dt-profile-search").focus();
    });
    el4.setAttribute("aria-controls", "dt-profile-page");
    el4.setAttribute("aria-expanded", "false");
    var spanEl5 = createEl("span", "dt-interface-copy");
    spanEl5.append(createEl("strong", "", "Custom profile"), createEl("small", "", "Your leaderboard background"));
    var spanEl6 = createEl("span", "dt-entry-emblem");
    spanEl6.appendChild(createSvg("spark"));
    el4.append(spanEl6, spanEl5, createEl("span", "dt-count", profileBackgrounds.length + " backgrounds"), createEl("span", "dt-interface-chevron", "›"));
    sectionEl2.appendChild(el4);
    var button2 = createButton("dt-button dt-menu-back", "← Menu", function () {
      fn7("menu");
      el4.focus();
    });
    button2.setAttribute("aria-label", "Back to client menu");
    divEl10.appendChild(button2);
    var divEl3 = createEl("div");
    divEl3.dataset.dtLazy = "profiles";
    divEl10.appendChild(divEl3);
    var button3 = createButton("dt-button dt-menu-back", "← Menu", function () {
      fn7("menu");
      el3.focus();
    });
    button3.setAttribute("aria-label", "Back to client menu");
    divEl9.appendChild(button3);
    var sectionEl3 = createEl("section", "dt-section");
    var h3El = createEl("h3", "dt-section-title", "Interface themes");
    h3El.appendChild(createEl("span", "dt-count", themes.length + " styles"));
    var divEl4 = createEl("div");
    divEl4.dataset.dtLazy = "themes";
    sectionEl3.append(h3El, divEl4);
    divEl9.appendChild(sectionEl3);
    var divEl5 = createEl("div", "dt-theme-filter");
    var inputEl = createEl("input", "dt-theme-search");
    var v35 = false;
    inputEl.type = "search";
    inputEl.placeholder = "Find a theme…";
    inputEl.setAttribute("aria-label", "Find an interface theme");
    var button4 = createButton("dt-theme-filter-button", "All " + themes.length, function () {
      v35 = false;
      onInput();
    });
    var button5 = createButton("dt-theme-filter-button", "New " + themes.filter(function (theme) {
      return !!theme.collection;
    }).length, function () {
      v35 = true;
      onInput();
    });
    button4.setAttribute("aria-pressed", "true");
    button5.setAttribute("aria-pressed", "false");
    function onInput() {
      var value = inputEl.value.trim().toLowerCase();
      var v36 = 0;
      divEl4.querySelectorAll(".dt-preset").forEach(function (item) {
        var v37 = (!v35 || item.dataset.newTheme === "true") && item.getAttribute("aria-label").toLowerCase().includes(value);
        item.hidden = !v37;
        if (v37) {
          v36++;
        }
      });
      button4.setAttribute("aria-pressed", String(!v35));
      button5.setAttribute("aria-pressed", String(v35));
      spanEl7.textContent = v36 ? v36 + " themes" : "No matching themes";
    }
    var spanEl7 = createEl("span", "dt-theme-filter-status", themes.length + " themes");
    spanEl7.setAttribute("role", "status");
    inputEl.addEventListener("input", onInput);
    divEl5.append(inputEl, button4, button5, spanEl7);
    sectionEl3.insertBefore(divEl5, divEl4);
    var sectionEl4 = createEl("section", "dt-section");
    sectionEl4.appendChild(createEl("h3", "dt-section-title", "Comfort & effects"));
    sectionEl4.appendChild(createDiv("Compact settings", "Reduce spacing inside game settings.", v3.density === "compact", function (arg27) {
      v3.density = arg27 ? "compact" : "comfortable";
      fn1(true);
    }));
    sectionEl4.appendChild(createDiv("Interface effects", "Soft transitions and panel entrances.", v3.effects, function (effects) {
      v3.effects = effects;
      fn1(true);
    }));
    var sectionEl5 = createEl("section", "dt-section");
    sectionEl5.appendChild(createEl("h3", "dt-section-title", "Game colors"));
    [["gemcolor1", "Gem color", "#ff0000"], ["gemcolor2", "Gem reflection", "#ff8080"], ["bgcolor", "Space background", "#000819"]].forEach(function (item) {
      var labelEl = createEl("label", "dt-setting-row");
      var spanEl8 = createEl("span");
      spanEl8.append(createEl("strong", "", item[1]), createEl("small", "", item[0] === "bgcolor" ? "Applies fully after reloading the game." : "Uses the original client material hook."));
      var inputEl2 = createEl("input");
      inputEl2.type = "color";
      inputEl2.setAttribute("aria-label", item[1]);
      var v38 = get(item[0], item[2]);
      inputEl2.value = /^#[a-f0-9]{6}$/i.test(v38) ? v38 : item[2];
      inputEl2.addEventListener("input", function () {
        set3(item[0], inputEl2.value);
        var elementById = document.getElementById(item[0]);
        if (elementById) {
          elementById.value = inputEl2.value;
          elementById.dispatchEvent(new Event("input", {
            bubbles: true
          }));
        }
      });
      labelEl.append(spanEl8, inputEl2);
      sectionEl5.appendChild(labelEl);
    });
    divEl8.append(sectionEl5, sectionEl4);
    sectionEl5.appendChild(createEl("p", "dt-shortcuts", "HUD: Shield — dark blue · Energy — black · Gems — white."));
    if (config.compatibility && config.compatibility.hud === false) {
      divEl8.appendChild(createEl("p", "dt-shortcuts", "HUD colors are unavailable for this game build."));
    }
    if (config.compatibility && config.compatibility.chatEmojis === false) {
      divEl8.appendChild(createEl("p", "dt-shortcuts", "Custom emojis are unavailable for this game build."));
    }
    if (!config.preview) {
      pEl4 = createEl("p", "dt-shortcuts");
      pEl4.setAttribute("role", "status");
      pEl4.setAttribute("data-dt-radar-status", "");
      divEl8.appendChild(pEl4);
      fn17();
    }
    if (config.compatibility && (!config.compatibility.materials || !config.compatibility.badges)) {
      var pEl2 = createEl("p", "dt-shortcuts", "The game build has changed. Some custom cosmetics may be unavailable; the interface themes remain active.");
      divEl8.appendChild(pEl2);
    }
    var pEl3 = createEl("p", "dt-shortcuts");
    pEl3.innerHTML = "<kbd>Alt + U</kbd> Interface &nbsp; <kbd>Alt + P</kbd> Profile &nbsp; <kbd>Esc</kbd> Close<br><kbd>C</kbd> TALK / emojis<br><kbd>Ctrl + E</kbd> Game settings &nbsp; <kbd>Ctrl + S</kbd> Reload client";
    divEl8.appendChild(pEl3);
    divEl2.append(divEl8, divEl9, divEl10);
    var footerEl = createEl("footer", "dt-drawer-foot");
    spanEl8 = createEl("span", "dt-save-state", v2 ? "Saved on this device" : "Applied for this session");
    spanEl8.setAttribute("role", "status");
    footerEl.append(spanEl8, createButton("dt-button dt-primary", "Done", close));
    sectionEl.append(headerEl, divEl2, footerEl);
    divEl7.appendChild(sectionEl);
    divEl6.append(el, divEl7);
    document.body.appendChild(divEl6);
    fn5();
    divEl7.addEventListener("click", function (event) {
      if (event.target === divEl7) {
        close();
      }
      event.stopPropagation();
    });
    ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"].forEach(function (item) {
      divEl7.addEventListener(item, function (event) {
        event.stopPropagation();
      });
    });
    document.addEventListener("keydown", function (event) {
      var key = event.key.toLowerCase();
      if (event.altKey && !event.ctrlKey && !event.metaKey && key === "u") {
        set2.add("alt");
        set2.add(key);
        event.preventDefault();
        event.stopImmediatePropagation();
        if (divEl7.hidden) {
          openInterface();
        } else {
          close();
        }
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && key === "p") {
        set2.add("alt");
        set2.add(key);
        event.preventDefault();
        event.stopImmediatePropagation();
        if (divEl7.hidden) {
          openProfile();
        } else {
          close();
        }
        return;
      }
      if (divEl7.hidden) {
        return;
      }
      if (!event.repeat || set2.has(key)) {
        set2.add(key);
      }
      if (key === "escape") {
        event.preventDefault();
        close();
      }
      if (key === "tab") {
        var filtered = Array.from(sectionEl.querySelectorAll("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex=\"0\"]")).filter(function (item) {
          return !item.closest("[hidden]");
        });
        var el5 = filtered[0];
        var el6 = filtered[filtered.length - 1];
        if (event.shiftKey && (document.activeElement === el5 || !sectionEl.contains(document.activeElement))) {
          event.preventDefault();
          el6.focus();
        } else if (!event.shiftKey && (document.activeElement === el6 || !sectionEl.contains(document.activeElement))) {
          event.preventDefault();
          el5.focus();
        }
      }
      event.stopImmediatePropagation();
    }, true);
    document.addEventListener("keyup", function (event) {
      var key = event.key.toLowerCase();
      if (set2.has(key)) {
        set2.delete(key);
        event.stopImmediatePropagation();
      }
    }, true);
  }
  var v7 = null;
  var v8 = null;
  var v9 = null;
  var v10 = 112;
  function fn9(value) {
    if (config.preview) {
      return true;
    }
    try {
      localStorage.setItem("badge", value);
      return true;
    } catch (err) {
      return false;
    }
  }
  function captureOwnBadge(arg28, arg29, arg30) {
    if (v8 !== arg29) {
      v8 = arg29;
      var badge = get("cc_badge", null);
      var v39 = null;
      try {
        v39 = localStorage.getItem("badge");
      } catch (err) {}
      if ((badge === "blank" || v4[badge]) && (v39 === null || v39 === badge)) {
        arg29.badge = badge;
      }
    }
    v9 = arg30;
    v10 = arg28;
    if (window.__DT_LASER_VISUALS && typeof window.__DT_LASER_VISUALS.capture === "function") {
      window.__DT_LASER_VISUALS.capture(arg29);
    }
    if (arg29.badge === "blank" || v4[arg29.badge]) {
      set3("cc_badge", arg29.badge);
      fn9(arg29.badge);
    }
    document.querySelectorAll(".dt-badges [data-bid]").forEach(function (item) {
      item.setAttribute("aria-pressed", String(item.dataset.bid === arg29.badge));
    });
    return new arg30(arg28, arg29).canvas;
  }
  function fn10(value) {
    fn9(value);
    if (!v8 || !v9) {
      return;
    }
    v8.badge = value;
    try {
      var tdEcpverifiedlogoFrozenbgEl = document.querySelector("td.ecpverifiedlogo.frozenbg");
      var v40 = tdEcpverifiedlogoFrozenbgEl && tdEcpverifiedlogoFrozenbgEl.querySelector("canvas");
      if (tdEcpverifiedlogoFrozenbgEl) {
        var canvas = new v9(v10, v8).canvas;
        if (v40) {
          v40.replaceWith(canvas);
        } else {
          tdEcpverifiedlogoFrozenbgEl.prepend(canvas);
        }
      }
      var modalTitleEl = document.querySelector(".modal [data-type=\"badge\"] .title");
      if (modalTitleEl) {
        modalTitleEl.textContent = v4[value] ? v4[value].name : "No badge";
      }
    } catch (err) {}
  }
  function fn11(arg31) {
    var v41 = "https://bhpsngum.github.io/starblast/ecp/?shadow=arcs&badge&name=";
    return v41 + encodeURIComponent(arg31 === "blank" ? "star" : arg31);
  }
  function mountBadges(el5) {
    if (!el5 || el5._dtBadgePicker && el5._dtBadgePicker.isConnected) {
      return;
    }
    var tableCustomtableEl = el5.closest("table.customtable");
    var sectionEl = createEl("section", "dt-badges");
    sectionEl.setAttribute("aria-label", "Client badges");
    var divEl = createEl("div", "dt-badge-header");
    var divEl2 = createEl("div", "dt-grow");
    divEl2.append(createEl("h3", "dt-badge-title", "Client Badges"), createEl("div", "dt-badge-subtitle", len + " client badges · choose for your next match"));
    var aEl = createEl("a", "dt-button dt-ecp-link", "ECP Viewer");
    aEl.target = "_blank";
    aEl.rel = "noopener noreferrer";
    var button = createButton("dt-button dt-force", "Force HUD", function () {
      v6 = v6 === "black_force" ? "default" : "black_force";
      set3("hud_theme", v6);
      button.setAttribute("aria-pressed", String(v6 === "black_force"));
    });
    button.setAttribute("aria-pressed", String(v6 === "black_force"));
    button.title = "Toggle the original Black Force HUD colors";
    divEl.append(divEl2, aEl, button);
    var inputEl = createEl("input", "dt-badge-search");
    inputEl.type = "search";
    inputEl.placeholder = "Search badges by name…";
    inputEl.setAttribute("aria-label", "Search client badges");
    inputEl.autocomplete = "off";
    var divEl3 = createEl("div", "dt-badge-tabs");
    divEl3.setAttribute("role", "group");
    divEl3.setAttribute("aria-label", "Badge groups");
    var divEl4 = createEl("div", "dt-badge-grid");
    divEl4.setAttribute("aria-label", "Available badges");
    var pEl = createEl("p", "dt-badge-status");
    pEl.setAttribute("role", "status");
    var v42 = get("cc_badge", config.preview ? "dt-mbb-v1" : "blank");
    if (!config.preview) {
      try {
        v42 = localStorage.getItem("badge") || v42;
      } catch (err) {}
    }
    var el = createEl("figure", "dt-badge-sample");
    var imgEl = createEl("img");
    var el2 = createEl("figcaption");
    imgEl.alt = "Selected client badge";
    el.append(imgEl, el2);
    var v43 = 0;
    function fn23() {
      var v45 = v4[v42];
      var hidden = !!v45 && v45.scope === "client";
      aEl.hidden = hidden;
      aEl.href = fn11(v42);
      aEl.title = "Open the selected badge in ECP Viewer";
      el.hidden = !config.preview || !hidden;
      if (hidden) {
        if (imgEl.getAttribute("src") !== v45.icon) {
          imgEl.src = v45.icon;
        }
        el2.textContent = v45.name + " · Client badge preview";
      } else {
        imgEl.removeAttribute("src");
      }
    }
    function fn24(value) {
      v42 = value;
      var v46 = set3("cc_badge", value);
      fn10(value);
      divEl4.querySelectorAll("[data-bid]").forEach(function (item) {
        item.setAttribute("aria-pressed", String(item.dataset.bid === value));
      });
      fn23();
      var v47 = v4[value] ? v4[value].name : "No badge";
      pEl.textContent = config.preview ? "Preview selection: " + v47 : v47 + " · " + (v46 ? "Saved locally" : "Applied for this session") + (v4[value] && v4[value].scope === "client" ? " · Rejoin a match to send this selection. Other users need Medusa Client 3.11.0." : "");
      if (!config.preview && v4[value] && v4[value].scope === "client" && config.compatibility && config.compatibility.clientBadges === false) {
        pEl.textContent = v47 + " cannot render in this game build. The native badge fallback will be used.";
      }
    }
    const map = new Map();
    function getButton(value) {
      const el6 = map.get(value);
      if (el6) {
        el6.setAttribute("aria-pressed", String(v42 === value));
        return el6;
      }
      var v48 = v4[value];
      var button2 = createButton("dt-badge", undefined, function () {
        fn24(value);
      });
      button2.dataset.bid = value;
      button2.title = v48 ? v48.name : "No badge";
      button2.setAttribute("aria-label", button2.title);
      button2.setAttribute("aria-pressed", String(v42 === value));
      map.set(value, button2);
      if (!v48) {
        button2.textContent = "×";
        return button2;
      }
      var v49 = v48.scope === "client";
      var imgEl2 = createEl("img");
      imgEl2.alt = "";
      imgEl2.loading = "lazy";
      imgEl2.decoding = "async";
      imgEl2.src = v48.icon;
      imgEl2.hidden = !!config.preview && !v49;
      var spanEl = createEl("span", "dt-badge-fallback", v48.name.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase());
      spanEl.setAttribute("aria-hidden", "true");
      imgEl2.addEventListener("error", function () {
        imgEl2.hidden = true;
      });
      if (config.preview && !v49) {
        imgEl2.removeAttribute("src");
      }
      if (v49) {
        button2.dataset.clientBadge = "";
      }
      button2.append(imgEl2, spanEl);
      return button2;
    }
    function onInput() {
      if (!config.preview && v8 && (v8.badge === "blank" || v4[v8.badge])) {
        v42 = v8.badge;
      }
      var value = inputEl.value.trim().toLowerCase();
      var v50 = value ? badges.map(function (badge) {
        return badge.id;
      }) : (groups[v43] || {}).ids || [];
      v50 = Array.from(new Set(v50)).filter(function (item) {
        var v51 = v4[item];
        return v51 && (!value || (v51.name + " " + item).toLowerCase().includes(value));
      });
      divEl4.replaceChildren();
      if (!v50.length) {
        divEl4.appendChild(createEl("div", "dt-badge-empty", value ? "No badges match “" + inputEl.value.trim() + "”." : "No badges are supplied in this group."));
      }
      v50.forEach(function (item) {
        divEl4.appendChild(getButton(item));
      });
      if (!value) {
        divEl4.appendChild(getButton("blank"));
      }
      fn23();
    }
    groups.forEach(function (group, index) {
      var button2 = createButton("", group.label + " · " + group.ids.length, function () {
        v43 = index;
        inputEl.value = "";
        divEl3.querySelectorAll("button").forEach(function (item, index2) {
          item.setAttribute("aria-pressed", String(index2 === index));
        });
        onInput();
      });
      button2.setAttribute("aria-pressed", String(index === 0));
      divEl3.appendChild(button2);
    });
    inputEl.addEventListener("input", onInput);
    sectionEl.append(divEl, el, inputEl, divEl3, divEl4, pEl);
    if (tableCustomtableEl) {
      tableCustomtableEl.after(sectionEl);
    } else {
      el5.appendChild(sectionEl);
    }
    el5._dtBadgePicker = sectionEl;
    onInput();
    fn23();
    pEl.textContent = config.preview ? len + " embedded client badges work offline · other icons use initials" : "Selected: " + (v4[v42] ? v4[v42].name : v42 === "blank" ? "No badge" : v42) + " · Rejoin after changing the badge";
    if (!config.preview && laserStyles.length) {
      var v44 = config.compatibility && config.compatibility.lasers === false ? "Extra laser shapes are unavailable for this game build." : "ECP → Laser arrows: " + laserStyles.length + " custom shapes. Custom shapes appear in this client.";
      sectionEl.appendChild(createEl("p", "dt-laser-caption", v44));
    }
  }
  var weakSet5 = new WeakSet();
  function fn12() {
    [["gemcolor1", "#ff0000"], ["gemcolor2", "#ff8080"], ["bgcolor", "#000819"]].forEach(function (item) {
      var elementById = document.getElementById(item[0]);
      if (!elementById || weakSet5.has(elementById)) {
        return;
      }
      weakSet5.add(elementById);
      var v52 = get(item[0], item[1]);
      elementById.value = /^#[0-9a-f]{6}$/i.test(v52) ? v52 : item[1];
      var elementById2 = document.getElementById(item[0] + "_value");
      if (elementById2) {
        elementById2.textContent = elementById.value;
      }
      elementById.addEventListener("input", function () {
        if (!/^#[0-9a-f]{6}$/i.test(elementById.value)) {
          return;
        }
        set3(item[0], elementById.value);
        if (elementById2) {
          elementById2.textContent = elementById.value;
        }
        if (item[0] === "bgcolor") {
          document.body.style.backgroundColor = elementById.value;
          var canvasEl = document.querySelector("canvas");
          if (canvasEl) {
            canvasEl.style.backgroundColor = elementById.value;
          }
        }
      });
    });
  }
  function fn13() {
    document.querySelectorAll("a[href]").forEach(function (item) {
      var hostname;
      try {
        hostname = new URL(item.href, location.href).hostname.toLowerCase();
      } catch (err) {
        return;
      }
      if (/(^|\.)(bandcamp\.com|facebook\.com|fb\.com|twitter\.com|x\.com)$/.test(hostname)) {
        item.style.display = "none";
        var parentElement = item.parentElement;
        if (parentElement && parentElement !== document.body && parentElement.children.length === 1 && parentElement.textContent.trim().length < 160 && /music|bandcamp|facebook|twitter/.test(String(parentElement.className))) {
          parentElement.style.display = "none";
        }
      }
    });
  }
  function fn14() {
    document.querySelectorAll(".dt-lowercase-trigger,#dt-lowercase-setting").forEach(function (item) {
      var v53 = item.id === "dt-lowercase-setting" && item.closest(".dt-setting-row");
      (v53 || item).remove();
    });
    document.querySelectorAll(".dt-social-menu").forEach(function (item) {
      item.remove();
    });
    document.querySelectorAll("a[href]").forEach(function (item) {
      var url;
      try {
        url = new URL(item.href, location.href);
      } catch (err) {
        return;
      }
      var hostname = url.hostname.toLowerCase().replace(/^www\./, "");
      var pathname = url.pathname.replace(/\/+$/, "");
      if (hostname === "youtube.com" && pathname.toLowerCase() === "/@friv_777" || hostname === "discord.gg" && pathname === "/SR6rz4uvD") {
        var parentElement = item.parentElement;
        item.remove();
        if (parentElement && parentElement !== document.body && parentElement.children.length === 0 && !parentElement.textContent.trim()) {
          parentElement.remove();
        }
      }
    });
  }
  function fn15(arg32) {
    if (!arg32 || !arg32.isConnected || !arg32.getClientRects().length) {
      return false;
    }
    for (var el5 = arg32; el5 && el5 !== document.documentElement; el5 = el5.parentElement) {
      var computedStyle = getComputedStyle(el5);
      if (computedStyle.display === "none" || computedStyle.visibility === "hidden" || Number(computedStyle.opacity) === 0) {
        return false;
      }
    }
    return true;
  }
  function fn16() {
    if (config.preview) {
      return;
    }
    var v54 = fn15(document.querySelector(".social"));
    if (el) {
      el.hidden = !v54;
    }
  }
  function fn17() {
    if (!pEl4) {
      return;
    }
    var dtRadarMarkers = window.__DT_RADAR_MARKERS;
    var v55 = dtRadarMarkers && typeof dtRadarMarkers.status === "function" ? dtRadarMarkers.status() : null;
    var v56 = v55 && (v55.fallbackInstalled || config.compatibility && config.compatibility.radarMarkers);
    pEl4.textContent = "Radar icons — " + (v55 && v55.active ? "Active · People + Crown" : v56 ? "Ready · join a match" : "Not active");
    pEl4.setAttribute("data-state", v55 && v55.active ? "active" : v56 ? "ready" : "unavailable");
  }
  function fn18() {
    var tdShippreviewFrozenbgEl = document.querySelector("td.shippreview.frozenbg");
    if (!tdShippreviewFrozenbgEl || weakSet5.has(tdShippreviewFrozenbgEl)) {
      return;
    }
    weakSet5.add(tdShippreviewFrozenbgEl);
    tdShippreviewFrozenbgEl.addEventListener("wheel", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var v57 = document.querySelector(event.deltaY < 0 ? ".fa-caret-right" : ".fa-caret-left");
      if (v57) {
        v57.click();
      }
    }, {
      passive: false
    });
  }
  function onDOMContentLoaded() {
    var v58 = get("dt_ui_preferences_v1", null);
    if (v58 && typeof v58 === "object") {
      v3.theme = typeof v58.theme === "string" ? v58.theme : v3.theme;
      v3.density = v58.density === "compact" ? "compact" : "comfortable";
      v3.effects = v58.effects !== false;
    }
    var styleEl = createEl("style");
    styleEl.id = "dt-ui-theme";
    styleEl.textContent = config.css || "";
    document.head.appendChild(styleEl);
    fn14();
    fn1(false);
    fn8();
    fn4();
    fn2();
    document.addEventListener("dt-profile-change", onDtProfileChange);
    document.addEventListener("input", function (event) {
      if (event.target.matches && event.target.matches("#player input[type=\"text\"],input[data-dt-nickname]")) {
        onDtProfileChange();
      }
    });
    if (config.preview) {
      document.dispatchEvent(new CustomEvent("dt-ui-ready"));
      return;
    }
    function fn25() {
      if (divEl6 && !divEl6.isConnected && document.body) {
        document.body.appendChild(divEl6);
      }
      if (window.__DT_SHIP_COLORS) {
        window.__DT_SHIP_COLORS.mount();
      }
      if (window.__DT_ENGINE_TRAILS) {
        window.__DT_ENGINE_TRAILS.mount();
      }
      if (window.__DT_SHIP_COSMETICS) {
        window.__DT_SHIP_COSMETICS.mount();
      }
      if (window.__DT_SPACE_EFFECTS) {
        window.__DT_SPACE_EFFECTS.mount(document.getElementById("dt-menu-page"));
      }
      if (window.__DT_MENU_ATMOSPHERE) {
        window.__DT_MENU_ATMOSPHERE.mount(divEl7, document.getElementById("dt-space-effects"));
      }
      fn14();
      fn13();
      fn5();
      fn4();
      fn2();
      fn12();
      onClick();
      mountBadges(document.querySelector("td.ecpverifiedlogo.frozenbg"));
      fn18();
      fn16();
      fn17();
    }
    fn25();
    try {
      createUIRefreshScheduler(window, fn25);
    } catch (err) {
      warn("Interface observer unavailable: " + err.message);
    }
    document.addEventListener("keydown", function (event) {
      var activeElement2 = document.activeElement;
      if (activeElement2 && (activeElement2.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(activeElement2.tagName))) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      var key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.onbeforeunload = null;
        location.reload();
      }
      if (key === "e") {
        var socialSbgGearsEl = document.querySelector(".social .sbg-gears");
        if (socialSbgGearsEl) {
          event.preventDefault();
          socialSbgGearsEl.click();
        }
      }
    });
    log("v3.11.0 ready · " + themes.length + " interface themes");
  }
  window.DT_UI = {
    version: "3.11.0",
    themes: themes,
    setTheme: setTheme,
    open: open,
    openInterface: openInterface,
    openProfile: openProfile,
    close: close,
    renderThemes: renderThemes,
    renderLaserPreview: renderLaserPreview,
    renderShipColorsPreview: renderShipColorsPreview,
    renderEmojiPreview: renderEmojiPreview,
    renderRadarPreview: renderRadarPreview,
    renderProfileEditor: renderProfileEditor,
    mountBadges: mountBadges,
    captureOwnBadge: captureOwnBadge,
    formatNickname: formatNickname,
    read: get
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDOMContentLoaded, {
      once: true
    });
  } else {
    onDOMContentLoaded();
  }
}
// Animated wallpaper scenes drawn on a <canvas>. Each scene is cheap by design: capped frame rate,
// capped resolution, nothing drawn while paused.
const hexToRgb = (h) => { const n = parseInt(String(h).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

const SCENES = {
  // soft colour clouds drifting on Lissajous paths
  aurora: {
    scale: 0.5, // drawn at half size and blurred up by CSS: smooth and cheap
    init(s) { s.blobs = Array.from({ length: 6 }, (_, i) => ({ ax: 0.25 + Math.random() * 0.3, ay: 0.2 + Math.random() * 0.3, fx: 0.05 + Math.random() * 0.08, fy: 0.04 + Math.random() * 0.07, ph: i * 1.7, r: 0.35 + Math.random() * 0.25, c: i % s.colors.length })); },
    draw(s, ctx, w, h, t) {
      ctx.fillStyle = rgba(s.base, 1); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const b of s.blobs) {
        const x = w * (0.5 + b.ax * Math.sin(t * b.fx + b.ph)) + s.px * w * 0.04, y = h * (0.5 + b.ay * Math.cos(t * b.fy + b.ph * 1.3)) + s.py * h * 0.04;
        const r = Math.max(w, h) * b.r, g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(s.colors[b.c], 0.42 * s.intensity)); g.addColorStop(1, rgba(s.colors[b.c], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  // a drifting network of linked dots
  particles: {
    scale: 1,
    init(s, w, h) { const n = Math.round(Math.min(140, (w * h) / 14000) * (0.5 + s.intensity / 2)); s.pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35, r: 1 + Math.random() * 1.8, c: Math.random() < 0.6 ? 0 : 1 })); },
    draw(s, ctx, w, h, t, dt) {
      const bg = ctx.createLinearGradient(0, 0, w, h); bg.addColorStop(0, rgba(mix(s.base, s.colors[2] || s.colors[0], 0.35), 1)); bg.addColorStop(1, rgba(s.base, 1));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const link = Math.min(w, h) * 0.13, mx = (s.px + 0.5) * w, my = (s.py + 0.5) * h;
      for (const p of s.pts) {
        p.x += p.vx * dt * 0.06 * s.speed; p.y += p.vy * dt * 0.06 * s.speed;
        if (s.parallax) { const dx = mx - p.x, dy = my - p.y, d2 = dx * dx + dy * dy; if (d2 < link * link * 4) { p.x += dx * 0.0006 * dt * 0.06; p.y += dy * 0.0006 * dt * 0.06; } }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10; if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < s.pts.length; i++) for (let j = i + 1; j < s.pts.length; j++) {
        const a = s.pts[i], b = s.pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < link) { ctx.strokeStyle = rgba(s.colors[a.c], (1 - d / link) * 0.35 * s.intensity + 0.05); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (const p of s.pts) { ctx.fillStyle = rgba(s.colors[p.c], 0.9); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    },
  },
  // layered flowing waves
  waves: {
    scale: 0.75,
    init(s) { s.layers = Array.from({ length: 5 }, (_, i) => ({ amp: 0.03 + i * 0.012, len: 0.6 + i * 0.35, sp: 0.15 + i * 0.07, y: 0.45 + i * 0.1, c: i % s.colors.length })); },
    draw(s, ctx, w, h, t) {
      const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, rgba(s.base, 1)); bg.addColorStop(1, rgba(mix(s.base, s.colors[0], 0.25), 1));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      s.layers.forEach((L, i) => {
        ctx.beginPath(); ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const k = x / w;
          const y = h * (L.y + s.py * 0.02 * (i + 1)) + Math.sin(k * Math.PI * 2 / L.len * 2 + t * L.sp) * h * L.amp * (0.5 + s.intensity) + Math.sin(k * 7 + t * L.sp * 1.7) * h * L.amp * 0.3;
          ctx.lineTo(x + s.px * 12 * (i + 1), y);
        }
        ctx.lineTo(w, h); ctx.closePath();
        ctx.fillStyle = rgba(s.colors[L.c], 0.12 + 0.07 * i * s.intensity); ctx.fill();
      });
    },
  },
  // a slow warp through stars
  starfield: {
    scale: 1,
    init(s, w, h) { s.stars = Array.from({ length: Math.round(500 * (0.4 + s.intensity)) }, () => ({ x: (Math.random() - 0.5) * w * 2, y: (Math.random() - 0.5) * h * 2, z: Math.random() * w, c: Math.random() < 0.3 ? 0 : 1 })); },
    draw(s, ctx, w, h, t, dt) {
      ctx.fillStyle = rgba(s.base, 0.35); ctx.fillRect(0, 0, w, h); // a little trail
      const cx = w * (0.5 - s.px * 0.08), cy = h * (0.5 - s.py * 0.08);
      for (const st of s.stars) {
        st.z -= dt * 0.08 * s.speed * (0.5 + s.intensity);
        if (st.z < 1) { st.z = w; st.x = (Math.random() - 0.5) * w * 2; st.y = (Math.random() - 0.5) * h * 2; }
        const k = 220 / st.z, x = cx + st.x * k * 0.5, y = cy + st.y * k * 0.5, r = Math.min(2.6, k * 0.9);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.fillStyle = rgba(st.c ? [225, 230, 236] : s.colors[0], Math.min(1, k * 0.8)); ctx.fillRect(x, y, r, r);
      }
    },
  },
  // a ring of bars around a glowing core, driven by the music
  visualizer: {
    scale: 1,
    init(s) { s.bars = new Float32Array(96); s.rot = 0; },
    draw(s, ctx, w, h, t, dt) {
      const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, rgba(mix(s.base, s.colors[2] || s.colors[0], 0.5), 1)); bg.addColorStop(1, rgba(s.base, 1));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const a = s.audio || {}, bins = a.bins, n = s.bars.length;
      for (let i = 0; i < n; i++) { // music when there is some, a calm idle wave otherwise
        const target = bins ? bins[Math.floor(2 + (i % (n / 2)) * 1.6)] / 255 : 0.12 + 0.08 * Math.sin(t * 1.4 + i * 0.35);
        s.bars[i] += (target - s.bars[i]) * 0.35;
      }
      s.rot += dt * 0.00004 * s.speed;
      const cx = w / 2 + s.px * w * 0.03, cy = h / 2 + s.py * h * 0.03, r0 = Math.min(w, h) * (0.16 + (a.bass || 0) * 0.04);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0 * 2.2);
      glow.addColorStop(0, rgba(s.colors[0], 0.55 + (a.bass || 0) * 0.4)); glow.addColorStop(1, rgba(s.colors[0], 0));
      ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.006);
      for (let i = 0; i < n; i++) {
        const ang = s.rot + (i / n) * Math.PI * 2, len = r0 * (0.15 + s.bars[i] * 1.6 * (0.5 + s.intensity));
        ctx.strokeStyle = rgba(i % 2 ? s.colors[1] : s.colors[0], 0.85);
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); ctx.lineTo(cx + Math.cos(ang) * (r0 + len), cy + Math.sin(ang) * (r0 + len)); ctx.stroke();
      }
      ctx.fillStyle = rgba(s.base, 0.9); ctx.beginPath(); ctx.arc(cx, cy, r0 * 0.92, 0, Math.PI * 2); ctx.fill();
    },
  },
  // out-of-focus lights drifting at different depths (the classic bokeh wallpaper)
  bokeh: {
    scale: 0.75,
    init(s, w, h) {
      const n = Math.round(46 * (0.5 + s.intensity));
      s.orbs = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: Math.random(), ph: Math.random() * 6.28, c: Math.floor(Math.random() * 2) }));
      s.orbs.sort((a, b) => a.z - b.z); // far ones first
    },
    draw(s, ctx, w, h, t, dt) {
      const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
      bg.addColorStop(0, rgba(mix(s.base, s.colors[2] || s.colors[0], 0.45), 1)); bg.addColorStop(1, rgba(s.base, 1));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      const m = Math.min(w, h), lvl = s.audio?.level || 0;
      ctx.globalCompositeOperation = 'lighter';
      for (const o of s.orbs) {
        const r = m * (0.015 + o.z * 0.07) * (1 + lvl * 0.4);
        o.y -= dt * 0.006 * s.speed * (0.3 + o.z); o.x += Math.sin(t * 0.3 + o.ph) * 0.15 * o.z;
        if (o.y < -r) { o.y = h + r; o.x = Math.random() * w; }
        const x = o.x - s.px * w * 0.05 * o.z, y = o.y - s.py * h * 0.05 * o.z;
        const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + o.z) + o.ph); // twinkle
        const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
        const a = (0.10 + 0.22 * (1 - o.z)) * tw * (0.6 + s.intensity * 0.6);
        g.addColorStop(0, rgba(s.colors[o.c], a)); g.addColorStop(0.75, rgba(s.colors[o.c], a * 0.7)); g.addColorStop(1, rgba(s.colors[o.c], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  // rain on a window: streaks in three depths, drops that cling to the glass and slide down
  rain: {
    scale: 1,
    init(s, w, h) {
      const n = Math.round(260 * (0.4 + s.intensity));
      s.streaks = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.7 }));
      s.drops = Array.from({ length: 70 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: 1.5 + Math.random() * 4, v: 0 }));
      s.flash = 0;
    },
    draw(s, ctx, w, h, t, dt) {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, rgba(mix(s.base, [0, 0, 0], 0.3), 1)); bg.addColorStop(1, rgba(mix(s.base, s.colors[2] || s.colors[0], 0.35), 1));
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // city-light glow behind the glass
      for (let i = 0; i < 3; i++) {
        const gx = w * (0.2 + i * 0.3) - s.px * w * 0.02, gy = h * (0.75 + 0.05 * Math.sin(i * 2));
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, h * 0.5);
        g.addColorStop(0, rgba(s.colors[i % 2], 0.16 * (0.6 + s.intensity * 0.5))); g.addColorStop(1, rgba(s.colors[i % 2], 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      if (Math.random() < 0.0006 * s.intensity) s.flash = 1; // a distant flash now and then
      if (s.flash > 0.01) { ctx.fillStyle = `rgba(200,210,230,${s.flash * 0.12})`; ctx.fillRect(0, 0, w, h); s.flash *= 0.9; }
      ctx.lineCap = 'round';
      const wind = 0.18 + s.px * 0.1;
      for (const r of s.streaks) {
        const v = dt * (0.9 + r.z * 1.4) * s.speed;
        r.y += v; r.x += v * wind;
        if (r.y > h) { r.y = -20; r.x = Math.random() * w * 1.2 - w * 0.1; }
        ctx.strokeStyle = `rgba(200,212,230,${0.06 + r.z * 0.16})`; ctx.lineWidth = r.z * 1.3;
        ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - wind * 18 * r.z, r.y - 18 * r.z); ctx.stroke();
      }
      for (const d of s.drops) { // drops on the glass: still, then slide when they get heavy
        if (Math.random() < 0.002) d.v = 0.05 + Math.random() * 0.15;
        d.y += d.v * dt * s.speed; d.v *= 0.995;
        if (d.y > h + 10) { d.y = -10; d.x = Math.random() * w; d.v = 0; }
        const g = ctx.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(160,175,195,0.05)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.85, d.r, 0, 0, 6.2832); ctx.fill();
        if (d.v > 0.04) { ctx.strokeStyle = 'rgba(200,210,225,0.08)'; ctx.lineWidth = d.r * 0.6; ctx.beginPath(); ctx.moveTo(d.x, d.y - d.r); ctx.lineTo(d.x, d.y - d.r - 30); ctx.stroke(); }
      }
    },
  },
};
export const SCENE_NAMES = { aurora: 'Aurora', particles: 'Particles', waves: 'Waves', starfield: 'Starfield', bokeh: 'Bokeh', rain: 'Rain', visualizer: 'Visualizer' };

export function createScene(canvas, opts) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const s = { px: 0, py: 0, tx: 0, ty: 0 };
  let scene, raf = 0, last = 0, t = 0, paused = false, w = 0, h = 0;
  function configure(o) {
    Object.assign(s, { baseSpeed: o.speed ?? 1, baseIntensity: o.intensity ?? 0.8, parallax: o.parallax !== false, fps: o.fps || 60, levels: o.levels || null });
    s.speed = s.baseSpeed; s.intensity = s.baseIntensity;
    s.colors = (o.colors?.length ? o.colors : ['#5e7d9c', '#a7afb8', '#2b3a4d']).map(hexToRgb);
    s.base = mix([10, 12, 16], s.colors[2] || s.colors[0], 0.18);
    const next = SCENES[o.scene] || SCENES.aurora;
    if (next !== scene) { scene = next; resize(true); } else if (o.reinit) scene.init(s, w, h);
  }
  function resize(reinit) {
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scene.scale;
    // never draw more than about Full HD: on big / high-DPI screens the browser scales it up, at a fraction of the GPU work
    const px = canvas.clientWidth * canvas.clientHeight * dpr * dpr, MAX_PX = 1920 * 1080 * scene.scale * scene.scale;
    if (px > MAX_PX) dpr *= Math.sqrt(MAX_PX / px);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr)), ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (cw !== canvas.width || ch !== canvas.height || reinit) { canvas.width = cw; canvas.height = ch; w = cw; h = ch; scene.init(s, w, h); }
    canvas.style.filter = scene.scale < 1 ? `blur(${Math.round(8 / scene.scale)}px)` : '';
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const minGap = 1000 / s.fps;
    if (now - last < minGap - 1) return;
    const dt = Math.min(64, now - (last || now)); last = now;
    t += (dt / 1000) * s.speed;
    // ease toward the mouse so parallax glides instead of jumping
    s.px += ((s.parallax ? s.tx : 0) - s.px) * 0.05; s.py += ((s.parallax ? s.ty : 0) - s.py) * 0.05;
    // music makes every scene pulse: louder bass, brighter and a little faster
    s.audio = s.levels ? s.levels() : null;
    if (s.audio) { s.intensity = Math.min(1, s.baseIntensity * (0.75 + s.audio.bass * 0.9)); s.speed = s.baseSpeed * (1 + s.audio.level * 1.2); t += (dt / 1000) * s.baseSpeed * s.audio.level; }
    scene.draw(s, ctx, w, h, t, dt);
  }
  const ro = new ResizeObserver(() => resize(false)); ro.observe(canvas);
  configure(opts);
  const start = () => { if (!raf && !paused) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  start();
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  return {
    set: configure,
    pause(p) { paused = p; p ? stop() : start(); },
    pointer(x, y) { s.tx = x - 0.5; s.ty = y - 0.5; },
    destroy() { stop(); ro.disconnect(); },
  };
}

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
};
export const SCENE_NAMES = { aurora: 'Aurora', particles: 'Particles', waves: 'Waves', starfield: 'Starfield' };

export function createScene(canvas, opts) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const s = { px: 0, py: 0, tx: 0, ty: 0 };
  let scene, raf = 0, last = 0, t = 0, paused = false, w = 0, h = 0;
  function configure(o) {
    Object.assign(s, { speed: o.speed ?? 1, intensity: o.intensity ?? 0.8, parallax: o.parallax !== false, fps: o.fps || 60 });
    s.colors = (o.colors?.length ? o.colors : ['#5e7d9c', '#a7afb8', '#2b3a4d']).map(hexToRgb);
    s.base = mix([10, 12, 16], s.colors[2] || s.colors[0], 0.18);
    const next = SCENES[o.scene] || SCENES.aurora;
    if (next !== scene) { scene = next; resize(true); } else if (o.reinit) scene.init(s, w, h);
  }
  function resize(reinit) {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * scene.scale;
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

(() => {
  if (customElements.get('koi-pond')) return;
  const TAU = Math.PI * 2, P = 4;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rgba(hex, a) {
    let h = String(hex || '#E7573E').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function curve(ctx, pts, move) {
    if (move) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    const l = pts[pts.length - 1]; ctx.lineTo(l[0], l[1]);
  }
  function profile(s) {
    if (s < 0.26) { const q = (0.26 - s) / 0.26; return Math.sqrt(Math.max(0, 1 - q * q)); }
    return 1 - Math.pow((s - 0.26) / 0.74, 1.35) * 0.86;
  }
  function follow(pts, seg) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      b[0] = a[0] + (dx / d) * seg; b[1] = a[1] + (dy / d) * seg;
    }
  }
  function fin(ctx, Pt, f, nn, side, len, wid, ang, soft, line) {
    const ox = nn[0] * side, oy = nn[1] * side, ca = Math.cos(ang), sa = Math.sin(ang);
    const dx = -f[0] * ca + ox * sa, dy = -f[1] * ca + oy * sa;
    let px = -dy, py = dx; if (px * f[0] + py * f[1] < 0) { px = -px; py = -py; }
    const b1x = Pt[0] + f[0] * wid * 0.45, b1y = Pt[1] + f[1] * wid * 0.45;
    const b2x = Pt[0] - f[0] * wid * 0.45, b2y = Pt[1] - f[1] * wid * 0.45;
    const tx = Pt[0] + dx * len, ty = Pt[1] + dy * len;
    ctx.beginPath();
    ctx.moveTo(b1x, b1y);
    ctx.bezierCurveTo(b1x + dx * len * 0.45 + px * wid * 0.9, b1y + dy * len * 0.45 + py * wid * 0.9, tx + px * wid * 0.55, ty + py * wid * 0.55, tx, ty);
    ctx.quadraticCurveTo(Pt[0] + dx * len * 0.6 - px * wid * 0.3, Pt[1] + dy * len * 0.6 - py * wid * 0.3, b2x, b2y);
    ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
    ctx.beginPath();
    for (let r = 1; r <= 3; r++) {
      const q = r / 4 - 0.5;
      ctx.moveTo(Pt[0] + dx * len * 0.15, Pt[1] + dy * len * 0.15);
      ctx.lineTo(Pt[0] + dx * len * 0.8 + px * wid * q * 1.3, Pt[1] + dy * len * 0.8 + py * wid * q * 1.3);
    }
    ctx.strokeStyle = soft; ctx.stroke();
  }

  class Fish {
    constructor(o) {
      Object.assign(this, o);
      this.N = 15; this.M = 8;
      this.seg = this.L / (this.N - 1);
      this.tseg = (this.L * 0.72) / (this.M - 1);
      const cx = Math.cos(this.h), cy = Math.sin(this.h);
      this.sp = []; this.tp = [];
      for (let i = 0; i < this.N; i++) this.sp.push([this.x - cx * this.seg * i, this.y - cy * this.seg * i]);
      const e = this.sp[this.N - 1];
      for (let j = 0; j < this.M; j++) this.tp.push([e[0] - cx * this.tseg * j, e[1] - cy * this.tseg * j]);
      this.phase = this.seed * 13; this.flee = 0;
      this.nextFlip = 16 + this.rnd() * 30; this.nextBubble = 3 + this.rnd() * 9;
    }
    update(dt, t, w) {
      const fld = w.field(this.x, this.y);
      let dx = -fld.gy * this.dir, dy = fld.gx * this.dir;
      const tgt = this.target + 0.07 * Math.sin(t * 0.05 + this.seed);
      const k = clamp((tgt - fld.r) * 5, -1.6, 1.6);
      dx += fld.gx * k; dy += fld.gy * k;
      const wa = Math.atan2(dy, dx) + 0.7 * Math.sin(t * 0.13 + this.seed * 7) + 0.35 * Math.sin(t * 0.31 + this.seed * 3.1);
      dx = Math.cos(wa); dy = Math.sin(wa);
      for (const o of w.fish) {
        if (o === this) continue;
        const ex = this.x - o.x, ey = this.y - o.y, d = Math.hypot(ex, ey) || 1, R = (this.L + o.L) * 0.6;
        if (d < R) { const f = (1 - d / R) * 1.4; dx += (ex / d) * f; dy += (ey / d) * f; }
      }
      const m = w.mouse;
      if (t < m.until) {
        const ex = this.x - m.x, ey = this.y - m.y, d = Math.hypot(ex, ey) || 1, R = Math.max(130, this.L * 1.6);
        if (d < R) { const f = 1 - d / R; dx += (ex / d) * f * 3; dy += (ey / d) * f * 3; this.flee = Math.max(this.flee, f); }
      }
      if (t > this.nextFlip) { this.dir *= -1; this.nextFlip = t + 20 + this.rnd() * 30; }
      const speed = this.base * (1 + 0.3 * Math.sin(t * 0.27 + this.seed * 5)) * (1 + this.flee * 2.2);
      let diff = Math.atan2(dy, dx) - this.h; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const maxTurn = (speed / (this.L * 0.55)) * dt;
      this.h += clamp(diff, -maxTurn, maxTurn);
      this.flee = Math.max(0, this.flee - dt * 0.5);
      this.x += Math.cos(this.h) * speed * dt; this.y += Math.sin(this.h) * speed * dt;
      this.phase += dt * 3.0 * Math.pow(speed / this.base, 0.8);
      this.sp[0][0] = this.x; this.sp[0][1] = this.y;
      follow(this.sp, this.seg);
      const e = this.sp[this.N - 1]; this.tp[0][0] = e[0]; this.tp[0][1] = e[1];
      follow(this.tp, this.tseg);
      if (t > this.nextBubble) {
        this.nextBubble = t + 7 + this.rnd() * 12;
        const n = 2 + ((this.rnd() * 3) | 0);
        for (let i = 0; i < n; i++) w.bubbles.push({ x: this.x + Math.cos(this.h) * this.L * 0.06 + (this.rnd() - 0.5) * 8, y: this.y + Math.sin(this.h) * this.L * 0.06 + (this.rnd() - 0.5) * 8, r: 1.4 + this.rnd() * 2.6, t0: t + i * 0.35, life: 2.6 + this.rnd() * 1.6, vx: (this.rnd() - 0.5) * 4, vy: (this.rnd() - 0.5) * 4 });
        if (this.rnd() < 0.5) w.ripples.push({ x: this.x, y: this.y, t0: t, life: 4.5, maxR: this.L * 0.5, rings: 2 });
      }
    }
    draw(ctx, line, soft, bg) {
      const N = this.N, M = this.M, L = this.L, A = L * 0.07, ph = this.phase;
      const raw = this.sp.concat(this.tp.slice(1)), K = raw.length;
      const sv = new Array(K), D = new Array(K), T = new Array(K), Nn = new Array(K);
      for (let k = 0; k < K; k++) {
        sv[k] = k < N ? k / (N - 1) : 1 + ((k - N + 1) / (M - 1)) * 0.6;
        const a = raw[Math.max(0, k - 1)], b = raw[Math.min(K - 1, k + 1)];
        let tx = a[0] - b[0], ty = a[1] - b[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const s = sv[k], off = A * Math.pow(s, 1.6) * Math.sin(ph - s * 3.4);
        D[k] = [raw[k][0] - ty * off, raw[k][1] + tx * off];
      }
      for (let k = 0; k < K; k++) {
        const a = D[Math.max(0, k - 1)], b = D[Math.min(K - 1, k + 1)];
        let tx = a[0] - b[0], ty = a[1] - b[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        T[k] = [tx, ty]; Nn[k] = [-ty, tx];
      }
      const w = new Array(N);
      for (let i = 0; i < N; i++) w[i] = L * 0.125 * profile(sv[i]);
      ctx.lineWidth = this.lw; ctx.fillStyle = bg;
      const edge = (k, side, f) => [D[k][0] + Nn[k][0] * w[k] * f * side, D[k][1] + Nn[k][1] * w[k] * f * side];
      const kp = Math.round((N - 1) * 0.24), kv = Math.round((N - 1) * 0.52);
      for (const side of [1, -1]) {
        fin(ctx, edge(kv, side, 0.8), T[kv], Nn[kv], side, L * 0.13, L * 0.05, 0.78 + 0.12 * Math.sin(ph * 0.5 + side), soft, line);
        fin(ctx, edge(kp, side, 0.85), T[kp], Nn[kp], side, L * 0.25, L * 0.085, 1.0 + 0.22 * Math.sin(ph * 0.45 + side * 1.6), soft, line);
      }
      const b = N - 1, pedW = w[b], spread = L * 0.25, twL = [], twR = [], left = [], right = [];
      for (let j = 0; j < M; j++) {
        const k = b + j, base = pedW + (spread - pedW) * Math.pow(j / (M - 1), 0.85);
        twL[j] = base * (1 + 0.14 * Math.sin(ph * 0.9 - j * 0.6));
        twR[j] = base * (1 + 0.14 * Math.sin(ph * 0.9 - j * 0.6 + 1.7));
        left.push([D[k][0] + Nn[k][0] * twL[j], D[k][1] + Nn[k][1] * twL[j]]);
        right.push([D[k][0] - Nn[k][0] * twR[j], D[k][1] - Nn[k][1] * twR[j]]);
      }
      const jn = Math.round((M - 1) * 0.55), kn = b + jn, jc = Math.min(M - 1, jn + 1), kc = b + jc;
      ctx.beginPath();
      curve(ctx, left, true);
      ctx.quadraticCurveTo(D[kc][0] + Nn[kc][0] * twL[jc] * 0.3, D[kc][1] + Nn[kc][1] * twL[jc] * 0.3, D[kn][0], D[kn][1]);
      ctx.quadraticCurveTo(D[kc][0] - Nn[kc][0] * twR[jc] * 0.3, D[kc][1] - Nn[kc][1] * twR[jc] * 0.3, right[M - 1][0], right[M - 1][1]);
      curve(ctx, right.slice().reverse(), false);
      ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
      ctx.beginPath();
      for (const f of [-0.78, -0.5, -0.22, 0.22, 0.5, 0.78]) {
        const end = Math.min(M - 1, Math.round(jn + (M - 1 - jn) * Math.abs(f) * 1.05)), tw = f < 0 ? twR : twL, pts = [];
        for (let j = 1; j <= end; j++) { const k = b + j, q = j === end ? 0.9 : 1; pts.push([D[k][0] + Nn[k][0] * tw[j] * f * q, D[k][1] + Nn[k][1] * tw[j] * f * q]); }
        if (pts.length > 1) curve(ctx, pts, true);
      }
      ctx.strokeStyle = soft; ctx.stroke();
      const Lp = [], Rp = [];
      for (let i = 1; i < N; i++) { Lp.push(edge(i, 1, 1)); Rp.push(edge(i, -1, 1)); }
      const outline = Lp.slice().reverse().concat([[D[0][0] + T[0][0] * L * 0.012, D[0][1] + T[0][1] * L * 0.012]], Rp);
      ctx.beginPath(); curve(ctx, outline, true); ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
      ctx.beginPath();
      const d0 = Math.round((N - 1) * 0.32), d1 = Math.round((N - 1) * 0.74);
      curve(ctx, D.slice(d0, d1 + 1), true);
      const kh = 3, eh = w[kh] * 0.94;
      ctx.moveTo(D[kh][0] + Nn[kh][0] * eh, D[kh][1] + Nn[kh][1] * eh);
      ctx.quadraticCurveTo(D[kh][0] + T[kh][0] * w[kh] * 0.8, D[kh][1] + T[kh][1] * w[kh] * 0.8, D[kh][0] - Nn[kh][0] * eh, D[kh][1] - Nn[kh][1] * eh);
      for (const side of [1, -1]) {
        const sx = D[1][0] + Nn[1][0] * w[1] * 0.5 * side, sy = D[1][1] + Nn[1][1] * w[1] * 0.5 * side;
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + T[0][0] * L * 0.05 + Nn[0][0] * side * L * 0.02, sy + T[0][1] * L * 0.05 + Nn[0][1] * side * L * 0.02, sx + T[0][0] * L * 0.035 + Nn[0][0] * side * L * 0.06, sy + T[0][1] * L * 0.035 + Nn[0][1] * side * L * 0.06);
      }
      ctx.strokeStyle = soft; ctx.stroke();
      ctx.fillStyle = line;
      const er = Math.max(1, L * 0.014);
      for (const side of [1, -1]) {
        const p = edge(1, side, 0.6);
        ctx.beginPath(); ctx.arc(p[0], p[1], er, 0, TAU); ctx.fill();
      }
    }
  }

  const PADS = [
    [0.035, 0.17, 0.125, 0.6], [0.135, 0.035, 0.085, 0], [-0.005, 0.41, 0.07, 0], [0.11, 0.28, 0.045, 0],
    [0.965, 0.22, 0.11, 0.5], [0.875, 0.055, 0.072, 0], [1.012, 0.035, 0.09, 0], [0.935, 0.42, 0.048, 0],
    [0.05, 0.86, 0.12, 0], [0.175, 0.995, 0.085, 0], [-0.01, 0.64, 0.065, 0],
    [0.93, 0.86, 0.125, 0.62], [0.81, 1.0, 0.08, 0], [1.0, 0.64, 0.07, 0], [0.84, 0.75, 0.042, 0],
  ];

  class KoiPond extends HTMLElement {
    connectedCallback() {
      if (this._c) return;
      this.style.display = 'block';
      if (!this.style.position) this.style.position = 'relative';
      if (!this.style.width) this.style.width = '100%';
      if (!this.style.height) this.style.height = '100%';
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      this.appendChild(c); this._c = c; this._ctx = c.getContext('2d');
      this._t = 0; this._ripples = []; this._bubbles = []; this._nextRipple = 2;
      this._mouse = { x: -999, y: -999, until: -1, lx: -999, ly: -999, lt: -9 };
      this._rnd = mulberry(20261023);
      this._reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._vis = true;
      this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this);
      this._io = new IntersectionObserver((e) => { this._vis = e[0].isIntersecting; }, { rootMargin: '80px' }); this._io.observe(this);
      this._onPtr = (e) => this._pointer(e);
      window.addEventListener('pointermove', this._onPtr, { passive: true });
      window.addEventListener('pointerdown', this._onPtr, { passive: true });
      this._resize();
      this._last = performance.now();
      const loop = (now) => {
        this._raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
        if (!this._vis || document.hidden || this._reduce || !this._W) return;
        if (this._fishCount() !== this._fish.length) this._spawnFish();
        this._t += dt; this._step(dt); this._draw();
      };
      this._raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      this._ro && this._ro.disconnect(); this._io && this._io.disconnect();
      window.removeEventListener('pointermove', this._onPtr); window.removeEventListener('pointerdown', this._onPtr);
      if (this._c) this._c.remove(); this._c = null;
    }
    _fishCount() { const a = clamp(parseInt(this.getAttribute('fish'), 10) || 5, 1, 12); return this._W < 700 ? Math.max(2, Math.round(a * 0.6)) : a; }
    field(x, y) {
      const hw = this._W / 2, hh = this._H / 2, u = (x - hw) / hw, v = (y - hh) / hh;
      const au = Math.abs(u) + 1e-4, av = Math.abs(v) + 1e-4;
      const r = Math.pow(Math.pow(au, P) + Math.pow(av, P), 1 / P);
      let gx = (Math.sign(u) * Math.pow(au, P - 1)) / hw, gy = (Math.sign(v) * Math.pow(av, P - 1)) / hh;
      const gl = Math.hypot(gx, gy) || 1;
      return { r, gx: gx / gl, gy: gy / gl };
    }
    ring(phi, r) {
      const c = Math.cos(phi), s = Math.sin(phi), hw = this._W / 2, hh = this._H / 2;
      return [hw + r * Math.sign(c) * Math.pow(Math.abs(c), 2 / P) * hw, hh + r * Math.sign(s) * Math.pow(Math.abs(s), 2 / P) * hh];
    }
    _resize() {
      if (!this._c) return;
      const rc = this.getBoundingClientRect(), W = Math.max(1, rc.width), H = Math.max(1, rc.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this._W = W; this._H = H; this._dpr = dpr;
      this._c.width = Math.round(W * dpr); this._c.height = Math.round(H * dpr);
      const prev = this._S; this._S = Math.sqrt(W * H) * 0.75;
      this._layout();
      if (!this._fish || !prev || Math.abs(this._S - prev) / prev > 0.2) this._spawnFish();
      this._draw();
    }
    _layout() {
      const W = this._W, H = this._H, S = this._S;
      this._pads = PADS.map(([fx, fy, fr, lo], i) => {
        const r = mulberry(101 + i * 7), R = fr * S, la = r() * TAU;
        return { x: fx * W, y: fy * H, R, rot: r() * TAU, notch: 0.3 + r() * 0.12, veins: 13 + ((r() * 5) | 0), seed: r() * 100,
          lotus: lo ? { dx: Math.cos(la) * R * 0.22, dy: Math.sin(la) * R * 0.22, R: R * lo, rot: r() * TAU } : null };
      });
      this._weeds = [
        { x: 0.115 * W, y: H + 0.02 * S, ang: -1.28, len: 0.34 * S, curv: 0.012, seed: 3 },
        { x: W + 0.02 * S, y: 0.58 * H, ang: Math.PI + 0.22, len: 0.26 * S, curv: -0.012, seed: 7 },
      ];
      const r = mulberry(55); this._currents = [];
      for (let i = 0; i < 9; i++) {
        const phi = (i / 9) * TAU + r() * 0.5, rr = 0.8 + r() * 0.2, p = this.ring(phi, rr), f = this.field(p[0], p[1]);
        const tx = -f.gy, ty = f.gx, len = (0.1 + r() * 0.12) * S, bend = (r() - 0.5) * 0.09 * S;
        this._currents.push({ ax: p[0] - tx * len / 2, ay: p[1] - ty * len / 2, bx: p[0] + tx * len / 2, by: p[1] + ty * len / 2, cx: p[0] + f.gx * bend, cy: p[1] + f.gy * bend, nx: f.gx, ny: f.gy, dir: r() < 0.5 ? 1 : -1, seed: r() * 100 });
      }
    }
    _spawnFish() {
      const n = this._fishCount(), S = this._S, rnd = mulberry(7 + n);
      const sizes = [0.15, 0.125, 0.135, 0.105, 0.115, 0.095, 0.12, 0.1, 0.11, 0.13, 0.09, 0.14];
      this._fish = [];
      for (let i = 0; i < n; i++) {
        const phi = (i / n) * TAU + rnd() * 0.6, target = 0.78 + rnd() * 0.26, p = this.ring(phi, target), f = this.field(p[0], p[1]);
        const dir = i % 2 ? 1 : -1, L = clamp(S * sizes[i % sizes.length], 46, 165), depth = rnd();
        this._fish.push(new Fish({ x: p[0], y: p[1], h: Math.atan2(f.gx * dir, -f.gy * dir), L, seed: rnd() * 100, dir, target, depth, rnd: this._rnd, base: L * (0.22 + rnd() * 0.1), lw: depth > 0.45 ? 0.85 : 0.7, accent: i === 0 }));
      }
      this._fish.sort((a, b) => a.depth - b.depth);
    }
    _pointer(e) {
      if (!this._c || this._reduce) return;
      const rc = this.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      if (x < 0 || y < 0 || x > rc.width || y > rc.height) return;
      const m = this._mouse, t = this._t;
      m.x = x; m.y = y; m.until = t + 0.9;
      if (e.type === 'pointerdown' || (Math.hypot(x - m.lx, y - m.ly) > 70 && t - m.lt > 0.5)) {
        this._ripples.push({ x, y, t0: t, life: 3.2, maxR: this._S * 0.05, rings: 2 });
        m.lx = x; m.ly = y; m.lt = t;
      }
    }
    _step(dt) {
      const t = this._t;
      const w = { field: (x, y) => this.field(x, y), mouse: this._mouse, fish: this._fish, bubbles: this._bubbles, ripples: this._ripples };
      for (const f of this._fish) f.update(dt, t, w);
      if (t > this._nextRipple) {
        this._nextRipple = t + 3 + this._rnd() * 4;
        const p = this.ring(this._rnd() * TAU, 0.75 + this._rnd() * 0.25);
        this._ripples.push({ x: p[0], y: p[1], t0: t, life: 5.5, maxR: this._S * (0.05 + this._rnd() * 0.05), rings: 3 });
      }
      for (const b of this._bubbles) { b.x += b.vx * dt; b.y += b.vy * dt; }
      this._ripples = this._ripples.filter((r) => t - r.t0 < r.life);
      this._bubbles = this._bubbles.filter((b) => t - b.t0 < b.life);
    }
    _draw() {
      const ctx = this._ctx; if (!ctx || !this._W) return;
      const W = this._W, H = this._H, t = this._t, d = this._dpr;
      const ink = this.getAttribute('ink') || '#E7573E', bg = this.getAttribute('bg') || '#161617';
      const a = clamp(parseFloat(this.getAttribute('alpha')) || 0.5, 0.05, 1);
      ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = 0.7; ctx.setLineDash([1, 8]);
      for (const c of this._currents) {
        const fade = 0.5 + 0.5 * Math.sin(t * 0.12 + c.seed);
        ctx.strokeStyle = rgba(ink, a * 0.4 * fade); ctx.lineDashOffset = -t * 7 * c.dir;
        ctx.beginPath();
        for (let k = 0; k < 2; k++) {
          const o = k * 7, sh = k * 0.18;
          ctx.moveTo(c.ax + c.nx * o + (c.bx - c.ax) * sh, c.ay + c.ny * o + (c.by - c.ay) * sh);
          ctx.quadraticCurveTo(c.cx + c.nx * o, c.cy + c.ny * o, c.bx + c.nx * o, c.by + c.ny * o);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const wd of this._weeds) this._weed(ctx, wd, t, rgba(ink, a * 0.6), rgba(ink, a * 0.35), bg);
      const acc = this.getAttribute('accent');
      for (const f of this._fish) {
        const isA = f.accent && acc, fi = isA ? acc : ink, aa = parseFloat(this.getAttribute('accentalpha') || this.getAttribute('accent-alpha'));
        if (isA && (this.getAttribute('accentfill') || this.getAttribute('accent-fill')) === 'on') f.draw(ctx, rgba(ink, aa || 0.9), rgba(ink, (aa || 0.9) * 0.45), acc);
        else if (isA && aa) f.draw(ctx, rgba(fi, aa), rgba(fi, aa * 0.6), bg);
        else { const fa = isA ? Math.min(1, a * 1.8) : a; f.draw(ctx, rgba(fi, fa * (0.62 + 0.38 * f.depth)), rgba(fi, fa * (0.32 + 0.2 * f.depth)), bg); }
      }
      ctx.lineWidth = 0.7;
      for (const r of this._ripples) {
        const age = t - r.t0;
        for (let i = 0; i < r.rings; i++) {
          const e = clamp((age - i * 0.55) / (r.life - 1.2), 0, 1); if (e <= 0 || e >= 1) continue;
          const rad = r.maxR * (0.12 + 0.88 * (1 - Math.pow(1 - e, 2.2)));
          ctx.strokeStyle = rgba(ink, a * 0.55 * Math.pow(1 - e, 1.6) * (i ? 0.7 : 1));
          ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
        }
      }
      for (const b of this._bubbles) {
        const age = t - b.t0; if (age < 0) continue;
        const e = age / b.life, fa = Math.min(1, e * 6) * Math.pow(1 - e, 1.2);
        ctx.strokeStyle = rgba(ink, a * 0.7 * fa);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1 + e * 0.4), 0, TAU); ctx.stroke();
      }
      const padLine = rgba(ink, a * 0.78), padSoft = rgba(ink, a * 0.4);
      for (const p of this._pads) this._pad(ctx, p, t, padLine, padSoft, bg);
      for (const p of this._pads) if (p.lotus) this._lotus(ctx, p, t, rgba(ink, a * 0.85), rgba(ink, a * 0.42), bg);
    }
    _padPos(p, t) { return [p.x + 2 * Math.sin(t * 0.09 + p.seed), p.y + 2 * Math.cos(t * 0.07 + p.seed * 1.3), p.rot + 0.05 * Math.sin(t * 0.05 + p.seed)]; }
    _pad(ctx, p, t, line, soft, bg) {
      const [x, y, rot] = this._padPos(p, t), R = p.R, a0 = rot + p.notch / 2, a1 = rot + TAU - p.notch / 2, steps = 72;
      const rad = (th) => R * (1 + 0.02 * Math.sin(3 * th + p.seed) + 0.012 * Math.sin(7 * th + p.seed * 2));
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(rot) * R * 0.05, y + Math.sin(rot) * R * 0.05);
      for (let i = 0; i <= steps; i++) { const th = a0 + ((a1 - a0) * i) / steps, r = rad(th); ctx.lineTo(x + Math.cos(th) * r, y + Math.sin(th) * r); }
      ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < p.veins; k++) {
        const th = a0 + ((a1 - a0) * (k + 0.5)) / p.veins, r = rad(th) * 0.9, bend = 0.04 * Math.sin(k * 1.7 + p.seed);
        ctx.moveTo(x + Math.cos(th) * R * 0.06, y + Math.sin(th) * R * 0.06);
        ctx.quadraticCurveTo(x + Math.cos(th + bend) * r * 0.55, y + Math.sin(th + bend) * r * 0.55, x + Math.cos(th) * r, y + Math.sin(th) * r);
      }
      ctx.strokeStyle = soft; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, R * 0.035), 0, TAU); ctx.strokeStyle = line; ctx.stroke();
    }
    _lotus(ctx, p, t, line, soft, bg) {
      const [px, py, prot] = this._padPos(p, t), lo = p.lotus, x = px + lo.dx, y = py + lo.dy, R = lo.R;
      const rot = lo.rot + (prot - p.rot) * 0.6 + 0.03 * Math.sin(t * 0.09 + p.seed), br = 1 + 0.018 * Math.sin(t * 0.4 + p.seed);
      const layers = [[8, 1.0, 0.36, 0], [8, 0.8, 0.36, TAU / 16], [7, 0.6, 0.38, 0.3], [5, 0.38, 0.44, 0.9]];
      ctx.lineWidth = 0.75; ctx.fillStyle = bg;
      for (const [n, len, wid, off] of layers) {
        for (let k = 0; k < n; k++) {
          const th = rot + off + (k * TAU) / n + 0.02 * Math.sin(t * 0.3 + k), c = Math.cos(th), s = Math.sin(th);
          const l = len * R * br, wd = wid * l, bx = x + c * R * 0.04, by = y + s * R * 0.04, tx = x + c * l, ty = y + s * l;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.bezierCurveTo(bx + c * l * 0.25 - s * wd * 0.8, by + s * l * 0.25 + c * wd * 0.8, bx + c * l * 0.78 - s * wd * 0.7, by + s * l * 0.78 + c * wd * 0.7, tx, ty);
          ctx.bezierCurveTo(bx + c * l * 0.78 + s * wd * 0.7, by + s * l * 0.78 - c * wd * 0.7, bx + c * l * 0.25 + s * wd * 0.8, by + s * l * 0.25 - c * wd * 0.8, bx, by);
          ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
          if (len > 0.7) { ctx.beginPath(); ctx.moveTo(x + c * l * 0.35, y + s * l * 0.35); ctx.lineTo(x + c * l * 0.85, y + s * l * 0.85); ctx.strokeStyle = soft; ctx.stroke(); }
        }
      }
      ctx.beginPath(); ctx.arc(x, y, R * 0.13, 0, TAU); ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
      ctx.fillStyle = line;
      for (let k = 0; k < 7; k++) { const th = rot + (k * TAU) / 7; ctx.beginPath(); ctx.arc(x + Math.cos(th) * R * 0.075, y + Math.sin(th) * R * 0.075, 0.9, 0, TAU); ctx.fill(); }
    }
    _weed(ctx, wd, t, line, soft, bg) {
      const K = 22, step = wd.len / K, pts = [[wd.x, wd.y]], ths = [wd.ang];
      let x = wd.x, y = wd.y;
      for (let k = 1; k <= K; k++) {
        const f = k / K, th = wd.ang + wd.curv * k + 0.2 * f * f * Math.sin(t * 0.45 + wd.seed - f * 2.2);
        x += Math.cos(th) * step; y += Math.sin(th) * step; pts.push([x, y]); ths.push(th);
      }
      ctx.lineWidth = 0.7; ctx.fillStyle = bg;
      for (let k = 2; k <= K; k += 2) {
        const f = k / K, ll = wd.len * 0.11 * (1 - f * 0.55), lw = ll * 0.2;
        for (const side of [1, -1]) {
          const la = ths[k] + side * (0.62 + 0.06 * Math.sin(t * 0.6 + k + wd.seed)), c = Math.cos(la), s = Math.sin(la);
          const bx = pts[k][0], by = pts[k][1], tx = bx + c * ll, ty = by + s * ll, mx = bx + c * ll * 0.5, my = by + s * ll * 0.5;
          ctx.beginPath(); ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(mx - s * lw, my + c * lw, tx, ty);
          ctx.quadraticCurveTo(mx + s * lw, my - c * lw, bx, by);
          ctx.fill(); ctx.strokeStyle = line; ctx.stroke();
        }
      }
      ctx.beginPath(); curve(ctx, pts, true); ctx.strokeStyle = line; ctx.stroke();
    }
  }
  customElements.define('koi-pond', KoiPond);
})();

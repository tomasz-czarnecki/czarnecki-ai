// <tri-strands> — animated bundles of spline strands linking three nodes.
// Now and then one inner strand bends toward the centre and springs back; now and then a spark runs a strand from box to box.
// attrs: ink, strands (per edge), nodes ("x,y;x,y;x,y" 0..1), center ("x,y" 0..1), center-r (fraction of min side), alpha, width
(() => {
  if (customElements.get('tri-strands')) return;
  const hexA = (c, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
    if (!m) return c;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  };
  const ease = (x) => x * x * (3 - 2 * x);
  const bendEnv = (u) => {
    if (u < 0.38) return ease(u / 0.38);
    if (u < 0.58) return 1;
    const r = (u - 0.58) / 0.42;
    return Math.exp(-3.2 * r) * Math.cos(r * Math.PI * 2.5) * (1 - r);
  };
  const bz = (p, e, k) => { const m = 1 - e; return m * m * m * p[0][k] + 3 * m * m * e * p[1][k] + 3 * m * e * e * p[2][k] + e * e * e * p[3][k]; };
  class TriStrands extends HTMLElement {
    connectedCallback() {
      this.style.cssText += ';display:block;position:absolute;inset:0;width:100%;height:100%;';
      if (this.parentElement && getComputedStyle(this.parentElement).position === 'static') this.parentElement.style.position = 'relative';
      if (this.parentElement) { this.parentElement.style.width = this.parentElement.style.width || '100%'; this.parentElement.style.height = this.parentElement.style.height || '100%'; }
      if (!this.cv) {
        this.cv = document.createElement('canvas');
        this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
        this.appendChild(this.cv);
      }
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.vis = true; this.bends = []; this.runs = [];
      this.ro = new ResizeObserver(() => this.size()); this.ro.observe(this);
      this.io = new IntersectionObserver((e) => { this.vis = e[0].isIntersecting; if (this.vis) this.kick(); }, { rootMargin: '100px' });
      this.io.observe(this);
      this.size(); this.kick();
      requestAnimationFrame(() => this.size()); setTimeout(() => this.size(), 300);
    }
    disconnectedCallback() { this.ro && this.ro.disconnect(); this.io && this.io.disconnect(); cancelAnimationFrame(this.raf); this.raf = 0; }
    size() {
      const r = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      this.w = r.width; this.h = r.height; this.dpr = d;
      this.cv.width = Math.max(1, Math.round(r.width * d)); this.cv.height = Math.max(1, Math.round(r.height * d));
      if (this.reduce) this.draw(0);
    }
    kick() { if (this.reduce) { this.size(); return; } if (!this.raf) this.raf = requestAnimationFrame((t) => this.loop(t)); }
    loop(t) {
      this.raf = 0;
      if (!this.vis || !this.isConnected) return;
      if (!document.hidden) {
        const r = this.getBoundingClientRect();
        if (!this.w || !this.h || Math.abs(r.width - this.w) > 0.5 || Math.abs(r.height - this.h) > 0.5) this.size();
        this.draw(t / 1000);
      }
      this.raf = requestAnimationFrame((tt) => this.loop(tt));
    }
    pt(attr, def) { return (this.getAttribute(attr) || def).split(',').map(Number); }
    draw(t) {
      const c = this.cv.getContext('2d'), d = this.dpr, W = this.w, H = this.h;
      if (!W || !H) return;
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
      const ink = this.getAttribute('ink') || '#E7573E', N = Math.max(1, +this.getAttribute('strands') || 7);
      const A0 = +this.getAttribute('alpha') || 0.6, LW = +this.getAttribute('width') || 1.2;
      const P = (this.getAttribute('nodes') || '0.5,0.14;0.17,0.86;0.83,0.86').split(';').map((p) => p.split(',').map(Number)).map(([x, y]) => [x * W, y * H]);
      const cc = this.pt('center', '0.5,0.6'), C = [cc[0] * W, cc[1] * H], R0 = Math.min(W, H) * (+this.getAttribute('center-r') || 0.1);
      const cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3;
      const edges = [[0, 1], [1, 2], [2, 0]], all = [];
      const onlyA = this.getAttribute('only'), only = onlyA ? onlyA.split(',').map(Number) : [0, 1, 2], pickE = () => only[Math.random() * only.length | 0];

      // schedule: an occasional bend toward the centre, an occasional spark along a strand
      if (!this.reduce) {
        if (this.nextBend == null) this.nextBend = t + 1.5;
        if (this.getAttribute('bends') === 'on' && t >= this.nextBend && this.bends.length < 2) {
          const ei = pickE();
          if (!this.bends.some((b) => b.ei === ei)) this.bends.push({ ei, si: Math.random() * Math.ceil(N * 0.4) | 0, t0: t, dur: 2.6 + Math.random() * 1.2, reach: 0.82 + Math.random() * 0.16 });
          this.nextBend = t + 2.2 + Math.random() * 3;
        }
        if (this.nextRun == null) this.nextRun = t + 3;
        if (t >= this.nextRun) {
          this.runs.push({ ei: pickE(), si: Math.random() * N | 0, dir: Math.random() < 0.5 ? 1 : -1, t0: t, dur: 0.7 + Math.random() * 0.4 });
          this.nextRun = t + 3.5 + Math.random() * 4.5;
        }
        this.bends = this.bends.filter((b) => t - b.t0 < b.dur);
        this.runs = this.runs.filter((r) => t - r.t0 < r.dur);
      }

      c.lineCap = 'round'; c.lineJoin = 'round';
      edges.forEach(([ia, ib], ei) => {
        const a = P[ia], b = P[ib], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len, ny = dx / len;
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
        const toC = Math.max(0, (mx - C[0]) * nx + (my - C[1]) * ny - R0); // inward distance from edge midpoint to the centre's rim
        const spread = len * 0.11, bow = len * 0.03, amp = len * 0.045;
        const bend = this.bends.find((x) => x.ei === ei);
        const pts = [];
        for (let i = 0; i < N; i++) {
          const u = N === 1 ? 0 : (i / (N - 1)) * 2 - 1;
          const ph = i * 0.9 + ei * 2.1;
          const w1 = Math.sin(t * 0.55 + ph) * amp, w2 = Math.sin(t * 0.43 + ph * 1.3 + 1.7) * amp;
          let o1 = bow + u * spread + w1, o2 = bow - u * spread * 0.7 + w2, hi = 0;
          if (bend && bend.si === i) {
            const s = bendEnv((t - bend.t0) / bend.dur), base = (o1 + o2) / 2;
            const pull = ((toC + base) / 0.75) * bend.reach * s; // cubic midpoint = 0.75 × mean control offset
            o1 -= pull; o2 -= pull; hi = Math.max(0, s);
          }
          const p1 = [a[0] + dx / 3 + nx * o1, a[1] + dy / 3 + ny * o1];
          const p2 = [a[0] + dx * 2 / 3 + nx * o2, a[1] + dy * 2 / 3 + ny * o2];
          const k = 1 - Math.abs(u);
          c.strokeStyle = hexA(ink, (0.18 + 0.82 * k * k) * A0 + 0.06 + hi * 0.5);
          c.lineWidth = LW * (0.7 + 0.6 * k) + hi * 0.6;
          if (only.includes(ei)) { c.beginPath(); c.moveTo(a[0], a[1]); c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], b[0], b[1]); c.stroke(); }
          pts.push([a, p1, p2, b]);
        }
        all.push(pts);
      });

      // spell: a few specks circling each node, flickering
      if (this.getAttribute('spell') === 'on') {
        const R = Math.max(9, Math.min(W, H) * 0.028);
        P.forEach((p, ni) => {
          for (let k = 0; k < 4; k++) {
            const sp = (k % 2 ? -1 : 1) * (0.45 + k * 0.12), a = t * sp + k * 1.7 + ni * 2.3;
            const rr = R * (0.85 + 0.45 * Math.sin(t * 0.8 + k * 2 + ni));
            const x = p[0] + Math.cos(a) * rr, y = p[1] + Math.sin(a) * rr * 0.75;
            const fl = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * 3.1 + k * 1.9 + ni * 4), 2);
            c.fillStyle = hexA(ink, 0.18 * fl); c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill();
            c.fillStyle = hexA(ink, 0.9 * fl); c.beginPath(); c.arc(x, y, 1.1, 0, Math.PI * 2); c.fill();
          }
          const ra = t * 0.3 + ni * 2;
          c.strokeStyle = hexA(ink, 0.22); c.lineWidth = 0.8; c.beginPath(); c.ellipse(p[0], p[1], R * 1.15, R * 0.86, 0, ra, ra + Math.PI * 0.9); c.stroke();
        });
      }

      // sparks: a short flickering streak running a strand from one box to the other
      this.runs.forEach((r) => {
        const p = all[r.ei][Math.min(r.si, N - 1)], u = (t - r.t0) / r.dur, head = ease(Math.min(1, u)), tail = Math.max(0, head - 0.16);
        const fade = Math.sin(Math.PI * Math.min(1, u)), M = 12, path = [];
        for (let j = 0; j <= M; j++) {
          let e = tail + (head - tail) * (j / M); if (r.dir < 0) e = 1 - e;
          const x = bz(p, e, 0), y = bz(p, e, 1), jit = j > 0 && j < M ? (Math.random() * 2 - 1) * 2.2 : 0;
          path.push([x + jit, y + jit]);
        }
        const stroke = (w, al) => { c.strokeStyle = hexA(ink, al * fade); c.lineWidth = w; c.beginPath(); c.moveTo(path[0][0], path[0][1]); for (let j = 1; j < path.length; j++) c.lineTo(path[j][0], path[j][1]); c.stroke(); };
        stroke(5, 0.12); stroke(2.4, 0.35); stroke(1.2, 1);
      });
    }
  }
  customElements.define('tri-strands', TriStrands);
})();

// <loop-track> — a rounded-rectangle feedback loop drawn through the [data-node] markers of the nearest [data-track] container.
// A comet runs the loop in node order, dwelling at each stop and lighting matching [data-step] items. Hover a [data-step] to send it there.
// [data-track-mask] elements punch holes in the base line (so labels sitting on the line stay clean).
// attrs: accent · ink · dwell (s) · speed (px/s) · wait (comet hidden and parked until el.start() is called)
(() => {
if (customElements.get('loop-track')) return;
const rgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, (c) => c + c); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const mod = (a, n) => ((a % n) + n) % n;
class LoopTrack extends HTMLElement {
  num(k, d) { const v = parseFloat(this.getAttribute(k)); return Number.isFinite(v) ? v : d; }
  connectedCallback() {
    if (this.c) return;
    this.style.cssText += ';display:block;position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    const c = this.c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    this.appendChild(c);
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.waiting = this.hasAttribute('wait') && !this.reduce;
    this.box = this.closest('[data-track]') || this.parentElement.closest('[data-track]') || this.parentElement;
    this.root = this.closest('section') || document.body;
    this.cur = 0; this.next = null; this.pos = 0; this.t0 = 0; this.dwellT = 0; this.hold = null; this.pulses = []; this.vis = true; this.last = 0; this.frameN = 0;
    this.ro = new ResizeObserver(() => { this.size(); this.measure(); }); this.ro.observe(this);
    this.io = new IntersectionObserver((e) => { this.vis = e[0].isIntersecting; }); this.io.observe(this);
    this.onOver = (e) => { const s = e.target.closest && e.target.closest('[data-step]'); this.hold = s ? +s.dataset.step : null; };
    this.onLeave = () => { this.hold = null; };
    this.root.addEventListener('pointerover', this.onOver);
    this.root.addEventListener('pointerleave', this.onLeave);
    this.size(); this.measure(); this.sync(this.waiting ? -1 : 0);
    const loop = (now) => { this.raf = requestAnimationFrame(loop); if (this.vis && !document.hidden) this.frame(now / 1000); };
    this.raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() {
    cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect(); this.io && this.io.disconnect();
    this.root.removeEventListener('pointerover', this.onOver); this.root.removeEventListener('pointerleave', this.onLeave);
  }
  start() {
    if (!this.waiting) return;
    this.waiting = false; this.cur = 0; this.next = null; this.dwellT = 0; this.last = 0;
    if (this.stops) this.pos = this.stops[0];
    this.pulses.push({ i: 0, t: performance.now() / 1000 }); this.sync(0);
  }
  size() {
    const r = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d);
    this.ctx = this.c.getContext('2d'); this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  measure() {
    const me = this.getBoundingClientRect();
    const nodes = [...this.box.querySelectorAll('[data-node]')].sort((a, b) => a.dataset.node - b.dataset.node)
      .map((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2 - me.left, y: r.top + r.height / 2 - me.top }; });
    this.masks = [...this.box.querySelectorAll('[data-track-mask]')].map((el) => { const r = el.getBoundingClientRect(); return { x: r.left - me.left, y: r.top - me.top, w: r.width, h: r.height }; });
    if (nodes.length < 3 || !this.W) { this.pts = null; return; }
    const key = JSON.stringify(nodes.map((n) => [n.x | 0, n.y | 0])) + '|' + (this.W | 0);
    if (key === this.key) return; this.key = key;
    const n0 = nodes[0], nL = nodes[nodes.length - 1], n2 = nodes[Math.min(2, nodes.length - 2)], pad = this.num('pad', 6);
    const vertical = Math.abs(n0.x - n2.x) < Math.abs(n0.y - n2.y);
    const R = vertical ? { l: n0.x, r: this.W - pad, t: n0.y - 40, b: nL.y } : { l: pad, r: this.W - pad, t: n0.y, b: nL.y };
    const rr = Math.max(4, Math.min(44, (R.b - R.t) / 2, (R.r - R.l) / 2));
    const pts = [], seg = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 3)); for (let i = 0; i < n; i++) pts.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); };
    const arc = (cx, cy, a0) => { for (let i = 0; i < 16; i++) { const a = a0 + i / 16 * Math.PI / 2; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } };
    seg(R.l + rr, R.t, R.r - rr, R.t); arc(R.r - rr, R.t + rr, -Math.PI / 2);
    seg(R.r, R.t + rr, R.r, R.b - rr); arc(R.r - rr, R.b - rr, 0);
    seg(R.r - rr, R.b, R.l + rr, R.b); arc(R.l + rr, R.b - rr, Math.PI / 2);
    seg(R.l, R.b - rr, R.l, R.t + rr); arc(R.l + rr, R.t + rr, Math.PI);
    const build = () => { const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return cum; };
    const near = (n) => { let bi = 0, bd = Infinity; pts.forEach((p, i) => { const d = (p[0] - n.x) ** 2 + (p[1] - n.y) ** 2; if (d < bd) { bd = d; bi = i; } }); return bi; };
    let cum = build(), L = cum[pts.length], s = nodes.map((n) => cum[near(n)]);
    if (mod(s[1] - s[0], L) > mod(s[0] - s[1], L)) { pts.reverse(); cum = build(); s = nodes.map((n) => cum[near(n)]); }
    this.pts = pts; this.cum = cum; this.L = L; this.stops = s; this.nodes = nodes;
    if (this.next == null) this.pos = s[this.cur];
  }
  at(s) {
    const { pts, cum, L } = this; s = mod(s, L);
    let lo = 0, hi = pts.length; while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[(lo + 1) % pts.length], f = (s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  sync(active) {
    const accent = this.getAttribute('accent') || '#FF7A3D';
    this.root.querySelectorAll('[data-step]').forEach((el) => {
      const on = this.reduce || +el.dataset.step === active;
      el.style.opacity = '1';
      el.querySelectorAll('[data-step-title]').forEach((t) => { t.style.color = on ? accent : '#f4f2f7'; t.style.transition = 'color 0.4s ease'; });
      el.querySelectorAll('[data-step-dot]').forEach((d) => { d.style.background = on ? accent : '#3A3845'; d.style.boxShadow = on ? `0 0 0 5px ${accent}33, 0 0 24px ${accent}88` : 'none'; });
    });
  }
  frame(now) {
    if (++this.frameN % 30 === 0) this.measure();
    if (!this.pts) return;
    const dt = Math.min(0.05, this.last ? now - this.last : 0); this.last = now;
    const N = this.stops.length, S = this.stops, L = this.L, speed = this.num('speed', 520);
    if (this.waiting) this.pos = S[0];
    else if (!this.reduce) {
      if (this.next == null) {
        const goal = this.hold != null ? mod(this.hold, N) : null;
        if (goal != null && goal !== this.cur) { this.next = goal; this.t0 = now; this.from = S[this.cur]; this.dist = mod(S[goal] - S[this.cur], L); }
        else if (goal == null) { this.dwellT += dt; if (this.dwellT > this.num('dwell', 1.8)) { this.next = (this.cur + 1) % N; this.t0 = now; this.from = S[this.cur]; this.dist = mod(S[this.next] - S[this.cur], L); } }
        this.pos = S[this.cur];
      }
      if (this.next != null) {
        const dur = Math.max(0.7, Math.min(2.4, this.dist / speed)), u = Math.min(1, (now - this.t0) / dur);
        this.pos = this.from + this.dist * ease(u);
        if (u >= 1) { this.cur = this.next; this.next = null; this.dwellT = 0; this.pulses.push({ i: this.cur, t: now }); this.sync(this.cur); }
      }
    } else this.pos = S[0];
    this.draw(now);
  }
  draw(now) {
    const { ctx, W, H, pts } = this; if (!ctx) return;
    const [ar, ag, ab] = rgb(this.getAttribute('accent') || '#FF7A3D'), [ir, ig, ib] = rgb(this.getAttribute('ink') || '#f4f2f7');
    const ink = (a) => `rgba(${ir},${ig},${ib},${a})`, acc = (a) => `rgba(${ar},${ag},${ab},${a})`;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.strokeStyle = ink(0.2); ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
    // direction chevrons
    ctx.strokeStyle = ink(0.34); ctx.lineWidth = 1.2;
    const off = this.reduce ? 0 : (now * 22) % 120;
    for (let s = off; s < this.L; s += 120) {
      const a = this.at(s), b = this.at(s + 2), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), k = 4.5;
      ctx.beginPath();
      ctx.moveTo(a[0] - Math.cos(ang - 0.7) * k, a[1] - Math.sin(ang - 0.7) * k); ctx.lineTo(a[0], a[1]);
      ctx.lineTo(a[0] - Math.cos(ang + 0.7) * k, a[1] - Math.sin(ang + 0.7) * k); ctx.stroke();
    }
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000';
    (this.masks || []).forEach((m) => ctx.fillRect(m.x - 14, m.y - 8, m.w + 28, m.h + 16));
    this.nodes.forEach((n) => { ctx.beginPath(); ctx.arc(n.x, n.y, 16, 0, 7); ctx.fill(); });
    ctx.restore();
    if (this.waiting) return;
    // comet trail
    const TL = 260, STEP = 4;
    for (let d = TL; d > 0; d -= STEP) {
      const f = 1 - d / TL, a = this.at(this.pos - d), b = this.at(this.pos - d + STEP + 0.5);
      ctx.strokeStyle = acc(Math.pow(f, 2) * 0.95); ctx.lineWidth = 1 + f * 2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    this.pulses = this.pulses.filter((p) => now - p.t < 1.4);
    ctx.lineWidth = 1;
    for (const p of this.pulses) {
      const u = (now - p.t) / 1.4, n = this.nodes[p.i]; if (!n) continue;
      ctx.strokeStyle = acc(0.5 * (1 - u)); ctx.beginPath(); ctx.arc(n.x, n.y, 10 + u * 50, 0, 7); ctx.stroke();
    }
    const h = this.at(this.pos), g = ctx.createRadialGradient(h[0], h[1], 0, h[0], h[1], 22);
    g.addColorStop(0, acc(0.8)); g.addColorStop(1, acc(0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h[0], h[1], 22, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFE6D8'; ctx.beginPath(); ctx.arc(h[0], h[1], 2.8, 0, 7); ctx.fill();
  }
}
customElements.define('loop-track', LoopTrack);
})();

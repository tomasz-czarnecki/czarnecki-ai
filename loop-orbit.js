// <loop-orbit> — hairline orbit; an orange comet steps node to node and lights matching [data-step] items in the same <section>.
// attrs: nodes (4) · r (0.34 of min side) · accent (#FF7A3D) · ink (#f4f2f7) · dwell (s, 1.6) · travel (s, 1.1)
// Hovering any [data-step] item in the section sends the comet there and holds it.
(() => {
if (customElements.get('loop-orbit')) return;
const rgb = (h) => { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.replace(/./g, (c) => c + c); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const mod = (a, n) => ((a % n) + n) % n;
class LoopOrbit extends HTMLElement {
  num(k, d) { const v = parseFloat(this.getAttribute(k)); return Number.isFinite(v) ? v : d; }
  connectedCallback() {
    if (this.c) return;
    this.style.cssText += ';display:block;position:absolute;inset:0;width:100%;height:100%;';
    const c = this.c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.appendChild(c);
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.N = Math.max(2, Math.round(this.num('nodes', 4)));
    this.pos = 0; this.from = 0; this.goal = 0; this.tStart = 0; this.dwellT = 0; this.active = -1; this.pulses = []; this.vis = true; this.last = 0; this.hold = null;
    this.ro = new ResizeObserver(() => this.size()); this.ro.observe(this);
    this.io = new IntersectionObserver((e) => { this.vis = e[0].isIntersecting; }); this.io.observe(this);
    this.root = this.closest('section') || document.body;
    this.onOver = (e) => { const s = e.target.closest && e.target.closest('[data-step]'); this.hold = s ? mod(+s.dataset.step, this.N) : null; };
    this.onLeave = () => { this.hold = null; };
    this.root.addEventListener('pointerover', this.onOver);
    this.root.addEventListener('pointerleave', this.onLeave);
    this.size();
    this.active = 0; this.sync();
    const loop = (now) => { this.raf = requestAnimationFrame(loop); if (this.vis && !document.hidden) this.frame(now / 1000); };
    this.raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() {
    cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect(); this.io && this.io.disconnect();
    if (this.root) { this.root.removeEventListener('pointerover', this.onOver); this.root.removeEventListener('pointerleave', this.onLeave); }
  }
  size() {
    const r = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d);
    this.ctx = this.c.getContext('2d'); this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  setGoal(g, now) { this.from = this.pos; this.goal = g; this.tStart = now; }
  frame(now) {
    const dt = Math.min(0.05, this.last ? now - this.last : 0); this.last = now;
    const N = this.N, travel = this.num('travel', 1.1), dwell = this.num('dwell', 1.6);
    if (!this.reduce) {
      if (this.hold != null) {
        if (mod(this.goal, N) !== this.hold) { let k = Math.ceil(this.pos + 1e-6); while (mod(k, N) !== this.hold) k++; this.setGoal(k, now); }
      } else if (this.pos === this.goal) {
        this.dwellT += dt; if (this.dwellT > dwell) { this.dwellT = 0; this.setGoal(this.goal + 1, now); }
      }
      if (this.pos !== this.goal) {
        const dur = travel * Math.max(0.6, Math.min(2, this.goal - this.from));
        const u = Math.min(1, (now - this.tStart) / dur);
        this.pos = u >= 1 ? this.goal : this.from + (this.goal - this.from) * ease(u);
        if (u >= 1) this.dwellT = 0;
      }
    }
    if (this.pos === this.goal) {
      const act = mod(this.goal, N);
      if (act !== this.active) { this.active = act; this.pulses.push({ i: act, t: now }); this.sync(); }
    }
    this.draw(now);
  }
  sync() {
    const accent = this.getAttribute('accent') || '#FF7A3D';
    this.root.querySelectorAll('[data-step]').forEach((el) => {
      const on = this.reduce || mod(+el.dataset.step, this.N) === this.active;
      el.style.opacity = on ? '1' : '0.4';
      const dot = el.querySelector('[data-step-dot]'); if (dot) dot.style.background = on ? accent : '#3A3845';
    });
  }
  draw(now) {
    const { ctx, W, H, N } = this; if (!ctx || !W) return;
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * this.num('r', 0.34);
    const [ar, ag, ab] = rgb(this.getAttribute('accent') || '#FF7A3D'), [ir, ig, ib] = rgb(this.getAttribute('ink') || '#f4f2f7');
    const ink = (a) => `rgba(${ir},${ig},${ib},${a})`, acc = (a) => `rgba(${ar},${ag},${ab},${a})`;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 7]); ctx.strokeStyle = ink(0.1); ctx.beginPath(); ctx.arc(cx, cy, R * 0.72, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = ink(0.16); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = ink(0.06); ctx.beginPath(); ctx.arc(cx, cy, R * 1.24, 0, 7); ctx.stroke();
    const T = 120, per = T / N;
    for (let k = 0; k < T; k++) {
      const a = k / T * Math.PI * 2, major = k % per === 0, r0 = R * 1.05, r1 = R * (major ? 1.13 : 1.08);
      ctx.strokeStyle = ink(major ? 0.32 : 0.1); ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    const A0 = -Math.PI / 2, step = Math.PI * 2 / N, head = A0 + this.pos * step;
    const L = 1.4, S = 48;
    for (let s = 0; s < S; s++) {
      const f = (s + 1) / S, a0 = head - L * (1 - s / S), a1 = head - L * (1 - f);
      ctx.strokeStyle = acc(Math.pow(f, 2.2) * 0.95); ctx.lineWidth = 1 + f * 1.8;
      ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1 + 0.003); ctx.stroke();
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const a = A0 + i * step, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R, on = this.reduce || i === this.active;
      if (on) { const g = ctx.createRadialGradient(x, y, 0, x, y, 28); g.addColorStop(0, acc(0.35)); g.addColorStop(1, acc(0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 28, 0, 7); ctx.fill(); }
      ctx.fillStyle = on ? acc(1) : '#0B0A0F'; ctx.strokeStyle = on ? acc(1) : ink(0.45);
      ctx.beginPath(); ctx.arc(x, y, on ? 5 : 4, 0, 7); ctx.fill(); ctx.stroke();
    }
    this.pulses = this.pulses.filter((p) => now - p.t < 1.4);
    for (const p of this.pulses) {
      const u = (now - p.t) / 1.4, a = A0 + p.i * step, x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      ctx.strokeStyle = acc(0.55 * (1 - u)); ctx.beginPath(); ctx.arc(x, y, 6 + u * 46, 0, 7); ctx.stroke();
    }
    const hx = cx + Math.cos(head) * R, hy = cy + Math.sin(head) * R, g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 20);
    g.addColorStop(0, acc(0.75)); g.addColorStop(1, acc(0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 20, 0, 7); ctx.fill();
    ctx.fillStyle = '#FFE6D8'; ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, 7); ctx.fill();
  }
}
customElements.define('loop-orbit', LoopOrbit);
})();

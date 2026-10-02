// <hero-sea> — perspective hairline sea for the bottom of the hero.
// attrs: lines (count) · far, near (hex line colors) · speed · amp (0..1) · horizon (0..1 of own height)
(() => {
if (customElements.get('hero-sea')) return;
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
class HeroSea extends HTMLElement {
  num(k, d) { const v = parseFloat(this.getAttribute(k)); return Number.isFinite(v) ? v : d; }
  connectedCallback() {
    this.style.cssText += ';position:relative;display:block;width:100%;height:100%;';
    const c = this.c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.append(c);
    this.ro = new ResizeObserver(() => this.size()); this.ro.observe(this);
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)');
    this.t0 = performance.now();
    const loop = () => { this.raf = requestAnimationFrame(loop); if (!document.hidden) this.draw(); };
    this.size(); this.raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() { cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect(); }
  size() {
    const r = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    this.W = r.width; this.H = r.height; this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d);
    this.ctx = this.c.getContext('2d'); this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  draw() {
    const { ctx, W, H } = this; if (!ctx || !W) return;
    const t = this.reduce.matches ? 0 : (performance.now() - this.t0) / 1000 * this.num('speed', 1);
    const N = Math.round(this.num('lines', 14)), amp = this.num('amp', 1), hz = this.num('horizon', 0.12) * H;
    const far = hex(this.getAttribute('far') || '#8B7FE0'), near = hex(this.getAttribute('near') || '#4FA3A5');
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < N; i++) {
      const p = (i + 1) / N, e = Math.pow(p, 1.9);           // 0 far → 1 near
      const y0 = hz + (H - hz) * e;
      const A = (2 + 22 * e) * amp, lam = 90 + 520 * e, sp = 0.35 + 0.9 * e;
      const col = far.map((v, k) => Math.round(v + (near[k] - v) * p));
      const a = Math.min(1, 0.12 + 0.43 * p) * (i === N - 1 ? 0.7 : 1);
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      ctx.lineWidth = 0.6 + 0.7 * e;
      ctx.beginPath();
      for (let x = -8; x <= W + 8; x += 6) {
        const y = y0
          + Math.sin(x / lam * 6.283 - t * sp + i * 1.7) * A
          + Math.sin(x / (lam * 0.37) * 6.283 + t * sp * 1.6 + i * 0.9) * A * 0.28;
        x === -8 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
customElements.define('hero-sea', HeroSea);
})();

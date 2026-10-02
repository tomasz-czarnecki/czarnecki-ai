/* <prob-rings> — transparent canvas of hairline concentric wobbly rings that drift and swing.
   Attrs: ink (default #F4F1EA), alpha (0.4), rings (4), size (0.34 of min side), speed (1),
   spread (0 = tight band; 1 = rings range from ~0.3x to ~1.6x size), attract (0 = off; px pull toward the cursor). */
(function () {
  'use strict';
  class ProbRings extends HTMLElement {
    connectedCallback() {
      if (this._cv) return;
      this.style.cssText += ';display:block;position:absolute;inset:0;pointer-events:none;';
      const cv = this._cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      this.appendChild(cv);
      this._ctx = cv.getContext('2d');
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._vis = true;
      this._io = new IntersectionObserver((e) => { this._vis = e[0].isIntersecting; });
      this._io.observe(this);
      this._mx = this._my = null; this._sx = this._sy = null; this._pull = 0;
      this._onMove = (e) => { const b = this.getBoundingClientRect(); this._mx = e.clientX - b.left; this._my = e.clientY - b.top; };
      this._onLeave = () => { this._mx = this._my = null; };
      window.addEventListener('pointermove', this._onMove, { passive: true });
      document.addEventListener('pointerleave', this._onLeave);
      this._reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._t0 = performance.now();
      this._resize();
      const loop = (now) => { this._raf = requestAnimationFrame(loop); if (this._vis) this._draw((now - this._t0) / 1000); };
      if (this._reduce) this._draw(4); else this._raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); window.removeEventListener('pointermove', this._onMove); document.removeEventListener('pointerleave', this._onLeave); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); }
    _resize() {
      const b = this.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
      this.W = b.width; this.H = b.height;
      this._cv.width = Math.max(1, b.width * d); this._cv.height = Math.max(1, b.height * d);
      this._ctx.setTransform(d, 0, 0, d, 0, 0);
      if (this._reduce) this._draw(4);
    }
    n(k, f) { const v = parseFloat(this.getAttribute(k)); return isNaN(v) ? f : v; }
    _draw(t) {
      const ctx = this._ctx, W = this.W, H = this.H;
      if (!W || !H) return;
      t *= this.n('speed', 1);
      ctx.clearRect(0, 0, W, H);
      const N = Math.round(this.n('rings', 4));
      const SX = this.n('stretch', 1.55), SY = 0.72;
      const R = Math.min(this.n('size', 0.34) * Math.min(W, H) * 1.35, W * 0.46 / SX);
      // swing: slow lissajous drift of the centre + gentle sway of the whole form
      const cx = W / 2 + W * 0.02 * Math.sin(t * 0.31) + W * 0.008 * Math.sin(t * 0.83);
      const cy = H / 2 + H * 0.02 * Math.sin(t * 0.23 + 1.3);
      const rot = 0.25 * Math.sin(t * 0.17);
      const tilt = 0.03 * Math.sin(t * 0.21);
      ctx.strokeStyle = this.getAttribute('ink') || '#F4F1EA';
      ctx.lineWidth = 1.25; ctx.lineCap = 'round';
      ctx.globalAlpha = this.n('alpha', 0.4);
      const spread = this.n('spread', 0), attract = this.n('attract', 0);
      // eased cursor follow: position lerps, pull strength fades in/out
      const inside = this._mx != null && this._mx >= 0 && this._my >= 0 && this._mx <= W && this._my <= H;
      if (inside) { if (this._sx == null) { this._sx = this._mx; this._sy = this._my; } this._sx += (this._mx - this._sx) * 0.08; this._sy += (this._my - this._sy) * 0.08; }
      this._pull += ((inside && attract > 0 ? 1 : 0) - this._pull) * 0.05;
      const pull = this._pull, px = this._sx, py = this._sy;
      const reach = Math.max(W, H) * 0.45;
      const STEPS = 160;
      for (let i = 0; i < N; i++) {
        const k = (i + 1) / N;
        const breathe = 1 + 0.05 * Math.sin(t * (0.7 + 0.15 * i) - i * 2.1);
        // spread: deterministic uneven radii so some rings sit small and tight, others wide
        const jit = spread ? (0.5 + 0.5 * Math.sin(i * 12.9898 + 4.1)) : 0;
        const r0 = R * (spread ? (0.3 + 1.3 * Math.pow(k, 1.15) + 0.12 * (jit - 0.5)) : (0.8 + 0.2 * k)) * breathe;
        const amp = 0.1 + 0.02 * k;
        const lag = i * 1.7; // wide phase offsets so neighbouring rings drift through each other // outer rings follow the inner ones, like a ripple
        ctx.beginPath();
        for (let s = 0; s <= STEPS; s++) {
          const a = (s / STEPS) * Math.PI * 2;
          const w = amp * (0.55 * Math.sin(3 * a + rot + t * 0.4 - lag)
                         + 0.30 * Math.sin(5 * a - t * 0.55 + 1.7 + lag)
                         + 0.15 * Math.sin(2 * a + t * 0.3 + 0.6));
          const r = r0 * (1 + w);
          const ex = Math.cos(a) * r * SX, ey = Math.sin(a) * r * SY;
          const x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
          let X = x, Y = y;
          if (pull > 0.001 && px != null) {
            const dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1;
            const f = Math.exp(-(d * d) / (2 * reach * reach)) * attract * pull * (0.6 + 0.4 * k);
            const m = Math.min(f, d * 0.85);
            X += (dx / d) * m; Y += (dy / d) * m;
          }
          s ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  }
  if (!customElements.get('prob-rings')) customElements.define('prob-rings', ProbRings);
})();

// <skill-field> — three sources around a centre. mode="ripples": rings expand from each node and meet at the centre.
// mode="venn": three breathing circles whose overlap is the centre.
// attrs: ink, nodes ("x,y;x,y;x,y" 0..1 of box), center ("x,y"), mode, rings, alpha
(() => {
  if (customElements.get('skill-field')) return;
  const hexA = (c, a) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(c || '');
    if (!m) return c;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  };
  class SkillField extends HTMLElement {
    static get observedAttributes() { return ['mode', 'ink', 'nodes', 'center', 'rings', 'alpha']; }
    attributeChangedCallback() { if (this.reduce && this.cv) this.draw(6); }
    connectedCallback() {
      const b = (this.getAttribute('bleed') || '0.12,0.25,0.25,0.25').split(',').map(Number); this.bl = b; // top,right,bottom,left as fraction of the box
      const fx = 14 / (100 * (1 + b[1] + b[3])) * 100, fy = 14 / (100 * (1 + b[0] + b[2])) * 100;
      const mk = 'linear-gradient(to right, transparent, #000 ' + (b[3] * 100 / (1 + b[1] + b[3])).toFixed(1) + '%, #000 ' + (100 - b[1] * 100 / (1 + b[1] + b[3])).toFixed(1) + '%, transparent), linear-gradient(to bottom, transparent, #000 ' + (b[0] * 100 / (1 + b[0] + b[2])).toFixed(1) + '%, #000 ' + (100 - b[2] * 100 / (1 + b[0] + b[2])).toFixed(1) + '%, transparent)';
      this.style.cssText += ';display:block;position:absolute;z-index:0;top:' + (-b[0] * 100) + '%;right:' + (-b[1] * 100) + '%;bottom:' + (-b[2] * 100) + '%;left:' + (-b[3] * 100) + '%;-webkit-mask-image:' + mk + ';mask-image:' + mk + ';-webkit-mask-composite:source-in;mask-composite:intersect;';
      const pe = this.parentElement;
      if (pe) { if (getComputedStyle(pe).position === 'static') pe.style.position = 'relative'; pe.style.width = pe.style.width || '100%'; pe.style.height = pe.style.height || '100%'; pe.style.overflow = 'visible'; }
      if (!this.cv) {
        this.cv = document.createElement('canvas');
        this.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
        this.appendChild(this.cv);
      }
      this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.vis = true;
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
      if (this.reduce) this.draw(6);
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
    draw(t) {
      const c = this.cv.getContext('2d'), d = this.dpr, W = this.w, H = this.h;
      if (!W || !H) return;
      c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, W, H);
      const ink = this.getAttribute('ink') || '#E7573E', A0 = +this.getAttribute('alpha') || 0.6;
      const b = this.bl || [0, 0, 0, 0], sx = 1 + b[1] + b[3], sy = 1 + b[0] + b[2];
      const map = ([x, y]) => [(x + b[3]) / sx * W, (y + b[0]) / sy * H];
      const P = (this.getAttribute('nodes') || '0.5,0.14;0.17,0.86;0.83,0.86').split(';').map((p) => map(p.split(',').map(Number)));
      const C = map((this.getAttribute('center') || '0.5,0.6').split(',').map(Number));
      const mode = (this.getAttribute('mode') || 'ripples').toLowerCase();
      if (mode === 'venn') return this.venn(c, t, P, C, ink, A0);
      const K = Math.max(2, +this.getAttribute('rings') || 6);
      P.forEach((p, i) => {
        const D = Math.hypot(C[0] - p[0], C[1] - p[1]), maxR = D * 1.32, gap = maxR / K, ph = (t / 2.4 + i * 0.37) % 1;
        for (let k = 0; k < K; k++) {
          const r = (k + ph) * gap, f = r / maxR;
          const a = Math.min(1, f / 0.12) * Math.pow(1 - f, 1.3) * A0;
          if (a <= 0.003) continue;
          c.strokeStyle = hexA(ink, a); c.lineWidth = 1.3;
          c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.stroke();
        }
      });
    }
    venn(c, t, P, C, ink, A0) {
      P.forEach((p, i) => {
        const v = [p[0] + (C[0] - p[0]) * 0.42, p[1] + (C[1] - p[1]) * 0.42];
        const R = Math.hypot(C[0] - v[0], C[1] - v[1]) * 1.34 * (1 + Math.sin(t * 0.5 + i * 2.1) * 0.025);
        const ox = Math.cos(t * 0.3 + i * 2) * R * 0.015, oy = Math.sin(t * 0.37 + i * 2) * R * 0.015;
        c.fillStyle = hexA(ink, 0.045);
        c.beginPath(); c.arc(v[0] + ox, v[1] + oy, R, 0, Math.PI * 2); c.fill();
        [[1, 0.9], [0.965, 0.4], [0.93, 0.18]].forEach(([s, a]) => {
          c.strokeStyle = hexA(ink, a * A0); c.lineWidth = s === 1 ? 1.5 : 1;
          c.beginPath(); c.arc(v[0] + ox, v[1] + oy, R * s, 0, Math.PI * 2); c.stroke();
        });
      });
    }
  }
  customElements.define('skill-field', SkillField);
})();

/* <grad-plate> — grainy blurred-gradient plates with thin line-art overlays.
   Aesthetic: film-grain gradient fields + hairline white geometry.
   Attrs:
     colors  comma hex list, blended top→bottom in order
     bg      base fill (default first color)
     ink     line-art color (default #F4F1E8)
     art     petals | rings | waves | squares | none
     grain   0..1 (default 0.55)
     art-x, art-y, art-r   fractions for art placement/size
     seed    deterministic layout seed
   Respects prefers-reduced-motion (static frame). */
(function () {
  'use strict';
  if (customElements.get('grad-plate')) return;

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // shared grain tile (static instances)
  let grainTile = null;
  function makeGrainTile() {
    const c = document.createElement('canvas'); c.width = c.height = 144;
    const g = c.getContext('2d');
    const id = g.createImageData(144, 144);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 90 + (Math.random() * 150) | 0;
      d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  function getGrain() {
    if (grainTile) return grainTile;
    grainTile = makeGrainTile();
    return grainTile;
  }

  class GradPlate extends HTMLElement {
    connectedCallback() {
      if (this._init) return;
      this._init = true;
      this.style.display = this.style.display || 'block';
      if (!this.style.width) this.style.width = '100%';
      if (!this.style.height) this.style.height = '100%';
      this._cv = document.createElement('canvas');
      this._cv.style.cssText = 'width:100%;height:100%;display:block;';
      this.appendChild(this._cv);
      this._ctx = this._cv.getContext('2d');
      this._off = document.createElement('canvas');
      this._octx = this._off.getContext('2d');
      this._t0 = performance.now();
      // Opt-in: redraw the grain layer on a slow interval instead of baking
      // it once, so the noise reads as subtly alive. Off by default — only
      // plates with the grain-live attribute pay this per-frame cost.
      this._grainLive = this.hasAttribute('grain-live') || this.hasAttribute('grainlive');
      this._grainNext = 0;
      this.W = 0; this.H = 0;
      this._buildModel();
      // Static render: draw once per size change (film-still, like the reference
      // imagery). No rAF loop — scroll stays cheap with many plates on the page.
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._resize();

      // Optional: very slow spin + pointer parallax on the line-art overlay.
      // Field (gradient + grain) is cached once per size; only the art redraws
      // per frame, so this stays cheap.
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._spin = this.num('spin', 0);
      this._reactive = this.hasAttribute('mouse');
      this._draggable = this.hasAttribute('drag');
      // Opt-in: drive the per-art time-based sway (rings ripple, waves flow,
      // squares pulse) from real elapsed time instead of the static frame's
      // frozen instant. Off by default — existing plates render exactly as
      // before unless this attribute is added.
      this._timeLive = this.hasAttribute('time-live') || this.hasAttribute('timelive');
      this._speed = this.num('speed', 1);
      this._mx = this._my = this._tmx = this._tmy = 0;
      this._ox = this._oy = 0; this._spinAngle = 0; this._t0anim = null;
      this._dragX = null; this._dragY = null; this._dragging = false;
      // restore a previously dragged position
      if (this._draggable) {
        try {
          const s = localStorage.getItem('gradplate-art:' + this.attr('seed', ''));
          if (s) { const p = JSON.parse(s); if (Array.isArray(p)) { this._dragX = p[0]; this._dragY = p[1]; } }
        } catch (e) {}
      }
      if (!reduce && (this._spin || this._reactive || this._draggable || this._grainLive || this._timeLive)) {
        if (this._reactive || this._draggable) {
          this._onMove = (e) => {
            const b = this._cv.getBoundingClientRect();
            const px = (e.clientX - b.left) / b.width;
            const py = (e.clientY - b.top) / b.height;
            if (this._dragging) {
              this._dragX = Math.max(0.05, Math.min(0.95, px - this._grabOffX));
              this._dragY = Math.max(0.08, Math.min(0.92, py - this._grabOffY));
            } else {
              this._tmx = Math.max(-1.4, Math.min(1.4, px * 2 - 1));
              this._tmy = Math.max(-1.4, Math.min(1.4, py * 2 - 1));
            }
          };
          window.addEventListener('pointermove', this._onMove, { passive: true });
        }
        if (this._draggable) {
          this._onDown = (e) => {
            if (e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,[role="button"]')) return;
            const b = this._cv.getBoundingClientRect();
            const px = e.clientX - b.left, py = e.clientY - b.top;
            if (px < 0 || py < 0 || px > b.width || py > b.height) return;
            const axFrac = this._dragX != null ? this._dragX : this.num('art-x', 0.5);
            const ayFrac = this._dragY != null ? this._dragY : this.num('art-y', 0.56);
            const ax = axFrac * b.width;
            const ay = ayFrac * b.height;
            const R = this.num('art-r', 0.36) * Math.min(b.width, b.height);
            if (Math.hypot(px - ax, py - ay) <= R * 1.15) {
              this._dragging = true;
              // preserve the offset between the grab point and the art's
              // center so the shape follows the cursor instead of snapping
              // its center to the cursor on the first move.
              this._grabOffX = (px / b.width) - axFrac;
              this._grabOffY = (py / b.height) - ayFrac;
              this._ox = this._oy = 0;
              document.body.style.userSelect = 'none';
              document.body.style.cursor = 'grabbing';
              e.preventDefault();
            }
          };
          this._onUp = () => {
            if (!this._dragging) return;
            this._dragging = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            try { localStorage.setItem('gradplate-art:' + this.attr('seed', ''), JSON.stringify([this._dragX, this._dragY])); } catch (e) {}
          };
          window.addEventListener('pointerdown', this._onDown);
          window.addEventListener('pointerup', this._onUp);
        }
        this._loop = (ts) => {
          if (this._t0anim == null) this._t0anim = ts;
          const el = (ts - this._t0anim) / 1000;
          if (this._dragging) {
            this._ox = this._oy = 0;
          } else {
            this._mx += (this._tmx - this._mx) * 0.05;
            this._my += (this._tmy - this._my) * 0.05;
            const amp = Math.min(this.W, this.H) * 0.05;
            this._ox = this._mx * amp;
            this._oy = this._my * amp;
          }
          this._spinAngle = el * this._spin;
          this._composite(this._timeLive ? 3.7 + el * this._speed : 3.7);
          this._raf = requestAnimationFrame(this._loop);
        };
        this._raf = requestAnimationFrame(this._loop);
      }
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      if (this._raf) cancelAnimationFrame(this._raf);
      if (this._onMove) window.removeEventListener('pointermove', this._onMove);
      if (this._onDown) window.removeEventListener('pointerdown', this._onDown);
      if (this._onUp) window.removeEventListener('pointerup', this._onUp);
      this._init = false;
      if (this._cv && this._cv.parentNode === this) this.removeChild(this._cv);
    }
    /* Accept both "art-x" and "artx" — some hosts lowercase/strip kebab attrs */
    attr(n, f) { return this.getAttribute(n) || this.getAttribute(n.replace(/-/g, '')) || f; }
    num(n, f) {
      const raw = this.getAttribute(n) ?? this.getAttribute(n.replace(/-/g, ''));
      const v = parseFloat(raw);
      return isNaN(v) ? f : v;
    }

    _buildModel() {
      const cols = this.attr('colors', '#223959,#728EA5,#B36656,#813F32').split(',').map(s => s.trim()).filter(Boolean);
      const rnd = mulberry(hashStr(this.attr('seed', cols.join(''))));
      this._cols = cols;
      this._bg = this.attr('bg', cols[0]);
      this._blobs = [];
      const n = cols.length;
      for (let i = 0; i < n; i++) {
        // vertical progression top→bottom in color order, horizontal scatter
        this._blobs.push({
          c: cols[i],
          u: 0.14 + rnd() * 0.72,
          v: n === 1 ? 0.5 : 0.06 + 0.88 * (i / (n - 1)) + (rnd() - 0.5) * 0.14,
          r: 0.55 + rnd() * 0.5,
          p1: rnd() * 6.28, p2: rnd() * 6.28,
          s1: 0.05 + rnd() * 0.05, s2: 0.04 + rnd() * 0.05,
          a1: 0.05 + rnd() * 0.06, a2: 0.04 + rnd() * 0.05
        });
      }
      // a couple of echo blobs for richness
      const extra = Math.min(3, n);
      for (let i = 0; i < extra; i++) {
        const src = this._blobs[(rnd() * n) | 0];
        this._blobs.push({ c: src.c, u: 0.1 + rnd() * 0.8, v: Math.min(0.96, Math.max(0.04, src.v + (rnd() - 0.5) * 0.3)), r: 0.35 + rnd() * 0.35, p1: rnd() * 6.28, p2: rnd() * 6.28, s1: 0.05 + rnd() * 0.05, s2: 0.05 + rnd() * 0.04, a1: 0.05 + rnd() * 0.05, a2: 0.04 + rnd() * 0.04 });
      }
      this._petalN = 6 + ((rnd() * 3) | 0);
      this._wob = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    }

    _resize() {
      const r = this.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 1.6);
      this._dpr = d;
      this._cv.width = Math.max(1, Math.round(r.width * d));
      this._cv.height = Math.max(1, Math.round(r.height * d));
      this._ctx.setTransform(d, 0, 0, d, 0, 0);
      this.W = r.width; this.H = r.height;
      if (this.W > 4 && this.H > 4) { this._renderField(); this._composite(3.7); }
    }

    /* Gradient + grain baked once per size into an offscreen field canvas. */
    _renderField() {
      const W = this.W, H = this.H;
      if (W < 4 || H < 4) return;
      const d = this._dpr || 1;
      const t = 3.7;
      const fc = this._fieldCanvas || (this._fieldCanvas = document.createElement('canvas'));
      fc.width = this._cv.width; fc.height = this._cv.height;
      const fx = fc.getContext('2d');
      fx.setTransform(d, 0, 0, d, 0, 0);
      // --- gradient field at low res ---
      const s = 0.22;
      const ow = Math.max(2, Math.min(420, Math.round(W * s)));
      const oh = Math.max(2, Math.min(420, Math.round(H * s)));
      if (this._off.width !== ow || this._off.height !== oh) { this._off.width = ow; this._off.height = oh; }
      const o = this._octx;
      o.globalAlpha = 1;
      o.fillStyle = this._bg;
      o.fillRect(0, 0, ow, oh);
      const base = Math.max(ow, oh);
      for (const b of this._blobs) {
        const x = (b.u + Math.sin(t * b.s1 + b.p1) * b.a1) * ow;
        const y = (b.v + Math.cos(t * b.s2 + b.p2) * b.a2) * oh;
        const r = b.r * base * 0.62;
        const g = o.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, b.c);
        g.addColorStop(1, b.c + '00');
        o.globalAlpha = 0.9;
        o.fillStyle = g;
        o.fillRect(0, 0, ow, oh);
      }
      fx.imageSmoothingEnabled = true;
      fx.imageSmoothingQuality = 'high';
      fx.globalAlpha = 1;
      fx.globalCompositeOperation = 'source-over';
      fx.drawImage(this._off, 0, 0, W, H);
      // --- grain (baked once here, unless this instance animates it live —
      // then _composite() redraws it on its own slow interval instead) ---
      const grain = this.num('grain', 0.55);
      if (grain > 0.01 && !this._grainLive) {
        const pat = fx.createPattern(getGrain(), 'repeat');
        fx.globalCompositeOperation = 'soft-light';
        fx.globalAlpha = Math.min(1, grain);
        fx.fillStyle = pat;
        fx.fillRect(0, 0, W, H);
        fx.globalCompositeOperation = 'source-over';
        fx.globalAlpha = 1;
      }
    }

    /* Blit the cached field, then draw the (possibly animated) line art. */
    _composite(t) {
      const ctx = this._ctx, W = this.W, H = this.H;
      if (W < 4 || H < 4 || !this._fieldCanvas) return;
      const d = this._dpr || 1;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this._fieldCanvas, 0, 0, W, H);
      // --- live grain: a fresh noise tile every ~110ms, so it reads as
      // gently flickering film grain rather than a frozen texture ---
      if (this._grainLive) {
        const grain = this.num('grain', 0.55);
        if (grain > 0.01) {
          const now = performance.now();
          if (!this._liveTile || now >= this._grainNext) {
            this._liveTile = makeGrainTile();
            this._grainNext = now + 110;
          }
          const pat = ctx.createPattern(this._liveTile, 'repeat');
          ctx.globalCompositeOperation = 'soft-light';
          ctx.globalAlpha = Math.min(1, grain);
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }
      // --- line art ---
      const art = this.attr('art', 'none');
      if (art !== 'none') {
        const ink = this.attr('ink', '#F4F1E8');
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = 1;
        if (art === 'petals') this._petals(ctx, W, H, t, ink);
        else if (art === 'rings') this._rings(ctx, W, H, t);
        else if (art === 'waves') this._waves(ctx, W, H, t);
        else if (art === 'squares') this._squares(ctx, W, H, t);
        else if (art === 'peak') this._peakCurve(ctx, W, H, t);
        else if (art === 'bursts') this._bursts(ctx, W, H, t);
        else if (art === 'scattered') this._scattered(ctx, W, H, t);
      }
    }

    /* organic petal wireframe. Default: slow drift (the homepage hero). Named
       petal-anim modes (bloom | spin | counter | shimmer) drive richer motion
       for the hero-flower motion studies — the default branch is byte-identical
       to the original so pages that don't set petal-anim are untouched. */
    _petals(ctx, W, H, t) {
      const mode = this.attr('petal-anim', '');
      const ax = this._dragX != null ? this._dragX : this.num('art-x', 0.5);
      const ay = this._dragY != null ? this._dragY : this.num('art-y', 0.56);
      const cx = ax * W + (this._ox || 0);
      const cy = ay * H + (this._oy || 0);
      const R0 = this.num('art-r', 0.36) * Math.min(W, H);
      const N = this._petalN;
      const spin = this._spinAngle || 0;
      const mouse = (this._mx || 0) * 0.12;
      let rot, bAng = 0, petalReach = 1, boundScale = 1, shimmer = 0;
      if (mode === 'bloom') {
        // flower opens and closes in a slow breath while drifting
        rot = t * 0.12 + this._wob[0] + spin + mouse;
        petalReach = 0.72 + 0.33 * (0.5 + 0.5 * Math.sin(t * 0.6 + this._wob[0]));
        boundScale = 0.98 + 0.04 * Math.sin(t * 0.6 + this._wob[0]);
      } else if (mode === 'spin') {
        // steady mandala rotation, petals + rim locked together
        rot = t * 0.5 + this._wob[0] + spin + mouse;
        bAng = t * 0.5;
      } else if (mode === 'counter') {
        // petals turn one way, outer rim the other → layered depth
        rot = t * 0.28 + this._wob[0] + spin + mouse;
        bAng = -t * 0.42;
      } else if (mode === 'shimmer') {
        // a ripple travels petal to petal so the bloom flutters
        rot = t * 0.14 + this._wob[0] + spin + mouse;
        shimmer = 1;
      } else {
        rot = t * 0.02 + this._wob[0] + spin + mouse;
      }
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < N; i++) {
        const a = rot + (i / N) * Math.PI * 2;
        const w = (Math.PI / N) * 0.82;
        const reach = shimmer ? petalReach * (0.84 + 0.16 * Math.sin(t * 1.4 - i * 1.1 + this._wob[2])) : petalReach;
        const R = R0 * reach;
        const tipR = R * (0.94 + 0.08 * Math.sin(this._wob[1] + i * 2.1 + t * 0.05));
        const x = (ang, rr) => cx + Math.cos(ang) * rr;
        const y = (ang, rr) => cy + Math.sin(ang) * rr;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.bezierCurveTo(x(a - w, R * 0.52), y(a - w, R * 0.52), x(a - w * 0.38, R * 0.95), y(a - w * 0.38, R * 0.95), x(a, tipR), y(a, tipR));
        ctx.bezierCurveTo(x(a + w * 0.38, R * 0.95), y(a + w * 0.38, R * 0.95), x(a + w, R * 0.52), y(a + w, R * 0.52), cx, cy);
        ctx.stroke();
      }
      // irregular outer boundary
      ctx.beginPath();
      for (let k = 0; k <= 140; k++) {
        const ang = (k / 140) * Math.PI * 2 + bAng;
        const rr = R0 * boundScale * (1.0 + 0.055 * Math.sin(3 * ang + this._wob[1] + t * 0.04) + 0.035 * Math.sin(5 * ang + this._wob[2]));
        const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* concentric wobbly rings — breathe outward like ripples + slow differential spin */
    _rings(ctx, W, H, t) {
      const cx = this.num('art-x', 0.5) * W;
      const cy = this.num('art-y', 0.5) * H;
      const R = this.num('art-r', 0.38) * Math.min(W, H);
      const spin = this._spinAngle || 0;
      ctx.globalAlpha = 0.62;
      for (let n = 0; n < 4; n++) {
        // radial ripple: each ring lags the one inside it, so the pulse reads
        // as travelling outward from the centre
        const breathe = 1 + 0.055 * Math.sin(t * 0.7 - n * 0.9 + this._wob[0]);
        const rr0 = R * (0.4 + 0.2 * n) * breathe;
        // differential rotation: outer rings drift a touch faster — the cluster
        // never turns rigidly, so the hairlines look alive
        const rot = spin * (1 + n * 0.16);
        ctx.beginPath();
        for (let k = 0; k <= 120; k++) {
          const ang = (k / 120) * Math.PI * 2 + rot;
          const rr = rr0 * (1 + 0.05 * Math.sin(3 * ang + this._wob[n % 3] + n * 1.7 + t * 0.45) + 0.03 * Math.sin(6 * ang - t * 0.3));
          const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* horizontal hairline waves — flow steadily left→right, gently undulating */
    _waves(ctx, W, H, t) {
      const rows = Math.max(3, Math.round(H / 90));
      ctx.globalAlpha = 0.45;
      for (let j = 0; j < rows; j++) {
        const y0 = H * (j + 0.5) / rows;
        ctx.beginPath();
        for (let x = -4; x <= W + 4; x += 8) {
          const y = y0 + Math.sin(x / (W * 0.24) + j * 1.4 + this._wob[0] + t * 0.8) * H * 0.04
            + Math.sin(x / (W * 0.09) - j * 0.8 + t * 0.5) * H * 0.013;
          x <= -4 + 0.1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* continuous squircle grid (nested in the center) */
    _squares(ctx, W, H, t) {
      const cell = Math.max(90, Math.min(W, H) / this.num('art-r', 2.6));
      const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
      const x0 = (W - cols * cell) / 2, y0 = (H - rows * cell) / 2;
      const rad = cell * 0.32;
      ctx.globalAlpha = 0.55;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const g = cell * 0.015;
          ctx.beginPath();
          ctx.roundRect(x0 + i * cell + g, y0 + j * cell + g, cell - g * 2, cell - g * 2, rad);
          ctx.stroke();
        }
      }
      // nested centre squircles — counter-rotate against each other and breathe,
      // like a slow mechanism at the heart of the grid
      const ci = Math.floor(cols / 2), cj = Math.floor(rows / 2);
      const cxC = x0 + ci * cell + cell / 2, cyC = y0 + cj * cell + cell / 2;
      const spin = this._spinAngle || 0;
      for (let k = 1; k <= 3; k++) {
        const inset = cell * 0.12 * k + Math.sin(t * 0.85 + k * 0.9) * (cell * 0.035);
        const side = cell - inset * 2;
        if (side <= 8) continue;
        const rot = spin * (k % 2 ? 1 : -1.15) * (1 + k * 0.2);
        ctx.save();
        ctx.translate(cxC, cyC);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.roundRect(-side / 2, -side / 2, side, side, Math.max(6, rad - inset * 0.6));
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    /* single response-curve arc with a marked peak (Allocation AI) */
    _peakCurve(ctx, W, H, t) {
      const cx = this.num('art-x', 0.5) * W;
      const cy = this.num('art-y', 0.5) * H;
      const R = this.num('art-r', 0.4) * Math.min(W, H);
      const bw = Math.min(R * 2.4, W * 0.38);
      const bh = Math.min(R * 1.7, H * 0.82);
      const x0 = cx - bw / 2, y0 = cy - bh / 2;
      const fx = (v) => x0 + v / 300 * bw;
      const fy = (v) => y0 + v / 200 * bh;
      const bob = Math.sin(t * 0.06 + this._wob[0]) * (bh * 0.01);
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fx(24), fy(168)); ctx.lineTo(fx(276), fy(168)); ctx.stroke();

      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([2, 7]);
      ctx.beginPath();
      ctx.moveTo(fx(24), fy(172));
      ctx.bezierCurveTo(fx(90), fy(158), fx(150), fy(132), fx(190), fy(100));
      ctx.bezierCurveTo(fx(220), fy(76), fx(250), fy(66), fx(276), fy(60));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.92;
      ctx.lineWidth = 2.2;
      const py = fy(62) + bob;
      ctx.beginPath();
      ctx.moveTo(fx(24), fy(176));
      ctx.bezierCurveTo(fx(70), fy(176), fx(110), fy(88), fx(158), py);
      ctx.bezierCurveTo(fx(195), fy(44) + bob, fx(240), fy(78), fx(276), fy(118));
      ctx.stroke();

      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(fx(158), py); ctx.lineTo(fx(158), fy(168)); ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.arc(fx(158), py, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* on/off pressure bursts across a timeline (Smart Flighting) */
    _bursts(ctx, W, H, t) {
      const cx = this.num('art-x', 0.5) * W;
      const cy = this.num('art-y', 0.5) * H;
      const R = this.num('art-r', 0.4) * Math.min(W, H);
      const boxW = Math.min(R * 2.4, W * 0.38);
      const boxH = Math.min(R * 1.7, H * 0.82);
      const x0 = cx - boxW / 2, y0 = cy - boxH / 2;
      const fx = (v) => x0 + v / 300 * boxW;
      const fy = (v) => y0 + v / 200 * boxH;
      const fdx = (v) => v / 300 * boxW;
      const fdy = (v) => v / 200 * boxH;
      const bars = [
        [21.5, 100, 70], [33.5, 82, 88], [45.5, 112, 58],
        [83.5, 122, 48], [95.5, 104, 66],
        [135.5, 78, 92], [147.5, 96, 74], [159.5, 72, 98], [171.5, 102, 68],
        [209.5, 114, 56], [221.5, 130, 40],
        [253.5, 94, 76],
      ];
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fx(20), fy(170)); ctx.lineTo(fx(280), fy(170)); ctx.stroke();
      const barW = fdx(9);
      const rad = Math.min(barW / 2, 3);
      bars.forEach((b, i) => {
        const bx = fx(b[0]), by = fy(b[1]), barH = fdy(b[2]);
        const bounce = Math.sin(t * 0.15 + i * 0.7 + this._wob[1]) * (boxH * 0.006);
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.roundRect(bx, by - bounce, barW, barH + bounce, rad);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    /* scattered, variable-width blocks across a few tracks (Promo Advisor) */
    _scattered(ctx, W, H, t) {
      const cx = this.num('art-x', 0.5) * W;
      const cy = this.num('art-y', 0.5) * H;
      const R = this.num('art-r', 0.4) * Math.min(W, H);
      const boxW = Math.min(R * 2.4, W * 0.38);
      const boxH = Math.min(R * 1.7, H * 0.82);
      const x0 = cx - boxW / 2, y0 = cy - boxH / 2;
      const fx = (v) => x0 + v / 300 * boxW;
      const fy = (v) => y0 + v / 200 * boxH;
      const fdx = (v) => v / 300 * boxW;
      const fdy = (v) => v / 200 * boxH;
      ctx.globalAlpha = 0.15;
      ctx.lineWidth = 1;
      [48, 90, 132, 174].forEach((y) => {
        ctx.beginPath(); ctx.moveTo(fx(20), fy(y)); ctx.lineTo(fx(280), fy(y)); ctx.stroke();
      });
      const blocks = [
        [30, 41, 36, 0.6], [95, 41, 50, 0.85], [175, 41, 30, 0.5], [230, 41, 44, 0.75],
        [45, 83, 42, 0.8], [120, 83, 28, 0.5], [170, 83, 55, 0.9], [245, 83, 25, 0.4],
        [25, 125, 30, 0.55], [80, 125, 48, 0.85], [155, 125, 34, 0.6], [215, 125, 50, 0.8],
        [35, 167, 55, 0.9], [115, 167, 26, 0.45], [165, 167, 40, 0.7], [230, 167, 35, 0.6],
      ];
      const blockH = fdy(14);
      const rad = Math.min(blockH / 2, fdy(6));
      blocks.forEach((b, i) => {
        const drift = Math.sin(t * 0.05 + i * 0.9 + this._wob[2]) * (boxW * 0.004);
        ctx.globalAlpha = b[3];
        ctx.beginPath();
        ctx.roundRect(fx(b[0]) + drift, fy(b[1]), fdx(b[2]), blockH, rad);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
  }

  customElements.define('grad-plate', GradPlate);
})();

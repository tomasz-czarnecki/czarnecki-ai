// <xinhee-evolve src="model.3dm" speed="1" heat="true" hud="true" spin="true">
// Floors/structure/landscape stay fixed; facade geometry is driven by a live genetic algorithm (Galapagos-style).
(() => {
if (customElements.get('xinhee-evolve')) return;
const V = '0.160.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${V}`;
let libsP;
const libs = () => libsP || (libsP = Promise.all([
  import(`${CDN}/+esm`),
  import(`${CDN}/examples/jsm/controls/OrbitControls.js/+esm`),
  import(new URL('xinhee-geo.js', document.baseURI).href),
]).then(([THREE, O, G]) => ({ THREE, OrbitControls: O.OrbitControls, loadXinhee: G.loadXinhee })));

const bool = (v, d) => (v == null || v === '') ? d : !(v === false || v === 'false' || v === '0');
const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : d; };
const GLASS = /glass|glaz|membrane|enclosed volume/i;
const NO_EDGE = /landscape|facade|columns/i;
const STYLE = [
  [/enclosed volume/i, { color: 0xF2F1EE, opacity: 0.3 }],
  [/membrane/i, { color: 0xF4F4F2, opacity: 0.16 }],
  [/glass lift/i, { color: 0x3E6FE0, opacity: 0.8 }],
  [/trees/i, { color: 0x56693F }],
  [/columns/i, { color: 0x1E1D1B }],
];
const ORANGE = '#FF7A3D', INK = '#F4F2F7', MUTED = '#7E7B89', FAINT = 'rgba(244,242,247,0.08)';
const MONO = "'Geist Mono', ui-monospace, monospace";

// ---------- genetic algorithm ----------
const NG = 9, POP = 40, MAXGEN = 30;
const rnd = () => Math.random() * 2 - 1;
const gauss = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random()); };
const fitness = (g) => { let s = 0; for (const x of g) s += x * x; return 1 / (1 + 2.2 * s); }; // optimum = the built facade
class Evo {
  constructor() { this.reset(); }
  reset() { this.gen = 0; this.hist = []; this.pop = Array.from({ length: POP }, () => Array.from({ length: NG }, () => rnd() * 1.9)); this._eval(); }
  sigma() { return 0.75 * Math.pow(0.84, this.gen) + 0.01; }
  _eval() {
    this.scored = this.pop.map((g) => ({ g, f: Math.min(1, fitness(g) * (1 + gauss() * 0.003)) })).sort((a, b) => b.f - a.f);
    const fs = this.scored.map((s) => s.f), q = (p) => fs[Math.round(p * (fs.length - 1))];
    this.hist.push({ best: fs[0], q1: q(0.25), q3: q(0.75), min: fs[fs.length - 1] });
    this.best = this.scored[0];
  }
  step() {
    const par = this.scored.slice(0, 16).map((s) => s.g), s = this.sigma();
    const next = par.slice(0, 6).map((g) => g.slice());
    while (next.length < POP) {
      const a = par[Math.random() * 16 | 0], b = par[Math.random() * 16 | 0];
      next.push(a.map((x, i) => (Math.random() < 0.5 ? x : b[i]) + gauss() * s));
    }
    this.pop = next; this.gen++; this._eval();
  }
  get done() { return this.gen >= MAXGEN - 1 || this.best.f > 0.997; }
}

class XinheeEvolve extends HTMLElement {
  static get observedAttributes() { return ['src', 'speed', 'heat', 'hud', 'spin', 'palette']; }
  constructor() { super(); this._p = {}; }
  _v(k) { return this._p[k] ?? this.getAttribute(k); }
  attributeChangedCallback(k) { if (k === 'src') this._reload(); else if (k === 'palette') this._setPalette(); else this._opts(); }
  connectedCallback() {
    Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%' });
    if (!this._status) {
      this._status = document.createElement('div');
      Object.assign(this._status.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', fontFamily: MONO, fontSize: '10.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, transition: 'opacity .6s' });
      this._hud = document.createElement('canvas');
      Object.assign(this._hud.style, { position: 'absolute', left: '0', right: '0', bottom: '0', width: '100%', pointerEvents: 'none' });
      this.append(this._hud, this._status);
    }
    this._init();
  }
  disconnectedCallback() { this._teardown(); }
  _say(t) { this._status.textContent = t; this._status.style.opacity = t ? '1' : '0'; }
  _reload() { if (this.isConnected) { this._teardown(); this._init(); } }
  _opts() { if (this._controls) this._controls.autoRotate = bool(this._v('spin'), true); this._fit?.(); }
  _teardown() {
    this._token = null; cancelAnimationFrame(this._raf);
    this._ro?.disconnect(); this._io?.disconnect(); this._controls?.dispose();
    if (this._renderer) { this._renderer.dispose(); this._renderer.domElement.remove(); }
    this._renderer = this._controls = this._fac = null;
  }

  async _init() {
    const token = this._token = {};
    this._say('Loading viewer');
    let L; try { L = await libs(); } catch (e) { this._say('Viewer failed to load'); return; }
    if (token !== this._token) return;
    const { THREE, OrbitControls, loadXinhee } = L; this.T = THREE;
    const r = this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    Object.assign(r.domElement.style, { display: 'block', width: '100%', cursor: 'grab' });
    this.insertBefore(r.domElement, this._hud);

    const scene = this._scene = new THREE.Scene();
    const cam = this._cam = new THREE.PerspectiveCamera(30, 1, 0.05, 600);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3640, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3e6, 2.4); sun.position.set(11, 18, 8); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 0.5, far: 70 });
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    const fill = new THREE.DirectionalLight(0xc9d3ff, 0.55); fill.position.set(-14, 7, -10);
    scene.add(sun, sun.target, fill);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShadowMaterial({ opacity: 0.5 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(9.3, 128), new THREE.MeshStandardMaterial({ color: 0x121117, roughness: 1, metalness: 0 }));
    disc.rotation.x = -Math.PI / 2; disc.scale.set(8.2 / 9.3, 6.4 / 9.3, 1); disc.position.y = -0.01; disc.receiveShadow = true; scene.add(disc);
    const rimPts = []; for (let i = 0; i <= 160; i++) { const t = i / 160 * Math.PI * 2; rimPts.push(new THREE.Vector3(Math.cos(t) * 8.2, -0.005, Math.sin(t) * 6.4)); }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), new THREE.LineBasicMaterial({ color: 0x3A3842, transparent: true, opacity: 0.8 })));

    const ctl = this._controls = new OrbitControls(cam, r.domElement);
    Object.assign(ctl, { enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, zoomSpeed: 0.8, maxPolarAngle: Math.PI * 0.48, screenSpacePanning: true, autoRotateSpeed: 0.4 });
    let idle;
    ctl.addEventListener('start', () => { clearTimeout(idle); ctl.autoRotate = false; r.domElement.style.cursor = 'grabbing'; });
    ctl.addEventListener('end', () => { r.domElement.style.cursor = 'grab'; idle = setTimeout(() => this._opts(), 3500); });
    this._opts();

    const fit = () => {
      const w = this.clientWidth || 1, H = this.clientHeight || 1;
      const hh = bool(this._v('hud'), true) ? 150 : 0, h = Math.max(1, H - hh);
      r.setSize(w, h, false); r.domElement.style.height = h + 'px'; cam.aspect = w / h; cam.updateProjectionMatrix();
      if (this._fr && Math.abs((this._frA || 0) - cam.aspect) > 0.05) this._frame(...this._fr);
      const d = Math.min(devicePixelRatio || 1, 2); this._hud.width = w * d; this._hud.height = hh * d; this._hud.style.height = hh + 'px'; this._hudScale = d;
    };
    this._fit = fit;
    this._ro = new ResizeObserver(fit); this._ro.observe(this); fit();
    this._vis = true;
    this._io = new IntersectionObserver(([e]) => { this._vis = e.isIntersecting; }); this._io.observe(this);

    this._evo = new Evo(); this._genT = 0; this._hold = -1; this._t = 0;
    this._D = this._evo.best.g.slice();
    let last = performance.now();
    this._render = () => r.render(scene, cam);
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, ((now ?? performance.now()) - last) / 1000); last = now ?? performance.now();
      ctl.update();
      if (!this._vis) return;
      if (this._fac) { this._tick(dt); this._deform(); }
      r.render(scene, cam);
      this._drawHud();
    };
    this._frame(14, 4); loop();

    const src = this._v('src'); if (!src) { this._say('No model'); return; }
    this._say('Loading model');
    loadXinhee(src, THREE).then((obj) => {
      if (token !== this._token) return;
      try { this._onModel(obj); this._say(''); } catch (e) { console.error(e); this._say('Model could not be displayed'); }
    }).catch((e) => { console.error('[xinhee-evolve]', e); this._say('Model failed to load'); });
  }

  _frame(R, h) {
    const cam = this._cam, ctl = this._controls, fov = cam.fov * Math.PI / 180;
    this._fr = [R, h]; this._frA = cam.aspect;
    const dist = R / Math.sin(fov / 2) * 0.53 / (parseFloat(this._v('zoom')) || 1) / Math.min(1, cam.aspect / 1.35), el = 24 * Math.PI / 180, az = 38 * Math.PI / 180;
    const ty = h * 0.25;
    ctl.target.set(0, ty, 0);
    cam.position.set(Math.cos(el) * Math.sin(az) * dist, ty + Math.sin(el) * dist, Math.cos(el) * Math.cos(az) * dist);
    cam.near = dist / 200; cam.far = dist * 10; cam.updateProjectionMatrix();
    ctl.minDistance = dist * 0.25; ctl.maxDistance = dist * 2.2; ctl.update();
  }

  _onModel(obj) {
    const THREE = this.T, layers = obj.userData.layers || [];
    const drop = [], meshes = [], lines = [];
    obj.traverse((o) => {
      if (o.isLight || o.isSprite || o.isPoints) drop.push(o);
      else if (o.isMesh) meshes.push(o); else if (o.isLine) lines.push(o);
    });
    drop.forEach((o) => o.parent && o.parent.remove(o));
    const mats = {}, mat = (k, f) => mats[k] ||= f();
    const layerOf = (o) => { const a = o.userData.attributes || {}; return layers[a.layerIndex] || {}; };
    const colorOf = (o) => {
      const a = o.userData.attributes || {}, l = layerOf(o), s = a.colorSource?.value ?? a.colorSource;
      const c = a.drawColor || ((s === 1 && a.objectColor) ? a.objectColor : l.color) || { r: 200, g: 200, b: 200 };
      return new THREE.Color().setRGB(c.r / 255, c.g / 255, c.b / 255, THREE.SRGBColorSpace);
    };
    // build BOTH palettes up-front; switching palette just swaps materials (no reload)
    const facade = [];
    const WHITE = new THREE.Color('#F3F1EC'), DEEP = new THREE.Color('#D4501C');
    this._hots = { ghost: new THREE.Color('#FFC79E'), color: WHITE.clone() };
    const edgeMat = this._edgeMat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
    this._objs = [];
    meshes.forEach((o) => {
      const name = layerOf(o).fullPath || ''; if (layerOf(o).visible === false || /reference/i.test(name)) o.visible = false;
      const isFac = /facade/i.test(name), memb = /membrane/i.test(name), land = /landscape/i.test(name);
      const st = (STYLE.find(([re]) => re.test(name)) || [])[1] || {};
      const col = st.color != null ? new THREE.Color(st.color) : colorOf(o);
      const glass = GLASS.test(name), op = st.opacity ?? (glass ? 0.22 : 1);
      const L = {};
      // ghost
      if (isFac && !memb) L.ghost = { m: mat('vcg', () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0, side: THREE.DoubleSide })), cast: true, recv: false };
      else if (memb) L.ghost = { m: mat('gm', () => new THREE.MeshStandardMaterial({ color: DEEP, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })), cast: false, recv: false };
      else L.ghost = { m: mat(land ? 'gl' : 'gs', () => new THREE.MeshStandardMaterial({ color: land ? 0x6E6B77 : 0x9C99A6, transparent: true, opacity: land ? 0.14 : 0.2, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide })), cast: false, recv: false };
      // colour
      if (memb) L.color = { m: mat('memb', () => new THREE.MeshStandardMaterial({ color: 0xF6F5F1, emissive: 0x3a3936, transparent: true, opacity: 0.6, roughness: 0.55, metalness: 0, depthWrite: false, side: THREE.DoubleSide })), cast: false, recv: false, ro: 2 };
      else if (isFac && op === 1) L.color = { m: mat('vc', () => new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0, side: THREE.DoubleSide })), cast: true, recv: true };
      else if (op < 1) L.color = { m: mat('g' + col.getHexString() + op, () => new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: op, roughness: 0.2, metalness: 0.05, depthWrite: false, side: THREE.DoubleSide })), cast: op > 0.5, recv: true };
      else L.color = { m: mat('m' + col.getHexString(), () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })), cast: !glass, recv: true };
      o.userData.L = L; this._objs.push(o);
      if (!NO_EDGE.test(name)) o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 28), edgeMat));
      if (isFac) {
        const rib = !memb && op === 1;
        facade.push({ o, bases: { ghost: DEEP, color: rib ? WHITE : col }, heat: rib });
      }
    });
    this._lineMats = [];
    lines.forEach((o) => {
      const name = layerOf(o).fullPath || ''; if (layerOf(o).visible === false || /reference/i.test(name)) o.visible = false;
      const isFac = /facade/i.test(name), own = colorOf(o);
      const L = {};
      if (isFac) {
        const lm = mat('lf', () => { const m = new THREE.LineBasicMaterial({ transparent: true }); this._lineMats.push(m); return m; });
        L.ghost = L.color = { m: lm };
        facade.push({ o, bases: { ghost: DEEP, color: WHITE }, heat: false });
      } else {
        L.ghost = { m: mat('lg', () => new THREE.LineBasicMaterial({ color: 0x8F8C99, transparent: true, opacity: 0.7 })) };
        L.color = { m: mat('l' + own.getHexString(), () => new THREE.LineBasicMaterial({ color: own, transparent: true, opacity: 0.7 })) };
      }
      o.userData.L = L; this._objs.push(o);
    });

    // centre & scale (Rhino Z-up -> Y-up)
    const pivot = new THREE.Group(); obj.rotation.x = -Math.PI / 2; pivot.add(obj); pivot.updateMatrixWorld(true);
    const box = new THREE.Box3(); meshes.forEach((o) => o.visible && box.expandByObject(o));
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const R = size.length() / 2 || 1, s = 10 / R;
    obj.position.set(-c.x, -box.min.y, -c.z); pivot.scale.setScalar(s); this._scene.add(pivot);
    this._frame(10, size.y * s);
    this._prepFacade(facade);
    this._palette = null; this._setPalette();
  }

  _setPalette() {
    if (!this._objs) return;
    const p = this._v('palette') === 'color' ? 'color' : 'ghost';
    if (p === this._palette) return; this._palette = p;
    for (const o of this._objs) {
      const l = o.userData.L[p]; o.material = l.m;
      if (o.isMesh) { o.castShadow = !!l.cast; o.receiveShadow = !!l.recv; o.renderOrder = l.ro || 0; }
    }
    this._edgeMat.color.setHex(p === 'ghost' ? 0x8F8C99 : 0x26242C); this._edgeMat.opacity = p === 'ghost' ? 0.32 : 0.55;
    this._hot = this._hots[p];
    for (const m of this._lineMats) { m.userData.base = (p === 'ghost' ? this._fac[0].bases.ghost : this._hots.color).clone(); m.opacity = p === 'ghost' ? 0.4 : 0.5; m.color.copy(m.userData.base); }
    for (const it of this._fac) it.base = it.bases[p];
    this._deform?.();
    this._render?.();
  }

  _prepFacade(items) {
    const THREE = this.T, lb = new THREE.Box3();
    items.forEach(({ o }) => { o.geometry.computeBoundingBox(); lb.union(o.geometry.boundingBox); });
    const cx = (lb.min.x + lb.max.x) / 2, cy = (lb.min.y + lb.max.y) / 2, z0 = lb.min.z, zr = (lb.max.z - lb.min.z) || 1;
    let rmax = 0;
    const orange = new THREE.Color(ORANGE);
    items.forEach((it) => {
      const pos = it.o.geometry.attributes.position, n = pos.count, a = pos.array;
      this._thin(it.o, a, n);
      it.orig = a.slice(); it.B = new Float32Array(n * NG); it.dir = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        const dx = a[i * 3] - cx, dy = a[i * 3 + 1] - cy, rr = Math.hypot(dx, dy) || 1, th = Math.atan2(dy, dx);
        const h = Math.min(1, Math.max(0, (a[i * 3 + 2] - z0) / zr)), e = h * h * (3 - 2 * h), bu = 4 * h * (1 - h);
        rmax = Math.max(rmax, rr);
        const b = [bu, e * 0.8, Math.sin(th) * e, Math.cos(th) * e, Math.sin(2 * th) * bu, Math.cos(2 * th) * bu, Math.sin(3 * th) * e, Math.cos(3 * th) * e, e];
        it.B.set(b, i * NG);
        it.dir.set([dx / rr, dy / rr, -dy / rr, dx / rr], i * 4);
      }
      it.base = it.bases.ghost;
      if (it.heat) {
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.set([it.base.r, it.base.g, it.base.b], i * 3);
        it.o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      it.o.frustumCulled = false;
    });
    this._amp = rmax * 0.035; this._ampT = rmax * 0.05; this._orange = orange;
    this._fac = items;
  }

  // slim the facade members: rib fins (8-vertex boxes) shrink toward their end centroids; tubes (Ø≈0.226) pull in along normals
  _thin(o, a, n) {
    if (o.userData.thinned || !o.isMesh) return;
    const name = (o.userData.attributes || {}).name || '';
    if (/rib_fin/.test(name) && n === 8) {
      const ids = [...Array(8).keys()].sort((p, q) => a[p * 3 + 2] - a[q * 3 + 2]);
      for (const grp of [ids.slice(0, 4), ids.slice(4)]) {
        let cx = 0, cy = 0, cz = 0; grp.forEach((i) => { cx += a[i * 3]; cy += a[i * 3 + 1]; cz += a[i * 3 + 2]; });
        cx /= 4; cy /= 4; cz /= 4;
        grp.forEach((i) => { a[i * 3] = cx + (a[i * 3] - cx) * 0.55; a[i * 3 + 1] = cy + (a[i * 3 + 1] - cy) * 0.55; a[i * 3 + 2] = cz + (a[i * 3 + 2] - cz) * 0.55; });
      }
    } else if (/tube/.test(name) && o.geometry.attributes.normal) {
      const N = o.geometry.attributes.normal.array, d = 0.113 * 0.42;
      for (let i = 0; i < n * 3; i++) a[i] -= N[i] * d;
    } else return;
    o.userData.thinned = true;
  }

  _tick(dt) {
    const evo = this._evo, speed = Math.max(0.2, num(this._v('speed'), 1));
    this._t += dt;
    if (this._hold >= 0) {
      this._hold += dt;
      if (this._hold > 3.5 / speed) { evo.reset(); this._hold = -1; this._genT = 0; }
    } else {
      this._genT += dt * speed;
      if (this._genT > 0.9) { this._genT = 0; if (evo.done) this._hold = 0; else evo.step(); }
    }
    // exploration: early on the solver "tries on" many candidates, not just the current best
    const explore = this._hold >= 0 ? 0 : Math.max(0, 1 - evo.gen / 12);
    this._scanT = (this._scanT || 0) + dt * speed;
    if (!this._cand || this._scanT > 0.32) {
      this._scanT = 0;
      this._cand = Math.random() < explore * 0.85 ? evo.scored[Math.random() * evo.scored.length | 0].g : evo.best.g;
    }
    if (explore === 0) this._cand = evo.best.g;
    const k = 1 - Math.exp(-dt * (2.6 + explore * 5) * speed), B = this._cand;
    for (let i = 0; i < NG; i++) this._D[i] += (B[i] - this._D[i]) * k;
  }

  _deform() {
    const D = this._D, t = this._t, conv = this._hold >= 0;
    const wob = conv ? 0 : Math.min(0.9, this._evo.sigma() * 1.3);
    const G = new Float32Array(NG);
    for (let i = 0; i < NG; i++) G[i] = D[i] + wob * (Math.sin(t * 2.3 + i * 1.37) * 0.7 + Math.sin(t * 4.1 + i * 2.9) * 0.3);
    const amp = this._amp, ampT = this._ampT, heat = bool(this._v('heat'), true), O = this._hot || this._orange;
    const norm = 1 / (amp * 2.2);
    let dev = 0; for (let i = 0; i < NG; i++) dev += G[i] * G[i]; dev = Math.min(1, Math.sqrt(dev) / 2);
    for (const it of this._fac) {
      const pos = it.o.geometry.attributes.position, a = pos.array, o = it.orig, B = it.B, d = it.dir, n = pos.count;
      const ca = it.heat ? it.o.geometry.attributes.color : null, c = ca && ca.array, base = it.base;
      for (let i = 0; i < n; i++) {
        const j = i * NG;
        let rad = 0; for (let g = 0; g < 8; g++) rad += G[g] * B[j + g];
        rad *= amp; const tan = G[8] * B[j + 8] * ampT;
        a[i * 3] = o[i * 3] + d[i * 4] * rad + d[i * 4 + 2] * tan;
        a[i * 3 + 1] = o[i * 3 + 1] + d[i * 4 + 1] * rad + d[i * 4 + 3] * tan;
        if (c) {
          const m = heat ? Math.min(1, (Math.abs(rad) + Math.abs(tan)) * norm) : 0;
          c[i * 3] = base.r + (O.r - base.r) * m; c[i * 3 + 1] = base.g + (O.g - base.g) * m; c[i * 3 + 2] = base.b + (O.b - base.b) * m;
        }
      }
      pos.needsUpdate = true; if (ca) ca.needsUpdate = true;
    }
    for (const m of this._lineMats) m.color.copy(m.userData.base).lerp(this._hot, heat ? dev * 0.9 : 0);
  }

  _drawHud() {
    const cv = this._hud, ctx = cv.getContext('2d'), s = this._hudScale || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (!this._fac || !bool(this._v('hud'), true)) return;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const W = cv.width / s, H = cv.height / s, evo = this._evo, conv = this._hold >= 0;
    const ch = 82, x0 = 0, y0 = 44, gap = 36, mid = W >= 620, wide = W >= 820;
    const pw = mid ? ch * 1.2 : 0, lw = wide ? Math.min(W * 0.3, 420) : 0;
    const cw = W - (mid ? pw + gap : 0) - (wide ? lw + gap : 0);
    ctx.textBaseline = 'alphabetic'; ctx.font = `500 10px ${MONO}`; try { ctx.letterSpacing = '1.6px'; } catch (e) {}
    ctx.fillStyle = ORANGE; ctx.fillText('GALAPAGOS · EVOLUTIONARY SOLVER', x0, y0 - 28);
    ctx.fillStyle = INK; ctx.font = `500 11px ${MONO}`;
    ctx.fillText(`${conv ? 'CONVERGED' : 'GEN ' + String(evo.gen).padStart(2, '0')}   FITNESS ${evo.best.f.toFixed(5)}`, x0, y0 - 12);
    ctx.strokeStyle = FAINT; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = y0 + ch * i / 4 + 0.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + cw, y); ctx.stroke(); }
    const X = (g) => x0 + cw * g / (MAXGEN - 1), Y = (f) => y0 + ch * (1 - f), hs = evo.hist;
    const band = (ka, kb, style) => {
      if (hs.length < 2) return; ctx.beginPath();
      hs.forEach((h, i) => (i ? ctx.lineTo(X(i), Y(h[ka])) : ctx.moveTo(X(i), Y(h[ka]))));
      for (let i = hs.length - 1; i >= 0; i--) ctx.lineTo(X(i), Y(hs[i][kb]));
      ctx.closePath(); ctx.fillStyle = style; ctx.fill();
    };
    band('best', 'min', 'rgba(255,122,61,0.14)'); band('q1', 'q3', 'rgba(255,122,61,0.34)');
    ctx.beginPath(); hs.forEach((h, i) => (i ? ctx.lineTo(X(i), Y(h.best)) : ctx.moveTo(X(i), Y(h.best))));
    ctx.strokeStyle = ORANGE; ctx.lineWidth = 1.6; ctx.stroke();
    const gx = X(hs.length - 1); ctx.fillStyle = 'rgba(244,242,247,0.14)'; ctx.fillRect(gx - 3, y0, 6, ch);
    ctx.fillStyle = MUTED; ctx.font = `400 9px ${MONO}`;
    for (let g = 0; g < MAXGEN; g += 5) ctx.fillText(String(g), X(g) - 3, y0 + ch + 14);
    if (!mid) return;
    const mx = x0 + cw + gap, ms = ch;
    ctx.strokeStyle = FAINT; ctx.strokeRect(mx + 0.5, y0 + 0.5, pw, ms);
    ctx.beginPath(); ctx.moveTo(mx + pw / 2, y0); ctx.lineTo(mx + pw / 2, y0 + ms); ctx.moveTo(mx, y0 + ms / 2); ctx.lineTo(mx + pw, y0 + ms / 2); ctx.stroke();
    const P = (v, L) => Math.max(0, Math.min(1, (v + 1.2) / 2.4)) * L;
    evo.scored.forEach((sc, i) => {
      ctx.fillStyle = i === 0 ? ORANGE : 'rgba(244,242,247,0.55)';
      ctx.beginPath(); ctx.arc(mx + P(sc.g[0], pw), y0 + ms - P(sc.g[1], ms), i === 0 ? 3 : 1.8, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = MUTED; ctx.fillText('POPULATION', mx, y0 + ch + 14);
    if (!wide) return;
    const lx = mx + pw + gap, rows = 6, rh = ch / rows, tw = lw - 70;
    evo.scored.slice(0, rows).forEach((sc, i) => {
      const y = y0 + i * rh + rh / 2;
      ctx.fillStyle = i === 0 ? INK : MUTED; ctx.font = `400 10px ${MONO}`; ctx.fillText(sc.f.toFixed(6), lx, y + 3.5);
      const tx = lx + 70; ctx.strokeStyle = 'rgba(244,242,247,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(tx, y - 4.5, tw, 9, 4.5) : ctx.rect(tx, y - 4.5, tw, 9); ctx.stroke();
      ctx.fillStyle = i === 0 ? ORANGE : 'rgba(255,122,61,0.55)';
      sc.g.forEach((v) => ctx.fillRect(tx + 4 + Math.max(0, Math.min(1, (v + 1) / 2)) * (tw - 9), y - 3, 1.5, 6));
    });
    ctx.fillStyle = MUTED; ctx.font = `400 9px ${MONO}`; ctx.fillText('GENOMES', lx, y0 + ch + 14);
  }
}
['src', 'speed', 'heat', 'hud', 'spin', 'palette'].forEach((k) => Object.defineProperty(XinheeEvolve.prototype, k, {
  get() { return this._v(k); },
  set(v) { const prev = this._p[k]; this._p[k] = v; if (prev === v) return; if (k === 'src') this._reload(); else if (k === 'palette') this._setPalette(); else this._opts(); },
}));
customElements.define('xinhee-evolve', XinheeEvolve);
})();

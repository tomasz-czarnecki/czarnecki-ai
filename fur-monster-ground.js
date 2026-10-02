// <fur-monster-ground> — beak black box, grounded + hopping when docked (fork of fur-monster-beak.js), but it leaves the hero on scroll and lives docked at the bottom of the viewport.
// attrs: anchor (selector of hero frame) · x, y, x-small, y-small (0–1 position inside anchor) · label · label-ink · grain · dock (right|left|roam) · reduced-motion
(() => {
if (customElements.get('fur-monster-ground')) return;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FUR_VERT = `
uniform float uShells, uLen, uTime, uPuff, uDroop, uEyeRad, uTouchAmt, uTouchRad;
uniform vec3 uWind, uGrav, uEyeL, uEyeR, uTouch, uTouchVel, uBeak;
varying vec2 vUv; varying float vLevel; varying vec3 vN; varying vec3 vW; varying float vMask;
void main(){
  float L = float(gl_InstanceID) / max(uShells - 1.0, 1.0);
  vec3 n = normalize(normal);
  float d = min(distance(position, uEyeL), distance(position, uEyeR));
  float m = min(smoothstep(uEyeRad * 0.9, uEyeRad * 1.65, d), mix(0.35, 1.0, smoothstep(0.05, 0.16, distance(position, uBeak))));
  float len = uLen * mix(0.12, 1.0, m) * (1.0 + 0.9 * uPuff);
  float k = L * L;
  float flow = 0.5 * sin(uTime * 2.3 + position.x * 5.0 + position.y * 3.7) + 0.5 * sin(uTime * 3.7 + position.z * 6.0 - position.y * 4.0);
  vec3 disp = uGrav * uDroop * (1.0 - 0.8 * clamp(uPuff, 0.0, 1.0)) + uWind * (0.75 + 0.45 * flow);
  disp -= n * dot(disp, n) * 0.6;
  vec3 p = position + n * len * L + disp * len * k * 2.0;
  float td = distance(position, uTouch);
  float tf = uTouchAmt * (1.0 - smoothstep(0.0, uTouchRad, td));
  if (tf > 0.001) {
    vec3 away = position - uTouch; away -= n * dot(away, n);
    away = away / max(length(away), 1e-3);
    vec3 push = away * 0.9 + uTouchVel; push -= n * dot(push, n);
    p += push * len * L * tf * 1.7;
    p -= n * len * L * tf * 0.55;
  }
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv; vLevel = L; vMask = m;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FUR_FRAG = `
uniform sampler2D uNoise;
uniform float uDensity, uRim, uShells;
uniform vec3 uRoot, uTip, uSky, uGround, uKeyDir, uKeyCol, uRimDir, uIriA, uIriB, uIriC;
varying vec2 vUv; varying float vLevel; varying vec3 vN; varying vec3 vW; varying float vMask;
void main(){
  vec4 tx = texture2D(uNoise, vUv * uDensity);
  float L = vLevel;
  float a = 1.0;
  if (L > 0.0) {
    float w = 1.2 / uShells;
    a = smoothstep(L - w, L + w, tx.r);
    if (a < 0.05) discard;
  }
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.6);
  float ao = mix(0.2, 1.0, pow(L, 0.7)) * mix(0.5, 1.0, vMask);
  float strand = 0.7 + 0.6 * tx.g;
  vec3 base = mix(uRoot, uRoot * 2.4 + uTip * 0.03, pow(L, 1.4)) * strand;
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float ndl = dot(N, uKeyDir);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  vec3 col = base * (hemi + uKeyCol * wrap) * ao;
  col += uKeyCol * pow(L, 3.0) * pow(max(ndl, 0.0), 1.5) * 0.05 * strand;
  float t = 0.5 + 0.5 * sin(dot(N, vec3(1.7, 2.3, 0.9)) * 2.2 + fres * 4.0);
  vec3 iri = mix(uIriA, uIriB, t);
  iri = mix(iri, uIriC, smoothstep(0.3, 0.9, 0.5 + 0.5 * sin(dot(N, vec3(-2.0, 0.6, 1.4)) * 1.8)));
  vec3 sheen = mix(iri, uTip, 0.35);
  float tipW = pow(L, 1.8);
  col += sheen * tipW * (fres * uRim * 0.9 + 0.012) * strand;
  float back = pow(clamp(dot(N, uRimDir), 0.0, 1.0), 1.5) * fres;
  col += sheen * back * uRim * tipW * 1.1;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const LID_VERT = `
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;

const LID_FRAG = `
uniform sampler2D uNoise; uniform float uRim;
uniform vec3 uRoot, uTip, uSky, uGround, uKeyDir, uKeyCol, uIriA;
varying vec3 vN; varying vec3 vW; varying vec2 vUv;
void main(){
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vW);
  float n = texture2D(uNoise, vUv * vec2(8.0, 3.0)).r;
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
  vec3 hemi = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float wrap = clamp((dot(N, uKeyDir) + 0.35) / 1.35, 0.0, 1.0);
  vec3 col = uRoot * (1.5 + 0.9 * n) * (hemi + uKeyCol * wrap);
  col += mix(uIriA, uTip, 0.4) * fres * uRim * 0.25;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (c, t, k, dt) => c + (t - c) * (1 - Math.exp(-k * dt));
const loadThree = () => window.__THREE160 ? Promise.resolve(window.__THREE160)
  : (window.__THREE160_P = window.__THREE160_P || import(/* @vite-ignore */ THREE_URL).then(m => (window.__THREE160 = m)));

function makeNoise(THREE) {
  const S = 256, hb = new Float32Array(S * S), gb = new Float32Array(S * S);
  for (let i = 0; i < 11000; i++) {
    const cx = Math.random() * S, cy = Math.random() * S, r = 1.2 + Math.random() * 1.6;
    const h = 0.4 + 0.6 * Math.sqrt(Math.random()), g = Math.random(), R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const px = Math.floor(cx) + dx, py = Math.floor(cy) + dy;
      const dd = Math.hypot(px + 0.5 - cx, py + 0.5 - cy); if (dd >= r) continue;
      const v = h * (1 - (dd / r) ** 2), idx = ((py + S) % S) * S + ((px + S) % S);
      if (v > hb[idx]) { hb[idx] = v; gb[idx] = g; }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = hb[i] * 255; data[i * 4 + 1] = gb[i] * 255; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

function roundedCube(THREE, r, seg) {
  const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal, inner = 1 - r;
  const p = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    c.set(clamp(p.x, -inner, inner), clamp(p.y, -inner, inner), clamp(p.z, -inner, inner));
    n.subVectors(p, c).normalize();
    p.copy(c).addScaledVector(n, r);
    pos.setXYZ(i, p.x, p.y, p.z); nor.setXYZ(i, n.x, n.y, n.z);
  }
  g.computeBoundingSphere();
  return g;
}

const CROP = 1.9; // canvas half-size in creature units

class FurMonsterDock extends HTMLElement {
  connectedCallback() {
    if (this._built) return; this._built = true;
    const gen = this._gen = (this._gen || 0) + 1;
    this.style.cssText += ';position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;';
    this.mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    // viewport layer lives on <body> so the creature can escape the hero's clipping + stacking
    const layer = this.layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:45;overflow:hidden;contain:strict;';
    const canvas = this.canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;display:block;left:0;top:0;width:0;height:0;transform-origin:0 0;will-change:transform;';
    const label = this.label = document.createElement('div');
    const ink = this.getAttribute('label-ink') || this.getAttribute('labelink') || 'rgba(45,42,30,0.62)';
    label.style.cssText = `position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;font:11px/1 'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.08em;text-transform:uppercase;color:${ink};white-space:nowrap;opacity:0;`;
    label.innerHTML = `<div style="width:1px;height:26px;background:currentColor;opacity:.55"></div><span></span>`;
    label.querySelector('span').textContent = this.getAttribute('label') ?? 'fig. 01 — the black box · poke it';
    if (!this.getAttribute('label') && this.hasAttribute('label')) label.style.display = 'none';
    const shadow = this.shadow = document.createElement('div');
    shadow.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:20px;border-radius:50%;pointer-events:none;opacity:0;transform-origin:50% 50%;will-change:transform,opacity;background:radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 36%, rgba(170,160,255,0.07) 64%, rgba(170,160,255,0) 100%);';
    layer.append(shadow, canvas, label);
    if (this.hasAttribute('thoughts') && !['off', 'false'].includes(this.getAttribute('thoughts'))) {
      const bub = this.bubble = document.createElement('div');
      const dot = (sz, l, b) => `<div data-d style="position:absolute;width:${sz}px;height:${sz}px;border-radius:50%;background:#FCFBF8;border:2px solid #1A1814;box-shadow:2px 2px 0 #1A1814;left:${l}px;bottom:${b}px;opacity:0;box-sizing:border-box;"></div>`;
      bub.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;opacity:0;padding-bottom:34px;will-change:transform,opacity;';
      bub.innerHTML = `<div data-c style="transform-origin:18px 100%;padding:10px 16px 11px;background:#FCFBF8;border:2px solid #1A1814;border-radius:46% 54% 50% 50% / 60% 52% 48% 40%;box-shadow:3px 3px 0 #1A1814;font:500 12.5px/1.2 'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:0.03em;color:#1A1814;white-space:nowrap;opacity:0;"><span data-t></span></div>` + dot(7, 4, 0) + dot(12, 12, 12);
      layer.append(bub);
      if (this.getAttribute('thoughts') === 'annoying') {
        if (!document.getElementById('bb-annoy-css')) { const st = document.createElement('style'); st.id = 'bb-annoy-css'; st.textContent = '@keyframes bbJit{0%,100%{transform:translate(0,0)}25%{transform:translate(1px,-1px)}50%{transform:translate(-1px,1px)}75%{transform:translate(1px,1px)}}[data-bb-g]{color:#FF7A3D;display:inline-block;animation:bbJit .12s steps(1) infinite}@media (prefers-reduced-motion:reduce){[data-bb-g]{animation:none}}'; document.head.appendChild(st); }
        const c = bub.firstElementChild; c.style.whiteSpace = 'normal'; c.style.padding = '12px 22px 13px'; c.style.borderRadius = '30px 34px 32px 28px / 28px 32px 30px 34px'; c.style.width = 'max-content'; c.style.maxWidth = '200px'; c.style.setProperty('text-wrap', 'balance');
      }
    }
    document.body.appendChild(layer);
    const gA = parseFloat(this.getAttribute('grain'));
    if (gA > 0) {
      const G = 180, gc = document.createElement('canvas'); gc.width = gc.height = G;
      const gx = gc.getContext('2d'), gd = gx.createImageData(G, G);
      for (let i = 0; i < gd.data.length; i += 4) { const v = Math.random() * 255 | 0; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
      gx.putImageData(gd, 0, 0);
      const grain = this.grain = document.createElement('div');
      grain.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:${gA};background-repeat:repeat;background-image:url(${gc.toDataURL()})`;
      this.grainTimer = setInterval(() => { if (this.isReduced() || document.hidden) return; grain.style.backgroundPosition = `${Math.random() * G | 0}px ${Math.random() * G | 0}px`; }, 90);
      this.append(grain);
    }
    this.build(gen).catch(e => { if (gen === this._gen) this.fail(e); });
  }
  disconnectedCallback() { this._gen = (this._gen || 0) + 1; clearInterval(this.grainTimer); this.cleanup && this.cleanup(); this.cleanup = null; this._built = false; this.replaceChildren(); this.layer && this.layer.remove(); }
  num(n, d) { const v = parseFloat(this.getAttribute(n)); return isFinite(v) ? v : d; }
  isReduced() { return this.hasAttribute('reduced-motion') || this.mq.matches; }
  fail(e) {
    console.warn('[fur-monster-ground] WebGL unavailable — showing fallback.', e);
    this.canvas.remove(); this.label.remove();
    const small = this.clientWidth < 760;
    const fx = small ? this.num('x-small', 0.5) : this.num('x', 0.72), fy = small ? this.num('y-small', 0.76) : this.num('y', 0.53);
    const f = document.createElement('div');
    f.style.cssText = `position:absolute;left:${fx * 100}%;top:${fy * 100}%;transform:translate(-50%,-50%);width:min(34vw,300px);aspect-ratio:1;border-radius:28%;background:#17161c;box-shadow:0 0 0 1px rgba(201,194,255,0.18), 0 0 90px rgba(138,125,255,0.35);display:flex;align-items:flex-end;justify-content:center;gap:9%;padding-bottom:22%;box-sizing:border-box`;
    const eye = '<div style="width:26%;aspect-ratio:1;border-radius:50%;background:#eeedf3;display:flex;align-items:center;justify-content:center"><div style="width:55%;aspect-ratio:1;border-radius:50%;background:#050507;transform:translateX(-18%)"></div></div>';
    f.innerHTML = eye + eye;
    this.prepend(f);
  }

  async build(gen) {
    const canvas = this.canvas, layer = this.layer;
    const THREE = await loadThree();
    if (!this.isConnected || gen !== this._gen || canvas !== this.canvas || !layer.isConnected) return;
    const host = this;
    const footerEl = this.getAttribute('footer') ? document.querySelector(this.getAttribute('footer')) : null;
    const anchor = (this.getAttribute('anchor') && document.querySelector(this.getAttribute('anchor'))) || this.parentElement || this;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 required');
    } catch (e) { return this.fail(e); }
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    const mobile = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
    let shells = mobile ? 14 : 32;

    const scene = new THREE.Scene();
    const TAN = Math.tan(THREE.MathUtils.degToRad(14));
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 0.35, CROP / TAN); camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    let FOOTR = 1.02; // lowest on-screen point of the resting box, in units of r
    { const v = new THREE.Vector3(); let m = 0; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI / 2, rr = 0.38 + 0.03; v.set(0, -0.62 - rr * Math.sin(a), 0.62 + rr * Math.cos(a)).project(camera); m = Math.max(m, -v.y * CROP); } FOOTR = m; }
    const hemi = new THREE.HemisphereLight(0x8f86c9, 0x0b0a10, 0.7); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffd6ae, 2.2); key.position.set(-3, 4, 5); scene.add(key);
    const back = new THREE.DirectionalLight(0x9d90ff, 1.6); back.position.set(3, 2, -4); scene.add(back);

    const eyeR = 0.3, eyeX = 0.41, eyeY = -0.3, eyeZ = 0.93;
    const C = (h) => new THREE.Color(h);
    const U = {
      uShells: { value: shells }, uLen: { value: 0.13 }, uDensity: { value: 4 },
      uTime: { value: 0 }, uPuff: { value: 0 }, uDroop: { value: 0.35 }, uRim: { value: 1.4 },
      uWind: { value: new THREE.Vector3() }, uGrav: { value: new THREE.Vector3(0, -1, 0) },
      uEyeL: { value: new THREE.Vector3(-eyeX, eyeY, eyeZ) }, uEyeR: { value: new THREE.Vector3(eyeX, eyeY, eyeZ) }, uEyeRad: { value: eyeR }, uBeak: { value: new THREE.Vector3(0, -0.74, 0.97) },
      uTouch: { value: new THREE.Vector3(0, 0, 9) }, uTouchVel: { value: new THREE.Vector3() }, uTouchAmt: { value: 0 }, uTouchRad: { value: 0.34 },
      uNoise: { value: makeNoise(THREE) },
      uRoot: { value: C('#17161c') }, uTip: { value: C('#c6bfff') },
      uSky: { value: C('#5b5490') }, uGround: { value: C('#0c0b12') },
      uKeyDir: { value: new THREE.Vector3(-0.55, 0.7, 0.55).normalize() }, uKeyCol: { value: C('#ffd2a8').multiplyScalar(1.5) },
      uRimDir: { value: new THREE.Vector3(0.6, 0.5, -0.6).normalize() },
      uIriA: { value: C('#8a7dff') }, uIriB: { value: C('#4fd1dc') }, uIriC: { value: C('#e083d6') },
    };
    U.uNoise.value.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const creature = new THREE.Group(); creature.rotation.order = 'YXZ'; scene.add(creature);
    // blended shells with alpha accumulation → body stays fully opaque on light backgrounds
    const furMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FUR_VERT, fragmentShader: FUR_FRAG,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
    const fur = new THREE.InstancedMesh(roundedCube(THREE, 0.38, mobile ? 28 : 36), furMat, 64);
    const I = new THREE.Matrix4(); for (let i = 0; i < 64; i++) fur.setMatrixAt(i, I);
    fur.count = shells; fur.frustumCulled = false; creature.add(fur);
    const setShells = (n) => { shells = clamp(n | 0, 4, 64); fur.count = shells; U.uShells.value = shells; };
    const proxy = new THREE.Mesh(roundedCube(THREE, 0.38, 8), new THREE.MeshBasicMaterial({ visible: false }));
    creature.add(proxy);
    const touchRay = new THREE.Raycaster(), touchHits = [];

    const lidU = {}; ['uNoise', 'uRim', 'uRoot', 'uTip', 'uSky', 'uGround', 'uKeyDir', 'uKeyCol', 'uIriA'].forEach(k => lidU[k] = U[k]);
    const lidMat = new THREE.ShaderMaterial({ uniforms: lidU, vertexShader: LID_VERT, fragmentShader: LID_FRAG, side: THREE.DoubleSide });
    const scleraGeo = new THREE.SphereGeometry(eyeR, 48, 32);
    const irisGeo = new THREE.SphereGeometry(eyeR * 1.003, 48, 8, 0, Math.PI * 2, 0, 0.74); irisGeo.rotateX(Math.PI / 2);
    const pupilGeo = new THREE.SphereGeometry(eyeR * 1.006, 48, 8, 0, Math.PI * 2, 0, 0.6); pupilGeo.rotateX(Math.PI / 2);
    const upGeo = new THREE.SphereGeometry(eyeR * 1.07, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const loGeo = new THREE.SphereGeometry(eyeR * 1.07, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const scleraMat = new THREE.MeshPhongMaterial({ color: 0xeeedf3, specular: 0xffffff, shininess: 110, emissive: 0x15141c });
    const irisMat = new THREE.MeshPhongMaterial({ color: 0x24203a, specular: 0x888888, shininess: 90 });
    const pupilMat = new THREE.MeshPhongMaterial({ color: 0x030305, specular: 0xaaaaaa, shininess: 160 });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const glintGeo = new THREE.SphereGeometry(0.032, 16, 12);
    const eyes = [-1, 1].map(side => {
      const socket = new THREE.Group(); socket.position.set(side * eyeX, eyeY, eyeZ); creature.add(socket);
      const ball = new THREE.Group(); ball.rotation.order = 'YXZ'; socket.add(ball);
      ball.add(new THREE.Mesh(scleraGeo, scleraMat), new THREE.Mesh(irisGeo, irisMat), new THREE.Mesh(pupilGeo, pupilMat));
      const glint = new THREE.Mesh(glintGeo, glintMat); glint.position.set(-0.35, 0.18, 0.92).normalize().multiplyScalar(eyeR * 1.01); socket.add(glint);
      const upper = new THREE.Mesh(upGeo, lidMat), lower = new THREE.Mesh(loGeo, lidMat); socket.add(upper, lower);
      return { side, socket, ball, upper, lower, yaw: -0.3, pitch: 0 };
    });

    // ── Baba Yaga chicken legs: hidden inside the box, unfold once it docks ──
    const hasLegs = this.hasAttribute('legs') && this.getAttribute('legs') !== 'false' && this.getAttribute('legs') !== 'off';
    const legTex = U.uNoise.value.clone(); legTex.needsUpdate = true; legTex.repeat.set(2, 5);
    const scaleMat = new THREE.MeshStandardMaterial({ color: 0xD9A24A, roughness: 0.45, metalness: 0.1, bumpMap: legTex, bumpScale: 4 });
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xB9812F, roughness: 0.5, metalness: 0.1, bumpMap: legTex, bumpScale: 4 });
    const clawMat = new THREE.MeshStandardMaterial({ color: 0x1d1b16, roughness: 0.3, metalness: 0.3 });
    const legsGroup = new THREE.Group(); legsGroup.rotation.order = 'YXZ'; legsGroup.visible = false; scene.add(legsGroup);
    const HIP_Y = -1.0, TH_L = 0.52, SH_L = 0.86;
    const featherMat = new THREE.MeshStandardMaterial({ color: 0x3b3450, roughness: 0.85, metalness: 0.05, bumpMap: legTex, bumpScale: 6, emissive: 0x120f1c });
    const plumeMat = new THREE.MeshStandardMaterial({ color: 0x5a4f7c, roughness: 0.6, metalness: 0.1, emissive: 0x1a1530 });
    // rest pose: thigh flares out + back, hock juts out, shank comes back in → bow-legged "> <" hut stance
    const POSE = { hipX: 0.32, hipZ: 0.34, kneeX: -0.62, kneeZ: -0.78, footX: 0.3, footZ: 0.44 };
    // drumstick: fat feathered thigh (lathe) with a fringe of feathers where it meets the scaly shank
    const drum = new THREE.LatheGeometry([[0.001, 0.1], [0.18, 0.06], [0.28, -0.08], [0.27, -0.24], [0.21, -0.38], [0.15, -0.48], [0.13, -TH_L]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
    const featherGeo = new THREE.ConeGeometry(0.075, 0.3, 5); featherGeo.translate(0, -0.15, 0);
    const ringGeo = new THREE.CylinderGeometry(1, 0.92, 1, 14);
    const toeSeg = new THREE.CylinderGeometry(0.05, 0.075, 1, 10); toeSeg.rotateX(Math.PI / 2); toeSeg.translate(0, 0, 0.5);
    const knuckle = new THREE.SphereGeometry(1, 12, 10);
    const clawGeo = new THREE.ConeGeometry(0.055, 0.2, 10); clawGeo.translate(0, 0.08, 0); clawGeo.rotateX(Math.PI / 2 + 0.55);
    const legs = hasLegs ? [-1, 1].map(side => {
      const hip = new THREE.Group(); hip.rotation.order = 'ZXY'; hip.position.set(side * 0.44, HIP_Y, 0.05); legsGroup.add(hip);
      hip.add(new THREE.Mesh(drum, featherMat));
      for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++) {
        const a = (i + row * 0.5) / 12 * Math.PI * 2, rr = row ? 0.2 : 0.25, f = new THREE.Mesh(featherGeo, row ? plumeMat : featherMat);
        f.position.set(Math.cos(a) * rr, row ? -0.36 : -0.16, Math.sin(a) * rr);
        f.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); f.scale.setScalar(row ? 1 : 0.85); hip.add(f);
      }
      const knee = new THREE.Group(); knee.rotation.order = 'ZXY'; knee.position.y = -TH_L; hip.add(knee);
      const hock = new THREE.Mesh(knuckle, scaleMat); hock.scale.set(0.16, 0.17, 0.16); knee.add(hock);
      const spur = new THREE.Mesh(clawGeo, clawMat); spur.scale.setScalar(1.1); spur.position.set(0, -0.22, -0.1); spur.rotation.y = Math.PI; knee.add(spur);
      const N = 7;
      for (let i = 0; i < N; i++) { // stacked scales, tapering, alternating tone
        const r = 0.13 - i * 0.006, h = SH_L / N * 1.1;
        const ring = new THREE.Mesh(ringGeo, i % 2 ? ringMat : scaleMat); ring.scale.set(r, h, r * 0.9);
        ring.position.y = -(i + 0.5) * SH_L / N; knee.add(ring);
      }
      const foot = new THREE.Group(); foot.rotation.order = 'ZXY'; foot.position.y = -SH_L; knee.add(foot);
      const ball = new THREE.Mesh(knuckle, scaleMat); ball.scale.set(0.13, 0.09, 0.13); foot.add(ball);
      [[-0.6, 0.46], [0, 0.56], [0.6, 0.46], [Math.PI, 0.26]].forEach(([yaw, len]) => {
        const toe = new THREE.Group(); toe.rotation.y = yaw; toe.position.y = -0.04; foot.add(toe);
        const a = new THREE.Mesh(toeSeg, scaleMat); a.scale.set(1, 1, len * 0.55); toe.add(a);
        const k = new THREE.Mesh(knuckle, ringMat); k.scale.setScalar(0.068); k.position.z = len * 0.55; toe.add(k);
        const b = new THREE.Mesh(toeSeg, scaleMat); b.scale.set(0.8, 0.8, len * 0.45); b.position.z = len * 0.55; b.rotation.x = 0.12; toe.add(b);
        const c = new THREE.Mesh(clawGeo, clawMat); c.position.set(0, -0.01, len); toe.add(c);
      });
      return { side, hip, knee, foot };
    }) : [];
    const poseLeg = (lg, lift = 0, crouch = 0) => {
      const s = lg.side;
      lg.hip.rotation.set(POSE.hipX + lift * 0.5 + crouch, 0, s * (POSE.hipZ + lift * 0.1));
      lg.knee.rotation.set(POSE.kneeX - lift * 1.0 - crouch * 2, 0, s * POSE.kneeZ);
      lg.foot.rotation.set(POSE.footX + lift * 0.5 + crouch, 0, s * (POSE.footZ - lift * 0.1));
    };
    let FEET = 2.1;
    if (legs.length) {
      legs.forEach(lg => poseLeg(lg)); legsGroup.updateMatrixWorld(true);
      const v = new THREE.Vector3(); legs[0].foot.getWorldPosition(v); FEET = -v.y + 0.06;
    }

    // ── chicken beak: lofted mandibles (curved culmen, hooked tip), tongue, nostrils, comb + wattles ──
    const mandible = (L, W, H, D, lower) => {
      const NU = 26, NV = 28, pos = [], col = [], idx = [];
      const cBase = new THREE.Color(lower ? 0xE9A640 : 0xF6C45A), cTip = new THREE.Color(lower ? 0xB9722A : 0xCB8430), c = new THREE.Color();
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, w = W * Math.pow(1 - u, 0.7) + 0.003, h = H * Math.pow(1 - u, 0.9) + 0.002;
        const y0 = lower ? D * 0.35 * u * u : -D * u * u * u; // upper hooks down, lower curls up to meet it
        c.copy(cBase).lerp(cTip, Math.pow(u, 1.6));
        for (let j = 0; j <= NV; j++) {
          const f = j / NV * Math.PI * 2, s = Math.sin(f), top = s > 0;
          const hh = (top ? h : 0) * s; // flat inner faces so the jaws close flush
          pos.push(Math.cos(f) * w * (top ? 1 : 0.96), lower ? y0 - hh : y0 + hh, L * u);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const q = i * (NV + 1) + j, r = q + NV + 1;
        idx.push(q, r, q + 1, q + 1, r, r + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const beakMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25, side: THREE.DoubleSide, emissive: 0x2a1604, emissiveIntensity: 0.6 });
    const fleshMat = new THREE.MeshStandardMaterial({ color: 0x4a1418, roughness: 0.7, side: THREE.DoubleSide });
    const tongueMat = new THREE.MeshPhysicalMaterial({ color: 0xE77C86, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: 0x3a0e14 });
    const combMat = new THREE.MeshPhysicalMaterial({ color: 0xD4473B, roughness: 0.45, clearcoat: 0.4, emissive: 0x3a0a08 });
    const darkMat = new THREE.MeshBasicMaterial({ color: 0x1a0c06 });
    const sph = new THREE.SphereGeometry(1, 24, 16);
    const beak = new THREE.Group(); beak.position.set(0, -0.74, 0.9); beak.scale.setScalar(0.4); beak.rotation.order = 'XYZ'; creature.add(beak);
    const upperJaw = new THREE.Group(); beak.add(upperJaw);
    upperJaw.add(new THREE.Mesh(mandible(0.66, 0.27, 0.21, 0.11, false), beakMat));
    [-1, 1].forEach(s => { const n = new THREE.Mesh(sph, darkMat); n.scale.set(0.028, 0.014, 0.04); n.position.set(s * 0.085, 0.158, 0.13); n.rotation.z = s * 0.4; upperJaw.add(n); });
    const lowerJaw = new THREE.Group(); lowerJaw.position.set(0, -0.014, 0); beak.add(lowerJaw);
    lowerJaw.add(new THREE.Mesh(mandible(0.5, 0.225, 0.14, 0, true), beakMat));
    const cavity = new THREE.Mesh(sph, fleshMat); cavity.scale.set(0.23, 0.07, 0.25); cavity.position.set(0, -0.015, 0.1); lowerJaw.add(cavity);
    const tongue = new THREE.Group(); tongue.position.set(0, 0.01, 0.04); lowerJaw.add(tongue);
    const tg = new THREE.Mesh(sph, tongueMat); tg.scale.set(0.09, 0.03, 0.21); tg.position.z = 0.12; tongue.add(tg);
    const tgTip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.12, 16), tongueMat); tgTip.rotation.x = Math.PI / 2; tgTip.scale.set(1, 1, 0.45); tgTip.position.z = 0.3; tongue.add(tgTip);
    // wattles hang off the lower jaw and jiggle
    const wattle = new THREE.Group(); wattle.position.set(0, -0.1, 0.07); lowerJaw.add(wattle);
    const wattles = [-1, 1].map(s => { const w = new THREE.Group(); w.position.x = s * 0.07; wattle.add(w); const m = new THREE.Mesh(sph, combMat); m.scale.set(0.07, 0.15, 0.06); m.position.y = -0.12; w.add(m); return w; });
    // day-light rig: blended in as it leaves the dark hero for the cream page
    const LIT = {
      sky0: U.uSky.value.clone(), sky1: new THREE.Color('#b9b2e6'),
      gr0: U.uGround.value.clone(), gr1: new THREE.Color('#6c6478'),
      key0: U.uKeyCol.value.clone(), key1: new THREE.Color('#fff1e0').multiplyScalar(2.3),
      root0: U.uRoot.value.clone(), root1: new THREE.Color('#2a2833'),
      hemi, key, back, sclera: scleraMat,
    };
    const applyLight = (k) => {
      U.uSky.value.copy(LIT.sky0).lerp(LIT.sky1, k);
      U.uGround.value.copy(LIT.gr0).lerp(LIT.gr1, k);
      U.uKeyCol.value.copy(LIT.key0).lerp(LIT.key1, k);
      U.uRoot.value.copy(LIT.root0).lerp(LIT.root1, k);
      U.uRim.value = 1.4 + 0.5 * k;
      LIT.hemi.intensity = 0.7 + 1.5 * k; LIT.key.intensity = 2.2 + 1.6 * k; LIT.back.intensity = 1.6 + 0.6 * k;
      renderer.toneMappingExposure = 1.1 + 0.45 * k;
    };
    const BK = { open: 0, clackAt: -9, nextClack: 4 + Math.random() * 4, jig: 0, jigV: 0, lastVy: 0 };

    const S = {
      ptr: new THREE.Vector2(), ptrVel: new THREE.Vector2(), hasPtr: false, touch: false, lastPtrT: -99, lastMoveReal: 0,
      lean: new THREE.Vector2(), idleYaw: 0, idleYawT: 0, nextTurn: 5,
      wind: new THREE.Vector2(), windV: new THREE.Vector2(), puff: 0, puffV: 0,
      nextBlink: 2, blinkStart: -9, nextGlance: 8, glanceUntil: 0, glanceTarget: new THREE.Vector3(),
      startleAt: -99, sBlink: true, up: 0.4, lo: -0.62, near: 0, eyeScale: 1,
      cx: 0, cy: 0, rPx: 100, W: 1, H: 1, cursor: '', lastFrame: 0, dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      fpsAcc: 0, fpsN: 0, slowFor: 0,
      // docking state (px, viewport space)
      hero: { x: 0, y: 0, r: 100, docTop: 0, h: 1 },
      px: 0, py: 0, vx: 0, vy: 0, r: 100, init: false, buf: 0,
      prog: 0, docked: false, lastScroll: window.scrollY, scrollVel: 0, activity: 0, dockX: null, walk: 0,
    };
    const BASE_YAW = -0.32;
    const glances = [[-4, 2.6, 2], [4.5, -1.6, 2], [-3, -2.4, 2], [0.5, 3.2, 1.5], [5, 1.5, 1]];
    const tmp = new THREE.Vector3(), eyeW = new THREE.Vector3(), target = new THREE.Vector3(), inv = new THREE.Quaternion(), wt = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.2), ray = new THREE.Raycaster();
    const clock = new THREE.Clock();
    const ptrC = new THREE.Vector2();
    const cursorEl = document.documentElement;
    let hitBody = () => false;
    // pointer (host NDC) → canvas NDC
    const ptrToCanvas = () => {
      const R = S.r * (S.Hs || CROP), x = (S.ptr.x + 1) / 2 * S.W, y = (1 - S.ptr.y) / 2 * S.H;
      const cy = S.py - (S.cyW || 0) * S.r;
      return ptrC.set((x - (S.px - R)) / (2 * R) * 2 - 1, 1 - (y - (cy - R)) / (2 * R) * 2);
    };

    hitBody = () => { touchRay.setFromCamera(ptrToCanvas(), camera); touchHits.length = 0; proxy.raycast(touchRay, touchHits); return touchHits.length > 0; };
    // optional external API (used by spaghetti-draw.js): mouth position, body hit-test, slurp + gulp
    const mouthV = new THREE.Vector3();
    this.mouthPoint = () => {
      const cr = canvas.getBoundingClientRect(); if (!cr.width) return null;
      if (this._slurp > 0) S.lastPtrT = clock.elapsedTime; // keep 60fps while eating
      mouthV.set(0, -0.03, 0.34); beak.localToWorld(mouthV); mouthV.project(camera);
      return { x: cr.left + (mouthV.x + 1) / 2 * cr.width, y: cr.top + (1 - mouthV.y) / 2 * cr.height, r: S.r };
    };
    this.hitAt = (cx, cy) => {
      const ox = S.ptr.x, oy = S.ptr.y; S.ptr.set((cx / S.W) * 2 - 1, -(cy / S.H) * 2 + 1);
      const hit = Math.hypot(cx - S.px, cy - S.py) < S.r * 1.6 && hitBody(); S.ptr.set(ox, oy); return hit;
    };
    this._slurp = 0;
    this.gulp = (k = 1) => { if (!this.isReduced()) S.puffV += 7 * k; S.lastPtrT = clock.elapsedTime; };
    const layout = () => {
      S.W = layer.clientWidth || window.innerWidth; S.H = layer.clientHeight || window.innerHeight;
      const hr = anchor.getBoundingClientRect();
      const w = hr.width || S.W, h = hr.height || S.H, aspect = w / h, small = w < 760;
      const tanH = TAN * 2, k = small ? this.num('scale-small', this.num('scale', 1)) : this.num('scale', 1);
      const d = (small ? Math.max(2.3 / (0.62 * tanH * aspect), 2.3 / (0.32 * tanH)) : Math.max(2.3 / (0.52 * tanH), 2.3 / (0.34 * tanH * aspect))) / k;
      S.hero.r = Number.isFinite(h / (d * tanH)) ? h / (d * tanH) : 120;
      S.hero.fx = small ? this.num('x-small', 0.5) : this.num('x', 0.72);
      S.hero.fy = small ? this.num('y-small', 0.76) : this.num('y', 0.53);
      S.hero.docTop = hr.top + window.scrollY; S.hero.h = h;
      S.buf = 0; // force buffer resize
    };

    const sizeBuffer = (R) => {
      const want = Math.max(32, Math.round(2 * R));
      if (!S.buf || Math.abs(want - S.buf) / S.buf > 0.12) {
        S.buf = want;
        renderer.setPixelRatio(S.dpr);
        renderer.setSize(want, want, false);
        canvas.style.width = want + 'px'; canvas.style.height = want + 'px';
      }
    };

    const GLY = '#$%&@*!?≈∑∆∫λθ∂±∞§', WORDS = ['blorp', 'zxq', 'hmm', 'grrbl', 'mnah', 'flib', 'eep', 'wuzz', 'bzzt', 'plonk', 'ugh', 'krrk'];
    const TOKS = ['∂L/∂θ', 'p=0.73', '0x3F?', 'argmax(?)', '∑≈∞', 'NaN', 'λ→?', '01101', 'err//', '∆=?!'];
    const pick = (a) => a[Math.random() * a.length | 0];
    const gibber = () => {
      const n = 2 + (Math.random() * 2 | 0), out = [];
      for (let i = 0; i < n; i++) { const r = Math.random(); out.push(r < 0.35 ? pick(WORDS) : r < 0.7 ? pick(TOKS) : Array.from({ length: 2 + (Math.random() * 3 | 0) }, () => pick(GLY)).join('')); }
      return out.join(' ') + (Math.random() < 0.4 ? '…' : Math.random() < 0.5 ? '?' : '');
    };
    const TH = { next: 2.5, t0: -99, dur: 3.4, text: '', shown: '', lastMut: 0, w: 0, h: 0 };
    // ── annoying monologue (thoughts="annoying") ──
    const annoy = this.getAttribute('thoughts') === 'annoying';
    const nowR = () => performance.now() / 1000;
    const AN = { bags: {}, queue: [], cut: false, lockUntil: 0, muted: false, lastDots: nowR(), inHero: true, wasOut: false, key: null, whereT: 0,
      lastScroll: nowR(), idleArmed: true, idleCount: 0, sY: window.scrollY, sT: nowR(), sV: 0, lastFast: -99, clickN: 0, lastClick: -99, hoverAt: 0, hoverDone: false, hiddenAt: 0, shVis: false, shW: 0 };
    const POOL = () => window.BLACK_BOX_THOUGHTS || {};
    const draw = (k) => { const p = POOL()[k]; if (!p || !p.length) return null; let b = AN.bags[k]; if (!b || !b.length) b = AN.bags[k] = p.slice().sort(() => Math.random() - 0.5); return b.pop(); };
    const fire = (key, o = {}) => {
      if (!annoy || (!o.force && (AN.muted || AN.inHero || nowR() < AN.lockUntil))) return false;
      let line = o.text || draw(key); if (!line) return false;
      if (o.map) line = o.map(line);
      AN.queue = [{ text: line, dur: o.dur || 4 }].concat(o.then || []); AN.cut = true; return true;
    };
    const SEC = [['journey', 'intro'], ['case-studies', 'heineken'], ['prototype', 'heineken'], ['the-loop', 'heineken'], ['buildings-deep-dive', 'buildings'], ['testimonials', 'testimonials'], ['contact', 'cta']];
    const where = () => {
      const mid = S.H * 0.5, prob = document.getElementById('probabilities');
      if (prob) { const r = prob.getBoundingClientRect(); if (+getComputedStyle(prob).opacity > 0.3 && r.top < mid && r.bottom > mid) return { hero: true }; }
      const hero = document.getElementById('v2-hero');
      if (hero) { const r = hero.getBoundingClientRect(); if (+getComputedStyle(hero).opacity > 0.4 && r.top < S.H * 0.6 && r.bottom > S.H * 0.4) return { hero: true }; }
      for (const [id, k] of SEC) { const el = document.getElementById(id); if (!el) continue; const r = el.getBoundingClientRect(); if (r.height && r.top <= mid && r.bottom >= mid) return { hero: false, key: k }; }
      return { hero: false, key: null };
    };
    const nextLine = () => {
      if (AN.inHero || !AN.key) return { text: gibber(), gib: true };
      const l = draw(AN.key); return l ? { text: l, gib: false } : { text: gibber(), gib: true };
    };
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fitBub = (cl) => { const K = clamp(S.r / 42, 1.7, 2.7); cl.style.maxWidth = Math.max(110, Math.min(200, (S.W - 32) / K - 36)).toFixed(0) + 'px'; };
    const annoyTick = (t, drawY) => {
      const now = nowR();
      if (now - AN.whereT > 0.3) {
        AN.whereT = now; const w = where();
        if (w.hero && AN.wasOut) { AN.wasOut = false; AN.inHero = true; fire('return', { force: true }); }
        if (!w.hero) AN.wasOut = true;
        AN.inHero = w.hero; if (w.key) AN.key = w.key;
      }
      if (AN.idleArmed && AN.idleCount < 3 && now - AN.lastScroll > 12 && fire('idle')) { AN.idleArmed = false; AN.idleCount++; }
      const docked = S.prog > 0.985 && (S.foot || 0) < 0.05;
      const over = docked && S.hasPtr && !S.touch && !S.ptrOut && Math.hypot((S.ptr.x - S.cx) * S.W / 2, (S.ptr.y - S.cy) * S.H / 2) < S.rPx * 1.1;
      if (over) { if (!AN.hoverAt) AN.hoverAt = now; else if (!AN.hoverDone && now - AN.hoverAt > 2) { AN.hoverDone = true; fire('hover'); } }
      else { AN.hoverAt = 0; AN.hoverDone = false; }
      if (AN.muted && now - AN.lastDots > 30 && !AN.queue.length && t - TH.t0 > TH.dur) { AN.lastDots = now; AN.queue = [{ text: '...', dur: 2.5 }]; }
    };
    const think = (t, drawY) => {
      const bub = this.bubble, cl = bub.firstElementChild, tx = cl.firstElementChild, dots = bub.querySelectorAll('[data-d]');
      const newSpot = () => { TH.side = Math.random() < 0.5 ? -1 : 1; TH.off = (Math.random() * 0.3 - 0.15); TH.lift = Math.random() * 0.3; TH.rot = (Math.random() * 2 - 1) * 5; };
      if (annoy) annoyTick(t, drawY);
      if (annoy && AN.queue.length && (AN.cut || t - TH.t0 >= TH.dur)) {
        AN.cut = false; const q = AN.queue.shift(); newSpot(); fitBub(cl);
        TH.t0 = t; TH.dur = q.dur; TH.text = q.text; TH.gib = false; TH.shown = null; TH.next = t + q.dur + 1.5 + Math.random() * 1.5;
      }
      else if (annoy && t > TH.next && t - TH.t0 > TH.dur) {
        const q = AN.muted || (S.fearA || 0) > 0.2 ? null : nextLine();
        if (q) { newSpot(); fitBub(cl); TH.t0 = t; TH.dur = 4; TH.text = q.text; TH.gib = q.gib; TH.shown = null; TH.next = t + 4 + 1.5 + Math.random() * 1.5; }
        else TH.next = t + 1;
      }
      else if (annoy) {}
      else if (TH.poked) { TH.poked = false; newSpot(); TH.t0 = t; TH.dur = 1.8; TH.text = pick(['?!', '#@%&!', 'eep!?', '!!∆!']); TH.next = t + 6 + Math.random() * 6; }
      else if (t > TH.next && t - TH.t0 > TH.dur && !((S.fearA || 0) > 0.2)) { newSpot(); TH.t0 = t; TH.dur = 3 + Math.random() * 1.6; TH.text = gibber(); TH.next = t + TH.dur + 5 + Math.random() * 9; }
      const u = t - TH.t0, out = smooth(TH.dur - 0.3, TH.dur, u), live = u >= 0 && u < TH.dur;
      if (!live) { if (bub.style.opacity !== '0') bub.style.opacity = '0'; return; }
      // typewriter reveal, then the thought keeps churning a glyph at a time
      const k = clamp(Math.floor((u - 0.32) * 26), 0, TH.text.length);
      let s = TH.text.slice(0, k) + (k < TH.text.length && u > 0.32 ? pick(GLY) : '');
      if (k >= TH.text.length && t - TH.lastMut > 0.28 && (!annoy || TH.gib)) {
        TH.lastMut = t; const arr = [...TH.text], i = Math.random() * arr.length | 0;
        if (arr[i] !== ' ') arr[i] = Math.random() < 0.5 ? pick(GLY) : arr[i]; TH.text = arr.join('');
      }
      if (s !== TH.shown) {
        if (annoy) tx.innerHTML = s ? s.split(/([#@%!&$]{2,})/).map((p, i) => i % 2 ? `<span data-bb-g>${esc(p)}</span>` : esc(p)).join('') : '\u00a0';
        else tx.textContent = s || '\u00a0'; TH.shown = s; TH.w = bub.offsetWidth; TH.h = bub.offsetHeight; }
      const back = (x) => { x = clamp(x, 0, 1); const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
      dots[0].style.opacity = String(clamp(u / 0.08, 0, 1));
      dots[1].style.opacity = String(clamp((u - 0.1) / 0.08, 0, 1));
      cl.style.opacity = String(clamp((u - 0.2) / 0.06, 0, 1));
      cl.style.transform = `scale(${(0.2 + 0.8 * back((u - 0.2) / 0.32)).toFixed(3)}) rotate(${((TH.rot || 0) + Math.sin(t * 2.1) * 1.5).toFixed(2)}deg)`;
      const K = S.W < 760 ? clamp(S.r / 56, 1.05, this.num('bubble-small', 1.3)) : clamp(S.r / 42, 1.7, 2.7), sw = TH.w * K, sh = TH.h * K;
      // each thought picks its own spot on the head and its own direction
      let side = TH.side || 1;
      let ax = S.px + S.r * (TH.off || 0.3), ay = drawY - S.r * (1.08 + (TH.lift || 0)) + Math.sin(t * 2.4) * 2 * K;
      if (ay - sh < 84) ay = 84 + sh; // no headroom: cloud pinned under the header, dots still rise from the crown
      if (side > 0 && ax + sw + 12 > S.W) side = -1;
      if (side < 0 && ax - sw - 12 < 0) side = 1;
      const flip = side < 0;
      const bx = clamp(flip ? ax - sw + 8 * K : ax - 8 * K, 8, S.W - sw - 8);
      const by = Math.max(84, ay - sh);
      // dots always start at the crown (ax, top of head) and step toward the cloud, wherever it was clamped to
      const hx = (ax - bx) / K, hy = (drawY - S.r * 1.02 - by) / K;
      const cx0 = clamp(hx, 14, TH.w - 14), cy0 = TH.h - 34;
      const lerp = (a, b, f) => a + (b - a) * f;
      [[0.18, 7], [0.55, 12]].forEach(([f, sz], i) => {
        dots[i].style.left = (lerp(hx, cx0, f) - sz / 2).toFixed(1) + 'px';
        dots[i].style.top = (lerp(hy, cy0, f) - sz / 2).toFixed(1) + 'px';
        dots[i].style.bottom = 'auto';
      });
      cl.style.transformOrigin = `${cx0.toFixed(0)}px 100%`;
      bub.style.transformOrigin = '0 0';
      bub.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px) scale(${K.toFixed(3)})`;
      bub.style.opacity = String(1 - out);
    };

    const tick = (force) => {
      if (gen !== this._gen) { renderer.setAnimationLoop(null); return; }
      if (![S.px, S.py, S.vx, S.vy, S.r, S.scrollVel, S.activity, S.walk, S.puff, S.puffV, S.dockX ?? 0, S.hero.r, S.hero.fx, S.hero.fy].every(Number.isFinite)) {
        S.init = false; S.vx = S.vy = S.scrollVel = S.activity = S.walk = S.puff = S.puffV = 0; S.dockX = null; S.lastScroll = window.scrollY;
        if (!Number.isFinite(S.hero.r) || !Number.isFinite(S.hero.fx) || !Number.isFinite(S.hero.fy)) layout();
        if (!Number.isFinite(S.hero.r) || !Number.isFinite(S.hero.fx)) return;
      }
      const nowMs = performance.now();
      const moving = Math.abs(S.vx) + Math.abs(S.vy) > 4 || S.activity > 0.02 || Math.abs(S.walk) > 0.02;
      const calm = !moving && (clock.elapsedTime - S.lastPtrT) > 2.5 && Math.abs(S.puff) < 0.01 && U.uTouchAmt.value < 0.01 && S.wind.lengthSq() < 1e-4 && (clock.elapsedTime - S.startleAt) > 3;
      if (force !== true && nowMs - S.lastFrame < (calm ? 33 : 16) - 1.5) return;
      S.lastFrame = nowMs;
      const dt = Math.max(1 / 240, Math.min(clock.getDelta(), 0.05)), t = clock.elapsedTime, R = this.isReduced();

      // ── scroll-driven travel: hero → bottom dock ──
      const hr = anchor.getBoundingClientRect();
      if (!hr.height || !S.W || !S.H) { layout(); return; }
      const hx = hr.left + S.hero.fx * hr.width, hy = hr.top + S.hero.fy * hr.height;
      const small = S.W < 760;
      const dr = small ? 30 : clamp(S.W * 0.034, 40, 58);
      const margin = Math.max(18, S.W * 0.03) + dr * 1.05;
      const mode = this.getAttribute('dock') || 'right';
      let dx = mode === 'left' ? margin : S.W - margin;
      if (mode === 'roam') {
        if (S.dockX == null) S.dockX = S.W - margin;
        const aim = S.hasPtr && !S.touch && (t - S.lastPtrT) < 6 ? clamp((S.ptr.x + 1) / 2 * S.W, margin, S.W - margin) : S.dockX;
        S.dockX = ease(S.dockX, aim, 0.9, dt);
        dx = S.dockX;
      }
      const hopOn = this.hasAttribute('hop') && !['false', 'off'].includes(this.getAttribute('hop'));
      const ddy = hasLegs ? S.H - 2 - FEET * dr : S.H - FOOTR * dr;
      const holdSel = this.getAttribute('hold'), holdEl = holdSel && document.querySelector(holdSel);
      const holdRun = holdEl ? Math.max(0, holdEl.offsetHeight - hr.height) : 0;
      const sc = window.scrollY - holdRun;
      let hq = holdRun ? smooth(0.08, 0.5, window.scrollY / holdRun) : 0;
      const hX = hr.left + this.num(small ? 'hold-x-small' : 'hold-x', small ? 0.78 : 0.86) * hr.width, hY = hr.top + this.num(small ? 'hold-y-small' : 'hold-y', 0.8) * hr.height;
      const hx0 = hx + (hX - hx) * hq, hy0 = hy + (hY - hy) * hq, hR = S.hero.r * (1 + (this.num('hold-scale', 0.42) - 1) * hq);
      S.prog = clamp(sc / Math.max(S.hero.h * 0.6, 1), 0, 1) || 0;
      const p = S.prog, e = p * p * p * (p * (p * 6 - 15) + 10);
      // ── footer: leap up from the dock into a mini-hero pose ──
      let fe = 0;
      if (footerEl && !small) { const fr = footerEl.getBoundingClientRect(); const f = smooth(0.2, 0.7, (S.H - fr.top) / S.H); fe = f * f * (3 - 2 * f); }
      S.foot = fe;
      const D = smooth(0.8, 1, p) * (1 - fe); // 1 = grounded at the bottom edge
      S.lit = ease(S.lit ?? 0, smooth(0.15, 0.9, p), 6, dt); applyLight(S.lit);
      // ── hopping along the bottom edge ──
      let hopY = 0, hopSq = 0, hopTilt = 0; S.hopping = false;
      if (hopOn && !R) {
        const hp = S.hop || (S.hop = { x: dx, from: dx, to: dx, t0: -9, dur: 0.6, h: 0, ant: 0.13, dir: 0, next: t + 0.8, landed: true });
        if (p > 0.985 && fe < 0.02) {
          // goal: cursor (roam: anywhere · right/left: only over the footer) → else home dock; roam wanders when idle
          // follows the cursor's x anywhere on the page (lagging, stops a little short); home after 6s idle / pointer gone
          const live = S.hasPtr && !S.touch && !S.ptrOut && (t - S.lastPtrT) < 6 && !((S.fearA || 0) > 0.2);
          let goal = null;
          if (live) {
            const gx = clamp((S.ptr.x + 1) / 2 * S.W, margin, S.W - margin);
            S.ptrXs = S.ptrXs == null ? gx : ease(S.ptrXs, gx, 2.5, dt);
            const g = S.ptrXs - hp.x, stop = dr * 1.1;
            goal = clamp(Math.abs(g) > stop ? S.ptrXs - Math.sign(g) * stop : hp.x, margin, S.W - margin);
          } else S.ptrXs = null;
          const wander = goal == null && mode === 'roam';
          if (goal == null && !wander) goal = dx;
          const gap = goal == null ? 0 : goal - hp.x, far = Math.abs(gap) > dr * 0.5;
          if (t - hp.t0 > hp.ant + hp.dur && hp.landed && (far ? t > hp.next - 0.35 : wander && t > hp.next)) {
            const maxHop = (small ? 120 : 200);
            hp.from = hp.x;
            if (far) hp.to = hp.x + Math.sign(gap) * Math.min(Math.abs(gap), maxHop);
            else {
              let dir = Math.random() < 0.5 ? -1 : 1; const dist = (60 + Math.random() * 160) * (small ? 0.55 : 1);
              if (hp.x + dir * dist > S.W - margin || hp.x + dir * dist < margin) dir = -dir;
              hp.to = hp.x + dir * dist;
            }
            hp.to = clamp(hp.to, margin, S.W - margin);
            hp.dir = Math.sign(hp.to - hp.from) || 1; hp.t0 = t; hp.landed = false; hp.ant = 0.16;
            hp.dur = 0.42 + Math.abs(hp.to - hp.from) / 1300;
            hp.h = dr * (0.6 + Math.random() * 0.45) * (1 + S.activity * 0.3);
          }
          const s2 = t - hp.t0;
          if (!hp.landed && s2 < hp.ant) hopSq = -0.2 * Math.sin(s2 / hp.ant * Math.PI); // crouch, then spring
          else if (!hp.landed && s2 < hp.ant + hp.dur) {
            const u = (s2 - hp.ant) / hp.dur;
            hp.x = hp.from + (hp.to - hp.from) * (0.7 * u + 0.3 * u * u * (3 - 2 * u));
            hopY = 4 * hp.h * u * (1 - u);
            hopSq = 0.13 * Math.sin(Math.min(u * 2.2, 1) * Math.PI / 2) * (1 - smooth(0.55, 1, u)); // stretch in the air
            hopTilt = 0;
            S.hopping = true;
          } else if (!hp.landed) {
            hp.landed = true; hp.x = hp.to; S.landV = -3.2; S.puffV += 3.5;
            hp.next = t + (far ? 0.1 : (Math.random() < 0.35 ? 0.12 : 0.45 + Math.random() * 1.6)) / (1 + S.activity * 2.5);
          }
        } else { hp.x = dx; hp.landed = true; hp.next = t + 0.5; }
        hp.x = clamp(hp.x, margin, S.W - margin);
        dx = hp.x;
      }
      S.landV = (S.landV || 0) + (-(S.land || 0) * 150 - (S.landV || 0) * 10) * dt;
      S.land = (S.land || 0) + S.landV * dt;
      if (!Number.isFinite(S.land) || R) { S.land = 0; S.landV = 0; }
      hopSq += S.land;
      S.hopSq = hopSq; S.hopTilt = hopTilt; S.hopDir = S.hop ? S.hop.dir : 0;
      // arc: dips below the straight line mid-flight so it feels like it drops, not slides
      let tx = hx0 + (dx - hx0) * e;
      let ty = hy0 + (ddy - hy0) * e + Math.sin(e * Math.PI) * S.H * 0.06;
      let tr = hR + (dr - hR) * Math.pow(e, 0.7);
      if (fe > 0) {
        const fx = S.W * this.num('foot-x', 0.65), fy = S.H * this.num('foot-y', 0.66), frr = Math.max(dr, S.hero.r * this.num('foot-scale', 0.85));
        tx += (fx - tx) * fe; ty += (fy - ty) * fe; tr += (frr - tr) * fe;
      }
      if (!S.init || R) { S.px = tx; S.py = ty; S.r = tr; S.vx = S.vy = 0; S.init = true; }
      else {
        const K = 70, D = 12.5;
        S.vx += ((tx - S.px) * K - S.vx * D) * dt; S.vy += ((ty - S.py) * K - S.vy * D) * dt;
        S.px += S.vx * dt; S.py += S.vy * dt;
        S.r = ease(S.r, tr, 9, dt);
      }
      if (p > 0.985 && fe < 0.02 && S.py > ty) { S.py = ty; if (S.vy > 0) S.vy = 0; } // never sink below the floor
      // scroll activity → trotting bob while docked
      const sv = (sc - S.lastScroll) / Math.max(dt, 1 / 240); S.lastScroll = sc;
      S.scrollVel = ease(S.scrollVel, sv, 10, dt);
      const walkV = mode === 'roam' ? S.vx / Math.max(S.r, 1) : 0;
      S.walk = ease(S.walk, clamp(walkV / 3, -1, 1), 6, dt);
      S.activity = ease(S.activity, R ? 0 : clamp(Math.abs(S.scrollVel) / 1400 + Math.abs(S.walk), 0, 1) * smooth(0.85, 1, p), 6, dt);
      const legAmt = hasLegs ? smooth(0.55, 1, e) * (1 - fe) : 0;
      S.legs = R ? legAmt : ease(S.legs ?? 0, legAmt, 7, dt);
      const L = S.legs;
      const bob = Math.abs(Math.sin(t * 11)) * S.r * 0.16 * S.activity * (1 - L) * (hopOn ? 0 : 1) * (1 - D);
      const nowDocked = p > 0.985;
      if (nowDocked && !S.docked && !R) { S.puffV += 7; S.blinkStart = t; }
      S.docked = nowDocked;

      // crop grows + shifts down as the legs come out
      const Hs = CROP + L * 0.42, cyW = -L * 0.5;
      camera.position.set(0, cyW + 0.35, Hs / TAN); camera.lookAt(0, cyW, 0);
      const Rc = S.r * Hs;
      S.Hs = Hs; S.cyW = cyW;
      sizeBuffer(Rc);
      const drawY = S.py - bob - hopY - hopSq * S.r * 0.9 * (1 - D);
      const ccy = drawY - cyW * S.r;
      canvas.style.transform = `translate(${(S.px - Rc).toFixed(2)}px, ${(ccy - Rc).toFixed(2)}px) scale(${(2 * Rc / S.buf).toFixed(4)})`;
      S.cx = S.px / S.W * 2 - 1; S.cy = 1 - drawY / S.H * 2; S.rPx = S.r * 1.05;
      const lb = this.label;
      lb.style.transform = `translate(${S.px.toFixed(1)}px, ${(drawY + S.r * 1.3).toFixed(1)}px) translateX(-50%)`;
      lb.style.opacity = String(1 - smooth(0.02, 0.18, p));
      const inkNow = this.getAttribute('label-ink') || this.getAttribute('labelink'); if (inkNow && lb.style.color !== inkNow && lb._ink !== inkNow) { lb.style.color = inkNow; lb._ink = inkNow; }
      if (this.bubble) think(t, drawY);
      if (this.shadow) {
        const lift = Math.max(0, S.H - FOOTR * S.r - drawY), k = 1 / (1 + lift / Math.max(S.r * 1.6, 1));
        const sx = S.r * 2.3 * k * (1 + Math.max(0, -hopSq) * 0.6) / 100, sy = S.r * 0.34 * k / 20;
        this.shadow.style.transform = `translate(${(S.px - 50).toFixed(1)}px, ${(S.H - 3 - 10).toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
        this.shadow.style.opacity = (D * (0.35 + 0.65 * k)).toFixed(3);
      }

      S.ptrVel.multiplyScalar(Math.exp(-6 * dt));
      const ptrActive = S.hasPtr && !S.ptrOut && (t - S.lastPtrT) < (S.touch ? 3.5 : 7);
      const distPx = Math.hypot((S.ptr.x - S.cx) * S.W / 2, (S.ptr.y - S.cy) * S.H / 2);
      S.near = ease(S.near, ptrActive && !S.touch ? 1 - smooth(S.rPx * 0.9, S.rPx * 2.0, distPx) : 0, 5, dt);
      const cur = ptrActive && !S.touch && distPx < S.rPx * 1.35 && hitBody() ? 'pointer' : '';
      if (cur !== S.cursor) { S.cursor = cur; cursorEl.style.cursor = cur; }

      let lx = 0, ly = 0;
      if (ptrActive && !R) { lx = clamp((S.ptr.x - S.cx) / 1.2, -1, 1); ly = clamp((S.ptr.y - S.cy) / 1.2, -1, 1); }
      S.lean.x = ease(S.lean.x, lx, 2.2, dt); S.lean.y = ease(S.lean.y, ly, 2.2, dt);
      if (t > S.nextTurn) { S.idleYawT = (Math.random() - 0.5) * 0.5; S.nextTurn = t + 6 + Math.random() * 5; }
      S.idleYaw = ease(S.idleYaw, R ? 0 : S.idleYawT, 0.7, dt);
      if (R) { S.puff = 0; S.puffV = 0; }
      else { S.puffV += (-S.puff * 55 - S.puffV * 6.5) * dt; S.puff += S.puffV * dt; }
      const pf = S.puff, br = R ? 0 : Math.sin(t * 1.35) * 0.012;
      // squash & stretch from travel velocity + landing bob
      const st = R ? 0 : clamp(Math.abs(S.vy) / Math.max(S.r * 14, 1), 0, 0.16) - Math.abs(Math.cos(t * 11)) * 0.05 * S.activity;
      creature.scale.set((1 - br * 0.5 + pf * 0.03) * (1 - st * 0.5), (1 + br + pf * 0.035) * (1 + st), (1 - br * 0.5 + pf * 0.03) * (1 - st * 0.5));
      creature.position.set(S.lean.x * 0.06 * (1 - D), R ? 0 : Math.sin(t * 1.35 - 0.6) * 0.012 * (1 - D), -pf * 0.08);
      const tilt = R ? 0 : clamp(S.vx / Math.max(S.r * 30, 1), -0.25, 0.25);
      const rk = 1 - D; // docked: upright, facing the viewer
      S.lean5 = ease(S.lean5 || 0, S.hopping && !R ? S.hopDir : 0, S.hopping ? 8 : 12, dt);
      creature.rotation.set((-S.lean.y * 0.13 - pf * 0.06) * rk, (BASE_YAW * (1 - e * 0.5) + S.idleYaw + S.lean.x * 0.3 + S.walk * 0.5 + (S.hopping ? S.hopDir * 0.25 : 0)) * rk, (-S.lean.x * 0.04 - tilt - (S.hopTilt || 0)) * rk - S.lean5 * 0.087 * D); // ≤5° lean into travel
      if (S.hopSq) { const q = S.hopSq; creature.scale.x *= 1 - q * 0.55; creature.scale.z *= 1 - q * 0.55; creature.scale.y *= 1 + q; }
      // fearTarget (set by the page): shrink back + lean away, with a faint tremble
      if ((S.fearA || 0) > 0.001) {
        const f = S.fearA, away = S.fearX != null && S.fearX < S.px ? -1 : 1;
        creature.scale.multiplyScalar(1 - 0.12 * f); creature.scale.y *= 1 - 0.05 * f;
        creature.rotation.z += away * 0.09 * f + (R ? 0 : Math.sin(t * 31) * 0.007 * f);
        creature.position.x -= away * 0.06 * f; creature.position.z -= 0.12 * f;
      }
      if (D > 0) creature.position.y += D * ((creature.scale.y - 1) - creature.position.y); // squash/breathe from the feet, bottom pinned
      if (D > 0) creature.position.y += D * Math.abs(Math.sin(creature.rotation.z)) * 0.9; // leaning corner stays on the floor
      if (hasLegs) {
        // trot: body bobs in-scene, feet alternate lifting while the page scrolls / it walks
        const ph = t * 11, act = S.activity * L;
        creature.position.y += Math.abs(Math.sin(ph)) * 0.07 * act - (1 - Math.abs(Math.sin(ph))) * 0.02 * act + (R ? 0 : Math.sin(t * 1.35) * 0.015 * L);
        legsGroup.visible = L > 0.01;
        const k = 0.35 + 0.65 * L;
        legsGroup.scale.setScalar(k);
        legsGroup.position.set(creature.position.x, (1 - L) * 1.0, 0);
        legsGroup.rotation.set(0, creature.rotation.y * 0.8, 0);
        for (const lg of legs) {
          const lift = R ? 0 : Math.max(0, Math.sin(ph + (lg.side > 0 ? Math.PI : 0))) * act;
          poseLeg(lg, lift, R ? 0 : (0.5 + 0.5 * Math.sin(t * 1.35)) * 0.02);
        }
      }
      creature.updateMatrixWorld(true);
      inv.copy(creature.quaternion).invert();

      wt.set(S.ptrVel.x * (S.W / S.H), S.ptrVel.y).multiplyScalar(0.03);
      wt.x -= S.vx / Math.max(S.r * 60, 1); wt.y += S.vy / Math.max(S.r * 60, 1);
      if (wt.length() > 0.55) wt.setLength(0.55);
      if (R) wt.set(0, 0);
      S.windV.x += ((wt.x - S.wind.x) * 60 - S.windV.x * 7) * dt; S.windV.y += ((wt.y - S.wind.y) * 60 - S.windV.y * 7) * dt;
      S.wind.addScaledVector(S.windV, dt);
      const amb = R ? 0 : 1;
      U.uWind.value.set(S.wind.x + amb * Math.sin(t * 0.6) * 0.03, S.wind.y + amb * Math.cos(t * 0.45) * 0.015, amb * Math.sin(t * 0.37) * 0.02).applyQuaternion(inv);
      U.uGrav.value.set(0, -1, 0).applyQuaternion(inv);
      U.uPuff.value = clamp(pf, -0.15, 1.2);
      U.uTime.value = t;
      let touching = false;
      if (ptrActive && (t - S.lastPtrT) < 1.5) {
        touchRay.setFromCamera(ptrToCanvas(), camera);
        touchHits.length = 0; proxy.raycast(touchRay, touchHits);
        if (touchHits.length) {
          touching = true;
          creature.worldToLocal(U.uTouch.value.copy(touchHits.sort((a, b) => a.distance - b.distance)[0].point));
        }
      }
      U.uTouchAmt.value = ease(U.uTouchAmt.value, touching ? 1 : 0, touching ? 10 : 3.5, dt);
      tmp.set(S.ptrVel.x * (S.W / S.H), S.ptrVel.y, 0).multiplyScalar(0.12);
      if (tmp.length() > 1.4) tmp.setLength(1.4);
      tmp.applyQuaternion(inv);
      U.uTouchVel.value.lerp(tmp, 1 - Math.exp(-8 * dt));

      const since = t - S.startleAt, startled = since < 0.75, looking = since > 0.95 && since < 2.9;
      if (t > S.nextGlance) {
        if (!startled && !looking && (t - S.lastPtrT) > 1.2) {
          const g = glances[Math.random() * glances.length | 0];
          S.glanceTarget.set(g[0], g[1], g[2]); S.glanceUntil = t + 1.3 + Math.random() * 1.2;
        }
        S.nextGlance = t + 7 + Math.random() * 7;
      }
      const watching = S.activity > 0.25 && !startled; // watches the page scroll past
      const bored = t < S.glanceUntil && !startled && !looking && !watching;
      if ((ptrActive && !S.touch) || looking) { ray.setFromCamera(ptrToCanvas(), camera); if (!ray.ray.intersectPlane(plane, target)) target.set(0, 0, 3); }
      else if (S.hopping && !startled) target.set(S.hopDir * 3.5, 0.3, 2.5);
      else if (watching) target.set(S.walk * 4 - 0.6, S.scrollVel >= 0 ? 3.4 : 1.6, 2.2);
      else if (bored) target.copy(S.glanceTarget);
      else if (ptrActive || looking) { ray.setFromCamera(ptrToCanvas(), camera); if (!ray.ray.intersectPlane(plane, target)) target.set(0, 0, 3); }
      else target.set(-2.4 + Math.sin(t * 0.27) * 1.8, 0.2 + Math.sin(t * 0.41 + 1) * 0.9 + e * 1.2, 3.5);
      const ft = typeof this.fearTarget === 'function' ? this.fearTarget() : this.fearTarget;
      S.fearA = ease(S.fearA || 0, ft ? 1 : 0, ft ? 2.4 : 1.6, dt);
      if (ft && !startled) {
        const R2 = S.r * (S.Hs || CROP), cyc = drawY - (S.cyW || 0) * S.r;
        ptrC.set((ft.x - (S.px - R2)) / (2 * R2) * 2 - 1, 1 - (ft.y - (cyc - R2)) / (2 * R2) * 2);
        ray.setFromCamera(ptrC, camera); if (!ray.ray.intersectPlane(plane, target)) target.set(-3, 2, 2);
        S.fearX = ft.x;
      }

      let up = 0.4 + S.near * 0.3, lo = -0.62;
      if (bored) up = 0.18;
      if (watching) up = 0.62;
      if (startled) { up = 0.88; lo = -0.82; } else if (looking) { up = 0.04; lo = -0.34; }
      if (S.fearA > 0.02 && !startled) { up += (0.82 - up) * S.fearA; lo += (-0.76 - lo) * S.fearA; }
      if (!S.sBlink && since > 0.75) { S.blinkStart = t; S.sBlink = true; }
      if (t > S.nextBlink) {
        if (!startled) S.blinkStart = t;
        S.nextBlink = Math.random() < 0.18 ? t + 0.32 : t + 3 + Math.random() * 4;
      }
      S.up = ease(S.up, up, 12, dt); S.lo = ease(S.lo, lo, 12, dt);
      S.eyeScale = ease(S.eyeScale, 1 + S.near * 0.05 + (startled ? 0.07 : 0), 10, dt);
      const tb = (t - S.blinkStart) / 0.18;
      let b = tb >= 0 && tb < 1 ? (tb < 0.4 ? tb / 0.4 : 1 - (tb - 0.4) / 0.6) : 0; b = b * b * (3 - 2 * b);

      for (const eye of eyes) {
        eye.socket.getWorldPosition(eyeW);
        tmp.subVectors(target, eyeW).applyQuaternion(inv);
        const yaw = clamp(Math.atan2(tmp.x, tmp.z), -0.62, 0.62), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.45, 0.45);
        eye.yaw = ease(eye.yaw, yaw, bored ? 6 : 14, dt); eye.pitch = ease(eye.pitch, pitch, bored ? 6 : 14, dt);
        eye.ball.rotation.set(-eye.pitch, eye.yaw, 0);
        eye.socket.scale.setScalar(S.eyeScale);
        const skew = looking ? (eye.side < 0 ? -0.04 : 0.08) : (eye.side < 0 ? 0 : -0.04);
        const uh = S.up + skew + eye.pitch * 0.35, lh = S.lo + eye.pitch * 0.1;
        const fu = uh + (lh - 0.04 - uh) * b;
        eye.upper.rotation.x = -Math.asin(clamp(fu, -0.98, 0.98));
        eye.lower.rotation.x = -Math.asin(clamp(lh, -0.98, 0.98));
      }

      {
        // flaps only while the bubble text is typing out; otherwise stays shut
        const tu = t - TH.t0, typeEnd = 0.32 + (TH.text ? TH.text.length : 0) / 26;
        const typing = this.bubble && tu > 0.3 && tu < typeEnd && tu < TH.dur;
        let want = typing ? 0.18 + 0.2 * (0.5 - 0.5 * Math.cos(tu * Math.PI * 2 * 7)) : 0;
        if (startled) want = 0.55;
        if (this._slurp > 0) want = Math.max(want, this._slurp);
        if (R) want = 0;
        BK.open = ease(BK.open, want, this._slurp > 0 ? 90 : (want > BK.open ? 40 : 30), dt);
        const o = BK.open;
        upperJaw.rotation.x = -0.16 - o * 0.22;
        lowerJaw.rotation.x = -0.02 + o * 0.7; // stays under the upper jaw's hook when shut
        tongue.rotation.x = -o * 0.28 + (R ? 0 : Math.sin(t * 9) * 0.1 * o);
        tongue.position.z = 0.03 + o * 0.06;
        tongue.rotation.y = R ? 0 : Math.sin(t * 6.3) * 0.12 * o;
        // wattle + comb jiggle: spring driven by vertical motion, puff and hops
        const kick = (S.vy - BK.lastVy) / Math.max(S.r * 40, 1); BK.lastVy = S.vy;
        BK.jigV += (-BK.jig * 160 - BK.jigV * 7) * dt + kick + S.puffV * 0.02 * dt * 60 * 0.02;
        BK.jig = clamp(BK.jig + BK.jigV * dt, -0.6, 0.6);
        if (R || !Number.isFinite(BK.jig)) { BK.jig = 0; BK.jigV = 0; }
        wattles.forEach((w, i) => { w.rotation.x = BK.jig * 0.9 - o * 0.4; w.rotation.z = (i ? 1 : -1) * (0.08 + BK.jig * 0.25); });
        beak.rotation.x = -S.lean.y * 0.05;
      }
      renderer.render(scene, camera);

      S.fpsAcc += dt; S.fpsN++;
      if (S.fpsAcc >= 0.5) {
        const fps = Math.round(S.fpsN / S.fpsAcc); S.fpsAcc = 0; S.fpsN = 0;
        const cap = calm ? 30 : 60;
        if (fps < cap * 0.75) {
          S.slowFor += 0.5;
          if (S.slowFor >= 2) {
            S.slowFor = 0;
            if (shells > 20) setShells(shells - 6);
            else if (S.dpr > 1) { S.dpr = 1; S.buf = 0; }
          }
        } else S.slowFor = 0;
      }
    };

    const toNdc = (e) => {
      const x = (e.clientX / S.W) * 2 - 1, y = -(e.clientY / S.H) * 2 + 1;
      const now = performance.now() / 1000;
      if (S.hasPtr) {
        const dtp = Math.max(now - S.lastMoveReal, 1 / 240);
        S.ptrVel.x = S.ptrVel.x * 0.5 + clamp((x - S.ptr.x) / dtp, -20, 20) * 0.5;
        S.ptrVel.y = S.ptrVel.y * 0.5 + clamp((y - S.ptr.y) / dtp, -20, 20) * 0.5;
      }
      S.ptr.set(x, y); S.hasPtr = true; S.ptrOut = false; S.touch = e.pointerType === 'touch'; S.lastPtrT = clock.elapsedTime; S.lastMoveReal = now;
    };
    const onMove = (e) => toNdc(e);
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('a,button,input,select,textarea,label')) return;
      toNdc(e);
      const distPx = Math.hypot((S.ptr.x - S.cx) * S.W / 2, (S.ptr.y - S.cy) * S.H / 2);
      if (distPx > S.rPx * 1.35 || !hitBody()) return; // only his body catches pokes
      S.startleAt = clock.elapsedTime; S.sBlink = false; S.glanceUntil = 0;
      if (!annoy) TH.poked = true;
      else if (AN.inHero) { AN.queue = [{ text: pick(['?!', '#@%&!', 'eep!?', '!!∆!']), dur: 1.8 }]; AN.cut = true; }
      else if (!AN.muted && nowR() >= AN.lockUntil) {
        const n = nowR(); if (n - AN.lastClick > 5) AN.clickN = 0;
        AN.lastClick = n; AN.clickN++;
        const line = (POOL().click || [])[AN.clickN - 1];
        if (line && AN.clickN >= 5) { fire('click', { text: line, dur: 2.6, then: [{ text: '...', dur: 10 }, { text: '...fine. what.', dur: 3 }] }); AN.lockUntil = n + 15.6; AN.clickN = 0; }
        else if (line) fire('click', { text: line, dur: 2.2 });
      }
      S.nextBlink = S.startleAt + 3.2 + Math.random() * 3;
      if (!this.isReduced()) S.puffV += 9;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    const onOut = (e) => { if (!e.relatedTarget) S.ptrOut = true; };
    const onBlur = () => { S.ptrOut = true; };
    document.addEventListener('pointerout', onOut); window.addEventListener('blur', onBlur);

    const ro = new ResizeObserver(() => layout()); ro.observe(anchor); ro.observe(layer);
    const kick = () => { if (gen !== this._gen) return; layout(); tick(true); };
    kick(); requestAnimationFrame(kick); setTimeout(kick, 250); setTimeout(kick, 1000);
    const onScroll = () => {
      if (!running) tick(true);
      if (!annoy) return;
      const n = nowR(), y = window.scrollY, gap = n - AN.sT, v = Math.abs(y - AN.sY) / Math.max(gap, 0.016);
      AN.sV = gap > 0.25 ? v : AN.sV * 0.5 + v * 0.5; AN.sY = y; AN.sT = n; AN.lastScroll = n; AN.idleArmed = true;
      if (AN.sV > 2800 && n - AN.lastFast > 10 && !AN.inHero) { AN.lastFast = n; fire('fast_scroll'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const onVisA = () => {
      if (!annoy) return;
      if (document.hidden) { AN.hiddenAt = Date.now(); return; }
      if (!AN.hiddenAt) return;
      const s = (Date.now() - AN.hiddenAt) / 1000; AN.hiddenAt = 0;
      if (s > 5) fire('tab_return', { map: (l) => l.replace('{n}', String(Math.round(s))) });
    };
    document.addEventListener('visibilitychange', onVisA);
    window.addEventListener('resize', kick);
    let running = false;
    const update = () => {
      const run = !document.hidden;
      if (run && !running) { clock.getDelta(); renderer.setAnimationLoop(tick); }
      else if (!run && running) renderer.setAnimationLoop(null);
      running = run;
    };
    document.addEventListener('visibilitychange', update);
    update();

    this.cleanup = () => {
      renderer.setAnimationLoop(null); ro.disconnect();
      window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', kick);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDown); document.removeEventListener('pointerout', onOut); window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', update); document.removeEventListener('visibilitychange', onVisA);
      cursorEl.style.cursor = '';
      renderer.dispose();
    };
  }
}
customElements.define('fur-monster-ground', FurMonsterDock);
})();

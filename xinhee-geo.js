// Compact Xinhee model loader (replaces .3dm + rhino3dm WASM). Output mimics Rhino3dmLoader:
// Group{userData.layers} > Mesh/Line children with userData.attributes {layerIndex, name, colorSource}.
const cache = new Map();
const fetchBuf = (url) => {
  if (!cache.has(url)) cache.set(url, fetch(url).then(async (r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const b = await r.arrayBuffer(), u = new Uint8Array(b, 0, 2);
    if (u[0] === 0x1f && u[1] === 0x8b) return new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return b;
  }));
  return cache.get(url);
};

export async function loadXinhee(url, THREE) {
  const buf = await fetchBuf(url);
  const hl = new Uint32Array(buf, 0, 1)[0];
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl + ((4 - (hl + 4) % 4) % 4);
  const { mn, span } = head;
  const pos = (o) => {
    const q = new Int16Array(buf, base + o.p, o.c * 3), f = new Float32Array(o.c * 3);
    for (let i = 0; i < f.length; i++) { const k = i % 3; f[i] = (q[i] + 32768) / 65535 * span[k] + mn[k]; }
    return f;
  };
  const layers = head.layers.map(([fullPath, [r, g, b], vis]) => ({ fullPath, name: fullPath.split('::').pop(), color: { r, g, b, a: 255 }, visible: !!vis }));
  const root = new THREE.Group(); root.userData.layers = layers;
  const attr = (l, n) => ({ layerIndex: l, name: n, colorSource: { value: 0 } });
  const defMat = new THREE.MeshStandardMaterial(), defLine = new THREE.LineBasicMaterial();
  for (const o of head.objs) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos(o), 3));
    let obj;
    if (o.k === 'm') {
      g.setIndex(new THREE.BufferAttribute(new Uint16Array(buf.slice(base + o.i, base + o.i + o.ic * 2)), 1));
      if (o.nr != null) {
        const q = new Int8Array(buf, base + o.nr, o.c * 3), n = new Float32Array(o.c * 3);
        for (let i = 0; i < n.length; i++) n[i] = q[i] / 127;
        g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      } else g.computeVertexNormals();
      obj = new THREE.Mesh(g, defMat);
    } else obj = new THREE.Line(g, defLine);
    obj.userData.attributes = attr(o.l, o.n);
    root.add(obj);
  }
  // trees: icosphere crown + open hex trunk, merged into one mesh (flat-shaded like the source)
  const T = head.trees, t = new Float32Array(buf, base + T.o, T.c * 11);
  const crown = new THREE.IcosahedronGeometry(1, 1), trunk = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).toNonIndexed();
  trunk.rotateX(Math.PI / 2); trunk.translate(0, 0, 0.5);
  const cp = crown.attributes.position.array, tp = trunk.attributes.position.array;
  const out = new Float32Array(T.c * (cp.length + tp.length)); let w = 0;
  for (let i = 0; i < T.c; i++) {
    const [bx, by, bz, tr, ttop, cx, cy, cz, rx, ry, rz] = t.subarray(i * 11, i * 11 + 11);
    const th = Math.max(0.01, ttop - bz), r = Math.max(tr, 0.05);
    for (let j = 0; j < tp.length; j += 3) { out[w++] = bx + tp[j] * r; out[w++] = by + tp[j + 1] * r; out[w++] = bz + tp[j + 2] * th; }
    for (let j = 0; j < cp.length; j += 3) { out[w++] = cx + cp[j] * rx; out[w++] = cy + cp[j + 1] * ry; out[w++] = cz + cp[j + 2] * rz; }
  }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(out, 3)); tg.computeVertexNormals();
  const tm = new THREE.Mesh(tg, defMat); tm.userData.attributes = attr(T.l, 'trees'); root.add(tm);
  crown.dispose(); trunk.dispose();
  return root;
}

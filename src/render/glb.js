// A minimal glTF 2.0 binary (.glb) reader for authored meshes (docs/hifi-models.md): every mesh's
// first primitive as plain typed arrays, by mesh name. Positions, normals, the first UV set and
// the indices; no scene graph, materials or skins (the pieces are placed by our own records).
// Runs once at load.

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/**
 * @param {ArrayBuffer} buf
 * @returns {Map<string, { positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint32Array }>}
 */
export function parseGlb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = off + 8;
    off += 8 + len;
  }
  if (!json || bin === null) throw new Error('glb: missing chunk');
  const read = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = a.count * SIZE[a.type];
    const start = bin + (v.byteOffset || 0) + (a.byteOffset || 0);
    const stride = v.byteStride || 0, el = SIZE[a.type] * T.BYTES_PER_ELEMENT;
    if (!stride || stride === el) return new T(buf.slice(start, start + n * T.BYTES_PER_ELEMENT));
    const out = new T(n), src = new DataView(buf);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < SIZE[a.type]; c++) {
      const p = start + k * stride + c * T.BYTES_PER_ELEMENT;
      out[k * SIZE[a.type] + c] = T === Float32Array ? src.getFloat32(p, true) : T === Uint32Array ? src.getUint32(p, true) : src.getUint16(p, true);
    }
    return out;
  };
  const out = new Map();
  for (const m of json.meshes) {
    const p = m.primitives[0], at = p.attributes;
    const idx = read(p.indices);
    out.set(m.name, {
      positions: read(at.POSITION), normals: read(at.NORMAL), uvs: read(at.TEXCOORD_0),
      indices: idx instanceof Uint32Array ? idx : Uint32Array.from(idx),
    });
  }
  return out;
}

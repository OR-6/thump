/**
 * Draw calls: a model's parts that never move on their own (lugs, rods, claws, stands, staves, frets, pins, grille
 * slots) are merged into one mesh per material under the group they belong to, so a drum is a handful of draws, not
 * sixty. Parts that animate are named and skipped (their subtrees stay as they are). Deterministic, DOM-free.
 */
import { BufferAttribute, BufferGeometry, Matrix4, Mesh, Object3D, type Material } from '@iwsdk/core';

const _rel = new Matrix4();
const _inv = new Matrix4();

/** A material's identity for merging: the same object, or the same look (type, colour, finish, maps). */
function key(m: Material): string {
  const a = m as Material & { color?: { getHex(): number }; metalness?: number; roughness?: number; map?: { uuid: string } | null; normalMap?: { uuid: string } | null; emissive?: { getHex(): number }; clearcoat?: number; side?: number; transparent?: boolean; opacity?: number; flatShading?: boolean };
  return [m.type, a.name, a.color?.getHex(), a.metalness, a.roughness, a.map?.uuid, a.normalMap?.uuid, a.emissive?.getHex(), a.clearcoat, a.side, a.transparent, a.opacity, a.flatShading].join('|');
}

/**
 * Merge every mesh under `group` (not inside a skipped subtree) into one mesh per material, children of `group`.
 * `skip(o)`: true for an object whose whole subtree must stay (it moves, or its material changes per instance).
 */
export function mergeStatic(group: Object3D, skip: (o: Object3D) => boolean = () => false): void {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map<string, { mat: Material; geos: BufferGeometry[]; cast: boolean; recv: boolean; meshes: Mesh[] }>();
  const walk = (o: Object3D) => {
    for (const c of o.children) {
      if (skip(c)) continue;
      const m = c as Mesh;
      if (m.isMesh && c.children.length === 0 && !Array.isArray(m.material) && !(m as unknown as { isInstancedMesh?: boolean }).isInstancedMesh && m.visible) {
        const k = key(m.material);
        let b = buckets.get(k);
        if (!b) buckets.set(k, (b = { mat: m.material, geos: [], cast: false, recv: false, meshes: [] }));
        _rel.multiplyMatrices(_inv, m.matrixWorld);
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(_rel);
        b.geos.push(g);
        b.cast ||= m.castShadow;
        b.recv ||= m.receiveShadow;
        b.meshes.push(m);
      }
      walk(c);
    }
  };
  walk(group);
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) {
      for (const g of b.geos) g.dispose();
      continue;
    }
    const merged = concat(b.geos);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    for (const m of b.meshes) m.removeFromParent();
    const mesh = new Mesh(merged, b.mat);
    mesh.name = `${group.name || 'Group'}:merged`;
    mesh.userData.merged = true;
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    group.add(mesh);
  }
  // (groups left empty by the merge go too)
  const prune = (o: Object3D) => {
    for (const c of [...o.children]) {
      prune(c);
      if (!(c as Mesh).isMesh && c.children.length === 0 && c.type === 'Group' && !skip(c)) c.removeFromParent();
    }
  };
  prune(group);
}

/** Non-indexed geometries end to end: positions, normals, and uvs when every one has them. */
function concat(geos: BufferGeometry[]): BufferGeometry | null {
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  if (!n) return null;
  const withUv = geos.some((g) => g.getAttribute('uv'));
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = withUv ? new Float32Array(n * 2) : null;
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const q = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(o + i) * 3] = p.getX(i);
      pos[(o + i) * 3 + 1] = p.getY(i);
      pos[(o + i) * 3 + 2] = p.getZ(i);
      nor[(o + i) * 3] = q.getX(i);
      nor[(o + i) * 3 + 1] = q.getY(i);
      nor[(o + i) * 3 + 2] = q.getZ(i);
      if (uv && u) {
        uv[(o + i) * 2] = u.getX(i);
        uv[(o + i) * 2 + 1] = u.getY(i);
      }
    }
    o += p.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Free the geometry merges made under `root` (before it is cleared and laid out again). */
export function disposeMerged(root: Object3D): void {
  root.traverse((o) => {
    if (o.userData.merged) (o as Mesh).geometry.dispose();
  });
}

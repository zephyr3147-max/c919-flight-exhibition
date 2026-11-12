import * as THREE from 'three';
import { PARTS, SYSTEMS, capabilities, clamp, emptyPose } from '../../state/contract.js';

// Engineering fixture only. No source FBX or manufacturer geometry is embedded.
export async function createAircraft({ materials = {}, signal } = {}) {
  signal?.throwIfAborted();
  const root = new THREE.Group(), datum = new THREE.Group(), parts = new Map(), pickables = [], resources = new Set();
  root.add(datum);
  root.name = 'engineering-aircraft';
  const paint = new THREE.MeshStandardMaterial({ color: 0xc9d2d9, roughness: .65, metalness: .12 });
  const structure = new THREE.MeshStandardMaterial({ color: 0x64808c, roughness: .7, metalness: .18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303f4c, roughness: .85 });
  resources.add(paint); resources.add(structure); resources.add(dark);
  const selectedMaterial = paint.clone(); selectedMaterial.color.setHex(0xef8c44); resources.add(selectedMaterial);
  const rest = new Map(), motions = new Map();
  for (const record of PARTS) {
    const object = record.id === 'aircraft' ? root : new THREE.Group(); object.name = record.id;
    const part = { ...record, description: '工程占位，用于验证部件层级、位置关系和接口；不是C919真实制造结构。',
      object, anchor: new THREE.Vector3(), capabilities: capabilities({ control: record.systemId === 'flight-controls' }),
      sourceType: 'placeholder', sourceRefs: ['CONTRACT.md 1.0', 'docs/design/ART_BIBLE.md'] };
    parts.set(record.id, part);
    if (record.parentId) (record.parentId === 'aircraft' ? datum : parts.get(record.parentId).object).add(object);
  }
  function configure(id, position, shift = [0, 0, 0], share = 1) {
    const object = parts.get(id).object; object.position.set(...position);
    motions.set(id, { shift: new THREE.Vector3(...shift), share });
  }
  function mesh(id, geometry, material = paint, position = [0, 0, 0], rotation = null) {
    resources.add(geometry); const object = new THREE.Mesh(geometry, material);
    object.position.set(...position); if (rotation) object.rotation.set(...rotation);
    object.userData.partId = id; object.userData.baseMaterial = material; parts.get(id).object.add(object); pickables.push(object);
    return object;
  }
  const box = (id, size, position, material = structure) => mesh(id, new THREE.BoxGeometry(...size), material, position);
  function wing(id, side, span, chord, thickness) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -chord / 2); shape.lineTo(side * span, chord * .5);
    shape.lineTo(side * span, chord * .5 + .95); shape.lineTo(0, chord / 2); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
    geometry.rotateX(Math.PI / 2); geometry.translate(0, thickness / 2, 0);
    mesh(id, geometry, paint);
  }
  configure('fuselage.nose', [0, 0, -16], [0, 1, -2]);
  const nose = mesh('fuselage.nose', new THREE.SphereGeometry(1, 16, 12)); nose.scale.set(1.75, 1.7, 4);
  ['front', 'mid', 'rear'].forEach((name, i) => {
    const id = `fuselage.skin.${name}`;
    configure(id, [0, 0, -9 + i * 11], [i === 1 ? 0 : (i - 1) * .5, 6 + i, 0], .6);
    const geometry = new THREE.CylinderGeometry(i === 2 ? 1.55 : 1.8, i === 2 ? .5 : 1.8, 11, 18, 1, false);
    geometry.rotateX(Math.PI / 2); mesh(id, geometry);
  });
  configure('fuselage.frames', [0, 0, 0], [0, .4, 0]);
  for (let z = -13; z <= 14; z += 3) mesh('fuselage.frames', new THREE.TorusGeometry(1.55, .065, 4, 20), structure, [0, 0, z]);
  configure('fuselage.stringers', [0, 0, 0]);
  for (const angle of [0, 1.6, 3.2, 4.8]) box('fuselage.stringers', [.09, .09, 28], [Math.cos(angle) * 1.55, Math.sin(angle) * 1.55, 0]);
  configure('cabin.floor', [0, -.2, 0], [0, 2.4, 0], .4); box('cabin.floor', [2.7, .14, 26], [0, 0, 0]);
  configure('cabin.interior', [0, .4, 0], [0, 3.6, 0], .4);
  for (const x of [-.8, .8]) for (let z = -10; z <= 10; z += 2) box('cabin.interior', [.65, .6, .65], [x, 0, z]);
  for (const [side, sign] of [['left', -1], ['right', 1]]) {
    const id = `wing.${side}`;
    configure(id, [sign * 1.6, -.8, -1], [sign * 4.5, .7, .4]);
    // The parent is a datum node; skins, spars and ribs occupy child groups.
    configure(`${id}.skin.lower`, [0, 0, 0], [0, -.6, 0], .1); wing(`${id}.skin.lower`, sign, 13.5, 6, .13);
    configure(`${id}.skin.upper`, [0, .5, 0], [0, 4.2, 0], .45); wing(`${id}.skin.upper`, sign, 13.5, 6, .13);
    for (const [suffix, z] of [['spar.front', -1.7], ['spar.rear', 1.6]]) {
      configure(`${id}.${suffix}`, [0, .25, 0]);
      const beam = box(`${id}.${suffix}`, [12, .42, .1], [sign * 6, 0, z + 1.5]); beam.rotation.y = -sign * .23;
    }
    configure(`${id}.ribs`, [0, .25, 0]);
    for (let i = 1; i <= 6; i++) box(`${id}.ribs`, [.11, .36, 3.1 - i * .25], [sign * i * 1.8, 0, i * .43]);
    configure(`${id}.stringers`, [0, .4, 0]);
    for (const z of [-.6, .4]) box(`${id}.stringers`, [11, .06, .06], [sign * 6, 0, z + 1]);
    configure(`${id}.aileron`, [sign * 10.7, .1, 3.4]); box(`${id}.aileron`, [3.4, .15, .8], [0, 0, .4], dark);
    configure(`engine.${side}.nacelle`, [sign * 5.7, -2.7, -3], [sign * 1, -.8, -3]);
    const nacelle = mesh(`engine.${side}.nacelle`, new THREE.CylinderGeometry(1.15, 1.1, 4.4, 16, 1, true), paint, [0, 0, 0], [Math.PI / 2, 0, 0]);
    nacelle.material = paint;
    configure(`engine.${side}.core`, [sign * 5.7, -2.7, -3], [sign * 1, -.8, 1.2]);
    mesh(`engine.${side}.core`, new THREE.CylinderGeometry(.55, .4, 3.7, 12), structure, [0, 0, 0], [Math.PI / 2, 0, 0]);
    configure(`engine.${side}.pylon`, [sign * 5.7, -1.7, -1], [sign * 1, -.5, 0]); box(`engine.${side}.pylon`, [.3, 1.6, 2.6], [0, 0, 0]);
    configure(`tail.horizontal.${side}`, [sign * .6, .3, 15], [sign * 2, 1, 1]); wing(`tail.horizontal.${side}`, sign, 6, 3.5, .18);
    configure(`tail.horizontal.${side}.elevator`, [sign * 3.7, 0, 2]); box(`tail.horizontal.${side}.elevator`, [3.2, .13, .6], [0, 0, .3], dark);
  }
  configure('tail.vertical', [0, 1, 14.5], [0, 3.5, 1]);
  const fin = box('tail.vertical', [.22, 5.8, 3.5], [0, 2.6, .6], paint); fin.rotation.x = -.25;
  configure('tail.vertical.rudder', [0, 2.6, 2.2]); box('tail.vertical.rudder', [.2, 4.5, .7], [0, 0, .35], dark);
  for (const [id, x, z] of [['gear.nose', 0, -13], ['gear.main.left', -2.7, 3], ['gear.main.right', 2.7, 3]]) {
    configure(id, [x, -2.5, z], [x * .25, -2.3, 0]);
    mesh(id, new THREE.CylinderGeometry(.12, .12, 2.6, 8), structure);
    for (const dx of [-.4, .4]) mesh(id, new THREE.CylinderGeometry(.48, .48, .35, 12), dark, [dx, -1.2, 0], [0, 0, Math.PI / 2]);
    configure(`${id}.doors`, [0, .6, .7], [.8, 0, .6], .3); box(`${id}.doors`, [1.1, .1, 1.8], [0, 0, 0], paint);
  }
  root.updateWorldMatrix(true, true);
  const bodyBounds = new THREE.Box3();
  for (const id of ['fuselage.nose', 'fuselage.skin.front', 'fuselage.skin.mid', 'fuselage.skin.rear']) bodyBounds.union(new THREE.Box3().setFromObject(parts.get(id).object, true));
  const factor = 40 / bodyBounds.getSize(new THREE.Vector3()).z;
  const center = new THREE.Box3().setFromObject(root, true).getCenter(new THREE.Vector3());
  datum.scale.setScalar(factor); datum.position.copy(center).multiplyScalar(-factor);
  for (const [id, part] of parts) rest.set(id, { position: part.object.position.clone(), rotation: part.object.rotation.clone() });
  let disposed = false;
  function applyPose(pose) {
    for (const [id, part] of parts) {
      const base = rest.get(id), motion = motions.get(id), object = part.object;
      object.position.copy(base.position); object.rotation.copy(base.rotation);
      if (motion) {
        const baseline = clamp(pose.assembly) * motion.share;
        const local = part.systemId ? clamp(pose.systems[part.systemId] ?? 0) : 0;
        object.position.addScaledVector(motion.shift, baseline + (1 - baseline) * local);
      }
      if (id.endsWith('.aileron')) object.rotation.x += (id.includes('.left.') ? 1 : -1) * pose.controls.roll * .3;
      if (id.endsWith('.elevator')) object.rotation.x += pose.controls.pitch * .3;
      if (id.endsWith('.rudder')) object.rotation.y += pose.controls.yaw * .3;
    }
    // Scale-free selection marker: no geometry/material mutation or ownership leaks.
    for (const object of pickables) {
      const id = object.userData.partId;
      const active = pose.emphasis.partId && (pose.emphasis.partId === id || id.startsWith(`${pose.emphasis.partId}.`));
      object.material = active ? selectedMaterial : object.userData.baseMaterial;
    }
    root.updateWorldMatrix(true, true);
  }
  applyPose(emptyPose());
  const assembledBounds = new THREE.Box3().setFromObject(root, true);
  return { root, parts, pickables, assembledBounds,
    assetVersion: 'engineering-fixture-1',
    systems: new Map(Object.entries(SYSTEMS).map(([id, name]) => [id, { name, partIds: PARTS.filter(p => p.systemId === id).map(p => p.id), capabilities: capabilities({ expand: id !== 'flight-controls' }) }])),
    applyPose,
    getBounds(id = null) { root.updateWorldMatrix(true, true); const object = id ? parts.get(id)?.object : root; return object ? new THREE.Box3().setFromObject(object, true) : null; },
    setQuality() {},
    dispose() { if (disposed) return; disposed = true; for (const resource of resources) resource.dispose(); root.removeFromParent(); },
  };
}

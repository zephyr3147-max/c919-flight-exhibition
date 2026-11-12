// Semantic material slots for the C919 exhibit. Colors state a display role,
// not a claim about the aircraft's certified materials.
import * as THREE from 'three';

const SLOT_ORDER = [
  'paintOuter', 'skinInner', 'cutEdge', 'frame', 'stringer', 'sparWeb', 'sparCap', 'rib',
  'interior', 'engineCore', 'gearMetal', 'fastener', 'glass', 'tire', 'seat', 'floor',
  'trim', 'engineHot', 'detail',
];

const BASE = {
  paintOuter: { color: 0xf4f6f8, roughness: 0.36, metalness: 0.04, envMapIntensity: 1.0 },
  skinInner: { color: 0x8295a3, roughness: 0.58, metalness: 0.42, envMapIntensity: 0.95, side: THREE.DoubleSide },
  cutEdge: { color: 0x58c6d3, roughness: 0.42, metalness: 0.25, envMapIntensity: 1.0, side: THREE.DoubleSide },
  frame: { color: 0xa9b5bf, roughness: 0.5, metalness: 0.5, envMapIntensity: 1.0 },
  stringer: { color: 0xb5c0c9, roughness: 0.5, metalness: 0.5, envMapIntensity: 0.95 },
  sparWeb: { color: 0x8e9eaa, roughness: 0.56, metalness: 0.48, envMapIntensity: 0.9, side: THREE.DoubleSide },
  sparCap: { color: 0xc5cfd7, roughness: 0.42, metalness: 0.58, envMapIntensity: 1.0 },
  rib: { color: 0x9ba9b4, roughness: 0.54, metalness: 0.46, envMapIntensity: 0.9, side: THREE.DoubleSide },
  interior: { color: 0x2d3f4c, roughness: 0.84, metalness: 0.04, envMapIntensity: 0.65, side: THREE.DoubleSide },
  engineCore: { color: 0x394b58, roughness: 0.54, metalness: 0.42, envMapIntensity: 0.9, side: THREE.DoubleSide },
  gearMetal: { color: 0x7e8b97, roughness: 0.36, metalness: 0.7, envMapIntensity: 1.05 },
  fastener: { color: 0xb8c3cb, roughness: 0.38, metalness: 0.62, envMapIntensity: 1.0 },
  glass: { color: 0x182833, roughness: 0.12, metalness: 0.16, envMapIntensity: 1.15, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide },
  tire: { color: 0x14181d, roughness: 0.94, metalness: 0.02, envMapIntensity: 0.5 },
  seat: { color: 0x34495a, roughness: 0.88, metalness: 0.03, envMapIntensity: 0.65, side: THREE.DoubleSide },
  floor: { color: 0x3e505e, roughness: 0.86, metalness: 0.05, envMapIntensity: 0.7 },
  trim: { color: 0x52646f, roughness: 0.8, metalness: 0.08, envMapIntensity: 0.7, side: THREE.DoubleSide },
  engineHot: { color: 0x6d5b4f, roughness: 0.48, metalness: 0.6, envMapIntensity: 0.95 },
  detail: { color: 0x2c3a45, roughness: 0.5, metalness: 0.28, envMapIntensity: 0.85, side: THREE.DoubleSide },
};

function standard(slot, spec) {
  const material = new THREE.MeshStandardMaterial(spec);
  material.name = slot;
  return material;
}

function paint(quality) {
  const spec = { ...BASE.paintOuter };
  if (quality === 'low') return standard('paintOuter', spec);
  const material = new THREE.MeshPhysicalMaterial({
    ...spec, clearcoat: 0.65, clearcoatRoughness: 0.16,
  });
  material.name = 'paintOuter';
  return material;
}

export function createMaterials(quality = 'balanced') {
  const materials = {};
  for (const slot of SLOT_ORDER) {
    if (slot === 'paintOuter') { materials[slot] = paint(quality); continue; }
    if (slot === 'glass') {
      if (quality === 'low') materials[slot] = standard(slot, BASE[slot]);
      else {
        const material = new THREE.MeshPhysicalMaterial({
          ...BASE[slot], clearcoat: 0.9, clearcoatRoughness: 0.08,
        });
        material.name = slot;
        materials[slot] = material;
      }
      continue;
    }
    materials[slot] = standard(slot, { ...BASE[slot] });
  }
  return materials;
}

export function disposeMaterials(materials) {
  for (const material of Object.values(materials)) material.dispose();
}

export { SLOT_ORDER };

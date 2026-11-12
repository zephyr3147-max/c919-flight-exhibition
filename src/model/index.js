// Runtime C919 model. Loads the self-contained Gate 2 asset produced by
// src/model/tools/build-aircraft-assets.mjs. No DOM, camera or timeline access.
import * as THREE from 'three';
import { layout, ramp, panelAngles, MOTION_VERSION } from './explode-layout.js';

const SLOT_FALLBACK = {
  paintOuter: { color: 0xf4f6f8, roughness: 0.42, metalness: 0.06 },
  skinInner: { color: 0x9aa7b1, roughness: 0.72, metalness: 0.12, side: THREE.DoubleSide },
  cutEdge: { color: 0x58c6d3, roughness: 0.44, metalness: 0.25, side: THREE.DoubleSide },
  frame: { color: 0x9aa7b1, roughness: 0.66, metalness: 0.22 },
  stringer: { color: 0xa7b4be, roughness: 0.62, metalness: 0.2 },
  sparWeb: { color: 0x8f9ca7, roughness: 0.68, metalness: 0.22, side: THREE.DoubleSide },
  sparCap: { color: 0xb7c2ca, roughness: 0.55, metalness: 0.28 },
  rib: { color: 0x9aa7b1, roughness: 0.66, metalness: 0.2, side: THREE.DoubleSide },
  interior: { color: 0x334553, roughness: 0.86, metalness: 0.03, side: THREE.DoubleSide },
  engineCore: { color: 0x3c4d5a, roughness: 0.62, metalness: 0.3, side: THREE.DoubleSide },
  gearMetal: { color: 0x7c8894, roughness: 0.46, metalness: 0.6 },
  fastener: { color: 0xb8c3cb, roughness: 0.4, metalness: 0.6 },
  glass: { color: 0x1b2b38, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.72, side: THREE.DoubleSide },
  tire: { color: 0x171b20, roughness: 0.94, metalness: 0.02 },
  seat: { color: 0x3a5062, roughness: 0.9, metalness: 0.02 },
  floor: { color: 0x4a5a68, roughness: 0.88, metalness: 0.03 },
  trim: { color: 0x5b6c79, roughness: 0.82, metalness: 0.06 },
  engineHot: { color: 0x6d5b4f, roughness: 0.5, metalness: 0.55 },
  detail: { color: 0x27333d, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide },
};

const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
const clampSigned = value => Math.max(-1, Math.min(1, Number(value) || 0));
const vector = (value, fallback = [0, 0, 0]) => {
  const source = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0);
};
const materialFor = (materials, slot) => {
  if (materials instanceof Map) return materials.get(slot);
  return materials?.[slot];
};
const abortError = signal => signal?.reason instanceof Error
  ? signal.reason
  : new DOMException('模型加载已取消', 'AbortError');
function checkAbort(signal) {
  if (signal?.aborted) throw abortError(signal);
}

async function readAsset(url, signal) {
  checkAbort(signal);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`模型资产加载失败（${response.status}）：${url}`);
  const bytes = await response.arrayBuffer();
  checkAbort(signal);
  return bytes;
}

function decodePrimitive(buffer, record) {
  const count = record.vertexCount;
  const positions = new Float32Array(count * 3);
  const quantized = new Int16Array(buffer, record.position.offset, count * 3);
  const [minX, minY, minZ] = record.position.min;
  const [scaleX, scaleY, scaleZ] = record.position.scale;
  for (let i = 0; i < count; i++) {
    const q = i * 3;
    positions[q] = minX + (quantized[q] + 32767) * scaleX;
    positions[q + 1] = minY + (quantized[q + 1] + 32767) * scaleY;
    positions[q + 2] = minZ + (quantized[q + 2] + 32767) * scaleZ;
  }
  const normals = new Float32Array(count * 3);
  const compressedNormals = new Int8Array(buffer, record.normal.offset, count * 3);
  for (let i = 0; i < count * 3; i++) normals[i] = compressedNormals[i] / 127;
  const indices = new Uint32Array(record.indexCount);
  indices.set(new Uint32Array(buffer, record.index.offset, record.indexCount));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingBox = new THREE.Box3(vector(record.bounds.min), vector(record.bounds.max));
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
  return geometry;
}

function makeFallback(slot) {
  const spec = SLOT_FALLBACK[slot] ?? { color: 0x8a969f, roughness: 0.7, metalness: 0.1 };
  return new THREE.MeshStandardMaterial(spec);
}

export async function createAircraft({ assetRoot = './assets/', materials = {}, quality = 'balanced', signal } = {}) {
  checkAbort(signal);
  let base;
  try { base = new URL(assetRoot); } catch { base = new URL(assetRoot, import.meta.url); }
  const jsonUrl = new URL('aircraft.json', base).href;
  const binUrl = new URL('aircraft.bin', base).href;
  const [jsonBytes, binBytes] = await Promise.all([readAsset(jsonUrl, signal), readAsset(binUrl, signal)]);
  const manifest = JSON.parse(new TextDecoder().decode(jsonBytes));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.parts)) throw new Error('模型资产格式不受支持');
  checkAbort(signal);

  const root = new THREE.Group();
  root.name = 'aircraft';
  root.userData.partId = 'aircraft';
  const groups = new Map();
  const parts = new Map();
  const pickables = [];
  const geometries = new Set();
  const ownedMaterials = new Set();
  const fallbacks = new Map();
  const highlights = new Map();
  const dimmedMaterials = new Map();
  const pivots = new Map(), panelPivots = new Map();
  let disposed = false;
  let qualityLevel = quality === 'high' || quality === 'low' ? quality : 'balanced';

  const disposePartial = () => {
    for (const geometry of geometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    geometries.clear(); ownedMaterials.clear();
    root.removeFromParent();
  };

  try {
    // All groups first so contract order cannot break parenting.
    for (const record of manifest.parts) {
      const object = record.id === 'aircraft' ? root : new THREE.Group();
      object.name = record.id;
      object.userData.partId = record.id;
      groups.set(record.id, object);
    }
    for (const record of manifest.parts) {
      if (record.id !== 'aircraft') {
        const parent = record.parentId ? groups.get(record.parentId) : root;
        (parent ?? root).add(groups.get(record.id));
      }
      const hinge = record.hinge ? {
        pivot: vector(record.hinge.pivot),
        axis: vector(record.hinge.axis).normalize(),
        maxAngle: Number(record.hinge.maxAngle) || 0,
        sign: Number(record.hinge.sign) || 1,
        kind: record.hinge.kind,
      } : null;
      parts.set(record.id, {
        id: record.id,
        systemId: record.systemId ?? null,
        parentId: record.parentId ?? null,
        name: record.name,
        description: record.description ?? '',
        object: groups.get(record.id),
        anchor: vector(record.anchor),
        capabilities: { ...record.capabilities },
        sourceType: record.sourceType,
        sourceRefs: [...record.sourceRefs],
        restPosition: hinge ? hinge.pivot.clone() : new THREE.Vector3(),
        assemblyOffset: vector(record.assemblyOffset),
        systemOffset: vector(record.systemOffset),
        hinge,
      });
    }
    // Decode geometry and materials. External materials remain lookdev-owned.
    for (const record of manifest.parts) {
      const object = groups.get(record.id);
      for (const primitive of record.primitives ?? []) {
        const geometry = decodePrimitive(binBytes, primitive);
        let baseMaterial = materialFor(materials, primitive.slot);
        if (!baseMaterial) {
          if (!fallbacks.has(primitive.slot)) {
            const material = makeFallback(primitive.slot);
            fallbacks.set(primitive.slot, material);
            ownedMaterials.add(material);
          }
          baseMaterial = fallbacks.get(primitive.slot);
        }
        const mesh = new THREE.Mesh(geometry, baseMaterial);
        mesh.name = `${record.id}:${primitive.slot}`;
        mesh.userData.partId = record.id;
        mesh.userData.slot = primitive.slot;
        mesh.userData.panelSide = primitive.panelSide || 0;
        mesh.userData.baseMaterial = baseMaterial;
        object.add(mesh);
        geometries.add(geometry);
        pickables.push(mesh);
      }
    }
    for (const part of parts.values()) part.object.position.copy(part.restPosition);
    root.updateWorldMatrix(true, true);
    const partBox = id => new THREE.Box3().setFromObject(groups.get(id), true);
    const centreOf = ids => { const box = new THREE.Box3(); for (const id of ids) box.union(partBox(id)); return box.getCenter(new THREE.Vector3()); };
    const cabinPivot = centreOf(['cabin.floor', 'cabin.interior']);
    for (const [id, part] of parts) {
      const group = layout[id]?.pivotGroup;
      pivots.set(id, group === 'cabin' ? cabinPivot : group?.startsWith('engine.')
        ? centreOf([`${group}.nacelle`, `${group}.core`, `${group}.pylon`])
        : part.hinge ? new THREE.Vector3() : partBox(id).getCenter(new THREE.Vector3()));
    }
    for (const part of parts.values()) for (const side of [-1, 1]) {
      const meshes = pickables.filter(m => m.userData.partId === part.id && m.userData.panelSide === side);
      if (!meshes.length) continue;
      const box = new THREE.Box3(); for (const mesh of meshes) box.union(mesh.geometry.boundingBox);
      panelPivots.set(`${part.id}:${side}`, box.getCenter(new THREE.Vector3()));
    }
    checkAbort(signal);

    // Contextual emphasis: the target keeps its real material with a faint cyan
    // structure cue; non-target systems dim to roughly 60% brightness and lose
    // reflection weight. No orange wash, no transparent ghosting.
    const variantFor = (cache, slot, baseMaterial, tweak) => {
      if (!cache.has(slot)) {
        const material = baseMaterial.clone();
        tweak(material, baseMaterial);
        material.needsUpdate = true;
        ownedMaterials.add(material);
        cache.set(slot, material);
      }
      return cache.get(slot);
    };
    const targetFor = (slot, baseMaterial) => variantFor(highlights, slot, baseMaterial, material => {
      if ('emissive' in material) {
        material.emissive = new THREE.Color(0x58c6d3);
        material.emissiveIntensity = 0.1;
      }
      if ('envMapIntensity' in material) material.envMapIntensity = (baseMaterial.envMapIntensity ?? 1) * 1.05;
    });
    const dimmedFor = (slot, baseMaterial) => variantFor(dimmedMaterials, slot, baseMaterial, material => {
      if (material.color) material.color.multiplyScalar(0.62);
      if ('envMapIntensity' in material) material.envMapIntensity = (baseMaterial.envMapIntensity ?? 1) * 0.6;
    });

    const applyQuality = () => {
      const hiddenSlots = qualityLevel === 'high' ? new Set()
        : qualityLevel === 'low' ? new Set(['fastener', 'seat', 'interior', 'trim', 'stringer'])
          : new Set(['fastener']);
      for (const mesh of pickables) {
        mesh.visible = !hiddenSlots.has(mesh.userData.slot);
      }
      root.userData.quality = qualityLevel;
    };

    const applyPose = pose => {
      if (disposed) return;
      const input = pose ?? {};
      const assembly = clamp01(input.assembly);
      const systems = input.systems ?? {};
      const controls = input.controls ?? {};
      const roll = clampSigned(controls.roll);
      const pitch = clampSigned(controls.pitch);
      const yaw = clampSigned(controls.yaw);
      for (const part of parts.values()) {
        const object = part.object;
        if (part.id === 'aircraft') {
          object.position.set(0, 0, 0);
          object.quaternion.identity();
          continue;
        }
        const system = part.systemId ? clamp01(systems[part.systemId]) : 0;
        const config = layout[part.id], travel = config ? ramp(assembly, config.start ?? 0) : assembly;
        const rotation = config ? ramp(assembly, .48) : 0;
        const angles = config?.angles ?? [0, 0, 0];
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles.map(value => THREE.MathUtils.degToRad(value) * rotation)));
        object.quaternion.copy(q);
        object.position.copy(part.restPosition).addScaledVector(config ? vector(config.offset) : part.assemblyOffset, travel).addScaledVector(config?.systemOffset ? vector(config.systemOffset) : part.systemOffset, system);
        const pivot = pivots.get(part.id);
        if (config && !part.hinge) object.position.add(pivot).sub(pivot.clone().applyQuaternion(q));
        if (config?.axial !== undefined) object.position.add(new THREE.Vector3(0, 0, config.axial * (ramp(assembly, .2) + system * .3)).applyQuaternion(q));
        if (part.hinge) {
          const amount = part.hinge.kind === 'aileron' ? roll : part.hinge.kind === 'elevator' ? pitch : yaw;
          object.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(part.hinge.axis, part.hinge.maxAngle * part.hinge.sign * amount));
        }
      }
      // Longitudinal half-shells first peel outwards; the parent lifts later.
      // Paint, inner liner, cut rims and attached details share one rigid panel.
      for (const mesh of pickables) {
        mesh.position.set(0, 0, 0); mesh.quaternion.identity();
        const side = mesh.userData.panelSide, id = mesh.userData.partId;
        if (!side) continue;
        const config = layout[id], opening = Math.max(assembly, clamp01(systems.fuselage), clamp01(systems.cabin));
        const spread = ramp(opening, 0, .34), turn = ramp(opening, .46);
        const pivot = panelPivots.get(`${id}:${side}`), angles = panelAngles(id, side);
        mesh.quaternion.setFromEuler(new THREE.Euler(...angles.map(value => THREE.MathUtils.degToRad(value) * turn)));
        mesh.position.copy(pivot).sub(pivot.clone().applyQuaternion(mesh.quaternion));
        mesh.position.x += side * (config?.spread ?? 3) * spread;
        mesh.position.z += side * .25 * ramp(opening, .4);
        if (side === 1) parts.get(id).anchor.copy(pivot).applyQuaternion(mesh.quaternion).add(mesh.position);
      }
      const emphasis = input.emphasis ?? {};
      const focusPart = emphasis.partId ?? null;
      const focusSystem = emphasis.systemId ?? null;
      const hasEmphasis = Boolean(focusPart || focusSystem);
      for (const mesh of pickables) {
        const id = mesh.userData.partId;
        const part = parts.get(id);
        const active = focusPart
          ? (id === focusPart || id.startsWith(`${focusPart}.`))
          : Boolean(focusSystem && part?.systemId === focusSystem);
        const base = mesh.userData.baseMaterial;
        mesh.material = !hasEmphasis ? base
          : active ? targetFor(mesh.userData.slot, base) : dimmedFor(mesh.userData.slot, base);
      }
      root.updateWorldMatrix(true, true);
    };

    applyQuality();
    applyPose({ assembly: 0 });
    const assembledBounds = new THREE.Box3().setFromObject(root, true);
    const declaredBounds = manifest.bounds
      ? new THREE.Box3(vector(manifest.bounds.min), vector(manifest.bounds.max))
      : assembledBounds.clone();
    assembledBounds.union(declaredBounds);

    const systems = new Map((manifest.systems ?? []).map(([id, name]) => [id, {
      name,
      partIds: manifest.parts.filter(part => part.systemId === id).map(part => part.id),
      capabilities: { focus: true, expand: true, section: false, control: id === 'flight-controls' },
    }]));

    const model = {
      root,
      parts,
      systems,
      pickables,
      assembledBounds,
      assetVersion: manifest.assetVersion,
      motionVersion: MOTION_VERSION,
      applyPose,
      getBounds(partId = null) {
        if (disposed) return null;
        root.updateWorldMatrix(true, true);
        const object = partId === null ? root : parts.get(partId)?.object;
        if (!object) return null;
        return new THREE.Box3().setFromObject(object, false);
      },
      setQuality(level) {
        if (disposed) return;
        qualityLevel = level === 'high' || level === 'low' ? level : 'balanced';
        applyQuality();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const mesh of pickables) {
          mesh.material = mesh.userData.baseMaterial;
          mesh.removeFromParent();
        }
        disposePartial();
        pickables.length = 0;
        parts.clear();
        groups.clear();
        highlights.clear(); dimmedMaterials.clear(); pivots.clear(); panelPivots.clear();
      },
    };
    checkAbort(signal);
    return model;
  } catch (error) {
    disposePartial();
    throw error;
  }
}

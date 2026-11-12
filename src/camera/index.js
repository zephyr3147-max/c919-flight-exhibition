import * as THREE from 'three';

// Formal exhibition camera. Geometry-only: it reads the model through its ABI and
// never changes pose, store state or UI. Framing values come from the art bible:
// R is the free rectangle after title, deck and drawer; centre is where the tight
// projected bounding box of the subject must sit on the canvas.

const DEG = Math.PI / 180;
const WIDE = 1920;
const MID = 1366;
const NARROW_MAX = 900;
const MIN_DISTANCE = 4;
const FOCUS_DURATION = 0.55;
const WHOLE_DURATION = 0.75;
const ENTRANCE_DURATION = 1.6;
const ADAPT_STEP = 0.09;

// R is recomputed for the borderless 2026-11-08 layout: compact title top-left,
// vertical lever in the left margin, part entry top-right, description right,
// pure-text navigation along the bottom. The aircraft remains left of centre so
// the right description never covers the selected entity.
const SPECS = {
  overview: {
    dir: [1.0, 0.82, -1.35], fov: 32,
    r1920: [0.145, 0.145, 0.60, 0.665], r1366: [0.145, 0.155, 0.60, 0.645],
    c1920: [0.445, 0.4775], c1366: [0.445, 0.4775], fill: 0.84,
  },
  fuselage: {
    dir: [1.20, 0.75, -1.05], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.86,
  },
  cabin: {
    dir: [1.20, 0.75, -1.05], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.85,
  },
  wings: {
    dir: [0.75, 1.35, -0.90], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.86,
  },
  tail: {
    dir: [0.90, 0.95, 0.55], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.84,
  },
  propulsion: {
    dir: [1.15, 0.65, -1.15], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.86,
  },
  'landing-gear': {
    dir: [1.10, 0.45, -1.20], fov: 30,
    r1920: [0.13, 0.17, 0.63, 0.62], r1366: [0.13, 0.18, 0.61, 0.60],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.85,
  },
  'flight-controls': {
    dir: [0.85, 1.10, -1.00], fov: 30,
    r1920: [0.13, 0.16, 0.63, 0.64], r1366: [0.13, 0.17, 0.61, 0.62],
    c1920: [0.445, 0.48], c1366: [0.445, 0.48], fill: 0.85,
  },
};

// Zoom limits keep the declared closed bounds as a cheap conservative proxy;
// framing itself never does (ART_BIBLE 5.1.3 forbids theoretical AABB corners).
const NARROW = { r: [0.18, 0.12, 0.74, 0.76], center: [0.56, 0.5] };

const clamp01 = value => Math.min(1, Math.max(0, value));
const smoothstep = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function interpolate(a, b, width) {
  if (width <= MID) return b;
  if (width >= WIDE) return a;
  return lerp(b, a, (width - MID) / (WIDE - MID));
}

function presentationFor(state, viewport, framingOverride, centerOverride) {
  const spec = SPECS[state] ?? SPECS.overview;
  const narrow = viewport.width <= NARROW_MAX;
  if (framingOverride) {
    const r = [framingOverride.x, framingOverride.y, framingOverride.width, framingOverride.height];
    const center = centerOverride ?? [r[0] + r[2] / 2, r[1] + r[3] / 2];
    return { r, center, fill: Math.min(1, spec.fill + 0.02), dir: spec.dir, fov: spec.fov };
  }
  if (narrow) {
    return {
      r: [...NARROW.r], center: [...NARROW.center],
      fill: Math.min(1, spec.fill + 0.01), dir: spec.dir, fov: spec.fov,
    };
  }
  const t = clamp01((viewport.width - MID) / (WIDE - MID));
  return {
    r: spec.r1366.map((value, index) => lerp(value, spec.r1920[index], t)),
    center: spec.c1366.map((value, index) => lerp(value, spec.c1920[index], t)),
    fill: spec.fill, dir: spec.dir, fov: spec.fov,
  };
}

function basisFor(dir) {
  const direction = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right).normalize();
  return { direction, right, up };
}

function isShown(object) {
  for (let node = object; node; node = node.parent) if (node.visible === false) return false;
  return true;
}

function meshList(objects) {
  const seen = new Set();
  const meshes = [];
  for (const object of objects) {
    object?.traverse(child => {
      if (!child.isMesh || seen.has(child) || !isShown(child)) return;
      if (!child.geometry?.getAttribute?.('position')) return;
      seen.add(child);
      meshes.push(child);
    });
  }
  return meshes;
}

function collectPoints(objects) {
  const meshes = meshList(objects);
  let count = 0;
  for (const mesh of meshes) count += mesh.geometry.getAttribute('position').count;
  const points = new Float32Array(count * 3);
  let offset = 0;
  for (const mesh of meshes) {
    const attribute = mesh.geometry.getAttribute('position');
    const e = mesh.matrixWorld.elements;
    for (let i = 0; i < attribute.count; i += 1) {
      const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
      points[offset++] = e[0] * x + e[4] * y + e[8] * z + e[12];
      points[offset++] = e[1] * x + e[5] * y + e[9] * z + e[13];
      points[offset++] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  return points;
}

function boundsOf(points) {
  const box = new THREE.Box3();
  box.makeEmpty();
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (x < box.min.x) box.min.x = x; if (x > box.max.x) box.max.x = x;
    if (y < box.min.y) box.min.y = y; if (y > box.max.y) box.max.y = y;
    if (z < box.min.z) box.min.z = z; if (z > box.max.z) box.max.z = z;
  }
  return box;
}

function boxCorners(box) {
  const { min, max } = box;
  const points = new Float32Array(24);
  let i = 0;
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
    points[i++] = x; points[i++] = y; points[i++] = z;
  }
  return points;
}

function projectedRect(points, camera, width, height) {
  const view = camera.matrixWorldInverse.elements;
  const projection = camera.projectionMatrix.elements;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const vx = view[0] * x + view[4] * y + view[8] * z + view[12];
    const vy = view[1] * x + view[5] * y + view[9] * z + view[13];
    const vz = view[2] * x + view[6] * y + view[10] * z + view[14];
    if (vz > -camera.near) continue;
    const inv = 1 / -vz;
    const ndcX = (projection[0] * vx + projection[8] * vz) * inv;
    const ndcY = (projection[5] * vy + projection[9] * vz) * inv;
    const px = (ndcX * 0.5 + 0.5) * width;
    const py = (-ndcY * 0.5 + 0.5) * height;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function wholeRectKey(points, camera) {
  const rect = projectedRect(points, camera, 1, 1);
  return rect ? [rect.minX, rect.minY, rect.maxX, rect.maxY].map(value => value.toFixed(5)).join(',') : 'none';
}

function matrixSignature(root) {
  let count = 0;
  let sum = 0;
  root?.traverse(child => {
    if (!child.isMesh) return;
    const e = child.matrixWorld.elements;
    for (let i = 0; i < 16; i += 1) sum += e[i] * ((i % 7) + 1);
    count += 1;
  });
  return `${count}:${sum.toFixed(5)}`;
}

export function createCameraRig({ camera, controls, model, viewport }) {
  let size = { ...viewport };
  let disposed = false;
  let transition = null;
  let viewState = 'overview';
  let framingOverride = null;
  let centerOverride = null;
  let referencePoints = null;
  let referenceBounds = null;
  let assembledProxy = null;
  let assembledBoundsSnapshot = null;
  let scope = { systemId: null, partId: null };
  let standardDistance = 1;
  let trackedCenter = null;
  let metricsCache = null;
  let metricsKey = '';

  const scratch = new THREE.Vector3();
  const unitY = new THREE.Vector3(0, 1, 0);

  function presentation() {
    return presentationFor(viewState, size, framingOverride, centerOverride);
  }

  function applyView(fit, present) {
    if (!fit) return;
    camera.position.copy(fit.position);
    controls.target.copy(fit.target);
    camera.up.copy(unitY);
    camera.fov = fit.fov;
    camera.aspect = size.width / size.height;
    camera.near = 0.05;
    camera.far = 600;
    camera.setViewOffset(
      size.width, size.height,
      (0.5 - present.center[0]) * size.width,
      (0.5 - present.center[1]) * size.height,
      size.width, size.height,
    );
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    metricsCache = null;
  }

  function centerFit(points, fit, present) {
    applyView(fit, present);
    for (let pass = 0; pass < 2; pass += 1) {
      const rect = projectedRect(points, camera, size.width, size.height);
      if (!rect) break;
      const dx = present.center[0] * size.width - (rect.minX + rect.maxX) / 2;
      const dy = present.center[1] * size.height - (rect.minY + rect.maxY) / 2;
      if (Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) break;
      const perPixel = 2 * fit.distance * Math.tan(fit.fov * DEG / 2) / size.height;
      const shift = fit.right.clone().multiplyScalar(-dx * perPixel);
      shift.addScaledVector(fit.up, dy * perPixel);
      fit.target.add(shift);
      fit.position.add(shift);
      applyView(fit, present);
    }
    return fit;
  }

  function refineFit(points, fit, present, fx, fy, minDistance) {
    // The perspective-safe analytic fit is conservative: points at different
    // depths make the projected box smaller than the requested fill. Refine
    // against the real projection so close-ups and the whole aircraft use the
    // free rectangle instead of leaving large empty margins.
    for (let pass = 0; pass < 4; pass += 1) {
      const rect = projectedRect(points, camera, size.width, size.height);
      if (!rect) break;
      const halfWidth = (rect.maxX - rect.minX) / size.width;
      const halfHeight = (rect.maxY - rect.minY) / size.height;
      if (!(halfWidth > 1e-6) || !(halfHeight > 1e-6)) break;
      const ratio = Math.max(halfWidth / fx, halfHeight / fy);
      if (Math.abs(ratio - 1) <= 0.008) break;
      const next = Math.max(minDistance, fit.distance * ratio);
      if (Math.abs(next - fit.distance) < 1e-4) break;
      fit.distance = next;
      fit.position.copy(fit.target).addScaledVector(fit.direction, fit.distance);
      applyView(fit, present);
      centerFit(points, fit, present);
    }
    return fit;
  }

  function fitPoints(points, present, dirOverride = null) {
    if (!points || points.length < 9) return null;
    // Fit computation is a pure calculation. It temporarily poses the real
    // camera to project vertices, so the live camera must be restored before
    // returning; only update() may move the visible camera.
    const live = captureLiveCamera();
    try {
      const box = boundsOf(points);
      if (box.isEmpty()) return null;
      const target = box.getCenter(new THREE.Vector3());
      const minDistance = Math.max(0.1, Math.min(MIN_DISTANCE, box.getSize(new THREE.Vector3()).length() * 0.08));
      const { direction, right, up } = basisFor(dirOverride ?? present.dir);
      const tan = Math.tan(present.fov * DEG / 2);
      const aspect = size.width / size.height;
      const marginX = Math.min(present.center[0] - present.r[0], present.r[0] + present.r[2] - present.center[0]);
      const marginY = Math.min(present.center[1] - present.r[1], present.r[1] + present.r[3] - present.center[1]);
      const fx = Math.min(present.fill * present.r[2], 2 * marginX);
      const fy = Math.min(present.fill * present.r[3], 2 * marginY);
      if (fx <= 1e-5 || fy <= 1e-5) return null;
      let distance = minDistance;
      for (let i = 0; i < points.length; i += 3) {
        scratch.set(points[i] - target.x, points[i + 1] - target.y, points[i + 2] - target.z);
        const depth = scratch.dot(direction);
        const lateralX = Math.abs(scratch.dot(right));
        const lateralY = Math.abs(scratch.dot(up));
        distance = Math.max(
          distance,
          depth + lateralX / (tan * aspect * fx),
          depth + lateralY / (tan * fy),
        );
      }
      distance = Math.max(minDistance, distance * 1.02);
      const fit = {
        target,
        position: target.clone().addScaledVector(direction, distance),
        distance,
        direction,
        right,
        up,
        fov: present.fov,
      };
      centerFit(points, fit, present);
      return refineFit(points, fit, present, fx, fy, minDistance);
    } finally {
      restoreLiveCamera(live);
    }
  }

  function measureDistance(points, present, fill = present.fill, dirOverride = null) {
    if (!points || points.length < 9) return 0;
    const box = boundsOf(points);
    if (box.isEmpty()) return 0;
    const target = box.getCenter(new THREE.Vector3());
    const { direction, right, up } = basisFor(dirOverride ?? present.dir);
    const tan = Math.tan(present.fov * DEG / 2);
    const aspect = size.width / size.height;
    const marginX = Math.min(present.center[0] - present.r[0], present.r[0] + present.r[2] - present.center[0]);
    const marginY = Math.min(present.center[1] - present.r[1], present.r[1] + present.r[3] - present.center[1]);
    const fx = Math.min(fill * present.r[2], 2 * marginX);
    const fy = Math.min(fill * present.r[3], 2 * marginY);
    if (fx <= 1e-5 || fy <= 1e-5) return 0;
    let distance = MIN_DISTANCE;
    for (let i = 0; i < points.length; i += 3) {
      scratch.set(points[i] - target.x, points[i + 1] - target.y, points[i + 2] - target.z);
      const depth = scratch.dot(direction);
      const lateralX = Math.abs(scratch.dot(right));
      const lateralY = Math.abs(scratch.dot(up));
      distance = Math.max(
        distance,
        depth + lateralX / (tan * aspect * fx),
        depth + lateralY / (tan * fy),
      );
    }
    return distance * 1.02;
  }

  function openness() {
    if (disposed) return 1;
    const current = model.getBounds(null);
    if (!current || current.isEmpty() || !assembledBoundsSnapshot || !referenceBounds) return 1;
    const currentSize = current.getSize(new THREE.Vector3()).length();
    const closedSize = assembledBoundsSnapshot.getSize(new THREE.Vector3()).length();
    const openSize = referenceBounds.getSize(new THREE.Vector3()).length();
    const span = openSize - closedSize;
    if (!(span > 1e-4)) return 1;
    return clamp01((currentSize - closedSize) / span);
  }

  function wholePresentation() {
    return presentationFor('overview', size, framingOverride, centerOverride);
  }

  function wholeDesired() {
    const present = wholePresentation();
    if (!referencePoints) return null;
    const amount = smoothstep((openness() - 0.12) / 0.28);
    if (amount >= 1) return fitPoints(referencePoints, present);
    // Closed and mid-transition states are fitted from their real visible
    // vertices. The declared bound box has empty corners; fitting those made
    // the assembled aircraft roughly half the size it should be.
    const current = collectPoints([model.root]);
    return (current.length ? fitPoints(current, present) : null) ?? fitPoints(referencePoints, present);
  }

  function currentTargetObjects() {
    if (!scope.systemId && !scope.partId) return [];
    if (scope.partId) {
      const part = model.parts.get(scope.partId);
      return part?.object ? [part.object] : [];
    }
    const ids = scope.systemId === 'fuselage' ? ['fuselage', 'cabin'] : [scope.systemId];
    const objects = [];
    for (const id of ids) for (const partId of model.systems.get(id)?.partIds ?? []) {
      const part = model.parts.get(partId);
      if (part?.object) objects.push(part.object);
    }
    return objects;
  }

  function desiredForCurrent() {
    if (viewState === 'overview' && !scope.partId && !scope.systemId) return wholeDesired();
    const objects = currentTargetObjects();
    if (!objects.length) return wholeDesired();
    const points = collectPoints(objects);
    const present = presentation();
    const dir = directionFor(viewState, scope.partId);
    return fitPoints(points, dir ? { ...present, dir } : present);
  }

  function fixedTransition(origin, to, present, reducedMotion, duration = FOCUS_DURATION) {
    if (!to) return;
    standardDistance = to.distance;
    if (reducedMotion) {
      transition = null;
      applyView(to, present);
      return;
    }
    transition = {
      kind: 'fixed', adapt: false, elapsed: 0, duration,
      from: origin,
      to,
      present,
    };
  }

  function wholeTransition(origin, reducedMotion) {
    const present = wholePresentation();
    const to = wholeDesired();
    if (!to) return;
    standardDistance = to.distance;
    if (reducedMotion) {
      transition = null;
      applyView(to, present);
      return;
    }
    transition = {
      kind: 'whole', adapt: true, elapsed: 0, duration: WHOLE_DURATION,
      lastSample: -Infinity, present, to, from: origin,
    };
  }

  function stateFromScope(systemId, partId) {
    const part = partId ? model.parts.get(partId) : null;
    const id = part?.systemId ?? systemId;
    if (id === 'cabin') return 'cabin';
    if (id === 'fuselage') return 'fuselage';
    if (id === 'wings') return 'wings';
    if (id === 'tail') return 'tail';
    if (id === 'propulsion') return 'propulsion';
    if (id === 'landing-gear') return 'landing-gear';
    if (id === 'flight-controls') return 'flight-controls';
    return 'overview';
  }

  function directionFor(state, partId) {
    if (typeof partId === 'string' && /(?:aileron|elevator|rudder)$/.test(partId)) {
      return [partId.includes('.left') ? -0.85 : 0.85, 0.8, 1.35];
    }
    // The bible gives one wing vector. Viewed from that side the far wing is
    // seen end-on across the hull, so a left-wing close-up mirrors X and stays
    // on the selected wing's side with the same elevation and sweep.
    if (state === 'wings' && typeof partId === 'string' && partId.startsWith('wing.left')) {
      return [-SPECS.wings.dir[0], SPECS.wings.dir[1], SPECS.wings.dir[2]];
    }
    return null;
  }

  function findWholeTargets(systemId, partId) {
    if (systemId || partId) {
      if (partId === 'aircraft' || !partId) return { whole: !systemId, part: null };
      return { whole: false, part: partId };
    }
    return { whole: true, part: null };
  }

  function captureCamera() {
    return {
      position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(),
      fov: camera.fov, near: camera.near, far: camera.far,
    };
  }

  function captureLiveCamera() {
    return {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      target: controls.target.clone(),
      fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect,
      view: camera.view ? {
        enabled: camera.view.enabled,
        fullWidth: camera.view.fullWidth, fullHeight: camera.view.fullHeight,
        offsetX: camera.view.offsetX, offsetY: camera.view.offsetY,
        width: camera.view.width, height: camera.view.height,
      } : null,
    };
  }

  function restoreLiveCamera(saved) {
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    camera.up.copy(saved.up);
    controls.target.copy(saved.target);
    camera.fov = saved.fov;
    camera.near = saved.near;
    camera.far = saved.far;
    camera.aspect = saved.aspect;
    if (saved.view?.enabled) {
      camera.setViewOffset(saved.view.fullWidth, saved.view.fullHeight, saved.view.offsetX, saved.view.offsetY, saved.view.width, saved.view.height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    metricsCache = null;
  }

  function focusPart({ systemId = null, partId = null, reducedMotion = false, framing = null } = {}) {
    if (disposed) return;
    const origin = captureCamera();
    framingOverride = framing ? { ...framing } : null;
    centerOverride = framing ? [framing.x + framing.width / 2, framing.y + framing.height / 2] : null;
    const targets = findWholeTargets(systemId, partId);
    const isWhole = targets.whole;
    viewState = isWhole ? 'overview' : stateFromScope(systemId, partId);
    scope = { systemId: isWhole ? null : systemId, partId: isWhole ? null : partId };
    trackedCenter = null;
    if (isWhole) {
      wholeTransition(origin, Boolean(reducedMotion));
      return;
    }
    const objects = currentTargetObjects();
    if (!objects.length) {
      viewState = 'overview';
      scope = { systemId: null, partId: null };
      wholeTransition(origin, Boolean(reducedMotion));
      return;
    }
    const present = presentationFor(viewState, size, framingOverride, centerOverride);
    const dir = directionFor(viewState, partId);
    // The description is borderless, so preserved context cannot pass behind
    // it. Frame every visible mesh inside R while the selected system keeps
    // its own direction and emphasis; this keeps title, lever, part entry,
    // description and bottom navigation clear at every assembly position.
    const points = collectPoints(objects);
    const to = fitPoints(points, dir ? { ...present, dir } : present);
    if (!to) {
      viewState = 'overview';
      scope = { systemId: null, partId: null };
      wholeTransition(origin, Boolean(reducedMotion));
      return;
    }
    trackedCenter = boundsOf(points).getCenter(new THREE.Vector3());
    fixedTransition(origin, to, present, Boolean(reducedMotion));
  }

  function snapshotCamera() {
    return {
      position: camera.position.toArray(),
      target: controls.target.toArray(),
      up: camera.up.toArray(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
    };
  }

  function metrics() {
    if (disposed || !referencePoints) return null;
    // Local pose changes (control surfaces, system depth) do not necessarily
    // change the whole bounding box, so the cache key must include the actual
    // world matrices of every visible mesh.
    const key = [
      camera.position.toArray().map(v => v.toFixed(4)).join(','),
      controls.target.toArray().map(v => v.toFixed(4)).join(','),
      camera.quaternion.toArray().map(v => v.toFixed(4)).join(','),
      camera.up.toArray().map(v => v.toFixed(4)).join(','),
      camera.fov.toFixed(3), viewState, scope.systemId ?? '', scope.partId ?? '',
      size.width, size.height,
      matrixSignature(model.root),
    ].join('|');
    if (metricsCache && metricsKey === key) return metricsCache;
    const wholePoints = collectPoints([model.root]);
    const objects = currentTargetObjects();
    const targetPoints = objects.length ? collectPoints(objects) : wholePoints;
    const present = presentation();
    const project = points => {
      const rect = projectedRect(points, camera, size.width, size.height);
      if (!rect) return null;
      return {
        x: rect.minX / size.width, y: rect.minY / size.height,
        width: (rect.maxX - rect.minX) / size.width,
        height: (rect.maxY - rect.minY) / size.height,
        center: [(rect.minX + rect.maxX) / 2 / size.width, (rect.minY + rect.maxY) / 2 / size.height],
        pixels: {
          x: rect.minX, y: rect.minY,
          width: rect.maxX - rect.minX, height: rect.maxY - rect.minY,
        },
      };
    };
    const target = project(targetPoints);
    const context = project(wholePoints);
    const withOccupancy = rect => rect ? {
      ...rect,
      occupancy: {
        width: present.r[2] > 0 ? rect.width / present.r[2] : 0,
        height: present.r[3] > 0 ? rect.height / present.r[3] : 0,
      },
    } : null;
    metricsCache = {
      canvas: { width: size.width, height: size.height },
      r: [...present.r], center: [...present.center], state: viewState,
      target: withOccupancy(target),
      context: withOccupancy(context),
      assetVersion: model.assetVersion ?? null,
      transition: transition ? { kind: transition.kind, elapsed: transition.elapsed } : null,
    };
    metricsKey = key;
    return metricsCache;
  }

  function getSnapshot() {
    const present = presentation();
    return {
      ...snapshotCamera(),
      framing: { x: present.r[0], y: present.r[1], width: present.r[2], height: present.r[3] },
      center: [...present.center],
      state: viewState,
      scope: { ...scope },
      transition: transition ? { kind: transition.kind, adapt: Boolean(transition.adapt), elapsed: transition.elapsed } : null,
      metrics: metrics(),
    };
  }

  function restoreView(saved, { reducedMotion = false } = {}) {
    if (disposed || !saved?.position || !saved?.target) return false;
    const origin = captureCamera();
    viewState = 'overview';
    scope = { systemId: null, partId: null };
    trackedCenter = null;
    framingOverride = saved.framing ? { ...saved.framing } : null;
    centerOverride = Array.isArray(saved.center) ? [...saved.center] : null;
    const present = wholePresentation();
    const target = new THREE.Vector3().fromArray(saved.target);
    const position = new THREE.Vector3().fromArray(saved.position);
    const direction = position.clone().sub(target).normalize();
    const basis = basisFor(direction.toArray());
    const to = {
      target, position, fov: saved.fov ?? present.fov,
      distance: position.distanceTo(target),
      direction: basis.direction, right: basis.right, up: basis.up,
    };
    fixedTransition(origin, to, present, Boolean(reducedMotion), WHOLE_DURATION);
    return true;
  }

  function restoreSnapshot(saved, { viewport: next, reducedMotion = true } = {}) {
    if (!saved?.position || !saved?.target || !next) return;
    size = { ...next };
    transition = null;
    framingOverride = saved.framing ? { ...saved.framing } : null;
    centerOverride = Array.isArray(saved.center) ? [...saved.center] : null;
    viewState = SPECS[saved.state] ? saved.state : (saved.state === 'overview' ? 'overview' : viewState);
    scope = saved.scope
      ? { systemId: saved.scope.systemId ?? null, partId: saved.scope.partId ?? null }
      : { systemId: null, partId: null };
    camera.aspect = size.width / size.height;
    const target = new THREE.Vector3().fromArray(saved.target);
    const position = new THREE.Vector3().fromArray(saved.position);
    position.sub(target).multiplyScalar(Math.max(1, (saved.aspect ?? camera.aspect) / camera.aspect)).add(target);
    camera.up.fromArray(saved.up ?? [0, 1, 0]);
    camera.near = saved.near ?? 0.05;
    camera.far = saved.far ?? 600;
    const present = {
      r: framingOverride
        ? [framingOverride.x, framingOverride.y, framingOverride.width, framingOverride.height]
        : presentation().r,
      center: centerOverride ?? [0.5, 0.5],
      fill: presentation().fill,
      dir: presentation().dir,
      fov: presentation().fov,
    };
    const direction = position.clone().sub(target).normalize();
    const basis = basisFor(direction.toArray());
    const fit = {
      target, position, fov: saved.fov ?? present.fov,
      distance: position.distanceTo(target),
      direction: basis.direction, right: basis.right, up: basis.up,
    };
    standardDistance = fit.distance;
    applyView(fit, present);
    if (!reducedMotion) transition = null;
  }

  // Formal entrance used by the three-screen introduction. It starts with the
  // closed aircraft at the upper left of frame and slides it into the standard
  // overview without changing direction, FOV or elevation. The host calls this
  // from actions.enterExhibit(); this method holds no business state.
  function startEntrance({ reducedMotion = false } = {}) {
    if (disposed) return;
    model.root.updateWorldMatrix(true, true);
    if (!referencePoints) referencePoints = collectPoints([model.root]);
    viewState = 'overview';
    scope = { systemId: null, partId: null };
    framingOverride = null;
    centerOverride = null;
    transition = null;
    const present = presentationFor('overview', size, null, null);
    const current = collectPoints([model.root]);
    const to = fitPoints(current.length ? current : referencePoints, present);
    if (!to) return;
    standardDistance = to.distance;
    if (reducedMotion) {
      applyView(to, present);
      return;
    }
    const halfWidth = to.distance * Math.tan(to.fov * DEG / 2) * (size.width / size.height);
    const halfHeight = to.distance * Math.tan(to.fov * DEG / 2);
    const shift = to.right.clone().multiplyScalar(halfWidth * 0.62)
      .addScaledVector(to.up, -halfHeight * 0.36);
    const startTarget = to.target.clone().add(shift);
    const startPosition = to.position.clone().add(shift);
    const from = {
      ...to,
      target: startTarget,
      position: startPosition,
      distance: startPosition.distanceTo(startTarget),
    };
    applyView(from, present);
    transition = {
      kind: 'entrance', adapt: false, elapsed: 0, duration: ENTRANCE_DURATION,
      from, to, present,
    };
  }

  function getExploreLimits({ systemId = null, partId = null } = {}) {
    if (disposed) return { minDistance: 0.1, maxDistance: 1000, minPolarAngle: 0.15, maxPolarAngle: Math.PI * 0.8, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, enablePan: false };
    let low = standardDistance, high = standardDistance;
    if (!systemId && !partId && referencePoints && assembledProxy) {
      const present = wholePresentation();
      const reference = measureDistance(referencePoints, present);
      const assembled = measureDistance(assembledProxy, present, present.fill);
      if (reference > 0) low = reference;
      if (assembled > 0) {
        low = low > 0 ? Math.min(low, assembled) : assembled;
        high = Math.max(high, reference, assembled);
      }
      if (reference > 0) high = Math.max(high, reference);
    }
    const focused = Boolean(systemId || partId);
    const distance = Math.max(0.1, camera.position.distanceTo(controls.target));
    low = low > 0.1 ? low : distance;
    high = high > 0 ? high : distance;
    const completeFit = standardDistance > 0.1 ? standardDistance : high;
    return {
      minDistance: Math.max(0.1, (focused ? completeFit : low) * (focused ? 0.25 : 0.35)),
      maxDistance: Math.max(0.2, completeFit * (focused ? 2.4 : 1.18)),
      minPolarAngle: 0.16,
      maxPolarAngle: Math.PI * 0.8,
      minAzimuthAngle: -Infinity,
      maxAzimuthAngle: Infinity,
      enablePan: false,
    };
  }

  const api = {
    setOverview({ reducedMotion = true } = {}) {
      if (disposed) return;
      const origin = captureCamera();
      model.root.updateWorldMatrix(true, true);
      referencePoints = collectPoints([model.root]);
      referenceBounds = model.getBounds(null)?.clone() ?? null;
      assembledBoundsSnapshot = model.assembledBounds?.clone() ?? null;
      assembledProxy = assembledBoundsSnapshot && !assembledBoundsSnapshot.isEmpty()
        ? boxCorners(assembledBoundsSnapshot) : null;
      viewState = 'overview';
      scope = { systemId: null, partId: null };
      trackedCenter = null;
      framingOverride = null;
      centerOverride = null;
      wholeTransition(origin, Boolean(reducedMotion));
    },
    focusPart,
    startEntrance,
    getSnapshot,
    restoreView,
    restoreSnapshot,
    getExploreLimits,
    cancelTransition() { transition = null; },
    resize(next) {
      if (disposed || !next) return;
      if (!(next.width > 0) || !(next.height > 0)) return;
      const beforeDirection = camera.position.clone().sub(controls.target);
      const beforeDistance = beforeDirection.length();
      const present = presentationFor(viewState, next, framingOverride, centerOverride);
      size = { ...next };
      transition = null;
      const to = desiredForCurrent();
      if (!to) return;
      const fitTo = to;
      const ratio = standardDistance > 1e-4 && beforeDistance > 1e-4 ? beforeDistance / standardDistance : 1;
      const direction = beforeDistance > 1e-4 ? beforeDirection.normalize() : fitTo.position.clone().sub(fitTo.target).normalize();
      const maxRatio = scope.systemId || scope.partId ? 2.4 : 1.18;
      const distance = fitTo.distance * Math.min(maxRatio, Math.max(0.35, ratio));
      const basis = basisFor(direction.toArray());
      const fit = {
        target: fitTo.target.clone(),
        position: fitTo.target.clone().addScaledVector(direction, distance),
        distance, direction: basis.direction, right: basis.right, up: basis.up, fov: fitTo.fov,
      };
      standardDistance = fitTo.distance;
      applyView(fit, present);
    },
    update(delta) {
      if (disposed) return false;
      if (!transition) {
        if (!scope.systemId && !scope.partId) return false;
        const points = collectPoints(currentTargetObjects());
        if (!points.length) return false;
        const center = boundsOf(points).getCenter(new THREE.Vector3());
        if (!trackedCenter) {
          trackedCenter = center;
          return false;
        }
        const shift = center.clone().sub(trackedCenter);
        if (shift.length() <= 1e-6) return false;
        trackedCenter.copy(center);
        camera.position.add(shift);
        controls.target.add(shift);
        controls.update();
        camera.updateMatrixWorld(true);
        metricsCache = null;
        return true;
      }
      const d = Number.isFinite(delta) ? Math.max(0, Math.min(0.1, delta)) : 0;
      transition.elapsed += d;
      if (transition.kind === 'entrance') {
        const duration = transition.duration || ENTRANCE_DURATION;
        const t = clamp01(transition.elapsed / duration);
        if (t >= 1) {
          applyView(transition.to, transition.present);
          transition = null;
          return true;
        }
        const e = 1 - Math.pow(1 - t, 3);
        const position = transition.from.position.clone().lerp(transition.to.position, e);
        const target = transition.from.target.clone().lerp(transition.to.target, e);
        applyView({
          position, target, fov: lerp(transition.from.fov, transition.to.fov, e),
          distance: position.distanceTo(target),
          direction: transition.to.direction, right: transition.to.right, up: transition.to.up,
        }, transition.present);
        return true;
      }
      if (transition.kind === 'fixed') {
        const t = clamp01(transition.elapsed / transition.duration);
        const e = smoothstep(t);
        applyView({
          position: transition.from.position.clone().lerp(transition.to.position, e),
          target: transition.from.target.clone().lerp(transition.to.target, e),
          fov: lerp(transition.from.fov, transition.to.fov, e),
          distance: 0, direction: transition.to.direction, right: transition.to.right, up: transition.to.up,
        }, transition.present);
        if (t >= 1) transition = null;
        return true;
      }
      if (transition.elapsed - transition.lastSample >= ADAPT_STEP || transition.elapsed <= d + 1e-6) {
        const to = wholeDesired();
        if (to) {
          transition.to = to;
          standardDistance = to.distance;
          transition.lastSample = transition.elapsed;
        }
      }
      const to = transition.to;
      if (!to) { transition = null; return false; }
      if (transition.elapsed >= transition.duration) {
        applyView(to, transition.present);
        transition = null;
        return true;
      }
      const rate = 1 - Math.exp(-d * 13);
      const position = camera.position.clone().lerp(to.position, rate);
      const target = controls.target.clone().lerp(to.target, rate);
      const present = presentationFor(viewState, size, framingOverride, centerOverride);
      const basis = basisFor(to.direction.toArray());
      applyView({
        position, target, fov: lerp(camera.fov, to.fov, rate),
        distance: position.distanceTo(target), direction: basis.direction, right: basis.right, up: basis.up,
      }, present);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      transition = null;
      referencePoints = null;
      referenceBounds = null;
      assembledProxy = null;
      metricsCache = null;
      camera.clearViewOffset();
      camera.updateProjectionMatrix();
    },
  };
  return api;
}

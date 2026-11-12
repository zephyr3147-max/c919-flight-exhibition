import * as THREE from 'three';
const direction = new THREE.Vector3(1, .63, -1.25).normalize();
export function createCameraRig({ camera, controls, model, viewport }) {
  let size = { ...viewport }, transition = null;
  const standardFraming = () => size.width > 700 ? { x: .04, y: .12, width: .74, height: .76 } : { x: .04, y: .24, width: .92, height: .70 };
  let framing = standardFraming();
  const overviewBounds = model.getBounds(null).clone();
  function pointsFor(objects) {
    const meshes = new Set(); for (const object of objects) object.traverse(child => { if (child.isMesh && child.visible) meshes.add(child); });
    const count = [...meshes].reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    const points = new Float32Array(count * 3), point = new THREE.Vector3(); let offset = 0;
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) { point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld); points[offset++] = point.x; points[offset++] = point.y; points[offset++] = point.z; }
    }
    return points;
  }
  const overviewPoints = pointsFor([model.root]);
  const snapshot = () => ({ position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(),
    fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect,
    framing: { ...framing } });
  function fit(id = null, systemId = null) {
    let bounds;
    if (!id && systemId) {
      bounds = new THREE.Box3();
      const systems = systemId === 'fuselage' ? ['fuselage', 'cabin'] : [systemId];
      for (const system of systems) for (const partId of model.systems.get(system)?.partIds ?? []) bounds.union(model.getBounds(partId));
    } else bounds = model.getBounds(id);
    if (!bounds || bounds.isEmpty()) bounds = model.getBounds(null);
    if (!id && !systemId) bounds.union(overviewBounds);
    const target = bounds.getCenter(new THREE.Vector3());
    const ids = systemId === 'fuselage' ? ['fuselage', 'cabin'] : [systemId];
    const objects = id ? [model.parts.get(id).object] : systemId ? ids.flatMap(system => model.systems.get(system).partIds.map(partId => model.parts.get(partId).object)) : [model.root];
    const pointSets = [pointsFor(objects)]; if (!id && !systemId) pointSets.push(overviewPoints);
    const halfFov = THREE.MathUtils.degToRad(32 * .5);
    const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize(), up = direction.clone().cross(right);
    let distance = 1;
    const point = new THREE.Vector3();
    for (const points of pointSets) for (let i = 0; i < points.length; i += 3) {
      point.fromArray(points, i).sub(target); const depth = point.dot(direction);
      distance = Math.max(distance, depth + Math.abs(point.dot(right)) / (Math.tan(halfFov) * camera.aspect * framing.width), depth + Math.abs(point.dot(up)) / (Math.tan(halfFov) * framing.height));
    }
    distance = Math.max(4, distance * 1.04);
    return { target, position: target.clone().addScaledVector(direction, distance), fov: 32 };
  }
  function apply(pose) {
    camera.position.copy(pose.position); controls.target.copy(pose.target); camera.fov = pose.fov;
    if (framing.x === 0 && framing.y === 0 && framing.width === 1 && framing.height === 1) camera.clearViewOffset();
    else camera.setViewOffset(size.width, size.height, (.5 - framing.x - framing.width / 2) * size.width, (.5 - framing.y - framing.height / 2) * size.height, size.width, size.height);
    camera.lookAt(controls.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const keys = ['minDistance', 'maxDistance', 'minPolarAngle', 'maxPolarAngle', 'minAzimuthAngle', 'maxAzimuthAngle'];
    const saved = Object.fromEntries(keys.map(key => [key, controls[key]]));
    Object.assign(controls, { minDistance: 0, maxDistance: Infinity, minPolarAngle: 0, maxPolarAngle: Math.PI, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity });
    controls.update(); Object.assign(controls, saved);
  }
  return {
    setOverview({ reducedMotion = true } = {}) { framing = standardFraming(); this.focusPart({ partId: null, reducedMotion }); },
    focusPart({ systemId = null, partId = null, reducedMotion, framing: nextFraming }) {
      framing = nextFraming ? { ...nextFraming } : standardFraming();
      const to = fit(partId, systemId), from = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
      if (reducedMotion) { transition = null; apply(to); } else transition = { from, to, elapsed: 0 };
    },
    getSnapshot: snapshot,
    restoreSnapshot(saved, { viewport: next }) {
      transition = null; size = { ...next }; framing = { ...saved.framing }; camera.aspect = next.width / next.height;
      const target = new THREE.Vector3().fromArray(saved.target), position = new THREE.Vector3().fromArray(saved.position);
      position.sub(target).multiplyScalar(Math.max(1, saved.aspect / camera.aspect)).add(target);
      camera.up.fromArray(saved.up); camera.near = saved.near; camera.far = saved.far;
      apply({ position, target, fov: saved.fov });
    },
    getExploreLimits({ systemId = null, partId = null } = {}) { const planned = fit(partId, systemId), distance = planned.position.distanceTo(planned.target);
      return { minDistance: distance * .4, maxDistance: distance * 2.2, minPolarAngle: .2, maxPolarAngle: Math.PI * .75,
        minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity, enablePan: false }; },
    cancelTransition() { transition = null; },
    resize(next) { const saved = snapshot(); this.restoreSnapshot(saved, { viewport: next }); },
    update(delta) {
      if (!transition) return false;
      transition.elapsed += delta; const t = Math.min(1, transition.elapsed / .45), e = t * t * (3 - 2 * t);
      const { from, to } = transition;
      apply({ position: from.position.clone().lerp(to.position, e), target: from.target.clone().lerp(to.target, e), fov: from.fov + (to.fov - from.fov) * e });
      if (t === 1) transition = null; return true;
    },
    dispose() { transition = null; },
  };
}

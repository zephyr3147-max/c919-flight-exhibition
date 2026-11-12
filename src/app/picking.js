// Three.js raycasts do not test Object3D.visible. Keep picking and occlusion
// consistent with the actually displayed quality level, including parents.
export function isVisibleObject(object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false;
  return true;
}
export function visibleIntersections(raycaster, objects) {
  return raycaster.intersectObjects(objects.filter(isVisibleObject), false);
}

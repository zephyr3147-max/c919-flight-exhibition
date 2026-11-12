export function bindInput({ canvas, actions, store, pick, invalidate, beginCameraDrag }) {
  const cleanups = [], on = (target, type, fn, options) => { target.addEventListener(type, fn, options); cleanups.push(() => target.removeEventListener(type, fn, options)); };
  let pointer = null;
  const cancelPointer = () => { const id = pointer?.id; pointer = null; if (id !== undefined) canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, bubbles: true })); beginCameraDrag(); };
  on(canvas, 'wheel', e => { if (e.ctrlKey || e.metaKey) e.stopImmediatePropagation(); }, { capture: true, passive: true });
  on(window, 'keydown', e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (store.state.overlay) actions.setSourcesOpen(false);
      else if (pointer?.dragging) { cancelPointer(); invalidate(); }
      else if (store.state.scope.systemId || store.state.selectedId) actions.returnToAircraft();
      else actions.stopTransition();
      return;
    }
    if (e.target.matches('input,select,textarea,button,[contenteditable=true]') || store.state.overlay) return;
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); actions.resetView(); }
    else if (e.key === 'Home') { e.preventDefault(); actions.returnToAircraft(); }
  });
  on(canvas, 'pointerdown', e => { if (!store.state.ready || store.state.overlay || e.button !== 0) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false }; beginCameraDrag(); });
  on(canvas, 'pointermove', e => { if (pointer?.id === e.pointerId && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 5) pointer.dragging = true; });
  on(window, 'pointerup', e => { if (!pointer || pointer.id !== e.pointerId) return; const saved = pointer; pointer = null;
    if (!saved.dragging && store.state.ready && !store.state.overlay) { const id = pick(e.clientX, e.clientY); if (id) actions.selectPart(id); } });
  on(window, 'pointercancel', () => { pointer = null; });
  on(window, 'blur', () => { cancelPointer(); actions.stopTransition(); invalidate(); });
  on(document, 'visibilitychange', () => { if (document.hidden) { cancelPointer(); actions.stopTransition(); } else invalidate(); });
  return { cancelPointer, dispose() { cancelPointer(); for (const cleanup of cleanups) cleanup(); } };
}

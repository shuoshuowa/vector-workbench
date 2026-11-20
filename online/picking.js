/* Identify painted SVG elements while leaving pointer capture on the work surface. */
function browserCanvasPick(event, position) {
  const page = doc();
  if (position.x < 0 || position.y < 0 || position.x > page.width || position.y > page.height) return null;
  const rows = new Map(page.items.filter(o => !o.locked && matches(o)).map(o => [o.id, o]));
  const {clientX, clientY} = event;

  // Drafts are drawn above the imported scene. Only enable hit testing for this query.
  for (const layer of [localOverlay, fallbackTextOverlay]) {
    if (!layer.firstElementChild) continue;
    const saved = layer.style.pointerEvents;
    try {
      layer.style.pointerEvents = 'visiblePainted';
      for (const element of document.elementsFromPoint(clientX, clientY)) {
        if (!layer.contains(element) || element === layer) continue;
        const item = rows.get(element.closest('[data-id]')?.dataset.id);
        if (item && visiblePaintAt(element, clientX, clientY)) return item;
      }
    } finally { layer.style.pointerEvents = saved; }
  }

  const scene = activeScene;
  if (!scene || scene.key !== page.preview) {
    for (const id of VectorBrowser.sourceHits(position.x, position.y, clientX, clientY)) {
      if (rows.has(id)) return rows.get(id);
    }
    return null;
  }

  const owners = new WeakMap();
  for (const [id, node] of scene.nodes) {
    for (const el of [node.el, node.textProxy, node.imageEdge]) if (el) owners.set(el, id);
  }
  const rect = sceneFrame.getBoundingClientRect();
  const x = (clientX - rect.left) * sceneFrame.clientWidth / rect.width;
  const y = (clientY - rect.top) * sceneFrame.clientHeight / rect.height;
  for (const leaf of scene.svg.ownerDocument.elementsFromPoint(x, y)) {
    if (leaf === scene.svg || !scene.svg.contains(leaf) || !visiblePaintAt(leaf,x,y)) continue;
    for (let node = leaf; node && node !== scene.svg; node = node.parentElement) {
      const item = rows.get(owners.get(node));
      if (item) return item;
    }
  }
  return null;
}

function visiblePaintAt(el,x,y) {
  const view = el.ownerDocument.defaultView;
  for (let n=el; n?.namespaceURI==='http://www.w3.org/2000/svg'; n=n.parentElement) {
    if (Number(view.getComputedStyle(n).opacity) === 0) return false;
  }
  const s=view.getComputedStyle(el);
  if (s.visibility !== 'visible' || s.display === 'none') return false;
  if (!el.isPointInFill && !['text','tspan'].includes(el.localName)) return true;
  const paints = (color,opacity) => color !== 'none' && color !== 'transparent' && !/rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(color) && Number(opacity)>0;
  const fill = paints(s.fill,s.fillOpacity), stroke = paints(s.stroke,s.strokeOpacity) && parseFloat(s.strokeWidth)>0;
  if (!fill && !stroke) return false;
  if (!el.isPointInFill) return true;
  const matrix=el.getScreenCTM();
  if (!matrix) return false;
  const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());
  return (fill && el.isPointInFill(p)) || (stroke && el.isPointInStroke(p));
}

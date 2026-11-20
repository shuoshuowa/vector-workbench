/* SVG paints later siblings in front. The panel lists them in the opposite order. */
const VectorStack=(()=>{
  function shell(el){const copy=el.cloneNode(false);copy.removeAttribute('id');return copy;}
  function place(node,anchor,after){
    if(node===anchor||node.contains(anchor)||anchor.contains(node))return;
    if(node.parentNode===anchor.parentNode){after?anchor.after(node):anchor.before(node);return;}
    let common=anchor.parentElement;
    while(!common.contains(node))common=common.parentElement;
    // Carry inherited transforms, layer names and clipping with the moving object.
    let piece=node;
    for(let parent=node.parentElement;parent!==common;parent=parent.parentElement){
      const wrapper=shell(parent);wrapper.append(piece);piece=wrapper;
    }
    // Open an insertion point at the common ancestor without reordering the
    // surrounding artwork or inheriting the destination object's transform.
    let pivot=anchor;
    while(pivot.parentElement!==common){
      const parent=pivot.parentElement,cut=after?pivot.nextSibling:pivot;
      if(cut&&cut!==parent.firstChild){
        const right=shell(parent);
        for(let n=cut;n;){const next=n.nextSibling;right.append(n);n=next;}
        parent.after(right);after=true;
      }else after=!cut;
      pivot=parent;
    }
    if(after)pivot.after(piece);else pivot.before(piece);
  }
  function reorder(page,items,direction,anchor){
    const picked=new Set(items),order=VectorModel.drawables(page).filter(e=>!e.parentElement.closest('[data-vq]'));
    const selected=order.filter(e=>picked.has(e)),others=order.filter(e=>!picked.has(e));
    if(!others.length||!selected.length)return;
    if(anchor){
      if(picked.has(anchor))return;
      const after=direction==='above';
      for(const n of after?selected.slice().reverse():selected)place(n,anchor,after);
    }else if(direction==='front'||direction==='back'){
      const front=direction==='front',target=front?others.at(-1):others[0];
      for(const n of front?selected.slice().reverse():selected)place(n,target,front);
    }else{
      const up=direction==='up',list=up?order.slice().reverse():order;
      let neighbor=null;
      for(const n of list){if(!picked.has(n))neighbor=n;else if(neighbor){place(n,neighbor,up);}}
    }
  }
  return {reorder};
})();

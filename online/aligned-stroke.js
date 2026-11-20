/* The model stores one edge width in local units. Center strokes use SVG's native
   width. One-sided strokes use twice that width and discard the unwanted half. */
const VectorStroke=(()=>{
  const M=VectorModel,cache=new WeakMap(),PT=25.4/72;
  const valid=p=>['outside','inside','center'].includes(p);
  function eligible(el){return el.hasAttribute('data-raster-edge')||el.matches('text,rect,ellipse,circle,polygon')||el.localName==='path'&&(/z\s*$/i.test(el.getAttribute('d')||'')||getComputedStyle(el).fill!=='none');}
  function scaleY(el){const m=M.world(el.ownerSVGElement,el);return Math.hypot(m.c,m.d)||1;}
  function pos(el){return valid(el.dataset.strokePosition)?el.dataset.strokePosition:'center';}
  function isOn(el){return el.style.stroke!=='none'&&getComputedStyle(el).stroke!=='none';}
  function styled(el,ink,width){for(const n of [el,...el.querySelectorAll('tspan')]){n.style.stroke=ink;n.style.strokeWidth=width+'px';}}
  function store(el,position,ink,width,on=true){if(!eligible(el))position='center';
    el.dataset.strokePosition=valid(position)?position:'outside';el.dataset.strokeInk=ink||'#242735';el.dataset.edgeWidth=String(width);
    styled(el,on?el.dataset.strokeInk:'none',width);
  }
  function read(el,base){if(!eligible(el))return base;const has=el.hasAttribute('data-edge-width');
    return {...base,position:has?pos(el):base.enabled?'center':'outside',...(has?{enabled:isOn(el),color:el.dataset.strokeInk,width:Math.max(.1,Number(el.dataset.edgeWidth)*scaleY(el)/PT)}:{})};
  }
  function forceInk(el,fill,stroke,width){
    for(const n of [el,...el.querySelectorAll('*')]){
      for(const a of [...n.attributes])if(a.name==='id'||a.name.startsWith('data-'))n.removeAttribute(a.name);
      n.style.fill=fill;n.style.stroke=stroke;n.style.strokeWidth=width+'px';n.style.fillOpacity='1';n.style.strokeOpacity='1';n.style.opacity='1';n.style.filter='none';n.style.mixBlendMode='normal';
    }
    el.removeAttribute('transform');el.removeAttribute('filter');el.removeAttribute('mask');el.removeAttribute('clip-path');
  }
  function wrapBitmap(image){
    if(image.localName==='g'){image.dataset.rasterEdge='1';return image;}
    const g=M.make('g',{'data-raster-edge':'1'});
    for(const k of ['vq','kind','name'])if(image.dataset[k]){g.dataset[k]=image.dataset[k];delete image.dataset[k];}
    g.append(image);return g;
  }
  function bitmapEdge(el,stroke){
    const old=el.querySelector(':scope > [data-edge-pixels]'),base=el.querySelector(':scope > image');
    if(!stroke.enabled||!base){old?.remove();return;}
    const w=stroke.width*PT/scaleY(el),p=stroke.position||'center',color=stroke.color||'#242735';
    const key=JSON.stringify([w,p,color]);if(old?.dataset.edgePixels===key)return;
    old?.remove();const b=base.getBBox(),pad=w+2;
    const r={x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad};
    const g=M.make('g',{'data-edge-pixels':key,'pointer-events':'none'}),defs=M.make('defs'),id='rim'+crypto.randomUUID();
    const filter=M.make('filter',{id,filterUnits:'userSpaceOnUse',...r,'color-interpolation-filters':'sRGB'});
    const radius=p==='center'?w/2:w;
    if(p!=='inside')filter.append(M.make('feMorphology',{in:'SourceAlpha',operator:'dilate',radius,result:'outer'}));
    if(p!=='outside')filter.append(M.make('feMorphology',{in:'SourceAlpha',operator:'erode',radius,result:'inner'}));
    filter.append(M.make('feComposite',{in:p==='inside'?'SourceAlpha':'outer',in2:p==='outside'?'SourceAlpha':'inner',operator:'out',result:'rim'}),M.make('feFlood',{'flood-color':color,result:'ink'}),M.make('feComposite',{in:'ink',in2:'rim',operator:'in'}));
    const img=base.cloneNode(false);img.removeAttribute('id');img.style.opacity='1';img.style.filter='url(#'+id+')';defs.append(filter);g.append(defs,img);
    if(p==='outside')base.before(g);else el.append(g);
  }
  function apply(el,stroke){
    if(el?.localName==='g'&&!el.dataset.vq&&el.id.startsWith('VQNode')&&el.childElementCount===1)el=el.firstElementChild;
    if(!el||!eligible(el))return;
    if(el.hasAttribute('data-raster-edge')){if(stroke)bitmapEdge(el,stroke);return;}
    const p=stroke?.position||'center',on=!!stroke?.enabled,st=cache.get(el);
    if(!on||p==='center'){
      if(st){st.defs?.remove();cache.delete(el);el.style.paintOrder='';}
      if(st||on&&stroke.position){const w=(stroke.width||1)*PT/scaleY(el);styled(el,on?stroke.color||'#242735':'none',w);}
      return;
    }
    const ink=stroke.color||'#242735',w=stroke.width*PT/scaleY(el),s=getComputedStyle(el);
    const b=el.getBBox(),fills=[el,...el.querySelectorAll('tspan')];
    const opaque=p==='outside'&&fills.every(n=>{const v=getComputedStyle(n);return v.fill!=='none'&&!v.fill.startsWith('url(')&&!v.fill.startsWith('rgba(')&&v.fill!=='transparent'&&Number(v.fillOpacity)===1;});
    if(opaque){
      st?.defs?.remove();cache.set(el,{fast:true});
      for(const n of fills){n.style.paintOrder='stroke fill';n.style.strokeLinejoin='round';}
      styled(el,ink,2*w);return;
    }
    const pad=w*2+1,r={x:b.x-pad,y:b.y-pad,width:Math.max(1,b.width+pad*2),height:Math.max(1,b.height+pad*2)};
    // Use a luminance mask for hollow or translucent fills and for inner strokes.
    const key=JSON.stringify([p,ink,w,r,el.textContent,el.getAttribute('d'),el.getAttribute('points'),el.getAttribute('rx'),s.fontFamily,s.fontSize,s.fontWeight,el.getAttribute('ry'),...fills.slice(1).map(t=>[t.getAttribute('x'),t.getAttribute('y')])]);
    let resource=st;
    if(key!==st?.key||!st.defs?.isConnected){
      st?.defs?.remove();const defs=M.make('defs',{'data-edge-resource':'1'}),id='edge'+crypto.randomUUID(),mask=M.make('mask',{id:id+'m',maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',...r,'mask-type':'luminance'});
      const silhouette=el.cloneNode(true);forceInk(silhouette,p==='outside'?'black':'white','none',0);
      mask.append(M.make('rect',{...r,fill:p==='outside'?'white':'black'}),silhouette);
      const pattern=M.make('pattern',{id,patternUnits:'userSpaceOnUse',patternContentUnits:'userSpaceOnUse',...r});
      // A pattern with userSpaceOnUse content starts at the tile origin.
      const tile=M.make('g',{transform:'translate('+(-r.x)+' '+(-r.y)+')'});tile.append(M.make('rect',{...r,fill:ink,mask:'url(#'+id+'m)'}));pattern.append(tile);
      defs.append(mask,pattern);el.ownerSVGElement.prepend(defs);resource={key,defs,id};cache.set(el,resource);
    }
    for(const n of fills){n.style.paintOrder=p==='inside'?'fill stroke':'stroke fill';n.style.strokeLinejoin='round';}
    styled(el,'url(#'+resource.id+')',2*w);
  }
  function spec(el){return {enabled:isOn(el),position:pos(el),color:el.dataset.strokeInk,width:Number(el.dataset.edgeWidth)*scaleY(el)/PT};}
  function refresh(page){if(!page?.querySelector('[data-edge-width]'))return;M.mount(page);
    for(const el of M.drawables(page))if(el.hasAttribute('data-edge-width'))apply(el,spec(el));
    const used=new Set(M.drawables(page).map(el=>cache.get(el)?.defs).filter(Boolean));
    for(const d of page.querySelectorAll('defs[data-edge-resource]'))if(!used.has(d))d.remove();
  }
  async function pdf(src,copy,canvasOf){
    for(const el of M.drawables(src)){
      if(el.hasAttribute('data-raster-edge')){
        const pixels=el.querySelector(':scope > [data-edge-pixels]'),dst=copy.querySelector('[data-vq="'+el.dataset.vq+'"] > [data-edge-pixels]');
        if(pixels&&dst){const filter=pixels.querySelector('filter'),r=Object.fromEntries(['x','y','width','height'].map(k=>[k,+filter.getAttribute(k)])),svg=M.make('svg',{viewBox:[r.x,r.y,r.width,r.height].join(' '),width:r.width,height:r.height});svg.append(pixels.cloneNode(true));
          const k=Math.min(1,Math.sqrt(6e6/Math.max(1,r.width*r.height)));const c=await canvasOf(svg,Math.max(1,Math.ceil(r.width*k)),Math.max(1,Math.ceil(r.height*k)));dst.replaceWith(M.make('image',{...r,href:c.toDataURL(),preserveAspectRatio:'none'}));}
        continue;
      }
      if(!el.dataset.edgeWidth||pos(el)==='center'||!isOn(el))continue;
      const n=copy.querySelector('[data-vq="'+el.dataset.vq+'"]');if(!n)continue;
      styled(n,el.dataset.strokeInk,2*Number(el.dataset.edgeWidth));
      for(const t of [n,...n.querySelectorAll('tspan')])t.setAttribute('data-pdf-edge',pos(el));
    }
    copy.querySelectorAll('defs[data-edge-resource]').forEach(n=>n.remove());
  }
  return {eligible,wrapBitmap,store,read,apply,refresh,pdf,pos,scaleY};
})();

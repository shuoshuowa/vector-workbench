/* Native SVG appearance; display and export use the same stops and shadow geometry. */
const VectorEffects=(()=>{
  const M=VectorModel,states=new WeakMap(),modes={normal:'Normal',multiply:'Multiply',screen:'Screen',overlay:'Overlay',darken:'Darken',lighten:'Lighten',difference:'Difference'};
  // Photoshop stores the light direction; SVG offsets point away from the light.
  function shadowAngle(s){
    if(Number.isFinite(s.angle))return s.angle;
    return s.x||s.y?Math.atan2(s.y,-s.x)*180/Math.PI:135;
  }
  function shadowOffset(angle,distance){
    const r=angle*Math.PI/180;
    return {angle,x:Math.abs(Math.cos(r))<1e-12?0:-Math.cos(r)*distance,y:Math.abs(Math.sin(r))<1e-12?0:Math.sin(r)*distance};
  }
  function read(el){try{return el.dataset.vqFx?JSON.parse(el.dataset.vqFx):null;}catch{return null;}}
  function scale(el){const root=el.ownerSVGElement?.closest('svg');if(!root?.getScreenCTM()||!el.getScreenCTM())return {x:1,y:1};
    const m=root.getScreenCTM().inverse().multiply(el.getScreenCTM());return {x:Math.hypot(m.a,m.b)||1,y:Math.hypot(m.c,m.d)||1};}
  function bounds(el,s,sc){const b=el.getBBox(),dx=s.x/sc.x,dy=s.y/sc.y,blur=s.blur;
    const mx=3.5*blur/sc.x+1/sc.x,my=3.5*blur/sc.y+1/sc.y;
    return {x:b.x+Math.min(0,dx)-mx,y:b.y+Math.min(0,dy)-my,width:Math.max(.01,b.width+Math.abs(dx)+2*mx),height:Math.max(.01,b.height+Math.abs(dy)+2*my)};}
  function apply(el,fx,fill,write=false){
    const raster=el.querySelector(':scope > [data-raster-gradient]');if(raster){raster.style.display=fx?.gradient?'':'none';const image=el.querySelector(':scope > image');if(image)image.style.opacity=fx?.gradient?el.dataset.baseOpacity||'1':'1';}
    let st=states.get(el);if(!fx&&!st)return;
    if(!st){st={base:[el.style.opacity,el.style.mixBlendMode,el.style.filter,el.style.fill],id:'appearance'+crypto.randomUUID(),styles:new Map()};states.set(el,st);}
    if(!fx){[el.style.opacity,el.style.mixBlendMode,el.style.filter,el.style.fill]=st.base;for(const [n,v] of st.styles)n.style.fill=v;st.defs?.remove();states.delete(el);return;}
    if(write)el.dataset.vqFx=JSON.stringify(fx);
    const svg=el.ownerSVGElement;if(!svg)return;const sc=scale(el),r=fx.shadow?bounds(el,fx.shadow,sc):null;
    const signature=JSON.stringify([fx.gradient,fx.shadow,sc.x,sc.y,r,fx.gradient?.colors?Array.from(['x','y','width','height'],k=>el.getBBox()[k]):null]);
    if(st.signature!==signature||!st.defs?.isConnected){st.defs?.remove();const defs=M.make('defs',{'data-vq-appearance':el.dataset.vq||''});svg.prepend(defs);st.defs=defs;st.signature=signature;
      if(fx.gradient){const g=fx.gradient,radians=g.angle*Math.PI/180,dx=Math.cos(radians)*50,dy=Math.sin(radians)*50;
        const grad=g.kind==='radial'?M.make('radialGradient',{id:st.id+'g',cx:'50%',cy:'50%',r:'65%'}):M.make('linearGradient',{id:st.id+'g',x1:(50-dx)+'%',y1:(50-dy)+'%',x2:(50+dx)+'%',y2:(50+dy)+'%'});
        if(g.colors){const b=el.getBBox(),cos=Math.cos(radians),sin=Math.sin(radians),cx=b.x+b.width*(.5+(g.offset?.x||0)),cy=b.y+b.height*(.5+(g.offset?.y||0));
          const length=(Math.abs(b.width*sc.x*cos)+Math.abs(b.height*sc.y*sin))*(g.scale??1)/2;
          grad.setAttribute('gradientUnits','userSpaceOnUse');const attrs=g.kind==='radial'?{cx,cy,r:Math.max(.0001,length/sc.x)}:{x1:cx-cos*length/sc.x,y1:cy-sin*length/sc.y,x2:cx+cos*length/sc.x,y2:cy+sin*length/sc.y};
          for(const [k,v] of Object.entries(attrs))grad.setAttribute(k,v);}
        if(g.svgGeometry?.kind===g.kind&&g.svgGeometry.angle===g.angle){for(const k of ['gradientUnits','x1','y1','x2','y2','cx','cy','r','fx','fy','fr'])grad.removeAttribute(k);for(const k of ['gradientUnits','gradientTransform','spreadMethod','x1','y1','x2','y2','cx','cy','r','fx','fy','fr'])if(g.svgGeometry.attrs?.[k]!=null)grad.setAttribute(k,g.svgGeometry.attrs[k]);}
        grad.append(...VectorShapeFills.svgStops(g).map(stop=>M.make('stop',stop)));defs.append(grad);}
      if(fx.shadow){const s=fx.shadow,filter=M.make('filter',{id:st.id+'s',filterUnits:'userSpaceOnUse',...r,'color-interpolation-filters':'sRGB'});
        filter.append(M.make('feGaussianBlur',{in:'SourceAlpha',stdDeviation:(s.blur/sc.x)+' '+(s.blur/sc.y),result:'soft'}),M.make('feOffset',{in:'soft',dx:s.x/sc.x,dy:s.y/sc.y,result:'offset'}),M.make('feFlood',{'flood-color':s.color,'flood-opacity':s.alpha,result:'ink'}),M.make('feComposite',{in:'ink',in2:'offset',operator:'in',result:'shadow'}));
        const merge=M.make('feMerge');merge.append(M.make('feMergeNode',{in:'shadow'}),M.make('feMergeNode',{in:'SourceGraphic'}));filter.append(merge);defs.append(filter);}
    }
    if('gradient' in fx){const value=fx.gradient?'url(#'+st.id+'g)':fill||'#000000';el.style.fill=value;if(raster)raster.style.fill=value;for(const n of el.querySelectorAll('tspan')){if(!st.styles.has(n))st.styles.set(n,n.style.fill);n.style.fill='inherit';}}
    if('shadow' in fx)el.style.filter=fx.shadow?'url(#'+st.id+'s)':'none';
    if('opacity' in fx)el.style.opacity=String(fx.opacity);
    if('blend' in fx)el.style.mixBlendMode=fx.blend;
  }
  function commit(p,el,fx){const solid=el.dataset.solidFill||getComputedStyle(el).fill||'#000000';
    el.dataset.solidFill=solid;if(!states.has(el))for(const d of p.querySelectorAll('defs[data-vq-appearance]'))if(d.dataset.vqAppearance===el.dataset.vq)d.remove();apply(el,fx,solid,true);}
  function refresh(p){if(!p?.querySelector('[data-vq-fx]'))return;M.mount(p);for(const el of M.drawables(p)){const f=read(el);if(f)commit(p,el,f);}}
  async function pdf(root,copy,canvasOf,markers){
    M.mount(root);
    for(const el of M.drawables(root)){const fx=read(el);if(!fx)continue;const dest=copy.querySelector('[data-vq="'+el.dataset.vq+'"]');if(!dest)continue;
      if(fx.blend&&modes[fx.blend])dest.dataset.pdfBlend=modes[fx.blend];
      const marker=markers?.get(el.dataset.vq);if(marker){for(const n of [dest,...dest.querySelectorAll('tspan')]){n.style.fill=marker;n.setAttribute('fill',marker);}}
      if(!fx.shadow)continue;
      const sc=scale(el),r=bounds(el,fx.shadow,sc),pixels=Math.min(144/25.4,Math.sqrt(6e6/(r.width*sc.x*r.height*sc.y)));
      const isolated=M.make('svg',{xmlns:'http://www.w3.org/2000/svg',width:r.width,height:r.height,viewBox:[r.x,r.y,r.width,r.height].join(' ')});
      for(const def of root.querySelectorAll('defs,style'))if(!def.parentElement?.closest('defs'))isolated.append(def.cloneNode(true));
      const fg=el.cloneNode(true);fg.removeAttribute('transform');fg.style.opacity='1';fg.style.mixBlendMode='normal';isolated.append(fg);
      const key=(el.style.filter.match(/#([^"')]+)/)||[])[1],filter=key&&isolated.getElementById(key);
      if(!filter)throw Error('投影预览数据不完整，请重新应用投影。');
      filter.querySelector('feMerge')?.remove();
      isolated.removeAttribute('xmlns');
      const bitmap=await canvasOf(isolated,Math.max(1,Math.ceil(r.width*sc.x*pixels)),Math.max(1,Math.ceil(r.height*sc.y*pixels)));
      const group=M.make('g',{opacity:fx.opacity??1,'data-pdf-blend':modes[fx.blend]||'Normal'}),img=M.make('image',{...r,href:bitmap.toDataURL(),transform:dest.getAttribute('transform'),preserveAspectRatio:'none'});
      dest.before(group);dest.style.opacity='1';dest.style.filter='none';dest.removeAttribute('filter');dest.removeAttribute('data-pdf-blend');group.append(img,dest);
    }
  }
  const hex=c=>c&&'r' in c?'#'+[c.r,c.g,c.b].map(n=>Math.round(n).toString(16).padStart(2,'0')).join(''):'#000000';
  const rgb=h=>({r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)});
  function psdStyle(e,work,ppi,nativeFill=false){
    const f=read(e)||{},computed=getComputedStyle(e),stroke=!!(e.matches('rect,path,polygon,ellipse,circle,line,text,polyline,[data-raster-edge]')&&computed.stroke!=='none'&&parseFloat(computed.strokeWidth)>0);if(!stroke&&!Object.keys(f).length)return {};const n=work.querySelector('[data-vq="'+e.dataset.vq+'"]');if(!n)return {};
    const layer={opacity:f.opacity??1,blendMode:f.blend||'normal'},effects={scale:1},s=f.shadow,g=f.gradient,k=ppi/25.4;
    n.style.opacity='1';n.style.mixBlendMode='normal';n.style.filter='none';n.removeAttribute('filter');
    const raster=n.querySelector(':scope > [data-raster-gradient]');if(raster){raster.remove();const base=n.querySelector(':scope > image');if(base)base.style.opacity='1';}
    if(stroke){n.querySelector(':scope > [data-edge-pixels]')?.remove();const source=e.dataset.strokeInk||computed.stroke,color=/^#[0-9a-f]{6}$/i.test(source)?rgb(source):null;const c=computed.stroke.match(/[\d.]+/g)?.map(Number)||[0,0,0];effects.stroke=[{enabled:true,present:true,position:VectorStroke.pos(e),fillType:'color',blendMode:'normal',opacity:1,color:color||{r:c[0],g:c[1],b:c[2]},size:{units:'Pixels',value:(Number(e.dataset.edgeWidth)||parseFloat(computed.strokeWidth))*scale(e).y*k}}];for(const t of [n,...n.querySelectorAll('tspan')])t.style.stroke='none';}
    if(g&&!nativeFill){if(raster||g.fromAlpha<1||g.toAlpha<1)layer.fillOpacity=raster?Number(e.dataset.baseOpacity??1):0;for(const t of [n,...n.querySelectorAll('tspan')])t.style.fill=e.dataset.solidFill||'#000000';
      effects.gradientOverlay=[{enabled:true,present:true,blendMode:'normal',opacity:1,align:true,reverse:false,dither:false,offset:{x:0,y:0},type:g.kind,angle:-g.angle,scale:g.scale??1,
        gradient:VectorShapeFills.psdGradient(g)}];}
    if(s)effects.dropShadow=[{enabled:true,present:true,blendMode:'multiply',color:rgb(s.color),opacity:s.alpha,useGlobalLight:false,angle:shadowAngle(s),distance:{units:'Pixels',value:Math.hypot(s.x,s.y)*k},size:{units:'Pixels',value:s.blur*k},choke:{units:'Pixels',value:0},noise:0,antialiased:false,layerConceals:true,contour:{name:'Linear',curve:[{x:0,y:0},{x:255,y:255}]}}];
    if(g&&!nativeFill||s||stroke)layer.effects=effects;return layer;
  }
  function fromPsd(l,mm){
    const f={},effects=l.effects?.disabled?null:l.effects,g=effects?.gradientOverlay?.find(v=>v.enabled!==false),s=effects?.dropShadow?.find(v=>v.enabled!==false);
    if(l.blendMode&&l.blendMode!=='normal'&&modes[l.blendMode])f.blend=l.blendMode;
    if(l.opacity!=null&&l.opacity!==1)f.opacity=l.opacity;
    if(g?.gradient?.type==='solid'){const gradient=VectorShapeFills.gradient(g.gradient,{...g,typeStyle:g.type});if(gradient)f.gradient=gradient;}
    if(s){const dist=(s.distance?.value||0)*mm;f.shadow={...shadowOffset(s.angle||0,dist),blur:(s.size?.value||0)*mm,color:hex(s.color),alpha:s.opacity??1};}
    return Object.keys(f).length?f:null;
  }
  function rasterGradient(image,baseOpacity=1){
    const group=M.mark(M.make('g'),'image',image.dataset.name);group.dataset.solidFill='#000000';group.dataset.baseOpacity=String(baseOpacity);delete image.dataset.vq;delete image.dataset.kind;
    const bounds={};for(const k of ['x','y','width','height'])bounds[k]=image.getAttribute(k);
    const id='alpha'+crypto.randomUUID(),mask=M.make('mask',{id,maskUnits:'userSpaceOnUse',...bounds,'mask-type':'alpha'}),defs=M.make('defs');
    mask.append(image.cloneNode(true));defs.append(mask);
    const overlay=M.make('rect',{...bounds,mask:'url(#'+id+')','data-raster-gradient':'1'});
    group.append(image,defs,overlay);return group;
  }
  return {read,apply,commit,refresh,pdf,modes,psdStyle,fromPsd,rasterGradient,shadowAngle,shadowOffset};
})();

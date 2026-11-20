/* Photoshop shape fills (GdFl + vmsk/vogk) are independent of layer effects. */
const VectorShapeFills=(()=>{
  const M=VectorModel,clamp=v=>Math.max(0,Math.min(1,v));
  const hex=c=>c&&'r' in c?'#'+[c.r,c.g,c.b].map(x=>Math.round(Math.max(0,Math.min(255,x))).toString(16).padStart(2,'0')).join(''):null;
  const rgb=h=>({r:parseInt(h.slice(1,3),16),g:parseInt(h.slice(3,5),16),b:parseInt(h.slice(5,7),16)});
  function gradient(src,options=src){
    if(src?.type!=='solid'||src.colorStops.length<2||!['linear','radial'].includes(options.style||options.typeStyle||'linear'))return null;
    const colors=src.colorStops.map(s=>({at:s.location,mid:s.midpoint??.5,value:hex(s.color)}));if(colors.some(s=>!s.value))return null;
    const alphas=(src.opacityStops?.length?src.opacityStops:[{location:0,opacity:1},{location:1,opacity:1}]).map(s=>({at:s.location,mid:s.midpoint??.5,value:s.opacity*(options.opacity??1)}));
    function orient(list){list.sort((a,b)=>a.at-b.at);if(!options.reverse)return list;return list.map((s,i)=>({...s,at:1-s.at,mid:1-(list[i-1]?.mid??.5)})).reverse();}
    const c=orient(colors),a=orient(alphas);return {kind:options.style||options.typeStyle||'linear',angle:-(options.angle??90),scale:options.scale??1,offset:options.offset||{x:0,y:0},colors:c,alphas:a,from:c[0].value,to:c.at(-1).value,fromAlpha:a[0].value,toAlpha:a.at(-1).value};
  }
  function stops(g){
    function endpoints(list,from,to){const s=list?.length>1?list.map(x=>({...x})):[{at:0,mid:.5},{at:1,mid:.5}];s[0].value=from;s.at(-1).value=to;return s;}
    return {colors:endpoints(g.colors,g.from,g.to),alphas:endpoints(g.alphas,g.fromAlpha??1,g.toAlpha??1)};
  }
  function sample(s,x,color){
    let i=s.findIndex(v=>v.at>x);if(i<0)return s.at(-1).value;if(!i)return s[0].value;
    const a=s[i-1],b=s[i],t=clamp((x-a.at)/(b.at-a.at||1)),m=Math.max(.0001,Math.min(.9999,a.mid??.5)),v=t<m?.5*t/m:.5+.5*(t-m)/(1-m);
    if(!color)return a.value+(b.value-a.value)*v;
    const u=rgb(a.value),z=rgb(b.value);return hex({r:u.r+(z.r-u.r)*v,g:u.g+(z.g-u.g)*v,b:u.b+(z.b-u.b)*v});
  }
  function svgStops(g){
    const {colors,alphas}=stops(g),at=new Set([0,1]);for(const s of [colors,alphas])s.forEach((v,i)=>{at.add(v.at);if(i<s.length-1&&Math.abs(v.mid-.5)>.001)at.add(v.at+v.mid*(s[i+1].at-v.at));});
    return [...at].sort((a,b)=>a-b).map(x=>({offset:x,'stop-color':sample(colors,x,true),'stop-opacity':sample(alphas,x,false)}));
  }
  function psdGradient(g){
    const s=stops(g);return {type:'solid',name:'Gradient',smoothness:1,colorStops:s.colors.map(v=>({location:v.at,midpoint:v.mid,color:rgb(v.value)})),opacityStops:s.alphas.map(v=>({location:v.at,midpoint:v.mid,opacity:v.value}))};
  }
  function pixels(v,ppi){return (v?.value||0)*(v?.units==='Points'?ppi/72:1);}
  function importLayer(layer,ppi){
    const fill=layer.vectorFill,mask=layer.vectorMask,paths=mask?.paths,desc=layer.vectorOrigination?.keyDescriptorList?.[0];
    if(!fill||!paths?.length||mask.disable||mask.invert||mask.fillStartsWithAllPixels||layer.mask||layer.clipping||paths.some(p=>p.open||p.operation&&p.operation!=='combine'||!p.knots?.length))return null;
    if(fill.align===false||layer.effects?.gradientOverlay?.some(g=>g.enabled!==false))return null;
    const grad=gradient(fill),ink=grad?.from||hex(fill.color);if(!ink||!grad&&fill.type!=='color')return null;
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;for(const path of paths)for(const knot of path.knots){const [, ,px,py]=knot.points;x=Math.min(x,px);y=Math.min(y,py);right=Math.max(right,px);bottom=Math.max(bottom,py);}
    const w=right-x,h=bottom-y;if(!(w>0&&h>0))return null;
    const bounds=desc?.keyOriginShapeBoundingBox,corners=desc?.keyOriginBoxCorners||[],radii=Object.values(desc?.keyOriginRRectRadii||{}).map(v=>pixels(v,ppi));
    const near=(a,b)=>Math.abs(a-b)<.08;
    const rect=paths.length===1&&[1,2].includes(desc?.keyOriginType)&&!desc?.keyShapeInvalidated&&bounds&&
      near(pixels(bounds.left,ppi),x)&&near(pixels(bounds.right,ppi),x+w)&&near(pixels(bounds.top,ppi),y)&&near(pixels(bounds.bottom,ppi),y+h)&&
      corners.every(c=>(near(c.x,x)||near(c.x,x+w))&&(near(c.y,y)||near(c.y,y+h)))&&radii.every(r=>near(r,radii[0]));
    let el;
    if(rect)el=M.mark(M.make('rect',{x,y,width:w,height:h,rx:Math.min(w/2,h/2,radii[0]||0)}),'rect',layer.name);
    else{const commands=[];for(const path of paths){const k=path.knots;commands.push('M',...k[0].points.slice(2,4));for(let i=0;i<k.length;i++){const next=k[(i+1)%k.length].points;commands.push('C',...k[i].points.slice(4,6),...next.slice(0,4));}commands.push('Z');}
      el=M.mark(M.make('path',{d:commands.join(' '),'fill-rule':paths[0].fillRule||'nonzero'}),'shape',layer.name);}
    el.setAttribute('fill',layer.vectorStroke?.fillEnabled===false?'none':ink);
    if(grad){el.dataset.solidFill=ink;el.dataset.vqFx=JSON.stringify({gradient:grad});}
    const stroke=layer.vectorStroke,strokeInk=hex(stroke?.content?.color);
    if(stroke?.strokeEnabled&&strokeInk)VectorStroke.store(el,stroke.lineAlignment||'center',strokeInk,pixels(stroke.lineWidth,ppi),true);
    return el;
  }
  function exportRect(page,e,ppi){
    if(e.localName!=='rect'||getComputedStyle(e).fill==='none')return null;
    const m=M.world(page,e);if(m.a<=0||m.d<=0||Math.abs(m.b)+Math.abs(m.c)>.00002)return null;
    const scale=ppi/25.4,b=M.box(page,e),x=b.x*scale,y=b.y*scale,w=b.w*scale,h=b.h*scale,R=x+w,B=y+h;
    const rx=Math.min(w/2,e.rx.baseVal.value*m.a*scale),ry=Math.min(h/2,(e.hasAttribute('ry')?e.ry.baseVal.value:e.rx.baseVal.value)*m.d*scale),k=.55228475;
    const knot=(x,y,ix=x,iy=y,ox=x,oy=y)=>({linked:true,points:[ix,iy,x,y,ox,oy]});
    const knots=rx&&ry?[knot(x+rx,y,x+rx-rx*k,y),knot(R-rx,y,R-rx,y,R-rx+rx*k,y),knot(R,y+ry,R,y+ry-ry*k),knot(R,B-ry,R,B-ry,R,B-ry+ry*k),knot(R-rx,B,R-rx+rx*k,B),knot(x+rx,B,x+rx,B,x+rx-rx*k,B),knot(x,B-ry,x,B-ry+ry*k),knot(x,y+ry,x,y+ry,x,y+ry-ry*k)]:[knot(x,y),knot(R,y),knot(R,B),knot(x,B)];
    const px=value=>({units:'Pixels',value}),g=VectorEffects.read(e)?.gradient,solid=e.dataset.solidFill||getComputedStyle(e).fill;
    let color;if(!g){const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=solid;if(!/^#[0-9a-f]{6}$/i.test(ctx.fillStyle)||String(solid).includes('url('))return null;color=rgb(ctx.fillStyle);}
    const vectorFill=g?{...psdGradient(g),style:g.kind,angle:-g.angle,scale:g.scale??1,offset:g.offset||{x:0,y:0},align:true}:({type:'color',color});
    const desc={keyOriginType:rx?2:1,keyOriginResolution:ppi,keyOriginShapeBoundingBox:{left:px(x),top:px(y),right:px(R),bottom:px(B)},keyOriginBoxCorners:[{x,y},{x:R,y},{x:R,y:B},{x,y:B}]};
    if(rx)desc.keyOriginRRectRadii=Object.fromEntries(['topLeft','topRight','bottomLeft','bottomRight'].map(n=>[n,px(rx)]));
    return {vectorFill,vectorMask:{paths:[{open:false,operation:'combine',fillRule:'even-odd',knots}]},vectorOrigination:{keyDescriptorList:[desc]}};
  }
  function offsetPsd(layer,x,y){
    for(const path of layer.vectorMask?.paths||[])for(const k of path.knots)k.points=k.points.map((v,i)=>v+(i%2?y:x));
    for(const desc of layer.vectorOrigination?.keyDescriptorList||[]){const b=desc.keyOriginShapeBoundingBox;b.left.value+=x;b.right.value+=x;b.top.value+=y;b.bottom.value+=y;for(const p of desc.keyOriginBoxCorners){p.x+=x;p.y+=y;}}
  }
  function importSvg(root){
    if(!root.querySelector('linearGradient,radialGradient'))return root;
    M.mount(root);
    const color=document.createElement('canvas').getContext('2d');
    for(const el of M.drawables(root)){
      if(!['rect','shape','text'].includes(el.dataset.kind)||VectorEffects.read(el)?.gradient)continue;
      const paint=getComputedStyle(el.querySelector('tspan')||el).fill,ref=/url\(["']?[^)]*?#([^"')]+)["']?\)/.exec(paint);
      let node=ref&&root.getElementById(ref[1]);if(!node||!['linearGradient','radialGradient'].includes(node.localName))continue;
      const kind=node.localName==='linearGradient'?'linear':'radial',chain=[],visited=new Set();while(node&&!visited.has(node)){chain.push(node);visited.add(node);const link=node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href');node=link?.startsWith('#')?root.getElementById(link.slice(1)):null;}
      const source=chain.find(n=>n.querySelector('stop')),list=source?[...source.querySelectorAll('stop')]:[];if(list.length<2)continue;
      const attrs={};for(const n of chain.slice().reverse())for(const k of ['gradientUnits','gradientTransform','spreadMethod','x1','y1','x2','y2','cx','cy','r','fx','fy','fr'])if(n.hasAttribute(k))attrs[k]=n.getAttribute(k);
      const values=list.map(s=>{const c=getComputedStyle(s);color.fillStyle='#000000';color.fillStyle=c.stopColor;const value=color.fillStyle,m=value.match(/[\d.]+/g);return {at:s.offset.baseVal,mid:.5,value:value.startsWith('#')?value:hex({r:+m[0],g:+m[1],b:+m[2]}),alpha:Number(c.stopOpacity)*(value.startsWith('rgba')?+m[3]:1)};});
      const scalar=(v,def)=>v==null?def:parseFloat(v)*(v.endsWith('%')?.01:1);
      const angle=Math.atan2(scalar(attrs.y2,0)-scalar(attrs.y1,0),scalar(attrs.x2,1)-scalar(attrs.x1,0))*180/Math.PI;
      const grad={kind,angle,from:values[0].value,to:values.at(-1).value,fromAlpha:values[0].alpha,toAlpha:values.at(-1).alpha,
        colors:values.map(({at,mid,value})=>({at,mid,value})),alphas:values.map(s=>({at:s.at,mid:s.mid,value:s.alpha})),svgGeometry:{kind,angle,attrs}};
      el.dataset.solidFill=grad.from;el.dataset.vqFx=JSON.stringify({...VectorEffects.read(el),gradient:grad});
    }
    return root;
  }
  return {gradient,svgStops,psdGradient,importLayer,importSvg,exportRect,offsetPsd};
})();

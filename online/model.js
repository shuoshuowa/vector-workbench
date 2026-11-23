/* In-browser SVG document model. Coordinates in the root viewBox are millimetres. */
(() => {
'use strict';
const NS='http://www.w3.org/2000/svg', PT=25.4/72;
const make=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))if(v!=null)e.setAttribute(k,v);return e;};
const preserveBreaks=s=>s.replace(/(\sdata-text=")([^"]*)"/g,(_,attr,value)=>attr+value.replace(/\r\n?|\n/g,'&#10;').replace(/\t/g,'&#9;')+'"');
const xml=e=>preserveBreaks(new XMLSerializer().serializeToString(e));
const parse=s=>{const r=new DOMParser().parseFromString(preserveBreaks(s),'image/svg+xml');if(r.querySelector('parsererror')||r.documentElement.localName!=='svg')throw Error('SVG 文件无法解析。');return document.importNode(r.documentElement,true);};
const matrix=m=>new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);
const transform=(e,m)=>e.setAttribute('transform','matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')');
const host=document.createElement('div');host.style.cssText='position:fixed;left:-100000px;top:0;pointer-events:none;visibility:hidden';document.body.append(host);
const space=host.attachShadow({mode:'closed'});
let serial=0;
const mark=(e,type,name)=>{e.dataset.vq=String(++serial);e.dataset.kind=type;if(name)e.dataset.name=name;return e;};
const id=e=>e?'l0/i'+e.dataset.vq:null;
const find=(page,key)=>/^l0\/i\d+$/.test(key)?page.querySelector('[data-vq="'+key.slice(4)+'"]'):null;
const names={text:'文字',rect:'矩形',shape:'路径',image:'图片',group:'组合',mask:'图片框'};
function board(w,h,unit='mm'){return make('svg',{width:w+'mm',height:h+'mm',viewBox:'0 0 '+w+' '+h,'data-board-unit':unit,'xmlns:xlink':'http://www.w3.org/1999/xlink'});}
function mount(root){if(root.parentNode!==space)space.replaceChildren(root);}
function sourceHits(page,x,y,clientX,clientY){
  // The first preview is already visible while the interactive iframe is being built.
  // Project the measurement tree under this point for one synchronous, invisible pick.
  mount(page);
  const origin=new DOMPoint(x,y).matrixTransform(page.getScreenCTM());
  const saved=host.style.cssText;
  try{
    Object.assign(host.style,{transform:'translate('+(clientX-origin.x)+'px,'+(clientY-origin.y)+'px)',opacity:'0',visibility:'visible',pointerEvents:'auto',zIndex:'2147483647'});
    const hits=[];
    for(const el of space.elementsFromPoint(clientX,clientY)){
      const owner=el.closest('[data-vq]');
      if(owner&&page.contains(owner)&&visiblePaintAt(el,clientX,clientY))hits.push(id(owner));
    }
    return hits;
  }finally{host.style.cssText=saved;}
}
function world(page,e){return matrix(page.getScreenCTM()).inverse().multiply(matrix(e.getScreenCTM()));}
function box(page,e){
  if(e.dataset.kind==='mask'&&e.dataset.frame){const [x,y,w,h]=e.dataset.frame.split(' ').map(Number);return mapped(world(page,e),x,y,w,h);}
  const b=e.getBBox();return mapped(world(page,e),b.x,b.y,b.width,b.height);
}
function mapped(m,x,y,w,h){const ps=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([u,v])=>new DOMPoint(u,v).matrixTransform(m));
  const x0=Math.min(...ps.map(p=>p.x)),y0=Math.min(...ps.map(p=>p.y));return {x:x0,y:y0,w:Math.max(.01,Math.max(...ps.map(p=>p.x))-x0),h:Math.max(.01,Math.max(...ps.map(p=>p.y))-y0)};}
function move(page,e,m){const before=world(page,e),par=world(page,e.parentElement);transform(e,par.inverse().multiply(m).multiply(before));}
// Corner controls are in board millimetres. SVG radii are in the rectangle's local axes.
const cornerSelector='rect,path[data-corner-radii]';
function roundedPath(x,y,w,h,horizontal,vertical=horizontal){
  const [a,b,c,d]=horizontal,[A,B,C,D]=vertical,right=x+w,bottom=y+h;
  const arc=(rx,ry,toX,toY)=>rx&&ry?'A '+[rx,ry,0,0,1,toX,toY].join(' '):'L '+toX+' '+toY;
  return ['M',x+a,y,'H',right-b,arc(b,B,right,y+B),'V',bottom-C,arc(c,C,right-c,bottom),
    'H',x+d,arc(d,D,x,bottom-D),'V',y+A,arc(a,A,x+a,y),'Z'].join(' ');
}
function cornerAxes(page,e,ownerMatrix){
  const rect=e.matches(cornerSelector)?e:clipRect(page,e);if(!rect)return null;
  let m=ownerMatrix||world(page,e);
  if(rect!==e){
    const clip=rect.closest('clipPath');if(!clip)return null;
    if(clip.getAttribute('clipPathUnits')==='objectBoundingBox'){
      const box=e.getBBox();m=m.translate(box.x,box.y).scale(box.width,box.height);
    }
    const chain=[];for(let n=rect;n;n=n.parentElement){chain.unshift(n);if(n===clip)break;}
    for(const n of chain){const list=n.transform?.baseVal;for(let i=0;list&&i<list.numberOfItems;i++)m=m.multiply(list.getItem(i).matrix);}
  }
  const sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d);
  if(!sx||!sy)return null;
  if(rect.localName==='path'){
    const local=rect.dataset.cornerRadii.trim().split(/\s+/).map(Number);
    if(local.length!==4||!local.every(n=>Number.isFinite(n)&&n>=0))return null;
    const b=rect.getBBox(),radii=local.map(n=>n*sx);
    return {owner:e,rect,sx,sy,limit:Math.min(b.width*sx,b.height*sy)/2,x:radii[0],y:radii[0],radii};
  }
  const w=rect.width.baseVal.value,h=rect.height.baseVal.value;
  const rx=(rect.hasAttribute('rx')?rect.rx:rect.ry).baseVal.value,ry=(rect.hasAttribute('ry')?rect.ry:rect.rx).baseVal.value;
  return {owner:e,rect,sx,sy,limit:Math.min(w*sx,h*sy)/2,x:Math.min(w/2,rx)*sx,y:Math.min(h/2,ry)*sy};
}
function setCornerRadius(axes,value){
  if(!axes)return;
  const independent=Array.isArray(value),values=independent?value:Array(4).fill(value);
  if(values.length!==4||!values.every(Number.isFinite))return;
  const radii=values.map(n=>Math.min(Math.max(0,n),axes.limit));
  let rect=axes.rect;
  // An imported clipping path can be shared by several independent image frames.
  if(axes.owner!==rect&&!axes.owner.contains(rect)&&axes.owner.hasAttribute('clip-path')){
    const clip=clone(rect.closest('clipPath')),defs=make('defs');
    defs.append(clip);axes.owner.prepend(defs);
    axes.owner.setAttribute('clip-path','url(#'+clip.id+')');axes.owner.dataset.clip=clip.id;
    rect=clip.querySelector(cornerSelector);
  }
  const tag=independent?'path':'rect',converted=rect.localName!==tag;
  const b=independent||converted?rect.getBBox():null;
  if(converted){
    const replacement=make(tag);
    for(const attr of rect.attributes)if(!['d','x','y','width','height','rx','ry','data-corner-radii'].includes(attr.name))
      replacement.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
    rect.replaceWith(replacement);rect=replacement;
  }
  if(independent){
    const xs=radii.map(n=>n/axes.sx),ys=radii.map(n=>n/axes.sy);
    rect.dataset.cornerRadii=xs.join(' ');
    rect.setAttribute('d',roundedPath(b.x,b.y,b.width,b.height,xs,ys));
  }else{
    if(converted)for(const k of ['x','y','width','height'])rect.setAttribute(k,b[k]);
    rect.setAttribute('rx',radii[0]/axes.sx);rect.setAttribute('ry',radii[0]/axes.sy);
  }
  return rect;
}
function circular(axes){return !!axes&&axes.x>0&&Math.abs(axes.x-axes.y)<.00001*Math.max(1,axes.x,axes.y);}
function geom(page,e,b){
  const old=box(page,e),resized=Math.abs(b.w-old.w)+Math.abs(b.h-old.h)>.000001;
  const axes=resized&&(e.matches(cornerSelector)||e.dataset.kind==='mask')?cornerAxes(page,e):null;
  move(page,e,new DOMMatrix().translate(b.x,b.y).scale(b.w/old.w,b.h/old.h).translate(-old.x,-old.y));
  if(axes?.radii)setCornerRadius(cornerAxes(page,e),axes.radii);
  else if(circular(axes))setCornerRadius(cornerAxes(page,e),axes.x);
}
function drawables(root){return [...root.querySelectorAll('[data-vq]')].filter(e=>!e.closest('defs,clipPath,mask,pattern,marker'));}
function color(value){if(!value||value==='none'||value.startsWith('url('))return null;const ctx=color.ctx||=document.createElement('canvas').getContext('2d');ctx.fillStyle='#000000';ctx.fillStyle=value;return /^#[a-f0-9]{6}$/i.test(ctx.fillStyle)?ctx.fillStyle:'#000000';}
function measure(page){mount(page);const vb=page.viewBox.baseVal;
  return drawables(page).reverse().map((e,index,rows)=>{const b=box(page,e),type=e.dataset.kind,style=getComputedStyle(e),ink=color(style.fill),stroke=color(style.stroke),wm=world(page,e),scale=Math.hypot(wm.c,wm.d)||1;const clipped={x:Math.max(0,b.x),y:Math.max(0,b.y)};clipped.w=Math.max(0,Math.min(vb.width,b.x+b.w)-clipped.x);clipped.h=Math.max(0,Math.min(vb.height,b.y+b.h)-clipped.y);
    const corners=(e.matches(cornerSelector)||type==='mask')?cornerAxes(page,e,wm):null;
    const row={id:id(e),uid:e.dataset.vq,type,name:e.dataset.name||names[type],box:b,hit:clipped,layer:e.closest('[data-layer]')?.dataset.layer||'画板对象',locked:false,
      canForward:index>0,canBackward:index<rows.length-1,canImage:['image','mask','rect'].includes(type),canCrop:type==='mask'&&!!e.querySelector('image'),
      canRound:!!corners,cornerRadii:corners?.radii,canFill:['rect','shape'].includes(type),filled:!!ink,fill:ink,
      stroke:{enabled:!!stroke,width:stroke?Math.max(.1,parseFloat(style.strokeWidth)*scale/PT):1,color:stroke},radius:corners?.x||0,circularCorners:circular(corners)};
    if(type==='text'){const t=e.querySelector('tspan')||e,s=getComputedStyle(t);row.text=e.dataset.text??([...e.querySelectorAll('tspan[data-line]')].map(n=>n.textContent).join('\n')||e.textContent);row.name=row.text.slice(0,38)||'空文字';row.pt=+(parseFloat(s.fontSize)*scale/PT).toFixed(3)||12;row.fontSource=VectorFonts.metadata(e);row.font=row.fontSource?.name||s.fontFamily.replace(/["']/g,'').split(',')[0];row.fill=color(s.fill);}
    if(type==='text'){const s=getComputedStyle(e.querySelector('tspan')||e);row.paragraph={...(VectorParagraphs.info(e)||VectorParagraphs.inferred(e)),weight:s.fontWeight,style:s.fontStyle,matrix:[wm.a,wm.b,wm.c,wm.d,wm.e,wm.f]};row.overflow=Number(e.dataset.overflow)||0;}
    row.stroke=VectorStroke.read(e,row.stroke);row.canPlaceStroke=VectorStroke.eligible(e);row.effects=VectorEffects.read(e);if(e.dataset.solidFill)row.fill=color(e.dataset.solidFill);return row;});}
function clone(e){const c=e.cloneNode(true),all=[c,...c.querySelectorAll('*')],ids=new Map();
  for(const n of all){if(n.id){const next='ref'+crypto.randomUUID();ids.set(n.id,next);n.id=next;}if(n.dataset?.vq)n.dataset.vq=String(++serial);}
  for(const n of all)if(n.dataset?.clip&&ids.has(n.dataset.clip))n.dataset.clip=ids.get(n.dataset.clip);
  for(const n of all)for(const a of [...n.attributes]){const v=a.value.replace(/url\(#([^)]*)\)/g,(s,k)=>ids.has(k)?'url(#'+ids.get(k)+')':s);if(v!==a.value)a.value=v;if(a.localName==='href'&&ids.has(v.slice(1))&&v.startsWith('#'))a.value='#'+ids.get(v.slice(1));}return c;}
function classify(root){
  mount(root);
  for(const g of [...root.querySelectorAll('g[clip-path]')].reverse()){
    if(g.hasAttribute('data-psd-clipped')||g.closest('defs,clipPath,mask')||g.querySelector('[data-kind="mask"]'))continue;
    const pictures=g.querySelectorAll('image');
    if(pictures.length!==1||g.querySelector('text,path,rect,circle,ellipse,polygon,line'))continue;
    const match=/^url\(#([^)]+)\)$/.exec(g.getAttribute('clip-path')),clip=match&&root.getElementById(match[1]);
    if(!clip||clip.getAttribute('clipPathUnits')==='objectBoundingBox')continue;
    const child=clip.firstElementChild;if(!child?.getBBox)continue;
    try{const b=child.getBBox(),cm=clip.transform.baseVal.consolidate()?.matrix,sm=child.transform.baseVal.consolidate()?.matrix;
      const t=(cm?new DOMMatrix([cm.a,cm.b,cm.c,cm.d,cm.e,cm.f]):new DOMMatrix()).multiply(sm||new DOMMatrix());
      const r=mapped(t,b.x,b.y,b.width,b.height);if(b.width&&b.height){mark(g,'mask');g.dataset.clip=clip.id;g.dataset.frame=[r.x,r.y,r.w,r.h].join(' ');}
    }catch{}
  }
  for(const e of root.querySelectorAll('path,rect,ellipse,circle,line,polygon,polyline,text,image,use'))if(!e.closest('defs,clipPath,mask,pattern,marker,[data-kind="mask"]')&&!e.dataset.vq)mark(e,e.matches(cornerSelector)?'rect':({text:'text',image:'image'})[e.localName]||'shape',e.getAttribute('aria-label'));return root;}
function scene(page){const copy=page.cloneNode(true);
  for(const e of drawables(copy)){const name='VQNodeL0I'+e.dataset.vq;if(!e.id)e.id=name;
    else if(e.parentElement.hasAttribute('data-psd-base')){
      for(const use of e.closest('[data-psd-clip-stack]').querySelectorAll('use'))if(use.getAttribute('href')==='#'+e.id)use.setAttribute('href','#'+name);
      e.id=name;
    }else {const g=make('g',{id:name});e.replaceWith(g);g.append(e);}}
  return xml(copy);}
function fitPhoto(page,e,b){const s=box(page,e),ratio=Math.max(b.w/s.w,b.h/s.h);geom(page,e,{x:b.x+(b.w-s.w*ratio)/2,y:b.y+(b.h-s.h*ratio)/2,w:s.w*ratio,h:s.h*ratio});}
function clipRect(page,e){return e.dataset.clip?page.getElementById(e.dataset.clip)?.querySelector(cornerSelector):null;}
function frame(page,target,pic,fit){
  const b=box(page,target),prev=world(page,target),photoWorld=world(page,pic),group=mark(make('g'),'mask','图片框'),clip=make('clipPath',{id:'clip'+crypto.randomUUID(),clipPathUnits:'userSpaceOnUse'});
  const oldClip=target.dataset.clip&&page.getElementById(target.dataset.clip);
  if(oldClip){for(const n of oldClip.children)clip.append(n.cloneNode(true));}
  else if(target.matches(cornerSelector)){const outline=target.cloneNode(false);for(const a of [...outline.attributes])if(!['x','y','rx','ry','width','height','d','data-corner-radii'].includes(a.name))outline.removeAttribute(a.name);clip.append(outline);}
  else {const r=target.getBBox();clip.append(make('rect',{x:r.x,y:r.y,width:r.width,height:r.height}));}
  const local=target.dataset.frame||(()=>{const r=target.getBBox();return [r.x,r.y,r.width,r.height].join(' ');})();
  group.dataset.frame=local;group.dataset.clip=clip.id;group.dataset.vq=target.dataset.vq;
  target.before(group);transform(group,world(page,group.parentElement).inverse().multiply(prev));
  const content=make('g',{'clip-path':'url(#'+clip.id+')'}),defs=make('defs');
  defs.append(clip);group.append(defs,content);const image=pic.cloneNode(true);image.removeAttribute('data-vq');image.removeAttribute('id');content.append(image);
  transform(image,world(page,content).inverse().multiply(photoWorld));if(fit)fitPhoto(page,image,b);target.remove();return group;
}
function setText(e,a){
  const target=e.querySelector('tspan')||e,frame=VectorParagraphs.info(e)||VectorParagraphs.inferred(e);
  VectorParagraphs.store(e,frame);
  const s=getComputedStyle(target),m=world(space.firstChild,e);
  const size=a.pt!=null?a.pt*PT/(Math.hypot(m.c,m.d)||1):parseFloat(s.fontSize);
  const source=VectorFonts.metadata(e),requested=a.font||source?.name||s.fontFamily;
  const family=VectorFonts.family(requested,source),weight=s.fontWeight,style=s.fontStyle,fill=s.fill;
  if(source&&requested!==source.name){delete e.dataset.originalFont;delete e.dataset.editFamily;}
  e.setAttribute('fill',fill);
  VectorParagraphs.render(e,a.value,frame,size,family,weight,style);
  e.dataset.text=a.value;
}
function newShape(a){const {x,y,w,h}=a;let e;
  if(a.shape==='ellipse')e=make('ellipse',{cx:x+w/2,cy:y+h/2,rx:w/2,ry:h/2});
  else if(a.shape==='triangle')e=make('polygon',{points:[x+w/2,y,x+w,y+h,x,y+h].join(' ')});
  else if(a.shape==='line')e=make('line',{x1:x,y1:a.reverse?y+h:y,x2:x+w,y2:a.reverse?y:y+h,stroke:'#40376b','stroke-width':2*PT});
  else e=make('rect',{x,y,width:w,height:h,rx:a.shape==='rounded'?Math.min(w,h)*.15:0});
  e.setAttribute('fill',a.shape==='line'?'none':'#8979d9');return mark(e,e.localName==='rect'?'rect':'shape');}
Object.assign(window,{VectorModel:{NS,PT,make,xml,parse,mark,id,find,names,board,mount,sourceHits,world,transform,box,move,geom,roundedPath,cornerAxes,setCornerRadius,drawables,measure,clone,classify,scene,fitPhoto,clipRect,frame,setText,newShape,
  resumeSerial(pages){for(const p of pages)for(const e of drawables(p))serial=Math.max(serial,Number(e.dataset.vq)||0);}}});
})();

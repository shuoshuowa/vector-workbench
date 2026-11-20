(() => {
'use strict';
const M=VectorModel,F=VectorFormats,files=new Map();
const svgCache=new WeakMap();
let original=null,pages=[],idx=0,filename='',rev=0,serial=0,saved=0,stamp=0,preview='',selected=[],items=[],snapshots=[],cursor=0,download='',remapped={};
const current=()=>pages[idx],mapId=k=>remapped[k]||k;
const snapshot=()=>({pages:pages.map(p=>{if(!svgCache.has(p))svgCache.set(p,M.xml(p));return svgCache.get(p);}),idx,filename,stamp});
function restore(s){pages=s.pages.map(M.parse);idx=s.idx;filename=s.filename;stamp=s.stamp;M.resumeSerial(pages);selected=[];}
function history(){snapshots.splice(cursor+1);snapshots.push(snapshot());while(snapshots.length>2&&(snapshots.length>12||snapshots.length*snapshots.at(-1).pages.reduce((n,s)=>n+s.length,0)>100*1024*1024))snapshots.shift();cursor=snapshots.length-1;}
function state(){const root=current();return {app:'vector-browser',psd:true,realtimeBatch:true,cloneBatch:true,layoutBatch:true,historyCache:true,svgScene:true,drawingTools:1,sample:"折序 F/01 · 两页说明书",version:rev,
  document:root?{name:filename,unit:root.dataset.boardUnit||'mm',effects:root.dataset.effects==='1',page:idx,pages:pages.length,width:root.viewBox.baseVal.width,height:root.viewBox.baseVal.height,items:structuredClone(items),selected:selected.length===1?selected[0]:null,selection:selected.slice(),preview,canUndo:cursor>0,canRedo:cursor<snapshots.length-1,edited:stamp!==saved,remapped:{...remapped}}:null};}
function render(){const prev=preview;preview='';if(current()){items=M.measure(current());const svg=M.xml(current());preview=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));}else items=[];
  if(prev)setTimeout(()=>URL.revokeObjectURL(prev),30000);}
let workspaceId=sessionStorage.getItem('vq-browser-project');if(!workspaceId){workspaceId=crypto.randomUUID();sessionStorage.setItem('vq-browser-project',workspaceId);}
const database=new Promise(resolve=>{try{const r=indexedDB.open('vq-browser-workbench',1);r.onupgradeneeded=()=>r.result.createObjectStore('tabs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);}catch{resolve(null);}});
async function persist(){const db=await database;if(!db)return;try{const t=db.transaction('tabs','readwrite'),st=t.objectStore('tabs');if(current())st.put({snap:snapshots[cursor],idx,rev,saved,original},workspaceId);else st.delete(workspaceId);}catch{}}
const ready=(async()=>{const db=await database;if(!db)return;const r=db.transaction('tabs').objectStore('tabs').get(workspaceId);const rec=await new Promise(ok=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>ok(null);});
  if(rec?.snap){restore(rec.snap);for(const p of pages)await VectorFonts.hydrate(p);original=rec.original;idx=rec.idx;rev=rec.rev;serial=stamp;saved=rec.saved;let pending=null;try{pending=JSON.parse(sessionStorage.getItem('vq-layout-draft')||'null');}catch{}
    const touched=new Set((pending?.version===rev?pending.steps:[])?.flat().flatMap(m=>[m.id,m.source])||[]);
    let changed=false;pages.forEach((root,i)=>{if(VectorParagraphs.prepare(root,i===idx?touched:undefined))changed=true;});
    snapshots=[changed?snapshot():rec.snap];if(changed)persist();render();}})();
function shiftUnique(e){const c=M.clone(e);e.after(c);return c;}
function row(k){const e=M.find(current(),mapId(k));if(!e)throw Error('对象已发生变化，请重新选择。');return e;}
function paintTarget(e){if(e.dataset.kind==='mask')return M.clipRect(current(),e)||e;return e;}
async function action(a){
  const p=current(),v=p.viewBox.baseVal;M.mount(p);let e=a.id?row(a.id):null;
  switch(a.kind){
    case 'shape':case 'rectangle':e=M.newShape(a);p.append(e);break;
    case 'addText':e=M.mark(M.make('text',{x:0,y:0,transform:'translate('+v.width*.35+' '+v.height*.45+')','font-size':16*M.PT,'font-family':'sans-serif',fill:'#000000'}),'text');e.textContent='新增文字';p.append(e);VectorParagraphs.store(e,{x:0,y:0,width:40,leading:1.2});break;
    case 'text':M.setText(e,a);break;
    case 'typeStyle':VectorTextStyle.commit(p,e,a.style);break;
    case 'paragraph':VectorParagraphs.store(e,a.frame);M.setText(e,{value:e.dataset.text??e.textContent});break;
    case 'geometry':M.geom(p,e,a);break;
    case 'round':{const t=e.localName==='rect'?e:M.clipRect(p,e);if(t){const m=M.world(p,e);t.setAttribute('rx',Math.min(a.r/Math.hypot(m.a,m.b),t.width.baseVal.value/2,t.height.baseVal.value/2));}break;}
    case 'stroke':{const t=paintTarget(e),m=M.world(p,e);t.style.stroke=a.enabled?(a.color||t.style.stroke||'#242735'):'none';t.style.strokeWidth=(a.width*M.PT/(Math.hypot(m.a,m.b)||1))+'px';break;}
    case 'color':for(const t of [e,...e.querySelectorAll('tspan')])t.style.fill=a.enabled===false?'none':a.color;break;
    case 'duplicate':{e=shiftUnique(e);M.move(p,e,new DOMMatrix().translate(3,3));break;}
    case 'delete':e.remove();return [];
    case 'order':{const nodes=a.ids?.length?a.ids.map(row):[e];VectorStack.reorder(p,nodes,a.direction,a.source?row(a.source):null);return nodes.map(M.id);}
    case 'pageAdd':pages.splice(++idx,0,M.board(v.width,v.height,p.dataset.boardUnit||'mm'));return [];
    case 'pageCopy':pages.splice(++idx,0,M.clone(p));return [];
    case 'pageDelete':if(pages.length<=1)throw Error('至少需要一页');pages.splice(idx,1);idx=Math.min(idx,pages.length-1);return [];
    case 'pageSize':if(validBoardUnit(a.unit)&&a.unit!==(p.dataset.boardUnit||'mm')){p.dataset.boardUnit=a.unit;p.dataset.unitChanged='1';}p.setAttribute('width',a.w+'mm');p.setAttribute('height',a.h+'mm');p.setAttribute('viewBox','0 0 '+a.w+' '+a.h);return [];
    case 'importArtwork':{
      const f=files.get(a.asset);if(!f)throw Error('请重新选取源文件。');
      if(/^image\/(png|jpeg)/.test(f.type))return action({kind:'addPicture',asset:a.asset});
      const roots=await F.open(f),src=roots[(a.sheet||1)-1];if(!src)throw Error('源文件没有该页。');e=M.mark(M.make('g'),'group',f.name);
      const tree=M.clone(src);for(const n of tree.querySelectorAll('[data-vq]'))n.removeAttribute('data-vq');
      e.append(...tree.childNodes);p.append(e);const b=M.box(p,e),s=Math.min(1,v.width*.8/b.w,v.height*.8/b.h);M.geom(p,e,{x:(v.width-b.w*s)/2,y:(v.height-b.h*s)/2,w:b.w*s,h:b.h*s});break;}
    case 'addPicture':case 'picture':{const f=files.get(a.asset);if(!f)throw Error('请重新选取图片');const data=await F.dataURL(f),im=await F.image(data),ratio=Math.min(v.width*.65/im.width,v.height*.65/im.height,25.4/96),w=im.width*ratio,h=im.height*ratio;
      const pic=M.mark(M.make('image',{x:(v.width-w)/2,y:(v.height-h)/2,width:w,height:h,href:data}),'image',f.name);p.append(pic);if(e){e=M.frame(p,e,pic,true);pic.remove();}else e=pic;break;}
    case 'usePhoto':{const src=row(a.source),pic=src.localName==='image'?src:src.querySelector('image');if(!pic)throw Error('请选择一张图片');e=M.frame(p,e,pic,false);break;}
    case 'crop':{const pic=e.querySelector('image');if(!pic)throw Error('这个图片框没有照片。');const b=M.box(p,pic),cx=b.x+b.w/2,cy=b.y+b.h/2;M.move(p,pic,new DOMMatrix().translate(cx+a.dx,cy+a.dy).scale(a.factor).translate(-cx,-cy));break;}
    case 'release':{const pic=e.querySelector('image');if(!pic)throw Error('请选择图片框。');const mat=M.world(p,pic);e.before(pic);M.transform(pic,M.world(p,pic.parentElement).inverse().multiply(mat));M.mark(pic,'image');e.remove();e=pic;break;}
    case 'multi':{const nodes=a.ids.map(row);if(a.operation==='group'){const g=M.mark(M.make('g'),'group');p.append(g);for(const n of nodes){const t=M.world(p,n);g.append(n);M.transform(n,t);n.dataset.member=n.dataset.kind;n.removeAttribute('data-vq');}e=g;}
      else if(a.operation==='move'){for(const n of nodes)M.move(p,n,new DOMMatrix().translate(a.dx,a.dy));return nodes.map(M.id);}
      else throw Error('请选择有效的多选操作。');break;}
    case 'ungroup':{const result=[];for(const n of [...e.children]){const drawable=!['defs','style','title'].includes(n.localName),mat=drawable?M.world(p,n):null;e.before(n);if(drawable){M.transform(n,M.world(p,n.parentElement).inverse().multiply(mat));M.mark(n,n.dataset.member||({text:'text',image:'image',rect:'rect',g:'group'})[n.localName]||'shape');result.push(M.id(n));}}e.remove();return result;}
    case 'duplicateLayer':{const layer=e.closest('[data-layer]')||p;const g=M.make('g',{'data-layer':(layer.dataset.layer||'画板对象')+' 副本'});for(const c of layer.children)g.append(M.clone(c));p.append(g);return M.drawables(g).map(M.id);}
    default:throw Error('浏览器版暂不支持此操作。');
  }return e?[M.id(e)]:[];
}
async function bundledExample(){
  const response=await fetch('/examples/fold-guide.pdf');
  if(!response.ok)throw Error('示例载入失败，请重试。');
  return new File([await response.blob()],'fold-guide.pdf',{type:'application/pdf'});
}
async function request(route,opts={}){
 await ready;const u=new URL(route,location.origin),cmd=u.pathname.slice(5);
 if(cmd==='state')return state();
 if(cmd==='fonts')return F.fonts();
 if(cmd==='upload'){const asset=crypto.randomUUID();files.set(asset,opts.body);return {asset};}
 const a=JSON.parse(opts.body||'{}');if(a.version!==rev)throw Error('画板已更新，请重试。');
 if(cmd==='export'){const result=await F.output(pages,idx,a.format,original);if(download)URL.revokeObjectURL(download);download=URL.createObjectURL(result);if(a.format==='pdf')saved=stamp;
   rev++;persist();const filenameOut=filename.replace(/\.[^.]+$/,'')+'-编辑版'+(a.format==='pdf'?'':'-第'+(idx+1)+'页')+'.'+a.format;return {...state(),download,downloadName:filenameOut};}
 if(cmd==='page'){if(!pages[a.page])throw Error('页面不存在。');idx=a.page;selected=[];}
 else if(cmd==='close'){pages=[];original=null;idx=0;filename='';selected=[];snapshots=[];cursor=0;files.clear();}
 else if(cmd==='open'||cmd==='blank'){const f=cmd==='open'&&a.sample?await bundledExample():files.get(a.asset),next=cmd==='open'?await F.open(f):[M.board(a.w,a.h,validBoardUnit(a.unit)?a.unit:'mm')];if(!next.length)throw Error('文件没有可用画板。');original=f&&/\.(pdf|ai)$/i.test(f.name)&&new TextDecoder().decode(await f.slice(0,1024).arrayBuffer()).includes('%PDF-')?f:null;
    pages=next;pages.forEach((p,i)=>{delete p.dataset.unitChanged;if(original&&!p.rebuildPdfText)p.dataset.sourcePage=i;else delete p.dataset.sourcePage;});idx=0;filename=f?.name||'未命名画板';snapshots=[];cursor=0;stamp=saved=++serial;selected=[];history();files.clear();}
 else if(cmd==='undo'||cmd==='redo'){const pos=cursor+(cmd==='undo'?-1:1);if(!snapshots[pos])throw Error('没有可用记录');cursor=pos;restore(snapshots[pos]);}
 else{const prior=snapshot(),sameSize=a.action?.kind==='pageSize'&&a.action.w===current().viewBox.baseVal.width&&a.action.h===current().viewBox.baseVal.height;remapped={};try{
   if(cmd==='act')selected=await action(a.action);
   else if(cmd==='edits'||cmd==='layout'){for(const c of a.changes||a.moves||[]){if(c.kind==='create'){const [key]=await action(c.action);remapped[c.id]=key;selected=[key];}
     else if(c.kind==='clone'){const src=row(c.source),n=shiftUnique(src);M.move(current(),n,new DOMMatrix().translate(c.dx,c.dy));const key=M.id(n);remapped[c.id]=key;selected=[key];}
     else selected=await action({kind:'geometry',...c});}}
   else throw Error('未知操作。');if(!['pageAdd','pageCopy','pageDelete'].includes(a.action?.kind)){if(!sameSize)delete current().dataset.sourcePage;svgCache.delete(current());}stamp=++serial;history();if(a.action?.asset)files.delete(a.action.asset);
 }catch(err){restore(prior);render();throw err;}}
 if(['open','blank','close'].includes(cmd))VectorFonts.retain(pages);
 rev++;render();persist();return state();
}
window.VectorBrowser={request,scene:()=>M.scene(current()),sourceHits:(...point)=>M.sourceHits(current(),...point)};
})();

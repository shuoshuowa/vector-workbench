'use strict';
const $=id=>document.getElementById(id);
const key=document.querySelector('meta[name="local-workbench"]')?.content||location.hash.slice(1);history.replaceState(null,'',location.pathname);
const names={text:'文字',image:'图片',mask:'图片框',rect:'矩形',shape:'图形',group:'组合'};
const paths={
 brand:'<path d="m5 6 14-2-3 14-5-7-6-5Z"/><path d="m11 11 8-7M4 20l4-4"/><rect x="3" y="4" width="4" height="4" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="16" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>',
 folder:'<path d="M3 8V5h6l2 3h9v3M3 10h19l-3 10H3z"/>',document:'<path d="M6 3h8l4 4v14H6zM13 3v5h5M9 12h6m-6 4h5"/>',
 pages:'<rect x="6" y="3" width="14" height="16" rx="2"/><path d="M3 7v14h13"/>',layers:'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
 undo:'<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',redo:'<path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',sliders:'<path d="M3 7h6m4 0h8M3 17h10m4 0h4"/><circle cx="11" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
 plus:'<path d="M5 12h14m-7-7v14"/>',minus:'<path d="M5 12h14"/>',pointer:'<path d="m5 3 14 9-7 2-3 7z"/>',hand:'<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 5-3 7-7 7-3 0-5-2-6-4l-3-5a1.6 1.6 0 0 1 2.6-1.8L8 13z"/>',
 text:'<path d="M4 8V5h16v3M12 5v15m-4 0h8"/>',rect:'<rect x="4" y="4" width="16" height="16" rx="3"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 3 3 4-6 5 6"/>',mask:'<rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="4 2"/><path d="m6 16 4-5 3 3 3-5 2 4"/>',
 group:'<rect x="3" y="4" width="11" height="11" rx="1"/><path d="M9 15v5h12V9h-7"/>',shape:'<path d="m12 3 9 9-9 9-9-9z"/>',next:'<path d="m9 5 7 7-7 7"/>',up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',down:'<path d="M12 4v16m-6-6 6 6 6-6"/>',left:'<path d="M20 12H4m6-6-6 6 6 6"/>',right:'<path d="M4 12h16m-6-6 6 6-6 6"/>',front:'<path d="M5 4h14m-7 16V8m-5 5 5-5 5 5"/>',back:'<path d="M5 20h14M12 4v12m-5-5 5 5 5-5"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',close:'<path d="m5 5 14 14m0-14L5 19"/>'
};
const svg=k=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[k]||paths.shape)+'</svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));
for(const [id,label] of [['newText','文字'],['newRect','矩形'],['newImage','图片']]){$(id).append(document.createTextNode(label));$(id).classList.add('labeled');}
$('open').setAttribute('aria-label','打开文件');for(const [i,grip] of [...$('selection').children].entries()){grip.dataset.corner=['nw','ne','sw','se'][i];grip.title='拖动调整尺寸，Shift 等比缩放';}
let state={version:0,document:null},selected=null,filter='all',tool='select',zoom=null,px=1,working=false,drag=null,pan=null,photoTarget=null,addingImage=false,fontList=null;
const thumbs=new Map(),expanded=new Set(),points=new Map();let pinch=null,touchNav=false;
const doc=()=>state.document,chosen=()=>doc()?.items.find(o=>o.id===selected);
let groupIds=[],additive=false,snap=true,layerScope='';
let layoutBase=null,layoutSteps=[],layoutRedo=[],layoutTimer=0;
const layerKey=o=>isLocalItem(o.id)?'local:added':o.id.split('/i')[0];
const pickedIds=()=>groupIds.length?groupIds:(selected?[selected]:[]);
function pickedItems(){const ids=new Set(pickedIds());return (doc()?.items||[]).filter(o=>ids.has(o.id));}
function extent(boxes){if(!boxes.length)return null;const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,w:Math.max(...boxes.map(b=>b.x+b.w))-x,h:Math.max(...boxes.map(b=>b.y+b.h))-y};}
function assignSelection(ids){
  const set=new Set(ids),clean=[...set].filter(id=>{let p=id;while(p.includes('/')){p=p.slice(0,p.lastIndexOf('/'));if(set.has(p))return false;}return true;});
  selected=clean.length===1?clean[0]:null;groupIds=clean.length>1?clean:[];
}
const small=()=>matchMedia('(max-width:900px)').matches;
const num=n=>Number(n.toFixed(2));
const boardUnits=Object.freeze({mm:1,cm:10,in:25.4,pt:25.4/72,px:25.4/96});
function boardPreference(key,fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}}
function saveBoardPreference(key,value){try{localStorage.setItem(key,value);return true;}catch{return false;}}
function validBoardUnit(unit){return Object.hasOwn(boardUnits,unit);}
function preferredBoardUnit(){const unit=boardPreference('vq-board-unit','mm');return validBoardUnit(unit)?unit:'mm';}
function currentBoardUnit(){const unit=doc()?.unit;return validBoardUnit(unit)?unit:preferredBoardUnit();}
function boardUnitFactor(unit,ppi){return unit==='px'&&ppi>0?25.4/ppi:boardUnits[unit];}
function formatBoardMeasurement(mm,factor){
  const value=mm/factor;
  // Older projects may have saved the SVG DOM's float32 copy of a dimension.
  // Only simplify its display when that candidate reproduces the identical float.
  if(mm===Math.fround(mm)){
    for(let digits=0;digits<=3;digits++){
      const candidate=Number(value.toFixed(digits));
      if(Math.fround(candidate*factor)===mm)return candidate;
    }
  }
  return Number(value.toFixed(7));
}
function boardDimensionsLabel(d){const unit=currentBoardUnit(),factor=boardUnitFactor(unit,d.ppi);return num(d.width/factor)+' × '+num(d.height/factor)+' '+unit;}
function panel(which=''){
  const old=document.body.dataset.panel,narrow=small(),next=narrow?which:'';
  document.body.dataset.panel=next;$('scrim').hidden=!next;
  $('layersPanel').setAttribute('aria-expanded',String(next==='layers'));$('propsPanel').setAttribute('aria-expanded',String(next==='properties'));
  document.querySelector('.rail').inert=narrow&&next!=='layers';document.querySelector('.properties').inert=narrow&&next!=='properties';
  document.querySelector('.studio').inert=!!next;
  if(narrow&&next!==old){if(next==='layers')$('hideLayers').focus();else if(next==='properties')$('hidePanels').focus();else if(old)$(old==='layers'?'layersPanel':'propsPanel').focus();}
}
function error(msg){$('error').firstElementChild.textContent=msg;$('error').hidden=false;}
async function request(route,options={}){
  const r=await fetch(route,{...options,headers:{'X-Vector-Key':key||'',...options.headers}}),data=await r.json();
  if(!r.ok){const e=Error(data.error||'操作失败');e.status=r.status;throw e;}return data;
}
function resetContext(){clipboard=null;lastTransform=null;clearDrafts();assignSelection([]);additive=false;layerScope='';filter='all';photoTarget=null;drag=pan=pinch=null;points.clear();touchNav=false;zoom=null;expanded.clear();thumbs.clear();$('search').value='';setTool('select');panel();}
async function synchronize(force=false){
  if(working&&!force)return;
  const seen=state.version,s=await request('/api/state');
  if(!force&&(working||seen!==state.version||s.version===seen))return;
  if(s.version!==seen){resetContext();state=s;draw();}
  else if(force){state=s;if(!chosen())selected=null;if(layoutSteps.length)projectDrafts();else draw();}
}
async function run(label,fn,deferBusy=false){
  const inline=deferBusy==='inline';
  if(working)return;const original=selected,version=state.version,pending=edits().length;
  const draft=pending?Object.fromEntries(['content','pt','fontChoices','fill','fillOn','strokeOn','strokeWidth','strokeColor','x','y','w','h','radius','radiusSlider'].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value])):null;
  working=true;$('busyText').textContent=label;$('busy').hidden=deferBusy;if(inline)$('message').textContent=label;const busyTimer=deferBusy&&!inline?setTimeout(()=>{$('busy').hidden=false;},350):0;$('error').hidden=true;
  document.querySelector('main').inert=true;document.querySelector('header').inert=true;
  try{await fn();}catch(e){try{await synchronize(true);}catch{}
    if(draft&&original===selected&&state.version===version){for(const [id,value] of Object.entries(draft)){if($(id).type==='checkbox')$(id).checked=value;else $(id).value=value;}dirtyUI();}
    error(e.status===409?'工作台状态已更新，请重新选择对象后操作。':e.message||String(e));}
  finally{clearTimeout(busyTimer);working=false;$('busy').hidden=true;document.querySelector('main').inert=false;document.querySelector('header').inert=false;}
}
async function api(command,data={}){
  if(layoutSteps.length){
    const mapped=await commitLayout();if(data.action&&mapped){const a=data.action;for(const k of ['id','source'])if(a[k])a[k]=mapped.get(a[k])||a[k];if(a.ids)a.ids=a.ids.map(id=>mapped.get(id)||id);}
  }
  else if(layoutBase)clearDrafts();
  const oldIds=pickedIds(),oldPreview=doc()?.preview,result=await request('/api/'+command,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.version,...data})});
  if(['open','close','blank'].includes(command))resetContext();
  if(command==='page'){zoom=null;expanded.clear();}
  if(['act','undo','redo'].includes(command))thumbs.clear();
  state=result;assignSelection(command==='export'?oldIds:(result.document?.selection||(result.document?.selected?[result.document.selected]:[])));photoTarget=null;
  const a=data.action;
  if(activeScene&&oldPreview===activeScene.key&&command==='act'&&a&&(['geometry','round'].includes(a.kind)||a.kind==='multi'&&['move','left','right','centerX','top','bottom','centerY','spaceX','spaceY'].includes(a.operation))){
    activeScene.key=doc().preview;sceneRequestKey=doc().preview;for(const id of a.ids||[a.id])activeScene.changed.add(id);
  }
  if(command==='act'&&chosen()&&(!matches(chosen())||($('search').value&&!chosen().name.toLocaleLowerCase().includes($('search').value.toLocaleLowerCase())))){layerScope='';filter='all';$('search').value='';}
  reveal(selected);draw();return result;
}
async function upload(f){return (await request('/api/upload?name='+encodeURIComponent(f.name),{method:'POST',body:f})).asset;}
function matches(o){
  if(photoTarget)return o.id!==photoTarget&&(o.type==='image'||o.canCrop);
  if(layerScope&&layerKey(o)!==layerScope)return false;
  return filter==='all'||filter==='image'&&['image','mask'].includes(o.type)||filter==='shape'&&['rect','shape','group'].includes(o.type)||o.type===filter;
}
function reveal(id){if(!id)return;let parent=id;while(parent.includes('/')){parent=parent.slice(0,parent.lastIndexOf('/'));expanded.add(parent);}}
function list(){
  const host=$('objects'),scroll=host.scrollTop,q=$('search').value.trim().toLocaleLowerCase(),d=doc();
  const layers=new Map();for(const o of d?.items||[])layers.set(layerKey(o),o.layer||'图层');
  if(!layers.has(layerScope))layerScope='';$('layerFilter').replaceChildren(new Option('所有图层',''),...Array.from(layers,([id,n])=>new Option(n,id)));$('layerFilter').value=layerScope;$('copyActiveLayer').disabled=!layerScope;
  const all=d?.items||[],items=all.filter(o=>matches(o)&&(!q||(o.name+' '+(o.text||'')).toLocaleLowerCase().includes(q)));
  const nested=!q&&filter==='all'&&!photoTarget,ids=new Set(items.map(o=>o.id)),children=new Map(),root=[];
  for(const o of items){const parent=o.id.slice(0,o.id.lastIndexOf('/'));if(nested&&ids.has(parent)){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(o);}else root.push(o);}
  const frag=document.createDocumentFragment();
  function append(o,depth){
    const row=document.createElement('div'),b=document.createElement('button'),tile=document.createElement('i'),name=document.createElement('span');row.className='tree-row';row.style.setProperty('--indent',Math.min(depth,3)*7+'px');
    const kids=children.get(o.id);
    if(kids){const toggle=document.createElement('button');toggle.className='branch';toggle.innerHTML=svg('next');toggle.setAttribute('aria-expanded',String(expanded.has(o.id)));toggle.setAttribute('aria-label',(expanded.has(o.id)?'折叠':'展开')+o.name);toggle.onclick=()=>{if(expanded.has(o.id))expanded.delete(o.id);else expanded.add(o.id);list();};row.append(toggle);}
    else if(nested){const gap=document.createElement('span');gap.className='branch-gap';row.append(gap);}
    tile.className='tile';tile.innerHTML=svg(o.type);
    if(['image','mask','group'].includes(o.type)&&o.hit.w>0&&o.hit.h>0){const k=24/Math.min(o.hit.w,o.hit.h);tile.innerHTML='';tile.style.backgroundImage='url("'+d.preview+'")';tile.style.backgroundSize=(d.width*k)+'px '+(d.height*k)+'px';tile.style.backgroundPosition=(12-(o.hit.x+o.hit.w/2)*k)+'px '+(12-(o.hit.y+o.hit.h/2)*k)+'px';}
    else if(['shape','rect'].includes(o.type)&&o.fill){tile.innerHTML='';tile.classList.add('ink');tile.style.setProperty('--swatch',o.fill);}
    b.className='object';b.dataset.id=o.id;b.disabled=o.locked;b.title=o.name;b.setAttribute('aria-pressed',String(pickedIds().includes(o.id)));name.textContent=o.name;b.append(tile,name);b.onclick=e=>pick(o,true,state.drawingTools&&(additive||e.shiftKey||e.ctrlKey||e.metaKey));row.append(b);frag.append(row);
    if(kids&&expanded.has(o.id))for(const child of kids)append(child,depth+1);
  }
  for(const o of root)append(o,0);
  $('count').textContent=items.length;host.replaceChildren(frag);host.scrollTop=scroll;
  $('emptyList').hidden=items.length>0;$('emptyList').textContent=!d?'打开文件后显示对象':photoTarget?'没有其他可填入的图片':'没有匹配的对象';
  for(const b of $('filters').children)b.setAttribute('aria-pressed',String(!photoTarget&&b.dataset.filter===filter));
}
function scaleGroupBox(b,from,to){return {x:to.x+(b.x-from.x)*to.w/from.w,y:to.y+(b.y-from.y)*to.h/from.h,w:b.w*to.w/from.w,h:b.h*to.h/from.h};}
function groupMoves(items,from,to){return items.map(o=>({id:o.id,...scaleGroupBox(o.box,from,to)}));}
function selectionBox(box){
  const members=$('memberBoxes');
  if(box&&drag?.group&&!drag.corner&&members.childElementCount===groupIds.length){members.style.transform='translate('+((box.x-drag.hit.x)*px)+'px,'+((box.y-drag.hit.y)*px)+'px)';}
  else{const many=groupIds.length?pickedItems():[],all=extent(many.map(o=>o.box));box??=all;members.style.transform='';
    members.replaceChildren(...many.map(o=>{const el=document.createElement('i'),v=o.hit;boxStyle(el,scaleGroupBox(v,all,box));return el;}));}
  $('selection').hidden=!box;if(!box)return;
  const o=chosen(),whole=o&&['x','y','w','h'].every(k=>Math.abs(o.box[k]-o.hit[k])<.02);
  $('selection').classList.toggle('no-grips',(!whole&&groupIds.length<2)||!!photoTarget||tool==='hand');
  Object.assign($('selection').style,{left:box.x*px+'px',top:box.y*px+'px',width:Math.max(2,box.w*px)+'px',height:Math.max(2,box.h*px)+'px'});
}
function view(){
  scheduleRulers();const d=doc();if(!d){$('surface').style.width=$('surface').style.height='100%';return;}
  const v=$('viewport'),r=v.getBoundingClientRect();px=zoom||Math.max(.05,Math.min((r.width-(innerWidth<610?30:60))/d.width,(r.height-116)/d.height));
  const w=d.width*px,h=d.height*px;$('paper').style.width=w+'px';$('paper').style.height=h+'px';
  $('surface').style.width=zoom?'calc(200% + '+w+'px)':'100%';$('surface').style.height=zoom?'calc(200% + '+h+'px)':'100%';
  $('fit').textContent=Math.round(px*25.4/96*100)+'%';selectionBox(chosen()?.hit);paintDrafts();
}
function setTool(v){tool=v;$('viewport').classList.toggle('cropping',v==='crop');$('cropMode').textContent=v==='crop'?'完成框内编辑':'拖动框内图片';$('cropMode').setAttribute('aria-pressed',String(v==='crop'));$('viewport').classList.toggle('hand',v==='hand');$('viewport').classList.toggle('drawing',v.startsWith('shape:')||v==='marquee');$('selectMode').setAttribute('aria-pressed',String(v==='select'));$('handMode').setAttribute('aria-pressed',String(v==='hand'));$('marqueeMode').setAttribute('aria-pressed',String(v==='marquee'));selectionBox(chosen()?.hit);toolHint();}
function point(x,y){const r=$('paper').getBoundingClientRect();return {x:(x-r.left)/px,y:(y-r.top)/px};}
function setZoom(value,x,y,anchor){
  if(!doc())return;const v=$('viewport'),r=v.getBoundingClientRect();x??=r.left+v.clientWidth/2;y??=r.top+v.clientHeight/2;anchor??=point(x,y);
  zoom=value===null?null:Math.max(.05,Math.min(32,value));view();
  if(zoom){const paper=$('paper').getBoundingClientRect();v.scrollLeft+=paper.left+anchor.x*px-x;v.scrollTop+=paper.top+anchor.y*px-y;}else v.scrollTo(0,0);
}
function pageTabs(){
  const d=doc();$('pageCount').textContent=d?.pages||0;
  $('pages').replaceChildren(...Array.from({length:d?.pages||0},(_,i)=>{
    const b=document.createElement('button'),tile=document.createElement('span');tile.className='page-thumb';b.className='page-tab';b.dataset.page=i;
    if(thumbs.has(i)){const img=new Image();img.src=thumbs.get(i);img.alt='';tile.append(img);}else tile.innerHTML=svg('document');
    if(i===d.page)b.setAttribute('aria-current','page');b.append(tile,document.createTextNode('第 '+(i+1)+' 页'));
    b.onclick=()=>{if(i!==d.page&&allowLeave())run('正在切换画板…',()=>api('page',{page:i}));};return b;
  }));
  const tab=$('pages').querySelector('[aria-current]');if(tab){const r=tab.getBoundingClientRect(),box=$('pages').getBoundingClientRect();if(r.right>box.right)$('pages').scrollLeft+=r.right-box.right;if(r.left<box.left)$('pages').scrollLeft-=box.left-r.left;}
}
$('art').onload=()=>{const d=doc(),img=$('art');if(!d||img.getAttribute('src')!==d.preview)return;const c=document.createElement('canvas'),z=Math.min(1,150/img.naturalWidth,90/img.naturalHeight);c.width=Math.max(1,Math.round(img.naturalWidth*z));c.height=Math.max(1,Math.round(img.naturalHeight*z));c.getContext('2d').drawImage(img,0,0,c.width,c.height);thumbs.set(d.page,c.toDataURL());pageTabs();};
function props(){
  const o=chosen(),d=doc(),many=groupIds.length>1;$('pickHint').hidden=!!o||many;$('props').hidden=!o;
  $('cropMode').hidden=$('cropMode').disabled=!o?.canCrop;if(tool==='crop'&&!o?.canCrop)setTool('select');$('propJump').hidden=!state.drawingTools||!o;
  $('multiPanel').hidden=!many;$('multiTitle').textContent='已选 '+groupIds.length+' 个对象';
  const alignHost=many?$('multiPanel'):$('alignSlot');if($('alignment').parentElement!==alignHost)alignHost.append($('alignment'));$('alignSlot').hidden=!o||!state.drawingTools;
  $('alignment').hidden=!state.drawingTools||(!many&&!o);$('alignTarget').disabled=!many;if(!many)$('alignTarget').value='page';
  if(many&&$('alignTarget').dataset.mode!=='multi')$('alignTarget').value='selection';$('alignTarget').dataset.mode=many?'multi':'one';
  for(const b of document.querySelectorAll('[data-multi^="space"]'))b.disabled=groupIds.length<3;
  $('multiToggle').setAttribute('aria-pressed',String(additive));$('snapToggle').setAttribute('aria-pressed',String(snap));
  toolHint();$('selection').style.borderRadius='';
  if(!o){
    $('miniBoard').hidden=!d;$('miniArt').hidden=!d;if(d)$('miniArt').src=d.preview;
    $('overviewName').textContent=d?'文档概览':'未打开文档';$('hintText').textContent=d?'点选画板上的文字、图片或图形，即可查看属性。':'打开设计稿后，点选对象即可编辑。';
    $('overview').replaceChildren(...(d?[['文件格式',d.name.split('.').pop().toUpperCase()],['画板尺寸',boardDimensionsLabel(d)],['画板数量',String(d.pages)]]:[]).map(([k,v])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;row.append(dt,dd);return row;}));return;
  }
  $('kind').textContent=names[o.type];$('props').dataset.type=o.type;$('typeIcon').innerHTML=svg(o.type);$('itemName').textContent=o.name;
  $('typeBox').hidden=o.type!=='text';$('colorBox').hidden=!o.fill&&!(o.canFill&&state.drawingTools);
  $('fillSwitch').hidden=!o.canFill||!state.drawingTools;$('fillOn').checked=o.canFill?o.filled:true;
  $('layerName').textContent=o.layer||'';$('ungroup').hidden=o.type!=='group';
  if(o.type==='text'){$('content').value=o.text;$('pt').value=o.pt?num(o.pt):'';$('fontName').textContent=o.font||'原稿字体';$('fontChoices').value=o.font||'';}
  $('fill').value=o.fill||'#8979d9';$('hex').textContent=$('fill').value.toUpperCase();
  for(const k of ['x','y','w','h'])$(k).value=o.box[k];
  $('roundBox').hidden=!o.canRound;$('radius').value=o.radius??0;
  const limit=Math.max(0,Math.min(o.box.w,o.box.h)/2);
  $('radiusSlider').max=$('radius').max=String(Math.max(o.radius||0,limit));$('radiusSlider').value=$('radius').value;window.CornerPanel?.update(o);
  $('strokeBox').hidden=!o.stroke||!state.drawingTools;
  if(o.stroke){$('strokeOn').checked=o.stroke.enabled;$('strokeWidth').value=o.stroke.width||1;$('strokeColor').value=o.stroke.color||'#242735';}
  $('maskBox').hidden=!o.canImage&&o.type!=='mask';$('picture').hidden=$('choosePhoto').hidden=!o.canImage;
  $('cropBox').hidden=o.type!=='mask';document.querySelector('.crop-tools').hidden=$('cropBox').querySelector('.subhead').hidden=!o.canCrop;
  $('picture').textContent=o.type==='rect'?'放入图片并创建蒙版':'替换图片';$('choosePhoto').disabled=!doc().items.some(i=>i.id!==o.id&&!i.locked&&(i.type==='image'||i.canCrop));dirtyUI();
  for(const b of document.querySelectorAll('[data-order]'))b.disabled=(['up','front'].includes(b.dataset.order)?o.canForward:o.canBackward)===false;
}
function edits(){
  const o=chosen();if(!o)return [];const out=[];
  if(o.type==='text'){const font=$('fontChoices').value,pt=$('pt').value;
    if($('content').value!==o.text||(font&&font!==o.font)||pt!==String(o.pt?num(o.pt):''))out.push({kind:'text',value:$('content').value,font:font===o.font?'':font,pt:pt===''||o.pt!=null&&Number(pt)===num(o.pt)?null:Number(pt)});}
  const enabled=!o.canFill||!state.drawingTools||$('fillOn').checked;
  if((o.canFill&&state.drawingTools&&enabled!==o.filled)||((o.fill||o.canFill)&&enabled&&$('fill').value.toLowerCase()!==(o.fill||'#8979d9').toLowerCase()))out.push({kind:'color',color:$('fill').value,enabled});
  if(o.stroke&&state.drawingTools){const enabled=$('strokeOn').checked,width=$('strokeWidth').valueAsNumber,c=$('strokeColor').value.toLowerCase(),was=(o.stroke.color||'#242735').toLowerCase();
    if(enabled!==o.stroke.enabled||enabled&&(width!==o.stroke.width||c!==was))out.push({kind:'stroke',enabled,width:enabled?width:(o.stroke.width||1),color:c!==was||!o.stroke.enabled?c:null});}
  const box=Object.fromEntries(['x','y','w','h'].map(k=>[k,$(k).valueAsNumber]));
  if(Object.keys(box).some(k=>box[k]!==o.box[k]))out.push({kind:'geometry',...box});
  if(o.canRound&&$('radius').valueAsNumber!==(o.radius??0))out.push({kind:'round',r:$('radius').valueAsNumber});
  return out;
}
function dirtyUI(){const changes=edits();for(const [id,k] of [['applyText','text'],['paint','color'],['applyGeom','geometry'],['round','round'],['applyStroke','stroke']])$(id).disabled=!changes.some(a=>a.kind===k);$('hex').textContent=$('fill').value.toUpperCase();$('strokeWidth').disabled=$('strokeColor').disabled=!$('strokeOn').checked;}
function allowLeave(){return !edits().length||confirm('属性中有尚未应用的修改。要放弃这些修改吗？');}
function valid(a){
  let bad='';if(a.kind==='geometry'&&(!['x','y','w','h'].every(k=>Number.isFinite(a[k])&&Math.abs(a[k])<=5000)||a.w<.01||a.h<.01))bad='宽高须在 0.01–5000 mm，位置须在 ±5000 mm 范围内。';
  if(a.kind==='round'&&(!Number.isFinite(a.r)||a.r<0||a.r>2500))bad='圆角半径须在 0–2500 mm 之间。';
  if(a.kind==='text'&&a.pt!==null&&(!Number.isFinite(a.pt)||a.pt<.1||a.pt>1296))bad='字号须在 0.1 至 1296 pt 之间。';
  if(a.kind==='stroke'&&(!Number.isFinite(a.width)||a.width<.1||a.width>1000))bad='描边粗细须在 0.1–1000 pt 之间。';
  if(bad)error(bad);return !bad;
}
function applyEdit(kind){
  const pending=edits(),a=pending.find(v=>v.kind===kind);if(!a||!valid(a))return;
  if(state.drawingTools&&['text','color','stroke','round','geometry'].includes(kind)){
    changeLocally([{...a,id:selected}]);return;
  }
  const inputs={text:['content','pt','fontChoices'],color:['fill','fillOn'],geometry:['x','y','w','h'],round:['radius','radiusSlider'],stroke:['strokeOn','strokeWidth','strokeColor']};
  const keep=pending.filter(v=>v.kind!==kind).flatMap(v=>inputs[v.kind].map(id=>[id,$(id).type==='checkbox'?$(id).checked:$(id).value]));
  return run('正在更新画板…',async()=>{await api('act',{action:{...a,id:selected}});if(chosen()){for(const [id,v] of keep){if($(id).type==='checkbox')$(id).checked=v;else $(id).value=v;}dirtyUI();}});
}
function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function pick(o,fromList=false,extend=false){
  if(photoTarget){if(!o){cancelPhoto();return;}const target=photoTarget,frame=doc().items.find(i=>i.id===target);if(!frame||!matches(o))return;
    if(o.type==='image'&&!overlaps(o.box,frame.box)){error('图片与框没有重叠。请先把矩形移到要裁取的位置。');return;}
    photoTarget=null;assignSelection([target]);act('usePhoto',{source:o.id});return;}
  if((selected!==o?.id||extend)&&!allowLeave())return;
  if(o?.id!==selected||extend||groupIds.length){const old=pickedIds();assignSelection(extend&&o?(old.includes(o.id)?old.filter(id=>id!==o.id):[...old,o.id]):(o?[o.id]:[]));reveal(selected);list();props();document.querySelector('.properties').scrollTop=0;
    if(o&&!fromList){const host=$('objects'),row=host.querySelector('[aria-pressed="true"]');if(row){const r=row.getBoundingClientRect(),area=host.getBoundingClientRect();if(r.bottom>area.bottom)host.scrollTop+=r.bottom-area.bottom;else if(r.top<area.top)host.scrollTop-=area.top-r.top;}}}
  selectionBox(chosen()?.hit);if(fromList&&o&&small()&&!extend)panel('properties');
}
function cancelPhoto(){photoTarget=null;list();props();$('message').textContent='已取消选图';}
function draw(){
  const d=doc();$('paper').hidden=!d;$('start').hidden=!!d;$('filename').textContent=d?d.name:'本地工作台';$('modified').hidden=!d?.edited;
  $('format').querySelector('[value=psd]').disabled=!state.psd;$('upgrade').hidden=!!state.psd;document.body.classList.toggle('legacy',!state.drawingTools);document.body.classList.toggle('live-input',!!state.drawingTools);document.querySelector('.create-strip').hidden=!state.drawingTools;$('shapeMenu').disabled=false;
  $('pageAdd').disabled=$('pageCopy').disabled=!d;$('pageDelete').disabled=!d||d.pages<=1;
  $('pageSize').disabled=$('external').disabled=$('multiToggle').disabled=!d;
  $('sample').hidden=!state.sample;$('sample').textContent=state.sample?'打开样稿 · '+state.sample:'';
  for(const id of ['newText','newRect','newImage','export','format','plus','minus','fit'])$(id).disabled=!d;
  $('undo').disabled=!d?.canUndo&&!layoutSteps.length;$('redo').disabled=layoutSteps.length?!layoutRedo.length:(!d?.canRedo&&!layoutRedo.length);$('closeDoc').hidden=!d;$('dock').hidden=!d;
  if(!d){$('art').removeAttribute('src');$('dimensions').textContent='本机处理';$('message').textContent='';$('boardTitle').textContent='画板';$('boardDimensions').textContent='';}
  else{if($('art').getAttribute('src')!==d.preview)$('art').src=d.preview;
    $('boardTitle').textContent='画板 '+String(d.page+1).padStart(2,'0');$('boardDimensions').textContent=boardDimensionsLabel(d);
    $('dimensions').textContent=(d.page+1)+' / '+d.pages+' 页';$('message').textContent=d.edited?'工作副本已修改':'本机工作副本';}
  pageTabs();list();props();view();draftStatus();
}
function act(kind,args={}){
  if(state.drawingTools&&kind==='duplicate'&&selected){copyItems(pickedItems(),3,3);return;}
  if(state.drawingTools&&doc()&&['shape','addText'].includes(kind)){addLocalItem(kind,args);return;}
  if(state.drawingTools&&doc()&&kind==='delete'&&selected){removeLocalItems([selected]);return;}
  if(kind==='crop'&&chosen()?.canCrop){queueLayout([{kind,id:selected,...args}]);return;}
  return run(kind==='usePhoto'?'正在按原位置建立剪切蒙版…':'正在更新画板…',()=>api('act',{action:{kind,id:selected,...args}}),['usePhoto','release'].includes(kind)?'inline':false);
}
async function openFile(f){
  if(!f||working)return;
  if(!/\.(ai|eps|pdf|psd)$/i.test(f.name)){error('请选择 AI、EPS、PDF 或 PSD 文件。');return;}
  if(/\.psd$/i.test(f.name)&&!state.psd){error('请从新版启动器打开 PSD 工作台。');return;}if(!canReplace())return;await run('正在本机打开设计稿…',async()=>api('open',{asset:await upload(f)}));
}
function canReplace(){return (!doc()?.edited&&!edits().length&&!layoutSteps.length)||confirm('当前副本有修改。继续更换文件吗？');}
$('open').onclick=$('browse').onclick=()=>$('designFile').click();$('designFile').onchange=e=>{const f=e.target.files[0];e.target.value='';openFile(f);};
$('sample').onclick=()=>{if(canReplace())run('正在打开说明书样稿…',()=>api('open',{sample:true}));};
$('viewport').ondragover=e=>e.preventDefault();$('viewport').ondrop=e=>{e.preventDefault();openFile(e.dataTransfer.files[0]);};
$('search').oninput=list;$('filters').onclick=e=>{if(!e.target.dataset.filter)return;if(photoTarget)cancelPhoto();filter=e.target.dataset.filter;list();};
$('newRect').onclick=()=>{if(!allowLeave())return;const d=doc();if(state.drawingTools)act('shape',{shape:'rect',x:d.width*.3,y:d.height*.35,w:d.width*.35,h:d.height*.22});else act('rectangle',{x:d.width*.3,y:d.height*.35,w:d.width*.35,h:d.height*.22,r:0,color:'#8979d9'});};
$('newText').onclick=()=>{if(allowLeave())act('addText');};$('newImage').onclick=()=>{if(allowLeave()){addingImage=true;$('imageFile').click();}};$('picture').onclick=()=>{if(allowLeave()){addingImage=false;$('imageFile').click();}};
$('imageFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f){const id=selected,kind=addingImage?'addPicture':'picture';run('正在嵌入图片…',async()=>api('act',{action:{kind,id,asset:await upload(f)}}),'inline');}};
$('choosePhoto').onclick=()=>{
  const frame=chosen();if(!frame||!allowLeave())return;
  const candidates=doc().items.filter(o=>!o.locked&&o.id!==frame.id&&(o.type==='image'||o.canCrop)&&overlaps(o.hit,frame.hit));
  if(candidates.length===1){act('usePhoto',{source:candidates[0].id});return;}
  photoTarget=selected;$('search').value='';setTool('select');list();props();if(small())panel('layers');
};$('cancelPhoto').onclick=cancelPhoto;
for(const [id,k] of [['applyText','text'],['paint','color'],['applyGeom','geometry'],['round','round'],['applyStroke','stroke']])$(id).onclick=()=>applyEdit(k);
$('props').addEventListener('input',dirtyUI);$('props').addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing)return;
  if(e.target===$('content')&&!e.ctrlKey&&!e.metaKey)return;const map={content:'text',pt:'text',fontChoices:'text',x:'geometry',y:'geometry',w:'geometry',h:'geometry',radius:'round'};
  if(map[e.target.id]){e.preventDefault();applyEdit(map[e.target.id]);}});
$('readFonts').onclick=openFonts;
$('closeDoc').onclick=()=>{if((!doc()?.edited&&!edits().length&&!layoutSteps.length)||confirm('关闭当前工作副本？请先导出需要保留的修改。'))run('正在关闭副本…',()=>api('close'));};
document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>{if(allowLeave())act('order',{direction:b.dataset.order});});
document.querySelectorAll('[data-dx],[data-dy],[data-scale]').forEach(b=>{b.title=b.getAttribute('aria-label');b.onclick=()=>{if(allowLeave())act('crop',{factor:Number(b.dataset.scale||1),dx:Number(b.dataset.dx||0),dy:Number(b.dataset.dy||0)});};});
for(const [id,kind] of [['duplicate','duplicate'],['remove','delete'],['release','release']])$(id).onclick=()=>{if(allowLeave())act(kind);};
$('undo').onclick=()=>{if(!allowLeave())return;if(layoutSteps.length){layoutRedo.push(layoutSteps.pop());projectDrafts();return;}run('正在撤销…',()=>api('undo'),'inline');};
$('redo').onclick=()=>{if(!allowLeave())return;if(layoutRedo.length){layoutSteps.push(layoutRedo.pop());projectDrafts();return;}run('正在重做…',()=>api('redo'),'inline');};
$('export').onclick=()=>{const pending=edits();if(!pending.every(valid))return;run('正在导出副本…',async()=>{for(const a of pending)await api('act',{action:{...a,id:selected}});const data=await api('export',{format:$('format').value});const link=document.createElement('a');link.href=data.download;link.download='';document.body.append(link);link.click();link.remove();$('message').textContent='已生成 '+$('format').value.toUpperCase()+' 副本';});};
$('plus').onclick=()=>setZoom(px*1.25);$('minus').onclick=()=>setZoom(px/1.25);$('fit').onclick=()=>setZoom(null);
$('selectMode').onclick=()=>setTool('select');$('handMode').onclick=()=>setTool('hand');
$('viewport').addEventListener('wheel',e=>{if(!doc()||e.shiftKey||!e.deltaY)return;e.preventDefault();if(drag||pan||touchNav)return;const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?$('viewport').clientHeight:1);const factor=Math.exp(Math.max(-.6,Math.min(.6,-delta*(e.ctrlKey?.008:.002))));if(tool==='crop'&&chosen()?.canCrop){act('crop',{factor,dx:0,dy:0});return;}setZoom(px*factor,e.clientX,e.clientY);},{passive:false});
function pair(){const [a,b]=points.values();return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
function startPinch(){const m=pair();pinch={start:px,dist:m.d,anchor:point(m.x,m.y)};if(drag?.marquee)assignSelection(drag.base);drag=pan=null;clearCopyGhost();renderVectorObjects();clearSketch();hideGuides();$('marqueeBox').hidden=true;touchNav=true;list();props();selectionBox(chosen()?.hit);}
const surf=$('surface');
surf.onpointerdown=e=>{
  if(working||!doc()||(e.button!==0&&e.button!==1))return;
  clearTimeout(layoutTimer);
  if(e.pointerType==='touch'){points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size>=2){surf.setPointerCapture(e.pointerId);startPinch();e.preventDefault();return;}}
  if(e.button===1||tool==='hand'){e.preventDefault();setZoom(px,e.clientX,e.clientY);pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:$('viewport').scrollLeft,top:$('viewport').scrollTop};$('viewport').classList.add('panning');surf.setPointerCapture(e.pointerId);return;}
  if(tool==='crop'&&chosen()?.canCrop){const o=chosen(),p=point(e.clientX,e.clientY),h=o.hit;if(p.x>=h.x&&p.y>=h.y&&p.x<=h.x+h.w&&p.y<=h.y+h.h){drag={id:e.pointerId,crop:true,o,x:e.clientX,y:e.clientY};surf.setPointerCapture(e.pointerId);e.preventDefault();return;}setTool('select');}
  if(tool.startsWith('shape:')){if(!e.target.closest('#paper'))return;const start=point(e.clientX,e.clientY);drag={shape:tool.slice(6),start,id:e.pointerId,x:e.clientX,y:e.clientY};surf.setPointerCapture(e.pointerId);e.preventDefault();return;}
  const corner=photoTarget?null:e.target.dataset.corner,pos=point(e.clientX,e.clientY);const o=corner?(chosen()||pickedItems()[0]):doc().items.find(o=>{const h=o.hit;return !o.locked&&matches(o)&&pos.x>=h.x&&pos.x<=h.x+h.w&&pos.y>=h.y&&pos.y<=h.y+h.h;});
  const extend=!!state.drawingTools&&!e.altKey&&(additive||e.ctrlKey||e.metaKey||e.shiftKey),choosing=!!photoTarget;
  if(choosing&&!o)return;
  if(state.drawingTools&&(!o||tool==='marquee')&&!choosing){
    if(!allowLeave())return;const base=extend?pickedIds():[];assignSelection(base);list();props();selectionBox(chosen()?.hit);
    drag={marquee:true,start:pos,base,id:e.pointerId};surf.setPointerCapture(e.pointerId);e.preventDefault();return;
  }
  const toggle=extend&&o&&pickedIds().includes(o.id);
  if(!corner&&!toggle&&(choosing||!o||extend||!groupIds.includes(o.id)))pick(o,false,extend);
  if(choosing||!o||!pickedIds().includes(o.id))return;
  const group=groupIds.length>1,box=group?extent(pickedItems().map(v=>v.box)):o.box,hit=group?box:o.hit;
  const ids=pickedIds();const guides=[{x:0,y:0,w:doc().width,h:doc().height},...doc().items.filter(v=>!ids.some(id=>id===v.id||id.startsWith(v.id+'/')||v.id.startsWith(id+'/'))).map(v=>v.box)];
  drag={id:e.pointerId,o,corner,group,box,hit,guides,toggle,copy:!!e.altKey&&!corner&&!!state.drawingTools,x:e.clientX,y:e.clientY};surf.setPointerCapture(e.pointerId);e.preventDefault();
};
function dragBox(d,e,b){
  const dx=(e.clientX-d.x)/px,dy=(e.clientY-d.y)/px;
  if(!d.corner){
    let mx=dx,my=dy;
    if(e.shiftKey){if(Math.abs(dx)>=Math.abs(dy))my=0;else mx=0;}
    if(state.drawingTools&&snap&&!e.altKey){if(mx||!e.shiftKey)mx=snapped('x',d.box,mx,d.guides);if(my||!e.shiftKey)my=snapped('y',d.box,my,d.guides);}
    return {...b,x:b.x+mx,y:b.y+my};
  }
  const west=d.corner.endsWith('w'),north=d.corner.startsWith('n'),dw=west?-dx:dx,dh=north?-dy:dy;
  let w=Math.min(5000,Math.max(.01,b.w+dw)),h=Math.min(5000,Math.max(.01,b.h+dh));
  if(e.shiftKey){const factor=Math.min(5000/Math.max(b.w,b.h),Math.max(.01/Math.min(b.w,b.h),1+(dw*b.w+dh*b.h)/(b.w*b.w+b.h*b.h)));w=b.w*factor;h=b.h*factor;}
  return {w,h,x:west?b.x+b.w-w:b.x,y:north?b.y+b.h-h:b.y};
}
surf.onpointermove=e=>{
  if(points.has(e.pointerId))points.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(touchNav){if(points.size>=2&&pinch){const m=pair();setZoom(pinch.start*m.d/pinch.dist,m.x,m.y,pinch.anchor);}return;}
  if(pan?.id===e.pointerId){$('viewport').scrollTo(pan.left+pan.x-e.clientX,pan.top+pan.y-e.clientY);return;}
  if(drag?.id===e.pointerId){
    hideGuides();
    if(drag.crop){const o=drag.o,c=o.cropDraft||{scale:1,dx:0,dy:0};renderVectorObjects([{id:o.id,...o.box,cropDraft:{scale:c.scale,dx:c.dx+(e.clientX-drag.x)/px,dy:c.dy+(e.clientY-drag.y)/px}}]);}
    else if(drag.shape)drawShapePreview(drag,e);
    else if(drag.marquee){
      const p=point(e.clientX,e.clientY),start=drag.start,b={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};
      $('marqueeBox').hidden=false;boxStyle($('marqueeBox'),b);
      const inside=doc().items.filter(v=>{const h=v.hit;return !v.locked&&matches(v)&&h.x>=b.x&&h.y>=b.y&&h.x+h.w<=b.x+b.w&&h.y+h.h<=b.y+b.h;});
      assignSelection([...drag.base,...inside.map(v=>v.id)]);selectionBox(chosen()?.hit);
    }else{
      const box=dragBox(drag,e,drag.box);selectionBox({...drag.hit,x:drag.hit.x+box.x-drag.box.x,y:drag.hit.y+box.y-drag.box.y,w:drag.corner?box.w:drag.hit.w,h:drag.corner?box.h:drag.hit.h});
      const moves=drag.group?groupMoves(pickedItems(),drag.box,box):[{id:drag.o.id,...box}];
      if(drag.copy)previewCopies(moves);else renderVectorObjects(moves);
    }
  }
};
function end(e,cancelled=false){
  points.delete(e.pointerId);if(touchNav){if(points.size>=2)startPinch();else pinch=null;if(!points.size)touchNav=false;pan=null;$('viewport').classList.remove('panning');return;}
  if(pan?.id===e.pointerId){pan=null;$('viewport').classList.remove('panning');return;}
  if(drag?.id!==e.pointerId)return;const d=drag;drag=null;clearCopyGhost();selectionBox(chosen()?.hit);
  hideGuides();
  if(d.crop){const dx=(e.clientX-d.x)/px,dy=(e.clientY-d.y)/px;if(!cancelled&&Math.hypot(dx,dy)*px>1)act('crop',{factor:1,dx,dy});else renderVectorObjects();return;}
  if(d.marquee){$('marqueeBox').hidden=true;if(cancelled)assignSelection(d.base);if(tool==='marquee')setTool('select');list();props();selectionBox(chosen()?.hit);return;}
  if(d.shape){clearSketch();if(!cancelled){const box=shapeBox(d,e,Math.hypot(e.clientX-d.x,e.clientY-d.y)<4);setTool('select');act('shape',{shape:d.shape,...box});}return;}
  if(cancelled||!d.o||!pickedIds().includes(d.o.id)){renderVectorObjects();return;}const dx=e.clientX-d.x,dy=e.clientY-d.y;
  if(Math.hypot(dx,dy)>4){const box=dragBox(d,e,d.box);hideGuides();if(valid({kind:'geometry',...box})&&allowLeave()){
    if(d.copy){copyItems(pickedItems(),box.x-d.box.x,box.y-d.box.y);return;}
    lastTransform={copy:false,dx:box.x-d.box.x,dy:box.y-d.box.y};
    const moves=d.group?groupMoves(pickedItems(),d.box,box):[{id:d.o.id,...box}];
    queueLayout(moves);
  }}else if(d.toggle)pick(d.o,false,true);else if(small()&&!additive)panel('properties');
}
surf.onpointerup=e=>end(e);surf.onpointercancel=e=>end(e,true);surf.onlostpointercapture=e=>{if(e.target===surf)end(e,true);};
surf.ondblclick=()=>{if(tool==='select'&&chosen()?.type==='text'){if(small())panel('properties');$('content').focus();$('content').select();}else if(chosen()?.canCrop)setTool(tool==='crop'?'select':'crop');};
$('layersPanel').onclick=()=>panel('layers');$('propsPanel').onclick=()=>panel('properties');$('hideLayers').onclick=$('hidePanels').onclick=$('scrim').onclick=()=>panel();
$('dismiss').onclick=()=>$('error').hidden=true;
document.onkeydown=e=>{if(working||e.isComposing||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){if(drag){const id=drag.id;end({pointerId:id},true);if(surf.hasPointerCapture(id))surf.releasePointerCapture(id);return;}if(tool.startsWith('shape:')||tool==='crop'){drag=null;clearSketch();setTool('select');}else if(!$('shapeOptions').hidden)menu(false);else if(photoTarget)cancelPhoto();else if(document.body.dataset.panel)panel();else if(!e.target.closest('input,textarea,select'))pick(null);return;}
  if(e.target.closest('input,textarea,select,[contenteditable=true]'))return;const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();(e.shiftKey?$('redo'):$('undo')).click();return;}
  if(state.drawingTools&&doc()&&(e.ctrlKey||e.metaKey)&&k==='a'){e.preventDefault();if(allowLeave()){assignSelection(doc().items.filter(o=>!o.locked&&matches(o)).map(o=>o.id));list();props();selectionBox(chosen()?.hit);}return;}
  if(doc()&&state.drawingTools){
    const cmd=e.ctrlKey||e.metaKey,items=pickedItems();
    if(cmd&&k==='c'&&items.length){e.preventDefault();inputUndoKey='';clipboard={page:doc().page,name:doc().name,preview:doc().preview,steps:layoutSteps.slice(),items:structuredClone(items)};$('message').textContent='已复制 '+items.length+' 个对象';return;}
    if(cmd&&k==='v'&&clipboard){e.preventDefault();const sameDraft=clipboard.preview===doc().preview&&clipboard.steps.every((step,i)=>layoutSteps[i]===step);
      const source=sameDraft?clipboard.items:clipboard.items.map(r=>doc().items.find(o=>r.uid?o.uid===r.uid:o.id===r.id)).filter(Boolean);
      if(clipboard.page===doc().page&&clipboard.name===doc().name&&source.length===clipboard.items.length)copyItems(source,e.shiftKey?0:3,e.shiftKey?0:3,sameDraft?clipboard.steps.length:null);else error('请在源对象所在画板重新复制。');return;}
    if(cmd&&k==='d'){e.preventDefault();const t=lastTransform||{copy:true,dx:3,dy:3};if(t.copy)copyItems(items,t.dx,t.dy);else if(items.length)queueLayout(items.map(o=>({id:o.id,...o.box,x:o.box.x+t.dx,y:o.box.y+t.dy})));return;}
    if(cmd&&k==='0'){e.preventDefault();setZoom(null);return;}
    if(!cmd&&!e.altKey){
      if(k===' '){e.preventDefault();if(!e.repeat&&heldTool===null){heldTool=tool;setTool('hand');}return;}
      if(k==='m'||k==='l'){startShape(k==='m'?'rect':'ellipse');return;}
      if(k==='t'){e.preventDefault();if(!e.repeat){act('addText');$('content').focus();$('content').select();}return;}
      if(k.startsWith('arrow')&&items.length){e.preventDefault();const n=mmPt*(e.shiftKey?10:1),dx=k==='arrowleft'?-n:k==='arrowright'?n:0,dy=k==='arrowup'?-n:k==='arrowdown'?n:0;
        if(tool==='crop'&&chosen()?.canCrop)act('crop',{factor:1,dx,dy});else queueLayout(items.map(o=>({id:o.id,...o.box,x:o.box.x+dx,y:o.box.y+dy})));return;}
    }
  }
  if(e.ctrlKey||e.metaKey||e.altKey)return;if(k==='delete'){if(groupIds.length)multiAction('delete');else if(selected)$('remove').click();}if(k==='h')setTool('hand');if(k==='v')setTool('select');
};
function releaseHand(){if(heldTool!==null){const previous=heldTool;heldTool=null;setTool(previous);}}
window.addEventListener('keyup',e=>{if(e.code==='Space')releaseHand();});window.addEventListener('blur',releaseHand);
$('keysHelp').onclick=()=>$('keysDialog').showModal();
window.addEventListener('focus',()=>synchronize().catch(()=>{}));
let activeScene=null,sceneRequestKey='',sceneGeneration=0,sceneRAF=0,liveMoves=[],lastSceneTargets=new Set(),retryScene='',sceneAttempts=0;
const asDOM=m=>new DOMMatrix([m.a,m.b,m.c,m.d,m.e,m.f]);
const sceneFrame=document.createElement('iframe');sceneFrame.id='vectorScene';sceneFrame.title='矢量画板';sceneFrame.tabIndex=-1;
sceneFrame.setAttribute('sandbox','allow-same-origin');$('art').after(sceneFrame);
const sceneDoc=new Promise(resolve=>{sceneFrame.onload=()=>resolve(sceneFrame.contentDocument);
  sceneFrame.srcdoc='<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:white}body>svg{display:block;width:100%;height:100%}</style>';});
function cleanScene(source){
  const xml=new DOMParser().parseFromString(source,'image/svg+xml'),svg=xml.documentElement;
  if(svg.localName!=='svg'||xml.querySelector('parsererror'))throw Error('矢量预览无效');
  svg.querySelectorAll('script,foreignObject,metadata,animate,animateMotion,animateTransform,set,audio,video,iframe,object,embed').forEach(el=>el.remove());
  for(const el of [svg,...svg.querySelectorAll('*')])for(const attr of [...el.attributes]){
    if(/^on/i.test(attr.localName)||attr.localName==='base'||(attr.localName==='href'&&!attr.value.startsWith('#')&&!/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(attr.value.trim())))el.removeAttributeNode(attr);
  }
  return svg;
}
async function ensureVectorScene(){
  const d=doc();if(!d||sceneRequestKey===d.preview)return;
  const gen=++sceneGeneration;sceneRequestKey=d.preview;activeScene=null;lastSceneTargets.clear();$('paper').classList.remove('scene-ready');
  const route=state.svgScene?'/api/scene':location.port==='19735'?'http://127.0.0.1:19736/scene':null;if(!route||!d.items.length)return;
  if(retryScene!==d.preview){retryScene=d.preview;sceneAttempts=0;}sceneAttempts++;
  const rows=new Map((layoutBase||d.items).map(o=>[o.id,{...o,box:{...o.box},stroke:o.stroke&&{...o.stroke},radius:o.radius??0}]));
  try{
    await new Promise(resolve=>setTimeout(resolve,200));if(gen!==sceneGeneration||doc()?.preview!==d.preview)return;
    const resp=await fetch(route+'?id='+encodeURIComponent(d.preview.split('/').pop()),{headers:{'X-Vector-Key':key},cache:'no-store'});
    if(!resp.ok)throw Error('预览未就绪');
    const raw=await resp.text();if(gen!==sceneGeneration||doc()?.preview!==d.preview)return;
    const inner=await sceneDoc,svg=inner.importNode(cleanScene(raw),true);
    if(gen!==sceneGeneration||doc()?.preview!==d.preview)return;
    const fontAliases=inner.createElement('style');fontAliases.textContent=[...new Set([...rows.values()].map(o=>o.font).filter(f=>f&&/^[\p{L}\p{N} _+.-]+$/u.test(f)))].map(f=>'@font-face{font-family:"'+f+'";src:local("'+f+'")}').join('\n');inner.head.querySelector('#fontAliases')?.remove();fontAliases.id='fontAliases';inner.head.append(fontAliases);
    inner.body.replaceChildren(svg);const vb=svg.viewBox.baseVal;
    if(!vb.width||!vb.height||Math.abs(vb.width/vb.height-d.width/d.height)>.025)throw Error('预览尺寸不符');
    const nodes=new Map(),inv=svg.getScreenCTM().inverse();
    for(const el of svg.querySelectorAll('[id^="VQNode"]')){
      const keyName=el.id.slice(6);if(!/^(?:[LI]\d+)+$/.test(keyName)||el.closest('defs,clipPath,mask'))continue;
      const id=keyName.toLowerCase().match(/[li]\d+/g).join('/');if(!rows.has(id))continue;
      const world=el.getScreenCTM(),parent=el.parentElement.getScreenCTM();if(world&&parent){
        const node={el,world:asDOM(inv.multiply(world)),parentWorld:asDOM(inv.multiply(parent)),base:rows.get(id)};
        const originalText=el.localName==='text'?el:el.querySelector('text');
        if(node.base.type==='text'&&originalText?.getNumberOfChars()){const pos=originalText.getStartPositionOfChar(0),tm=originalText.getScreenCTM();
          if(tm)node.textOrigin={x:pos.x,y:pos.y,matrix:asDOM(inv.multiply(tm)),size:parseFloat(inner.defaultView.getComputedStyle(originalText.querySelector('tspan')||originalText).fontSize)||node.base.pt};}
        nodes.set(id,node);
      }
    }
    if(!nodes.size)throw Error('没有可显示的矢量对象');
    activeScene={key:d.preview,svg,nodes,changed:new Set(),sx:vb.width/d.width,sy:vb.height/d.height,x:vb.x,y:vb.y};
    $('paper').classList.add('scene-ready');paintDrafts();draftStatus();
  }catch{if(gen===sceneGeneration){activeScene=null;$('paper').classList.remove('scene-ready');
    if(sceneAttempts<3)setTimeout(()=>{if(gen===sceneGeneration&&doc()?.preview===d.preview&&!activeScene){sceneRequestKey='';ensureVectorScene();}},1500*sceneAttempts);
  }}
}
function setSceneCorners(node,r,box){
  if(typeof VectorModel!=='undefined'&&(Array.isArray(r)||node.independentPreview||node.base.cornerRadii)){
    const selector=node.base.type==='mask'?'[data-clip]':'rect,path[data-corner-radii]';
    const owner=node.el.matches(selector)?node.el:node.el.querySelector(selector);
    const axes=owner&&VectorModel.cornerAxes(activeScene.svg,owner);
    if(axes){
      const next=VectorModel.setCornerRadius(axes,r);
      if(node.el===axes.rect)node.el=next;
      node.independentPreview=Array.isArray(r);node.corner=null;return;
    }
  }
  if(!node.corner){
    let el=node.el;
    if(node.base.type==='mask'){const use=el.querySelector('clipPath use');el=use&&el.ownerDocument.getElementById((use.getAttribute('href')||use.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').slice(1));}
    if(!el&&node.base.type==='mask'){
      const owner=node.el.matches('[data-clip]')?node.el:node.el.querySelector('[data-clip]');
      if(owner)el=owner.ownerDocument.getElementById(owner.dataset.clip)?.querySelector('rect');
    }
    if(el?.localName==='g'&&node.base.type==='rect')el=el.querySelector('rect');
    if(!el||!['rect','path'].includes(el.localName))return;
    const b=el.getBBox();if(!b.width||!b.height)return;
    node.corner={el,b,path:el.getAttribute('d'),rx:el.getAttribute('rx'),ry:el.getAttribute('ry')};
  }
  const {el,b,path,rx,ry}=node.corner;
  const resized=Math.abs(box.w-node.base.box.w)+Math.abs(box.h-node.base.box.h)>.000001;
  if(r===node.base.radius&&!(resized&&node.base.circularCorners)){
    for(const [k,v] of [['d',path],['rx',rx],['ry',ry]])if(v===null)el.removeAttribute(k);else el.setAttribute(k,v);
    return;
  }
  if(el.localName==='rect'&&typeof VectorModel!=='undefined'){
    const owner=node.base.type==='mask'?(node.el.matches('[data-clip]')?node.el:node.el.querySelector('[data-clip]')):el;
    if(owner){
      const axes=VectorModel.cornerAxes(activeScene.svg,owner);
      if(axes){node.corner.el=VectorModel.setCornerRadius(axes,r);return;}
    }
  }
  const w=b.width,h=b.height,x=b.x,y=b.y,X=x+w,Y=y+h,radius=Math.max(0,Math.min(r,box.w/2,box.h/2)),R=radius/box.w*w,S=radius/box.h*h;
  if(el.localName==='rect'){el.setAttribute('rx',R);el.setAttribute('ry',S);}
  else{const arc=' A '+R+' '+S+' 0 0 1 ';el.setAttribute('d','M '+(x+R)+' '+y+' H '+(X-R)+arc+X+' '+(y+S)+' V '+(Y-S)+arc+(X-R)+' '+Y+' H '+(x+R)+arc+x+' '+(Y-S)+' V '+(y+S)+arc+(x+R)+' '+y+' Z');}
}
function renderVectorObjects(moves=[]){
  drawLocalOverlay(moves);
  const live=activeScene&&activeScene.key===doc()?.preview;
  const fallback=moves.filter(o=>!isLocalItem(o.id)&&(!live||!activeScene.nodes.has(o.id)));let overlay=$('transientPixels');
  if(!fallback.length)overlay?.remove();
  else if(doc()){
    if(!overlay){overlay=document.createElement('div');overlay.id='transientPixels';$('draftOverlay').after(overlay);}
    const source=layoutBase||doc().items;
    for(let i=0;i<fallback.length;i++){
      const move=fallback[i],b=source.find(o=>o.id===move.id)?.hit;if(!b||!b.w||!b.h)continue;
      let tile=overlay.children[i];if(!tile){tile=document.createElement('i');overlay.append(tile);}
      boxStyle(tile,move);const x=px*move.w/b.w,y=px*move.h/b.h;tile.style.backgroundImage='url("'+doc().preview+'")';tile.style.backgroundSize=doc().width*x+'px '+doc().height*y+'px';tile.style.backgroundPosition=-b.x*x+'px '+(-b.y*y)+'px';
    }
    while(overlay.children.length>fallback.length)overlay.lastChild.remove();
  }
  if(!live)return;
  liveMoves=moves;if(sceneRAF)return;
  sceneRAF=requestAnimationFrame(()=>{
    sceneRAF=0;const scene=activeScene,d=doc();if(!scene||scene.key!==d?.preview)return;
    const requested=new Map(liveMoves.map(m=>[m.id,m])),dirty=new Set([...scene.changed,...copyGhost.map(c=>c.id),...layoutSteps.flat().map(v=>v.id),...requested.keys()]);
    const ids=[...new Set([...dirty,...lastSceneTargets])].sort((a,b)=>a.length-b.length);lastSceneTargets=dirty;if(!ids.length)return;
    if(scene.itemsRef!==d.items){scene.itemsRef=d.items;scene.byId=new Map(d.items.map(o=>[o.id,o]));}
    const byId=scene.byId,deltas=new Map();
    for(const id of ids){const node=scene.nodes.get(id),o=byId.get(id)||copyGhost.find(c=>c.id===id)?.item;if(!node)continue;
      if(!o){if(!node.hiddenByDraft){node.deletedDisplay=node.el.style.display;node.el.style.display='none';node.hiddenByDraft=true;}if(node.textProxy)node.textProxy.style.display='none';if(node.imageEdge)node.imageEdge.style.display='none';continue;}
      if(node.hiddenByDraft){node.hiddenByDraft=false;node.el.style.display=node.deletedDisplay||'';if(node.textProxy)node.textProxy.style.display='';if(node.imageEdge)node.imageEdge.style.display='';}
      const b=node.base.box;let to=requested.get(id)||o.box;if(b.w<=0||b.h<=0)continue;
      if(!requested.has(id))for(const [parent,r] of requested)if(id.startsWith(parent+'/')){const v=byId.get(parent).box;to={x:r.x+(to.x-v.x)*r.w/v.w,y:r.y+(to.y-v.y)*r.h/v.h,w:to.w*r.w/v.w,h:to.h*r.h/v.h};break;}
      const x=scene.x+b.x*scene.sx,y=scene.y+b.y*scene.sy,X=scene.x+to.x*scene.sx,Y=scene.y+to.y*scene.sy;
      const matrix=new DOMMatrix().translate(X,Y).scale(to.w/b.w,to.h/b.h).translate(-x,-y);
      let parent=node.parentWorld,ancestor=id;while(ancestor.includes('/')){ancestor=ancestor.slice(0,ancestor.lastIndexOf('/'));if(deltas.has(ancestor)){parent=deltas.get(ancestor).multiply(parent);break;}}deltas.set(id,matrix);
      const m=parent.inverse().multiply(matrix).multiply(node.world);
      node.el.setAttribute('transform','matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')');
      if(o.canRound&&(o.cornerRadii||node.independentPreview||node.base.cornerRadii||node.corner||to.r!==undefined||o.radius!==node.base.radius||node.base.circularCorners&&(to.w!==b.w||to.h!==b.h)))setSceneCorners(node,o.cornerRadii??to.r??o.radius??0,to);
      if(o.canCrop&&(node.cropImage||to.cropDraft||o.cropDraft)){paintCrop(scene,node,to.cropDraft||o.cropDraft);if(node.cropImage)cropOverlay.querySelector('[data-id="'+CSS.escape(id)+'"]')?.remove();}
      paintLocalAppearance(scene,node,o,to);
    }
  });
}
const shapeNames={rect:'矩形',rounded:'圆角矩形',ellipse:'椭圆',triangle:'三角形',line:'直线'};
const svgNS='http://www.w3.org/2000/svg',mmPt=25.4/72;
const localOverlay=document.createElementNS(svgNS,'svg');localOverlay.id='localObjects';sceneFrame.after(localOverlay);
const cropOverlay=document.createElement('div');cropOverlay.id='cropPreview';localOverlay.before(cropOverlay);
const fallbackTextOverlay=document.createElementNS(svgNS,'svg');fallbackTextOverlay.id='typingPreview';localOverlay.before(fallbackTextOverlay);
let sampledPreview='',sampleCanvas=null;
function samplePaper(box,d){
  const img=$('art');if(!img.naturalWidth||img.getAttribute('src')!==d.preview)return '#fff';
  if(sampledPreview!==d.preview){const c=document.createElement('canvas');c.width=Math.min(720,img.naturalWidth);c.height=Math.max(1,Math.round(c.width*img.naturalHeight/img.naturalWidth));sampleCanvas=c.getContext('2d',{willReadFrequently:true});sampleCanvas.drawImage(img,0,0,c.width,c.height);sampledPreview=d.preview;}
  const c=sampleCanvas.canvas,colors=[];
  for(const [x,y] of [[box.x-.2,box.y],[box.x,box.y-.2],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w*.6,box.y-.25]]){
    const b=sampleCanvas.getImageData(Math.max(0,Math.min(c.width-1,Math.floor(x*c.width/d.width))),Math.max(0,Math.min(c.height-1,Math.floor(y*c.height/d.height))),1,1).data;colors.push([b[0],b[1],b[2]]);
  }
  colors.sort((a,b)=>a[0]+a[1]+a[2]-b[0]-b[1]-b[2]);return 'rgb('+colors[2].join(',')+')';
}
function rasterTextChanged(o,base){return o?.type==='text'&&base&&(o.text!==base.text||o.font!==base.font||o.pt!==base.pt||o.fill!==base.fill||o.stroke?.width!==base.stroke?.width||o.stroke?.enabled!==base.stroke?.enabled||o.stroke?.color!==base.stroke?.color);}
function drawFallbackText(d,at){
  const host=fallbackTextOverlay;if(!layoutBase||!d){if(host.firstChild)host.replaceChildren();return;}
  const base=new Map(layoutBase.map(o=>[o.id,o])),keys=new Set(),old=new Map([...host.children].map(el=>[el.dataset.id,el]));host.setAttribute('viewBox','0 0 '+d.width+' '+d.height);
  for(const o of d.items){if(isLocalItem(o.id)||activeScene?.nodes.has(o.id)||!rasterTextChanged(o,base.get(o.id)))continue;keys.add(o.id);
    let el=old.get(o.id);const b=at.get(o.id)||o.box,original=base.get(o.id).box;
    if(!el){el=document.createElementNS(svgNS,'g');el.dataset.id=o.id;const cover=document.createElementNS(svgNS,'rect'),line=document.createElementNS(svgNS,'text');
      for(const [k,v] of Object.entries({x:original.x-.2,y:original.y-.2,width:original.w+.4,height:original.h+.4,fill:samplePaper(original,d)}))cover.setAttribute(k,v);
      el.append(cover,line);host.append(el);}
    const signature=JSON.stringify([b,o.text,o.font,o.pt,o.fill,o.stroke]);if(signature===el._signature)continue;el._signature=signature;
    const size=(o.pt||12)*mmPt,line=el.lastChild;localText(line,o,b,size,b.x,b.y+size*.88);line.setAttribute('stroke',o.stroke?.enabled?o.stroke.color||'#242735':'none');line.setAttribute('stroke-width',(o.stroke?.width||1)*mmPt);
  }
  for(const [id,el] of old)if(!keys.has(id))el.remove();
}
const textMeasure=document.createElement('canvas').getContext('2d');
let inputUndoKey='',draftPersistTimer=0;
let copyGhost=[],lastTransform=null,clipboard=null,heldTool=null;
function copyModels(items,dx,dy){
  return items.filter(o=>!o.locked).map(o=>{
    const id='local:'+crypto.randomUUID(),item=structuredClone(o);
    delete item.uid;if(item.paragraph){item.paragraph.matrix[4]+=dx;item.paragraph.matrix[5]+=dy;}Object.assign(item,{id,cloneOf:o.cloneOf||o.id,cloneBox:o.cloneBox||{...o.box}});
    for(const b of [item.box,item.hit]){b.x+=dx;b.y+=dy;}
    return {kind:'clone',id,source:o.id,dx,dy,item};
  });
}
function copyItems(items,dx,dy,captureAfter=null){
  if(!items.length)return;
  if(!layoutBase)layoutBase=structuredClone(doc().items);
  const copies=copyModels(items,dx,dy);
  if(captureAfter!==null)for(const c of copies)c.captureAfter=captureAfter;
  layoutSteps.push(copies);layoutRedo=[];inputUndoKey='';lastTransform={copy:true,dx,dy};
  assignSelection(copies.map(c=>c.id));projectDrafts();
}
function previewCopies(moves){
  if(!copyGhost.length)copyGhost=copyModels(pickedItems(),0,0);
  for(const c of copyGhost){const m=moves.find(m=>m.id===c.source);if(m)c.item.box={...m};}
  renderVectorObjects();
}
function clearCopyGhost(){if(copyGhost.length){copyGhost=[];renderVectorObjects();}}
function attachVectorCopies(scene,items){
  if(!scene)return;
  for(const o of items){
    if(!o.cloneOf||o.localShape||scene.nodes.has(o.id))continue;
    const source=scene.nodes.get(o.cloneOf);if(!source)continue;
    const el=source.el.cloneNode(true),nodes=[el,...el.querySelectorAll('*')],names=new Map();
    for(const n of nodes)if(n.id){names.set(n.id,'vq'+o.id.slice(6)+'-'+n.id);n.id=names.get(n.id);}
    for(const n of nodes)for(const attr of [...n.attributes]){
      const value=attr.value.replace(/url\(#([^)]+)\)/g,(full,id)=>names.has(id)?'url(#'+names.get(id)+')':full);
      if(value!==attr.value)attr.value=value;
      if(attr.localName==='href'&&value[0]==='#'&&names.has(value.slice(1)))attr.value='#'+names.get(value.slice(1));
    }
    if(source.cropImage){
      const pos=[source.el,...source.el.querySelectorAll('*')].indexOf(source.cropImage.el),m=source.cropImage.matrix;
      if(pos>=0)nodes[pos].setAttribute('transform','matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')');
    }
    el.style.display='';source.el.after(el);
    scene.nodes.set(o.id,{el,base:source.base,world:source.world,parentWorld:source.parentWorld,textOrigin:source.textOrigin,copy:true});
  }
  const wanted=new Set(items.map(o=>o.id));
  for(const [id,n] of scene.nodes)if(n.copy&&!wanted.has(id)){n.el.remove();n.textProxy?.remove();n.imageEdge?.remove();scene.nodes.delete(id);}
}
function isLocalItem(id){return typeof id==='string'&&id.startsWith('local:');}
function addLocalItem(kind,args){
  const d=doc(),id='local:'+crypto.randomUUID(),text=kind==='addText',shape=args.shape||'rect';
  const box=text?{x:d.width*.35,y:d.height*.45-5.6,w:22.6,h:6.7}:{x:args.x,y:args.y,w:args.w,h:args.h};
  const type=text?'text':['rect','rounded'].includes(shape)?'rect':'shape';
  const item={id,type,name:text?'新增文字':shapeNames[shape],box:{...box},hit:{...box},locked:false,layer:'快改 · 新增元素',
    localShape:shape,reverse:!!args.reverse,canCrop:false,canImage:type==='rect',canRound:type==='rect',canFill:!text,
    filled:text||shape!=='line',fill:text?'#000000':'#8979d9',radius:shape==='rounded'?Math.min(box.w,box.h)*.15:0,
    stroke:{enabled:!text&&shape==='line',width:shape==='line'?2:1,color:'#40376b'}};
  if(text)Object.assign(item,{text:'新增文字',pt:16,font:'MicrosoftYaHei'});
  if(text&&typeof VectorParagraphs!=='undefined'){item.paragraph={width:40,height:0,x:0,y:0,leading:1.2,advance:0,spacing:0,weight:'400',style:'normal',matrix:[1,0,0,1,d.width*.35,d.height*.45]};VectorParagraphs.update(item);}
  if(!layoutBase)layoutBase=structuredClone(d.items);
  layoutSteps.push([{kind:'create',id,item,action:text?{kind:'addText'}:{kind:'shape',...args}}]);
  layoutRedo=[];inputUndoKey='';assignSelection([id]);filter='all';layerScope='';$('search').value='';projectDrafts();
  if(small())panel('properties');
}
function removeLocalItems(ids){
  if(!layoutBase)layoutBase=structuredClone(doc().items);
  layoutSteps.push(ids.map(id=>({kind:'delete',id})));layoutRedo=[];inputUndoKey='';assignSelection([]);projectDrafts();
}
function applyLocalProperty(o,m){
  if(m.kind==='paragraph'&&o.paragraph){Object.assign(o.paragraph,m.frame);VectorParagraphs.update(o);return true;}
  if(m.kind==='crop'){const c=o.cropDraft||{scale:1,dx:0,dy:0};o.cropDraft={scale:c.scale*m.factor,dx:c.dx+m.dx,dy:c.dy+m.dy};return true;}
  if(m.kind==='round'){o.cornerRadii=m.radii?.slice();o.radius=o.cornerRadii?.[0]??m.r;return true;}
  if(m.kind==='color'){o.filled=m.enabled!==false;o.fill=m.color;return true;}
  if(m.kind==='stroke'){o.stroke={enabled:m.enabled,width:m.width,color:m.color||o.stroke?.color||'#242735'};return true;}
  if(m.kind==='text'){
    if(!o.previewTextBase)o.previewTextBase={text:o.text,pt:o.pt||12,box:{...o.box},font:o.font};
    o.text=m.value;o.name=o.text.slice(0,38)||'空文字';if(m.pt!=null)o.pt=m.pt;if(m.font)o.font=m.font;
    if(o.paragraph){VectorParagraphs.update(o);return true;}
    if(o.localShape){const lines=o.text.split('\n'),size=(o.pt||12)*mmPt;
      textMeasure.font='100px '+browserFont(o.font);o.box={...o.box,w:(o.textScaleX||1)*Math.max(size*.4,...lines.map(l=>textMeasure.measureText(l).width*size/100)),h:(o.textScaleY||1)*size*(1.2*lines.length)};o.hit={...o.box};}
    return true;
  }
  return false;
}
function browserFont(font){
  const family=fontList?.find(f=>f.id===font)?.family;
  const candidates=[font,family,/YaHei/i.test(font||'')?'Microsoft YaHei':null,font?.replace(/[_-]/g,' '),'Microsoft YaHei'].filter(Boolean);
  return candidates.map(s=>'"'+s.replace(/["\\\r\n]/g,'')+'"').join(',')+',sans-serif';
}
function localText(el,o,box,size,baseX,baseline){
  el.setAttribute('fill',o.fill||'#242735');el.setAttribute('font-size',size);el.style.fontFamily=browserFont(o.font);
  if(o.paragraph&&typeof VectorParagraphs!=='undefined'){
    if(el.ownerDocument!==document){VectorParagraphs.paint(el,o);return;}
    const p=o.paragraph,ratio=size/VectorParagraphs.fontSize(o);VectorParagraphs.render(el,o.text,{...p,x:baseX,y:baseline,width:p.width*ratio,height:p.height*ratio,spacing:p.spacing*ratio,advance:p.advance*ratio},size,o.font,p.weight,p.style);return;
  }
  const style=fontList?.find(f=>f.id===o.font)?.style||o.font||'';
  el.setAttribute('font-weight',/bold|粗体|heavy|black/i.test(style)?'700':'400');el.setAttribute('font-style',/italic|斜体/i.test(style)?'italic':'normal');
  el.setAttribute('xml:space','preserve');const raw=o.text.split('\n');let lines=raw;
  if(!o.localShape&&o.previewTextBase?.text.includes('\n')){
    textMeasure.font='100px '+browserFont(o.font);lines=[];
    for(const line of raw){let current='';for(const ch of line){if(current&&textMeasure.measureText(current+ch).width*size/100>box.w){lines.push(current);current='';}current+=ch;}lines.push(current);}
  }
  el.replaceChildren(...lines.map((s,i)=>{const span=el.ownerDocument.createElementNS(svgNS,'tspan');span.setAttribute('x',baseX);span.setAttribute('y',baseline+i*size*1.2);span.textContent=s;return span;}));
}
function previewRasterCrop(d,moves){
  const current=new Map(moves.map(m=>[m.id,m])),layers=new Map([...cropOverlay.children].map(el=>[el.dataset.id,el]));
  for(const o of d.items){
    const m=current.get(o.id),c=m?.cropDraft||o.cropDraft;
    if(!c||activeScene?.nodes.get(o.id)?.cropImage)continue;
    const source=(layoutBase||d.items).find(row=>row.id===o.id)?.box;if(!source||!source.w||!source.h)continue;
    let el=layers.get(o.id);
    if(!el){el=document.createElement('div');el.dataset.id=o.id;el.append(document.createElement('div'));cropOverlay.append(el);}
    layers.delete(o.id);const box=o.box,photo=el.firstChild;boxStyle(el,box);el.style.borderRadius=(o.cornerRadii||[o.radius||0]).map(r=>r*px+'px').join(' ');el.style.backgroundColor=samplePaper(box,d);
    Object.assign(photo.style,{width:'100%',height:'100%',backgroundImage:'url("'+d.preview+'")',backgroundPosition:(-source.x*px*box.w/source.w)+'px '+(-source.y*px*box.h/source.h)+'px',
      backgroundSize:(d.width*px*box.w/source.w)+'px '+(d.height*px*box.h/source.h)+'px',transform:'translate('+c.dx*px+'px,'+c.dy*px+'px) scale('+c.scale+')'});
  }
  for(const el of layers.values())el.remove();
}
function drawLocalOverlay(moves=[]){
  const d=doc();if(!d){localOverlay.replaceChildren();cropOverlay.replaceChildren();return;}previewRasterCrop(d,moves);
  const copies=[...d.items.filter(o=>isLocalItem(o.id)),...copyGhost.map(c=>c.item)];
  attachVectorCopies(activeScene,copies);
  const local=copies.filter(o=>!activeScene?.nodes.has(o.id)),at=new Map(moves.map(m=>[m.id,m]));drawFallbackText(d,at);
  if(!local.length){if(localOverlay.firstChild)localOverlay.replaceChildren();return;}
  localOverlay.setAttribute('viewBox','0 0 '+d.width+' '+d.height);
  const keep=new Set(),children=new Map([...localOverlay.children].map(n=>[n.dataset.id,n]));
  for(const o of local.reverse()){
    const b=at.get(o.id)||o.box,shape=o.localShape,tag=o.cloneOf&&!o.localShape&&!['rect','text'].includes(o.type)?'svg':o.type==='text'?'text':o.cornerRadii&&o.type==='rect'?'path':({ellipse:'ellipse',triangle:'polygon',line:'line'})[shape]||'rect';
    let el=children.get(o.id);if(el&&el.localName!==tag){el.remove();el=null;}if(!el){el=document.createElementNS(svgNS,tag);el.dataset.id=o.id;localOverlay.append(el);}keep.add(o.id);
    const signature=JSON.stringify([b,o.text,o.font,o.pt,o.radius,o.fill,o.filled,o.stroke,o.paragraph])+JSON.stringify(o.cornerRadii||null);if(el._signature===signature)continue;el._signature=signature;
    let attrs={};if(tag==='svg'){
      const src=o.cloneBox;el.setAttribute('viewBox',[src.x,src.y,src.w,src.h].join(' '));el.setAttribute('preserveAspectRatio','none');
      if(!el.firstChild){const image=document.createElementNS(svgNS,'image');image.setAttribute('href',d.preview);image.setAttribute('width',d.width);image.setAttribute('height',d.height);el.append(image);}
      attrs={x:b.x,y:b.y,width:b.w,height:b.h};
    }else if(tag==='text'&&o.paragraph){VectorParagraphs.paint(el,o);el.setAttribute('transform',VectorParagraphs.previewMatrix(o,b).toString());}
    else if(tag==='text'){const size=(o.pt||16)*mmPt;localText(el,o,b,size,0,size*.9);el.setAttribute('transform','translate('+b.x+' '+b.y+') scale('+((o.textScaleX||1)*b.w/o.box.w)+' '+((o.textScaleY||1)*b.h/o.box.h)+')');}
    else if(tag==='path'){const radii=o.cornerRadii.map(r=>Math.min(b.w/2,b.h/2,r));attrs={d:VectorModel.roundedPath(b.x,b.y,b.w,b.h,radii)};}
    else if(tag==='rect')attrs={x:b.x,y:b.y,width:b.w,height:b.h,rx:Math.min(b.w/2,b.h/2,b.r??o.radius??0)};
    else if(tag==='ellipse')attrs={cx:b.x+b.w/2,cy:b.y+b.h/2,rx:b.w/2,ry:b.h/2};
    else if(tag==='line')attrs={x1:b.x,y1:o.reverse?b.y+b.h:b.y,x2:b.x+b.w,y2:o.reverse?b.y:b.y+b.h};
    else attrs={points:[b.x+b.w/2,b.y,b.x+b.w,b.y+b.h,b.x,b.y+b.h].join(' ')};
    for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);
    el.setAttribute('fill',o.filled===false||tag==='line'?'none':o.fill||'#242735');
    el.setAttribute('stroke',o.stroke?.enabled?o.stroke.color||'#242735':'none');el.setAttribute('stroke-width',(o.stroke?.width||1)*mmPt);
  }
  for(const el of children.values())if(!keep.has(el.dataset.id))el.remove();
}
function paintLocalAppearance(scene,node,o,box){
  const base=node.base,needsText=o.type==='text'&&(o.paragraphDirty||o.text!==base.text||(!o.paragraph&&o.pt!==base.pt)||o.font!==base.font);
  // Keep the untouched original artwork until a text edit actually needs live text.
  if(needsText){
    if(!node.textProxy){node.textProxy=node.el.ownerDocument.createElementNS(svgNS,'text');node.el.after(node.textProxy);node.originalDisplay=node.el.style.display;}
    node.el.style.display='none';const el=node.textProxy;
    const from=base.box,origin=node.textOrigin,size=origin?origin.size*(o.pt||12)/(base.pt||12):(o.pt||12)*mmPt*scene.sy,key=JSON.stringify([o.text,o.pt,o.font,o.fill,o.paragraph]);
    if(el._key!==key){el._key=key;localText(el,o,{w:from.w*scene.sx},size,origin?.x??(scene.x+from.x*scene.sx),origin?.y??(scene.y+from.y*scene.sy+size*.88));}
    const local=node.el.transform.baseVal.consolidate()?.matrix;
    if(local){let m=asDOM(local).multiply(node.world.inverse());if(origin)m=m.multiply(origin.matrix);el.setAttribute('transform','matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')');}
    if(o.paragraph){el.setAttribute('transform',node.parentWorld.inverse().multiply(VectorParagraphs.previewMatrix(o,box)).toString());}
  }else if(node.textProxy){node.textProxy.remove();node.textProxy=null;node.el.style.display=node.originalDisplay||'';}
  const fillChanged=o.fill!==base.fill||o.filled!==base.filled,strokeChanged=JSON.stringify(o.stroke)!==JSON.stringify(base.stroke);
  const signature=JSON.stringify([fillChanged,o.fill,o.filled,strokeChanged,o.stroke,!!node.textProxy]);
  if(node.paintKey===signature)return;node.paintKey=signature;
  if(!fillChanged&&!strokeChanged&&!node.savedPaint)return;
  if(!node.savedPaint){const el=node.el,paints=el.matches('path,rect,ellipse,circle,line,polygon,polyline,text,use')?[el]:[...el.querySelectorAll('path,rect,ellipse,circle,line,polygon,polyline,text,tspan,use')].filter(n=>!n.closest('defs,clipPath,mask'));
    node.savedPaint=paints.map(n=>[n,['fill','stroke','stroke-width'].map(key=>[key,n.style.getPropertyValue(key),n.style.getPropertyPriority(key)])]);}
  for(const [el,original] of node.savedPaint){
    for(const [key,value,priority] of original)if(value)el.style.setProperty(key,value,priority);else el.style.removeProperty(key);
    if(fillChanged&&o.type!=='mask')el.style.fill=o.filled===false?'none':o.fill||'#242735';
    if(strokeChanged&&o.type!=='mask'){el.style.stroke=o.stroke?.enabled?o.stroke.color||'#242735':'none';el.style.strokeWidth=String(o.stroke?.width||1);}
  }
  if(node.textProxy){node.el.style.display='none';node.textProxy.style.fill=o.fill||'#242735';node.textProxy.style.stroke=o.stroke?.enabled?o.stroke.color:'none';node.textProxy.style.strokeWidth=String(o.stroke?.width||1);}
  if(o.type==='mask'){
    const use=node.el.querySelector('clipPath use'),ref=use?.getAttribute('href')||use?.getAttributeNS('http://www.w3.org/1999/xlink','href');
    if(ref&&strokeChanged){for(const [el] of node.savedPaint)if(el!==node.el&&el.localName!=='image'&&el.style.stroke&&el.style.stroke!=='none')el.style.stroke='none';
      if(!node.edge){const original=node.el.ownerDocument.getElementById(ref.slice(1));if(original){node.edge=original.cloneNode(false);node.edge.removeAttribute('id');node.el.append(node.edge);}}
      if(node.edge){node.edge.style.fill='none';node.edge.style.stroke=o.stroke.enabled?o.stroke.color||'#242735':'none';node.edge.style.strokeWidth=String(o.stroke.width||1);}
    }else if(node.edge){node.edge.remove();node.edge=null;}
  }
  if(o.type==='image'){
    if(strokeChanged&&o.stroke?.enabled){if(!node.imageEdge){node.imageEdge=node.el.ownerDocument.createElementNS(svgNS,'rect');node.el.after(node.imageEdge);}
      const edge=node.imageEdge,b=base.box,m=asDOM(node.el.transform.baseVal.consolidate().matrix).multiply(node.world.inverse());
      for(const [k,v] of Object.entries({x:scene.x+b.x*scene.sx,y:scene.y+b.y*scene.sy,width:b.w*scene.sx,height:b.h*scene.sy,fill:'none',stroke:o.stroke.color||'#242735','stroke-width':o.stroke.width,transform:'matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')'}))edge.setAttribute(k,v);
    }else if(node.imageEdge){node.imageEdge.remove();node.imageEdge=null;}
  }
  if(!fillChanged&&!strokeChanged)node.savedPaint=null;
}
function paintCrop(scene,node,crop){
  if(!node.cropImage){
    const drawn=[...node.el.querySelectorAll('image,use')].filter(el=>!el.closest('defs,clipPath,mask')&&(el.localName==='image'||el.ownerDocument.getElementById((el.getAttribute('href')||el.getAttributeNS('http://www.w3.org/1999/xlink','href')||'').slice(1))?.localName==='image'));
    if(drawn.length!==1)return;
    const el=drawn[0],box=el.getBBox(),original=el.transform.baseVal.consolidate()?.matrix;
    const matrix=original?asDOM(original):new DOMMatrix(),center=new DOMPoint(box.x+box.width/2,box.y+box.height/2).matrixTransform(matrix);
    node.cropImage={el,matrix,center,last:''};
  }
  const p=node.cropImage,c=crop||{scale:1,dx:0,dy:0},key=[c.scale,c.dx,c.dy].join(',');
  if(p.last===key)return;p.last=key;
  const root=scene.svg.getScreenCTM(),parent=p.el.parentElement.getScreenCTM();if(!root||!parent){p.last='';return;}
  const world=asDOM(parent).inverse().multiply(asDOM(root)),dx=world.a*c.dx*scene.sx+world.c*c.dy*scene.sy,dy=world.b*c.dx*scene.sx+world.d*c.dy*scene.sy;
  const m=new DOMMatrix().translate(p.center.x+dx,p.center.y+dy).scale(c.scale).translate(-p.center.x,-p.center.y).multiply(p.matrix);
  p.el.setAttribute('transform','matrix('+[m.a,m.b,m.c,m.d,m.e,m.f].join(' ')+')');
}
function changeLocally(actions,mergeKey=''){
  if(!actions.length)return;
  if(!layoutBase)layoutBase=structuredClone(doc().items);
  if(mergeKey&&mergeKey===inputUndoKey&&layoutSteps.at(-1)?.[0]?.kind===actions[0].kind&&layoutSteps.at(-1)[0].id===actions[0].id){
    const prev=layoutSteps.at(-1)[0],m=actions[0];if(m.kind==='text'){m.pt??=prev.pt;m.font||=prev.font;}if(m.kind==='stroke')m.color??=prev.color;
    layoutSteps[layoutSteps.length-1]=actions;
  }else layoutSteps.push(actions);
  inputUndoKey=mergeKey;layoutRedo=[];
  // Preserve focus, caret and IME composition while painting the input event.
  for(const m of actions){const o=doc().items.find(v=>v.id===m.id);if(o&&!applyLocalProperty(o,m))projectGeometry(doc().items,o,m);}
  if((chosen()?.localShape||chosen()?.paragraph)&&chosen()?.type==='text'&&actions.some(m=>m.kind==='text'||m.kind==='paragraph'))for(const k of ['x','y','w','h'])$(k).value=chosen().box[k];
  renderVectorObjects();drawLocalOverlay();selectionBox(chosen()?.hit);draftStatus();scheduleLayout();dirtyUI();
  $('undo').disabled=false;$('redo').disabled=true;
  clearTimeout(draftPersistTimer);draftPersistTimer=setTimeout(persistLocalDraft,120);
}
function projectGeometry(rows,o,m){
  const b={...o.box},sx=m.w/b.w,sy=m.h/b.h;
  const map=v=>({x:m.x+(v.x-b.x)*sx,y:m.y+(v.y-b.y)*sy,w:v.w*sx,h:v.h*sy});
  for(const item of rows)if(item===o||item.id.startsWith(o.id+'/')){const before=item.box;item.box=map(item.box);item.hit=map(item.hit);if(item.paragraph)VectorParagraphs.geometry(item,before,item.box);if(item.cropDraft){item.cropDraft.dx*=sx;item.cropDraft.dy*=sy;}if(item.localShape&&item.type==='text'){item.textScaleX=(item.textScaleX||1)*sx;item.textScaleY=(item.textScaleY||1)*sy;}}
}
const realtimeFields={content:'text',pt:'text',fill:'color',fillOn:'color',strokeColor:'stroke',strokeWidth:'stroke',strokeOn:'stroke',x:'geometry',y:'geometry',w:'geometry',h:'geometry',radius:'round'};
function editOnInput(e){
  const id=e.target.id,kind=realtimeFields[id],o=chosen();if(!state.drawingTools||!kind||!o)return;
  if(e.target.type==='number'&&(!Number.isFinite(e.target.valueAsNumber)||e.target.validity.rangeUnderflow||e.target.validity.rangeOverflow))return;
  const a=edits().find(v=>v.kind===kind);if(!a||!valid(a))return;
  changeLocally([{...a,id:o.id}],o.id+'|'+id);
  if(kind==='text'){const row=[...$('objects').querySelectorAll('.object')].find(b=>b.dataset.id===selected);if(row)row.lastElementChild.textContent=o.name;}
}
$('props').addEventListener('input',editOnInput);$('props').addEventListener('focusout',()=>{inputUndoKey='';});
function persistLocalDraft(){if(layoutSteps.length)try{sessionStorage.setItem('vq-layout-draft',JSON.stringify({version:state.version,preview:doc().preview,steps:layoutSteps}));}catch{}}
window.addEventListener('pagehide',persistLocalDraft);
function clearDrafts(){clearTimeout(layoutTimer);clearTimeout(draftPersistTimer);inputUndoKey='';layoutBase=null;layoutSteps=[];layoutRedo=[];try{sessionStorage.removeItem('vq-layout-draft');}catch{}}
function hasFrameEdits(){
  if(!layoutSteps.length)return false;
  const frames=(doc()?.items||[]).filter(o=>o.canCrop).map(o=>o.id);
  return layoutSteps.some(step=>step.some(m=>m.kind==='crop'||frames.some(id=>m.id===id||m.id.startsWith(id+'/'))));
}
function draftStatus(){
  const count=layoutSteps.length,n=new Set(layoutSteps.flat().map(v=>v.id)).size;
  $('refreshDrafts').disabled=!count;$('refreshMode').disabled=!doc();
  $('refreshDrafts').textContent=count?'写入副本（'+n+'）':'写入副本';if(count){$('message').textContent=hasFrameEdits()?'图片框改动已暂存 · 导出时写入':n+' 个对象已修改';$('modified').hidden=false;}
  else if(doc()&&activeScene?.key===doc().preview)$('message').textContent=doc().edited?'实时矢量画布 · 副本已修改':'实时矢量画布';
}
function scheduleLayout(){
  clearTimeout(layoutTimer);
  if(!layoutSteps.length||$('refreshMode').value!=='idle'||hasFrameEdits())return;
  layoutTimer=setTimeout(()=>{
    if(working||drag||pan||touchNav||document.querySelector('dialog[open]')||edits().length){scheduleLayout();return;}
    run('正在写入工作副本…',commitLayout,'inline');
  },2400);
}
function queueLayout(moves){
  inputUndoKey='';
  if(!moves.every(b=>valid({kind:'geometry',...b})))return;
  if(!layoutBase)layoutBase=structuredClone(doc().items);
  layoutSteps.push(moves);layoutRedo=[];projectDrafts();
}
function projectDrafts(){
  if(!layoutBase)return;
  const rows=structuredClone(layoutBase);
  for(const changes of layoutSteps)for(const m of changes){
    if(m.kind==='create'||m.kind==='clone'){rows.unshift(structuredClone(m.item));continue;}
    if(m.kind==='delete'){for(let i=rows.length-1;i>=0;i--)if(rows[i].id===m.id||rows[i].id.startsWith(m.id+'/'))rows.splice(i,1);continue;}
    const o=rows.find(o=>o.id===m.id);if(!o)continue;if(!applyLocalProperty(o,m))projectGeometry(rows,o,m);
  }
  doc().items=rows;assignSelection(pickedIds().filter(id=>rows.some(o=>o.id===id)));draw();scheduleLayout();
  try{sessionStorage.setItem('vq-layout-draft',JSON.stringify({version:state.version,preview:doc().preview,steps:layoutSteps}));}catch{}
}
function paintDrafts(){
  const host=$('draftOverlay');host.replaceChildren();$('transientPixels')?.remove();if(!doc())return;
  ensureVectorScene();
  drawLocalOverlay();
  if(activeScene?.key===doc().preview){renderVectorObjects();if(!layoutSteps.length)return;}
  if(!layoutBase||!layoutSteps.length)return;
  for(const id of new Set(layoutSteps.flat().map(m=>m.id))){
    if(isLocalItem(id))continue;
    if([...fallbackTextOverlay.children].some(el=>el.dataset.id===id))continue;
    if(activeScene?.key===doc().preview&&activeScene.nodes.has(id))continue;
    const base=layoutBase.find(o=>o.id===id)?.hit,now=doc().items.find(o=>o.id===id)?.hit;if(!base||!now||base.w<=0||base.h<=0)continue;
    const old=document.createElement('i'),next=document.createElement('i');old.className='draft-old';next.className='draft-new';boxStyle(old,base);boxStyle(next,now);
    const kx=px*now.w/base.w,ky=px*now.h/base.h;
    next.style.backgroundImage='url("'+doc().preview+'")';next.style.backgroundSize=doc().width*kx+'px '+doc().height*ky+'px';next.style.backgroundPosition=-base.x*kx+'px '+(-base.y*ky)+'px';
    const o=doc().items.find(v=>v.id===id);if(o.canRound)next.style.borderRadius=(o.radius||0)*px+'px';host.append(old,next);
  }
}
async function commitLayout(){
  if(!layoutSteps.length)return;
  clearTimeout(layoutTimer);const preview=doc().preview,old=pickedIds().slice(),ops=[],ids=new Map();
  const sources=new Set(layoutSteps.flat().filter(m=>m.kind==='clone').map(m=>m.source));
  const dropped=new Set(layoutSteps.flat().filter(m=>m.kind==='delete'&&isLocalItem(m.id)&&!sources.has(m.id)).map(m=>m.id));
  // A pasted object's native source must be duplicated in its state at Copy time.
  const ordered=Array.from({length:layoutSteps.length+1},()=>[]);
  layoutSteps.forEach((step,i)=>{for(const m of step)ordered[m.captureAfter??(i+1)].push(m);});
  for(const step of ordered)for(const m0 of step){
    if(dropped.has(m0.id))continue;
    const m={...m0};let replace=-1;
    for(let i=ops.length-1;i>=0;i--){const prev=ops[i];
      if(prev.kind==='clone'&&(prev.source===m.id||prev.source.startsWith(m.id+'/')))break;
      if(prev.id===m.id){if(prev.kind===m.kind&&m.kind!=='create')replace=i;break;}
      if(prev.id.startsWith(m.id+'/')||m.id.startsWith(prev.id+'/'))break;
    }
    if(replace>=0&&m.kind==='crop'&&(ops[replace].factor*m.factor>20||ops[replace].factor*m.factor<.05))replace=-1;
    if(replace<0)ops.push(m);else{const prev=ops[replace];
      if(m.kind==='text'){m.pt??=prev.pt;m.font||=prev.font;}else if(m.kind==='stroke')m.color??=prev.color;else if(m.kind==='crop'){m.factor*=prev.factor;m.dx+=prev.dx;m.dy+=prev.dy;}
      ops[replace]=m;
    }
  }
  for(const o of layoutBase)ids.set(o.id,o.id);
  if(!ops.length){clearDrafts();draw();return ids;}
  const src=layoutBase,geometryOnly=ops.every(m=>!m.kind||m.kind==='geometry'||m.kind==='round'),seen=new Set(),unique=ops.every(m=>!seen.has(m.id)&&seen.add(m.id));
  const first=src.find(o=>o.id===ops[0].id)?.box,dx=first?ops[0].x-first.x:0,dy=first?ops[0].y-first.y:0;
  const sharedMove=geometryOnly&&unique&&ops.length>1&&ops.every(m=>{const b=src.find(o=>o.id===m.id)?.box;return b&&m.kind!=='round'&&Math.abs(m.x-b.x-dx)<.0001&&Math.abs(m.y-b.y-dy)<.0001&&m.w===b.w&&m.h===b.h&&!ops.some(other=>m.id.startsWith(other.id+'/'));});
  const post=(command,payload)=>request('/api/'+command,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.version,...payload})});
  let done=0;
  try{
    if(state.realtimeBatch&&!geometryOnly&&(state.cloneBatch||!ops.some(m=>m.kind==='clone'))){
      state=await post('edits',{changes:ops.map(m=>m.kind==='clone'?{kind:m.kind,id:m.id,source:m.source,dx:m.dx,dy:m.dy}:m.kind==='create'?{kind:m.kind,id:m.id,action:m.action}:{kind:'geometry',...m})});
      const uidMap=new Map(doc().items.filter(o=>o.uid).map(o=>[o.uid,o.id]));
      for(const o of src)if(uidMap.has(o.uid))ids.set(o.id,uidMap.get(o.uid));
      for(const [from,to] of Object.entries(doc().remapped||{}))if(to)ids.set(from,to);
      done=ops.length;
    }else if(geometryOnly&&state.layoutBatch){state=await post('layout',{moves:ops});done=ops.length;}
    else if(sharedMove&&state.drawingTools){state=await post('act',{action:{kind:'multi',ids:ops.map(m=>m.id),operation:'move',dx,dy}});done=ops.length;}
    else for(const m of ops){
      if(m.kind==='create'||m.kind==='clone'){
        const before=(done?state.document.items:src),action=m.kind==='clone'?{kind:'duplicate',id:ids.get(m.source)||m.source}:m.action;
        const next=await post('act',{action}),created=next.document.selected;
        if(!created)throw Error('新建对象未返回可编辑标识。');
        const prior=next.document.items.filter(o=>o.id!==created&&!o.id.startsWith(created+'/')),nativeIds=new Map(prior.filter(o=>o.uid).map(o=>[o.uid,o.id])),change=new Map();
        before.forEach((o,i)=>{const corresponding=nativeIds.get(o.uid)||(prior.length===before.length&&prior[i]?.name===o.name&&prior[i]?.type===o.type?prior[i].id:null);if(corresponding)change.set(o.id,corresponding);});
        for(const [logical,oldId] of ids)ids.set(logical,change.get(oldId)||oldId);
        ids.set(m.id,created);state=next;
        if(m.kind==='clone'&&(m.dx!==3||m.dy!==3)){const b=doc().items.find(o=>o.id===created).box;state=await post('act',{action:{kind:'geometry',id:created,...b,x:b.x+m.dx-3,y:b.y+m.dy-3}});}
      }else{const id=ids.get(m.id)||m.id,before=done?state.document.items:src;
        const next=await post('act',{action:{kind:'geometry',...m,id}});
        if(m.kind==='delete'){
          const remain=before.filter(o=>o.id!==id&&!o.id.startsWith(id+'/')),byUid=new Map(next.document.items.filter(o=>o.uid).map(o=>[o.uid,o.id])),change=new Map();
          remain.forEach((o,i)=>{const to=byUid.get(o.uid)||(remain.length===next.document.items.length&&next.document.items[i]?.type===o.type?next.document.items[i].id:null);if(to)change.set(o.id,to);});
          for(const [logical,was] of ids)if(change.has(was))ids.set(logical,change.get(was));
        }
        state=next;}
      done++;
    }
  }catch(e){
    if(done){layoutBase=structuredClone(state.document.items);layoutSteps=ops.slice(done).map(m=>[{...m,id:ids.get(m.id)||m.id}]);layoutRedo=[];assignSelection(old.map(id=>ids.get(id)||id));projectDrafts();}
    throw e;
  }
  if(clipboard?.preview===preview){for(const item of clipboard.items){const target=doc().items.find(o=>o.id===(ids.get(item.id)||item.id));if(target){item.id=target.id;item.uid=target.uid;}}}
  if(geometryOnly&&activeScene&&activeScene.key===preview){activeScene.key=doc().preview;sceneRequestKey=doc().preview;for(const m of ops)activeScene.changed.add(m.id);}
  clearDrafts();assignSelection(old.map(id=>ids.get(id)||id).filter(id=>doc().items.some(o=>o.id===id)));thumbs.delete(doc().page);draw();return ids;
}
$('refreshDrafts').onclick=()=>run('正在更新画板…',commitLayout);
$('refreshMode').onchange=()=>{try{localStorage.setItem('vq-refresh-mode',$('refreshMode').value);}catch{}scheduleLayout();};
try{$('refreshMode').value=localStorage.getItem('vq-refresh-mode')==='idle'?'idle':'manual';}catch{$('refreshMode').value='manual';}
function boxStyle(el,b){Object.assign(el.style,{left:b.x*px+'px',top:b.y*px+'px',width:b.w*px+'px',height:b.h*px+'px'});}
function hideGuides(){$('guideX').hidden=$('guideY').hidden=true;}
function snapped(axis,b,delta,targets){
  const size=axis==='x'?'w':'h',edges=r=>[r[axis],r[axis]+r[size]/2,r[axis]+r[size]];
  let best=6/px,offset=0,line=null;
  const anchors=edges(b);for(const r of targets)for(const fixed of edges(r))for(const a of anchors){const dif=fixed-a-delta;if(Math.abs(dif)<best){best=Math.abs(dif);offset=dif;line=fixed;}}
  if(line!==null){const el=$(axis==='x'?'guideX':'guideY');el.hidden=false;el.style[axis==='x'?'left':'top']=line*px+'px';}
  return delta+offset;
}
function multiAction(operation,extra={}){
  const ids=pickedIds();if(!ids.length||!allowLeave())return;
  if(operation==='duplicate'&&state.drawingTools){copyItems(pickedItems(),3,3);return;}
  if(operation==='delete'&&state.drawingTools){removeLocalItems(ids);return;}
  if(['left','right','centerX','top','bottom','centerY','spaceX','spaceY','move'].includes(operation)){
    const items=pickedItems(),page=$('alignTarget').value==='page',b=page?{x:0,y:0,w:doc().width,h:doc().height}:extent(items.map(o=>o.box));
    const horizontal=['left','right','centerX','spaceX'].includes(operation),axis=horizontal?'x':'y',size=horizontal?'w':'h';
    const boxes=items.map(o=>({id:o.id,...o.box}));
    if(operation==='move')for(const m of boxes){m.x+=extra.dx;m.y+=extra.dy;}
    else if(operation==='spaceX'||operation==='spaceY'){
      if(items.length<3)return;boxes.sort((a,b)=>a[axis]-b[axis]);let at=b[axis];
      const gap=(b[size]-boxes.reduce((s,o)=>s+o[size],0))/(boxes.length-1);
      for(const m of boxes){m[axis]=at;at+=m[size]+gap;}
    }else{const f={left:0,right:1,centerX:.5,top:0,bottom:1,centerY:.5}[operation];for(const m of boxes)m[axis]=b[axis]+(b[size]-m[size])*f;}
    queueLayout(boxes);return;
  }
  return act('multi',{ids,operation,reference:$('alignTarget').value,...extra});
}
document.querySelectorAll('[data-multi]').forEach(b=>b.onclick=()=>multiAction(b.dataset.multi));
window.addEventListener('pointerup',()=>{if(layoutSteps.length)scheduleLayout();});
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&doc()&&!working&&!e.isComposing&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();$('export').click();}});
$('multiToggle').onclick=()=>{additive=!additive;props();};
$('jumpLook').onclick=()=>document.querySelector('.properties').scrollTo({top:0});
$('jumpAlign').onclick=()=>{const panel=document.querySelector('.properties'),target=$('alignment');panel.scrollTop+=target.getBoundingClientRect().top-panel.getBoundingClientRect().top-51;};
$('layerFilter').onchange=e=>{if(!allowLeave()){e.target.value=layerScope;return;}layerScope=e.target.value;assignSelection([]);list();props();selectionBox(null);};
$('copyActiveLayer').onclick=()=>{const o=doc()?.items.find(i=>!i.locked&&layerKey(i)===layerScope);if(o&&allowLeave())act('duplicateLayer',{id:o.id});};
$('marqueeMode').onclick=()=>{if(allowLeave())setTool(tool==='marquee'?'select':'marquee');};
$('snapToggle').onclick=()=>{snap=!snap;hideGuides();props();};
for(const id of ['pageAdd','pageCopy','pageDelete'])$(id).onclick=()=>{if(!allowLeave())return;if(id==='pageDelete'&&!confirm('删除当前页及仅属于该页的对象？此操作可撤销。'))return;act(id);};
$('duplicateLayer').onclick=()=>{if(allowLeave())act('duplicateLayer');};$('ungroup').onclick=()=>{if(allowLeave())act('ungroup');};
let queuedShape=null,fontTarget=null,fontRequest=0,boardMode='blank',externalFile=null;
function menu(open){$('shapeOptions').hidden=!open;$('shapeMenu').setAttribute('aria-expanded',String(open));}
function toolHint(){
  const shape=tool.startsWith('shape:');$('pickBanner').hidden=!photoTarget&&!shape&&tool!=='marquee'&&tool!=='crop';
  $('pickBanner').querySelector('span').textContent=shape?'拖动画出'+shapeNames[tool.slice(6)]+'，或单击放入默认尺寸':tool==='marquee'?'拖动框选对象，Shift 可追加':tool==='crop'?'拖动框内照片 · 滚轮缩放 · Esc 完成':'点选画板或对象列表中的图片，裁取与图片框重叠的部分';
}
function clearSketch(){$('sketch')?.remove();}
function shapeBox(d,e,click){
  const m=doc(),pt=point(e.clientX,e.clientY);let dx=pt.x-d.start.x,dy=pt.y-d.start.y;
  if(click){dx=Math.min(45,m.width*.35);dy=Math.min(30,m.height*.25);}
  else if(e.shiftKey&&d.shape!=='line'){const side=Math.max(Math.abs(dx),Math.abs(dy));dx=(dx<0?-1:1)*side;dy=(dy<0?-1:1)*side;}
  return {x:Math.min(d.start.x,d.start.x+dx),y:Math.min(d.start.y,d.start.y+dy),w:Math.min(5000,Math.max(.01,Math.abs(dx))),h:Math.min(5000,Math.max(.01,Math.abs(dy))),reverse:dx*dy<0};
}
function drawShapePreview(d,e){
  let el=$('sketch');if(!el){el=document.createElement('div');el.id='sketch';$('paper').append(el);}
  const b=shapeBox(d,e,false);el.className='sketch-'+d.shape;Object.assign(el.style,{left:b.x*px+'px',top:b.y*px+'px',width:b.w*px+'px',height:b.h*px+'px'});
  if(d.shape==='line')el.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="0" y1="'+(b.reverse?100:0)+'" x2="100" y2="'+(b.reverse?0:100)+'" vector-effect="non-scaling-stroke"/></svg>';
}
function startShape(shape){photoTarget=null;setTool('shape:'+shape);panel();list();toolHint();}
const boardFields=[$('blankW'),$('blankH')];
const blankPresetKey='vq-new-board-preset';
function newBoardPreset(){
  const min=typeof VectorBrowser==='undefined'?5:.01;
  try{
    const saved=JSON.parse(boardPreference(blankPresetKey,'null'));
    if(saved&&validBoardUnit(saved.unit)&&[saved.w,saved.h].every(n=>Number.isFinite(n)&&n>=min&&n<=2000))return saved;
  }catch{}
  return {unit:'px',w:1000*boardUnits.px,h:1000*boardUnits.px};
}
let dialogMM=[];
function showBoardMeasurements(){
  const unit=$('boardUnit').value,factor=boardUnitFactor(unit,boardMode==='size'?doc()?.ppi:96),minimum=typeof VectorBrowser==='undefined'?5:.01;
  for(const [i,input] of boardFields.entries()){
    input.min=Math.floor(minimum/factor*1e7)/1e7;input.max=Math.ceil(2000/factor*1e7)/1e7;
    input.value=Number.isFinite(dialogMM[i])?formatBoardMeasurement(dialogMM[i],factor):'';
  }
  const hints=[];
  if(unit==='px')hints.push('1 英寸 = '+(boardMode==='size'?doc()?.ppi||96:96)+' 像素');
  if(boardMode==='size')hints.push('以左上角为基准，图稿保留原尺寸');
  $('boardDialogHint').textContent=hints.join('。');$('boardDialogHint').hidden=!hints.length;
}
boardFields.forEach((input,i)=>input.addEventListener('input',()=>{dialogMM[i]=input.valueAsNumber*boardUnitFactor($('boardUnit').value,boardMode==='size'?doc()?.ppi:96);}));
$('boardUnit').onchange=showBoardMeasurements;
function boardDialog(mode){
  boardMode=mode;const resize=mode==='size';$('boardDialogTitle').textContent=resize?'调整当前画板尺寸':'新建空白文稿';
  const preset=resize?{w:doc().width,h:doc().height,unit:currentBoardUnit()}:newBoardPreset();
  dialogMM=[preset.w,preset.h];$('boardUnit').value=preset.unit;showBoardMeasurements();
  $('defaultSizeOption').hidden=resize;$('saveDefaultSize').checked=false;
  $('boardSubmit').textContent=resize?'应用尺寸':'创建画板';$('blankDialog').showModal();
}
$('blank').onclick=()=>{queuedShape=null;boardDialog('blank');};
$('pageSize').onclick=()=>{if(allowLeave())boardDialog('size');};
$('blankCancel').onclick=()=>$('blankDialog').close();
$('blankForm').onsubmit=e=>{e.preventDefault();const [w,h]=dialogMM,unit=$('boardUnit').value;if(!Number.isFinite(w)||!Number.isFinite(h)||!$('blankForm').reportValidity())return;
  if(boardMode==='size'){saveBoardPreference('vq-board-unit',unit);$('blankDialog').close();act('pageSize',{w,h,unit});return;}
  if(!canReplace())return;
  const saveDefault=$('saveDefaultSize').checked,shape=queuedShape;
  queuedShape=null;$('blankDialog').close();
  run('正在创建空白画板…',async()=>{
    await api('blank',{w,h,unit});
    if(shape)startShape(shape);
    if(saveDefault){
      const saved=saveBoardPreference(blankPresetKey,JSON.stringify({w,h,unit}));
      $('message').textContent=saved?'已保存默认画板尺寸':'画板已创建，当前环境无法保存默认尺寸。';
    }
  });};
$('shapeMenu').onclick=()=>menu($('shapeOptions').hidden);
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.create-strip'))menu(false);});
$('shapeOptions').onclick=e=>{const shape=e.target.closest('[data-shape]')?.dataset.shape;if(!shape)return;menu(false);if(!doc()){queuedShape=shape;boardDialog('blank');}else if(allowLeave())startShape(shape);};
$('cancelPhoto').onclick=()=>{if(tool.startsWith('shape:')||tool==='marquee'||tool==='crop'){drag=null;clearSketch();$('marqueeBox').hidden=true;setTool('select');}else cancelPhoto();};
function renderFonts(){
  const q=$('fontSearch').value.trim().toLowerCase(),available=(fontList||[]).filter(f=>(f.label+' '+f.id).toLowerCase().includes(q));
  const families=[...new Set(available.map(f=>f.family||f.label))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  $('fontList').replaceChildren(...families.map(f=>new Option(f,f)));
  const original=available.find(f=>f.id===chosen()?.font);if(original)$('fontList').value=original.family||original.label;else $('fontList').selectedIndex=families.length?0:-1;
  renderStyles();$('fontInfo').textContent=families.length?'可用字体家族 '+families.length+' 个':'没有匹配的字体';
}
function renderStyles(){const family=$('fontList').value,styles=(fontList||[]).filter(f=>(f.family||f.label)===family);
  $('fontStyle').replaceChildren(...styles.map(f=>new Option(f.style||f.label,f.id)));if(styles.some(f=>f.id===chosen()?.font))$('fontStyle').value=chosen().font;else $('fontStyle').selectedIndex=styles.length?0:-1;$('fontUse').disabled=!styles.length;}
async function openFonts(){
  const o=chosen();if(o?.type!=='text')return;const seq=++fontRequest;fontTarget=o.id;
  $('fontSearch').value='';$('fontList').replaceChildren();$('fontInfo').textContent='正在读取 Illustrator 可用字体…';$('fontUse').disabled=true;$('fontDialog').showModal();$('fontSearch').focus();
  try{fontList ||= await request('/api/fonts');if(seq===fontRequest&&$('fontDialog').open)renderFonts();}catch(e){if(seq===fontRequest)$('fontInfo').textContent=e.message;}
}
$('fontList').onchange=renderStyles;$('fontSearch').oninput=renderFonts;$('fontCancel').onclick=()=>$('fontDialog').close();
$('fontUse').onclick=async()=>{const id=$('fontStyle').value;if(!id||chosen()?.id!==fontTarget)return;$('fontChoices').replaceChildren(new Option(id,id,true,true));$('fontDialog').close();dirtyUI();await applyEdit('text');if(chosen()?.type==='text'&&chosen().font&&chosen().font!==id)error('Illustrator 返回的实际字体为 '+chosen().font+'，请为这段文字选择包含所需字符的字形。');};
$('fontList').ondblclick=()=>$('fontUse').click();
$('radiusSlider').oninput=e=>{$('radius').value=e.target.value;$('selection').style.borderRadius=Number(e.target.value)*px+'px';if(chosen())renderVectorObjects([{id:selected,...chosen().box,r:Number(e.target.value)}]);dirtyUI();};
$('radiusSlider').onchange=()=>{const o=chosen(),r=$('radiusSlider').valueAsNumber;if(o&&r!==o.radius)queueLayout([{kind:'round',id:o.id,r}]);};
$('radius').oninput=e=>{$('radiusSlider').value=e.target.value;$('selection').style.borderRadius=Math.max(0,+$('radiusSlider').value)*px+'px';};
$('cropMode').onclick=()=>{if(chosen()?.canCrop){setTool(tool==='crop'?'select':'crop');panel();}};
$('strokeOn').onchange=dirtyUI;
$('external').onclick=()=>{if(!doc()||!allowLeave())return;externalFile=null;$('sourcePage').value=1;$('pickExternal').textContent='选择源文件';$('sourceInfo').textContent='';$('sourcePageRow').hidden=true;$('insertExternal').disabled=true;$('importDialog').showModal();};
$('pickExternal').onclick=()=>$('externalFile').click();$('cancelImport').onclick=()=>$('importDialog').close();
$('externalFile').onchange=e=>{const f=e.target.files[0];e.target.value='';if(!f)return;externalFile=f;$('pickExternal').textContent=f.name;$('sourcePageRow').hidden=!/\.(ai|pdf)$/i.test(f.name);$('sourcePage').value=1;$('insertExternal').disabled=false;};
$('insertExternal').onclick=()=>{const f=externalFile,n=$('sourcePage').valueAsNumber;if(!f||!Number.isInteger(n)||n<1||n>1000){$('sourceInfo').textContent='请输入有效页码';return;}$('importDialog').close();
  run('正在插入外部文件…',async()=>api('act',{action:{kind:'importArtwork',asset:await upload(f),sheet:n}}));};
let rulersEnabled=boardPreference('vq-show-rulers','0')==='1',rulerFrame=0;
function rulerSpacing(scale){
  const target=66/scale,power=10**Math.floor(Math.log10(target));
  return ([1,2,5,10].find(n=>n*power>=target)||10)*power;
}
function drawRulerAxis(canvas,horizontal,origin,scale){
  const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height||!(scale>0))return;
  const ratio=window.devicePixelRatio||1,bw=Math.round(width*ratio),bh=Math.round(height*ratio);
  if(canvas.width!==bw)canvas.width=bw;if(canvas.height!==bh)canvas.height=bh;
  const ctx=canvas.getContext('2d');ctx.setTransform(bw/width,0,0,bh/height,0,0);ctx.clearRect(0,0,width,height);
  const major=rulerSpacing(scale),step=major/10,pitch=step*scale,len=horizontal?width:height;
  ctx.lineWidth=1;ctx.font='10px system-ui, sans-serif';ctx.fillStyle='#536077';ctx.strokeStyle='#919bb0';ctx.beginPath();
  for(let i=Math.ceil(-origin/pitch);i<=Math.floor((len-origin)/pitch);i++){
    const at=origin+i*pitch,large=i%10===0,length=large?9:i%5===0?6:3;
    if(horizontal){ctx.moveTo(at,height);ctx.lineTo(at,height-length);}else{ctx.moveTo(width,at);ctx.lineTo(width-length,at);}
    if(large){const label=String(Number((i*step).toFixed(6)));
      if(horizontal)ctx.fillText(label,at+3,11);
      else{ctx.save();ctx.translate(10,at-3);ctx.rotate(-Math.PI/2);ctx.fillText(label,0,0);ctx.restore();}
    }
  }
  ctx.stroke();
}
function paintRulers(){
  rulerFrame=0;const d=doc(),show=!!d&&rulersEnabled,host=$('boardRulers');
  $('rulerToggle').disabled=!d;$('rulerToggle').setAttribute('aria-pressed',String(show));
  host.hidden=!show;host.parentElement.classList.toggle('show-rulers',show);if(!show)return;
  const unit=currentBoardUnit(),paper=$('paper').getBoundingClientRect(),h=$('horizontalRuler'),v=$('verticalRuler');
  $('rulerUnit').textContent=unit;
  drawRulerAxis(h,true,paper.left-h.getBoundingClientRect().left,paper.width/d.width*boardUnitFactor(unit,d.ppi));
  drawRulerAxis(v,false,paper.top-v.getBoundingClientRect().top,paper.height/d.height*boardUnitFactor(unit,d.ppi));
}
function scheduleRulers(){if(!rulerFrame)rulerFrame=requestAnimationFrame(paintRulers);}
$('rulerToggle').onclick=()=>{if(!doc())return;rulersEnabled=!rulersEnabled;saveBoardPreference('vq-show-rulers',rulersEnabled?'1':'0');paintRulers();};
$('viewport').addEventListener('scroll',()=>{if(rulersEnabled)scheduleRulers();},{passive:true});
window.addEventListener('keydown',e=>{
  if(doc()&&!working&&!e.isComposing&&(e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='r'&&!document.querySelector('dialog[open]')&&!e.target.closest('input,textarea,select,[contenteditable=true]')){
    e.preventDefault();if(!e.repeat)$('rulerToggle').click();
  }
});
new ResizeObserver(()=>{panel(small()?document.body.dataset.panel||'':'');view();}).observe($('viewport'));
request('/api/state').then(s=>{state=s;draw();try{const cache=JSON.parse(sessionStorage.getItem('vq-layout-draft')||'null');if(doc()&&cache?.version===s.version&&cache.preview===doc().preview&&Array.isArray(cache.steps)&&cache.steps.length){layoutBase=structuredClone(doc().items);layoutSteps=cache.steps;projectDrafts();}}catch{clearDrafts();}}).catch(e=>error(e.message));

(() => {
  const toolbar=document.createElement('div');toolbar.id='layerOrder';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','调整对象层级');
  for(const [key,label] of [['front','置顶'],['up','上移'],['down','下移'],['back','置底']]){
    const b=document.createElement('button');b.type='button';b.dataset.stack=key;b.textContent=label;toolbar.append(b);
  }
  $('layerShelf').after(toolbar);
  const size=document.createElement('section');size.id='selectionSize';
  size.innerHTML='<h3>选区尺寸 <small>mm</small></h3><div class="text-metrics"><label>宽<input id="groupWidth" type="number" min=".01" max="5000" step="any"></label><label>高<input id="groupHeight" type="number" min=".01" max="5000" step="any"></label></div><div class="group-size-actions"><label><input type="checkbox" id="groupRatio" checked> 等比</label><button id="applyGroupSize" type="button">应用尺寸</button></div>';
  $('multiTitle').after(size);
  function canShift(d,front){let hasOther=false;const ids=new Set(pickedIds());for(const o of front?d.items:[...d.items].reverse()){if(!ids.has(o.id))hasOther=true;else if(hasOther)return true;}return false;}
  function order(direction,anchor,ids=pickedIds()){
    if(!ids.length||working||!allowLeave())return;
    run('正在调整层级…',()=>api('act',{action:{kind:'order',ids,source:anchor,direction}}),'inline');
  }
  toolbar.onclick=e=>{const d=e.target.dataset.stack;if(d)order(d);};
  const list=$('objects');let moving=null,over=null;
  function reset(){over?.classList.remove('drop-above','drop-below');over=null;}
  list.addEventListener('dragstart',e=>{const row=e.target.closest('.object');if(!row||row.disabled||working){e.preventDefault();return;}moving=pickedIds().includes(row.dataset.id)?pickedIds().slice():[row.dataset.id];e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','');});
  list.addEventListener('dragover',e=>{const row=e.target.closest('.object');reset();if(!moving||!row||moving.includes(row.dataset.id))return;e.preventDefault();e.dataTransfer.dropEffect='move';over=row;const r=row.getBoundingClientRect();row.classList.add(e.clientY<r.top+r.height/2?'drop-above':'drop-below');});
  list.addEventListener('dragleave',e=>{if(!list.contains(e.relatedTarget))reset();});
  list.addEventListener('drop',e=>{if(!moving||!over)return;e.preventDefault();const anchor=over.dataset.id,direction=over.classList.contains('drop-above')?'above':'below',ids=moving;reset();moving=null;order(direction,anchor,ids);});
  list.addEventListener('dragend',()=>{reset();moving=null;});
  function dimensions(){return extent(pickedItems().map(o=>o.box));}
  function applySize(){const b=dimensions(),w=$('groupWidth').valueAsNumber,h=$('groupHeight').valueAsNumber;if(!b||groupIds.length<2||![w,h].every(n=>Number.isFinite(n)&&n>=.01&&n<=5000))return;
    if(Math.abs(b.w-w)<.0005&&Math.abs(b.h-h)<.0005)return;
    queueLayout(groupMoves(pickedItems(),b,{...b,w,h}));}
  size.addEventListener('input',e=>{const b=dimensions(),v=e.target.valueAsNumber;if(!b||!$('groupRatio').checked||!(v>0))return;
    if(e.target.id==='groupWidth')$('groupHeight').value=+(v*b.h/b.w).toFixed(5);
    if(e.target.id==='groupHeight')$('groupWidth').value=+(v*b.w/b.h).toFixed(5);});
  size.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applySize();}});$('applyGroupSize').onclick=applySize;
  const weight=document.createElement('label');weight.className='weight-control';weight.textContent='字重';
  const weights=document.createElement('select');weights.id='textWeight';weights.setAttribute('aria-label','字重');
  for(const [v,t] of [[100,'极细'],[200,'特细'],[300,'细体'],[400,'常规'],[500,'中等'],[600,'半粗'],[700,'粗体'],[800,'特粗'],[900,'黑体']])weights.add(new Option(v+' · '+t,v));
  weight.append(weights);$('typeBox').querySelector('.font-line').after(weight);
  function effective(o){const p=Number(o.paragraph.weight)||400;return p===400?VectorFonts.intrinsic(o.fontSource||{name:o.font}):p;}
  function setStyle(o,change){
    const style=Object.assign(VectorTextStyle.source(o),change);VectorFonts.preview(style.origin,sceneFrame.contentDocument);
    changeLocally([{kind:'typeStyle',id:o.id,style}]);props();selectionBox(chosen()?.hit);
  }
  async function installed(o,f){
    const info=await VectorFonts.activate(f);if(chosen()?.id!==o.id)return;
    setStyle(o,{font:f.postscriptName,origin:{name:f.postscriptName},weight:String(info.weight),style:info.style});
  }
  // The font dialog and the weight menu must select the actual font file, since
  // weight names such as Light and Medium aren't separate CSS families on Windows.
  $('fontUse').onclick=async()=>{
    const o=chosen(),id=$('fontStyle').value;if(!o||o.id!==fontTarget||!id)return;
    const f=VectorFonts.localMatch(id);$('fontDialog').close();
    try{if(f)await installed(o,f);else setStyle(o,{font:id,origin:null,weight:'400',style:'normal'});}
    catch{error('无法读取所选字形，请检查浏览器的本机字体权限。');}
  };
  weights.onchange=async()=>{
    const o=chosen();if(!o?.paragraph)return;const value=Number(weights.value),italic=o.paragraph.style||'normal';
    try{
      let v=VectorFonts.variant(o.font,value,italic);
      if(!v&&window.queryLocalFonts){fontList=await VectorFormats.fonts();v=VectorFonts.variant(o.font,value,italic);}
      if(chosen()?.id!==o.id)return;
      if(v?.file)await installed(o,v.file);
      else if(v)setStyle(o,{font:v.name,origin:v.origin,weight:String(value),style:italic});
      else if(value===700&&effective(o)<600)setStyle(o,{weight:'700'});
      else if(value===400&&VectorFonts.intrinsic(o.fontSource||{name:o.font})<=400)setStyle(o,{weight:'400'});
      else{error('当前字体没有可用的这个字重。可在字体列表中选择已安装的字形。');update();}
    }catch{error('无法应用字重，请检查本机字体权限。');update();}
  };
  function update(){
    const d=doc(),forward=d&&canShift(d,true),back=d&&canShift(d,false);
    for(const b of toolbar.children)b.disabled=!(['front','up'].includes(b.dataset.stack)?forward:back);
    const o=chosen();if(o?.paragraph)weights.value=String(effective(o));
    if(groupIds.length>1){const b=dimensions();$('groupWidth').value=+b.w.toFixed(5);$('groupHeight').value=+b.h.toFixed(5);}
  }
  window.VectorLayerTools={update};update();
})();

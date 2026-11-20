/* Sample artwork only: editor handles, grids, ruler marks and the sampler UI live outside the snapshot. */
(() => {
  const paper=$('paper'),surface=document.createElement('div'),tip=document.createElement('div'),banner=document.createElement('div');
  surface.id='sampleSurface';surface.hidden=true;surface.tabIndex=-1;surface.setAttribute('aria-label','在画板上点选颜色');
  tip.id='sampleTip';tip.hidden=true;tip.innerHTML='<i></i><span></span>';
  banner.id='sampleBanner';banner.hidden=true;banner.innerHTML='<span></span><button type="button">取消</button>';
  paper.append(surface);document.body.append(tip);document.querySelector('.canvas-wrap').append(banner);
  let session=null,hover=0;
  const buttons=[],labels={fill:'填充色',stroke:'描边色',fxFrom:'渐变起点色',fxTo:'渐变终点色',fxShadowColor:'投影色'};
  const fillable=o=>!o.locked&&(o.type==='text'||o.canFill)&&o.localShape!=='line';
  const strokeable=o=>!o.locked&&!!o.stroke;
  function targets(kind){return pickedItems().filter(kind==='fill'?fillable:kind==='stroke'?strokeable:o=>!o.locked);}
  function button(parent,kind,compact=false,multi=false){
    const b=document.createElement('button'),label='吸取'+labels[kind];
    b.type='button';b.className='sample-button'+(compact?' compact':'');b.dataset.sampleColor=kind;b.title=label+' · 点击画板上的颜色';b.setAttribute('aria-label',label);
    b.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m14 6 4 4m-5-2L4 17l-1 4 4-1 9-9m-4-5 6 6m-3-5 3-3a2 2 0 0 1 3 3l-3 3"/></svg>';
    if(!compact)b.append(label);b.onclick=()=>start(kind,b);
    parent.append(b);buttons.push({b,kind,multi});
  }
  button($('colorBox').querySelector('.row'),'fill');button($('strokeBox'),'stroke');
  for(const kind of ['fxFrom','fxTo','fxShadowColor']){
    const field=$(kind),wrap=document.createElement('span');wrap.className='sample-color-field';field.before(wrap);wrap.append(field);button(wrap,kind,true);
  }
  const batch=document.createElement('div');batch.className='sample-batch';$('multiPanel').append(batch);button(batch,'fill',false,true);button(batch,'stroke',false,true);
  function update(){
    for(const {b,kind,multi} of buttons){const list=targets(kind);b.disabled=!list.length;b.hidden=multi?!groupIds.length||!list.length:!chosen()||!list.length;}
    if(session&&(session.preview!==doc()?.preview||session.selection!==JSON.stringify(pickedIds())))stop();
  }
  function stop(){
    if(!session)return;
    session=null;surface.hidden=tip.hidden=banner.hidden=true;paper.classList.remove('sampling-color');cancelAnimationFrame(hover);hover=0;scheduleLayout();
  }
  function layerCopy(layer,w,h){
    const copy=layer.cloneNode(true);copy.removeAttribute('id');copy.removeAttribute('style');
    for(const [k,v] of Object.entries({x:0,y:0,width:w,height:h}))copy.setAttribute(k,v);
    return copy;
  }
  async function snapshot(isCurrent,limit){
    // Let any pending input paint finish before capturing a draft.
    await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
    if(!isCurrent())return;
    const d=doc(),art=$('art');
    if(!layoutSteps.length){await art.decode();return art;}
    if(layoutBase?.length&&!activeScene){await ensureVectorScene();
      if(!activeScene&&isCurrent())await new Promise(ok=>{const obs=new MutationObserver(()=>{if(activeScene||!isCurrent())done();});
        const end=setTimeout(done,3500);function done(){clearTimeout(end);obs.disconnect();ok();}obs.observe(paper,{attributes:true,attributeFilter:['class']});});}
    if(!isCurrent())return;
    const live=activeScene?.key===d.preview?activeScene.svg:null;
    if(!live&&layoutBase?.length&&layoutSteps.some(step=>step.some(m=>!isLocalItem(m.id))))throw Error('当前画板的矢量预览尚未就绪，请稍后再取色。');
    const svg=VectorModel.make('svg',{width:d.width+'mm',height:d.height+'mm',viewBox:'0 0 '+d.width+' '+d.height});
    if(live)svg.append(layerCopy(live,d.width,d.height));
    else svg.append(layerCopy(VectorModel.parse(VectorBrowser.scene()),d.width,d.height));
    for(const layer of [fallbackTextOverlay,localOverlay])if(layer.childElementCount)svg.append(layerCopy(layer,d.width,d.height));
    if(limit){const k=Math.min(limit.width/d.width,limit.height/d.height);svg.setAttribute('width',Math.max(1,Math.round(d.width*k)));svg.setAttribute('height',Math.max(1,Math.round(d.height*k)));}
    const url=URL.createObjectURL(new Blob([VectorModel.xml(svg)],{type:'image/svg+xml'}));
    try{const img=new Image();img.src=url;await img.decode();return img;}finally{URL.revokeObjectURL(url);}
  }
  function start(kind,trigger){
    if(working||!doc()||!targets(kind).length)return;
    if(session)stop();if(photoTarget)cancelPhoto();if(small())panel();
    clearTimeout(layoutTimer);
    const s={kind,preview:doc().preview,selection:JSON.stringify(pickedIds()),ids:targets(kind).map(o=>o.id),trigger,canvas:document.createElement('canvas')};
    session=s;surface.hidden=banner.hidden=false;paper.classList.add('sampling-color');banner.firstChild.textContent='点选画板颜色 → '+labels[kind];surface.focus({preventScroll:true});
    s.ready=snapshot(()=>session===s).then(img=>{if(session===s){s.img=img;if(s.pointer)show(s,...s.pointer);}}).catch(()=>{if(session===s){stop();error('无法读取当前画板的颜色，请等待预览完成后再试。');}});
  }
  function sample(s,x,y){
    const r=paper.getBoundingClientRect(),v=$('viewport').getBoundingClientRect();
    const l=Math.max(r.left,v.left),t=Math.max(r.top,v.top),w=Math.min(r.right,v.right)-l,h=Math.min(r.bottom,v.bottom)-t;
    if(!s.img||w<=0||h<=0||x<l||y<t||x>=l+w||y>=t+h)return null;
    const key=[r.left,r.top,r.width,r.height,l,t,w,h,devicePixelRatio].join(',');
    if(s.view!==key){const k=Math.min(devicePixelRatio||1,2,4096/Math.max(w,h),Math.sqrt(6000000/(w*h)));
      s.canvas.width=Math.max(1,Math.ceil(w*k));s.canvas.height=Math.max(1,Math.ceil(h*k));
      const ctx=s.canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,s.canvas.width,s.canvas.height);
      ctx.setTransform(s.canvas.width/w,0,0,s.canvas.height/h,0,0);ctx.drawImage(s.img,r.left-l,r.top-t,r.width,r.height);
      s.ctx=ctx;s.view=key;}
    const rgb=s.ctx.getImageData(Math.floor((x-l)*s.canvas.width/w),Math.floor((y-t)*s.canvas.height/h),1,1).data;
    return '#'+[...rgb.subarray(0,3)].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  function show(s,x,y){if(session!==s)return;try{const hex=sample(s,x,y);tip.hidden=!hex;if(hex){tip.firstChild.style.background=hex;tip.lastChild.textContent=hex;
    tip.style.left=Math.max(0,Math.min(innerWidth-100,x+16))+'px';tip.style.top=(y+42>innerHeight?Math.max(0,y-36):y+16)+'px';}}catch{stop();error('浏览器未能读取画板像素。');}}
  surface.onpointermove=e=>{e.stopPropagation();const s=session;if(!s)return;s.pointer=[e.clientX,e.clientY];if(!hover)hover=requestAnimationFrame(()=>{hover=0;if(s.pointer)show(s,...s.pointer);});};
  surface.onpointerleave=()=>{tip.hidden=true;if(session)session.pointer=null;};
  surface.onpointerdown=e=>{e.stopPropagation();e.preventDefault();if(session&&e.button===0)session.press=e.pointerId;};
  surface.onpointercancel=e=>{e.stopPropagation();if(session)session.press=null;};
  surface.onpointerup=async e=>{
    e.stopPropagation();e.preventDefault();const s=session;if(!s||s.press!==e.pointerId)return;s.press=null;
    const {clientX:x,clientY:y}=e;await s.ready;if(s!==session)return;
    let hex;try{hex=sample(s,x,y);}catch{stop();error('浏览器未能读取画板像素。');return;}if(!hex)return;
    const objects=targets(s.kind).filter(o=>s.ids.includes(o.id));stop();if(!objects.length)return;
    if(s.kind==='fill'||s.kind==='stroke'){
      const edits=objects.map(o=>s.kind==='fill'?{kind:'color',id:o.id,enabled:true,color:hex}:{kind:'stroke',id:o.id,enabled:true,color:hex,width:o.stroke.width||1,position:o.stroke.position||(o.stroke.enabled?'center':'outside')});
      changeLocally(edits);props();selectionBox(chosen()?.hit);
    }else{const field=$(s.kind);field.value=hex;field.dispatchEvent(new Event('input',{bubbles:true}));inputUndoKey='';}
    $('message').textContent='已应用'+labels[s.kind]+' '+hex;
  };
  for(const name of ['click','dblclick'])surface.addEventListener(name,e=>{e.preventDefault();e.stopPropagation();});
  banner.lastChild.onclick=()=>{stop();$('message').textContent='已取消取色';};
  document.addEventListener('keydown',e=>{if(!session)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const from=session.trigger;banner.lastChild.click();if(from.offsetParent)from.focus({preventScroll:true});}else if(e.key==='Tab'||e.ctrlKey||e.metaKey){stop();}else e.stopImmediatePropagation();},true);
  document.addEventListener('pointerdown',e=>{if(session&&!surface.contains(e.target)&&!banner.contains(e.target))stop();},true);
  window.BoardSampler={update,snapshot,get active(){return !!session;}};update();
})();

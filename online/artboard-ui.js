(() => {
  const toggle=document.createElement('button');toggle.id='artboardTool';toggle.textContent='画板工具';toggle.title='画板工具 (Shift+O)';$('pageSize').after(toggle);
  const quick=toggle.cloneNode(true);quick.id='artboardQuick';$('handMode').after(quick);
  const host=document.createElement('section');host.id='boardSpace';host.hidden=true;
  host.innerHTML='<div class="board-bar"><button data-board="draw">＋ 绘制画板</button><button data-board="copy">复制</button><button data-board="delete">删除</button><button data-board="arrange">自动排列</button><button data-board="smaller" aria-label="缩小画板总览">−</button><button data-board="fit">适应全部</button><button data-board="larger" aria-label="放大画板总览">＋</button><button data-board="edit">编辑内容 ↗</button></div><div class="board-field" tabindex="0" aria-label="多画板工作区"><div class="board-plane"></div></div>';
  document.querySelector('.canvas-wrap').append(host);
  const field=host.querySelector('.board-field'),plane=host.querySelector('.board-plane');
  const inspector=document.createElement('section');inspector.id='artBoardInspector';inspector.hidden=true;
  inspector.innerHTML='<h3>画板属性</h3><form><label>名称<input id="artName" required maxlength="128"></label><div class="text-metrics">'+[['X','X'],['Y','Y'],['W','宽'],['H','高']].map(([id,t])=>'<label><span>'+t+' <small data-ab-unit></small></span><input id="art'+id+'" type="number" step="any" required></label>').join('')+'</div><button type="submit">应用画板属性</button></form><h3>导出顺序</h3><div class="board-order"><button data-board="earlier">前移一页</button><button data-board="later">后移一页</button></div>';
  document.querySelector('.properties').append(inspector);
  const boardList=document.createElement('section');boardList.id='overviewList';boardList.innerHTML='<h3>画板顺序</h3><div></div>';document.querySelector('.layer-section').append(boardList);
  const unitLabel=document.createElement('label');
  unitLabel.className='current-board-unit';
  const unitPicker=$('boardUnit').cloneNode(true);unitPicker.id='currentBoardUnit';
  unitLabel.append('画板单位',unitPicker);
  const unitHome=document.querySelector('.page-section');
  unitHome.append(unitLabel);
  unitPicker.onchange=async()=>{
    const unit=unitPicker.value;
    if(!doc()){saveBoardPreference('vq-board-unit',unit);return;}
    if(working||!allowLeave()){unitPicker.value=currentBoardUnit();return;}
    const board=active&&items[index],draft=board?['X','Y','W','H'].map(k=>{
      const field=$('art'+k),factor=boardUnitFactor(board.unit,board.ppi);
      return field.value!==String(formatBoardMeasurement(board[k.toLowerCase()],factor))?{field,mm:field.valueAsNumber*factor}:null;
    }).filter(Boolean):[],name=board?$('artName').value:null;
    await run('正在切换画板单位…',async()=>{
      if(layoutSteps.length)await commitLayout();
      await api('boardUnit',{unit});saveBoardPreference('vq-board-unit',unit);
      if(board){sync(true);$('artName').value=name;for(const {field,mm} of draft)field.value=Number.isFinite(mm)?formatBoardMeasurement(mm,boardUnitFactor(unit,board.ppi)):'';}
    },'inline');
    unitPicker.value=currentBoardUnit();
  };
  let listDrag=null;
  boardList.addEventListener('dragstart',e=>{const row=e.target.closest('[data-ab-row]');if(!row)return;listDrag=+row.dataset.abRow;e.dataTransfer.setData('text/plain','');e.dataTransfer.effectAllowed='move';});
  boardList.addEventListener('dragover',e=>{if(listDrag!==null&&e.target.closest('[data-ab-row]'))e.preventDefault();});
  boardList.addEventListener('drop',e=>{const row=e.target.closest('[data-ab-row]');if(listDrag===null||!row)return;e.preventDefault();const to=+row.dataset.abRow;if(to!==listDrag)mutate({op:'order',index:listDrag,to});listDrag=null;});
  boardList.addEventListener('dragend',()=>{listDrag=null;});
  let active=false,index=0,items=[],scale=1,offset={x:35,y:45},drawing=false,drag=null,space=false,urls=new Map(),observer,revision=-1;
  function setDrawing(v){drawing=v;host.classList.toggle('draw-board',v);host.querySelector('[data-board=draw]').setAttribute('aria-pressed',String(v));}
  function revoke(){observer?.disconnect();for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
  function close(){unitHome.append(unitLabel);active=false;drag=null;space=false;setDrawing(false);revoke();host.hidden=inspector.hidden=true;document.body.classList.remove('board-overview');for(const b of [toggle,quick])b.setAttribute('aria-pressed','false');}
  function placement(){plane.style.transform='translate('+offset.x+'px,'+offset.y+'px) scale('+scale+')';plane.style.setProperty('--inverse',1/scale);}
  function fit(){
    if(!items.length)return;const x=Math.min(...items.map(b=>b.x)),y=Math.min(...items.map(b=>b.y)),w=Math.max(...items.map(b=>b.x+b.w))-x,h=Math.max(...items.map(b=>b.y+b.h))-y;
    scale=Math.max(.001,Math.min(32,(field.clientWidth-58)/w,(field.clientHeight-86)/h));offset={x:(field.clientWidth-w*scale)/2-x*scale,y:(field.clientHeight-h*scale)/2-y*scale+6};placement();
  }
  function controls(){
    const b=items[index];if(!b)return;
    for(const panel of [host,inspector])for(const btn of panel.querySelectorAll('[data-board]'))btn.disabled=btn.dataset.board==='delete'&&items.length<2||btn.dataset.board==='earlier'&&!index||btn.dataset.board==='later'&&index===items.length-1;
    $('artName').value=b.name;for(const k of ['x','y','w','h'])$('art'+k.toUpperCase()).value=formatBoardMeasurement(b[k],boardUnitFactor(b.unit,b.ppi));for(const s of inspector.querySelectorAll('[data-ab-unit]'))s.textContent=b.unit;
    for(const row of boardList.querySelectorAll('[data-ab-row]'))row.setAttribute('aria-pressed',String(+row.dataset.abRow===index));
    for(const el of plane.querySelectorAll('.board-tile'))el.classList.toggle('active',+el.dataset.index===index);
  }
  function box(el,b){Object.assign(el.style,{left:b.x+'px',top:b.y+'px',width:b.w+'px',height:b.h+'px'});}
  function sync(force=false){
    unitPicker.value=currentBoardUnit();toggle.disabled=quick.disabled=!doc();if(!doc()){if(active)close();return;}if(!active||(!force&&revision===state.version))return;
    revision=state.version;index=doc().page;items=VectorBrowser.artboards();observer?.disconnect();
    const tokens=new Set(items.map(b=>b.token));for(const [k,url] of urls)if(!tokens.has(k)){URL.revokeObjectURL(url);urls.delete(k);}
    plane.replaceChildren();observer=new IntersectionObserver(entries=>{for(const ent of entries){if(!ent.isIntersecting)continue;const el=ent.target,b=items[+el.dataset.index];if(!b||!el.isConnected)continue;
      if(!urls.has(b.token))urls.set(b.token,URL.createObjectURL(VectorBrowser.artPreview(b.index)));el.querySelector('img').src=urls.get(b.token);observer.unobserve(el);}}, {root:field,rootMargin:'100px'});
    for(const b of items){const el=document.createElement('div');el.className='board-tile';el.dataset.index=b.index;box(el,b);const label=document.createElement('span');label.className='board-caption';label.textContent=String(b.index+1).padStart(2,'0')+' · '+b.name;const img=new Image();img.alt=b.name;img.draggable=false;const art=document.createElement('div');art.className='board-art';art.append(img);el.append(art,label);
      for(const dir of ['nw','ne','sw','se']){const h=document.createElement('i');h.dataset.abCorner=dir;el.append(h);}plane.append(el);observer.observe(el);}
    boardList.lastChild.replaceChildren(...items.map(b=>{const row=document.createElement('button');row.dataset.abRow=b.index;row.draggable=true;row.textContent=(b.index+1)+' · '+b.name;row.onclick=()=>select(b.index);return row;}));
    controls();placement();$('message').textContent='双击画板编辑内容';
  }
  function open(){if(!doc()){boardDialog('blank');return;}if(!allowLeave())return;
    run('正在打开画板工具…',async()=>{if(layoutSteps.length)await commitLayout();active=true;inspector.querySelector('form').before(unitLabel);host.hidden=inspector.hidden=false;document.body.classList.add('board-overview');for(const b of [toggle,quick])b.setAttribute('aria-pressed','true');panel();sync(true);fit();field.focus();},'inline');}
  function mutate(a){return run('正在更新画板…',async()=>{await api('boards',{index,...a});sync(true);},'inline');}
  function select(i){index=i;controls();if(i!==doc().page)return run('正在选择画板…',()=>api('page',{page:i}),'inline');}
  toggle.onclick=quick.onclick=()=>active?close():open();
  function command(cmd){if(working||!active)return;
    if(cmd==='larger'||cmd==='smaller'){const k=cmd==='larger'?1.25:.8,next=Math.max(.001,Math.min(40,scale*k)),ratio=next/scale;offset={x:field.clientWidth/2+(offset.x-field.clientWidth/2)*ratio,y:field.clientHeight/2+(offset.y-field.clientHeight/2)*ratio};scale=next;placement();return;}
    if(cmd==='edit'){close();return;}if(cmd==='fit'){fit();return;}if(cmd==='draw'){setDrawing(!drawing);return;}
    if(cmd==='delete'&&!confirm('删除本画板及其内容？此操作可撤销。'))return;
    if(cmd==='earlier'||cmd==='later')mutate({op:'order',to:index+(cmd==='earlier'?-1:1)});
    else if(cmd==='arrange')mutate({op:'arrange'}).then(fit);else mutate({op:cmd==='copy'?'duplicate':'delete'});}
  for(const h of [host,inspector])h.addEventListener('click',e=>{const k=e.target.closest('[data-board]')?.dataset.board;if(k)command(k);});
  inspector.querySelector('form').onsubmit=e=>{e.preventDefault();const unit=boardUnitFactor(items[index].unit,items[index].ppi),a={op:'change',name:$('artName').value};for(const k of ['x','y','w','h']){const v=$('art'+k.toUpperCase()).valueAsNumber;if(v!==formatBoardMeasurement(items[index][k],unit))a[k]=v*unit;}mutate(a);};
  function point(e){const r=field.getBoundingClientRect();return {x:(e.clientX-r.x-offset.x)/scale,y:(e.clientY-r.y-offset.y)/scale};}
  field.onwheel=e=>{e.preventDefault();if(drag)return;const p=point(e),old=scale;scale=Math.max(.001,Math.min(40,old*Math.exp(-e.deltaY*.002)));offset.x+=p.x*(old-scale);offset.y+=p.y*(old-scale);placement();};
  field.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
  field.onpointerdown=e=>{if(working||drag||e.button>1)return;field.focus();const tile=e.target.closest('.board-tile'),p=point(e),pan=e.button===1||space||(!tile&&!drawing);
    if(tile&&!drawing&&!pan){index=+tile.dataset.index;controls();}
    drag={id:e.pointerId,p,sx:e.clientX,sy:e.clientY,offset:{...offset},b:{...items[index]},pan,corner:e.target.dataset.abCorner,draw:drawing&&!pan,copy:e.altKey&&!e.target.dataset.abCorner,el:tile};field.setPointerCapture(e.pointerId);
    if(drag.draw||drag.copy&&!pan){drag.el=document.createElement('div');drag.el.className='board-tile board-ghost';plane.append(drag.el);if(drag.copy)box(drag.el,drag.b);}
    e.preventDefault();};
  field.onpointermove=e=>{const d=drag;if(!d||e.pointerId!==d.id)return;const p=point(e),dx=p.x-d.p.x,dy=p.y-d.p.y,b=d.b;
    if(d.pan){offset={x:d.offset.x+e.clientX-d.sx,y:d.offset.y+e.clientY-d.sy};placement();return;}
    if(d.draw)d.next={x:Math.min(d.p.x,p.x),y:Math.min(d.p.y,p.y),w:Math.max(.01,Math.abs(dx)),h:Math.max(.01,Math.abs(dy))};
    else if(d.corner){const left=d.corner.includes('w'),top=d.corner.includes('n'),w=Math.min(2000,Math.max(.1,b.w+(left?-dx:dx))),h=Math.min(2000,Math.max(.1,b.h+(top?-dy:dy)));d.next={x:left?b.x+b.w-w:b.x,y:top?b.y+b.h-h:b.y,w,h};}
    else d.next={...b,x:b.x+dx,y:b.y+dy};
    box(d.el,d.next);if(d.corner){const img=d.el.querySelector('img');Object.assign(img.style,{width:b.w+'px',height:b.h+'px',transform:'translate('+(b.x-d.next.x)+'px,'+(b.y-d.next.y)+'px)'});}};
  field.onpointerup=e=>{const d=drag;if(!d||d.id!==e.pointerId)return;drag=null;if(d.pan)return;const moved=Math.hypot(e.clientX-d.sx,e.clientY-d.sy)>3;
    if(d.draw||d.copy)d.el.remove();
    if(d.draw){setDrawing(false);mutate({op:'add',...(moved?d.next:{x:d.p.x,y:d.p.y,w:d.b.w,h:d.b.h})});}
    else if(moved&&d.next){const {x,y,w,h}=d.next;mutate({op:d.copy?'duplicate':'change',x,y,w,h,keepArtwork:!!d.corner});}
    else{if(d.el&&!d.copy)box(d.el,d.b);select(index);if(e.detail>1)close();}};
  function cancel(){if(!drag)return;if(drag.draw||drag.copy&&!drag.pan)drag.el?.remove();else if(!drag.pan&&drag.el){box(drag.el,drag.b);drag.el.querySelector('img')?.removeAttribute('style');}drag=null;}
  field.onpointercancel=cancel;field.ondblclick=()=>{if(!drawing)close();};
  document.addEventListener('keydown',e=>{if(e.isComposing||e.target.closest('input,textarea,select,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
    if(e.shiftKey&&e.key.toLowerCase()==='o'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();if(!working)(active?close:open)();return;}
    if(!active||e.key==='F2')return;
    if(e.code==='Space'){space=true;e.preventDefault();}else if(e.key==='Escape'){cancel();if(drawing)setDrawing(false);else close();}else if(e.key==='Delete'){command('delete');}else if(e.key==='Enter'){close();}else if((e.ctrlKey||e.metaKey)&&e.key==='0'){e.preventDefault();fit();}
    else if((e.ctrlKey||e.metaKey)&&['z','s'].includes(e.key.toLowerCase()))return;
    e.stopImmediatePropagation();
  },true);
  window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;cancel();});
  window.ArtboardUI={sync};sync();
})();

/* Page navigation beside the artboard. Keep a small raster cache and decode only
   previews near the scroll window, including pages that have never been opened. */
(() => {
  const host=document.querySelector('.canvas-wrap');
  const dock=document.createElement('nav');
  dock.id='pageDock';dock.hidden=true;dock.setAttribute('aria-label','画布旁的页面缩略图');
  dock.title='滚轮浏览缩略图，Shift + 滚轮切换页面';
  const strip=document.createElement('div');strip.className='page-dock-strip';dock.append(strip);host.append(dock);

  const entries=[],cache=new Map(),visible=new Set();
  const mobile=matchMedia('(max-width:700px)'),reduced=matchMedia('(prefers-reduced-motion:reduce)');
  let active=-1,loading=false,scheduled=false,draftTimer=0,draftVersion=0,draftRequested=false,switchedAt=-Infinity;

  function tile(i){
    const button=document.createElement('button'),card=document.createElement('span'),frame=document.createElement('span'),number=document.createElement('span');
    button.type='button';button.className='page-dock-item';button.dataset.index=i;
    card.className='page-dock-card';frame.className='page-dock-frame';number.className='page-dock-number';
    frame.setAttribute('aria-hidden','true');number.setAttribute('aria-hidden','true');
    card.append(frame,number);button.append(card);strip.append(button);observer.observe(button);
    return {button,frame,number,board:null,painted:null,failed:false};
  }
  function bitmap(image,b){
    const c=document.createElement('canvas'),scale=Math.min(136/b.w,108/b.h);
    c.width=Math.max(1,Math.round(b.w*scale));c.height=Math.max(1,Math.round(b.h*scale));
    const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
    return c;
  }
  function show(entry,c){if(entry.painted!==c){entry.frame.replaceChildren(c);entry.painted=c;}}
  function forget(entry){entry.frame.replaceChildren();entry.painted=null;}
  async function load(entry){
    const b=entry.board,token=b.token;
    const art=$('art'),useCurrent=b.index===active&&art.complete&&art.naturalWidth&&art.getAttribute('src')===doc()?.preview;
    let url;
    try{
      const img=useCurrent?art:new Image();
      if(!useCurrent){url=URL.createObjectURL(VectorBrowser.artPreview(b.index));img.src=url;await img.decode();}
      if(entry.board?.token!==token||!entry.button.isConnected||dock.hidden)return;
      const c=bitmap(img,b);cache.set(token,c);
      for(const key of cache.keys()){if(cache.size<=48)break;if(![...visible].some(e=>entries[+e.dataset.index]?.board?.token===key))cache.delete(key);}
      if(!thumbs.has(b.index)&&thumbs.size<48){
        const url=c.toDataURL();thumbs.set(b.index,url);const tile=$('pages').querySelector('[data-page="'+b.index+'"] .page-thumb');
        if(tile&&!tile.querySelector('img')){const img=new Image();img.alt='';img.src=url;tile.replaceChildren(img);}
      }
      if(visible.has(entry.button)&&(!entry.painted||!layoutSteps.length||b.index!==active))show(entry,c);
    }catch{if(entry.board?.token===token)entry.failed=true;}finally{if(url)URL.revokeObjectURL(url);}
  }
  function queue(){
    if(loading||scheduled||dock.hidden)return;scheduled=true;
    requestAnimationFrame(async()=>{
      scheduled=false;if(loading||dock.hidden)return;
      const targets=[...visible].map(b=>entries[+b.dataset.index]).filter(e=>e?.board);
      targets.sort((a,b)=>Math.abs(a.board.index-active)-Math.abs(b.board.index-active));
      for(const entry of targets){
        const cached=cache.get(entry.board.token);
        if(cached){if(!entry.painted)show(entry,cached);continue;}
        if(entry.failed)continue;
        loading=true;try{await load(entry);}finally{loading=false;queue();}return;
      }
    });
  }
  const observer=new IntersectionObserver(changes=>{
    for(const change of changes){
      const b=change.target,e=entries[+b.dataset.index];if(!e||e.button!==b)continue;
      if(change.isIntersecting){e.failed=false;visible.add(b);if(e.board?.index===active&&layoutSteps.length)draftChanged();}
      else{visible.delete(b);forget(e);}
    }
    queue();
  },{root:strip,rootMargin:'28px'});

  function reveal(i,animate=true){
    const entry=entries[i];if(!entry||dock.hidden)return;
    const b=entry.button.getBoundingClientRect(),s=strip.getBoundingClientRect(),horizontal=mobile.matches;
    const start=horizontal?b.left-s.left:b.top-s.top,end=horizontal?b.right-s.right:b.bottom-s.bottom;
    const delta=start<4?start-4:end>-4?end+4:0;
    if(delta)strip.scrollBy({[horizontal?'left':'top']:delta,behavior:animate&&!reduced.matches?'smooth':'instant'});
  }
  function sync(boards,index){
    const enabled=boards.length>1;
    dock.hidden=!enabled;host.classList.toggle('has-page-dock',enabled);
    if(!enabled){
      if(!entries.length)return;
      clearTimeout(draftTimer);draftVersion++;
      observer.disconnect();visible.clear();cache.clear();entries.length=0;strip.replaceChildren();active=-1;return;
    }
    const previous=active;active=index;
    while(entries.length>boards.length){const e=entries.pop();observer.unobserve(e.button);visible.delete(e.button);e.button.remove();}
    const valid=new Set();
    for(const b of boards){
      let e=entries[b.index];if(!e){e=tile(b.index);entries.push(e);}
      valid.add(b.token);
      if(e.board?.token!==b.token){forget(e);e.failed=false;}
      if(e.board?.token!==b.token||e.board.name!==b.name){
        e.button.title='第 '+(b.index+1)+' 页 · '+b.name;e.button.setAttribute('aria-label',e.button.title);
        e.number.textContent=String(b.index+1).padStart(2,'0');
        const fit=Math.min(52/b.w,42/b.h);
        e.frame.style.width=Math.max(3,b.w*fit)+'px';e.frame.style.height=Math.max(3,b.h*fit)+'px';
      }
      e.board=b;
      if(b.index===active)e.button.setAttribute('aria-current','page');else e.button.removeAttribute('aria-current');
    }
    for(const key of cache.keys())if(!valid.has(key))cache.delete(key);
    if(previous!==active){clearTimeout(draftTimer);draftVersion++;requestAnimationFrame(()=>reveal(active,previous>=0));}
    if(!layoutSteps.length&&entries[active]?.painted&&cache.has(entries[active].board.token)&&visible.has(entries[active].button))show(entries[active],cache.get(entries[active].board.token));
    queue();
  }

  // Keep transforms and typing on the main canvas independent of thumbnail work.
  function draftChanged(){
    clearTimeout(draftTimer);const version=++draftVersion;
    if(!layoutSteps.length||dock.hidden||active<0)return;
    const e=entries[active];if(!e||!visible.has(e.button))return;
    const token=e.board.token,valid=()=>version===draftVersion&&entries[active]===e&&e.board.token===token&&visible.has(e.button)&&!dock.hidden&&layoutSteps.length;
    draftTimer=setTimeout(async()=>{
      if(!valid())return;
      if(working||drag||pan||window.CanvasType?.active||draftRequested){draftChanged();return;}
      draftRequested=true;
      try{const im=await BoardSampler.snapshot(valid,{width:136,height:108});
        if(im&&valid())show(e,bitmap(im,e.board));
      }catch{/* The committed thumbnail remains available while a draft is being prepared. */}
      finally{draftRequested=false;}
    },800);
  }

  async function go(i,keyboard=false){
    if(working||!doc()||!entries[i]||i===doc().page||!allowLeave())return;
    await run('正在切换画板…',()=>api('page',{page:i}),'inline');
    if(keyboard&&doc()?.page===i)entries[i]?.button.focus({preventScroll:true});
  }
  strip.addEventListener('click',e=>{const item=e.target.closest('.page-dock-item');if(item)go(+item.dataset.index);});
  strip.addEventListener('keydown',e=>{
    const item=e.target.closest('.page-dock-item');if(!item)return;const i=+item.dataset.index;
    if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat)go(i,true);return;}
    const keys={ArrowUp:i-1,ArrowLeft:i-1,ArrowDown:i+1,ArrowRight:i+1,Home:0,End:entries.length-1};
    if(!(e.key in keys))return;e.preventDefault();e.stopPropagation();go(Math.max(0,Math.min(entries.length-1,keys[e.key])),true);
  });
  strip.addEventListener('wheel',e=>{
    e.stopPropagation();e.preventDefault();const horizontal=mobile.matches;
    const raw=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!raw)return;
    if(e.shiftKey){if(performance.now()-switchedAt>260&&!working){switchedAt=performance.now();go(active+Math.sign(raw));}return;}
    const amount=raw*(e.deltaMode===1?16:e.deltaMode===2?(horizontal?strip.clientWidth:strip.clientHeight):1);
    if(horizontal)strip.scrollLeft+=amount;else strip.scrollTop+=amount;
  },{passive:false});
  new ResizeObserver(()=>{if(strip.clientWidth&&strip.clientHeight)requestAnimationFrame(()=>reveal(active,false));}).observe(strip);
  window.PageDock={sync,draftChanged};sync(VectorBrowser.artboards(),doc()?.page);
})();

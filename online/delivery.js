/* Export scopes are resolved after pending edits have been committed. */
const VectorDelivery=(()=>{
  const M=VectorModel,images=new Set(['png','jpg']);
  function safeName(name){
    const clean=Array.from(String(name||'').replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'-').trim()).slice(0,96).join('').replace(/[. ]+$/,'');
    return !clean?'未命名':/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)?'_'+clean:clean;
  }
  function visualBox(page,el){
    const root=M.box(page,el),bounds={...root};
    for(const n of [el,...el.querySelectorAll('text,rect,path,ellipse,circle,polygon,polyline,line,image')]){
      if(n.closest('defs,clipPath,mask,marker,pattern')||n!==el&&el.dataset.kind==='mask')continue;
      const b=n===el?root:M.box(page,n),style=getComputedStyle(n),mat=M.world(page,n);
      const factor=VectorStroke.pos(n)==='inside'?0:VectorStroke.pos(n)==='outside'?1:.5;
      const stroke=style.stroke==='none'?0:(n.hasAttribute('data-edge-width')?Number(n.dataset.edgeWidth):parseFloat(style.strokeWidth)||0)*factor;
      const sx=Math.hypot(mat.a,mat.c)*stroke,sy=Math.hypot(mat.b,mat.d)*stroke,s=VectorEffects.read(n)?.shadow,blur=(s?.blur||0)*3.5;
      const left=b.x-sx+Math.min(0,(s?.x||0)-blur),top=b.y-sy+Math.min(0,(s?.y||0)-blur);
      const right=Math.max(bounds.x+bounds.w,b.x+b.w+sx+Math.max(0,(s?.x||0)+blur)),bottom=Math.max(bounds.y+bounds.h,b.y+b.h+sy+Math.max(0,(s?.y||0)+blur));
      bounds.x=Math.min(bounds.x,left);bounds.y=Math.min(bounds.y,top);bounds.w=right-bounds.x;bounds.h=bottom-bounds.y;
    }return bounds;
  }
  function isolate(page,id){
    M.mount(page);const el=M.find(page,id);if(!el)throw Error('请重新选择要导出的元素。');
    const b=visualBox(page,el),out=M.board(b.w,b.h,page.dataset.boardUnit||'mm');if(page.dataset.psdResolution)out.dataset.psdResolution=page.dataset.psdResolution;
    const name=el.dataset.name||el.dataset.text?.slice(0,36)||M.names[el.dataset.kind]||'元素';out.dataset.boardName=name;
    let branch=el.cloneNode(true);
    for(let parent=el.parentElement;parent!==page;parent=parent.parentElement){const shell=parent.cloneNode(false);shell.append(branch);branch=shell;}
    const group=M.make('g',{transform:'translate('+(-b.x)+' '+(-b.y)+')'});group.append(branch);out.append(group);
    const defs=M.make('defs');out.prepend(defs);for(const style of page.querySelectorAll('style'))out.prepend(style.cloneNode(true));
    const handled=new Set();
    function dependencies(node){for(const n of [node,...node.querySelectorAll('*')])for(const attr of n.attributes){
      const refs=[...attr.value.matchAll(/url\(\s*["']?#([^)"'\s]+)["']?\s*\)/g)].map(m=>m[1]);
      if(attr.localName==='href'&&attr.value.startsWith('#'))refs.push(attr.value.slice(1));
      for(const ref of refs){if(handled.has(ref))continue;handled.add(ref);if(out.getElementById(ref))continue;
        const original=page.getElementById(ref);if(original){const cp=original.cloneNode(true);defs.append(cp);dependencies(cp);}}
    }}dependencies(branch);return out;
  }
  async function project(pages,index){
    const json=new Blob(['{"format":"vector-workbench","version":1,"active":'+index+',"pages":[',...pages.flatMap((p,i)=>[i?',':'',JSON.stringify(M.xml(p))]),']}'],{type:'application/json'});
    return new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  }
  async function openProject(file,parse){
    const j=await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).json();
    if(j.format!=='vector-workbench'||j.version!==1||!Array.isArray(j.pages)||!j.pages.length||!j.pages.every(s=>typeof s==='string'))throw Error('无法识别这份工作台工程。');
    const pages=j.pages.map(s=>parse(s,true));M.resumeSerial(pages);for(const page of pages){await VectorFonts.hydrate(page);VectorParagraphs.prepare(page);}
    pages.active=Number.isInteger(j.active)&&j.active>=0&&j.active<pages.length?j.active:0;return pages;
  }
  function dimensions(page,factor){const vb=page.viewBox.baseVal,ppi=+page.dataset.psdResolution||96;return [vb.width,vb.height].map(n=>Math.max(1,Math.round(n*ppi/25.4*factor)));}
  async function raster(page,fmt,factor,canvasOf){
    const [w,h]=dimensions(page,factor);if(w*h>64e6||Math.max(w,h)>32767)throw Error('导出图片尺寸超出浏览器容量，请降低倍率。');
    VectorEffects.refresh(page);VectorStroke.refresh(page);const c=await canvasOf(page,w,h),ctx=c.getContext('2d');
    const bg=Number(page.dataset.psdBackground||3);
    if(fmt==='jpg'||bg!==3){const color=JSON.parse(page.dataset.psdColor||'{}');ctx.globalCompositeOperation='destination-over';ctx.fillStyle=bg===2?'#000':bg===4?'rgb('+[color.r||0,color.g||0,color.b||0]+')':'#fff';ctx.fillRect(0,0,w,h);}
    try{return await new Promise((ok,no)=>c.toBlob(blob=>blob?ok(blob):no(Error('图片编码失败。')),fmt==='jpg'?'image/jpeg':'image/png',.94));}finally{c.width=c.height=1;}
  }
  async function output(pages,idx,filename,request){
    const {format:fmt,range,elementId}=request,all=range==='all',single=range==='element';if(!['all','current','element'].includes(range))throw Error('请选择导出范围。');
    const selected=single?[isolate(pages[idx],elementId)]:all?pages:[pages[idx]];
    const labels=Artboards.list(pages),stem=safeName(filename.replace(/\.[^.]+$/,'')),name=single?safeName(selected[0].dataset.boardName):all?stem:safeName(labels[idx].name);
    const factor=Number(request.factor||1);if(![1,2,3].includes(factor))throw Error('图片倍率无效。');
    if(fmt==='vqproj')return {blob:await project(selected,all?idx:0),name:name+'.vqproj'};
    const batch=images.has(fmt)&&selected.length>1;
    if(images.has(fmt)){
      if(!batch)return {blob:await raster(selected[0],fmt,factor,VectorFormats.canvasOf),name:name+'.'+fmt};
      await VectorFormats.loadLibrary('fflate');const entries={};
      for(const [i,page] of selected.entries()){$('busyText').textContent='正在生成图片 '+(i+1)+' / '+selected.length+' · '+labels[i].name;const blob=await raster(page,fmt,factor,VectorFormats.canvasOf);entries[String(i+1).padStart(String(selected.length).length<2?2:String(selected.length).length,'0')+'-'+safeName(labels[i].name)+'.'+fmt]=new Uint8Array(await blob.arrayBuffer());}
      $('busyText').textContent='正在打包 '+selected.length+' 张图片…';return {blob:new Blob([fflate.zipSync(entries,{level:0})],{type:'application/zip'}),name:stem+'-'+selected.length+'张画板.zip'};
    }
    if(all&&['svg','eps'].includes(fmt)&&selected.length>1)throw Error('此格式一次导出一个画板。');
    const code=fmt==='psd'&&all&&selected.length>1?'psd-all':fmt;
    const blob=await VectorFormats.output(selected,all?idx:0,code,single?null:request.original);
    return {blob,name:name+'-编辑版.'+(fmt==='ai-kit'?'zip':fmt)};
  }
  return {output,openProject};
})();

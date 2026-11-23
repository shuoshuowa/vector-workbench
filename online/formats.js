(() => {
'use strict';
const M=VectorModel,PT=M.PT;
const loadCache=new Map();
function lib(name){if(!loadCache.has(name))loadCache.set(name,new Promise((ok,fail)=>{const s=document.createElement('script');s.src='/lib/'+name+'.js';s.onload=ok;s.onerror=()=>{loadCache.delete(name);fail(Error('格式组件加载失败，请重试。'));};document.head.append(s);}));return loadCache.get(name);}
const dataURL=file=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
const image=url=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(Error('图片解码失败'));im.src=url;});
function postscript(bytes,to){return new Promise((ok,no)=>{const w=new Worker('/postscript-worker.js'),stop=()=>{clearTimeout(timer);w.terminate();},timer=setTimeout(()=>{stop();no(Error('PostScript 转换超过三分钟。'));},180000);
  w.onerror=()=>{stop();no(Error('无法运行 PostScript 转换器。'));};w.onmessage=({data})=>{stop();if(data.error)no(Error(data.error));else ok(new Uint8Array(data.bytes));};w.postMessage({bytes,to});});}
async function pdfPages(buffer,ai=false){
  await Promise.all([lib('pdf'),lib('fontkit')]);pdfjsLib.GlobalWorkerOptions.workerSrc='/lib/pdf.worker.js';
  const task=pdfjsLib.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,isOffscreenCanvasSupported:false,fontExtraProperties:true,enableXfa:false,cMapUrl:'/lib/cmaps/',cMapPacked:true,standardFontDataUrl:'/lib/standard_fonts/',useSystemFonts:true});
  let pdf;try{pdf=await task.promise;const pages=[],recordsByPage=[],allCodes=new Map();
    const attachments=await pdf.getAttachments(),project=attachments?.['vector-workbench.json'];
    if(project){const obj=JSON.parse(new TextDecoder().decode(project.content));if(obj.version===1&&Array.isArray(obj.pages)&&obj.pages.length===pdf.numPages){
      await lib('purify');const restored=obj.pages.map(s=>svgPage(s,true));M.resumeSerial(restored);for(const root of restored){root.rebuildPdfText=!obj.pdfTextVersion&&root.dataset.sourcePage===undefined;await VectorFonts.hydrate(root);VectorParagraphs.prepare(root);}return restored;}}
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:1}),root=M.board(vp.width*PT,vp.height*PT,preferredBoardUnit());
      const renderer=new pdfjsLib.SVGGraphics(p.commonObjs,p.objs,true);renderer.embedFonts=true;
      const embed=renderer.addFontStyle;renderer.addFontStyle=function(font){if(font.data?.length)embed.call(this,font);};
      const sourceFonts=VectorFonts.capture(renderer);
      const operators=await p.getOperatorList();if(operators.fnArray.some((op,j)=>op===pdfjsLib.OPS.setGState&&operators.argsArray[j][0]?.some?.(([key,val])=>key==='SMask'&&val||key==='BM'&&val!=='source-over')))root.dataset.effects='1';
      const svg=await renderer.getSVG(operators,vp),group=M.make('g',{transform:'scale('+PT+')'});
      group.append(...svg.childNodes);root.append(group);recordsByPage.push(sourceFonts);for(const [id,record] of sourceFonts){if(!allCodes.has(id))allCodes.set(id,new Map());for(const [cp,glyph] of record.codes)allCodes.get(id).set(cp,glyph);}for(const t of root.querySelectorAll('text')){const spans=[...t.querySelectorAll('tspan')];t.dataset.text=spans.map(n=>n.dataset.unicode??n.textContent).join('');if(!t.dataset.text.trim())t.remove();}pages.push(root);
    }for(const [i,root] of pages.entries()){for(const [id,r] of recordsByPage[i])r.codes=allCodes.get(id);await VectorFonts.materialize(root,recordsByPage[i]);VectorParagraphs.prepare(root);VectorShapeFills.importSvg(M.classify(root));}
    const labels=await pdf.getPageLabels();if(labels)pages.forEach((p,i)=>{if(labels[i])p.dataset.boardName=labels[i];});
    if(ai)try{await ArtboardFormats.readAI(buffer,pages,lib);}catch{/* PDF-compatible pages remain usable when native layout metadata is unavailable. */}
    return pages;
  }finally{await task.destroy();}
}
function svgPage(s,project=false){
  const raw=M.parse(s);
  // Sanitize untrusted SVG before inserting it anywhere with access to the document.
  const embeddedFonts=[];
  for(const style of raw.querySelectorAll('style'))for(const m of style.textContent.matchAll(/@font-face\s*\{\s*font-family:\s*"([\w-]+)";\s*src:\s*url\((data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+)\);?\s*\}/g))embeddedFonts.push('@font-face{font-family:"'+m[1]+'";src:url('+m[2]+');}');
  const declarations=['fill','stroke','stroke-width','letter-spacing','font-size','font-family','font-weight','font-style','opacity','display','clip-path','fill-rule','stroke-linecap','stroke-linejoin','text-anchor','stop-color','stop-opacity'];
  for(const el of raw.querySelectorAll('[style]'))for(const key of declarations){const value=el.style.getPropertyValue(key);if(value)el.setAttribute(key,value);}
  const safe=DOMPurify.sanitize(M.xml(raw),{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['style','a','use-external','foreignObject','animate','set','animateTransform','animateMotion','image-script'],FORBID_ATTR:['style'],ALLOW_DATA_ATTR:project,ADD_ATTR:['data-psd-clip-stack','data-psd-clipped','data-psd-base','data-psd-paint','data-psd-alpha','data-corner-radii','data-stroke-position','data-stroke-ink','data-edge-width','data-text-align','data-psd-point','data-paragraph-width','data-paragraph-height','data-paragraph-x','data-paragraph-y','data-line-advance','data-tracking','data-leading','data-text','data-unicode','data-original-font','data-edit-family','data-vq-fx','data-solid-fill'],ADD_DATA_URI_TAGS:['image']});
  const page=M.parse(safe);
  for(const el of [page,...page.querySelectorAll('*')])for(const a of [...el.attributes]){
    if(a.localName==='href'&&!a.value.startsWith('#')&&!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(a.value))el.removeAttributeNode(a);
    else if(/url\(/i.test(a.value)&&!/^(?:url\(#[\w:.-]+\))$/.test(a.value))el.removeAttributeNode(a);
  }
  if(embeddedFonts.length){const style=M.make('style');style.textContent=embeddedFonts.join('\n');page.prepend(style);}
  if(project){if(!(page.viewBox.baseVal.width>0&&page.viewBox.baseVal.height>0))throw Error('内嵌画板尺寸无效。');return page;}
  const vb=Artboards.viewBox(page);
  const mm=(value,def)=>{const m=/^([\d.+-]+)(mm|cm|in|pt|px)?$/.exec(value||'');return m?Number(m[1])*({mm:1,cm:10,in:25.4,pt:PT,px:25.4/96}[m[2]||'px']):def;};
  const w=mm(page.getAttribute('width'),vb.width*25.4/96||210),h=mm(page.getAttribute('height'),vb.height*25.4/96||297);
  if(!(w>0&&h>0))throw Error('SVG 画板尺寸无效。');
  const declared=page.getAttribute('width')?.match(/(mm|cm|in|pt|px)$/)?.[1];const root=M.board(w,h,declared||'px'),g=M.make('g',{transform:'scale('+(w/(vb.width||w*96/25.4))+' '+(h/(vb.height||h*96/25.4))+') translate('+(-vb.x)+' '+(-vb.y)+')'});g.append(...page.childNodes);root.append(g);return VectorShapeFills.importSvg(M.classify(root));
}
async function psdPage(bytes){await lib('psd');const psd=agPsd.readPsd(bytes,{skipLinkedFilesData:true,skipThumbnail:true}),resolution=psd.imageResources?.resolutionInfo?.horizontalResolution||72,mm=25.4/resolution;
  const preferred=boardPreference('vq-board-unit','px'),unit=validBoardUnit(preferred)?preferred:'px',ns='https://vector.zhangshuo.work/ns/artboards/1.0/';let ox=0,oy=0;
  if(psd.imageResources?.xmpMetadata){const xml=new DOMParser().parseFromString(psd.imageResources.xmpMetadata,'application/xml'),tag=xml.getElementsByTagNameNS('http://www.w3.org/1999/02/22-rdf-syntax-ns#','Description')[0];if(tag?.hasAttributeNS(ns,'originX')){const x=Number(tag.getAttributeNS(ns,'originX')),y=Number(tag.getAttributeNS(ns,'originY'));if(Number.isFinite(x)&&Number.isFinite(y)){ox=x;oy=y;}}}
  function layers(list,par){
    // ag-psd lists siblings from bottom to top. Even a hidden base ends the previous chain.
    for(let i=0;i<(list?.length||0);){
      const base=list[i++],start=i;
      while(i<list.length&&list[i].clipping)i++;
      if(base.hidden||base.clipping)continue;
      const el=layerNode(base);if(!el)continue;
      const members=list.slice(start,i).filter(l=>!l.hidden).map(layerNode).filter(Boolean);
      if(!members.length){par.append(el);continue;}
      const stack=M.make('g',{'data-psd-clip-stack':'1'}),defs=M.make('defs');
      if(!el.dataset.vq)M.mark(el,'group',base.name);
      // Layer opacity applies to the composited clipping group.
      if(el.hasAttribute('opacity')){stack.setAttribute('opacity',el.getAttribute('opacity'));el.removeAttribute('opacity');}
      el.id ||= 'psdBase'+crypto.randomUUID();
      const geometry=el.matches('rect,path,circle,ellipse,polygon')&&!el.hasAttribute('mask')&&!el.dataset.rasterGradient&&
        !base.vectorFill?.opacityStops?.some(stop=>stop.opacity<1);
      const id='psdClip'+crypto.randomUUID(),ref=M.make('use',{href:'#'+el.id});
      const rule=geometry?M.make('clipPath',{id,clipPathUnits:'userSpaceOnUse'}):M.make('mask',{id,'mask-type':'alpha','data-psd-alpha':'1'});
      const paint=M.make('g',{'data-psd-paint':'1'}),baseWrap=M.make('g',{'data-psd-base':'1'});
      rule.append(ref);defs.append(rule);stack.append(defs,paint);paint.append(baseWrap);baseWrap.append(el);
      if(!geometry){
        // Composite all clipped layers first, then apply the base alpha exactly once.
        paint.setAttribute('mask','url(#'+id+')');
        const filter=M.make('filter',{id:id+'Opaque'}),transfer=M.make('feComponentTransfer');
        transfer.append(M.make('feFuncA',{type:'linear',slope:0,intercept:1}));filter.append(transfer);defs.append(filter);
        baseWrap.setAttribute('filter','url(#'+filter.id+')');
      }
      for(const member of members){
        if(!member.dataset.vq)M.mark(member,'group',member.dataset.layer);
        const wrap=M.make('g',{'data-psd-clipped':'1'});
        if(geometry)wrap.setAttribute('clip-path','url(#'+id+')');
        wrap.append(member);paint.append(wrap);
      }
      par.append(stack);
    }
  }
  function layerNode(l){let el;
    if(l.children){el=M.make('g',{'data-layer':l.name});layers(l.children,el);}
    else if(l.vectorFill&&(el=VectorShapeFills.importLayer(l,resolution))){/* Editable Photoshop fill and Bézier mask. */}
    else if(l.text?.text&&(!l.text.styleRuns||l.text.styleRuns.length<=1)){
      const tx=l.text,st={...tx.style,...tx.styleRuns?.[0]?.style},para={...tx.paragraphStyle,...tx.paragraphStyleRuns?.[0]?.style},align=VectorParagraphs.alignment(para.justification),c=st.fillColor||{},size=st.fontSize||tx.style?.fontSize||16;
      const m=tx.transform||[1,0,0,1,l.left||0,(l.top||0)+size];
      el=M.mark(M.make('text',{transform:'matrix('+m.join(' ')+')','font-size':size,'font-family':st.font?.name||'sans-serif',fill:'rgb('+[c.r||0,c.g||0,c.b||0].join(',')+')'}),'text');
      if(st.font?.name){el.dataset.originalFont=st.font.name;el.style.fontWeight=String(st.fauxBold?700:VectorFonts.styleWeight(st.font.name));el.style.fontStyle=st.fauxItalic?'italic':VectorFonts.italicStyle(st.font.name);}
      el.dataset.text=tx.text.replace(/\r\n?/g,'\n');
      if(tx.shapeType==='box'&&tx.boxBounds?.length===4){
        const [left,top,right,bottom]=tx.boxBounds,flow={x:left,y:top+.86*size,width:Math.max(.01,right-left),height:Math.max(0,bottom-top),align,leading:para.autoLeading||1.2,advance:st.autoLeading===false?st.leading||0:0,spacing:(st.tracking||0)*size/1000};
        VectorParagraphs.store(el,flow);VectorParagraphs.render(el,el.dataset.text,flow,size,st.font?.name||'sans-serif',el.style.fontWeight,el.style.fontStyle);
      }else{
        const [x,y]=tx.pointBase||[0,0],leading=para.autoLeading||1.2,advance=st.autoLeading===false&&st.leading>0?st.leading:0,spacing=(st.tracking||0)*size/1000;
        const width=(tx.bounds?.right?.value??0)-(tx.bounds?.left?.value??0);
        el.dataset.psdPoint='1';el.style.letterSpacing=spacing+'px';el.setAttribute('xml:space','preserve');
        let offset=0,runIndex=0,runEnd=tx.paragraphStyleRuns?.[0]?.length||Infinity;
        el.dataset.text.split('\n').forEach((line,i)=>{
          while(offset>=runEnd&&runIndex+1<(tx.paragraphStyleRuns?.length||0))runEnd+=tx.paragraphStyleRuns[++runIndex].length;
          const lineAlign=tx.paragraphStyleRuns?.[runIndex]?.style?.justification||para.justification;
          const sp=M.make('tspan',{x,y:y+i*(advance||leading*size),'text-anchor':VectorParagraphs.anchor(lineAlign),'data-line':'1'});sp.textContent=line;el.append(sp);offset+=line.length+1;
        });
        if(width>0)VectorParagraphs.store(el,{x:x-width*VectorParagraphs.fraction(align),y,width,leading,advance,spacing,align});
      }
    }else if(l.canvas){el=M.mark(M.make('image',{x:l.left||0,y:l.top||0,width:l.canvas.width,height:l.canvas.height,href:l.canvas.toDataURL()}),'image',l.name);}
    if(el){if(l.opacity!=null)el.setAttribute('opacity',l.opacity);const fx=VectorEffects.fromPsd(l,mm);if(fx?.gradient&&el.localName==='image')el=VectorEffects.rasterGradient(el,l.fillOpacity??1);const border=l.effects?.stroke?.find(s=>s.enabled!==false&&s.fillType==='color');if(border&&(el.localName==='text'||el.dataset.kind==='image')){if(el.dataset.kind==='image')el=VectorStroke.wrapBitmap(el);const c=border.color||{};const m=el.transform.baseVal.consolidate()?.matrix,scale=m?Math.hypot(m.c,m.d)||1:1;const ink='#'+[c.r,c.g,c.b].map(v=>Math.round(v||0).toString(16).padStart(2,'0')).join('');VectorStroke.store(el,border.position||'center',ink,(border.size?.value??1)/scale);}if(fx&&el.dataset.vq){el.dataset.vqFx=JSON.stringify({...VectorEffects.read(el),...fx});el.dataset.solidFill=el.dataset.solidFill||el.getAttribute('fill')||'#000000';}}
    return el;
  }
  function pageFor(list,r,name,board){
    const p=M.board((r.right-r.left)*mm,(r.bottom-r.top)*mm,unit),g=M.make('g',{transform:'scale('+mm+') translate('+(-r.left)+' '+(-r.top)+')'});p.append(g);layers(list,g);
    for(const el of p.querySelectorAll('text[data-original-font]'))VectorFonts.include(p,{name:el.dataset.originalFont});
    if(name)Artboards.set(p,{x:r.left*mm+ox,y:r.top*mm+oy,name});p.dataset.psdResolution=resolution;
    if(board){p.dataset.psdBackground=board.backgroundType??1;if(board.color)p.dataset.psdColor=JSON.stringify(board.color);}
    return p;
  }
  const art=[],extra=[];
  function collect(list){for(const layer of list||[]){if(layer.artboard?.rect){const r=layer.artboard.rect;if(r.right>r.left&&r.bottom>r.top)art.push(pageFor(layer.children,r,layer.name||'画板 '+(art.length+1),layer.artboard));}
    else if(layer.children?.some(function contains(c){return !!c.artboard||c.children?.some(contains);} ))collect(layer.children);else extra.push(layer);}}
  collect(psd.children);art.reverse();
  const whole={left:0,top:0,right:psd.width,bottom:psd.height};
  if(art.length){if(extra.some(layer=>!layer.hidden&&!layer.clipping))art.push(pageFor(extra,whole,'画板外图层'));return art;}
  const p=pageFor(psd.children,whole);if(!M.drawables(p).length&&psd.canvas)p.lastElementChild.append(M.mark(M.make('image',{width:psd.width,height:psd.height,href:psd.canvas.toDataURL()}),'image'));return [p];
}
async function open(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(['png','jpg','jpeg'].includes(ext)){const url=await dataURL(new Blob([file],{type:ext==='png'?'image/png':'image/jpeg'})),pic=await image(url),w=pic.naturalWidth*25.4/96,h=pic.naturalHeight*25.4/96;
    const page=M.board(w,h,'px');page.dataset.boardName=file.name.replace(/\.[^.]+$/,'');page.append(M.mark(M.make('image',{x:0,y:0,width:w,height:h,href:url}),'image',file.name));return [page];}
  if(ext==='vqproj'){await lib('purify');return VectorDelivery.openProject(file,svgPage);}if(ext==='svg'){await lib('purify');const root=svgPage(await file.text());await VectorFonts.hydrate(root);return [root];}
  const bytes=new Uint8Array(await file.arrayBuffer());if(ext==='psd')return psdPage(bytes);
  const signature=new TextDecoder().decode(bytes.subarray(0,1024));if(signature.includes('%PDF-'))return pdfPages(bytes,ext==='ai');
  if(ext==='eps'||signature.includes('%!PS'))return pdfPages(await postscript(bytes,'pdf'));
  throw Error('这份 AI 没有可读取的 PDF 或 PostScript 内容。请使用创建时勾选“创建 PDF 兼容文件”的 AI，或打开 PDF、EPS。');
}
let defaultFont,localFonts=[];
async function fonts(){if(window.queryLocalFonts)try{localFonts=await queryLocalFonts();VectorFonts.rememberLocal(localFonts);}catch{}
  return localFonts.length?localFonts.map(f=>({id:f.postscriptName,label:f.fullName,family:f.family,style:f.style})):
    ['Arial','Georgia','Times New Roman','Microsoft YaHei','SimSun','sans-serif','serif'].map(f=>({id:f,label:f,family:f,style:'常规'}));}
async function pdfAlphaStacks(root,copy){
  const groups=[...root.querySelectorAll('[data-psd-clip-stack]')];
  if(!groups.length)return;
  M.mount(root);
  for(const group of groups){
    const mask=group.querySelector(':scope > defs > mask[data-psd-alpha]');if(!mask)continue;
    const dest=copy.getElementById(mask.id)?.closest('[data-psd-clip-stack]');if(!dest)continue;
    const paint=group.querySelector(':scope > [data-psd-paint]'),b=(paint.querySelector(':scope > [data-psd-base]')||paint).getBBox();
    if(!(b.width>0&&b.height>0)){dest.remove();continue;}
    const m=M.world(root,group),scale=(+root.dataset.psdResolution||144)/25.4;
    const width=Math.max(1,b.width*Math.hypot(m.a,m.b)*scale),height=Math.max(1,b.height*Math.hypot(m.c,m.d)*scale);
    const factor=Math.min(1,Math.sqrt(16e6/(width*height)),16384/Math.max(width,height));
    const attrs={x:b.x,y:b.y,width:b.width,height:b.height},svg=M.make('svg',{width:b.width,height:b.height,viewBox:[b.x,b.y,b.width,b.height].join(' ')});
    for(const def of root.querySelectorAll('defs,style'))if(!group.contains(def)&&!def.parentElement?.closest('defs'))svg.append(def.cloneNode(true));
    const content=group.cloneNode(true);content.removeAttribute('transform');svg.append(content);
    const canvas=await canvasOf(svg,Math.max(1,Math.round(width*factor)),Math.max(1,Math.round(height*factor)));
    dest.replaceWith(M.make('image',{...attrs,transform:group.getAttribute('transform'),preserveAspectRatio:'none',href:canvas.toDataURL()}));
    canvas.width=1;
  }
}
async function pdfOut(pages,withProject=true,kitMarkers){
  if(!localFonts.length&&window.queryLocalFonts)try{if((await navigator.permissions.query({name:'local-fonts'})).state==='granted')await fonts();}catch{}
  await Promise.all([lib('pdfkit'),lib('svg-to-pdf')]);defaultFont ||= fetch('/lib/fallback.ttf').then(r=>{if(!r.ok)throw Error('中文字体加载失败。');return r.arrayBuffer();});
  const doc=new PDFDocument({autoFirstPage:false,compress:true}),font=await defaultFont;
  doc.registerFont('VQDefault',font);
  if(withProject)doc._root.data.PageLabels={Nums:Artboards.list(pages).flatMap((b,i)=>[i,{P:new String(b.name)}])};
  const pieces=[],done=new Promise((ok,no)=>{doc.on('data',p=>pieces.push(p));doc.on('end',()=>ok(new Blob(pieces,{type:'application/pdf'})));doc.on('error',no);});
  for(const root of pages){const vb=Artboards.viewBox(root),w=vb.width/PT,h=vb.height/PT;doc.addPage({size:[w,h],margin:0});
    VectorEffects.refresh(root);VectorStroke.refresh(root);const copy=root.cloneNode(true);await VectorEffects.pdf(root,copy,canvasOf,kitMarkers?.get(root));copy.setAttribute('width',w);copy.setAttribute('height',h);copy.setAttribute('overflow','visible');
    const registered=new Set(),styles=new Map();
    for(const css of copy.querySelectorAll('style')){for(const m of css.textContent.matchAll(/font-family:\s*["']?([\w-]+)["']?;?\s*src:\s*url\(["']?data:[^,]+,([a-zA-Z0-9+/=]+)/g)){try{const u=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));doc.registerFont(m[1],u.buffer);doc.font(m[1]);registered.add(m[1]);}catch{}}}
    await VectorFonts.exportRuns(copy,doc,registered,styles);
    for(const span of copy.querySelectorAll('tspan[data-unicode]'))if(span.dataset.unicode!==span.textContent){span.textContent=span.dataset.unicode;span.setAttribute('font-family','sans-serif');span.style.fontFamily='sans-serif';}
    for(const e of copy.querySelectorAll('text,tspan')){const family=(e.style.fontFamily||e.getAttribute('font-family')||'').replace(/["']/g,'');const local=localFonts.find(f=>f.postscriptName===family||f.family===family);if(local&&!registered.has(family))try{doc.registerFont(family,await(await local.blob()).arrayBuffer());doc.font(family);registered.add(family);}catch{}}
    await VectorStroke.pdf(root,copy,canvasOf);await pdfAlphaStacks(root,copy);
    SVGtoPDF(doc,M.xml(copy),0,0,{width:w,height:h,assumePt:true,fontCallback:(name,bold,italic,options)=>{const f=name?.replace(/["']/g,'');const cut=styles.get(f);options.fauxBold=bold&&(cut?.weight??400)<600;options.fauxItalic=italic&&cut?.italic!=='italic';return registered.has(f)?f:'VQDefault';},warningCallback:()=>{}});
  }if(withProject){const sourceBytes=new TextEncoder().encode(JSON.stringify({version:1,pdfTextVersion:2,pages:pages.map(M.xml)}));doc.file(sourceBytes.buffer,{name:'vector-workbench.json',type:'application/json',description:'可编辑画板'});}doc.end();return done;
}
async function canvasOf(page,w,h){const url=URL.createObjectURL(new Blob([M.xml(page)],{type:'image/svg+xml'}));try{const img=await image(url),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);return canvas;}finally{URL.revokeObjectURL(url);}}
async function psdLayers(page,ppi){await lib('psd');M.mount(page);const vb=Artboards.viewBox(page),scale=ppi/25.4,w=Math.max(1,Math.round(vb.width*scale)),h=Math.max(1,Math.round(vb.height*scale));
  if(w*h>60e6||w>30000||h>30000)throw Error('该画板超出浏览器 PSD 导出的尺寸范围。');
  const children=[],items=M.drawables(page).filter(e=>!e.parentElement.closest('[data-vq]'));
  let lastStack=null;
  for(const e of items){
    const wrap=e.parentElement,clipped=wrap.hasAttribute('data-psd-clipped');
    const stack=clipped||wrap.hasAttribute('data-psd-base')?wrap.closest('[data-psd-clip-stack]'):null;
    const nativeClip=!!stack&&clipped&&stack===lastStack,work=page.cloneNode(true);
    if(stack&&(!clipped||nativeClip)){
      const raw=M.find(work,M.id(e)).parentElement;
      raw.removeAttribute('clip-path');raw.removeAttribute('filter');
      raw.parentElement.removeAttribute('mask');raw.closest('[data-psd-clip-stack]').removeAttribute('opacity');
    }
    for(const n of M.drawables(work))if(n.dataset.vq!==e.dataset.vq&&!n.closest('[data-vq="'+e.dataset.vq+'"]')&&!n.querySelector('[data-vq="'+e.dataset.vq+'"]'))n.remove();
    const vector=VectorShapeFills.exportRect(page,e,ppi),style=VectorEffects.psdStyle(e,work,ppi,!!vector);
    const canvas=await canvasOf(work,w,h),b=M.box(page,e),x=Math.max(0,Math.floor(b.x*scale)-3),y=Math.max(0,Math.floor(b.y*scale)-3),right=Math.min(w,Math.ceil((b.x+b.w)*scale)+3),bottom=Math.min(h,Math.ceil((b.y+b.h)*scale)+3);if(right<=x||bottom<=y)continue;
    const crop=document.createElement('canvas');crop.width=right-x;crop.height=bottom-y;crop.getContext('2d').drawImage(canvas,-x,-y);canvas.width=1;
    const layer={name:e.dataset.name||e.textContent.slice(0,35)||M.names[e.dataset.kind],left:x,top:y,canvas:crop,...style,...vector};
    if(e.dataset.kind==='text'){const s=getComputedStyle(e.querySelector('tspan')||e),matrix=M.world(page,e),size=parseFloat(s.fontSize)||12,pos=e.getNumberOfChars()?e.getStartPositionOfChar(0):new DOMPoint(0,0),pt=new DOMPoint(pos.x,pos.y).matrixTransform(matrix);
      const ink=e.dataset.solidFill||s.fill,hex=/^#([0-9a-f]{6})$/i.exec(ink),rgb=hex?[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)):(ink.match(/\d+/g)||[0,0,0]).map(Number);layer.text={text:e.dataset.text??e.textContent,transform:[matrix.a*scale,matrix.b*scale,matrix.c*scale,matrix.d*scale,pt.x*scale,pt.y*scale],style:{font:{name:e.dataset.originalFont||s.fontFamily.replace(/["']/g,'').split(',')[0]},fontSize:size,fillColor:{r:rgb[0],g:rgb[1],b:rgb[2]}}};}
    if(layer.text&&e.dataset.paragraphWidth){
      const f=VectorParagraphs.info(e),size=layer.text.style.fontSize,top=-.86*size;
      const mat=M.world(page,e),point=e.dataset.psdPoint==='1'&&!f.height&&[...e.querySelectorAll('tspan[data-line]')].map(s=>s.textContent).join('\n')===layer.text.text;
      const base=new DOMPoint(f.x+(point?f.width*VectorParagraphs.fraction(f.align):0),f.y).matrixTransform(mat);
      layer.text.transform[4]=base.x*scale;layer.text.transform[5]=base.y*scale;layer.text.paragraphStyle={justification:f.align||'left',autoLeading:f.leading};
      const n=Math.max(1,e.querySelectorAll('tspan').length),height=f.height||size+(n-1)*(f.advance||size*f.leading);
      if(point){layer.text.shapeType='point';layer.text.pointBase=[0,0];}else{layer.text.shapeType='box';layer.text.boxBounds=[0,top,f.width,top+height+.001];}layer.text.style.autoLeading=false;
      layer.text.style.leading=f.advance||f.leading*size;layer.text.style.tracking=Math.round((f.spacing||0)/size*1000);
    }
    if(nativeClip)layer.clipping=true;
    if(!clipped&&stack?.hasAttribute('opacity')){
      layer.opacity=Number(stack.getAttribute('opacity'));
    }
    children.push(layer);lastStack=clipped&&!nativeClip?null:stack;
  }
  const canvas=await canvasOf(page,w,h);return {width:w,height:h,canvas,children,imageResources:{resolutionInfo:{horizontalResolution:ppi,verticalResolution:ppi,horizontalResolutionUnit:'PPI',verticalResolutionUnit:'PPI',widthUnit:'Inches',heightUnit:'Inches'}}};
}
async function psdOut(pages,all){
  const ppi=Number(pages[0].dataset.psdResolution)||(pages[0].dataset.boardUnit==='px'?96:144),scale=ppi/25.4;
  if(!all){const psd=await psdLayers(pages[0],ppi);return new Blob([agPsd.writePsd(psd)],{type:'image/vnd.adobe.photoshop'});}
  const layout=Artboards.list(pages),xs=layout.map(b=>Math.round(b.x*scale)),ys=layout.map(b=>Math.round(b.y*scale)),ox=Math.min(...xs),oy=Math.min(...ys);
  const w=Math.max(...layout.map((b,i)=>xs[i]-ox+Math.max(1,Math.round(b.w*scale)))),h=Math.max(...layout.map((b,i)=>ys[i]-oy+Math.max(1,Math.round(b.h*scale))));
  if(w*h>60e6||w>30000||h>30000)throw Error('画板总范围超出 PSD 浏览器导出上限，请先自动排列缩小间隔。');
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d'),groups=[];let imageResources;
  for(let i=pages.length-1;i>=0;i--){const page=pages[i];
    const d=await psdLayers(page,ppi),x=xs[i]-ox,y=ys[i]-oy;imageResources=d.imageResources;
    for(const l of d.children){l.left+=x;l.top+=y;VectorShapeFills.offsetPsd(l,x,y);if(l.text){l.text.transform[4]+=x;l.text.transform[5]+=y;}}
    const backgroundType=+(page.dataset.psdBackground||1),color=JSON.parse(page.dataset.psdColor||'{"r":255,"g":255,"b":255}');
    if(backgroundType!==3){ctx.fillStyle=backgroundType===2?'black':backgroundType===4?'rgb('+[color.r||0,color.g||0,color.b||0].join(',')+')':'white';ctx.fillRect(x,y,d.width,d.height);}
    ctx.drawImage(d.canvas,x,y);groups.push({name:layout[i].name,opened:true,children:d.children,artboard:{rect:{left:x,top:y,right:x+d.width,bottom:y+d.height},backgroundType,color}});
  }
  imageResources.xmpMetadata='<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:vq="https://vector.zhangshuo.work/ns/artboards/1.0/" vq:originX="'+(ox/scale)+'" vq:originY="'+(oy/scale)+'"/></rdf:RDF></x:xmpmeta>';
  return new Blob([agPsd.writePsd({width:w,height:h,canvas,children:groups,imageResources,artboards:{count:groups.length,autoExpandEnabled:true,autoNestEnabled:true}})],{type:'image/vnd.adobe.photoshop'});
}
async function preservedPdf(pages,original,forceNew=false,kitMarkers){
  if(!original)return pdfOut(pages,true,kitMarkers);
  const clean=pages.map(p=>p.dataset.sourcePage===undefined?null:Number(p.dataset.sourcePage));
  if(clean.every(i=>i===null))return pdfOut(pages,true,kitMarkers);
  await lib('pdf-lib');const base=await PDFLib.PDFDocument.load(await original.arrayBuffer(),{updateMetadata:false});
  if(!forceNew&&/\.pdf$/i.test(original.name)&&clean.length===base.getPageCount()&&clean.every((n,i)=>n===i)&&pages.every(p=>!p.dataset.unitChanged&&!p.dataset.layoutEdited))return original;
  // Illustrator's private data may describe every artboard of the old file. A new
  // mixed-page PDF must open its current visible content, including the edited pages.
  const pieceKey=PDFLib.PDFName.of('PieceInfo'),aiKey=PDFLib.PDFName.of('Illustrator');
  for(const page of base.getPages()){const info=page.node.lookupMaybe(pieceKey,PDFLib.PDFDict);if(info?.has(aiKey)){info.delete(aiKey);if(!info.keys().length)page.node.delete(pieceKey);}}
  const target=await PDFLib.PDFDocument.create();target.catalog.set(PDFLib.PDFName.of('PageLabels'),target.context.obj({Nums:Artboards.list(pages).flatMap((b,i)=>[i,{P:PDFLib.PDFHexString.fromText(b.name)}])}));const changed=pages.filter((_,i)=>clean[i]===null);
  const edits=changed.length?await PDFLib.PDFDocument.load(await(await pdfOut(changed,false,kitMarkers)).arrayBuffer()):null;
  let edited=0;for(const n of clean){const [page]=await target.copyPages(n===null?edits:base,[n===null?edited++:n]);target.addPage(page);}
  await target.attach(new TextEncoder().encode(JSON.stringify({version:1,pdfTextVersion:2,pages:pages.map(M.xml)})),'vector-workbench.json',{mimeType:'application/json',description:'Editable vector workbench pages'});
  return new Blob([await target.save()],{type:'application/pdf'});
}
async function output(pages,idx,fmt,original){if(fmt==='svg'){const svg=pages[idx].cloneNode(true),unit=validBoardUnit(svg.dataset.boardUnit)?svg.dataset.boardUnit:'mm';const bounds=Artboards.viewBox(pages[idx]);for(const key of ['width','height'])svg.setAttribute(key,Number((bounds[key]/boardUnits[unit]).toFixed(10))+unit);return new Blob([M.xml(svg)],{type:'image/svg+xml'});}if(fmt==='psd')return psdOut([pages[idx]],false);if(fmt==='psd-all')return psdOut(pages,true);if(fmt==='ai-kit')return ArtboardFormats.kit(pages,marks=>preservedPdf(pages,original,true,marks),lib);if(fmt==='eps')return new Blob([await postscript(await(await pdfOut([pages[idx]])).arrayBuffer(),'eps')],{type:'application/postscript'});if(fmt==='pdf')return preservedPdf(pages,original);throw Error('请选择有效的导出格式。');}
window.VectorFormats={open,output,canvasOf,loadLibrary:lib,fonts,image,dataURL,loadFontReader:()=>lib('fontkit')};
})();

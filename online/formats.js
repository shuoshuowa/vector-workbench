(() => {
'use strict';
const M=VectorModel,PT=M.PT;
const loadCache=new Map();
function lib(name){if(!loadCache.has(name))loadCache.set(name,new Promise((ok,fail)=>{const s=document.createElement('script');s.src='/lib/'+name+'.js';s.onload=ok;s.onerror=()=>{loadCache.delete(name);fail(Error('格式组件加载失败，请重试。'));};document.head.append(s);}));return loadCache.get(name);}
const dataURL=file=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});
const image=url=>new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(Error('图片解码失败'));im.src=url;});
function postscript(bytes,to){return new Promise((ok,no)=>{const w=new Worker('/postscript-worker.js'),stop=()=>{clearTimeout(timer);w.terminate();},timer=setTimeout(()=>{stop();no(Error('PostScript 转换超过三分钟。'));},180000);
  w.onerror=()=>{stop();no(Error('无法运行 PostScript 转换器。'));};w.onmessage=({data})=>{stop();if(data.error)no(Error(data.error));else ok(new Uint8Array(data.bytes));};w.postMessage({bytes,to});});}
async function pdfPages(buffer){
  await Promise.all([lib('pdf'),lib('fontkit')]);pdfjsLib.GlobalWorkerOptions.workerSrc='/lib/pdf.worker.js';
  const task=pdfjsLib.getDocument({data:new Uint8Array(buffer),isEvalSupported:false,isOffscreenCanvasSupported:false,fontExtraProperties:true,enableXfa:false,cMapUrl:'/lib/cmaps/',cMapPacked:true,standardFontDataUrl:'/lib/standard_fonts/',useSystemFonts:true});
  let pdf;try{pdf=await task.promise;const pages=[],recordsByPage=[],allCodes=new Map();
    const attachments=await pdf.getAttachments(),project=attachments?.['vector-workbench.json'];
    if(project){const obj=JSON.parse(new TextDecoder().decode(project.content));if(obj.version===1&&Array.isArray(obj.pages)&&obj.pages.length===pdf.numPages){
      await lib('purify');const restored=obj.pages.map(s=>svgPage(s,true));M.resumeSerial(restored);for(const root of restored){root.rebuildPdfText=!obj.pdfTextVersion&&root.dataset.sourcePage===undefined;await VectorFonts.hydrate(root);VectorParagraphs.prepare(root);}return restored;}}
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),vp=p.getViewport({scale:1}),root=M.board(vp.width*PT,vp.height*PT);
      const renderer=new pdfjsLib.SVGGraphics(p.commonObjs,p.objs,true);renderer.embedFonts=true;
      const embed=renderer.addFontStyle;renderer.addFontStyle=function(font){if(font.data?.length)embed.call(this,font);};
      const sourceFonts=VectorFonts.capture(renderer);
      const operators=await p.getOperatorList();if(operators.fnArray.some((op,j)=>op===pdfjsLib.OPS.setGState&&operators.argsArray[j][0]?.some?.(([key,val])=>key==='SMask'&&val||key==='BM'&&val!=='source-over')))root.dataset.effects='1';
      const svg=await renderer.getSVG(operators,vp),group=M.make('g',{transform:'scale('+PT+')'});
      group.append(...svg.childNodes);root.append(group);recordsByPage.push(sourceFonts);for(const [id,record] of sourceFonts){if(!allCodes.has(id))allCodes.set(id,new Map());for(const [cp,glyph] of record.codes)allCodes.get(id).set(cp,glyph);}for(const t of root.querySelectorAll('text')){const spans=[...t.querySelectorAll('tspan')];t.dataset.text=spans.map(n=>n.dataset.unicode??n.textContent).join('');if(!t.dataset.text.trim())t.remove();}pages.push(root);
    }for(const [i,root] of pages.entries()){for(const [id,r] of recordsByPage[i])r.codes=allCodes.get(id);await VectorFonts.materialize(root,recordsByPage[i]);VectorParagraphs.prepare(root);M.classify(root);}return pages;
  }finally{await task.destroy();}
}
function svgPage(s,project=false){
  const raw=M.parse(s);
  // Sanitize untrusted SVG before inserting it anywhere with access to the document.
  const embeddedFonts=[];
  for(const style of raw.querySelectorAll('style'))for(const m of style.textContent.matchAll(/@font-face\s*\{\s*font-family:\s*"([\w-]+)";\s*src:\s*url\((data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+)\);?\s*\}/g))embeddedFonts.push('@font-face{font-family:"'+m[1]+'";src:url('+m[2]+');}');
  const declarations=['fill','stroke','stroke-width','letter-spacing','font-size','font-family','font-weight','font-style','opacity','display','clip-path','fill-rule','stroke-linecap','stroke-linejoin','text-anchor'];
  for(const el of raw.querySelectorAll('[style]'))for(const key of declarations){const value=el.style.getPropertyValue(key);if(value)el.setAttribute(key,value);}
  const safe=DOMPurify.sanitize(M.xml(raw),{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['style','a','use-external','foreignObject','animate','set','animateTransform','animateMotion','image-script'],FORBID_ATTR:['style'],ALLOW_DATA_ATTR:project,ADD_ATTR:['data-paragraph-width','data-paragraph-height','data-paragraph-x','data-paragraph-y','data-line-advance','data-tracking','data-leading','data-text','data-unicode','data-original-font','data-edit-family'],ADD_DATA_URI_TAGS:['image']});
  const page=M.parse(safe);
  for(const el of [page,...page.querySelectorAll('*')])for(const a of [...el.attributes]){
    if(a.localName==='href'&&!a.value.startsWith('#')&&!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(a.value))el.removeAttributeNode(a);
    else if(/url\(/i.test(a.value)&&!/^(?:url\(#[\w:.-]+\))$/.test(a.value))el.removeAttributeNode(a);
  }
  if(embeddedFonts.length){const style=M.make('style');style.textContent=embeddedFonts.join('\n');page.prepend(style);}
  if(project){if(!(page.viewBox.baseVal.width>0&&page.viewBox.baseVal.height>0))throw Error('内嵌画板尺寸无效。');return page;}
  const vb=page.viewBox.baseVal;
  const mm=(value,def)=>{const m=/^([\d.+-]+)(mm|cm|in|pt|px)?$/.exec(value||'');return m?Number(m[1])*({mm:1,cm:10,in:25.4,pt:PT,px:25.4/96}[m[2]||'px']):def;};
  const w=mm(page.getAttribute('width'),vb.width*25.4/96||210),h=mm(page.getAttribute('height'),vb.height*25.4/96||297);
  if(!(w>0&&h>0))throw Error('SVG 画板尺寸无效。');
  const declared=page.getAttribute('width')?.match(/(mm|cm|in|pt|px)$/)?.[1];const root=M.board(w,h,declared||'mm'),g=M.make('g',{transform:'scale('+(w/(vb.width||w*96/25.4))+' '+(h/(vb.height||h*96/25.4))+') translate('+(-vb.x)+' '+(-vb.y)+')'});g.append(...page.childNodes);root.append(g);return M.classify(root);
}
async function psdPage(bytes){await lib('psd');const psd=agPsd.readPsd(bytes),resolution=psd.imageResources?.resolutionInfo?.horizontalResolution||72,mm=25.4/resolution;
  const root=M.board(psd.width*mm,psd.height*mm,Math.abs(resolution-96)<.001?'px':'mm'),g=M.make('g',{transform:'scale('+mm+')'});root.append(g);
  function layers(list,par){for(const l of list||[]){if(l.hidden)continue;let el;
    if(l.children){el=M.make('g',{'data-layer':l.name});layers(l.children,el);}
    else if(l.text?.text&&(!l.text.styleRuns||l.text.styleRuns.length<=1)){
      const tx=l.text,st=tx.styleRuns?.[0]?.style||tx.style||{},c=st.fillColor||{},size=st.fontSize||tx.style?.fontSize||16;
      const m=tx.transform||[1,0,0,1,l.left||0,(l.top||0)+size];
      el=M.mark(M.make('text',{transform:'matrix('+m.join(' ')+')','font-size':size,'font-family':st.font?.name||'sans-serif',fill:'rgb('+[c.r||0,c.g||0,c.b||0].join(',')+')'}),'text');
      if(st.font?.name)el.dataset.originalFont=st.font.name;
      el.dataset.text=tx.text.replace(/\r\n?/g,'\n');
      if(tx.shapeType==='box'&&tx.boxBounds?.length===4){
        const [left,top,right,bottom]=tx.boxBounds,flow={x:left,y:top+.86*size,width:Math.max(.01,right-left),height:Math.max(0,bottom-top),leading:1.2,advance:st.autoLeading===false?st.leading||0:0,spacing:(st.tracking||0)*size/1000};
        VectorParagraphs.store(el,flow);VectorParagraphs.render(el,el.dataset.text,flow,size,st.font?.name||'sans-serif');
      }else el.dataset.text.split('\n').forEach((s,i)=>{const sp=M.make('tspan',{x:0,y:i*size*1.2,'data-line':'1'});sp.textContent=s;el.append(sp);});
    }else if(l.canvas){el=M.mark(M.make('image',{x:l.left||0,y:l.top||0,width:l.canvas.width,height:l.canvas.height,href:l.canvas.toDataURL()}),'image',l.name);}
    if(el){if(l.opacity!=null)el.setAttribute('opacity',l.opacity);par.append(el);}
  }}
  layers(psd.children,g);if(!g.childElementCount&&psd.canvas)g.append(M.mark(M.make('image',{width:psd.width,height:psd.height,href:psd.canvas.toDataURL()}),'image'));return root;
}
async function open(file){
  const ext=file.name.split('.').pop().toLowerCase();if(ext==='svg'){await lib('purify');const root=svgPage(await file.text());await VectorFonts.hydrate(root);return [root];}
  const bytes=new Uint8Array(await file.arrayBuffer());if(ext==='psd')return [await psdPage(bytes)];
  const signature=new TextDecoder().decode(bytes.subarray(0,1024));if(signature.includes('%PDF-'))return pdfPages(bytes);
  if(ext==='eps'||signature.includes('%!PS'))return pdfPages(await postscript(bytes,'pdf'));
  throw Error('这份 AI 没有可读取的 PDF 或 PostScript 内容。请使用创建时勾选“创建 PDF 兼容文件”的 AI，或打开 PDF、EPS。');
}
let defaultFont,localFonts=[];
async function fonts(){if(window.queryLocalFonts)try{localFonts=await queryLocalFonts();VectorFonts.rememberLocal(localFonts);}catch{}
  return localFonts.length?localFonts.map(f=>({id:f.postscriptName,label:f.fullName,family:f.family,style:f.style})):
    ['Arial','Georgia','Times New Roman','Microsoft YaHei','SimSun','sans-serif','serif'].map(f=>({id:f,label:f,family:f,style:'常规'}));}
async function pdfOut(pages,withProject=true){
  if(!localFonts.length&&window.queryLocalFonts)try{if((await navigator.permissions.query({name:'local-fonts'})).state==='granted')await fonts();}catch{}
  await Promise.all([lib('pdfkit'),lib('svg-to-pdf')]);defaultFont ||= fetch('/lib/fallback.ttf').then(r=>{if(!r.ok)throw Error('中文字体加载失败。');return r.arrayBuffer();});
  const doc=new PDFDocument({autoFirstPage:false,compress:true}),font=await defaultFont;
  doc.registerFont('VQDefault',font);
  const pieces=[],done=new Promise((ok,no)=>{doc.on('data',p=>pieces.push(p));doc.on('end',()=>ok(new Blob(pieces,{type:'application/pdf'})));doc.on('error',no);});
  for(const root of pages){const vb=root.viewBox.baseVal,w=vb.width/PT,h=vb.height/PT;doc.addPage({size:[w,h],margin:0});
    const copy=root.cloneNode(true);copy.setAttribute('width',w);copy.setAttribute('height',h);copy.setAttribute('overflow','visible');
    const registered=new Set(),styles=new Map();
    for(const css of copy.querySelectorAll('style')){for(const m of css.textContent.matchAll(/font-family:\s*["']?([\w-]+)["']?;?\s*src:\s*url\(["']?data:[^,]+,([a-zA-Z0-9+/=]+)/g)){try{const u=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));doc.registerFont(m[1],u.buffer);doc.font(m[1]);registered.add(m[1]);}catch{}}}
    await VectorFonts.exportRuns(copy,doc,registered,styles);
    for(const span of copy.querySelectorAll('tspan[data-unicode]'))if(span.dataset.unicode!==span.textContent){span.textContent=span.dataset.unicode;span.setAttribute('font-family','sans-serif');span.style.fontFamily='sans-serif';}
    for(const e of copy.querySelectorAll('text,tspan')){const family=(e.style.fontFamily||e.getAttribute('font-family')||'').replace(/["']/g,'');const local=localFonts.find(f=>f.postscriptName===family||f.family===family);if(local&&!registered.has(family))try{doc.registerFont(family,await(await local.blob()).arrayBuffer());doc.font(family);registered.add(family);}catch{}}
    SVGtoPDF(doc,M.xml(copy),0,0,{width:w,height:h,assumePt:true,fontCallback:(name,bold,italic,options)=>{const f=name?.replace(/["']/g,'');const cut=styles.get(f);options.fauxBold=bold&&(cut?.weight??400)<600;options.fauxItalic=italic&&cut?.italic!=='italic';return registered.has(f)?f:'VQDefault';},warningCallback:()=>{}});
  }if(withProject){const sourceBytes=new TextEncoder().encode(JSON.stringify({version:1,pdfTextVersion:2,pages:pages.map(M.xml)}));doc.file(sourceBytes.buffer,{name:'vector-workbench.json',type:'application/json',description:'可编辑画板'});}doc.end();return done;
}
async function canvasOf(page,w,h){const url=URL.createObjectURL(new Blob([M.xml(page)],{type:'image/svg+xml'}));try{const img=await image(url),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(img,0,0,w,h);return canvas;}finally{URL.revokeObjectURL(url);}}
async function psdOut(page){await lib('psd');M.mount(page);const vb=page.viewBox.baseVal,ppi=page.dataset.boardUnit==='px'?96:144,scale=ppi/25.4,w=Math.max(1,Math.round(vb.width*scale)),h=Math.max(1,Math.round(vb.height*scale));
  if(w*h>60e6||w>30000||h>30000)throw Error('该画板超出浏览器 PSD 导出的尺寸范围。');
  const children=[],items=M.drawables(page).filter(e=>!e.parentElement.closest('[data-vq]'));
  for(const e of items){const work=page.cloneNode(true);for(const n of M.drawables(work))if(n.dataset.vq!==e.dataset.vq&&!n.closest('[data-vq="'+e.dataset.vq+'"]')&&!n.querySelector('[data-vq="'+e.dataset.vq+'"]'))n.remove();
    const canvas=await canvasOf(work,w,h),b=M.box(page,e),x=Math.max(0,Math.floor(b.x*scale)-3),y=Math.max(0,Math.floor(b.y*scale)-3),right=Math.min(w,Math.ceil((b.x+b.w)*scale)+3),bottom=Math.min(h,Math.ceil((b.y+b.h)*scale)+3);if(right<=x||bottom<=y)continue;
    const crop=document.createElement('canvas');crop.width=right-x;crop.height=bottom-y;crop.getContext('2d').drawImage(canvas,-x,-y);canvas.width=1;
    const layer={name:e.dataset.name||e.textContent.slice(0,35)||M.names[e.dataset.kind],left:x,top:y,canvas:crop};
    if(e.dataset.kind==='text'){const s=getComputedStyle(e.querySelector('tspan')||e),matrix=M.world(page,e),size=parseFloat(s.fontSize)||12,pos=e.getNumberOfChars()?e.getStartPositionOfChar(0):new DOMPoint(0,0),pt=new DOMPoint(pos.x,pos.y).matrixTransform(matrix);
      const rgb=(s.fill.match(/\d+/g)||[0,0,0]).map(Number);layer.text={text:e.dataset.text??e.textContent,transform:[matrix.a*scale,matrix.b*scale,matrix.c*scale,matrix.d*scale,pt.x*scale,pt.y*scale],style:{font:{name:e.dataset.originalFont||s.fontFamily.replace(/["']/g,'').split(',')[0]},fontSize:size,fillColor:{r:rgb[0],g:rgb[1],b:rgb[2]}}};}
    if(layer.text&&e.dataset.paragraphWidth){
      const f=VectorParagraphs.info(e),size=layer.text.style.fontSize,top=-.86*size;
      const n=Math.max(1,e.querySelectorAll('tspan').length),height=f.height||size+(n-1)*(f.advance||size*f.leading);
      layer.text.shapeType='box';layer.text.boxBounds=[0,top,f.width,top+height+.001];layer.text.style.autoLeading=false;
      layer.text.style.leading=f.advance||f.leading*size;layer.text.style.tracking=Math.round((f.spacing||0)/size*1000);
    }children.push(layer);
  }
  const canvas=await canvasOf(page,w,h);return new Blob([agPsd.writePsd({width:w,height:h,canvas,children,imageResources:{resolutionInfo:{horizontalResolution:ppi,verticalResolution:ppi,horizontalResolutionUnit:'PPI',verticalResolutionUnit:'PPI',widthUnit:'Inches',heightUnit:'Inches'}}})],{type:'image/vnd.adobe.photoshop'});
}
async function preservedPdf(pages,original){
  if(!original)return pdfOut(pages);
  const clean=pages.map(p=>p.dataset.sourcePage===undefined?null:Number(p.dataset.sourcePage));
  if(clean.every(i=>i===null))return pdfOut(pages);
  await lib('pdf-lib');const base=await PDFLib.PDFDocument.load(await original.arrayBuffer(),{updateMetadata:false});
  if(/\.pdf$/i.test(original.name)&&clean.length===base.getPageCount()&&clean.every((n,i)=>n===i)&&pages.every(p=>!p.dataset.unitChanged))return original;
  // Illustrator's private data may describe every artboard of the old file. A new
  // mixed-page PDF must open its current visible content, including the edited pages.
  const pieceKey=PDFLib.PDFName.of('PieceInfo'),aiKey=PDFLib.PDFName.of('Illustrator');
  for(const page of base.getPages()){const info=page.node.lookupMaybe(pieceKey,PDFLib.PDFDict);if(info?.has(aiKey)){info.delete(aiKey);if(!info.keys().length)page.node.delete(pieceKey);}}
  const target=await PDFLib.PDFDocument.create(),changed=pages.filter((_,i)=>clean[i]===null);
  const edits=changed.length?await PDFLib.PDFDocument.load(await(await pdfOut(changed,false)).arrayBuffer()):null;
  let edited=0;for(const n of clean){const [page]=await target.copyPages(n===null?edits:base,[n===null?edited++:n]);target.addPage(page);}
  await target.attach(new TextEncoder().encode(JSON.stringify({version:1,pdfTextVersion:2,pages:pages.map(M.xml)})),'vector-workbench.json',{mimeType:'application/json',description:'Editable vector workbench pages'});
  return new Blob([await target.save()],{type:'application/pdf'});
}
async function output(pages,idx,fmt,original){if(fmt==='svg'){const svg=pages[idx].cloneNode(true),unit=validBoardUnit(svg.dataset.boardUnit)?svg.dataset.boardUnit:'mm';for(const key of ['width','height'])svg.setAttribute(key,Number((pages[idx].viewBox.baseVal[key]/boardUnits[unit]).toFixed(4))+unit);return new Blob([M.xml(svg)],{type:'image/svg+xml'});}if(fmt==='psd')return psdOut(pages[idx]);if(fmt==='eps')return new Blob([await postscript(await(await pdfOut([pages[idx]])).arrayBuffer(),'eps')],{type:'application/postscript'});if(fmt==='pdf')return preservedPdf(pages,original);throw Error('请选择有效的导出格式。');}
window.VectorFormats={open,output,fonts,image,dataURL,loadFontReader:()=>lib('fontkit')};
})();

'use strict';
const fs=require('node:fs'),path=require('node:path');
const src=path.join(__dirname,'..','web'),out=path.join(__dirname,'dist'),modules=path.join(__dirname,'node_modules');
const lib=path.join(out,'lib'),licenses=path.join(out,'licenses');
for(const d of [out,lib,licenses])fs.mkdirSync(d,{recursive:true});
function replace(s,a,b){if(!s.includes(a))throw Error('共享工作台入口已变更 '+a);return s.replace(a,b);}
let html=fs.readFileSync(path.join(src,'index.html'),'utf8')
 .replace('</head>','<link rel="icon" href="data:,"></head>').replace('本地工作台','在线工作台').replace(/<div id="upgrade" hidden>.*?<\/div>/,'<div id="upgrade" hidden></div>')
 .replace('>对象</h2>', '>图层与对象</h2>').replace('<small>同组内</small>', '<small>当前画板</small>')
 .replace('<option value="ai">AI</option>','<option value="svg">SVG · 当前画板</option>')
 .replace('将 AI、EPS、PDF 或 PSD 拖到画板上','拖入 PDF、PDF 兼容 AI、EPS、PSD 或 SVG。文件在你的浏览器中处理。')
 .replace('accept=".ai,.eps,.pdf,.psd"','accept=".svg,.ai,.eps,.pdf,.psd"')
 .replace('本机工作台','浏览器工作台').replace('id="format"','title="PDF 保留多页和矢量，可用 Illustrator 打开；EPS、SVG、PSD 导出当前画板" id="format"')
 .replace('<script defer src="/screen.js"></script>',['document-fonts','paragraphs','model','formats','stack-order','browser-engine','picking','screen','text-controls','canvas-type','text-style','layer-tools'].map(n=>'<script defer src="/'+n+'.js"></script>').join(''))
 .replace('<div id="upgrade"','<div id="formatNotice" hidden style="padding:5px 12px;font-size:12px;color:#684d20;background:#fff6de">该页含混合模式或透明蒙版，浏览器预览及改动后的输出可能与原稿有差异。</div><div id="upgrade"').replace('<form method="dialog"><button class="primary">关闭','<p>PDF 可在 Illustrator 中继续编辑。支持打开 PDF 兼容 AI。EPS 输出会将文字转为轮廓。PSD 导出当前页的 RGB 图层。</p><p><a href="/licenses/index.html" target="_blank" rel="noopener">版权与第三方许可</a></p><form method="dialog"><button class="primary">关闭');
fs.writeFileSync(path.join(out,'index.html'),html);
let ui=fs.readFileSync(path.join(src,'screen.js'),'utf8');
ui=ui.replace(/async function request\(route,options=\{\}\)\{[\s\S]*?\n\}/,'async function request(route,options={}){return VectorBrowser.request(route,options);\n}');
ui=ui.replace(/const route=state.svgScene\?[^;]+;if\(!route\|\|!d.items.length\)return;/,'if(!d.items.length)return;');
ui=ui.replace(/const resp=await fetch\(route\+[\s\S]*?const raw=await resp.text\(\);/,'const raw=VectorBrowser.scene();');
ui=replace(ui,"const d=doc();$('paper').hidden=!d;","const d=doc();$('formatNotice').hidden=!d?.effects;$('paper').hidden=!d;");
ui=replace(ui,'function selectionBox(box){','function selectionBox(box){window.VectorTextControls?.schedule();window.CanvasType?.schedule();');
ui=replace(ui,"surf.ondblclick=()=>{if(tool==='select'&&chosen()?.type==='text'){if(small())panel('properties');$('content').focus();$('content').select();}","surf.ondblclick=e=>{if(tool==='select'&&chosen()?.type==='text'){CanvasType.begin(e);}");
ui=replace(ui,"else if(small()&&!additive)panel('properties');","else if(small()&&!additive&&chosen()?.type!=='text')panel('properties');");
ui=replace(ui,"act('addText');$('content').focus();$('content').select();","act('addText');CanvasType.begin(null,true);");
ui=replace(ui,"if(!layoutSteps.length||$('refreshMode').value!=='idle'||hasFrameEdits())return;","if(!layoutSteps.length||window.CanvasType?.active||$('refreshMode').value!=='idle'||hasFrameEdits())return;");
ui=replace(ui,"function applyLocalProperty(o,m){","function applyLocalProperty(o,m){if(m.kind==='typeStyle'&&o.paragraph){VectorTextStyle.project(o,m.style);return true;}");
ui=replace(ui,"function props(){","function props(){if(typeof VectorTextStyle!=='undefined')VectorTextStyle.update();window.VectorLayerTools?.update();");
ui=replace(ui,"if(fromList&&o&&small()&&!extend)panel('properties');","if(fromList&&o&&small()&&!extend&&document.body.dataset.panel!=='layers')panel('properties');");
ui=replace(ui,"b.className='object';","b.className='object';b.draggable=!o.locked;");
ui=replace(ui,"link.download='';","link.download=data.downloadName;");
ui=replace(ui,'corner?(chosen()||pickedItems()[0]):doc().items.find(o=>{const h=o.hit;return !o.locked&&matches(o)&&pos.x>=h.x&&pos.x<=h.x+h.w&&pos.y>=h.y&&pos.y<=h.y+h.h;})','corner?(chosen()||pickedItems()[0]):((!e.shiftKey&&!e.ctrlKey&&!e.altKey&&window.CanvasType?.frameAt(pos))||browserCanvasPick(e,pos))');
ui=replace(ui,'cache.preview===doc().preview&&','');
ui=ui.replace('ai|eps|pdf|psd','ai|eps|pdf|psd|svg').replace('请选择 AI、EPS、PDF 或 PSD 文件','请选择 PDF、兼容 AI、EPS、PSD 或 SVG 文件')
 .replaceAll('本机工作副本','浏览器工作副本').replaceAll('本机处理','浏览器内处理').replaceAll('正在本机打开','正在打开').replaceAll('Illustrator 可用字体','本机可用字体')
 .replace('img-src data:;','img-src data:; font-src data:;');
if(ui.includes('127.0.0.1')||ui.includes('fetch(route'))throw Error('在线包仍引用本机服务');
fs.writeFileSync(path.join(out,'screen.js'),ui);fs.writeFileSync(path.join(out,'screen.css'),fs.readFileSync(path.join(src,'screen.css'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'text-controls.css'),'utf8'));
for(const name of ['document-fonts','canvas-type','text-style','layer-tools','stack-order','paragraphs','model','formats','browser-engine','picking','text-controls','postscript-worker'])fs.copyFileSync(path.join(__dirname,name+'.js'),path.join(out,name+'.js'));
for(const [from,to] of Object.entries({'pdfjs-dist/build/pdf.min.js':'pdf.js','pdfjs-dist/build/pdf.worker.min.js':'pdf.worker.js','pdfjs-dist/cmaps':'cmaps','pdfjs-dist/standard_fonts':'standard_fonts','dompurify/dist/purify.min.js':'purify.js','ag-psd/dist/bundle.js':'psd.js','pdfkit/js/pdfkit.standalone.js':'pdfkit.js','svg-to-pdfkit/source.js':'svg-to-pdf.js','@jspawn/ghostscript-wasm/gs.js':'gs.js','@jspawn/ghostscript-wasm/gs.wasm':'gs.wasm'}))fs.cpSync(path.join(modules,from),path.join(lib,to),{recursive:true});
const writer=path.join(lib,'svg-to-pdf.js'),originalWriter=fs.readFileSync(writer,'utf8');
const oldGlyphLoop=/for \(let j = 0, pos = childElem\._pos; j < pos\.length; j\+\+\) \{[\s\S]*?docWriteGlyph\(pos\[j\]\.glyph\);\s*\}\s*\}/g;
const glyphLoops=originalWriter.match(oldGlyphLoop);if(glyphLoops?.length!==1)throw Error('PDF 文字写入接口发生变化');
fs.writeFileSync(writer,fs.readFileSync(path.join(__dirname,'pdf-text-runs.js'),'utf8')+'\n'+originalWriter.replace(oldGlyphLoop,'writeVectorTextRuns(childElem._pos,this._font,doc,docSetTextMatrix);'));
const pdfLibDir=path.join(__dirname,'..','vendor');fs.copyFileSync(path.join(pdfLibDir,'pdf-lib.cjs'),path.join(lib,'pdf-lib.js'));
const fonts=path.join(__dirname,'..','assets','fonts');
fs.copyFileSync(path.join(modules,'@pdf-lib/fontkit/dist/fontkit.umd.min.js'),path.join(lib,'fontkit.js'));
fs.copyFileSync(path.join(pdfLibDir,'fontkit-LICENSE.txt'),path.join(licenses,'fontkit.txt'));
fs.copyFileSync(path.join(fonts,'NotoSansSC.ttf'),path.join(lib,'fallback.ttf'));
fs.copyFileSync(path.join(fonts,'OFL.txt'),path.join(licenses,'NotoSansSC.txt'));
fs.copyFileSync(path.join(pdfLibDir,'pdf-lib-LICENSE.txt'),path.join(licenses,'pdf-lib.txt'));
fs.mkdirSync(path.join(out,'examples'),{recursive:true});
fs.copyFileSync(path.join(__dirname,'..','examples','fold-guide.pdf'),path.join(out,'examples','fold-guide.pdf'));
for(const file of ['LICENSE','NOTICE','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(__dirname,'..',file),path.join(licenses,file+'.txt'));
const packages=['ag-psd','dompurify','pdfkit','pdfjs-dist','svg-to-pdfkit','@jspawn/ghostscript-wasm'];
for(const pkg of packages){const lic=fs.readdirSync(path.join(modules,pkg)).find(f=>/^licen[cs]e(?:\.\w+)?$/i.test(f));if(lic)fs.copyFileSync(path.join(modules,pkg,lic),path.join(licenses,pkg.split('/').pop()+'.txt'));}
fs.writeFileSync(path.join(licenses,'index.html'),'<!doctype html><meta charset=utf-8><title>开源组件</title><h1>矢量快改 · 版权与组件许可</h1><p>© 2026 shuoshuowa。原创部分适用 PolyForm Noncommercial 1.0.0。商用请联系 <a href="mailto:shuoshuowa@gmail.com">shuoshuowa@gmail.com</a>。</p>'+fs.readdirSync(licenses).filter(f=>f.endsWith('.txt')).map(f=>'<p><a href="'+f+'">'+f+'</a></p>').join('')+'<p>PostScript 转换器使用独立的 Ghostscript WebAssembly 程序。<a href="https://github.com/jsscheller/ghostscript-wasm/tree/d45193808b707ebefb3df7560586b3d404d64c39">构建脚本与对应源代码</a></p>');
fs.writeFileSync(path.join(out,'_headers'),"/*\n  X-Content-Type-Options: nosniff\n  Cache-Control: public, no-cache, no-transform\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' blob:; connect-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'\n");

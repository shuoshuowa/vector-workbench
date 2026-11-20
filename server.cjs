'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{pipeline}=require('node:stream/promises');
const {PDFDocument}=require('./vendor/pdf-lib.cjs');
const local=fs.mkdtempSync(path.join(os.tmpdir(),'vector-quick-')),web=path.join(__dirname,'web');
const key=crypto.randomBytes(24).toString('hex'),files=new Map(),outputs=new Map(),headless=process.argv.includes('--headless');
const sample=path.join(__dirname,'examples','fold-guide.pdf');
let current=null,busy=false,base,rev=0;
const uid=()=>crypto.randomUUID();
function error(msg,status=400){const e=Error(msg);e.status=status;throw e;}
function requireExt(name,kinds){const ext=path.extname(name).toLowerCase();if(!kinds.includes(ext))error('不支持这个文件格式');return ext;}
function number(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)error('输入的数值超出范围');return v;}
function bridge(input){
  const script=fs.readFileSync(path.join(__dirname,'engine.jsx'),'utf8');
  const jsx=script.replace('/*__INPUT__*/',()=>JSON.stringify({...input,engineVersion:2}).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'));
  const command="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$src=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()));$ai=New-Object -ComObject Illustrator.Application;$ai.DoJavaScript($src)";
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',err='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);
    child.on('error',reject);child.stdin.on('error',()=>{});child.on('close',code=>{try{
      if(code)throw Error('本机 Illustrator 未能执行操作。'+err.slice(0,190));
      const result=JSON.parse(out.trim().replace(/^\uFEFF/,''));if(!result.ok)throw Error(result.error+'（'+result.line+'）');resolve(result.data);
    }catch(e){reject(e);}});child.stdin.end(Buffer.from(jsx,'utf8').toString('base64'));
  });
}
function safeAction(s,data){
  const kind=data.kind,allowed=['shape','rectangle','stroke','multi','duplicateLayer','pageAdd','pageCopy','pageDelete','pageSize','importArtwork','ungroup','addText','addPicture','geometry','text','picture','usePhoto','release','round','color','crop','order','duplicate','delete'];
  if(!allowed.includes(kind))error('未知操作');
  const a={kind,page:s.page},id=data.id;
  if(!['shape','rectangle','multi','pageAdd','pageCopy','pageDelete','pageSize','importArtwork','addText','addPicture'].includes(kind)){
    const row=s.view.items.find(r=>r.id===id);if(!row||row.locked)error('请选择当前画板的可编辑对象');a.id=id;
  }
  if(['geometry','rectangle','shape'].includes(kind)){
    a.x=number(data.x,-5000,5000);a.y=number(data.y,-5000,5000);a.w=number(data.w,.01,5000);a.h=number(data.h,.01,5000);
  }
  if(kind==='round'||kind==='rectangle')a.r=number(data.r,0,2500);
  if(kind==='shape'){
    if(!['rect','rounded','ellipse','triangle','line'].includes(data.shape))error('请选择有效图形');
    a.shape=data.shape;a.reverse=data.reverse===true;
  }
  if(kind==='stroke'){
    if(typeof data.enabled!=='boolean'||(data.color!=null&&!/^#[a-f0-9]{6}$/i.test(data.color)))error('描边参数无效');
    a.enabled=data.enabled;a.width=number(data.width,.1,1000);a.color=data.color||null;
  }
  if(kind==='multi'){
    const ids=Array.isArray(data.ids)?[...new Set(data.ids)]:[];
    if(!ids.length||ids.some(id=>!s.view.items.some(o=>o.id===id&&!o.locked)))error('请重新选择可编辑对象');
    if(!['move','duplicate','delete','left','centerX','right','top','centerY','bottom','spaceX','spaceY','group'].includes(data.operation))error('不支持的多选操作');
    a.ids=ids.filter(id=>!ids.some(parent=>id.startsWith(parent+'/')));a.reference=data.reference==='page'?'page':'selection';
    if(a.ids.length<2&&!(a.reference==='page'&&['left','centerX','right','top','centerY','bottom'].includes(data.operation)))error('请选择两个独立对象');
    a.operation=data.operation;if(data.operation==='move'){a.dx=number(data.dx,-5000,5000);a.dy=number(data.dy,-5000,5000);}
  }
  if(kind==='pageDelete'&&s.view.pages<=1)error('至少保留一页画板');
  if(kind==='pageSize'){a.w=number(data.w,5,2000);a.h=number(data.h,5,2000);}
  if(kind==='importArtwork'){
    const f=files.get(data.asset);if(!f||!['.ai','.eps','.psd','.svg','.pdf','.png','.jpg','.jpeg'].includes(f.ext))error('请选择设计文件或图片');
    a.path=f.path;a.ext=f.ext;a.name=f.name;a.sheet=number(data.sheet,1,1000);if(!Number.isInteger(a.sheet))error('请输入整数页码');
  }
  if(kind==='rectangle'||kind==='color'){if(!/^#[a-f0-9]{6}$/i.test(data.color))error('请选择有效颜色');a.color=data.color;if(typeof data.enabled==='boolean')a.enabled=data.enabled;}
  if(kind==='text'){if(typeof data.value!=='string'||data.value.length>100000)error('文字长度超出范围');a.value=data.value;a.pt=data.pt==null?null:number(data.pt,.1,1296);if(data.font){if(typeof data.font!=='string'||data.font.length>200)error('字体名无效');a.font=data.font;}}
  if(kind==='picture'||kind==='addPicture'){const f=files.get(data.asset);if(!f||!['.png','.jpg','.jpeg'].includes(f.ext))error('请选择 PNG 或 JPEG 图片');a.path=f.path;}
  if(kind==='usePhoto'){const row=s.view.items.find(r=>r.id===data.source);if(!row||row.id===a.id||!(row.type==='image'||row.canCrop))error('请选择另一张图片或单图图片框');a.source=row.id;a.placement='inPlace';}
  if(kind==='crop'){a.factor=number(data.factor,.05,20);a.dx=number(data.dx,-5000,5000);a.dy=number(data.dy,-5000,5000);}
  if(kind==='order'){if(!['up','down','front','back'].includes(data.direction))error('层级方向无效');a.direction=data.direction;}
  return a;
}
function safeEdits(s,commands){
  if(!Array.isArray(commands)||!commands.length||commands.length>4000)error('此次编辑数量超出范围');
  const rows=[...s.view.items],scope={page:s.page,view:{items:rows}},changes=[];
  for(const command of commands){
    if(command.kind==='clone'){
      if(typeof command.id!=='string'||!/^local:[\da-f-]{36}$/.test(command.id)||rows.some(o=>o.id===command.id)||!rows.some(o=>o.id===command.source&&!o.locked))error('复制对象无效');
      changes.push({key:command.id,copyFrom:command.source,dx:number(command.dx,-5000,5000),dy:number(command.dy,-5000,5000)});
      rows.push({id:command.id,locked:false});
    }else if(command.kind==='create'){
      if(typeof command.id!=='string'||!/^local:[\da-f-]{36}$/.test(command.id)||rows.some(o=>o.id===command.id)||!['shape','addText'].includes(command.action?.kind))error('新对象无效');
      changes.push({key:command.id,create:true,action:safeAction(scope,command.action)});rows.push({id:command.id,locked:false});
    }else{
      if(!['text','color','stroke','geometry','round','crop','delete'].includes(command.kind))error('不支持此编辑');
      changes.push({key:command.id,action:safeAction(scope,command)});
    }
  }
  return {kind:'editBatch',page:s.page,changes};
}
function state(){return {app:'vector-quick-edit',historyCache:true,psd:true,cloneBatch:true,drawingTools:1,layoutBatch:true,realtimeBatch:true,svgScene:true,version:rev,sample:fs.existsSync(sample)?path.basename(sample):null,document:current?{...current.view,name:current.name,preview:current.previewURL,canUndo:current.cursor>0,canRedo:current.cursor<current.log.length,edited:current.cursor!==current.saved}:null};}
function removeJob(dir){
  const target=path.resolve(dir);if(path.dirname(target)!==path.resolve(local)||!path.basename(target).startsWith('job-'))throw Error('无效的工作副本目录');
  for(const [id,f] of outputs)if(f.file.startsWith(target+path.sep))outputs.delete(id);
  fs.rmSync(target,{recursive:true,force:true,maxRetries:2,retryDelay:100});
}
async function closeJob(s){
  if(!s)return;
  await bridge({op:'close',work:s.work});removeJob(s.dir);
  const used=new Set(s.log.map(a=>a.path).filter(Boolean));
  for(const [id,f] of files)if(used.has(f.path)){fs.rmSync(f.path,{force:true});files.delete(id);}
}
async function runView(s,op,extra={}){
  const id=uid(),preview=path.join(s.dir,id+'.png');
  const view=await bridge({op,work:s.work,seed:s.seed,page:s.page,preview,...extra});
  if(!fs.existsSync(preview))error('Illustrator 未生成画板预览。',500);
  s.view=view;s.page=view.page;s.previewId=id;s.previewURL='/asset/'+id;outputs.set(id,{file:preview,name:'preview.png',type:'image/png'});

}
function pruneHistory(s,predicate){
  const removed=s.history.filter(predicate);s.history=s.history.filter(h=>!predicate(h));
  for(const h of removed)if(s.previewId!==h.previewId&&!s.history.some(r=>r.previewId===h.previewId)){
    const file=outputs.get(h.previewId)?.file;outputs.delete(h.previewId);if(file)fs.rmSync(file,{force:true});
  }
}
function remember(s){
  s.history.push({cursor:s.cursor,page:s.page,view:s.view,previewId:s.previewId,previewURL:s.previewURL});
  while(s.history.length>12){const first=s.history[0];pruneHistory(s,h=>h===first);}
}
async function restoreNative(s){
  if(s.restoring)await s.restoring;
  if(s.nativeCursor===s.cursor)return;
  const target=s.cursor;
  s.restoring=bridge({op:'replay',work:s.work,seed:s.seed,actions:s.log.slice(0,target),page:s.page})
    .then(()=>{s.nativeCursor=target;}).finally(()=>{s.restoring=null;});
  await s.restoring;
}
async function replay(s,cursor){await runView(s,'replay',{actions:s.log.slice(0,cursor)});s.nativeCursor=s.cursor=cursor;remember(s);}
async function openDesign(source,name){
  const ext=requireExt(name,['.ai','.eps','.pdf','.psd']),dir=fs.mkdtempSync(path.join(local,'job-')),input=path.join(dir,'original'+ext);
  const s={dir,work:path.join(dir,'work.ai'),seed:path.join(dir,'seed.ai'),name,page:0,cursor:0,nativeCursor:0,history:[],saved:0,log:[]};
  try{
    await fs.promises.copyFile(source,input);
    let count=1;
    if(ext==='.pdf')count=(await PDFDocument.load(await fs.promises.readFile(input),{updateMetadata:false})).getPageCount();
    await runView(s,'open',{source:input,count});await fs.promises.copyFile(s.work,s.seed);remember(s);
  }catch(e){try{await closeJob(s);}catch{}throw e;}
  const old=current;current=s;rev++;if(old)try{await closeJob(old);}catch{}
}
async function perform(which,data){
  if(data.version!==rev)error('画板已更新，请再次选择后操作。',409);
  if(which==='blank'){
    const w=number(data.w,5,2000),h=number(data.h,5,2000),dirFile=path.join(local,uid()+'.pdf');
    const blank=await PDFDocument.create();blank.addPage([w*72/25.4,h*72/25.4]);
    try{await fs.promises.writeFile(dirFile,await blank.save());await openDesign(dirFile,'未命名画板.pdf');}finally{fs.rmSync(dirFile,{force:true});}
    return state();
  }
  if(which==='open'){
    if(data.sample){if(!fs.existsSync(sample))error('找不到样稿，请手动选择文件');await openDesign(sample,path.basename(sample));}
    else{const f=files.get(data.asset);if(!f)error('请选择文件');await openDesign(f.path,f.name);fs.rmSync(f.path,{force:true});files.delete(data.asset);}return state();
  }
  const s=current;if(!s)error('请先打开一份设计稿');
  if(s.restoring&&!['undo','redo'].includes(which))await s.restoring;
  if(!['undo','redo','close'].includes(which))await restoreNative(s);
  if(which==='close'){await closeJob(s);current=null;rev++;return state();}
  if(which==='page'){const page=number(data.page,0,s.view.pages-1);if(!Number.isInteger(page))error('页码无效');await runView(s,'preview',{page});s.page=page;remember(s);}
  else if(which==='act'||which==='layout'||which==='edits'){
    let action;
    if(which==='edits')action=safeEdits(s,data.changes);
    else if(which==='layout'){
      if(!Array.isArray(data.moves)||!data.moves.length||data.moves.length>2000)error('布局更新无效');
      action={kind:'layout',page:s.page,moves:data.moves.map(m=>safeAction(s,{...m,kind:m.kind==='round'?'round':'geometry'}))};
    }else action=safeAction(s,data.action||{});
    if(action.kind==='importArtwork'&&action.ext==='.pdf'&&action.sheet>1){const external=await PDFDocument.load(await fs.promises.readFile(action.path),{updateMetadata:false});if(action.sheet>external.getPageCount())error('源文件没有这一页');}
    try{await runView(s,'act',{action});}catch(e){await replay(s,s.cursor);throw e;}
    if(s.saved>s.cursor)s.saved=-1;s.log.splice(s.cursor);s.log.push(action);pruneHistory(s,h=>h.cursor>s.cursor);s.nativeCursor=++s.cursor;remember(s);
  }else if(which==='undo'||which==='redo'){
    const n=s.cursor+(which==='undo'?-1:1);if(n<0||n>s.log.length)error('没有可用记录');
    const prior=s.history.slice().reverse(),cached=prior.find(h=>h.cursor===n&&h.page===s.page)||prior.find(h=>h.cursor===n);
    if(cached){Object.assign(s,cached);}else{const before=s.cursor;try{await replay(s,n);}catch(e){await replay(s,before);throw e;}}
  }else if(which==='export'){
    const format=data.format;if(!['pdf','ai','eps','psd'].includes(format))error('导出格式无效');
    const dir=fs.mkdtempSync(path.join(s.dir,'out-')),stem=path.basename(s.name,path.extname(s.name)).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const name=stem+'-编辑版'+(['eps','psd'].includes(format)?'_第'+(s.page+1)+'页':'')+'.'+format;
    await bridge({op:'export',work:s.work,out:path.join(dir,name),exportCopy:path.join(dir,'conversion-copy.ai'),format,page:s.page});
    const list=fs.readdirSync(dir).filter(n=>n.toLowerCase().endsWith('.'+format));
    const actual=(format==='eps'&&list.find(n=>n!==name))||list.find(n=>n===name)||list[0];if(!actual)error('未生成导出文件');
    const id=uid();outputs.set(id,{file:path.join(dir,actual),type:'application/octet-stream',name});
    if(['ai','pdf'].includes(format))s.saved=s.cursor;rev++;return {...state(),download:'/asset/'+id};
  }else error('未知请求');rev++;return state();
}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let chunks=[],n=0;for await(const c of req){n+=c.length;if(n>800000)error('输入内容过长',413);chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.headers.host!==new URL(base).host)error('仅限本机访问',403);
    const u=new URL(req.url,base);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    if(req.method==='GET'&&['/','/screen.css','/screen.js'].includes(u.pathname)){
      const f=u.pathname==='/'?'index.html':u.pathname.slice(1);res.writeHead(200,{'Content-Type':({'index.html':'text/html','screen.css':'text/css','screen.js':'text/javascript'})[f]+'; charset=utf-8','Cache-Control':'no-cache'});
      if(f==='index.html')return res.end(fs.readFileSync(path.join(web,f),'utf8').replace('</head>','<meta name="local-workbench" content="'+key+'"></head>'));
      return fs.createReadStream(path.join(web,f)).on('error',()=>res.destroy()).pipe(res);
    }
    if(req.method==='GET'&&u.pathname.startsWith('/asset/')){
      const item=outputs.get(u.pathname.slice(7));if(!item)error('预览已更新或文件已过期',404);
      if(item.type!=='image/png')res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(item.name));
      res.setHeader('Content-Type',item.type);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Length',fs.statSync(item.file).size);return fs.createReadStream(item.file).on('error',()=>res.destroy()).pipe(res);
    }
    if(req.headers['x-vector-key']!==key||(req.headers.origin&&req.headers.origin!==base))error('请从本机启动器打开编辑器',403);
    if(req.method==='GET'&&u.pathname==='/api/state')return json(res,state());
    if(req.method==='GET'&&u.pathname==='/api/scene'){
      const s=current,id=u.searchParams.get('id');if(!s||s.previewId!==id)error('画板已更新',409);
      const scenes=require('./scene.cjs');
      if(!scenes.hasScene(s.work,id)&&s.nativeCursor!==s.cursor){
        if(busy)error('矢量预览正在准备',409);
        await restoreNative(s);if(s!==current||s.previewId!==id)error('画板已更新',409);
      }
      const data=await scenes.sceneFor(s.work,s.page,id);
      if(s!==current||s.previewId!==id)error('画板已更新',409);
      res.setHeader('Content-Type','image/svg+xml');res.setHeader('Cache-Control','no-store');return res.end(data);
    }
    if(req.method==='GET'&&u.pathname==='/api/fonts'){if(busy||!current)error('请先打开文稿并等待操作完成',409);busy=true;try{return json(res,await bridge({op:'fonts',work:current.work}));}finally{busy=false;}}
    if(req.method!=='POST'||!u.pathname.startsWith('/api/'))error('页面不存在',404);
    if(u.pathname==='/api/upload'){
      const name=path.basename(u.searchParams.get('name')||''),ext=requireExt(name,['.pdf','.ai','.eps','.psd','.svg','.png','.jpg','.jpeg']),id=uid(),f=path.join(local,id+ext);
      try{await pipeline(req,fs.createWriteStream(f,{flags:'wx'}));}catch(e){fs.rmSync(f,{force:true});throw e;}
      files.set(id,{name,ext,path:f});return json(res,{asset:id});
    }
    const data=await body(req);if(busy)error('正在处理上一个操作',409);busy=true;
    try{json(res,await perform(u.pathname.slice(5),data));}finally{busy=false;}
  }catch(e){if(!res.headersSent)json(res,{error:e.message},e.status||400);else res.end();}
});
const sessionFile=path.join(os.tmpdir(),'vector-quick-edit-local-session.json');
function openBrowser(url){spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();}
server.on('error',async e=>{
  if(e.code==='EADDRINUSE'&&!headless){
    try{const old=new URL(JSON.parse(fs.readFileSync(sessionFile,'utf8')).url);
      if(old.protocol==='http:'&&old.hostname==='127.0.0.1'){
        const r=await fetch(old.origin+'/api/state',{headers:{'x-vector-key':old.hash.slice(1)},signal:AbortSignal.timeout(2000)});
        if(r.ok&&(await r.json()).app==='vector-quick-edit'){fs.rmdirSync(local);openBrowser(old.origin+'/');return;}
      }
    }catch{/* Another local program may be using the usual port. */}
    server.listen(0,'127.0.0.1');return;
  }console.error(e.message);process.exitCode=1;
});
server.on('listening',async()=>{
  base='http://127.0.0.1:'+server.address().port;
  const url=base+'/#'+key,info={url,pid:process.pid};
  const infoArg=process.argv.find(s=>s.startsWith('--info='));
  if(infoArg)fs.writeFileSync(infoArg.slice(7),JSON.stringify(info));
  if(!headless){
    fs.writeFileSync(sessionFile,JSON.stringify(info));
    const resume=process.argv.find(arg=>arg.startsWith('--resume='));
    if(resume){
      busy=true;try{const m=JSON.parse(fs.readFileSync(resume.slice(9),'utf8'));await openDesign(m.file,path.basename(m.file));current.name=m.name;
        if(m.page>0&&m.page<current.view.pages)await runView(current,'preview',{page:m.page});
        current.saved=m.edited?-1:0;}catch(e){console.error(e.message);}finally{busy=false;}
    }else if(process.argv.includes('--sample')&&fs.existsSync(sample)){
      busy=true;try{await openDesign(sample,path.basename(sample));}catch(e){console.error(e.message);}finally{busy=false;}
    }
    openBrowser(base+'/');
  }
  console.log('矢量快改本机服务已运行：'+base);
});
server.listen(headless?0:19737,'127.0.0.1');

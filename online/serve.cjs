'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'dist');
if (!fs.existsSync(path.join(root, 'index.html'))) throw Error('请先运行 npm run build');
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf','.png':'image/png'};
const headers = Object.fromEntries(fs.readFileSync(path.join(root,'_headers'),'utf8').trim().split(/\r?\n/).slice(1).map(line=>{
  const i=line.indexOf(':');return [line.slice(0,i).trim(),line.slice(i+1).trim()];
}));
http.createServer((req,res)=>{
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  let requested;
  try {requested=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
  if (!file.startsWith(root+path.sep)||requested.includes('\0')||path.basename(file)==='_headers') {res.writeHead(404);res.end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{...headers,'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
  });
}).listen(port,'127.0.0.1',()=>console.log('矢量快改已启动：http://127.0.0.1:'+port));

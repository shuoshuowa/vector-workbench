'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const cache=new Map();
async function build(work,page){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vq-scene-')),file=path.join(dir,'art.svg');
  const input=JSON.stringify({work,page,file}).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const jsx=fs.readFileSync(path.join(__dirname,'scene.jsx'),'utf8').replace('/*__INPUT__*/',()=>input);
  const cmd="$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$s=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()));$ai=New-Object -ComObject Illustrator.Application;$ai.DoJavaScript($s)";
  try{
    const answer=await new Promise((resolve,reject)=>{const proc=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',cmd],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';proc.stdout.setEncoding('utf8');proc.stdout.on('data',s=>out+=s);proc.stderr.resume();proc.on('error',reject);proc.on('close',code=>code?reject(Error('矢量预览暂时不可用')):resolve(out.trim()));proc.stdin.on('error',()=>{});proc.stdin.end(Buffer.from(jsx).toString('base64'));});
    if(answer!=='OK')throw Error(answer);
    const files=fs.readdirSync(dir).filter(s=>s.endsWith('.svg'));return fs.readFileSync(path.join(dir,files.find(s=>s!=='art.svg')||files[0]));
  }finally{for(const ent of fs.readdirSync(dir,{withFileTypes:true}))if(ent.isFile())fs.unlinkSync(path.join(dir,ent.name));try{fs.rmdirSync(dir);}catch{}}
}
exports.hasScene=(work,id)=>cache.has(work+'|'+id);
exports.sceneFor=(work,page,id)=>{
  const key=work+'|'+id;if(cache.has(key))return cache.get(key);
  const promise=build(work,page).catch(e=>{cache.delete(key);throw e;});cache.set(key,promise);
  while(cache.size>2)cache.delete(cache.keys().next().value);
  return promise;
};

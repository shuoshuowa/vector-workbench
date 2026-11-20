/* Each conversion runs in a fresh, isolated virtual filesystem. */
importScripts('/lib/gs.js');
onmessage=async({data})=>{
  try{
    const gs=await Module({noInitialRun:true,locateFile:()=>'/lib/gs.wasm',print:()=>{},printErr:()=>{}});
    const eps=data.to==='eps',input=eps?'source.pdf':'source.eps',out=eps?'result.eps':'result.pdf';
    gs.FS.writeFile(input,new Uint8Array(data.bytes));
    const args=['-q','-dSAFER','-dBATCH','-dNOPAUSE',eps?'-sDEVICE=eps2write':'-sDEVICE=pdfwrite','-dNoOutputFonts',...(eps?[]:['-dEPSCrop']),'-sOutputFile='+out,input];
    let status;try{status=gs.callMain(args);}catch(e){if(e.status!==0)throw e;}
    if(status)throw Error('转换器退出 '+status);
    const result=gs.FS.readFile(out).slice();postMessage({bytes:result.buffer},[result.buffer]);
  }catch(e){postMessage({error:'PostScript 转换失败。'+(e.message||e)});}
};

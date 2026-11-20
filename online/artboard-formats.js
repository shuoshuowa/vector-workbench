const ArtboardFormats=(()=>{
  const PT=25.4/72;
  function nativeLayout(text){
    const end=text.lastIndexOf('(ArtboardArray)');if(end<0)return [];
    const array=text.slice(0,end),start=array.lastIndexOf('%_/Array :');if(start<0)return [];
    const boards=[];
    for(const dict of array.slice(start).split('%_/Dictionary :').slice(1)){
      const point=key=>{const m=new RegExp('%_([-+.\\d]+)\\s+([-+.\\d]+) /RealPoint(?:RelToROrigin)?\\s+%_\\s*\\('+key+'\\)').exec(dict);return m&&m.slice(1).map(Number);};
      const a=point('PositionPoint1'),b=point('PositionPoint2'),n=/%_\(((?:\\[\s\S]|[^)\\])*)\)\s*\/UnicodeString\s*\(Name\)/.exec(dict);
      if(!a||!b)return [];boards.push({x:a[0]*PT,y:-a[1]*PT,w:(b[0]-a[0])*PT,h:(a[1]-b[1])*PT,name:n?.[1].replace(/\\([()\\])/g,'$1')||'画板 '+(boards.length+1)});
    }return boards;
  }
  async function readAI(bytes,pages,load){
    await load('pdf-lib');const P=PDFLib,N=P.PDFName.of;
    const pdf=await P.PDFDocument.load(bytes,{updateMetadata:false}),dict=pdf.getPage(0).node.lookupMaybe(N('PieceInfo'),P.PDFDict)?.lookupMaybe(N('Illustrator'),P.PDFDict)?.lookupMaybe(N('Private'),P.PDFDict);
    if(!dict)return;const count=dict.lookupMaybe(N('NumBlock'),P.PDFNumber)?.asNumber()||0,decoder=new TextDecoder();let tail='',found=false,codec=null,total=0;
    function receive(chunk){total+=chunk.length;if(total>256*1024*1024)throw Error('布局数据过大');tail+=decoder.decode(chunk,{stream:true});if(tail.includes('(ArtboardArray)')){found=true;throw finished;}if(tail.length>6e6)tail=tail.slice(-4e6);}
    const finished={};try{
      for(let i=1;i<=Math.min(count,8192);i++){
        const stream=dict.lookupMaybe(N('AIPrivateData'+i),P.PDFRawStream);if(!stream)break;
        let chunk=P.decodePDFRawStream(stream).decode();
        if(i===1){const header=new TextDecoder().decode(chunk.subarray(0,80));
          if(header.startsWith('%AI24_ZStandard_Data')){await load('fzstd');codec=new fzstd.Decompress(receive);chunk=chunk.subarray(20);}
          else if(header.startsWith('%AI12_CompressedData')){await load('fflate');codec=new fflate.Unzlib(receive);chunk=chunk.subarray(20);}
          else if(!header.startsWith('%!PS'))return;
        }
        if(codec)codec.push(chunk,i===count);else receive(chunk);
      }
    }catch(e){if(e!==finished)throw e;}
    if(!found)return;const layout=nativeLayout(tail);
    if(layout.length!==pages.length)return;
    const plans=layout.map((b,i)=>{const p=pages[i],vb=p.viewBox.baseVal;
      if(Math.abs(vb.width-b.w)<.25&&Math.abs(vb.height-b.h)<.25)return {b,p};
      const src=pdf.getPage(i),crop=src.getCropBox(),trim=src.getTrimBox();
      if(src.getRotation().angle%360||Math.abs(trim.width*PT-b.w)>.25||Math.abs(trim.height*PT-b.h)>.25)return null;
      return {b,p,dx:(crop.x-trim.x)*PT,dy:(trim.y+trim.height-crop.y-crop.height)*PT};});
    if(plans.some(v=>!v))return;
    for(const {b,p,dx,dy} of plans){if(dx!==undefined){const g=VectorModel.make('g',{transform:'translate('+dx+' '+dy+')'});for(const el of [...p.children])if(!['defs','style'].includes(el.localName))g.append(el);p.append(g);p.setAttribute('viewBox','0 0 '+b.w+' '+b.h);p.setAttribute('width',b.w+'mm');p.setAttribute('height',b.h+'mm');}Artboards.set(p,b);}
  }
  async function kit(pages,pdf,load){
    await load('fflate');const r=await fetch('/illustrator-layout.jsx');if(!r.ok)throw Error('画板脚本加载失败，请重试。');
    const meta=Artboards.list(pages),marks=new WeakMap();
    for(const [i,p] of pages.entries()){
      VectorModel.mount(p);const map=new Map();marks.set(p,map);meta[i].typeGradients=[];
      const used=new Set(VectorModel.measure(p).map(o=>o.fill?.toLowerCase()));
      for(const e of p.querySelectorAll('text[data-vq-fx]')){const g=VectorEffects.read(e)?.gradient;if(!g)continue;
        let marker;do{marker='#'+[...crypto.getRandomValues(new Uint8Array(3))].map(v=>v.toString(16).padStart(2,'0')).join('');}while(used.has(marker));used.add(marker);
        map.set(e.dataset.vq,marker);meta[i].typeGradients.push({marker,g,box:VectorModel.box(p,e),text:e.dataset.text??e.textContent});}
    }
    const artwork=await pdf(marks),json=JSON.stringify(meta).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const jsx=(await r.text()).replace('/*__ARTBOARDS__*/[]',()=>json);
    const files={'artwork.pdf':new Uint8Array(await artwork.arrayBuffer()),'restore-artboards.jsx':fflate.strToU8('\ufeff'+jsx),
      'README.txt':fflate.strToU8('\ufeff解压整个文件夹。在 Adobe Illustrator 选择「文件 → 脚本 → 其他脚本」，运行 restore-artboards.jsx。脚本建立新文档，恢复名称、尺寸、顺序和坐标。用「另存为」保存 .ai。')};
    return new Blob([fflate.zipSync(files,{level:0})],{type:'application/zip'});
  }
  return {readAI,kit};
})();

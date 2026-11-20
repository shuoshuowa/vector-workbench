/* PDF.js renders subset fonts through synthetic family names and private glyph codes.
   Keep that representation for untouched artwork, and expose a Unicode face for editing. */
const VectorFonts=(()=>{
  const faces=new Map(),local=new Map(),families=new Map();
  const clean=s=>String(s||'').replace(/^[A-Z]{6}\+/,'').trim();
  const norm=s=>clean(s).toLowerCase().replace(/regular|normal|[\s_-]/g,'');
  const quote=s=>'"'+String(s).replace(/["\\\r\n]/g,'')+'"';
  function styleWeight(value=''){
    const t=value.toLowerCase();if(/thin|hairline|极细/.test(t))return 100;if(/extralight|ultralight|特细/.test(t.replace(/ /g,'')))return 200;
    if(/light|细体/.test(t))return 300;if(/medium|中等|中黑/.test(t))return 500;if(/semibold|demibold|半粗/.test(t.replace(/ /g,'')))return 600;
    if(/black|heavy|特黑/.test(t))return 900;if(/extrabold|ultrabold|特粗/.test(t.replace(/ /g,'')))return 800;if(/bold|粗体/.test(t))return 700;return 400;
  }
  const italicStyle=s=>/italic|oblique|斜/i.test(s||'')?'italic':'normal';
  function localMatch(name,weight,italic){
    const exact=local.get(norm(name))||local.get(norm(name.replace(/-\d{4}$/,''))),choices=families.get(norm(exact?.family||name));
    if(!choices?.length||(!weight&&italic!=='italic'))return exact;
    const wanted=Number(weight)||styleWeight(weight||''),slant=italic==='italic'?'italic':'normal';
    if(exact&&exact.postscriptName===name&&(wanted===400||styleWeight(exact.style)===wanted)&&italicStyle(exact.style)===slant)return exact;
    return choices.find(f=>styleWeight(f.style)===wanted&&italicStyle(f.style)===slant)||exact;
  }
  function rememberLocal(list){families.clear();for(const f of list){const key=norm(f.family);if(!families.has(key))families.set(key,[]);families.get(key).push(f);for(const n of [f.postscriptName,f.fullName,f.family+' '+f.style])local.set(norm(n),f);}}
  function candidates(name){return [...new Set([name,name.replace(/_/g,' '),name.replace(/[_-]/g,'')])];}

  // Add a Unicode cmap without changing glyph order, outlines, advances or other font tables.
  function unicodeFont(bytes,pairs){
    const source=fontkit.create(bytes),map=new Map();
    for(const cp of source.characterSet)map.set(cp,source.glyphForCodePoint(cp).id);
    for(const [unicode,encoded] of pairs){const glyph=source.glyphForCodePoint(encoded).id;if(glyph)map.set(unicode,glyph);}
    const groups=[];
    for(const [cp,glyph] of [...map].sort((a,b)=>a[0]-b[0])){
      if(!glyph||cp>0x10ffff)continue;const prev=groups.at(-1);
      if(prev&&cp===prev[1]+1&&glyph===prev[2]+cp-prev[0])prev[1]=cp;
      else groups.push([cp,cp,glyph]);
    }
    const cmapLength=28+groups.length*12,offset=(bytes.length+3)&~3,out=new Uint8Array(offset+((cmapLength+3)&~3));out.set(bytes);
    const v=new DataView(out.buffer),num=v.getUint16(4);
    let cmap=0,head=0,names=0;
    for(let i=0;i<num;i++){const at=12+i*16,tag=String.fromCharCode(...out.subarray(at,at+4));if(tag==='cmap')cmap=at;if(tag==='name')names=at;if(tag==='head')head=v.getUint32(at+8);}
    if(!cmap||!head)throw Error('字体表不完整');
    v.setUint16(offset+2,1);v.setUint16(offset+4,3);v.setUint16(offset+6,10);v.setUint32(offset+8,12);
    v.setUint16(offset+12,12);v.setUint32(offset+16,cmapLength-12);v.setUint32(offset+24,groups.length);
    groups.forEach((g,i)=>g.forEach((x,j)=>v.setUint32(offset+28+i*12+j*4,x)));
    function checksum(start,end){let sum=0;for(let i=start;i<end;i+=4)sum=(sum+v.getUint32(i))>>>0;return sum;}
    // The PDF writer supplies its own subset prefix. Leaving the PDF's old prefix
    // in PostScript names makes Illustrator look for a nonexistent installed family.
    if(names){
      const n=v.getUint32(names+8),len=v.getUint32(names+12),count=v.getUint16(n+2),strings=n+v.getUint16(n+4);
      for(let i=0;i<count;i++){
        const rec=n+6+i*12,platform=v.getUint16(rec),kind=v.getUint16(rec+6),size=v.getUint16(rec+8),rel=v.getUint16(rec+10);
        if(![1,3,4,6,16].includes(kind)||![0,1,3].includes(platform))continue;
        const step=platform===1?1:2;if(size<=7*step||strings+rel+size>n+len)continue;
        let prefix='';for(let j=0;j<7;j++)prefix+=String.fromCharCode(step===1?v.getUint8(strings+rel+j):v.getUint16(strings+rel+j*2));
        if(/^[A-Z]{6}\+$/.test(prefix)){v.setUint16(rec+8,size-7*step);v.setUint16(rec+10,rel+7*step);}
      }
      v.setUint32(names+4,checksum(n,n+len));
    }
    v.setUint32(cmap+4,checksum(offset,out.length));v.setUint32(cmap+8,offset);v.setUint32(cmap+12,cmapLength);v.setUint32(head+8,0);
    v.setUint32(head+8,(0xb1b0afba-checksum(0,out.length))>>>0);
    return out;
  }
  function capture(renderer){
    const records=new Map(),show=renderer.showText;
    renderer.showText=function(glyphs){
      show.call(this,glyphs);const {font,tspan}=this.current;if(!font||!tspan)return;
      const id=font.loadedName,name=clean(font.name)||'未标明字体';
      if(!records.has(id))records.set(id,{name,font,spans:new Set(),codes:new Map()});
      const record=records.get(id);record.spans.add(tspan);tspan.dataset.originalFont=name;
      const visible=glyphs.filter(g=>g&&typeof g==='object'&&(g.isInFont||font.missingFile||/^\s+$/.test(g.unicode)));
      for(const g of visible){if([...g.unicode||''].length===1&&[...g.fontChar||''].length===1)record.codes.set(g.unicode.codePointAt(0),g.fontChar.codePointAt(0));}
      tspan.dataset.unicode=(tspan.dataset.unicode||'')+visible.map(g=>g.unicode??g.fontChar).join('');
    };return records;
  }
  function bytes64(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
  async function install(alias,name,bytes){
    if(faces.has(alias))return faces.get(alias);
    const entry={name,alias,covered:new Set(),embedded:false};faces.set(alias,entry);
    if(bytes)try{
      const face=await new FontFace(alias,bytes).load();document.fonts.add(face);
      const parsed=fontkit.create(bytes);entry.weight=parsed['OS/2']?.usWeightClass||styleWeight(name);entry.italic=italicStyle(parsed.subfamilyName);entry.covered=new Set(parsed.characterSet);entry.embedded=true;entry.face=face;
    }catch{}
    return entry;
  }
  async function materialize(root,records){
    for(const {name,font,spans,codes} of records.values()){
      const alias='vqEdit'+crypto.randomUUID().replace(/-/g,''),mime=font.mimetype||'font/opentype';
      for(const span of spans)span.dataset.editFamily=alias;
      let bytes;try{if(font.data?.length)bytes=unicodeFont(font.data,codes);}catch{}
      const entry=await install(alias,name,bytes);
      if(entry.embedded){
        const url=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(new Blob([bytes],{type:mime}));});
        entry.css='@font-face { font-family: "'+alias+'"; src: url('+url+'); }';include(root,{alias});
      }
    }
    for(const t of root.querySelectorAll('text')){const span=t.querySelector('[data-original-font]');if(span){t.dataset.originalFont=span.dataset.originalFont;t.dataset.editFamily=span.dataset.editFamily;}}
  }
  async function recoverLegacy(root){
    const missing=[...root.querySelectorAll('tspan[data-unicode][font-family]')].filter(s=>!s.dataset.originalFont&&/^g_d\d+_f\d+/.test(s.getAttribute('font-family')));
    if(!missing.length)return;
    await VectorFormats.loadFontReader();const groups=new Map();
    for(const s of missing){const id=s.getAttribute('font-family');if(!groups.has(id))groups.set(id,[]);groups.get(id).push(s);}
    const records=new Map(),css=[...root.querySelectorAll('style')].map(s=>s.textContent).join('\n');
    for(const [id,spans] of groups){
      if(!/^g_d\d+_f\d+$/.test(id))continue;
      const match=new RegExp('font-family:\\s*"'+id+'";\\s*src:\\s*url\\(data:([^,]+);base64,([A-Za-z0-9+/=]+)').exec(css);
      if(!match)continue;
      try{const data=bytes64(match[2]),parsed=fontkit.create(data),name=clean(parsed.postscriptName||parsed.fullName);if(!name||/^g_d\d+_/.test(name))continue;
        const codes=new Map();for(const span of spans){const text=[...span.dataset.unicode],raw=[...span.textContent];span.dataset.originalFont=name;
          if(text.length===raw.length)text.forEach((c,i)=>codes.set(c.codePointAt(0),raw[i].codePointAt(0)));}
        records.set(id,{name,font:{data,mimetype:match[1]},spans,codes});
      }catch{}
    }
    if(records.size)await materialize(root,records);
  }
  async function hydrate(root){
    await recoverLegacy(root);
    const entries=new Map();
    for(const t of root.querySelectorAll('[data-original-font]:not([data-edit-family])'))include(root,{name:t.dataset.originalFont});
    for(const t of root.querySelectorAll('[data-edit-family][data-original-font]'))entries.set(t.dataset.editFamily,t.dataset.originalFont);
    if(!entries.size)return;
    if(!window.fontkit)await VectorFormats.loadFontReader();
    const css=[...root.querySelectorAll('style')].map(s=>s.textContent).join('\n');
    for(const [alias,name] of entries){
      if(!/^vqEdit[0-9a-f]+$/.test(alias)||faces.has(alias))continue;
      const def=new RegExp('font-family:\\s*"'+alias+'";\\s*src:\\s*url\\(data:[^,]+,([A-Za-z0-9+/=]+)').exec(css);
      const entry=await install(alias,name,def?bytes64(def[1]):null);if(def)entry.css='@font-face { font-family: "'+alias+'"; src: url(data:font/opentype;base64,'+def[1]+'); }';
    }
  }
  function metadata(el){const span=el.querySelector('[data-original-font]')||el;return el.dataset.originalFont?{name:el.dataset.originalFont,alias:el.dataset.editFamily}:span.dataset.originalFont?{name:span.dataset.originalFont,alias:span.dataset.editFamily}:null;}
  function family(name,source){
    if(!source||name!==source.name)return name||'sans-serif';
    const embedded=faces.get(source.alias)?.embedded,matched=localMatch(name);
    return [...(embedded?[quote(source.alias)]:[]),...candidates(matched?.postscriptName||name).map(quote),'sans-serif'].join(',');
  }
  function status(o){const src=o.fontSource;if(!src||o.font!==src.name)return localMatch(o.font)?'PDF 导出 · 已匹配本机字体':(/^(serif|sans-serif|monospace)$/.test(o.font)?'':'可匹配本机字体，用于 PDF 导出');
    const face=faces.get(src.alias),full=localMatch(src.name);
    if(!face?.embedded)return full?'原稿字体 · 已匹配本机字体':'原稿未嵌入可用字形。匹配本机原字体可用于编辑和导出。';
    if([...o.text].some(c=>c.trim()&&!face.covered.has(c.codePointAt(0))))return full?'内嵌字形和本机原字体':'部分字未嵌入，导出时会使用替代字体。可匹配本机原字体。';
    return '原稿字体 · 使用内嵌字形';
  }
  async function exportRuns(root,doc,registered,styles){
    for(const alias of registered)if(faces.has(alias))styles.set(alias,faces.get(alias));
    const loaded=new Map();
    for(const t of root.querySelectorAll('text')){
      const src=metadata(t),first=t.querySelector('tspan')||t;
      const read=k=>first.style.getPropertyValue(k)||first.getAttribute(k)||t.style.getPropertyValue(k)||t.getAttribute(k)||'';
      const name=src?.name||read('font-family').split(',')[0].replace(/["']/g,''),entry=faces.get(src?.alias),full=localMatch(name,read('font-weight'),read('font-style'));
      if(!src&&!full)continue;
      let localAlias;
      if(full){if(!loaded.has(full)){const alias='vqLocal'+loaded.size;try{const buffer=await(await full.blob()).arrayBuffer();doc.registerFont(alias,buffer);doc.font(alias);registered.add(alias);const parsed=fontkit.create(new Uint8Array(buffer));styles.set(alias,{weight:parsed['OS/2']?.usWeightClass||styleWeight(full.style),italic:italicStyle(full.style)});loaded.set(full,{alias,font:parsed});}catch{loaded.set(full,null);}}localAlias=loaded.get(full);}
      const nodes=t.querySelectorAll('tspan');for(const span of nodes.length?nodes:[t]){
        if(span.children.length)continue;
        const source=span.dataset.unicode??span.textContent,own=span.dataset.editFamily?faces.get(span.dataset.editFamily):entry;
        const runs=[];for(const ch of source){const font=!span.dataset.unicode&&localAlias?.font.hasGlyphForCodePoint(ch.codePointAt(0))?localAlias.alias:own?.embedded&&registered.has(own.alias)&&own.covered.has(ch.codePointAt(0))?own.alias:localAlias?.font.hasGlyphForCodePoint(ch.codePointAt(0))?localAlias.alias:'VQDefault';
          if(runs.at(-1)?.font===font)runs.at(-1).text+=ch;else runs.push({font,text:ch});}
        if(runs.length===1){span.textContent=source;span.style.fontFamily=runs[0].font;span.setAttribute('font-family',runs[0].font);}
        else if(runs.length){span.replaceChildren(...runs.map(r=>{const n=VectorModel.make('tspan',{'font-family':r.font});n.textContent=r.text;return n;}));}
        delete span.dataset.unicode;
      }
    }
  }
  function include(page,src){if(!src?.alias){if(src?.name&&!Array.from(page.querySelectorAll('style[data-local-face]')).some(n=>n.dataset.localFace===src.name)){const style=VectorModel.make('style');style.dataset.localFace=src.name;style.textContent='@font-face{font-family:'+quote(src.name)+';src:local('+quote(src.name)+');font-weight:'+styleWeight(src.name)+';font-style:'+italicStyle(src.name)+'}';page.prepend(style);}return;}const entry=faces.get(src?.alias);if(!entry?.css||[...page.querySelectorAll('style')].some(s=>s.textContent.includes(src.alias)))return;const style=VectorModel.make('style');style.textContent=entry.css;page.prepend(style);}
  const activated=new Map();
  async function activate(f){
    const name=f.postscriptName;
    if(!activated.has(name)){
      const promise=(async()=>{const bytes=await(await f.blob()).arrayBuffer();await VectorFormats.loadFontReader();
        const parsed=fontkit.create(new Uint8Array(bytes)),weight=parsed['OS/2']?.usWeightClass||styleWeight(f.style),style=italicStyle(f.style);
        const face=await new FontFace(name,bytes,{weight:String(weight),style}).load();document.fonts.add(face);return {face,weight,style};})();
      activated.set(name,promise);promise.catch(()=>activated.delete(name));
    }
    const result=await activated.get(name);sceneFrame.contentDocument?.fonts?.add(result.face);return result;
  }
  function variant(name,weight,style){
    const exact=localMatch(name),group=families.get(norm(exact?.family||name))||[];
    const file=group.find(f=>styleWeight(f.style)===weight&&italicStyle(f.style)===style);
    if(file)return {file,name:file.postscriptName};
    const stem=s=>norm(s).replace(/(extrabold|semibold|medium|black|bold|thin|light|italic|oblique|heavy)+$/,'');
    for(const entry of faces.values())if(entry.embedded&&stem(name)===stem(entry.name)&&entry.weight===weight&&entry.italic===style)return {name:entry.name,origin:{name:entry.name,alias:entry.alias}};
    return null;
  }
  function retain(pages){
    const keep=new Set(pages.flatMap(p=>[...p.querySelectorAll('[data-edit-family]')].map(n=>n.dataset.editFamily)));
    if(typeof VectorTextStyle!=='undefined'&&VectorTextStyle.fontSource)keep.add(VectorTextStyle.fontSource.alias);
    for(const [id,f] of faces)if(!keep.has(id)){if(f.face)document.fonts.delete(f.face);faces.delete(id);}
  }
  return {activate,variant,styleWeight,italicStyle,intrinsic:(src)=>faces.get(src?.alias)?.weight||styleWeight(src?.name),capture,materialize,hydrate,metadata,family,status,rememberLocal,localMatch,exportRuns,retain,include,preview(src,inner){const face=faces.get(src?.alias)?.face;if(face&&inner)inner.fonts.add(face);if(src?.name&&inner)activated.get(src.name)?.then(v=>inner.fonts.add(v.face)).catch(()=>{});}};
})();

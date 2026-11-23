/* Photoshop tracking and manual kerning use thousandths of the local font size.
   Run lengths, like Photoshop text ranges, count UTF-16 code units. */
const TypeSpacing=(()=>{
  const spacingKeys=new Set(['tracking','kerning','autoKerning']);
  function append(out,part,length){
    if(!(length>0))return;
    const last=out.at(-1);
    if(last&&last.delta===part.delta&&last.kern===part.kern&&last.auto===part.auto&&last.optical===part.optical)last.length+=length;
    else out.push({...part,length});
  }
  function captureLayout(layers,stories){
    if(!Array.isArray(stories))return;
    for(let i=0;i<stories.length;i++){
      const tx=layers[i]?.text,story=stories[i];
      if(!tx||tx.shapeType!=='point'||tx.orientation==='vertical'||tx.warp?.style&&tx.warp.style!=='none')continue;
      const text=tx.text.replace(/\r\n?/g,'\n');
      if(typeof story?.Editor?.Text!=='string'||story.Editor.Text.replace(/\r$/,'').replace(/\r/g,'\n')!==text)continue;
      // Match one horizontal glyph to one character. Shaped scripts and ligatures can map differently.
      if(/[\p{Mark}\u0590-\u08ff\u200c-\u200f\ud800-\udfff]/u.test(text)||text.length!==Array.from(text).length)continue;
      const groups=[];
      function visit(node){
        if(node?._type==='/G'){groups.push(node);return;}
        const children=Array.isArray(node?.[6])?node[6]:node?.[2];
        if(Array.isArray(children))children.forEach(visit);
      }
      visit(story['FontVectorData ???']);
      const lines=text.split('\n'),size=tx.styleRuns?.[0]?.style?.fontSize??tx.style?.fontSize;
      if(groups.length!==lines.length||!(size>0))continue;
      const cachedStyle=story.Editor.StyleRun?.RunArray?.[0]?.StyleSheet?.StyleSheetData;
      const tracking=tx.styleRuns?.[0]?.style?.tracking??tx.style?.tracking??0;
      if(cachedStyle&&(Number.isFinite(cachedStyle.FontSize)&&Math.abs(cachedStyle.FontSize-size)>.001||
        Number.isFinite(cachedStyle.Tracking)&&Math.abs(cachedStyle.Tracking-tracking)>.01))continue;
      const stops=[],pairs=[];let valid=true;
      for(const [j,line] of lines.entries()){
        const group=groups[j],glyphs=group[21]?.[0],x=group[21]?.[1],n=line.length;
        if(!Array.isArray(glyphs)||glyphs.length<n||glyphs.length>n+1||!Array.isArray(x)||x.length<n+1||
          !x.slice(0,n+1).every((v,k)=>Number.isFinite(v)&&(!k||v>=x[k-1]))){valid=false;break;}
        stops.push(x.slice(0,n+1).map(v=>(v-x[0])/size));
        const values=group[6]?.[0],lengths=group[6]?.[1],linePairs=[];
        if(Array.isArray(values)&&Array.isArray(lengths)&&values.length===lengths.length){
          for(let k=0;k<values.length&&linePairs.length<n;k++){
            const adjustment=values[k]?.[7]??0;
            if(!Number.isFinite(adjustment)||!Number.isInteger(lengths[k])||lengths[k]<0){valid=false;break;}
            for(let t=0;t<lengths[k]&&linePairs.length<n;t++)linePairs.push(adjustment*1000/size);
          }
        }
        for(let k=0;k<n;k++)pairs.push(k?linePairs[k-1]||0:0);
        if(j<lines.length-1)pairs.push(0);
      }
      if(valid)tx.vqGlyphLayout={text,stops,pairs};
    }
  }
  function positionLine(span,layout,text,line,index,size,spacing,origin,align,firstKern=0){
    if(!layout||layout.text!==text)return;
    const stops=layout.stops[index],n=line.length;if(!stops||stops.length!==n+1||!n)return;
    const delta=spacing-layout.tracking*size/1000;
    const width=stops[n]*size-layout.tracking*size/1000+(n-1)*delta;
    const start=origin-width*({center:.5,right:1}[align]||0)+firstKern*size/1000;
    span.setAttribute('text-anchor','start');
    span.setAttribute('x',stops.slice(0,n).map((v,i)=>start+v*size+i*delta).join(' '));
    for(const child of span.querySelectorAll('[dx]'))child.removeAttribute('dx');
  }
  function readLayout(el){
    try{const data=JSON.parse(el.dataset.glyphLayout||'null');
      if(data&&typeof data.text==='string'&&Number.isFinite(data.tracking)&&Array.isArray(data.stops)&&
        data.stops.every(line=>Array.isArray(line)&&line.every(Number.isFinite)))return data;
    }catch{}
    return null;
  }
  function fromPSD(tx){
    const source=tx.styleRuns||[],base={...tx.style,...source[0]?.style};
    let remaining=tx.text.length;const runs=[];
    for(const run of source.length?source:[{length:remaining,style:{}}]){
      if(!remaining)break;
      const style={...tx.style,...run.style},length=Math.min(remaining,run.length);
      // The renderer has a single font, size and paint per editable text object.
      if(Object.keys({...base,...style}).some(k=>!spacingKeys.has(k)&&JSON.stringify(style[k])!==JSON.stringify(base[k])))return null;
      const part={delta:(style.tracking||0)-(base.tracking||0),kern:style.autoKerning===true?0:(style.kerning||0),auto:style.autoKerning??!style.kerning};
      append(runs,part,length);remaining-=length;
    }
    append(runs,runs.at(-1)||{delta:0,kern:0,auto:true},remaining);
    const cached=tx.vqGlyphLayout,layout=cached?{text:cached.text,stops:cached.stops,tracking:base.tracking||0,font:base.font?.name}:null;
    if(cached?.pairs.some(Boolean)){
      let offset=0;const combined=[];
      for(const run of runs)for(let i=0;i<run.length;i++,offset++){
        const optical=cached.pairs[offset]||0;
        append(combined,optical?{...run,kern:run.kern+optical,auto:false,optical}:run,1);
      }
      return {style:base,runs:combined,layout};
    }
    return {style:base,runs:runs.some(p=>p.delta||p.kern||!p.auto)?runs:null,layout};

  }
  function slice(runs,start,end){
    const out=[];let pos=0;
    for(const run of runs||[]){
      append(out,run,Math.min(end,pos+run.length)-Math.max(start,pos));
      pos+=run.length;if(pos>=end)break;
    }return out;
  }
  function edited(runs,before,after){
    if(!runs||before===after)return runs;
    let left=0,tail=0;
    while(left<before.length&&left<after.length&&before[left]===after[left])left++;
    while(tail<before.length-left&&tail<after.length-left&&before[before.length-1-tail]===after[after.length-1-tail])tail++;
    const out=slice(runs,0,left),inherit=out.at(-1)||runs[0];
    append(out,{...inherit,kern:0,optical:0},after.length-left-tail);
    const suffix=slice(runs,before.length-tail,before.length);
    if(suffix[0]?.optical){
      const first=suffix[0];append(out,{...first,kern:first.kern-first.optical,optical:0},1);
      first.length--;
    }
    for(const r of suffix)append(out,r,r.length);
    return out.length?out:null;
  }
  function paint(span,text,runs,start,size,spacing){
    if(!runs){span.textContent=text;return;}
    span.replaceChildren();let offset=0;
    for(const run of slice(runs,start,start+text.length)){
      const node=span.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan'),value=text.slice(offset,offset+run.length);
      node.textContent=value;node.setAttribute('letter-spacing',spacing+run.delta*size/1000);
      if(!run.auto)node.setAttribute('font-kerning','none');
      if(run.kern)node.setAttribute('dx',Array.from(value,()=>run.kern*size/1000).join(' '));
      span.append(node);offset+=run.length;
    }
    if(offset<text.length)span.append(text.slice(offset));
  }
  function read(el){
    try{const r=JSON.parse(el.dataset.spacingRuns||'null');
      return Array.isArray(r)&&r.length&&r.every(p=>p&&Number.isSafeInteger(p.length)&&p.length>0&&Number.isFinite(p.delta)&&Number.isFinite(p.kern))?r:null;
    }catch{return null;}
  }
  return {captureLayout,positionLine,readLayout,fromPSD,slice,edited,paint,read};
})();

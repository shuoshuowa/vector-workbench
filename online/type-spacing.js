/* Photoshop tracking and manual kerning use thousandths of the local font size.
   Run lengths, like Photoshop text ranges, count UTF-16 code units. */
const TypeSpacing=(()=>{
  const spacingKeys=new Set(['tracking','kerning','autoKerning']);
  function append(out,part,length){
    if(!(length>0))return;
    const last=out.at(-1);
    if(last&&last.delta===part.delta&&last.kern===part.kern&&last.auto===part.auto)last.length+=length;
    else out.push({...part,length});
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
    return {style:base,runs:runs.some(p=>p.delta||p.kern||!p.auto)?runs:null};
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
    append(out,{...inherit,kern:0},after.length-left-tail);
    for(const r of slice(runs,before.length-tail,before.length))append(out,r,r.length);
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
  return {fromPSD,slice,edited,paint,read};
})();

/* PDF text operators can place several unrelated paragraphs in one SVG text element. */
const VectorParagraphs = (() => {
  const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined,{granularity:'grapheme'}) : null;
  const chars = text => graphemes ? Array.from(graphemes.segment(text),part=>part.segment) : Array.from(text);
  const bullet = /^[●•▪◼]/;
  function run(span) {
    const count=span.getNumberOfChars();
    if(!count || !span.x.baseVal.numberOfItems || span.y.baseVal.numberOfItems!==1)return null;
    const x=span.x.baseVal.getItem(0).value,y=span.y.baseVal.getItem(0).value;
    const size=parseFloat(getComputedStyle(span).fontSize),end=span.getEndPositionOfChar(count-1).x;
    if(!Number.isFinite(end)||!(size>0)||end<x)return null;
    return {span,x,y,end,size,weight:getComputedStyle(span).fontWeight,value:span.dataset.unicode??span.textContent};
  }
  function blocks(runs) {
    const out=[];let block,line;
    for(const r of runs){
      const em=r.size,dy=line?r.y-line.y:0,same=!!line&&Math.abs(dy)<em*.20;
      const distinct=!line||bullet.test(r.value.trimStart())||
        (same?(r.x-line.end>em*2.7||r.x<line.x-em*.5):
          (dy<0||dy>em*1.8||r.x>block.right+em||r.end<block.left-em||line.runs[0].weight!==r.weight||Math.abs(line.runs[0].size-em)>.2*em));
      if(distinct){block={lines:[],left:r.x,right:r.end};out.push(block);}
      if(distinct||!same){line={x:r.x,y:r.y,end:r.end,runs:[]};block.lines.push(line);}
      line.runs.push(r);line.end=Math.max(line.end,r.end);block.left=Math.min(block.left,r.x);block.right=Math.max(block.right,r.end);
    }
    return out;
  }
  function logicalText(lines) {
    let text='';
    for(const line of lines){
      const value=line.runs.map(r=>r.value).join('');
      if(/(?:[A-Za-z0-9]|[A-Za-z0-9][.,!?;:])$/.test(text)&&/^[A-Za-z0-9]/.test(value))text+=' ';
      text+=value;
    }
    return text;
  }
  function prepare(root,skipIds=new Set()) {
    let changed=false;
    for(const t of [...root.querySelectorAll('text')]){
      if(t.hasAttribute('data-paragraph-width')||t.closest('defs,clipPath,mask')||skipIds.has(VectorModel.id(t)))continue;
      const spans=[...t.children];
      if(!spans.length||!spans.every(n=>n.localName==='tspan'&&n.hasAttribute('data-unicode')))continue;
      VectorModel.mount(root);
      const runs=spans.filter(n=>n.textContent.length).map(run);if(!runs.length||runs.includes(null))continue;
      const groups=blocks(runs);
      let last=t;
      for(const [i,block] of groups.entries()){
        const el=i?t.cloneNode(false):t,first=block.lines[0],base=first.runs[0];
        if(i){el.removeAttribute('id');if(t.dataset.vq)VectorModel.mark(el,'text');last.after(el);last=el;}
        for(const line of block.lines)for(const r of line.runs)el.append(r.span);
        const gaps=block.lines.slice(1).map((l,j)=>l.y-block.lines[j].y).sort((a,b)=>a-b);
        el.dataset.paragraphWidth=String(Math.max(.01,block.right-block.left));
        el.dataset.paragraphX=String(block.left);el.dataset.paragraphY=String(base.y);
        el.dataset.leading=String(gaps.length?gaps[Math.floor(gaps.length/2)]/base.size:1.2);
        if(block.lines.length>1){
          const spread=values=>Math.max(...values)-Math.min(...values),lines=block.lines,tolerance=.28*base.size;
          if(spread(lines.map(l=>l.x))>2*tolerance){
            if(spread(lines.map(l=>l.end))<=tolerance)el.dataset.textAlign='right';
            else if(spread(lines.map(l=>(l.x+l.end)/2))<=tolerance)el.dataset.textAlign='center';
          }
        }
        el.dataset.text=logicalText(block.lines);
        if(block.lines.some(l=>l.runs.some(r=>r.span.dataset.pdfSpacing))){
          const parts=[];let offset=0;
          for(const l of block.lines)for(const r of l.runs){
            const start=el.dataset.text.indexOf(r.value,offset);
            if(start>offset)parts.push([start-offset,parts.at(-1)?.[1]||0]);
            parts.push(...JSON.parse(r.span.dataset.pdfSpacing||JSON.stringify([[r.value.length,0]])));
            offset=Math.max(offset,start)+r.value.length;
          }
          const counts=new Map();for(const [length,s] of parts)counts.set(s,(counts.get(s)||0)+length);
          const spacing=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||0;el.dataset.tracking=String(spacing);
          if(parts.some(p=>p[1]!==spacing))el.dataset.spacingRuns=JSON.stringify(parts.map(([length,s])=>({length,delta:(s-spacing)*1000/base.size,kern:0,auto:true})));
        }
        if(base.span.dataset.originalFont){el.dataset.originalFont=base.span.dataset.originalFont;el.dataset.editFamily=base.span.dataset.editFamily;}
      }
      changed=true;
    }
    return changed;
  }
  function alignment(value){return ['center','middle','justify-center'].includes(value)?'center':['right','end','justify-right'].includes(value)?'right':'left';}
  const anchor=align=>({left:'start',center:'middle',right:'end'})[alignment(align)];
  const fraction=align=>({left:0,center:.5,right:1})[alignment(align)];
  function info(el){
    const width=Number(el.dataset.paragraphWidth);
    if(!(width>0&&Number.isFinite(width)))return null;
    return {width,point:el.dataset.psdPoint==='1',runs:TypeSpacing.read(el),align:alignment(el.dataset.textAlign),x:Number(el.dataset.paragraphX)||0,y:Number(el.dataset.paragraphY)||0,leading:Number(el.dataset.leading)||1.2,height:Number(el.dataset.paragraphHeight)||0,advance:Number(el.dataset.lineAdvance)||0,spacing:Number(el.dataset.tracking)||0};
  }
  // The native canvas input and SVG exporter share the browser's line-breaking rules.
  const mirror=document.createElement('div'),metricsText=document.createTextNode(''),marker=document.createElement('span');
  mirror.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;margin:0;border:0;padding:0';
  marker.style.cssText='display:inline-block;width:0;height:0;vertical-align:baseline';
  mirror.append(metricsText);document.body.append(mirror);
  function typography(width,size,family,weight,style,spacing,advance,align='left'){
    return {width:width*100/size+'px',fontFamily:family,fontWeight:weight||'400',fontStyle:style||'normal',fontSize:'100px',
      letterSpacing:(spacing||0)*100/size+'px',lineHeight:advance*100/size+'px',whiteSpace:'pre-wrap',overflowWrap:'anywhere',
      wordBreak:'normal',lineBreak:'auto',textAlign:alignment(align),textIndent:'0',tabSize:'8',direction:'ltr'};
  }
  let previousKey='',previousLines=[],baselineKey='',baselineOffset=0;
  function baseline(styles){
    const key=JSON.stringify(styles);if(key===baselineKey)return baselineOffset;
    Object.assign(mirror.style,styles);metricsText.data='';mirror.append(marker);
    baselineOffset=marker.getBoundingClientRect().top-mirror.getBoundingClientRect().top;marker.remove();baselineKey=key;
    return baselineOffset;
  }
  function splitLines(text,width,size,family,weight,style,spacing,runs){
    const key=JSON.stringify([text,width,size,family,weight,style,spacing,runs]);
    if(key===previousKey)return previousLines;
    Object.assign(mirror.style,typography(width,size,family,weight,style,spacing,size*1.2));
    const range=document.createRange(),lines=[];let offset=0;
    for(const source of text.replace(/\r\n?/g,'\n').split('\n')){
      const start=offset;offset+=source.length+1;
      if(!source){lines.push('');continue;}
      mirror.replaceChildren(metricsText);metricsText.data=source;
      const nodes=[];
      if(runs){
        mirror.replaceChildren();let pos=0;
        for(const part of TypeSpacing.slice(runs,start,start+source.length)){
          const span=document.createElement('span');
          span.style.letterSpacing=(spacing*100/size+(part.delta+part.kern)/10)+'px';
          span.textContent=source.slice(pos,pos+part.length);mirror.append(span);
          nodes.push({node:span.firstChild,start:pos,end:pos+part.length});pos+=part.length;
        }
      }
      const offsets=[0];
      for(const cluster of chars(source))offsets.push(offsets.at(-1)+cluster.length);
      const top=i=>{const at=offsets[i],part=nodes.find(n=>n.start<=at&&at<n.end);
        const node=part?.node||metricsText,j=at-(part?.start||0);
        range.setStart(node,j);range.setEnd(node,Math.min(node.length,j+offsets[i+1]-at));return range.getBoundingClientRect().top;};
      // Several scripts on one baseline can use fonts with different ascenders.
      for(let i=0;i<offsets.length-1;){
        const start=i,y=top(i);let lo=i+1,hi=offsets.length-1;
        while(lo<hi){const mid=Math.floor((lo+hi)/2);if(top(mid)<y+60)lo=mid+1;else hi=mid;}
        i=lo;const line=source.slice(offsets[start],offsets[i]);lines.push(i<offsets.length-1?line.trimEnd():line);
      }
    }
    mirror.replaceChildren(metricsText);previousKey=key;previousLines=lines;return lines;
  }
  function render(el,text,frame,size,font,weight='400',style='normal'){
    // Embedded subsets often encode the visible glyphs in the private-use area.
    const family=/^["']?g_d\d+_/i.test(font)?'"Microsoft YaHei", sans-serif':font||'sans-serif';
    el.style.fontFamily=family;el.style.fontSize=size+'px';el.style.fontWeight=weight;el.style.fontStyle=style;
    el.setAttribute('xml:space','preserve');
    const spacing=frame.spacing||0,advance=frame.advance||frame.leading*size;
    el.style.letterSpacing=spacing+'px';const all=frame.point?text.split('\n'):splitLines(text,frame.width,size,family,weight,style,spacing,frame.runs);
    const lines=frame.height>0?all.slice(0,Math.max(1,1+Math.floor((frame.height-size+.0001)/advance))):all;
    el.dataset.overflow=String(all.length-lines.length);
    let cursor=0;
    el.replaceChildren(...lines.map((line,i)=>{
      const span=el.ownerDocument.createElementNS('http://www.w3.org/2000/svg','tspan');
      span.setAttribute('x',frame.x+frame.width*fraction(frame.align));span.setAttribute('text-anchor',anchor(frame.align));span.setAttribute('y',frame.y+i*advance);span.dataset.line='1';const start=text.indexOf(line,cursor);TypeSpacing.paint(span,line,frame.runs,Math.max(0,start),size,spacing);cursor=Math.max(cursor,start+line.length);if(text[cursor]==='\n')cursor++;return span;
    }));
    return lines.length;
  }
  function store(el,p){
    for(const [key,value] of Object.entries({paragraphWidth:p.width,paragraphX:p.x,paragraphY:p.y,leading:p.leading,paragraphHeight:p.height||0,lineAdvance:p.advance||0,tracking:p.spacing||0}))el.dataset[key]=String(value);
    if(p.runs)el.dataset.spacingRuns=JSON.stringify(p.runs);else delete el.dataset.spacingRuns;
    if(p.point===true)el.dataset.psdPoint='1';else if(p.point===false)delete el.dataset.psdPoint;
    el.dataset.textAlign=alignment(p.align);
  }
  function inferred(el){
    const b=el.getBBox(),span=el.querySelector('tspan')||el,size=parseFloat(getComputedStyle(span).fontSize)||12;
    const first=el.getNumberOfChars()?el.getStartPositionOfChar(0):{x:b.x,y:b.y+size*.8};
    const align=alignment(getComputedStyle(span).textAnchor),width=Math.max(b.width,size),explicit=span.x?.baseVal?.numberOfItems?span.x.baseVal:el.x?.baseVal;
    const x=align!=='left'&&explicit?.numberOfItems?explicit.getItem(0).value-width*fraction(align):first.x;
    return {x,y:first.y,width,align,height:0,advance:0,spacing:parseFloat(getComputedStyle(span).letterSpacing)||0,leading:1.2};
  }
  const svgNS='http://www.w3.org/2000/svg',pt=25.4/72;
  const probeSvg=document.createElementNS(svgNS,'svg'),probe=document.createElementNS(svgNS,'text');
  probeSvg.style.cssText='position:fixed;left:-20000px;visibility:hidden;pointer-events:none';probeSvg.append(probe);document.body.append(probeSvg);
  function fontSize(o){const m=o.paragraph.matrix;return o.pt*pt/(Math.hypot(m[2],m[3])||1);}
  function paint(el,o){
    const f=o.paragraph;el.setAttribute('fill',o.fill||'#000');render(el,o.text,f,fontSize(o),VectorFonts.family(o.font,o.fontSource),f.weight,f.style);
  }
  function update(o){
    paint(probe,o);const b=probe.getBBox(),m=new DOMMatrix(o.paragraph.matrix),corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
    const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y);
    o.box={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(.01,Math.max(...xs)-Math.min(...xs)),h:Math.max(.01,Math.max(...ys)-Math.min(...ys))};o.hit={...o.box};o.paragraphDirty=true;o.overflow=Number(probe.dataset.overflow);
  }
  function previewMatrix(o,box){
    const b=o.box;return new DOMMatrix().translate(box.x,box.y).scale(box.w/b.w,box.h/b.h).translate(-b.x,-b.y).multiply(new DOMMatrix(o.paragraph.matrix));
  }
  function geometry(o,from,to){
    const p=o.paragraph,m=new DOMMatrix(p.matrix),sx=to.w/from.w,sy=to.h/from.h;
    const n=new DOMMatrix().translate(to.x,to.y).scale(sx,sy).translate(-from.x,-from.y).multiply(m);
    o.pt*=Math.hypot(n.c,n.d)/(Math.hypot(m.c,m.d)||1);p.matrix=[n.a,n.b,n.c,n.d,n.e,n.f];
  }
  return {alignment,anchor,fraction,prepare,info,render,typography,baseline,splitLines,store,inferred,fontSize,paint,update,previewMatrix,geometry};
})();

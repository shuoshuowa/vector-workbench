/* Used inside the SVG-to-PDFKit adapter. Emit a positioned PDF text run instead of
   resetting the text matrix before every glyph. Illustrator can then edit words/lines. */
function writeVectorTextRuns(positions,fontState,doc,setMatrix) {
  const font=fontState.font,size=fontState.size,skew=fontState.fauxItalic?-.25:0;
  let run=[],hex='',first=null,previous=null,cos=1,sin=0;
  function flushHex(){if(hex){run.push('<'+hex+'>');hex='';}}
  function flush(){
    if(!first)return;
    flushHex();
    doc.addContent(run.length===1?run[0]+' Tj':'['+run.join(' ')+'] TJ');
    run=[];previous=first=null;
  }
  for(const p of positions){
    if(p.hidden||p.width===0)continue;
    if(previous){
      const dx=p.x-previous.x,dy=p.y-previous.y,along=dx*cos+dy*sin,across=dy*cos-dx*sin;
      if(Math.abs(across)>Math.max(.00001,size*.0001)||p.scale!==first.scale||p.rotate!==first.rotate||!p.scale||along<-.001||along>previous.width+size*3){
        flush();
      }else{
        const pdfWidth=font.widths?.[parseInt(previous.glyph,16)]??previous.width*1000/(size*previous.scale);
        const adjust=pdfWidth-along*1000/(size*previous.scale);
        if(Math.abs(adjust)>.0001){flushHex();run.push(String(Number(adjust.toFixed(5))));}
      }
    }
    if(!first){
      first=p;cos=Math.cos(p.rotate);sin=Math.sin(p.rotate);
      setMatrix(cos*p.scale,sin*p.scale,cos*skew-sin,sin*skew+cos,p.x,p.y);
    }
    hex+=p.glyph;previous=p;
  }
  flush();
}

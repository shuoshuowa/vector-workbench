/* One-sided outlines are ordinary clipped vector paths. The foreground text
   still uses the writer's normal selectable PDF text operators. */
function vectorEdge(doc,position,width,bounds,path,rule){
  const [x,y,right,bottom]=bounds,pad=width*2+1;
  doc.save();
  if(position==='outside')doc.rect(x-pad,y-pad,right-x+2*pad,bottom-y+2*pad);
  path();doc.clip(position==='outside'?'even-odd':rule||'non-zero');path();doc.lineWidth(width).lineJoin('round').stroke();doc.restore();
}
function glyphEdge(doc,position,width,positions,fontState){
  const embedded=fontState.font,font=embedded.font,scale=fontState.size/font.unitsPerEm,ops=[];
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of positions){
    if(p.hidden)continue;const gid=embedded.subset.glyphs[parseInt(p.glyph,16)],glyph=font.getGlyph(gid);
    const cos=Math.cos(p.rotate),sin=Math.sin(p.rotate),skew=fontState.fauxItalic?-.25:0;
    for(const c of glyph.path.commands){
      const args=[];for(let i=0;i<c.args.length;i+=2){
        const x=c.args[i]*scale*p.scale-c.args[i+1]*scale*skew,y=-c.args[i+1]*scale;
        const X=p.x+cos*x-sin*y,Y=p.y+sin*x+cos*y;args.push(X,Y);
        left=Math.min(left,X);right=Math.max(right,X);top=Math.min(top,Y);bottom=Math.max(bottom,Y);
      }ops.push([c.command,args]);
    }
  }
  if(Number.isFinite(left))vectorEdge(doc,position,width,[left,top,right,bottom],()=>{for(const [op,args] of ops)doc[op](...args);});
}

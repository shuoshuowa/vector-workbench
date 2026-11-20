/* Copy visual text attributes in document units. Frame geometry belongs to the destination. */
const VectorTextStyle=(()=>{
  const PT=25.4/72;
  let clipboard=null;
  function scales(m){return {x:Math.hypot(m[0],m[1])||1,y:Math.hypot(m[2],m[3])||1};}
  function source(o){
    const f=o.paragraph,k=scales(f.matrix);
    return {font:o.font,origin:o.fontSource?.name===o.font?{...o.fontSource}:null,pt:o.pt,fill:o.fill||'#000000',
      weight:f.weight,style:f.style,leading:f.leading,advancePt:f.advance*k.y/PT,trackingPt:f.spacing*k.x/PT,stroke:o.stroke?{...o.stroke}:null};
  }
  function applyFrame(f,s,k){Object.assign(f,{weight:s.weight,style:s.style,leading:s.leading,advance:s.advancePt*PT/k.y,spacing:s.trackingPt*PT/k.x});}
  function project(o,s){
    applyFrame(o.paragraph,s,scales(o.paragraph.matrix));
    Object.assign(o,{pt:s.pt,font:s.font,fontSource:s.origin?{...s.origin}:null,fill:s.fill,filled:true,stroke:s.stroke?{...s.stroke}:null});
    VectorParagraphs.update(o);
  }
  function commit(page,e,s){
    const M=VectorModel,m=M.world(page,e),k=scales([m.a,m.b,m.c,m.d]),f=VectorParagraphs.info(e)||VectorParagraphs.inferred(e);
    const value=e.dataset.text??e.textContent;
    applyFrame(f,s,k);VectorParagraphs.store(e,f);
    for(const n of [e,...e.querySelectorAll('tspan')]){delete n.dataset.originalFont;delete n.dataset.editFamily;n.style.fill=s.fill;n.style.fontWeight=s.weight;n.style.fontStyle=s.style;}
    if(s.origin){e.dataset.originalFont=s.origin.name;if(s.origin.alias)e.dataset.editFamily=s.origin.alias;VectorFonts.include(page,s.origin);}
    e.style.stroke=s.stroke?.enabled?s.stroke.color||'#000':'none';e.style.strokeWidth=((s.stroke?.width||1)*PT/k.y)+'px';
    M.setText(e,{value,font:s.font,pt:s.pt});
  }
  function selectedText(){return pickedItems().filter(o=>o.type==='text'&&o.paragraph&&!o.locked);}
  function copy(){
    const o=chosen();if(!o?.paragraph)return;clipboard=source(o);update();$('message').textContent='已复制文字样式 · '+o.font+' · '+num(o.pt)+' pt';
  }
  function paste(){
    const targets=selectedText();if(!clipboard||!targets.length)return;
    VectorFonts.preview(clipboard.origin,sceneFrame.contentDocument);
    changeLocally(targets.map(o=>({kind:'typeStyle',id:o.id,style:structuredClone(clipboard)})));
    props();selectionBox(chosen()?.hit);$('message').textContent='已将文字样式应用到 '+targets.length+' 段文字';
  }
  const actions=document.createElement('div');actions.className='text-style-actions';
  const copyButton=document.createElement('button'),pasteButton=document.createElement('button'),manyButton=document.createElement('button');
  copyButton.id='copyTextStyle';copyButton.textContent='复制文字样式';pasteButton.id='pasteTextStyle';pasteButton.textContent='应用文字样式';
  manyButton.id='pasteStylesToSelection';manyButton.className='wide';for(const b of [copyButton,pasteButton,manyButton])b.type='button';
  copyButton.onclick=copy;pasteButton.onclick=manyButton.onclick=paste;actions.append(copyButton,pasteButton);$('typeBox').append(actions);$('multiPanel').append(manyButton);
  function update(){const count=selectedText().length;copyButton.disabled=!chosen()?.paragraph;pasteButton.disabled=!clipboard||!count;
    manyButton.hidden=count===0;manyButton.disabled=!clipboard;manyButton.textContent='应用文字样式到所选文字（'+count+'）';
    const hint=clipboard?clipboard.font+' · '+num(clipboard.pt)+' pt':'先从一段文字复制样式';pasteButton.title=manyButton.title=hint;}
  update();
  return {source,project,commit,update,get fontSource(){return clipboard?.origin;}};
})();

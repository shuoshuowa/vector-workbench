/* A native text input lives on the page, in the same coordinate system as the selected text. */
(() => {
  const paper=$('paper'),input=document.createElement('textarea');
  input.id='canvasTextInput';input.setAttribute('aria-label','画板文字编辑');input.setAttribute('wrap','soft');input.rows=1;
  input.spellcheck=false;input.hidden=true;paper.append(input);
  let session=null,frame=0,composing=false;
  const muted=new Set();
  function mute(node){if(node&&!muted.has(node)){node.setAttribute('data-inline-muted','1');muted.add(node);}}
  function sync(){
    frame=0;if(!session)return;
    const o=chosen();if(o?.id!==session.id||tool!=='select'||!doc()){finish(false);return;}
    const f=o.paragraph,size=VectorParagraphs.fontSize(o),advance=f.advance||f.leading*size;
    const family=VectorFonts.family(o.font,o.fontSource),styles=VectorParagraphs.typography(f.width,size,family,f.weight,f.style,f.spacing,advance);
    const baseline=VectorParagraphs.baseline(styles),unit=size/100;
    const m=new DOMMatrix().scale(px).multiply(new DOMMatrix(f.matrix)).translate(f.x,f.y-baseline*unit).scale(unit);
    Object.assign(input.style,styles,{transform:m.toString(),color:o.fill||'#222'});
    const count=VectorParagraphs.splitLines(input.value,f.width,size,family,f.weight,f.style,f.spacing).length;
    const visible=f.height?Math.max(1,1+Math.floor((f.height-size+.0001)/advance)):count;
    input.style.height=Math.ceil(visible*advance/unit+1)+'px';
    const scene=activeScene?.key===doc().preview?activeScene.nodes.get(o.id):null;
    if(scene){
      const inner=scene.el.ownerDocument;
      if(!inner.getElementById('canvasTypeVisibility')){const style=inner.createElement('style');style.id='canvasTypeVisibility';style.textContent='[data-inline-muted]{opacity:0!important}';inner.head.append(style);}
      mute(scene.el);mute(scene.textProxy);
    }
    for(const layer of [localOverlay,fallbackTextOverlay])for(const el of layer.children)if(el.dataset.id===o.id)mute(el);
    input.style.backgroundColor=scene||isLocalItem(o.id)?'transparent':samplePaper(o.box,doc());
  }
  function schedule(){if(session&&!frame)frame=requestAnimationFrame(sync);}
  function publish(){
    const o=chosen();if(!session||o?.id!==session.id||o.text===input.value)return;
    const value=input.value;$('content').value=value;
    changeLocally([{kind:'text',id:o.id,value,pt:null,font:''}],session.key);
    const label=[...$('objects').querySelectorAll('.object')].find(el=>el.dataset.id===o.id);
    if(label)label.lastElementChild.textContent=o.name;
    schedule();
  }
  function finish(save=true){
    if(!session)return;
    if(save)publish();
    session=null;composing=false;cancelAnimationFrame(frame);frame=0;inputUndoKey='';
    input.hidden=true;paper.classList.remove('typing-on-board');
    for(const node of muted)node.removeAttribute('data-inline-muted');muted.clear();
    scheduleLayout();
  }
  // Map the actual painted glyph under the pointer back to its logical UTF-16 position.
  function hitCaret(o,event){
    if(!event)return o.text.length;
    const n=activeScene?.nodes.get(o.id);
    const drawing=n?.textProxy||n?.el||[...localOverlay.children].find(e=>e.dataset.id===o.id);
    const text=drawing?.localName==='text'?drawing:drawing?.querySelector('text');
    if(!text)return o.text.length;
    const iframe=text.ownerDocument!==document,rect=iframe?sceneFrame.getBoundingClientRect():{left:0,top:0};
    const spans=[...text.querySelectorAll('tspan')].filter(s=>!s.querySelector('tspan'));
    let offset=0,best=null;
    for(const span of spans.length?spans:[text]){
      const logical=span.dataset.unicode??span.textContent;
      const start=o.text.indexOf(logical,offset),count=span.getNumberOfChars();if(start<0||!count)continue;
      offset=start+logical.length;
      const matrix=span.getScreenCTM();if(!matrix)continue;
      const local=new DOMPoint(event.clientX-rect.left,event.clientY-rect.top).matrixTransform(matrix.inverse());
      const glyph=span.getCharNumAtPosition(local);
      const b=span.getBBox(),dist=Math.max(b.y-local.y,local.y-b.y-b.height,0)*4+Math.max(b.x-local.x,local.x-b.x-b.width,0);
      if(glyph<0&&best&&dist>=best.dist)continue;
      let i=glyph;
      if(i<0){let lo=0,hi=count;while(lo<hi){const mid=(lo+hi)>>1;if(span.getEndPositionOfChar(mid).x<local.x)lo=mid+1;else hi=mid;}i=Math.min(lo,count-1);}
      const a=span.getStartPositionOfChar(i),z=span.getEndPositionOfChar(i);
      const right=(local.x-a.x)*(z.x-a.x)+(local.y-a.y)*(z.y-a.y)>((z.x-a.x)**2+(z.y-a.y)**2)/2;
      const index=start+Math.round((i+(right?1:0))*logical.length/count);
      if(glyph>=0)return index;best={dist,index};
    }
    return best?.index??o.text.length;
  }
  function begin(event,selectAll=false){
    const o=chosen();if(working||!o?.paragraph||o.type!=='text')return;
    finish();const caret=hitCaret(o,event);if(small())panel();clearTimeout(layoutTimer);
    session={id:o.id,key:'canvas-text-'+crypto.randomUUID()};input.value=o.text;input.hidden=false;paper.classList.add('typing-on-board');
    sync();input.focus({preventScroll:true});input.setSelectionRange(selectAll?0:caret,selectAll?input.value.length:caret);
  }
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;publish();schedule();});
  input.addEventListener('input',event=>{if(!composing&&!event.isComposing)publish();schedule();});
  input.addEventListener('blur',()=>{if(session)finish();});
  for(const type of ['pointerdown','pointermove','pointerup','click','dblclick'])input.addEventListener(type,e=>e.stopPropagation());
  input.addEventListener('wheel',e=>{if(!e.ctrlKey)e.stopPropagation();},{passive:true});
  input.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(composing||e.isComposing||e.keyCode===229)return;
    if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){e.preventDefault();finish();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();finish();$('export').click();}
  });
  // Canvas pointer handlers use preventDefault, so a click on the page may not cause a blur.
  document.addEventListener('pointerdown',e=>{if(session&&e.target!==input)finish();},true);
  window.addEventListener('pagehide',()=>{if(session){publish();persistLocalDraft();}});
  function frameAt(pos){
    const o=chosen();if(!o?.paragraph||!paper.classList.contains('editing-text-frame')||photoTarget||tool!=='select')return null;
    const f=o.paragraph,at=new DOMPoint(pos.x,pos.y).matrixTransform(new DOMMatrix(f.matrix).inverse()),size=VectorParagraphs.fontSize(o);
    const bounds=$('paragraphFrame').querySelector('polygon').points;
    if(bounds.numberOfItems!==4)return null;
    const last=bounds.getItem(2),bottom=new DOMPoint(last.x,last.y).matrixTransform(new DOMMatrix(f.matrix).inverse()).y;
    return at.x>=f.x&&at.x<=f.x+f.width&&at.y>=f.y-size*.86&&at.y<=bottom?o:null;
  }
  window.CanvasType={begin,schedule,frameAt,get active(){return !!session;}};
})();

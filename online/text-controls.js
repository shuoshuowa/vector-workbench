/* Online paragraph inspector and frame handles. Frame measurements stay in the text's local axes. */
(() => {
  const ns='http://www.w3.org/2000/svg',ptMM=25.4/72;
  let mode='layer',gesture=null,tick=0;
  const panel=document.createElement('div');panel.className='text-layout-controls';
  panel.innerHTML='<div class="text-modes"><button type="button" data-text-mode="layer">文字图层</button><button type="button" data-text-mode="frame">文本框</button></div><small id="textModeHint"></small><div class="paragraph-align" role="group" aria-label="段落对齐"><button type="button" data-paragraph-align="left">左对齐</button><button type="button" data-paragraph-align="center">居中</button><button type="button" data-paragraph-align="right">右对齐</button></div><div class="source-font-info"><small id="sourceFontInfo"></small><button type="button" id="matchSourceFont" hidden>匹配本机原字体</button></div><div class="text-metrics"><label>行高 (pt)<input id="textLeading" type="number" min="0.1" max="2000" step="any" placeholder="自动"></label><label>字间距 (pt)<input id="textTracking" type="number" min="-100" max="1000" step="any"></label><label>框宽 (mm)<input id="textFrameWidth" type="number" min=".1" max="5000" step="any"></label><label>框高 (mm)<input id="textFrameHeight" type="number" min=".1" max="5000" step="any" placeholder="自动"></label></div><small id="textOverflow" role="status"></small>';
  $('typeBox').append(panel);
  const overlay=document.createElementNS(ns,'svg');overlay.id='paragraphFrame';overlay.setAttribute('aria-hidden','true');$('paper').append(overlay);
  const outline=document.createElementNS(ns,'polygon');outline.setAttribute('vector-effect','non-scaling-stroke');overlay.append(outline);
  const handles={};for(const edge of ['left','right','top','bottom']){
    const dot=document.createElementNS(ns,'circle');dot.dataset.frameEdge=edge;dot.setAttribute('vector-effect','non-scaling-stroke');overlay.append(dot);handles[edge]=dot;
  }
  function localFrame(o){
    const f=o.paragraph,size=VectorParagraphs.fontSize(o),m=new DOMMatrix(f.matrix),inv=m.inverse();
    const corners=[[o.box.x,o.box.y],[o.box.x+o.box.w,o.box.y+o.box.h],[o.box.x+o.box.w,o.box.y],[o.box.x,o.box.y+o.box.h]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(inv));
    const top=f.y-size*.86;
    const bottom=Math.max(top+size, ...corners.map(p=>p.y));return {x:f.x,y:top,width:f.width,height:f.height||bottom-top,m,size,sx:Math.hypot(m.a,m.b),sy:Math.hypot(m.c,m.d)};
  }
  $('matchSourceFont').onclick=async()=>{
    const o=chosen();if(!o?.font)return;
    try{fontList=await VectorFormats.fonts();const f=VectorFonts.localMatch(o.font,o.paragraph.weight,o.paragraph.style);
      if(!f){error('未匹配到 '+o.font+'。请检查浏览器的本机字体权限以及该字体是否已安装。');return;}
      await VectorFonts.activate(f);
      $('message').textContent='已匹配 '+f.fullName;update();
    }catch{error('浏览器未能读取本机字体，请检查本机字体访问权限。');}
  };
  function setField(id,value){if(document.activeElement!==$(id))$(id).value=value==null?'':+value.toFixed(3);}
  function update(){
    tick=0;const o=chosen(),active=!!o?.paragraph&&tool==='select'&&!photoTarget;
    const framing=active&&mode==='frame';overlay.style.display=framing?'block':'none';
    $('paper').classList.toggle('editing-text-frame',framing);panel.hidden=!o?.paragraph;
    if(!o?.paragraph)return;
    const f=o.paragraph,b=localFrame(o);
    $('sourceFontInfo').textContent=VectorFonts.status(o);
    $('matchSourceFont').hidden=!o.font||/^(serif|sans-serif|monospace)$/.test(o.font)||!!VectorFonts.localMatch(o.font);
    for(const button of panel.querySelectorAll('[data-paragraph-align]'))button.setAttribute('aria-pressed',String(button.dataset.paragraphAlign===(f.align||'left')));
    for(const button of panel.querySelectorAll('[data-text-mode]'))button.setAttribute('aria-pressed',String(button.dataset.textMode===mode));
    $('textModeHint').textContent=mode==='frame'?'拖动绿色边点调整排版范围，保持字号。':'双击文字直接输入。拖动蓝色角点缩放，Shift 等比缩放。';
    setField('textLeading',f.advance?f.advance*b.sy/ptMM:null);$('textLeading').placeholder='自动 · '+Number((f.leading*o.pt).toFixed(2));
    setField('textTracking',(f.spacing||0)*b.sx/ptMM);setField('textFrameWidth',f.width*b.sx);setField('textFrameHeight',f.height?f.height*b.sy:null);
    $('textOverflow').textContent=o.overflow?'另有 '+o.overflow+' 行超出框高。拉高文本框或清空框高可显示。':'';
    if(!framing)return;
    overlay.setAttribute('viewBox','0 0 '+doc().width+' '+doc().height);
    const map=(x,y)=>new DOMPoint(b.x+x*b.width,b.y+y*b.height).matrixTransform(b.m);
    outline.setAttribute('points',[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>{const p=map(x,y);return p.x+','+p.y;}).join(' '));
    for(const [edge,x,y] of [['left',0,.5],['right',1,.5],['top',.5,0],['bottom',.5,1]]){const p=map(x,y),h=handles[edge];h.setAttribute('cx',p.x);h.setAttribute('cy',p.y);h.setAttribute('r',4.5/px);}
  }
  function schedule(){if(!tick)tick=requestAnimationFrame(update);}
  function settings(f){return {align:f.align||'left',width:f.width,height:f.height||0,x:f.x,y:f.y,leading:f.leading,advance:f.advance||0,spacing:f.spacing||0};}
  function set(o,frame,key){changeLocally([{kind:'paragraph',id:o.id,frame}],key);schedule();}
  panel.addEventListener('click',e=>{const align=e.target.dataset.paragraphAlign;if(align&&chosen()?.paragraph){set(chosen(),{...settings(chosen().paragraph),align},'');return;}const v=e.target.dataset.textMode;if(v){mode=v;update();}});
  panel.addEventListener('input',e=>{const el=e.target,o=chosen();if(el.tagName!=='INPUT'||!o?.paragraph||el.validity.badInput||!el.validity.valid)return;
    const n=el.value===''?null:el.valueAsNumber,b=localFrame(o),f=settings(o.paragraph);
    switch(el.id){case 'textLeading':f.advance=n===null?0:n*ptMM/b.sy;break;case 'textTracking':f.spacing=(n||0)*ptMM/b.sx;break;
      case 'textFrameWidth':if(n===null)return;f.width=n/b.sx;break;case 'textFrameHeight':f.height=n===null?0:n/b.sy;break;default:return;}
    set(o,f,o.id+'|'+el.id);
  });
  function localPoint(e,b){const p=point(e.clientX,e.clientY);return new DOMPoint(p.x,p.y).matrixTransform(b.m.inverse());}
  overlay.addEventListener('pointerdown',e=>{const edge=e.target.dataset.frameEdge,o=chosen();if(!edge||!o?.paragraph||working)return;e.preventDefault();e.stopPropagation();const b=localFrame(o);
    gesture={id:e.pointerId,edge,o,b,start:localPoint(e,b),f:settings(o.paragraph),key:crypto.randomUUID()};overlay.setPointerCapture(e.pointerId);});
  overlay.addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;e.stopPropagation();const {edge,o,b,start,key}=gesture,f={...gesture.f},p=localPoint(e,b),dx=p.x-start.x,dy=p.y-start.y;
    if(edge==='right')f.width=Math.max(.1/b.sx,b.width+dx);
    if(edge==='left'){f.width=Math.max(.1/b.sx,b.width-dx);f.x+=b.width-f.width;}
    if(edge==='bottom')f.height=Math.max(b.size,b.height+dy);
    if(edge==='top'){f.height=Math.max(b.size,b.height-dy);f.y+=b.height-f.height;}
    set(o,f,key);});
  const finish=e=>{if(gesture?.id===e.pointerId){e.stopPropagation();gesture=null;inputUndoKey='';}};
  overlay.addEventListener('pointerup',finish);overlay.addEventListener('lostpointercapture',finish);
  overlay.addEventListener('pointercancel',e=>{if(gesture?.id===e.pointerId){if(layoutSteps.at(-1)?.[0]?.kind==='paragraph'&&inputUndoKey===gesture.key){layoutSteps.pop();projectDrafts();}finish(e);}});
  window.VectorTextControls={schedule};schedule();
})();

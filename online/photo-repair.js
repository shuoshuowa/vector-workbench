(() => {
  const button=document.createElement('button');button.id='repairPhoto';button.type='button';button.className='wide';button.textContent='涂抹移除…';$('maskBox').append(button);
  const dialog=document.createElement('dialog');dialog.id='repairDialog';
  dialog.innerHTML='<h2>涂抹移除</h2><p>涂满要去掉的杂物或文字，再预览周围纹理的填充效果。</p><div class="repair-tools"><label>笔刷直径 <input id="repairBrush" type="range" min="2" max="240" value="24"><output id="brushValue"></output></label><button data-r="erase" aria-pressed="false">减去选区</button><button data-r="undo">撤销笔画</button><button data-r="clear">清空</button><button data-r="minus" aria-label="缩小照片">−</button><button data-r="fit">适应</button><button data-r="plus" aria-label="放大照片">＋</button></div><div class="repair-scroll"><div class="repair-picture"><canvas id="repairPixels"></canvas><canvas id="repairMask" aria-label="在照片上涂抹修补选区"></canvas><i></i></div></div><div class="repair-status" role="status"></div><div class="end-actions"><button data-r="cancel">取消</button><button data-r="compare" hidden>查看原图</button><button data-r="preview">预览填充</button><button id="applyRepair" data-r="apply" class="primary" disabled>应用到图片</button></div>';
  document.body.append(dialog);const pixels=$('repairPixels'),mask=$('repairMask'),picture=dialog.querySelector('.repair-picture'),scroll=dialog.querySelector('.repair-scroll'),ring=picture.querySelector('i'),status=dialog.querySelector('.repair-status');
  let s=null,sequence=0;
  const cmd=k=>dialog.querySelector('[data-r="'+k+'"]');
  function update(){const o=chosen();button.hidden=!o||!['image','mask'].includes(o.type)||!VectorBrowser.photoSource(o.cloneOf||o.id);}
  function stop(){if(s?.worker){s.worker.terminate();s.worker=null;}}
  function showResult(repaired){if(!s?.result)return;s.ctx.putImageData(repaired?s.result:s.base,s.roi.x,s.roi.y);s.showing=repaired;mask.style.opacity='0';cmd('compare').textContent=repaired?'查看原图':'查看修复';}
  function invalidate(){stop();if(s?.result){s.ctx.putImageData(s.base,s.roi.x,s.roi.y);s.result=null;s.base=null;}mask.style.opacity='';cmd('compare').hidden=true;cmd('apply').disabled=true;status.textContent='';cmd('preview').disabled=!s?.strokes.length;}
  function close(){sequence++;stop();s=null;dialog.close();pixels.width=mask.width=pixels.height=mask.height=1;ring.hidden=true;}
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(!s?.applying)close();});
  function zoom(value){if(!s)return;s.zoom=Math.max(.015,Math.min(12,value));picture.style.width=s.w*s.zoom+'px';picture.style.height=s.h*s.zoom+'px';}
  function fit(){if(s)zoom(Math.min((scroll.clientWidth-12)/s.w,(scroll.clientHeight-12)/s.h,2));}
  function brush(){const radius=+$('repairBrush').value;$('brushValue').value=radius+' px';if(s){ring.style.width=ring.style.height=radius*s.zoom+'px';}}
  $('repairBrush').oninput=brush;
  button.onclick=async()=>{
    const o=chosen(),src=o&&VectorBrowser.photoSource(o.cloneOf||o.id);if(!src||working)return;
    const token=++sequence;try{const im=await VectorFormats.image(src);if(sequence!==token||chosen()?.id!==o.id)return;
      const w=im.naturalWidth,h=im.naturalHeight;if(!w||!h||w*h>64e6||Math.max(w,h)>32767)throw Error('照片超过浏览器全分辨率编辑容量。');
      pixels.width=mask.width=w;pixels.height=mask.height=h;
      s={id:o.id,w,h,ctx:pixels.getContext('2d',{willReadFrequently:true}),ink:mask.getContext('2d',{willReadFrequently:true}),strokes:[],erase:false,zoom:1};s.ctx.drawImage(im,0,0);
      $('repairBrush').max=Math.max(2,Math.min(1200,Math.max(w,h)));$('repairBrush').value=Math.max(2,Math.round(Math.min(w,h)/24));
      cmd('erase').setAttribute('aria-pressed','false');cmd('undo').disabled=cmd('clear').disabled=true;invalidate();dialog.showModal();fit();brush();
    }catch(e){error(e.message||'图片读取失败。');}
  };
  function draw(stroke,a,b){const ctx=s.ink;ctx.globalCompositeOperation=stroke.erase?'destination-out':'source-over';ctx.lineWidth=stroke.size;ctx.lineCap=ctx.lineJoin='round';ctx.fillStyle=ctx.strokeStyle='#ed374f';
    ctx.beginPath();if(a===b){ctx.arc(a.x,a.y,stroke.size/2,0,2*Math.PI);ctx.fill();}else{ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
  function recompute(){s.ink.clearRect(0,0,s.w,s.h);for(const stroke of s.strokes){draw(stroke,stroke.points[0],stroke.points[0]);for(let i=1;i<stroke.points.length;i++)draw(stroke,stroke.points[i-1],stroke.points[i]);}
    cmd('undo').disabled=cmd('clear').disabled=cmd('preview').disabled=!s.strokes.length;}
  function pos(e){const r=mask.getBoundingClientRect();return {x:Math.max(0,Math.min(s.w,(e.clientX-r.x)*s.w/r.width)),y:Math.max(0,Math.min(s.h,(e.clientY-r.y)*s.h/r.height))};}
  mask.onpointerdown=e=>{if(!s||s.applying||s.stroke||e.button!==0)return;e.preventDefault();invalidate();const p=pos(e),stroke={points:[p],size:+$('repairBrush').value,erase:s.erase,pointer:e.pointerId};s.stroke=stroke;s.strokes.push(stroke);draw(stroke,p,p);mask.setPointerCapture(e.pointerId);cmd('undo').disabled=cmd('clear').disabled=cmd('preview').disabled=false;};
  mask.onpointermove=e=>{if(!s)return;const p=pos(e);ring.hidden=false;brush();ring.style.left=p.x*s.zoom+'px';ring.style.top=p.y*s.zoom+'px';const st=s.stroke;if(st?.pointer!==e.pointerId)return;draw(st,st.points.at(-1),p);st.points.push(p);};
  mask.onpointerup=mask.onlostpointercapture=e=>{if(s?.stroke?.pointer===e.pointerId)s.stroke=null;};
  mask.onpointerleave=()=>ring.hidden=true;
  function preview(){
    if(!s||!s.strokes.length)return;invalidate();let l=s.w,t=s.h,r=0,b=0;
    for(const st of s.strokes)if(!st.erase)for(const p of st.points){l=Math.min(l,p.x-st.size/2);t=Math.min(t,p.y-st.size/2);r=Math.max(r,p.x+st.size/2);b=Math.max(b,p.y+st.size/2);}
    if(r<=l||b<=t){status.textContent='请先涂抹要移除的区域。';return;}
    const pad=Math.max(40,Math.min(150,Math.ceil(Math.max(r-l,b-t)/2))),x=Math.max(0,Math.floor(l)-pad),y=Math.max(0,Math.floor(t)-pad),w=Math.min(s.w,Math.ceil(r)+pad)-x,h=Math.min(s.h,Math.ceil(b)+pad)-y;
    if(w*h>16e6){status.textContent='这次选区跨度过大，请分成几块分别修补。';return;}
    const roi={x,y,w,h},base=s.ctx.getImageData(x,y,w,h),paint=s.ink.getImageData(x,y,w,h).data,alpha=new Uint8Array(w*h);let count=0;
    for(let i=0;i<alpha.length;i++){alpha[i]=paint[i*4+3];if(alpha[i])count++;}
    if(!count){status.textContent='当前选区为空。';return;}
    const worker=new Worker('/repair-worker.js');s.worker=worker;s.roi=roi;s.base=base;cmd('preview').disabled=true;status.textContent='正在从周围取样…';
    const fail=message=>{if(s?.worker!==worker)return;stop();cmd('preview').disabled=false;status.textContent=message;};
    worker.onerror=()=>fail('修补未完成，请缩小选区再试。');
    worker.onmessage=({data})=>{if(s?.worker!==worker)return;if(data.error){fail(data.error);return;}if(data.progress!=null){status.textContent='正在填充 '+data.progress+'%';return;}
      stop();s.result=new ImageData(new Uint8ClampedArray(data.pixels),w,h);showResult(true);cmd('apply').disabled=false;cmd('compare').hidden=false;cmd('preview').disabled=false;status.textContent='可查看原图对比，或继续涂抹调整选区。';};
    const copy=base.data.slice();worker.postMessage({w,h,pixels:copy.buffer,mask:alpha.buffer},[copy.buffer,alpha.buffer]);
  }
  async function apply(){if(!s?.result||s.applying)return;s.applying=true;showResult(true);const job=s;cmd('apply').disabled=true;
    try{const blob=await new Promise((ok,no)=>pixels.toBlob(b=>b?ok(b):no(Error('图片编码失败')),'image/png'));if(s!==job)return;
      const id=s.id;let applied=false;status.textContent='正在应用照片修补…';await run('正在应用照片修补…',async()=>{await api('act',{action:{kind:'retouch',id,asset:await upload(new File([blob],'repair.png',{type:'image/png'}))}});applied=true;},'inline');
      if(applied)close();else if(s===job){s.applying=false;cmd('apply').disabled=false;status.textContent=$('error').textContent||'应用失败，可重试。';}
    }catch(e){if(s===job){s.applying=false;cmd('apply').disabled=false;status.textContent=e.message;}}
  }
  dialog.addEventListener('click',e=>{const v=e.target.closest('[data-r]')?.dataset.r;if(!v||!s||s.applying)return;
    if(v==='cancel')close();else if(v==='preview')preview();else if(v==='apply')apply();else if(v==='compare')showResult(!s.showing);
    else if(v==='erase'){s.erase=!s.erase;cmd(v).setAttribute('aria-pressed',String(s.erase));}else if(v==='undo'||v==='clear'){invalidate();if(v==='undo')s.strokes.pop();else s.strokes=[];recompute();}
    else if(v==='fit')fit();else zoom(s.zoom*(v==='plus'?1.5:1/1.5));
  });
  window.PhotoRepair={update};update();
})();

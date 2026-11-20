(() => {
  const section=$('roundBox'),uniform=$('radiusSlider'),row=$('radius').closest('.row');
  const mode=document.createElement('select');
  mode.id='cornerMode';mode.setAttribute('aria-label','圆角模式');
  for(const [value,label] of [['all','四角统一'],['each','四角独立']])mode.add(new Option(label,value));
  section.querySelector('h3').append(mode);
  const grid=document.createElement('div');grid.className='corner-grid';grid.hidden=true;
  section.append(grid);
  const fields=['左上','右上','右下','左下'].map((name,i)=>{
    const field=document.createElement('div'),caption=document.createElement('label');
    caption.textContent=name+' (mm)';
    const number=document.createElement('input'),slider=document.createElement('input');
    number.type='number';slider.type='range';number.step='any';slider.step='0.1';
    number.min=slider.min='0';number.id='cornerRadius'+i;slider.setAttribute('aria-label',name+'圆角滑块');
    caption.htmlFor=number.id;field.append(caption,number,slider);grid.append(field);
    function edit(input){
      const o=chosen(),v=input.valueAsNumber;
      if(!o?.cornerRadii||!Number.isFinite(v)||v<0)return;
      const radii=o.cornerRadii.slice();radii[i]=Math.min(Number(slider.max),v);
      if(input===slider)number.value=radii[i];else slider.value=radii[i];
      if(radii[i]===o.cornerRadii[i])return;
      if(i===0)$('radius').value=$('radiusSlider').value=radii[0];
      changeLocally([{kind:'round',id:o.id,r:radii[0],radii}],'corner-'+i);
    }
    for(const input of [number,slider]){
      input.oninput=()=>edit(input);
      input.onchange=()=>{edit(input);inputUndoKey='';if(chosen())update(chosen());};
    }
    return {number,slider};
  });
  function update(o){
    const values=o.cornerRadii,each=Array.isArray(values);
    mode.value=each?'each':'all';grid.hidden=!each;uniform.hidden=row.hidden=each;
    if(each)fields.forEach(({number,slider},i)=>{
      number.max=slider.max=String(Math.max(0,Math.min(o.box.w,o.box.h)/2));
      number.value=Number(values[i].toFixed(7));slider.value=values[i];
    });
  }
  mode.onchange=()=>{
    const o=chosen();if(!o?.canRound)return;
    const r=o.cornerRadii?.[0]??o.radius??0;
    queueLayout([{kind:'round',id:o.id,r,radii:mode.value==='each'?Array(4).fill(r):undefined}]);
    update(chosen());
  };
  window.CornerPanel={update};
})();

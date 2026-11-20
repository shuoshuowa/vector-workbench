(() => {
  const panel=document.createElement('section');panel.id='appearancePanel';
  panel.innerHTML='<h3>混合选项</h3><div class="fx-line"><label>混合模式<select id="fxBlend"></select></label><label>不透明度 (%)<input id="fxOpacity" type="number" min="0" max="100" value="100"></label></div><label class="fx-enable"><input type="checkbox" id="fxGrad"> 渐变填充</label><div id="fxGradProps"><div class="fx-line"><select aria-label="渐变类型" id="fxKind"><option value="linear">线性</option><option value="radial">径向</option></select><input aria-label="渐变起始颜色" type="color" id="fxFrom"><input aria-label="渐变结束颜色" type="color" id="fxTo"></div><div class="fx-line"><label>起点不透明度 (%)<input id="fxFromAlpha" type="number" min="0" max="100" step="1"></label><label>终点不透明度 (%)<input id="fxToAlpha" type="number" min="0" max="100" step="1"></label></div><div class="fx-ramp" aria-hidden="true"><i></i></div><label id="fxAngleLabel">角度 (°)<input id="fxAngle" type="range" min="-180" max="180" value="0"></label></div><label class="fx-enable"><input type="checkbox" id="fxShadow"> 投影</label><div id="fxShadowProps"><div class="fx-line"><label>光源角度 (°)<input id="fxShadowAngle" type="number" min="-180" max="180" step="any"></label><label>距离 (mm)<input id="fxDistance" type="number" min="0" step="any"></label></div><input id="fxShadowAngleSlider" type="range" min="-180" max="180" step="1" aria-label="拖动调节投影光源角度"><div class="fx-line"><label>颜色<input type="color" id="fxShadowColor"></label><label>浓度 (%)<input type="number" min="0" max="100" id="fxAlpha"></label></div><div class="fx-line">'+[['fxX','水平'],['fxY','垂直'],['fxBlur','模糊']].map(([id,n])=>'<label>'+n+' (mm)<input type="number" step="any" '+(id==='fxBlur'?'min="0" max="100"':'')+' id="'+id+'"></label>').join('')+'</div></div><button type="button" id="fxStroke">描边设置</button>';
  $('colorBox').after(panel);
  for(const [v,t] of Object.entries({normal:'正常',multiply:'正片叠底',screen:'滤色',overlay:'叠加',darken:'变暗',lighten:'变亮',difference:'差值'}))$('fxBlend').add(new Option(t,v));
  const canGradient=o=>['rect','shape','text'].includes(o.type);
  function sections(){const hex=(id,a)=>$(id).value+Math.round(255*(+$(a).value||0)/100).toString(16).padStart(2,'0');panel.querySelector('.fx-ramp i').style.background='linear-gradient(to right,'+hex('fxFrom','fxFromAlpha')+','+hex('fxTo','fxToAlpha')+')'; $('fxGradProps').hidden=!$('fxGrad').checked;$('fxShadowProps').hidden=!$('fxShadow').checked;$('fxAngleLabel').hidden=$('fxKind').value==='radial';}
  function showGeometry(shadow,editing){
    const angle=VectorEffects.shadowAngle(shadow);
    for(const [id,value] of Object.entries({fxShadowAngle:angle,fxShadowAngleSlider:angle,fxDistance:Math.hypot(shadow.x,shadow.y),fxX:shadow.x,fxY:shadow.y})){
      if(id!==editing)$(id).value=Number(value.toFixed(6));
    }
  }
  function shadowInput(previous,id){
    const old=previous||{x:2,y:2},oldAngle=VectorEffects.shadowAngle(old);
    let geom={x:old.x,y:old.y,angle:oldAngle};
    if(id==='fxShadowAngle'||id==='fxShadowAngleSlider')geom=VectorEffects.shadowOffset($(id).valueAsNumber,Math.hypot(old.x,old.y));
    if(id==='fxDistance')geom=VectorEffects.shadowOffset(oldAngle,$(id).valueAsNumber);
    if(id==='fxX'||id==='fxY'){
      geom[id==='fxX'?'x':'y']=$(id).valueAsNumber;
      if(geom.x||geom.y)geom.angle=Math.atan2(geom.y,-geom.x)*180/Math.PI;
    }
    showGeometry(geom,id);
    return {...geom,color:id==='fxShadowColor'?$('fxShadowColor').value:old.color||'#171b2b',alpha:id==='fxAlpha'?$('fxAlpha').valueAsNumber/100:old.alpha??.4,blur:id==='fxBlur'?$('fxBlur').valueAsNumber:old.blur??1.5};
  }
  function update(){
    const o=chosen();panel.hidden=!o;if(!o)return;const f=o.effects||{},g=f.gradient,s=f.shadow;
    $('fxBlend').value=f.blend||'normal';$('fxOpacity').value=Math.round(100*(f.opacity??1));$('fxGrad').disabled=!canGradient(o);$('fxGrad').checked=!!g;
    $('fxKind').value=g?.kind||'linear';$('fxFrom').value=g?.from||o.fill||'#8979d9';$('fxTo').value=g?.to||'#e6aa57';$('fxAngle').value=g?.angle??0;$('fxFromAlpha').value=Math.round((g?.fromAlpha??1)*100);$('fxToAlpha').value=Math.round((g?.toAlpha??1)*100);
    $('fxShadow').checked=!!s;$('fxShadowColor').value=s?.color||'#171b2b';$('fxAlpha').value=Math.round(100*(s?.alpha??.4));showGeometry(s||{x:2,y:2});$('fxBlur').value=s?.blur??1.5;
    $('fxStroke').hidden=!o.stroke;sections();
  }
  panel.addEventListener('input',e=>{const o=chosen();if(!o||!e.target.validity.valid||e.target.type==='number'&&e.target.value==='')return;
    const f={...o.effects},id=e.target.id;
    if(id==='fxBlend')f.blend=$('fxBlend').value;
    else if(id==='fxOpacity')f.opacity=$('fxOpacity').valueAsNumber/100;
    else if(['fxGrad','fxFrom','fxTo','fxKind','fxAngle','fxFromAlpha','fxToAlpha'].includes(id))f.gradient=$('fxGrad').checked?{...f.gradient,kind:$('fxKind').value,from:$('fxFrom').value,to:$('fxTo').value,fromAlpha:Number.isFinite($('fxFromAlpha').valueAsNumber)?$('fxFromAlpha').valueAsNumber/100:(f.gradient?.fromAlpha??1),toAlpha:Number.isFinite($('fxToAlpha').valueAsNumber)?$('fxToAlpha').valueAsNumber/100:(f.gradient?.toAlpha??1),angle:+$('fxAngle').value}:null;
    else f.shadow=$('fxShadow').checked?shadowInput(f.shadow,id):null;
    sections();changeLocally([{kind:'appearance',id:o.id,fx:f}],o.id+'|'+id);
  });
  $('fxStroke').onclick=()=>{$('strokeBox').scrollIntoView({block:'nearest'});$('strokeOn').focus();};
  window.AppearancePanel={update};update();
})();

(() => {
  const panel=document.createElement('section');panel.id='appearancePanel';
  panel.innerHTML='<h3>混合选项</h3><div class="fx-line"><label>混合模式<select id="fxBlend"></select></label><label>不透明度 (%)<input id="fxOpacity" type="number" min="0" max="100" value="100"></label></div><label class="fx-enable"><input type="checkbox" id="fxGrad"> 渐变填充</label><div id="fxGradProps"><div class="fx-line"><select aria-label="渐变类型" id="fxKind"><option value="linear">线性</option><option value="radial">径向</option></select><input aria-label="渐变起始颜色" type="color" id="fxFrom"><input aria-label="渐变结束颜色" type="color" id="fxTo"></div><label id="fxAngleLabel">角度 (°)<input id="fxAngle" type="range" min="-180" max="180" value="0"></label></div><label class="fx-enable"><input type="checkbox" id="fxShadow"> 投影</label><div id="fxShadowProps"><div class="fx-line"><label>颜色<input type="color" id="fxShadowColor"></label><label>浓度 (%)<input type="number" min="0" max="100" id="fxAlpha"></label></div><div class="fx-line">'+[['fxX','水平'],['fxY','垂直'],['fxBlur','模糊']].map(([id,n])=>'<label>'+n+' (mm)<input type="number" step="0.1" min="'+(id==='fxBlur'?0:-100)+'" max="100" id="'+id+'"></label>').join('')+'</div></div><button type="button" id="fxStroke">描边设置</button>';
  $('colorBox').after(panel);
  for(const [v,t] of Object.entries({normal:'正常',multiply:'正片叠底',screen:'滤色',overlay:'叠加',darken:'变暗',lighten:'变亮',difference:'差值'}))$('fxBlend').add(new Option(t,v));
  const canGradient=o=>['rect','shape','text'].includes(o.type);
  function sections(){ $('fxGradProps').hidden=!$('fxGrad').checked;$('fxShadowProps').hidden=!$('fxShadow').checked;$('fxAngleLabel').hidden=$('fxKind').value==='radial';}
  function update(){
    const o=chosen();panel.hidden=!o;if(!o)return;const f=o.effects||{},g=f.gradient,s=f.shadow;
    $('fxBlend').value=f.blend||'normal';$('fxOpacity').value=Math.round(100*(f.opacity??1));$('fxGrad').disabled=!canGradient(o);$('fxGrad').checked=!!g;
    $('fxKind').value=g?.kind||'linear';$('fxFrom').value=g?.from||o.fill||'#8979d9';$('fxTo').value=g?.to||'#e6aa57';$('fxAngle').value=g?.angle??0;
    $('fxShadow').checked=!!s;$('fxShadowColor').value=s?.color||'#171b2b';$('fxAlpha').value=Math.round(100*(s?.alpha??.4));$('fxX').value=s?.x??2;$('fxY').value=s?.y??2;$('fxBlur').value=s?.blur??1.5;
    $('fxStroke').hidden=!o.stroke;sections();
  }
  panel.addEventListener('input',e=>{const o=chosen();if(!o||!e.target.validity.valid||e.target.type==='number'&&e.target.value==='')return;
    const f={...o.effects},id=e.target.id;
    if(id==='fxBlend')f.blend=$('fxBlend').value;
    else if(id==='fxOpacity')f.opacity=$('fxOpacity').valueAsNumber/100;
    else if(['fxGrad','fxFrom','fxTo','fxKind','fxAngle'].includes(id))f.gradient=$('fxGrad').checked?{kind:$('fxKind').value,from:$('fxFrom').value,to:$('fxTo').value,angle:+$('fxAngle').value}:null;
    else f.shadow=$('fxShadow').checked?{color:$('fxShadowColor').value,alpha:$('fxAlpha').valueAsNumber/100,x:+$('fxX').value,y:+$('fxY').value,blur:+$('fxBlur').value}:null;
    sections();changeLocally([{kind:'appearance',id:o.id,fx:f}],o.id+'|'+id);
  });
  $('fxStroke').onclick=()=>{$('strokeBox').scrollIntoView({block:'nearest'});$('strokeOn').focus();};
  window.AppearancePanel={update};update();
})();

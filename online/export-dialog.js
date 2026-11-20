(() => {
  const formats=$('format'),dialog=document.createElement('dialog');dialog.id='deliveryDialog';
  dialog.innerHTML='<form><h2>导出</h2><div class="delivery-kinds"><label><input type="radio" name="deliveryKind" value="image">图片</label><label><input type="radio" name="deliveryKind" value="source" checked>可编辑源文件</label></div><div class="delivery-grid"><label>导出范围<select id="deliveryRange"><option value="all">全部画板</option><option value="current">当前画板</option><option value="element">选中元素</option></select></label><label id="deliverySource">文件格式</label><label id="deliveryImage" hidden>图片格式<select id="rasterFormat"><option value="png">PNG · 支持透明</option><option value="jpg">JPG · 白色底图</option></select></label><label id="deliveryScale" hidden>输出倍率<select id="rasterScale"><option value="1">1× 原尺寸</option><option value="2">2×</option><option value="3">3×</option></select></label></div><p id="deliverySummary" role="status"></p><div class="end-actions"><button type="button" data-delivery-cancel>取消</button><button id="confirmDelivery" type="submit" class="primary">导出</button></div></form>';
  document.body.append(dialog);$('deliverySource').append(formats);
  formats.querySelector('[value="psd-all"]').remove();formats.querySelector('[value="psd"]').textContent='Photoshop PSD';formats.querySelector('[value="svg"]').textContent='SVG';formats.querySelector('[value="eps"]').textContent='EPS · 文字转曲';formats.querySelector('[value="ai-kit"]').textContent='Illustrator 画板包 (ZIP)';
  formats.prepend(new Option('矢量快改工程 (.vqproj)','vqproj'));formats.value='pdf';
  const imageMode=()=>dialog.querySelector('[name=deliveryKind]:checked').value==='image';
  function update(){
    const img=imageMode(),r=$('deliveryRange'),d=doc();if(!d)return;
    $('deliveryImage').hidden=$('deliveryScale').hidden=!img;$('deliverySource').hidden=img;
    r.querySelector('[value=element]').disabled=!chosen();r.querySelector('[value=all]').disabled=!img&&d.pages>1&&['svg','eps'].includes(formats.value);
    if(r.selectedOptions[0]?.disabled)r.value='current';
    let msg;const board=VectorBrowser.artboards()[d.page];
    if(img&&r.value==='all'&&d.pages>1)msg=d.pages+' 个画板将各生成一张图片，按页序和画板名打包为 ZIP。';
    else if(img&&r.value==='element')msg='按所选元素边界导出一张图片，包含描边与投影。';
    else if(img){const k=(+board.ppi||96)/25.4*Number($('rasterScale').value);msg=board.name+' · '+Math.max(1,Math.round(board.w*k))+' × '+Math.max(1,Math.round(board.h*k))+' px';}
    else if(formats.value==='vqproj')msg='保存图层、可编辑文字和画板，可在矢量快改重新打开。';
    else if(formats.value==='ai-kit')msg='解压后在 Illustrator 中运行附带脚本，再另存为 AI。';
    else if(formats.value==='eps')msg='EPS 会把文字转为轮廓。';
    else msg=(r.value==='element'?'仅导出当前选中的元素':r.value==='all'?'导出全部 '+d.pages+' 个画板':'仅导出「'+board.name+'」')+'。';
    $('deliverySummary').textContent=msg;
  }
  function open(range){if(working||!doc()||dialog.open)return;if(!edits().every(valid))return;
    $('deliveryRange').value=range||(doc().pages>1?'all':'current');update();dialog.showModal();}
  $('export').lastChild.textContent='导出…';$('export').onclick=()=>open();
  const element=document.createElement('button');element.type='button';element.id='exportElement';element.className='wide';element.textContent='导出此元素…';$('props').querySelector('.bottom-actions').before(element);element.onclick=()=>{if(chosen())open('element');};
  dialog.addEventListener('change',update);dialog.querySelector('[data-delivery-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const pending=edits();if(!pending.every(valid))return;
    const range=$('deliveryRange').value,format=imageMode()?$('rasterFormat').value:formats.value,factor=+$('rasterScale').value;
    if(range==='element'&&!chosen())return;dialog.close();run('正在导出…',async()=>{
      for(const a of pending)await api('act',{action:{...a,id:selected}});if(layoutSteps.length)await commitLayout();
      const data=await api('export',{format,range,factor,elementId:range==='element'?chosen()?.id:undefined});
      const link=document.createElement('a');link.href=data.download;link.download=data.downloadName;document.body.append(link);link.click();link.remove();
      $('message').textContent='已导出 '+data.downloadName;
    });};

  const rename=document.createElement('dialog');rename.id='renameDialog';rename.innerHTML='<form><h2>重命名画板</h2><label>画板名称<input id="renameValue" maxlength="128" required autocomplete="off"></label><div class="end-actions"><button type="button">取消</button><button id="saveBoardName" type="submit" class="primary">保存名称</button></div></form>';document.body.append(rename);
  let index=0;const button=document.createElement('button');button.id='renameBoard';button.textContent='重命名';button.title='重命名当前画板 (F2)';$('pageSize').after(button);
  function showName(i){const board=VectorBrowser.artboards()[i];if(!board||working||rename.open||!allowLeave())return;index=i;$('renameValue').setCustomValidity('');$('renameValue').value=board.name;rename.showModal();$('renameValue').select();}
  button.onclick=()=>showName(doc()?.page);rename.querySelector('[type=button]').onclick=()=>rename.close();
  rename.querySelector('form').onsubmit=e=>{e.preventDefault();const name=$('renameValue').value.trim();if(!name){$('renameValue').setCustomValidity('请输入画板名称');$('renameValue').reportValidity();return;}rename.close();
    if(name!==VectorBrowser.artboards()[index]?.name)run('正在重命名画板…',()=>api('boards',{op:'change',index,name}),'inline');};
  $('renameValue').oninput=()=>$('renameValue').setCustomValidity('');
  for(const box of [$('pages'),$('pageDock'),$('overviewList')])box?.addEventListener('contextmenu',e=>{const item=e.target.closest('[data-page],[data-index],[data-ab-row]');if(!item)return;e.preventDefault();showName(Number(item.dataset.page??item.dataset.index??item.dataset.abRow));});
  $('boardTitle').title='双击重命名画板';$('boardTitle').ondblclick=()=>showName(doc()?.page);
  document.addEventListener('keydown',e=>{if(e.key==='F2'&&!e.isComposing&&!e.target.closest('input,textarea,select,[contenteditable=true]')&&!document.querySelector('dialog[open]')){e.preventDefault();showName(doc()?.page);}},true);
  window.DeliveryUI={update(){button.disabled=!doc();const d=doc();if(d)$('boardTitle').textContent=VectorBrowser.artboards()[d.page]?.name||'画板';}};window.DeliveryUI.update();
})();

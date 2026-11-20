/* Resolve only the selected object's editable photo; preserve its geometry, clip and styles. */
const PhotoSource=(()=>{
  const XL='http://www.w3.org/1999/xlink',href=e=>e?.getAttribute('href')||e?.getAttributeNS(XL,'href')||'';
  const write=(e,url)=>{e.setAttribute('href',url);if(e.hasAttributeNS(XL,'href'))e.setAttributeNS(XL,'xlink:href',url);};
  function locate(page,el){
    if(!el||!['image','mask'].includes(el.dataset.kind))return null;
    if(el.localName==='image')return {image:el};
    const nodes=(el.localName==='use'?[el]:[...el.querySelectorAll('image,use')]).filter(n=>!n.closest('defs,mask,clipPath,filter,pattern,[data-edge-pixels]'));
    const photos=[];for(const n of nodes){if(n.localName==='image')photos.push({image:n});else if(href(n).startsWith('#')){const source=page.getElementById(href(n).slice(1));if(source?.localName==='image')photos.push({image:source,use:n});}}
    return photos.length===1?photos[0]:null;
  }
  function source(page,el){const {image}=locate(page,el)||{};return image?href(image):null;}
  function replace(page,el,url){
    const photo=locate(page,el);if(!photo)throw Error('请选择单张可编辑图片。');const old=href(photo.image);
    if(photo.use){const def=VectorModel.make('defs'),copy=photo.image.cloneNode(true);copy.id='repair'+crypto.randomUUID();write(copy,url);def.append(copy);page.prepend(def);write(photo.use,'#'+copy.id);}
    else write(photo.image,url);
    for(const helper of el.querySelectorAll('mask image,[data-edge-pixels] image'))if(href(helper)===old)write(helper,url);
    return el;
  }
  return {source,replace};
})();

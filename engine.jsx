// Illustrator bridge for the local editor. All coordinates shown to the UI are millimetres.
(function(input){
  var MM=72/25.4, oldLevel=app.userInteractionLevel, prior=app.documents.length?app.activeDocument:null, doc=null;
  function fail(msg){throw new Error(msg);}
  function enc(v){
    if(v===null||v===undefined)return 'null';
    if(typeof v==='string')return '"'+v.replace(/["\\\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';
    if(typeof v==='number')return isFinite(v)?String(v):'null';
    if(typeof v==='boolean')return v?'true':'false';
    var arr=[],k;if(v instanceof Array){for(k=0;k<v.length;k++)arr.push(enc(v[k]));return '['+arr.join(',')+']';}
    for(k in v)if(v.hasOwnProperty(k))arr.push(enc(k)+':'+enc(v[k]));return '{'+arr.join(',')+'}';
  }
  function file(p){return new File(p);}
  function samePath(a,b){return file(a).fsName.toLowerCase()===file(b).fsName.toLowerCase();}
  function working(){for(var i=0;i<app.documents.length;i++){var d=app.documents[i];try{if(samePath(d.fullName,input.work))return d;}catch(e){}}return null;}
  function aiOptions(comp){var o=new IllustratorSaveOptions();o.pdfCompatible=comp;o.compressed=true;return o;}
  function color(hex){var c=new RGBColor();c.red=parseInt(hex.substr(1,2),16);c.green=parseInt(hex.substr(3,2),16);c.blue=parseInt(hex.substr(5,2),16);return c;}
  function hex(c){
    if(!c)return null;var v;
    if(c.typename==='RGBColor')v=[c.red,c.green,c.blue];
    else if(c.typename==='CMYKColor')v=app.convertSampleColor(ImageColorSpace.CMYK,[c.cyan,c.magenta,c.yellow,c.black],ImageColorSpace.RGB,ColorConvertPurpose.defaultpurpose);
    else if(c.typename==='GrayColor')v=[255*(1-c.gray/100),255*(1-c.gray/100),255*(1-c.gray/100)];
    else return null;
    var s='#';for(var i=0;i<3;i++)s+=('0'+Math.max(0,Math.min(255,Math.round(v[i]))).toString(16)).slice(-2);return s;
  }
  function members(c){var out=[],list=c.pageItems;for(var i=0;i<list.length;i++)if(list[i].parent===c)out.push(list[i]);return out;}
  function maskOf(g){if(g.typename!=='GroupItem'||!g.clipped)return null;var kids=members(g);for(var i=0;i<kids.length;i++){var o=kids[i];if(o.typename==='PathItem'&&o.clipping)return o;if(o.typename==='CompoundPathItem'&&o.pathItems.length&&o.pathItems[0].clipping)return o;}return null;}
  function photos(o,out){if(o.typename==='RasterItem'||o.typename==='PlacedItem')out.push(o);else if(o.typename==='GroupItem'){var kids=members(o);for(var i=0;i<kids.length;i++)photos(kids[i],out);}return out;}
  function outlinePath(o){
    var target=maskOf(o)||o;
    if(target.typename==='CompoundPathItem'&&target.pathItems.length)return target.pathItems[0];
    return target.typename==='PathItem'?target:null;
  }
  function drawShape(a,ab){
    var l=editableLayer(),x=ab[0]+a.x*MM,y=ab[1]-a.y*MM,w=a.w*MM,h=a.h*MM,o;
    if(a.shape==='rect'||a.shape==='rounded')o=newRect(l,[x,y,x+w,y-h],a.shape==='rounded'?Math.min(a.w,a.h)*.15:0);
    else if(a.shape==='ellipse')o=l.pathItems.ellipse(y,x,w,h);
    else{
      o=l.pathItems.add();
      if(a.shape==='triangle'){o.setEntirePath([[x+w/2,y],[x+w,y-h],[x,y-h]]);o.closed=true;}
      else{o.setEntirePath(a.reverse?[[x,y-h],[x+w,y]]:[[x,y],[x+w,y-h]]);o.closed=false;}
    }
    o.name=({rect:'矩形',rounded:'圆角矩形',ellipse:'椭圆',triangle:'三角形',line:'直线'})[a.shape];
    o.filled=a.shape!=='line';o.stroked=a.shape==='line';
    if(o.filled)o.fillColor=color('#8979d9');else{o.strokeWidth=2;o.strokeColor=color('#40376b');}return o;
  }
  function copyStroke(src,dst){
    dst.stroked=src.stroked;if(!src.stroked)return;
    dst.strokeWidth=src.strokeWidth;dst.strokeColor=src.strokeColor;dst.strokeCap=src.strokeCap;dst.strokeJoin=src.strokeJoin;
    dst.strokeDashes=src.strokeDashes;dst.strokeDashOffset=src.strokeDashOffset;
  }
  function bounds(o){var m=maskOf(o),b=(m||o).geometricBounds;if(!m&&o.typename==='PathItem'&&o.stroked&&(b[2]-b[0]<.01||b[1]-b[3]<.01))return o.visibleBounds;return b;}
  function intersect(a,b){var r=[Math.max(a[0],b[0]),Math.min(a[1],b[1]),Math.min(a[2],b[2]),Math.max(a[3],b[3])];return r[2]>r[0]+.01&&r[1]>r[3]+.01?r:null;}
  function rounded(n){return Math.round(n*1000)/1000;}
  function rect(b,ab){return {x:rounded((b[0]-ab[0])/MM),y:rounded((ab[1]-b[1])/MM),w:rounded((b[2]-b[0])/MM),h:rounded((b[1]-b[3])/MM)};}
  function nativeRect(o){
    if(o.typename!=='PathItem'||!o.closed)return false;
    if(o.pathPoints.length!==4&&o.pathPoints.length!==8)return false;
    var b=o.geometricBounds;
    if(o.note.indexOf('vq:rect:')===0){
      var aligned=true;for(var t=0;t<o.pathPoints.length;t++){var anchor=o.pathPoints[t].anchor;if(Math.min(Math.abs(anchor[0]-b[0]),Math.abs(anchor[0]-b[2]),Math.abs(anchor[1]-b[1]),Math.abs(anchor[1]-b[3]))>.05){aligned=false;break;}}if(aligned)return true;
    }
    if(o.pathPoints.length===8){
      var edges=[0,0,0,0];
      for(var j=0;j<8;j++){
        var k=o.pathPoints[j],v=k.anchor,side=-1;
        if(Math.abs(v[0]-b[0])<.04)side=0;else if(Math.abs(v[1]-b[1])<.04)side=1;else if(Math.abs(v[0]-b[2])<.04)side=2;else if(Math.abs(v[1]-b[3])<.04)side=3;
        if(side<0)return false;var axis=side%2;if(Math.abs(k.leftDirection[axis]-v[axis])>.04||Math.abs(k.rightDirection[axis]-v[axis])>.04)return false;edges[side]++;
      }
      return edges.join(',')==='2,2,2,2';
    }
    for(var i=0;i<4;i++){var p=o.pathPoints[i],a=p.anchor;if(Math.min(Math.abs(a[0]-b[0]),Math.abs(a[0]-b[2]))>.05||Math.min(Math.abs(a[1]-b[1]),Math.abs(a[1]-b[3]))>.05||Math.abs(p.leftDirection[0]-a[0])+Math.abs(p.leftDirection[1]-a[1])>.05)return false;}return true;
  }
  function cornerRadius(o){
    if(!nativeRect(o))return null;
    var b=o.geometricBounds,a=o.pathPoints[0].anchor;
    var x=Math.min(Math.abs(a[0]-b[0]),Math.abs(a[0]-b[2])),y=Math.min(Math.abs(a[1]-b[1]),Math.abs(a[1]-b[3]));return rounded(Math.max(x,y)/MM);
  }
  function locate(id){
    var parts=id.split('/'),container=doc,ob=null;
    for(var i=0;i<parts.length;i++){var p=parts[i],n=Number(p.substr(1));ob=p.charAt(0)==='l'?container.layers[n]:members(container)[n];if(!ob)fail('对象已变化，请重新选择');container=ob;}
    return ob;
  }
  function describe(page,selected){
    var ab=doc.artboards[page].artboardRect,rows=[],sel=[],targets=selected instanceof Array?selected:[selected];
    function walk(c,prefix,clip,locked,photo){
      if(c.typename==='Document'||c.typename==='Layer')for(var i=0;i<c.layers.length;i++){var layer=c.layers[i];if(layer.visible)walk(layer,prefix+'l'+i+'/',clip,locked||layer.locked);}
      if(c.typename==='Document')return;
      var kids=members(c);
      for(var k=0;k<kids.length;k++){
        var o=kids[k],t=o.typename,id=prefix+'i'+k;if(o===photo||o.hidden||o.guides||o.clipping)continue;
        if(t==='CompoundPathItem'&&o.pathItems.length&&o.pathItems[0].clipping)continue;
        var box=bounds(o),visible=intersect(box,clip);if(!visible)continue;
        var mask=maskOf(o),imgs=mask?photos(o,[]):[],type='shape';
        if(t==='TextFrame')type='text';
        else if(mask)type='mask';
        else if(t==='GroupItem')type='group';
        else if(t==='RasterItem'||t==='PlacedItem')type='image';
        else if(nativeRect(o))type='rect';
        var name=o.name||({text:'文字',image:'图片',mask:'剪切蒙版',rect:'矩形',shape:'矢量图形',group:'组合'})[type];
        var row={id:id,type:type,name:name,box:rect(box,ab),hit:rect(visible,ab),locked:!!(locked||o.locked),canImage:type==='image'||type==='rect'||(type==='mask'&&imgs.length<=1),canCrop:type==='mask'&&imgs.length===1};
        try{row.uid=String(o.uuid);}catch(ignoreUid){}row.canForward=k>0;row.canBackward=k<kids.length-1;
        var layer=o.parent;while(layer&&layer.typename!=='Layer')layer=layer.parent;row.layer=layer?layer.name:'';
        var outline=outlinePath(o);
        if(outline){row.stroke={enabled:!!outline.stroked,width:outline.stroked?rounded(outline.strokeWidth):1,color:outline.stroked?hex(outline.strokeColor):null};}
        else if(type==='image')row.stroke={enabled:false,width:1,color:null};
        else if(type==='text')try{var attr=o.textRange.characterAttributes,sc=attr.strokeColor;row.stroke={enabled:!!sc&&sc.typename!=='NoColor',width:attr.strokeWeight||1,color:hex(sc)};}catch(ignoreStroke){}
        if(type==='text'){row.text=o.contents.replace(/\r/g,'\n');row.name=row.text.slice(0,38)||'空文字';try{var a=o.textRange.characterAttributes;row.pt=a.size;row.font=a.textFont.name;row.fill=hex(a.fillColor);}catch(e){}}
        if(type==='shape'||type==='rect'){var paint=outlinePath(o);if(paint){row.canFill=true;row.filled=!!paint.filled;if(paint.filled)row.fill=hex(paint.fillColor);}}
        var frame=mask||o;if(nativeRect(frame)){row.canRound=true;row.radius=cornerRadius(frame);}
        if(t==='GroupItem')walk(o,id+'/',mask?visible:clip,row.locked,mask&&imgs.length===1?imgs[0]:photo);
        rows.push(row);
        for(var si=0;si<targets.length;si++)if(targets[si]===o){sel.push(id);break;}
      }
    }
    walk(doc,'',ab,false);return {items:rows,selected:sel.length===1?sel[0]:null,selection:sel};
  }
  function newRect(parent,b,r){var w=b[2]-b[0],h=b[1]-b[3],rad=Math.min(r*MM,w/2,h/2);var o=rad>.001?parent.pathItems.roundedRectangle(b[1],b[0],w,h,rad,rad):parent.pathItems.rectangle(b[1],b[0],w,h);o.note='vq:rect:'+rounded(rad/MM);return o;}
  function fitImage(img,b){var w=b[2]-b[0],h=b[1]-b[3],s=100*Math.max(w/img.width,h/img.height);img.resize(s,s);img.position=[b[0]+(w-img.width)/2,b[1]-(h-img.height)/2];}
  function insertImage(filename){var img=doc.placedItems.add();img.file=file(filename);return img;}
  function replaceImage(o,filename,sourcePhoto,placement){
    var m=maskOf(o),b=bounds(o),imgs=m?photos(o,[]):[],grp,frame,img;
    var originalBounds=sourcePhoto?sourcePhoto.geometricBounds.slice(0):null;
    if(originalBounds&&!intersect(originalBounds,b)){
      // Earlier workbench versions allowed a distant source to be fitted into a frame.
      if(input.op==='replay'&&!placement)originalBounds=null;
      else fail('图片与矩形没有重叠。请先把矩形移到要裁取的位置。');
    }
    function addPhoto(){
      if(sourcePhoto){var copied=sourcePhoto.duplicate();if(!originalBounds)fitImage(copied,b);return copied;}
      var placed=insertImage(filename);fitImage(placed,b);return placed;
    }
    function finishPhoto(photo){
      if(originalBounds){
        var after=photo.geometricBounds,dx=originalBounds[0]-after[0],dy=originalBounds[1]-after[1];
        if(Math.abs(dx)>.001||Math.abs(dy)>.001)photo.translate(dx,dy);
      }
      if(photo.typename==='PlacedItem')photo.embed();
    }
    if(m){
      if(imgs.length>1)fail('这个蒙版含有多张图片，请选择其中一张图片');
      img=addPhoto();
      if(imgs.length){img.move(imgs[0],ElementPlacement.PLACEBEFORE);imgs[0].remove();}
      else img.move(o,ElementPlacement.PLACEATEND);
      finishPhoto(img);return o;
    }
    var isRect=nativeRect(o);
    if(!isRect&&o.typename!=='RasterItem'&&o.typename!=='PlacedItem')fail('请选择图片、矩形或图片框');
    grp=o.parent.groupItems.add();grp.move(o,ElementPlacement.PLACEBEFORE);grp.name='图片框';
    frame=isRect?o:newRect(grp,b,0);if(isRect)frame.move(grp,ElementPlacement.PLACEATBEGINNING);
    img=addPhoto();img.move(grp,ElementPlacement.PLACEATEND);finishPhoto(img);
    var stroke=frame.stroked,weight=stroke?frame.strokeWidth:1,ink=stroke?frame.strokeColor:null;
    frame.zOrder(ZOrderMethod.BRINGTOFRONT);frame.clipping=true;grp.clipped=true;
    if(stroke){frame.stroked=true;frame.strokeWidth=weight;frame.strokeColor=ink;}if(!isRect)o.remove();return grp;
  }
  function editableLayer(){
    if(!input.engineVersion){var active=doc.activeLayer;if(!active.locked&&active.visible)return active;for(var j=0;j<doc.layers.length;j++)if(!doc.layers[j].locked&&doc.layers[j].visible)return doc.layers[j];var fallback=doc.layers.add();fallback.name='快改';return fallback;}
    for(var i=0;i<doc.layers.length;i++){var l=doc.layers[i];if(l.name==='快改 · 新增元素'&&!l.locked&&l.visible)return l;}
    var top=doc.layers.add();top.name='快改 · 新增元素';return top;
  }
  function union(list){var b=bounds(list[0]).slice(0);for(var i=1;i<list.length;i++){var v=bounds(list[i]);b=[Math.min(b[0],v[0]),Math.max(b[1],v[1]),Math.max(b[2],v[2]),Math.min(b[3],v[3])];}return b;}
  function batch(a){
    var os=[],i,k,o,v;for(i=0;i<a.ids.length;i++)os.push(locate(a.ids[i]));
    var op=a.operation,b=a.reference==='page'?doc.artboards[a.page].artboardRect:union(os),xmid=(b[0]+b[2])/2,ymid=(b[1]+b[3])/2;
    if(op==='group'){
      var par=os[0].parent;for(i=1;i<os.length;i++)if(os[i].parent!==par)fail('组合需要选择同一图层或同一组内的对象');
      var sorted=[],kids=members(par);for(i=0;i<kids.length;i++)for(k=0;k<os.length;k++)if(kids[i]===os[k])sorted.push(os[k]);
      var grp=par.groupItems.add();grp.move(sorted[0],ElementPlacement.PLACEBEFORE);grp.name='组合';for(i=0;i<sorted.length;i++)sorted[i].move(grp,ElementPlacement.PLACEATEND);return grp;
    }
    if(op==='spaceX'||op==='spaceY'){
      if(os.length<3)fail('等距分布需要至少三个对象');var horizontal=op==='spaceX';
      os.sort(function(p,q){return horizontal?bounds(p)[0]-bounds(q)[0]:bounds(q)[1]-bounds(p)[1];});
      var total=0;for(i=0;i<os.length;i++){v=bounds(os[i]);total+=horizontal?v[2]-v[0]:v[1]-v[3];}
      var gap=((horizontal?b[2]-b[0]:b[1]-b[3])-total)/(os.length-1),pos=horizontal?b[0]:b[1];
      for(i=0;i<os.length;i++){v=bounds(os[i]);if(horizontal){os[i].translate(pos-v[0],0);pos+=v[2]-v[0]+gap;}else{os[i].translate(0,pos-v[1]);pos-=v[1]-v[3]+gap;}}
      return os;
    }
    for(i=0;i<os.length;i++){o=os[i];v=bounds(o);
      if(op==='delete')o.remove();
      else if(op==='duplicate'){os[i]=o.duplicate();os[i].translate(3*MM,-3*MM);}
      else if(op==='move')o.translate(a.dx*MM,-a.dy*MM);
      else if(op==='left')o.translate(b[0]-v[0],0);else if(op==='right')o.translate(b[2]-v[2],0);else if(op==='centerX')o.translate(xmid-(v[0]+v[2])/2,0);
      else if(op==='top')o.translate(0,b[1]-v[1]);else if(op==='bottom')o.translate(0,b[3]-v[3]);else if(op==='centerY')o.translate(0,ymid-(v[1]+v[3])/2);
    }
    return op==='delete'?null:os;
  }
  function layerCopy(src,parent,region,dx,dy){
    var dest=parent.layers.add();dest.name=src.name;var kids=members(src),i;
    for(i=kids.length-1;i>=0;i--){var o=kids[i];if(region&&!intersect(bounds(o),region))continue;
      var cp=o.duplicate(dest,ElementPlacement.PLACEATBEGINNING),locked=cp.locked;cp.locked=false;
      if(dx||dy)cp.translate(dx,dy);cp.locked=locked;
    }
    for(i=src.layers.length-1;i>=0;i--)layerCopy(src.layers[i],dest,region,dx,dy);
    if(region&&!dest.pageItems.length&&!dest.layers.length){dest.remove();return null;}
    dest.visible=src.visible;dest.opacity=src.opacity;dest.blendingMode=src.blendingMode;dest.locked=src.locked;return dest;
  }
  function importArtwork(a,ab){
    if(a.ext==='.png'||a.ext==='.jpg'||a.ext==='.jpeg')return act({kind:'addPicture',page:a.page,path:a.path});
    var src=null,holder=null;
    try{
      src=openFile(file(a.path),a.sheet);var index=0;
      if(src.artboards.length>1||a.ext!=='.pdf'){index=a.sheet-1;if(index>=src.artboards.length)fail('源文件没有这一页');}
      var board=src.artboards[index].artboardRect;doc.activate();holder=editableLayer().groupItems.add();holder.name=a.name;
      function copyFrom(layer){if(!layer.visible)return;var kids=members(layer);
        for(var i=kids.length-1;i>=0;i--){var item=kids[i];if(item.hidden||!intersect(bounds(item),board))continue;
          src.activate();var before=item.geometricBounds,copy=item.duplicate(holder.layer,ElementPlacement.PLACEATBEGINNING);
          doc.activate();copy.locked=false;copy.move(holder,ElementPlacement.PLACEATBEGINNING);
          var after=copy.geometricBounds;copy.translate(before[0]-after[0],before[1]-after[1]);
        }
        for(var n=layer.layers.length-1;n>=0;n--)copyFrom(layer.layers[n]);
      }
      for(var j=src.layers.length-1;j>=0;j--)copyFrom(src.layers[j]);
      if(!holder.pageItems.length)fail('这一页没有可插入的可见对象');
      var b=holder.geometricBounds,ratio=Math.min(1,(ab[2]-ab[0])*.8/Math.max(.01,b[2]-b[0]),(ab[1]-ab[3])*.8/Math.max(.01,b[1]-b[3]));
      if(ratio<1)holder.resize(ratio*100,ratio*100,true,true,true,true,ratio*100);
      b=holder.geometricBounds;holder.translate((ab[0]+ab[2]-b[0]-b[2])/2,(ab[1]+ab[3]-b[1]-b[3])/2);return holder;
    }finally{if(src)src.close(SaveOptions.DONOTSAVECHANGES);doc.activate();}
  }
  function pageEdit(a,ab){
    var idx=a.page,i;
    if(a.kind==='pageDelete'){
      if(doc.artboards.length<=1)fail('至少保留一页画板');
      var others=[];for(i=0;i<doc.artboards.length;i++)if(i!==idx)others.push(doc.artboards[i].artboardRect);
      function prune(container){
        var children=members(container);for(var j=children.length-1;j>=0;j--){var o=children[j],b=bounds(o);
          if(b[0]>=ab[0]-.02&&b[2]<=ab[2]+.02&&b[1]<=ab[1]+.02&&b[3]>=ab[3]-.02){var shared=false;for(var n=0;n<others.length;n++)if(intersect(b,others[n]))shared=true;if(!shared){o.locked=false;o.remove();continue;}}
          if(o.typename==='GroupItem'&&!o.clipped&&!o.locked)prune(o);
        }
        if(container.typename==='Layer')for(var k=0;k<container.layers.length;k++)prune(container.layers[k]);
      }
      for(i=0;i<doc.layers.length;i++){var layer=doc.layers[i],was=layer.locked;layer.locked=false;try{prune(layer);}finally{layer.locked=was;}}
      doc.artboards[idx].remove();doc.artboards.setActiveArtboardIndex(Math.min(idx,doc.artboards.length-1));return;
    }
    var w=ab[2]-ab[0],h=ab[1]-ab[3],margin=12*MM;
    var boards=[],sources=[];for(i=0;i<doc.artboards.length;i++)boards.push(doc.artboards[i].artboardRect);
    for(i=0;i<doc.layers.length;i++)sources.push(doc.layers[i]);
    var board=null,box;
    for(var side=0;side<2&&!board;side++)for(i=boards.length-1;i>=0&&!board;i--){var prev=boards[i],left=side?prev[0]:prev[2]+margin,top=side?prev[3]-margin:prev[1];box=[left,top,left+w,top-h];var free=true;for(var j=0;j<boards.length;j++)if(intersect(box,boards[j]))free=false;
      if(free)try{board=doc.artboards.add(box);}catch(ignored){}}
    if(!board)fail('当前画布没有足够空间再放置同尺寸页面');
    if(a.kind==='pageCopy'){
      var parent=doc.layers.add();parent.name='第 '+doc.artboards.length+' 页 · 副本';
      for(i=sources.length-1;i>=0;i--)if(sources[i].visible)layerCopy(sources[i],parent,ab,box[0]-ab[0],box[1]-ab[1]);
    }
    doc.artboards.setActiveArtboardIndex(doc.artboards.length-1);
  }
  var editRefs=null;
  function act(a,resolved){
    doc.artboards.setActiveArtboardIndex(a.page);var ab=doc.artboards[a.page].artboardRect,o=resolved||(a.id?locate(a.id):null),b=o?bounds(o):null,p;
    if(a.kind==='editBatch'){
      var refs={},n,c,last=null;
      for(n=0;n<a.changes.length;n++){c=a.changes[n];if(c.copyFrom&&c.copyFrom.indexOf('local:')!==0&&!refs[c.copyFrom])refs[c.copyFrom]=locate(c.copyFrom);if(!c.create&&c.key.indexOf('local:')!==0&&!refs[c.key])refs[c.key]=locate(c.key);}
      for(n=0;n<a.changes.length;n++){c=a.changes[n];if(c.copyFrom){last=refs[c.copyFrom].duplicate();last.translate(c.dx*MM,-c.dy*MM);}else last=act(c.action,c.create?null:refs[c.key]);refs[c.key]=last;}
      editRefs=refs;return last;
    }
    if(a.kind==='multi')return batch(a);
    if(a.kind==='layout'){var touched={},moved=[];for(var i=0;i<a.moves.length;i++){act(a.moves[i]);touched[a.moves[i].id]=true;}for(var id in touched)if(touched.hasOwnProperty(id))moved.push(locate(id));return moved;}
    if(a.kind==='pageSize'){doc.artboards[a.page].artboardRect=[ab[0],ab[1],ab[0]+a.w*MM,ab[1]-a.h*MM];return null;}
    if(a.kind==='importArtwork')return importArtwork(a,ab);
    if(a.kind==='pageAdd'||a.kind==='pageCopy'||a.kind==='pageDelete'){pageEdit(a,ab);return null;}
    if(a.kind==='shape')return drawShape(a,ab);
    if(a.kind==='addText'){
      o=editableLayer().textFrames.pointText([ab[0]+(ab[2]-ab[0])*.35,ab[1]-(ab[1]-ab[3])*.45]);o.contents='新增文字';o.textRange.characterAttributes.size=16;
      try{o.textRange.characterAttributes.textFont=app.textFonts.getByName('MicrosoftYaHei');}catch(ignored){}return o;
    }
    if(a.kind==='addPicture'){
      var art=insertImage(a.path),s=100*Math.min((ab[2]-ab[0])*.5/art.width,(ab[1]-ab[3])*.5/art.height);art.resize(s,s);
      art.position=[(ab[0]+ab[2]-art.width)/2,(ab[1]+ab[3]+art.height)/2];var holder=editableLayer().groupItems.add();holder.name='插入图片';art.move(holder,ElementPlacement.PLACEATEND);art.embed();
      var singles=photos(holder,[]);return singles.length===1?singles[0]:holder;
    }
    if(a.kind==='rectangle'){
      o=newRect(editableLayer(),[ab[0]+a.x*MM,ab[1]-a.y*MM,ab[0]+(a.x+a.w)*MM,ab[1]-(a.y+a.h)*MM],a.r);
      o.name='圆角矩形';o.stroked=false;o.filled=true;o.fillColor=color(a.color);return o;
    }
    if(!o||o.locked||o.hidden)fail('请选择可编辑对象');
    if(a.kind==='duplicateLayer'){var layer=o.parent;while(layer&&layer.typename!=='Layer')layer=layer.parent;if(!layer)fail('没有可复制的图层');var dup=layerCopy(layer,layer.parent,null,0,0);dup.name=layer.name+' 副本';dup.move(layer,ElementPlacement.PLACEBEFORE);return members(dup);}
    if(a.kind==='ungroup'){if(o.typename!=='GroupItem'||o.clipped)fail('请选择普通组合');var children=members(o);for(var k=0;k<children.length;k++)children[k].move(o,ElementPlacement.PLACEBEFORE);o.remove();return children;}
    if(a.kind==='text'){
      if(o.typename!=='TextFrame')fail('请选择文字');if(o.contents.replace(/\r/g,'\n')!==a.value)o.contents=a.value.replace(/\r\n|\n/g,'\r');
      if(a.pt!==null)o.textRange.characterAttributes.size=a.pt;
      if(a.font)o.textRange.characterAttributes.textFont=app.textFonts.getByName(a.font);
    }else if(a.kind==='stroke'){
      if(o.typename==='TextFrame'){var attr=o.textRange.characterAttributes;
        if(a.enabled){if(a.color||!attr.strokeColor||attr.strokeColor.typename==='NoColor')attr.strokeColor=color(a.color||'#242735');attr.strokeWeight=a.width;}
        else attr.strokeColor=new NoColor();return o;}
      if((o.typename==='RasterItem'||o.typename==='PlacedItem')&&a.enabled){
        var wrap=o.parent.groupItems.add();wrap.name='图片框';wrap.move(o,ElementPlacement.PLACEBEFORE);var frame=newRect(wrap,b,0);o.move(wrap,ElementPlacement.PLACEATEND);frame.zOrder(ZOrderMethod.BRINGTOFRONT);frame.clipping=true;wrap.clipped=true;o=wrap;
      }
      p=outlinePath(o);if(!p)fail('请选择可描边的矢量图形或图片框');
      var hadStroke=p.stroked;p.stroked=a.enabled;
      if(a.enabled){p.strokeWidth=a.width;if(a.color||!hadStroke)p.strokeColor=color(a.color||'#242735');}
    }else if(a.kind==='color'){
      if(o.typename==='TextFrame')o.textRange.characterAttributes.fillColor=color(a.color);
      else{p=outlinePath(o);if(!p)fail('请选择可填充的路径');if(!input.engineVersion&&!p.filled&&p.stroked)p.strokeColor=color(a.color);else{p.filled=a.enabled!==false;if(p.filled)p.fillColor=color(a.color);}}
    }else if(a.kind==='geometry'){
      var w=b[2]-b[0],h=b[1]-b[3];if(w<=0||h<=0)fail('此对象大小不可调整');
      if(Math.abs(a.w*MM-w)>.015||Math.abs(a.h*MM-h)>.015)o.resize(a.w*MM/w*100,a.h*MM/h*100,true,true,true,true,100,Transformation.CENTER);
      b=bounds(o);o.translate(ab[0]+a.x*MM-b[0],ab[1]-a.y*MM-b[1]);
    }else if(a.kind==='round'){
      var mask=maskOf(o),old=mask||o;if(!nativeRect(old))fail('请选择矩形或圆角矩形图片框');
      p=newRect(old.parent,b,a.r);p.move(old,ElementPlacement.PLACEBEFORE);p.name=old.name;
      if(mask){p.filled=false;p.clipping=true;copyStroke(old,p);old.remove();o.clipped=true;}
      else{p.filled=old.filled;if(p.filled)p.fillColor=old.fillColor;copyStroke(old,p);p.opacity=old.opacity;old.remove();o=p;}
    }else if(a.kind==='picture'){o=replaceImage(o,a.path);}
    else if(a.kind==='usePhoto'){
      var original=locate(a.source),pictures=photos(original,[]);if(pictures.length!==1||original===o)fail('请选择另一张图片或单图图片框');
      o=replaceImage(o,null,pictures[0],a.placement);
    }else if(a.kind==='release'){var outline=maskOf(o);if(!outline)fail('请选择剪切蒙版');o.clipped=false;if(outline.typename==='CompoundPathItem')outline.pathItems[0].clipping=false;else outline.clipping=false;}
    else if(a.kind==='crop'){
      var photosInFrame=photos(o,[]);if(!maskOf(o)||photosInFrame.length!==1)fail('请选择一个单图蒙版');
      p=photosInFrame[0];if(a.factor!==1)p.resize(a.factor*100,a.factor*100);p.translate(a.dx*MM,-a.dy*MM);
    }else if(a.kind==='order'){o.zOrder(({up:ZOrderMethod.BRINGFORWARD,down:ZOrderMethod.SENDBACKWARD,front:ZOrderMethod.BRINGTOFRONT,back:ZOrderMethod.SENDTOBACK})[a.direction]);}
    else if(a.kind==='duplicate'){o=o.duplicate();o.translate(3*MM,-3*MM);}
    else if(a.kind==='delete'){o.remove();return null;}else fail('未知编辑操作');
    return o;
  }
  function openFile(f,page){
    if(/\.psd$/i.test(f.name)){
      var ps=app.preferences.photoshopFileOptions,layers=ps.preserveLayers,hidden=ps.preserveHiddenLayers;
      try{ps.preserveLayers=true;ps.preserveHiddenLayers=true;return app.open(f);}finally{ps.preserveLayers=layers;ps.preserveHiddenLayers=hidden;}
    }
    var opt=app.preferences.PDFFileOptions,save=opt.pageToOpen;try{opt.pageToOpen=page;return app.open(f);}finally{opt.pageToOpen=save;}
  }
  function openDesign(){
    var src=file(input.source),d=openFile(src,1),combined=null;
    try{
      if(input.count>1&&d.artboards.length!==input.count){
        if(input.count>1000)fail('页数超过本机 Illustrator 的画板容量');
        var sx=0,sy=0,rowHeight=0;
        for(var i=0;i<input.count;i++){
          if(i)d=openFile(src,i+1);
          var ab=d.artboards[0].artboardRect,w=ab[2]-ab[0],h=ab[1]-ab[3];
          if(!combined)combined=app.documents.add(d.documentColorSpace,w,h);
          if(sx+w>15000){sx=0;sy-=rowHeight+35;rowHeight=0;}
          var board=[sx,sy,sx+w,sy-h];if(i)combined.artboards.add(board);else combined.artboards[0].artboardRect=board;
          var layer=combined.layers.add();layer.name='第 '+(i+1)+' 页';
          for(var j=d.layers.length-1;j>=0;j--){if(!d.layers[j].visible)continue;var items=members(d.layers[j]);for(var k=items.length-1;k>=0;k--){var item=items[k],bb=item.geometricBounds,copy=item.duplicate(layer,ElementPlacement.PLACEATBEGINNING),cb=copy.geometricBounds;copy.translate(sx-ab[0]+bb[0]-cb[0],sy-ab[1]+bb[1]-cb[1]);}}
          sx+=w+35;rowHeight=Math.max(rowHeight,h);d.close(SaveOptions.DONOTSAVECHANGES);d=null;
        }
        d=combined;combined=null;
      }
      d.activate();d.saveAs(file(input.work),aiOptions(false));doc=d;
    }catch(e){if(d)d.close(SaveOptions.DONOTSAVECHANGES);if(combined)combined.close(SaveOptions.DONOTSAVECHANGES);throw e;}
  }
  function preview(idx,selected){
    doc.artboards.setActiveArtboardIndex(idx);var ab=doc.artboards[idx].artboardRect,w=ab[2]-ab[0],h=ab[1]-ab[3];
    var opt=new ExportOptionsPNG24();opt.artBoardClipping=true;opt.transparency=false;opt.antiAliasing=true;opt.horizontalScale=opt.verticalScale=Math.min(400,150000/Math.max(w,h));
    doc.exportFile(file(input.preview),ExportType.PNG24,opt);
    var view=describe(idx,selected);
    return {page:idx,pages:doc.artboards.length,width:rounded(w/MM),height:rounded(h/MM),items:view.items,selected:view.selected,selection:view.selection};
  }
  function exportDesign(){
    var out=file(input.out),opt,copy=file(input.exportCopy),tempDoc=null;
    doc.saveAs(file(input.work),aiOptions(false));if(!file(input.work).copy(copy))fail('无法建立导出副本');
    try{
      tempDoc=openFile(copy,1);tempDoc.artboards.setActiveArtboardIndex(input.page);
      if(input.format==='ai')tempDoc.saveAs(out,aiOptions(true));
      else if(input.format==='pdf'){opt=new PDFSaveOptions();opt.preserveEditability=true;tempDoc.saveAs(out,opt);}
      else if(input.format==='psd'){
        opt=new ExportOptionsPhotoshop();opt.resolution=300;opt.writeLayers=true;opt.maximumEditability=true;opt.editableText=true;
        opt.imageColorSpace=tempDoc.documentColorSpace===DocumentColorSpace.CMYK?ImageColorSpace.CMYK:ImageColorSpace.RGB;
        opt.embedICCProfile=true;opt.antiAliasing=true;opt.warnings=false;opt.saveMultipleArtboards=true;opt.artboardRange=String(input.page+1);
        tempDoc.exportFile(out,ExportType.PHOTOSHOP,opt);
      }else{opt=new EPSSaveOptions();opt.saveMultipleArtboards=true;opt.artboardRange=String(input.page+1);opt.embedLinkedFiles=true;tempDoc.saveAs(out,opt);}
    }finally{if(tempDoc)tempDoc.close(SaveOptions.DONOTSAVECHANGES);if(copy.exists)copy.remove();doc.activate();}
  }
  var started=Date.now?Date.now():0;
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    var selected=null,result={};doc=working();
    if(input.op==='fonts'){var fonts=[];for(var f=0;f<app.textFonts.length;f++){var font=app.textFonts[f];fonts.push({id:font.name,family:font.family,style:font.style,label:font.family+' '+font.style});}return enc({ok:true,data:fonts});}
    if(input.op==='open')openDesign();
    else if(input.op==='replay'){if(doc)doc.close(SaveOptions.DONOTSAVECHANGES);if(!file(input.seed).copy(input.work))fail('无法恢复工作副本');doc=openFile(file(input.work),1);for(var i=0;i<input.actions.length;i++)selected=act(input.actions[i]);}
    else{if(!doc)fail('工作副本已关闭，请重新打开设计稿');doc.activate();
      if(input.op==='act'){selected=act(input.action);if(/^page(Add|Copy|Delete)$/.test(input.action.kind))input.page=doc.artboards.getActiveArtboardIndex();}
      else if(input.op==='export')exportDesign();
      else if(input.op==='close'){doc.close(SaveOptions.DONOTSAVECHANGES);doc=null;}
    }
    if(input.preview){
      result=preview(Math.min(input.page||0,doc.artboards.length-1),selected);
      if(editRefs){var index={},mapping={},j,k;for(j=0;j<result.items.length;j++)index[result.items[j].uid]=result.items[j].id;for(k in editRefs)if(editRefs.hasOwnProperty(k)&&editRefs[k])try{mapping[k]=index[String(editRefs[k].uuid)];}catch(ignore){}result.remapped=mapping;}
    }
    return enc({ok:true,data:result});
  }catch(e){return enc({ok:false,error:String(e),line:e.line});}
  finally{app.userInteractionLevel=oldLevel;if(prior)try{prior.activate();}catch(ignored){}}
})(/*__INPUT__*/)

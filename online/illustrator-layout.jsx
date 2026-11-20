#target illustrator
(function(){
  var boards=/*__ARTBOARDS__*/[],mm=72/25.4;
  var file=new File(new File($.fileName).parent.fsName+'/artwork.pdf');
  if(!file.exists)throw Error('请先解压整个画板包，让 artwork.pdf 与此脚本位于同一目录。');
  var mode=app.userInteractionLevel,options=app.preferences.PDFFileOptions,oldPage=options.pageToOpen,source=null,dest=null;
  function copyLayer(layer,parent,dx,dy){
    var out=parent.layers.add();out.name=layer.name;
    for(var k=layer.pageItems.length-1;k>=0;k--){var o=layer.pageItems[k];if(o.parent!==layer)continue;
      var before=o.geometricBounds,c=o.duplicate(out,ElementPlacement.PLACEATBEGINNING),after=c.geometricBounds,lock=c.locked;c.locked=false;
      c.translate(dx+before[0]-after[0],dy+before[1]-after[1]);c.locked=lock;}
    for(var j=layer.layers.length-1;j>=0;j--)copyLayer(layer.layers[j],out,dx,dy);
    out.visible=layer.visible;out.locked=layer.locked;
  }
  function rgb(h){var c=new RGBColor();c.red=parseInt(h.substr(1,2),16);c.green=parseInt(h.substr(3,2),16);c.blue=parseInt(h.substr(5,2),16);return c;}
  function gradients(d,board,ab){
    var items=board.typeGradients||[];
    for(var k=0;k<items.length;k++){var s=items[k],tag=rgb(s.marker),g=d.gradients.add(),count=0;g.name='画板渐变 '+(k+1);
      g.type=s.g.kind==='radial'?GradientType.RADIAL:GradientType.LINEAR;g.gradientStops[0].color=rgb(s.g.from);g.gradientStops[1].color=rgb(s.g.to);g.gradientStops[0].opacity=(s.g.fromAlpha==null?1:s.g.fromAlpha)*100;g.gradientStops[1].opacity=(s.g.toAlpha==null?1:s.g.toAlpha)*100;
      for(var j=0;j<d.textFrames.length;j++){var t=d.textFrames[j];if(!t.characters.length)continue;var ink=t.characters[0].characterAttributes.fillColor;
        if(ink.typename!=='RGBColor'||Math.abs(ink.red-tag.red)>1||Math.abs(ink.green-tag.green)>1||Math.abs(ink.blue-tag.blue)>1)continue;
        var c=new GradientColor(),b=s.box,angle=s.g.angle*Math.PI/180,vx=Math.cos(angle)*b.w*mm,vy=-Math.sin(angle)*b.h*mm;
        c.gradient=g;c.origin=[ab[0]+(b.x+b.w/2)*mm-(s.g.kind==='radial'?0:vx/2),ab[1]-(b.y+b.h/2)*mm-(s.g.kind==='radial'?0:vy/2)];
        c.length=Math.max(.01,s.g.kind==='radial'?Math.max(b.w,b.h)*mm*.65:Math.sqrt(vx*vx+vy*vy));c.matrix=app.getRotationMatrix(-s.g.angle);
        t.textRange.characterAttributes.fillColor=c;count++;
      }
      if(!count&&s.text.replace(/\s/g,''))throw Error('未匹配可编辑渐变文字：'+s.text.slice(0,22));
    }
  }
  try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    for(var i=0;i<boards.length;i++){
      options.pageToOpen=i+1;source=app.open(file);var ab=source.artboards[0].artboardRect,b=boards[i],r=[b.x*mm,-b.y*mm,(b.x+b.w)*mm,-(b.y+b.h)*mm];
      gradients(source,b,ab);if(!dest)dest=app.documents.add(source.documentColorSpace,b.w*mm,b.h*mm);
      var board=i?dest.artboards.add(r):dest.artboards[0];board.artboardRect=r;board.name=b.name;
      var group=i?dest.layers.add():dest.layers[0];group.name=b.name;
      for(var l=source.layers.length-1;l>=0;l--)copyLayer(source.layers[l],group,r[0]-ab[0],r[1]-ab[1]);
      source.close(SaveOptions.DONOTSAVECHANGES);source=null;
    }
    dest.activate();dest.artboards.setActiveArtboardIndex(0);
  }catch(e){if(dest)dest.close(SaveOptions.DONOTSAVECHANGES);throw e;}
  finally{if(source)source.close(SaveOptions.DONOTSAVECHANGES);options.pageToOpen=oldPage;app.userInteractionLevel=mode;}
})();

(function(input){
  var prior=app.documents.length?app.activeDocument:null,old=app.userInteractionLevel,doc=null,restore=[],board=0;
  function mark(c,prefix){
    if(c.typename==='Document'||c.typename==='Layer')for(var j=0;j<c.layers.length;j++)if(c.layers[j].visible)mark(c.layers[j],prefix+'L'+j);
    if(c.typename==='Document')return;
    var index=0;for(var i=0;i<c.pageItems.length;i++){
      var o=c.pageItems[i];if(o.parent!==c)continue;var id=prefix+'I'+index++;
      if(o.hidden)continue;
      try{var name=o.name;o.name='VQNode'+id;restore.push([o,name]);}catch(ignore){}
      if(o.typename==='GroupItem')mark(o,id);
    }
  }
  try{
    app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;
    for(var i=0;i<app.documents.length;i++){var d=app.documents[i];try{if(d.fullName.fsName.toLowerCase()===new File(input.work).fsName.toLowerCase()){doc=d;break;}}catch(ignore){}}
    if(!doc)throw Error('找不到当前工作副本');
    board=doc.artboards.getActiveArtboardIndex();doc.activate();doc.artboards.setActiveArtboardIndex(input.page);mark(doc,'');
    var opt=new ExportOptionsSVG();opt.embedRasterImages=true;opt.preserveEditability=false;opt.fontType=SVGFontType.SVGFONT;opt.fontSubsetting=SVGFontSubsetting.None;
    opt.coordinatePrecision=4;opt.saveMultipleArtboards=true;opt.artboardRange=String(input.page+1);
    doc.exportFile(new File(input.file),ExportType.SVG,opt);return 'OK';
  }catch(e){return 'ERROR '+String(e);}
  finally{for(var j=restore.length-1;j>=0;j--)try{restore[j][0].name=restore[j][1];}catch(ignore){}if(doc)try{doc.artboards.setActiveArtboardIndex(board);}catch(ignore){}
    app.userInteractionLevel=old;if(prior)try{prior.activate();}catch(ignore){}}
})(/*__INPUT__*/)

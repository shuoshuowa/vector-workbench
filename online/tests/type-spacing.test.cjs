'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const spacing=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','type-spacing.js'),'utf8')+'\nTypeSpacing');
test('Photoshop tracking and manual kerning are independent of punctuation width',()=>{
  const text='字,A，B',style={tracking:-40,fontSize:20};
  const {runs}=spacing.fromPSD({text,style,styleRuns:[
    {length:1,style:{kerning:-100,autoKerning:false}},{length:2,style:{tracking:80}},{length:2,style:{}}
  ]});
  assert.equal(runs[0].kern,-100);assert.equal(runs[1].delta,120);assert.equal(runs[2].delta,0);
  const changed=spacing.edited(runs,text,'字,AB，B');
  assert.equal(changed.reduce((n,r)=>n+r.length,0),6);
  assert.equal(spacing.slice(changed,4,6)[0].delta,0);
  assert.equal(spacing.slice(changed,0,1)[0].kern,-100);
});
test('a trailing Photoshop terminator does not introduce an extra run',()=>{
  const result=spacing.fromPSD({text:'A,',style:{tracking:30},styleRuns:[{length:2,style:{}},{length:1,style:{fontSize:60}}]});
  assert.equal(result.style.tracking,30);assert.equal(result.runs,null);
});

test('Photoshop cached optical pair adjustments are not a change to tracking',()=>{
  const tx={text:'ABC',shapeType:'point',style:{fontSize:100,tracking:-75,font:{name:'Demo'}}};
  const story={Editor:{Text:'ABC\r'},'FontVectorData ???':{_type:'/G',
    21:{0:[1,2,3,0],1:[0,89.5,182,274.5,300]},6:{0:[{7:-3},{}],1:[1,3]}}};
  spacing.captureLayout([{text:tx}],[story]);
  const {layout,runs}=spacing.fromPSD(tx);assert.equal(layout.tracking,-75);assert.equal(runs[1].kern,-30);
  let x;const span={setAttribute:(k,v)=>{if(k==='x')x=v;},querySelectorAll:()=>[]};
  spacing.positionLine(span,layout,'ABC','ABC',0,100,-6,0,'left');
  assert.equal(x,'0 91 185');
  const changed=spacing.edited(runs,'ABC','XBC');assert.equal(spacing.slice(changed,1,2)[0].kern,0);
  const different={...tx,text:'BCD',vqGlyphLayout:undefined};spacing.captureLayout([{text:different}],[story]);
  assert.equal(different.vqGlyphLayout,undefined);
});

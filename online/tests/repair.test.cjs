'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{repairPixels}=require('../repair-worker.js');
test('repairs a colored mark from neighboring texture and changes only the mask',()=>{
  const w=96,h=80,data=new Uint8ClampedArray(w*h*4),mask=new Uint8Array(w*h),expected=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,t=Math.round(120+22*Math.sin(y*.7));expected.set([t,t+10,t-10,255],i*4);mask[i]=x>=40&&x<55&&y>=32&&y<45?255:0;data.set(mask[i]?[255,0,240,255]:expected.subarray(i*4,i*4+4),i*4);}
  const out=repairPixels(w,h,data,mask);let error=0,count=0;
  for(let i=0;i<w*h;i++)if(mask[i]){error+=Math.abs(out[i*4]-expected[i*4]);count++;}else for(let c=0;c<4;c++)assert.equal(out[i*4+c],expected[i*4+c]);
  assert(error/count<5);
});
test('empty mask is unchanged and a fully masked image reports no donor',()=>{
  const input=new Uint8ClampedArray([3,8,12,255]);assert.deepEqual(repairPixels(1,1,input,new Uint8Array([0])),input);assert.throws(()=>repairPixels(1,1,input,new Uint8Array([255])),/留出/);
});

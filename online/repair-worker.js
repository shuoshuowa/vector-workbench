/* Exemplar fill. Donors must come entirely from the original, unpainted region.
   The front advances in small patches; a worker keeps brush interaction cancellable. */
function repairPixels(w,h,rgba,mask,progress=()=>{}){
  if(!(w>0&&h>0)||rgba.length!==4*w*h||mask.length!==w*h)throw Error('修补区域尺寸无效。');
  const n=w*h,original=rgba.slice(),unknown=Uint8Array.from(mask,v=>v?1:0),queued=new Uint8Array(n),queue=new Int32Array(n),donor=new Int32Array(n);
  const stride=w+1,integral=new Uint32Array(stride*(h+1));let total=0,done=0,head=0,tail=0;
  for(let y=0;y<h;y++){let count=0;for(let x=0;x<w;x++){const i=y*w+x;count+=unknown[i];total+=unknown[i];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+count;donor[i]=i;}}
  if(!total)return rgba;if(total===n)throw Error('选区覆盖了整张图片，请留出一部分可供取样的背景。');
  const enqueue=i=>{if(unknown[i]&&!queued[i]){queue[tail++]=i;queued[i]=1;}};
  function neighbors(i,fn){if(i%w)fn(i-1);if(i%w<w-1)fn(i+1);if(i>=w)fn(i-w);if(i+w<n)fn(i+w);}
  for(let i=0;i<n;i++)if(unknown[i])neighbors(i,j=>{if(!unknown[j])enqueue(i);});
  const r=Math.min(6,Math.max(2,Math.round(Math.sqrt(total)/10))),fill=Math.max(1,Math.floor(r/2)),search=Math.min(110,Math.max(18,Math.ceil(Math.sqrt(total)*1.2)));
  let seed=0x6d2b79f5,lastProgress=-1;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  while(head<tail){
    const i=queue[head++];if(!unknown[i])continue;
    const x=i%w,y=Math.floor(i/w),offsets=[];let nearest=-1;
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;
      const k=yy*w+xx;if(unknown[k])continue;if(nearest<0)nearest=donor[k];
      if((dx+dy)%2===0||Math.abs(dx)+Math.abs(dy)<=2)offsets.push(k-i);}
    if(nearest<0)continue;
    let best=-1,bestScore=Infinity;
    function consider(xx,yy){if(xx<r||yy<r||xx+r>=w||yy+r>=h)return;
      const L=xx-r,R=xx+r+1,T=yy-r,B=yy+r+1;if(integral[B*stride+R]-integral[T*stride+R]-integral[B*stride+L]+integral[T*stride+L])return;
      const j=yy*w+xx;let score=.012*((xx-x)**2+(yy-y)**2);
      for(const delta of offsets){const a=(i+delta)*4,b=(j+delta)*4,aa=rgba[a+3]/255,ba=original[b+3]/255;score+=(rgba[a+3]-original[b+3])**2;for(let c=0;c<3;c++)score+=(rgba[a+c]*aa-original[b+c]*ba)**2;if(score>=bestScore)return;}
      if(score<bestScore){best=j;bestScore=score;}
    }
    neighbors(i,j=>{if(!unknown[j]){const s=donor[j];consider(s%w+x-j%w,Math.floor(s/w)+y-Math.floor(j/w));}});
    for(const step of [r+1,2*r+1,4*r+2,search])for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]])consider(x+dx*step,y+dy*step);
    for(let k=0;k<64;k++)consider(x+Math.round((2*random()-1)*search),y+Math.round((2*random()-1)*search));
    if(best>=0){const bx=best%w,by=Math.floor(best/w);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)consider(bx+dx,by+dy);}
    const correction=[0,0,0];if(best>=0&&offsets.length){for(const d of offsets)for(let c=0;c<3;c++)correction[c]+=rgba[(i+d)*4+c]-original[(best+d)*4+c];for(let c=0;c<3;c++)correction[c]=Math.max(-18,Math.min(18,correction[c]/offsets.length));}
    const radius=best<0?0:fill;
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const k=yy*w+xx;if(!unknown[k])continue;
      const src=best<0?nearest:best+dy*w+dx;unknown[k]=0;donor[k]=src;done++;
      for(let c=0;c<4;c++)rgba[k*4+c]=original[src*4+c]+(correction[c]||0);neighbors(k,enqueue);}
    const percent=Math.floor(done/total*100);if(percent>=lastProgress+4){progress(percent);lastProgress=percent;}
  }
  for(let i=0;i<n;i++)if(mask[i]&&mask[i]<255){const alpha=mask[i]/255;for(let c=0;c<4;c++)rgba[i*4+c]=rgba[i*4+c]*alpha+original[i*4+c]*(1-alpha);}
  return rgba;
}
if(typeof self!=='undefined')self.onmessage=({data})=>{try{const out=repairPixels(data.w,data.h,new Uint8ClampedArray(data.pixels),new Uint8Array(data.mask),p=>self.postMessage({progress:p}));self.postMessage({pixels:out.buffer},[out.buffer]);}catch(e){self.postMessage({error:e.message});}};
if(typeof module!=='undefined')module.exports={repairPixels};

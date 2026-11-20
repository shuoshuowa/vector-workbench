/* World coordinates are millimetres, positive downwards; artwork stays page-local. */
const Artboards=(()=>{
  const gap=14;
  function size(p){const r=p.viewBox.baseVal;return {w:r.width,h:r.height};}
  function set(p,{x,y,name}){p.dataset.boardX=String(x);p.dataset.boardY=String(y);p.dataset.boardName=name;}
  function arrange(pages){const cols=Math.max(1,Math.ceil(Math.sqrt(pages.length))),positions=[];let x=0,y=0,h=0;
    pages.forEach((p,i)=>{if(i&&i%cols===0){x=0;y+=h+gap;h=0;}const s=size(p);positions.push({x,y});x+=s.w+gap;h=Math.max(h,s.h);});return positions;
  }
  function list(pages){const auto=arrange(pages);return pages.map((p,i)=>({index:i,name:p.dataset.boardName||'画板 '+(i+1),x:Number.isFinite(Number(p.dataset.boardX))?+p.dataset.boardX:auto[i].x,y:Number.isFinite(Number(p.dataset.boardY))?+p.dataset.boardY:auto[i].y,...size(p),unit:p.dataset.boardUnit||'mm'}));}
  function initialize(pages){list(pages).forEach((a,i)=>set(pages[i],a));}
  function nextName(pages,base){const names=new Set(list(pages).map(a=>a.name));if(base&&!names.has(base))return base;let i=base?2:1;while(names.has((base||'画板')+' '+i))i++;return (base||'画板')+' '+i;}
  function modify(pages,selected,a){
    initialize(pages);
    const i=Number.isInteger(a.index)?a.index:selected,p=pages[i];if(!p)throw Error('画板不存在。');
    const all=list(pages),b=all[i],coord=n=>Number.isFinite(n)&&Math.abs(n)<=1000000;
    function dimensions(w,h){if(![w,h].every(n=>Number.isFinite(n)&&n>=.01&&n<=2000.001))throw Error('画板宽高需为 0.01 至 2000 毫米。');}
    if(a.op==='delete'){if(pages.length<2)throw Error('至少保留一块画板。');pages.splice(i,1);return Math.min(i,pages.length-1);}
    if(a.op==='arrange'){arrange(pages).forEach((pos,j)=>set(pages[j],{...all[j],...pos}));return i;}
    if(a.op==='order'){const to=a.to;if(!Number.isInteger(to)||to<0||to>=pages.length)throw Error('画板顺序无效。');pages.splice(i,1);pages.splice(to,0,p);return to;}
    const w=a.w??b.w,h=a.h??b.h;dimensions(w,h);
    if(a.op==='add'||a.op==='duplicate'){
      let x=a.x??b.x+b.w+gap,y=a.y??b.y;if(!coord(x)||!coord(y))throw Error('画板坐标无效。');
      if(a.x===undefined)while(all.some(v=>x<v.x+v.w&&x+w>v.x&&y<v.y+v.h&&y+h>v.y))x=Math.max(...all.filter(v=>y<v.y+v.h&&y+h>v.y).map(v=>v.x+v.w))+gap;
      const copy=a.op==='duplicate'?VectorModel.clone(p):VectorModel.board(w,h,b.unit);
      set(copy,{x,y,name:nextName(pages,a.op==='duplicate'?b.name+' 副本':'')});pages.splice(i+1,0,copy);return i+1;
    }
    if(a.op!=='change')throw Error('未知画板操作。');
    const x=a.x??b.x,y=a.y??b.y,name=(a.name??b.name).trim();if(!coord(x)||!coord(y)||!name||name.length>128)throw Error('请输入有效的画板名称和坐标。');
    if(Math.abs(w-b.w)>.000001||Math.abs(h-b.h)>.000001){
      if(a.keepArtwork&&(b.x!==x||b.y!==y)){
        const g=VectorModel.make('g',{transform:'translate('+(b.x-x)+' '+(b.y-y)+')'});
        for(const el of [...p.children])if(!['defs','style','title','desc'].includes(el.localName))g.append(el);p.append(g);
      }
      p.setAttribute('width',w+'mm');p.setAttribute('height',h+'mm');p.setAttribute('viewBox','0 0 '+w+' '+h);delete p.dataset.sourcePage;
    }
    set(p,{x,y,name});return i;
  }
  return {list,set,initialize,modify};
})();

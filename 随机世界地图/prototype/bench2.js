"use strict";
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
function makeNoise(seed){const r=mulberry32(seed);const p=new Uint8Array(512),b=new Uint8Array(256);for(let i=0;i<256;i++)b[i]=i;for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));const t=b[i];b[i]=b[j];b[j]=t;}for(let i=0;i<512;i++)p[i]=b[i&255];const g=new Float32Array(256);for(let i=0;i<256;i++)g[i]=r()*2-1;const f=t=>t*t*t*(t*(t*6-15)+10),L=(a,b,t)=>a+(b-a)*t;const n=(x,y)=>{const xi=Math.floor(x)&255,yi=Math.floor(y)&255;const xf=x-Math.floor(x),yf=y-Math.floor(y);const u=f(xf),v=f(yf);return L(L(g[p[(xi+p[yi])&511]],g[p[(xi+1+p[yi])&511]],u),L(g[p[(xi+p[yi+1])&511]],g[p[(xi+1+p[yi+1])&511]],u),v);};return(x,y,o,l,ga)=>{let a=1,fq=1,s=0,nm=0;for(let i=0;i<o;i++){s+=a*n(x*fq,y*fq);nm+=a;a*=ga;fq*=l;}return s/nm;};}
function mkGrid(W,H){const N=W*H;return{W,H,N,elev:new Float32Array(N),plate:new Int32Array(N),temp:new Float32Array(N),precip:new Float32Array(N),acc:new Float32Array(N)};}

// 优化水文: 桶排序 (按量化高程) O(N+B), 替代 sort O(N log N)
function hydroBucket(g){
  const W=g.W,H=g.H,N=g.N,elev=g.elev,acc=g.acc,flow=new Int32Array(N);
  const t0=performance.now();
  acc.fill(1);
  // 量化高程到 [0, B) 整数桶
  let lo=Infinity,hi=-Infinity;
  for(let i=0;i<N;i++){const e=elev[i];if(e<lo)lo=e;if(e>hi)hi=e;}
  const B=Math.min(N,1<<16);const span=(hi-lo)||1;
  const bucket=new Int32Array(B+1);
  const qi=new Int32Array(N);
  for(let i=0;i<N;i++){let q=Math.floor((elev[i]-lo)/span*(B-1));if(q<0)q=0;if(q>=B)q=B-1;qi[i]=q;bucket[q+1]++;}
  for(let i=0;i<B;i++)bucket[i+1]+=bucket[i];
  const order=new Int32Array(N);
  const cur=bucket.slice(0,B);
  for(let i=0;i<N;i++){order[cur[qi[i]]++]=i;} // 桶内随意顺序
  // 流向 (最低邻居)
  for(let y=0;y<H;y++){for(let x=0;x<W;x++){const id=y*W+x;let best=id,bh=elev[id];for(let dy=-1;dy<=1;dy++){for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=((x+dx)%W+W)%W,ny=y+dy;if(ny<0||ny>=H)continue;const nid=ny*W+nx;if(elev[nid]<bh){bh=elev[nid];best=nid;}}}flow[id]=best;}}
  // 汇流累积: 高->低 (同桶内顺序无所谓, 因为流向去更低桶)
  for(let i=N-1;i>=0;i--){const id=order[i];const to=flow[id];if(to!==id)acc[to]+=acc[id];}
  return performance.now()-t0;
}
// 优化气候降水: 不分配数组, 用索引方向
function climateOpt(g,sunDist){
  const W=g.W,H=g.H,N=g.N,elev=g.elev,temp=g.temp,precip=g.precip;
  const t0=performance.now();const sf=1/(sunDist*sunDist);
  for(let y=0;y<H;y++){const lat=(y/(H-1))*Math.PI-Math.PI/2;const baseT=Math.cos(lat)*40*sf-30;for(let x=0;x<W;x++){const id=y*W+x;const h=elev[id];temp[id]=baseT-Math.max(0,h)*0.065;}}
  for(let y=0;y<H;y++){const lat=(y/(H-1))*Math.PI-Math.PI/2;const dir=Math.sign(Math.sin(lat))*Math.cos(lat)>=0?1:-1;let moist=0;const start=dir>=0?0:W-1;for(let s=0;s<W;s++){const x=start+dir*s;const id=y*W+x;if(elev[id]<0)moist+=5;else moist-=Math.max(0,elev[id])*2;moist=Math.max(0,moist);precip[id]=moist;}}
  return performance.now()-t0;
}
function setup(g,seed){const fbm=makeNoise(seed);for(let y=0;y<g.H;y++)for(let x=0;x<g.W;x++)g.elev[y*g.W+x]=fbm((x/g.W)*8,(y/g.H)*4,6,2,0.5);}

function run(label,W,H){const g=mkGrid(W,H);setup(g,12345);
  // 取 5 次平均
  let th=0,tc=0,K=5;
  for(let i=0;i<K;i++){th+=hydroBucket(g);tc+=climateOpt(g,1);}
  th/=K;tc/=K;
  console.log(`${label.padEnd(12)} N=${String(W*H).padStart(7)}  水文/步: ${th.toFixed(1)}ms  气候/步: ${tc.toFixed(1)}ms  合计/步: ${(th+tc).toFixed(1)}ms`);
}
console.log("=== 优化后基准 (桶排序水文 + 无分配气候) ===\n");
run("小 256x128",256,128);
run("中 512x256",512,256);
run("大 1024x512",1024,512);
console.log("\n对比: 原水文(sort) 131k=47ms, 524k=467ms");

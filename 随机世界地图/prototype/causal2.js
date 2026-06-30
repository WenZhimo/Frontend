// 因果链原型 v2: 修正水汽耗散 + ITCZ辐合 + 山脉"榨干"水汽形成雨影
// 关键修正: (1)降水不能超过可用shu汽 min()上限 (2)赤道ITCZ辐合增雨 (3)副热带抑制
"use strict";
const W = 80, H = 40;
const elev=new Float32Array(W*H), temp=new Float32Array(W*H), precip=new Float32Array(W*H), biome=new Int8Array(W*H);
const lat = y => (y/(H-1))*180-90;
function makeTerrain(){
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const id=y*W+x;let e=-1;
    if(x>=6&&x<=78){e=0.05;const d=Math.abs(x-32);if(d<5)e=1-d/5;
      const d2=Math.abs(x-55);if(d2<3&&y<20)e=Math.max(e,0.7-d2/3);}
    elev[id]=e;}
}
function makeTemp(){for(let y=0;y<H;y++){const b=30-Math.abs(lat(y))*0.55;for(let x=0;x<W;x++){const id=y*W+x;temp[id]=b-Math.max(0,elev[id])*25;}}}
function makePrecip(){
  for(let y=0;y<H;y++){
    const la=lat(y),a=Math.abs(la);
    const dx=(a<30)?-1:(a<60)?+1:-1;            // 信风/西风/极地东风
    const hadley=Math.exp(-Math.pow((a-30)/14,2)); // ±30°下沉最强
    const effCoeff=0.06-0.055*hadley;             // 副热带几乎不降雨
    const itcz=Math.exp(-Math.pow(la/9,2));        // 赤道辐合增雨
    const polar=Math.exp(-Math.pow((a-58)/8,2));   // 极锋降雨
    let moist=0;
    const order=[...Array(W).keys()]; if(dx>0)order.reverse();
    for(const x of order){const id=y*W+x;const e=elev[id];
      if(e<0){moist+=300;continue;}
      const mtn=Math.max(0,e-0.3);
      const orographic=mtn*250;
      const conv=(itcz+polar)*0.3;
      let p=moist*effCoeff + moist*conv + orographic;
      p=Math.min(moist,p);                         // 不能下超过现有水汽
      moist-=p; precip[id]=p;
    }
  }
}
function classify(){for(let i=0;i<W*H;i++){if(elev[i]<0){biome[i]=0;continue;}const t=temp[i],p=precip[i];
  if(t<-10){biome[i]=1;continue;}if(t<0){biome[i]=p>30?3:2;continue;}if(t<12){biome[i]=p>50?4:5;continue;}
  if(p<10)biome[i]=6;else if(p<25)biome[i]=7;else if(p<50)biome[i]=5;else if(t>22&&p>80)biome[i]=8;else if(t>22)biome[i]=9;else biome[i]=4;}}
const BSYM=["~","#","T","F","F",".","D","s","R","r"];
makeTerrain();makeTemp();makePrecip();classify();
console.log("=== 因果链原型 v2: 修正后 ===\n");
console.log("【生物群落】 ~海 #冰 T苔 F温带林 .草原 D沙漠 s灌木 R雨林 r季风林\n  (山脉在x≈32; 上=北极 下=南极)");
for(let y=0;y<H;y++){let s="";for(let x=0;x<W;x++)s+=BSYM[biome[y*W+x]];console.log(s);}
console.log("\n=== 定量检验 ===");
// (A) 雨影
let wW=0,wN=0,eD=0,eN=0;
for(let y=0;y<H;y++){const a=Math.abs(lat(y));if(a<30||a>60)continue;
  for(let x=24;x<32;x++){wW+=precip[y*W+x];wN++;}for(let x=33;x<41;x++){eD+=precip[y*W+x];eN++;}}
console.log(`(A) 雨影[温带西风, 山脉x=32]: 迎风西=${(wW/wN).toFixed(1)} 背风东=${(eD/eN).toFixed(1)} 比=${(eD/eN/(wW/wN)).toFixed(2)} ${eD/eN<wW/wN*0.5?"✓雨影形成":"✗"}`);
// (B) 纬度带
let eq=0,eN2=0,sub=0,sN=0;
for(let y=0;y<H;y++){const a=Math.abs(lat(y));
  if(a<8){for(let x=6;x<78;x++){eq+=precip[y*W+x];eN2++;}}
  if(a>24&&a<36){for(let x=6;x<78;x++){sub+=precip[y*W+x];sN++;}}}
console.log(`(B) 纬度带: 赤道=${(eq/eN2).toFixed(1)} 副热带=${(sub/sN).toFixed(1)} ${sub/sN<eq/eN2*0.3?"✓副热带干燥":"✗"} (赤道应远湿于副热带)`);
// (C) 沙漠分布
const db=[0,0,0,0];let dTot=0,dRS=0;
for(let y=0;y<H;y++)for(let x=6;x<78;x++){if(biome[y*W+x]===6){dTot++;const a=Math.abs(lat(y));db[a<15?0:a<30?1:a<45?2:3]++;if(x>33&&x<41&&a>30&&a<60)dRS++;}}
console.log(`(C) 沙漠${dTot}格: 赤道0-15°=${db[0]} 副热带15-30°=${db[1]} 温带30-45°=${db[2]} 高纬=${db[3]}; 雨影区=${dRS}`);
console.log(`    → ${db[1]+dRS>=dTot*0.6?"✓PASS: 沙漠集中在副热带+雨影(物理合理)":"✗分布散乱"}`);

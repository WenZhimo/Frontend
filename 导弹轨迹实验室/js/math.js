(function(root){
  const ns=root.MissileLab;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const length=v=>Math.hypot(v.x,v.y);
  const normalize=v=>{const d=length(v)||1;return{x:v.x/d,y:v.y/d};};
  const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y});
  const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
  const dot=(a,b)=>a.x*b.x+a.y*b.y;
  const scale=(v,s)=>({x:v.x*s,y:v.y*s});
  const limit=(v,max)=>{const d=length(v);return d>max?scale(v,max/d):{x:v.x,y:v.y};};
  const rotate=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return{x:v.x*c-v.y*s,y:v.x*s+v.y*c};};
  const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  const bezier=(p0,p1,p2,p3,t)=>{const u=1-t;return{x:u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,y:u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y};};
  const hermite=(p0,p1,v0,v1,t)=>{const t2=t*t,t3=t2*t,h00=2*t3-3*t2+1,h10=t3-2*t2+t,h01=-2*t3+3*t2,h11=t3-t2;return{x:h00*p0.x+h10*v0.x+h01*p1.x+h11*v1.x,y:h00*p0.y+h10*v0.y+h01*p1.y+h11*v1.y};};
  const catmull=(p0,p1,p2,p3,t)=>{const t2=t*t,t3=t2*t;return{x:.5*(2*p1.x+(-p0.x+p2.x)*t+(2*p0.x-5*p1.x+4*p2.x-p3.x)*t2+(-p0.x+3*p1.x-3*p2.x+p3.x)*t3),y:.5*(2*p1.y+(-p0.y+p2.y)*t+(2*p0.y-5*p1.y+4*p2.y-p3.y)*t2+(-p0.y+3*p1.y-3*p2.y+p3.y)*t3)};};
  ns.math={clamp,length,normalize,add,sub,dot,scale,limit,rotate,lerp,bezier,hermite,catmull};
})(window);

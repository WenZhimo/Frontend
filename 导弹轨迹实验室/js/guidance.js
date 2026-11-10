(function(root){
  const ns=root.MissileLab, M=ns.math;
  const sideOf=v=>({x:-v.y,y:v.x});
  const pathFollow=(m,point,tangent,maxAccel,turnGain)=>{
    const error=M.sub(point,m.position);
    const tangentDir=M.normalize(tangent);
    const lookAhead=Math.min(m.maxSpeed*.72,Math.max(24,M.length(error)*.7));
    const aim=M.add(error,M.scale(tangentDir,lookAhead));
    const desiredSpeed=M.clamp(M.length(aim)*3.1,42,m.maxSpeed);
    const desired=M.scale(M.normalize(aim),desiredSpeed);
    return M.limit(M.scale(M.sub(desired,m.velocity),turnGain),maxAccel);
  };
  const spiralHermitePath=(m,target,t)=>{
    const axis=M.normalize(M.sub(target,m.start)),side=sideOf(axis),distance=Math.max(1,M.length(M.sub(target,m.start)));
    const progress=M.clamp(t,0,1),after=Math.max(0,t-1);
    const tangent0=M.add(M.scale(m.launchDirection,distance*.58),M.scale(side,m.curveOffset*.6));
    const tangent1=M.add(M.scale(target.velocity||{x:0,y:0},.65),M.scale(side,-m.curveOffset*.28));
    const hermitePoint=M.hermite(m.start,target,tangent0,tangent1,progress);
    const base=progress<1?hermitePoint:M.add(target,M.scale(axis,Math.min(distance*.14,after*distance*.1)));
    const radius=progress<1
      ? distance*.2*Math.sin(Math.PI*progress)
      : distance*.2*Math.exp(-after/1.35);
    const phase=m.seed+m.spinRate*(t*m.pathDuration);
    const orbit=M.scale(M.rotate(axis,phase),radius);
    const point=M.add(base,orbit);
    const nextT=t+.025;
    const nextProgress=M.clamp(nextT,0,1),nextAfter=Math.max(0,nextT-1);
    const nextHermite=M.hermite(m.start,target,tangent0,tangent1,nextProgress);
    const nextBase=nextT<1?nextHermite:M.add(target,M.scale(axis,Math.min(distance*.14,nextAfter*distance*.1)));
    const nextRadius=nextT<1?distance*.2*Math.sin(Math.PI*nextProgress):distance*.2*Math.exp(-nextAfter/1.35);
    const nextOrbit=M.scale(M.rotate(axis,m.seed+m.spinRate*(nextT*m.pathDuration)),nextRadius);
    return {point,next:M.add(nextBase,nextOrbit)};
  };
  const pathFor=(id,m,target,t)=>{
    const axis=M.normalize(M.sub(target,m.start)),side=sideOf(axis),d=Math.max(1,M.length(M.sub(target,m.start)));
    const bend=m.curveOffset;
    let point,next;
    if(id==='bezier'){
      const p0=m.start,p3=target;
      const p1=M.add(M.lerp(p0,p3,.22),M.scale(side,bend));
      const p2=M.add(M.lerp(p0,p3,.70),M.scale(side,bend*.82));
      point=M.bezier(p0,p1,p2,p3,t);next=M.bezier(p0,p1,p2,p3,M.clamp(t+.035,0,1));
    }else if(id==='hermite'){
      const v0=M.add(M.scale(m.launchDirection,d*.62),M.scale(side,bend*.92));
      const v1=M.add(M.scale(target.velocity||{x:0,y:0},.8),M.scale(side,-bend*.55));
      point=M.hermite(m.start,target,v0,v1,t);next=M.hermite(m.start,target,v0,v1,M.clamp(t+.035,0,1));
    }else if(id==='spline'){
      // Catmull-Rom 的 t=1 必须落在 p2；把目标作为终点控制点，
      // 将侧向偏移放到前后控制点，避免曲线永远停在目标旁边。
      const p0=M.add(m.start,M.add(M.scale(m.launchDirection,-d*.18),M.scale(side,bend*.5)));
      const p1=m.start,p2=target,p3=M.add(target,M.scale(side,bend*.75));
      point=M.catmull(p0,p1,p2,p3,t);next=M.catmull(p0,p1,p2,p3,M.clamp(t+.035,0,1));
    }else if(id==='spiral-hermite'){
      const spiral=spiralHermitePath(m,target,t);
      point=spiral.point;next=spiral.next;
    }else{
      const phase=t;
      const xuesenPhase=p=>{
        if(p<.34){return M.add(m.start,M.add(M.scale(m.launchDirection,d*p*1.95),M.scale(side,bend*Math.sin(p*Math.PI/.34))));}
        if(p<.70){return M.add(target,M.add(M.scale(side,bend*.72),M.scale(axis,-d*.12)));}
        return target;
      };
      point=xuesenPhase(phase);next=xuesenPhase(M.clamp(phase+.035,0,1));
    }
    return {point,tangent:M.sub(next,point)};
  };
  function acceleration(m,target,world){
    const id=m.mode;
    if(id==='straight'||id==='ballistic') return id==='ballistic'?{x:0,y:world.gravity}:{x:0,y:0};
    // 推进阶段也允许制导介入；推进只增加当前速度的大小，不锁死航向。
    const guidanceBlend=m.guidanceRamp===0?1:M.clamp((m.age-m.turnDelay)/(m.guidanceRamp??1.35),0,1);
    if(['bezier','hermite','spline','xuesen','spiral-hermite'].includes(id)){
      const rawT=m.age/m.pathDuration,t=id==='spiral-hermite'?rawT:M.clamp(rawT,0,1),path=pathFor(id,m,target,t);
      const maxAccel=id==='xuesen'?1350:id==='spiral-hermite'?1750:1650;
      const turnGain=id==='xuesen'?3.0:id==='spiral-hermite'?4.2:3.8;
      const curveAccel=pathFollow(m,path.point,path.tangent,maxAccel,turnGain);
      if(id==='spiral-hermite'){
        const hold=M.limit(M.scale(M.sub(target,m.position),Math.max(0,t-0.72)*1.7),720);
        return M.scale(M.add(curveAccel,hold),guidanceBlend);
      }
      return M.scale(curveAccel,guidanceBlend);
    }
    const toTarget=M.sub(target,m.position),distance=Math.max(1,M.length(toTarget));
    const axis=M.normalize(toTarget),side=sideOf(axis);
    if(id==='pn'){
      const velocity=M.length(m.velocity)>1?m.velocity:M.scale(m.launchDirection,m.maxSpeed*.35);
      const speed=Math.max(1,M.length(velocity)),velocityDirection=M.normalize(velocity),targetDirection=M.normalize(toTarget);
      const closing=Math.max(0,M.dot(velocity,targetDirection));
      const losRate=(velocity.x*toTarget.y-velocity.y*toTarget.x)/(distance*distance);
      const normal=sideOf(velocityDirection);
      const bearingError=velocityDirection.x*targetDirection.y-velocityDirection.y*targetDirection.x;
      // 接近速度用于 PN，方位误差用于捕获，避免目标在侧后方时 PN 失去控制量。
      const pnCommand=world.navigationGain*closing*losRate;
      const captureCommand=bearingError*620;
      const behind=Math.max(0,-M.dot(velocityDirection,targetDirection));
      const behindSign=Math.sign(bearingError)||Math.sign(m.curveOffset)||1;
      const behindCommand=behind*behindSign*520;
      const lateral=pnCommand+captureCommand+behindCommand;
      return M.scale(M.limit(M.scale(normal,lateral),1350),guidanceBlend);
    }
    if(id==='homing'){
      const lead=M.clamp(distance/Math.max(80,m.maxSpeed),.12,.85);
      const predicted=M.add(target,M.scale(target.velocity||{x:0,y:0},lead));
      const weave=M.scale(side,m.curveOffset*(1-M.clamp(m.age/m.pathDuration,0,1))*.9);
      const lateral=M.scale(side,Math.sin(m.age*1.8+m.seed)*Math.abs(m.curveOffset)*1.6);
      return M.scale(M.add(pathFollow(m,M.add(predicted,weave),M.sub(predicted,m.position),1100,3.4),lateral),guidanceBlend);
    }
    if(id==='physics'){
      // 物理模拟使用弹簧 + 阻尼：速度保留惯性，但在目标附近会主动耗散，
      // 避免只在目标周围绕圈而不命中。侧向扰动随时间衰减，仍能留下可见弧线。
      const spring=M.scale(toTarget,4.8),drag=M.scale(m.velocity,-1.65);
      const lateral=M.scale(side,Math.sin(m.age*1.55+m.seed)*Math.max(28,Math.abs(m.curveOffset)*.7)*Math.exp(-m.age*.38));
      return M.scale(M.limit(M.add(M.add(spring,drag),M.add({x:0,y:world.gravity*.16},lateral)),1550),guidanceBlend);
    }
    const error=toTarget;
    m.integral=M.add(m.integral,M.scale(error,world.dt));
    m.integral=M.limit(m.integral,260);
    const derivative=M.scale(M.sub(error,m.previousError),1/Math.max(.001,world.dt));
    m.previousError=error;
    const pidLateral=M.scale(sideOf(axis),Math.sin(m.age*1.6+m.seed)*Math.abs(m.curveOffset)*1.3*(1-M.clamp(m.age/m.pathDuration,0,1)));
    return M.scale(M.limit(M.add(M.add(M.add(M.scale(error,2.8),M.scale(m.integral,.045)),M.add(M.scale(derivative,.08),M.scale(m.velocity,-.52))),pidLateral),1250),guidanceBlend);
  }
  ns.guidance={acceleration,pathFor};
})(window);

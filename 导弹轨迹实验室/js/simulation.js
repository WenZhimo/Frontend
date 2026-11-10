(function(root){
  const ns=root.MissileLab, M=ns.math;
  const TAU=ns.TAU;
  class MissileSimulation{
    constructor(options){
      this.mode=options.mode;
      this.module=options.module||{id:options.mode,accent:'#6de0e2'};
      this.canvas=options.canvas;
      this.ctx=this.canvas.getContext('2d');
      this.targetProvider=options.targetProvider;
      this.launchAngleDeg=options.launchAngleDeg||0;
      this.salvoSize=options.salvoSize||4;
      this.randomLaunch=Boolean(options.randomLaunch);
      this.hitRadius=options.hitRadius||13;
      this.gravity=options.gravity||190;
      this.speedScale=options.speedScale||1;
      this.guidanceScale=options.guidanceScale||1;
      this.guidanceRamp=options.guidanceRamp===undefined?1.35:options.guidanceRamp;
      this.maxAcceleration=options.maxAcceleration||3000;
      this.boostDuration=options.boostDuration||.5;
      this.turnDelay=options.turnDelay;
      this.missiles=[];
      this.hitCount=0;
      this.destroyedCount=0;
      this.elapsed=0;
      this.resize();
    }
    resize(){
      const rect=this.canvas.getBoundingClientRect();
      const dpr=Math.min(root.devicePixelRatio||1,2);
      this.width=Math.max(260,rect.width||640);
      this.height=Math.max(180,rect.height||245);
      this.canvas.width=Math.floor(this.width*dpr);
      this.canvas.height=Math.floor(this.height*dpr);
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this.launcher={x:this.width*.18,y:this.height*.52};
      this.size=Math.min(this.width,this.height);
    }
    target(){return this.targetProvider(this)||{x:this.width*.78,y:this.height*.48,velocity:{x:0,y:0}};}
    spawn(count=this.salvoSize,options={}){
      const target=this.target(),raw=M.sub(target,this.launcher),distance=Math.max(1,M.length(raw));
      const powered=ns.POWERED_MODES.includes(this.mode);
      const baseDirection=M.normalize(raw),angle=(this.mode==='straight'||this.mode==='ballistic')?this.launchAngleDeg*Math.PI/180:0;
      for(let i=0;i<count;i++){
        const randomDirection=options.randomDirection===true||this.randomLaunch;
        const poweredDirection=powered&&!randomDirection;
        const poweredAngle=poweredDirection?((i-(count-1)/2)*1.22+(Math.random()-.5)*.16):0;
        const jitter=randomDirection?(Math.random()*TAU):(this.mode==='straight'||this.mode==='ballistic'?0:poweredAngle);
        let launchDirection=randomDirection?{x:Math.cos(jitter),y:Math.sin(jitter)}:M.rotate(baseDirection,angle+jitter);
        const nominalSpeed=(205+Math.random()*20)*this.speedScale;
        let pathDuration=Math.max(3.2,distance/nominalSpeed*2.05);
        let ballisticVelocity=null;
        if(this.mode==='ballistic'&&!randomDirection){
          const coastDuration=Math.max(1.25,distance/nominalSpeed*1.25);
          pathDuration=.5+coastDuration;
          const boostDisplacementTime=.25;
          const required={x:raw.x/(coastDuration+boostDisplacementTime),y:(raw.y-.5*this.gravity*coastDuration*coastDuration)/(coastDuration+boostDisplacementTime)};
          ballisticVelocity=M.rotate(required,angle);
          launchDirection=M.normalize(ballisticVelocity);
        }
        const maxSpeed=ballisticVelocity?Math.max(nominalSpeed,M.length(ballisticVelocity)):nominalSpeed;
        const sideOffset=(i-(count-1)/2)*distance*.19+(Math.random()-.5)*distance*.035;
        const missile={
          id:`${this.mode}-${Date.now()}-${i}-${Math.random().toString(16).slice(2)}`,
          mode:this.mode,start:{...this.launcher},position:{...this.launcher},velocity:{x:0,y:0},acceleration:{x:0,y:0},
          launchDirection,age:0,boostDuration:this.boostDuration,pathDuration,maxSpeed,ballisticVelocity,ballisticStarted:false,guidanceRamp:this.guidanceRamp,
          curveOffset:randomDirection?((Math.random()<.5?-1:1)*distance*(.3+Math.random()*.28)):sideOffset,seed:Math.random()*TAU,
          initialAngle:poweredDirection?poweredAngle:0,
          turnDelay:powered?(this.turnDelay===undefined?.14+Math.random()*.12:this.turnDelay):0,
          spinRate:this.mode==='spiral-hermite'?(5.2+Math.random()*1.8):0,
          maxRange:distance*5,trail:[{...this.launcher}],samples:[{time:0,x:this.launcher.x,y:this.launcher.y}],
          integral:{x:0,y:0},previousError:{x:0,y:0},hit:false,destroyed:false,impactAge:0
        };
        this.missiles.push(missile);
      }
    }
    reset(){this.missiles=[];this.hitCount=0;this.destroyedCount=0;this.elapsed=0;}
    update(dt){
      this.elapsed+=dt;
      const target=this.target();
      this.missiles.forEach(m=>{
        if(m.hit||m.destroyed)return;
        m.age+=dt;
        const previousPosition={...m.position};
        const world={dt,gravity:this.gravity,navigationGain:18};
        let output;
        if(m.age<m.boostDuration){
          const thrust=m.maxSpeed/m.boostDuration;
          const powered=ns.POWERED_MODES.includes(this.mode);
          // 推进沿当前速度方向增加速率；有动力导弹在加速阶段也可转向。
          const boostDirection=M.length(m.velocity)>1?M.normalize(m.velocity):m.launchDirection;
          const thrustAcceleration=M.scale(boostDirection,thrust);
          const steering=powered?M.scale(ns.guidance.acceleration(m,target,world),this.guidanceScale):{x:0,y:0};
          output=M.add(thrustAcceleration,steering);
        }else{
          const guidance=ns.guidance.acceleration(m,target,world);
          output=ns.POWERED_MODES.includes(this.mode)?M.scale(guidance,this.guidanceScale):guidance;
        }
        m.acceleration=M.limit(output,this.maxAcceleration);
        m.velocity=M.add(m.velocity,M.scale(m.acceleration,dt));
        if(this.mode==='ballistic'&&m.ballisticVelocity&&!m.ballisticStarted&&m.age>=m.boostDuration){
          m.velocity={...m.ballisticVelocity};
          m.ballisticStarted=true;
        }
        if(this.mode!=='ballistic')m.velocity=M.limit(m.velocity,m.maxSpeed);
        m.position=M.add(m.position,M.scale(m.velocity,dt));
        m.trail.push({...m.position});
        if(m.trail.length>1400)m.trail.shift();
        if(m.samples.length<2400)m.samples.push({time:Number(this.elapsed.toFixed(4)),x:Number(m.position.x.toFixed(3)),y:Number(m.position.y.toFixed(3))});
        if(M.length(M.sub(m.position,m.start))>m.maxRange){m.destroyed=true;this.destroyedCount++;return;}
        const travel=M.sub(m.position,previousPosition),travelLengthSq=M.dot(travel,travel);
        const segmentT=travelLengthSq>0?M.clamp(M.dot(M.sub(target,previousPosition),travel)/travelLengthSq,0,1):0;
        const closest=M.add(previousPosition,M.scale(travel,segmentT));
        if(M.length(M.sub(target,m.position))<=this.hitRadius||M.length(M.sub(target,closest))<=this.hitRadius){m.hit=true;m.impactAge=0;this.hitCount++;}
      });
    }
    activeCount(){return this.missiles.filter(m=>!m.hit&&!m.destroyed).length;}
    draw(){
      const c=this.ctx,w=this.width,h=this.height,target=this.target();
      c.clearRect(0,0,w,h);c.fillStyle='#080c0d';c.fillRect(0,0,w,h);
      c.lineWidth=1;
      for(let x=0;x<w;x+=34){c.strokeStyle='rgba(157,193,189,.055)';c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
      for(let y=0;y<h;y+=34){c.strokeStyle='rgba(157,193,189,.055)';c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
      c.strokeStyle='rgba(157,193,189,.11)';c.setLineDash([2,6]);c.beginPath();c.moveTo(w*.5,0);c.lineTo(w*.5,h);c.moveTo(0,h*.5);c.lineTo(w,h*.5);c.stroke();c.setLineDash([]);
      // 轨迹可能离开原始画布；根据当前完整采样范围自动缩放视图，
      // 保证发射器、目标和弧线同时可见，而不再依赖墙壁碰撞。
      const points=[this.launcher,target];
      this.missiles.forEach(m=>m.trail.forEach(point=>points.push(point)));
      const xs=points.map(point=>point.x),ys=points.map(point=>point.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const pad=34,spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
      const viewScale=Math.min(1,(w-pad*2)/spanX,(h-pad*2)/spanY);
      const centerX=(minX+maxX)/2,centerY=(minY+maxY)/2;
      c.save();
      c.translate(w/2,h/2);c.scale(viewScale,viewScale);c.translate(-centerX,-centerY);
      this.missiles.forEach(m=>{
        if(m.trail.length>1){c.beginPath();c.moveTo(m.trail[0].x,m.trail[0].y);m.trail.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.strokeStyle=this.module.accent;c.globalAlpha=m.destroyed?.16:m.hit?.28:.55;c.lineWidth=1.2;c.stroke();c.globalAlpha=1;}
        if(m.destroyed)return;
        if(m.hit){c.strokeStyle=this.module.accent;c.globalAlpha=Math.max(0,.72-m.impactAge*.12);c.beginPath();c.arc(m.position.x,m.position.y,9+m.impactAge*9,0,TAU);c.stroke();c.globalAlpha=1;return;}
        const a=Math.atan2(m.velocity.y,m.velocity.x);c.save();c.translate(m.position.x,m.position.y);c.rotate(a);c.fillStyle=this.module.accent;c.shadowColor=this.module.accent;c.shadowBlur=10;c.beginPath();c.moveTo(7,0);c.lineTo(-5,-2.8);c.lineTo(-2,0);c.lineTo(-5,2.8);c.closePath();c.fill();c.restore();
      });
      const launcher=this.launcher,launcherAngle=Math.atan2(target.y-launcher.y,target.x-launcher.x);
      c.save();c.translate(launcher.x,launcher.y);c.rotate(launcherAngle);c.strokeStyle=this.module.accent;c.globalAlpha=.35;c.beginPath();c.arc(0,0,17,0,TAU);c.stroke();c.globalAlpha=.8;c.lineWidth=2;c.beginPath();c.moveTo(-9,0);c.lineTo(8,0);c.stroke();c.fillStyle=this.module.accent;c.beginPath();c.moveTo(11,0);c.lineTo(1,-5);c.lineTo(1,5);c.closePath();c.fill();c.restore();
      c.save();c.translate(target.x,target.y);c.strokeStyle='rgba(109,224,226,.35)';c.beginPath();c.arc(0,0,16+Math.sin(this.elapsed*3)*2,0,TAU);c.stroke();c.strokeStyle='#6de0e2';c.beginPath();c.arc(0,0,7,0,TAU);c.stroke();c.fillStyle='#dfffff';c.shadowColor='#6de0e2';c.shadowBlur=14;c.beginPath();c.arc(0,0,3,0,TAU);c.fill();c.restore();
      c.restore();
    }
  }
  ns.MissileSimulation=MissileSimulation;
})(window);

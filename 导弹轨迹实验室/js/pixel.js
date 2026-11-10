(function(root){
  'use strict';
  const ns=root.MissileLab;
  const M=ns.math;
  const TAU=ns.TAU;
  const modules=ns.MODULES;
  const simulations=[];
  const PIXEL_DENSITY=.5;
  const state={
    paused:false,
    time:0,
    last:performance.now(),
    targetMode:'static',
    drift:.42,
    launchAngleDeg:0,
    target:{x:.78,y:.48},
    totalHits:0
  };

  const hexToRgb=hex=>{
    const value=String(hex||'#6de0e2').replace('#','');
    const full=value.length===3?value.split('').map(x=>x+x).join(''):value;
    return {r:parseInt(full.slice(0,2),16)||109,g:parseInt(full.slice(2,4),16)||224,b:parseInt(full.slice(4,6),16)||226};
  };
  const rgba=(rgb,a)=>`rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
  const randomBetween=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  function normalizedTarget(sim){
    const b=state.target,t=state.time;
    if(state.targetMode==='static')return{x:b.x*sim.width,y:b.y*sim.height,velocity:{x:0,y:0}};
    const x=b.x+Math.sin(t*.55+1.2)*.095*state.drift+Math.sin(t*.19)*.035*state.drift;
    const y=b.y+Math.cos(t*.42)*.075*state.drift+Math.sin(t*.31+2)*.03*state.drift;
    const vx=(Math.cos(t*.55+1.2)*.095*.55+Math.cos(t*.19)*.035*.19)*state.drift*sim.width;
    const vy=(-Math.sin(t*.42)*.075*.42+Math.cos(t*.31+2)*.03*.31)*state.drift*sim.height;
    return{x:M.clamp(x,.06,.94)*sim.width,y:M.clamp(y,.1,.9)*sim.height,velocity:{x:vx,y:vy}};
  }

  function createSprite(kind,accent){
    const scale=2;
    const canvas=document.createElement('canvas');
    const sizes={missile:[24,12],flame:[13,9],smoke:[13,13],smokeLarge:[17,17],ember:[7,7],trail:[7,7],spark:[9,9]};
    const [w,h]=sizes[kind]||sizes.missile;
    canvas.width=w;canvas.height=h;
    const c=canvas.getContext('2d');
    c.imageSmoothingEnabled=false;
    const rgb=hexToRgb(accent);
    if(kind==='missile'){
      c.clearRect(0,0,w,h);
      c.fillStyle='rgba(4,7,8,.95)';c.fillRect(4,3,15,6);
      c.fillStyle='#d9e6df';c.fillRect(6,2,10,1);c.fillRect(6,9,10,1);c.fillRect(5,4,13,4);
      c.fillStyle=rgba(rgb,1);c.fillRect(8,4,8,3);c.fillRect(17,4,2,3);
      c.fillStyle='#ffffff';c.fillRect(18,4,3,3);c.fillRect(21,5,1,1);
      c.fillStyle='#8aa7a0';c.fillRect(8,2,3,1);c.fillRect(8,9,3,1);
      c.fillStyle='#394b49';c.fillRect(4,4,2,3);c.fillRect(3,3,1,2);c.fillRect(3,7,1,2);
      c.fillStyle='#f0c477';c.fillRect(5,5,2,2);
    }else if(kind==='flame'){
      c.clearRect(0,0,w,h);
      c.fillStyle=rgba(rgb,.95);c.fillRect(2,3,9,3);c.fillRect(4,2,5,5);c.fillRect(1,4,2,1);
      c.fillStyle='#e9f8ff';c.fillRect(4,3,6,3);c.fillRect(6,2,2,5);
      c.fillStyle='#ffffff';c.fillRect(6,3,3,2);c.fillRect(8,4,2,1);
    }else if(kind==='smoke'||kind==='smokeLarge'){
      c.clearRect(0,0,w,h);
      c.save();if(kind==='smokeLarge')c.translate(2,2);
      c.fillStyle='#526663';c.fillRect(3,3,7,7);c.fillRect(1,5,10,5);c.fillRect(5,1,5,3);c.fillRect(5,9,5,3);
      c.fillStyle='#78908a';c.fillRect(4,4,4,3);c.fillRect(7,2,2,3);c.fillRect(2,7,3,2);
      c.fillStyle='#344744';c.fillRect(1,8,3,2);c.fillRect(8,8,3,2);c.fillRect(9,4,2,3);
      if(kind==='smokeLarge'){c.fillStyle='rgba(166,183,171,.55)';c.fillRect(6,5,4,4);c.fillRect(4,7,3,3);}
      c.restore();
    }else if(kind==='ember'){
      c.clearRect(0,0,w,h);c.fillStyle=rgba(rgb,.95);c.fillRect(2,1,3,5);c.fillRect(1,3,5,2);c.fillStyle='#e9f8ff';c.fillRect(2,2,2,3);c.fillStyle='#ffffff';c.fillRect(3,2,1,1);
    }else if(kind==='trail'){
      c.clearRect(0,0,w,h);c.fillStyle=rgba(rgb,.92);c.fillRect(1,2,5,3);c.fillRect(2,1,3,5);c.fillStyle='#ffffff';c.fillRect(2,2,2,2);
    }else{
      c.clearRect(0,0,w,h);c.fillStyle='#ffffff';c.fillRect(4,0,1,3);c.fillRect(4,6,1,3);c.fillRect(0,4,3,1);c.fillRect(6,4,3,1);c.fillStyle=rgba(rgb,1);c.fillRect(3,3,3,3);
    }
    return {canvas,scale};
  }

  class PixelRenderer{
    constructor(sim,module){
      this.sim=sim;
      this.module=module;
      this.ctx=sim.ctx;
      this.rgb=hexToRgb(module.accent);
      this.sprites={
        missile:createSprite('missile',module.accent),
        flame:createSprite('flame',module.accent),
        smoke:createSprite('smoke',module.accent),
        smokeLarge:createSprite('smokeLarge',module.accent),
        ember:createSprite('ember',module.accent),
        trail:createSprite('trail',module.accent),
        spark:createSprite('spark',module.accent)
      };
      this.particles=[];
      this.frame=0;
      this.camera={scale:1,cx:sim.width*.5,cy:sim.height*.5,initialized:false};
      this.applyPixelCanvas();
    }
    resize(){
      this.applyPixelCanvas();
      this.ctx=this.sim.ctx;
      this.camera.initialized=false;
    }
    applyPixelCanvas(){
      const sim=this.sim;
      const pixelWidth=Math.max(160,Math.round(sim.width*PIXEL_DENSITY));
      const pixelHeight=Math.max(120,Math.round(sim.height*PIXEL_DENSITY));
      sim.canvas.width=pixelWidth;
      sim.canvas.height=pixelHeight;
      sim.ctx=sim.canvas.getContext('2d');
      sim.ctx.imageSmoothingEnabled=false;
      sim.ctx.setTransform(pixelWidth/sim.width,0,0,pixelHeight/sim.height,0,0);
      this.ctx=sim.ctx;
    }
    resetView(){
      this.camera.initialized=false;
    }
    spawnParticle(type,x,y,options={}){
      const angle=options.angle??Math.random()*TAU;
      const speed=options.speed??randomBetween(5,22);
      const life=options.life??randomBetween(.22,.6);
      const smoke=type==='smoke'||type==='smokeLarge';
      this.particles.push({type,x,y,vx:Math.cos(angle)*speed+(options.vx||0),vy:Math.sin(angle)*speed+(options.vy||0),life,maxLife:life,size:options.size||1,rotation:options.rotation||0,spin:options.spin||0,alpha:options.alpha??1,gravity:options.gravity??(smoke?-8:type==='ember'?10:0),drag:options.drag??(smoke?.28:type==='flame'?.08:type==='ember'?.34:.18),wobble:options.wobble||0,phase:Math.random()*TAU});
      if(this.particles.length>1300)this.particles.splice(0,100);
    }
    flameFor(m){
      if(m.hit||m.destroyed)return;
      const direction=M.normalize(M.length(m.velocity)>1?m.velocity:m.launchDirection);
      const back=M.scale(direction,-1);
      const side={x:-back.y,y:back.x};
      const exhaustAngle=Math.atan2(back.y,back.x);
      const p=M.add(m.position,M.scale(back,randomBetween(14,18)));
      // 三层喷流：近端白热核心、中段橙焰和远端余烬，所有粒子出生后独立运动。
      for(let i=0;i<3;i++){
        const spread=(i-1)*2.2+randomBetween(-2,2);
        this.spawnParticle('flame',p.x+side.x*spread,p.y+side.y*spread,{angle:exhaustAngle+randomBetween(-.22,.22),speed:randomBetween(30,78),life:randomBetween(.12,.28),size:randomBetween(.8,1.28),alpha:randomBetween(.78,1)});
      }
      for(let i=0;i<2;i++){
        this.spawnParticle('ember',p.x+back.x*randomBetween(2,8)+side.x*randomBetween(-3,3),p.y+back.y*randomBetween(2,8)+side.y*randomBetween(-3,3),{angle:exhaustAngle+randomBetween(-.55,.55),speed:randomBetween(48,112),life:randomBetween(.28,.7),size:randomBetween(.65,1.15),alpha:randomBetween(.65,.95)});
      }
      // 彩色轨迹散点负责留下连续的像素弧线，拐弯时会自然形成扇面。
      for(let i=0;i<3;i++){
        const distance=randomBetween(16,34);
        this.spawnParticle('trail',m.position.x+back.x*distance+side.x*randomBetween(-6,6),m.position.y+back.y*distance+side.y*randomBetween(-6,6),{angle:exhaustAngle+randomBetween(-1.05,1.05),speed:randomBetween(14,72),life:randomBetween(.42,1.05),size:randomBetween(.55,1.15),alpha:randomBetween(.45,.95),wobble:randomBetween(2,8),spin:randomBetween(-1,1)});
      }
      if(this.frame%3===0){
        for(let i=0;i<2;i++){
          this.spawnParticle('smoke',p.x+back.x*randomBetween(8,18)+side.x*randomBetween(-4,4),p.y+back.y*randomBetween(8,18)+side.y*randomBetween(-4,4),{angle:exhaustAngle+randomBetween(-.9,.9),speed:randomBetween(5,19),life:randomBetween(1.05,1.9),size:randomBetween(.75,1.25),alpha:randomBetween(.48,.72),wobble:randomBetween(4,10),spin:randomBetween(-.7,.7)});
        }
      }
      if(this.frame%8===0)this.spawnParticle('smokeLarge',p.x+back.x*randomBetween(20,30),p.y+back.y*randomBetween(20,30),{angle:exhaustAngle+randomBetween(-1.15,1.15),speed:randomBetween(3,12),life:randomBetween(1.45,2.5),size:randomBetween(.85,1.35),alpha:randomBetween(.34,.56),wobble:randomBetween(6,14),spin:randomBetween(-.45,.45)});
    }
    impactFor(m){
      if(!m.hit||m.impactSpawned)return;
      m.impactSpawned=true;
      for(let i=0;i<24;i++)this.spawnParticle('spark',m.position.x,m.position.y,{angle:TAU*i/24+randomBetween(-.18,.18),speed:randomBetween(35,145),life:randomBetween(.24,.68),size:randomBetween(.7,1.35)});
      for(let i=0;i<12;i++)this.spawnParticle('ember',m.position.x+randomBetween(-5,5),m.position.y+randomBetween(-5,5),{angle:randomBetween(0,TAU),speed:randomBetween(45,130),life:randomBetween(.28,.72),size:randomBetween(.65,1.3)});
      for(let i=0;i<16;i++)this.spawnParticle('smoke',m.position.x+randomBetween(-7,7),m.position.y+randomBetween(-7,7),{angle:randomBetween(0,TAU),speed:randomBetween(8,38),life:randomBetween(.9,1.8),size:randomBetween(.8,1.45),alpha:randomBetween(.55,.82),wobble:randomBetween(4,12),spin:randomBetween(-.8,.8)});
      for(let i=0;i<5;i++)this.spawnParticle('smokeLarge',m.position.x+randomBetween(-8,8),m.position.y+randomBetween(-8,8),{angle:randomBetween(0,TAU),speed:randomBetween(5,22),life:randomBetween(1.35,2.4),size:randomBetween(.9,1.45),alpha:randomBetween(.45,.7),wobble:randomBetween(5,12),spin:randomBetween(-.6,.6)});
    }
    updateParticles(dt){
      this.frame++;
      this.sim.missiles.forEach(m=>{this.flameFor(m);this.impactFor(m);});
      this.particles.forEach(p=>{
        p.life-=dt;p.x+=(p.vx+Math.sin(this.frame*.045+p.phase)*p.wobble)*dt;p.y+=p.vy*dt;p.vx*=Math.pow(p.drag,dt);p.vy*=Math.pow(p.drag,dt);p.vy+=p.gravity*dt;p.rotation+=p.spin*dt;
      });
      this.particles=this.particles.filter(p=>p.life>0);
    }
    view(){
      const sim=this.sim,target=sim.target();
      const points=[sim.launcher,target];
      sim.missiles.forEach(m=>m.trail.forEach(p=>points.push(p)));
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
      const pad=42,spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
      const desiredScale=Math.min(1,(sim.width-pad*2)/spanX,(sim.height-pad*2)/spanY);
      const desiredCx=(minX+maxX)/2,desiredCy=(minY+maxY)/2;
      if(!this.camera.initialized){
        this.camera={scale:desiredScale,cx:desiredCx,cy:desiredCy,initialized:true};
      }else{
        // 粒子不参与相机边界；相机只对完整轨迹做低通跟随，避免每一帧跳变。
        const follow=.09;
        this.camera.scale+= (desiredScale-this.camera.scale)*follow;
        this.camera.cx+=(desiredCx-this.camera.cx)*follow;
        this.camera.cy+=(desiredCy-this.camera.cy)*follow;
      }
      return this.camera;
    }
    background(){
      const c=this.ctx,w=this.sim.width,h=this.sim.height;
      c.clearRect(0,0,w,h);c.fillStyle='#06090b';c.fillRect(0,0,w,h);
      c.lineWidth=1;
      for(let x=0;x<w;x+=32){c.strokeStyle='rgba(149,184,179,.07)';c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
      for(let y=0;y<h;y+=32){c.strokeStyle='rgba(149,184,179,.07)';c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
      c.strokeStyle='rgba(149,184,179,.16)';c.setLineDash([2,7]);c.beginPath();c.moveTo(w/2,0);c.lineTo(w/2,h);c.moveTo(0,h/2);c.lineTo(w,h/2);c.stroke();c.setLineDash([]);
    }
    drawTrail(m){
      if(m.trail.length<2)return;
      const c=this.ctx;
      c.beginPath();c.moveTo(m.trail[0].x,m.trail[0].y);for(let i=1;i<m.trail.length;i++)c.lineTo(m.trail[i].x,m.trail[i].y);
      c.strokeStyle=rgba(this.rgb,m.hit?.24:m.destroyed?.1:.28);c.lineWidth=1;c.setLineDash([2,8]);c.stroke();c.setLineDash([]);
    }
    drawParticle(p){
      const c=this.ctx,life=clamp(p.life/p.maxLife,0,1),age=1-life;
      const sprite=this.sprites[p.type];
      if(!sprite)return;
      const smoke=p.type==='smoke'||p.type==='smokeLarge';
      const fade=smoke?Math.min(1,life*1.15)*.82:life;
      const base=p.type==='smokeLarge'?18:p.type==='smoke'?13:p.type==='ember'?7:p.type==='trail'?6:p.type==='spark'?8:15;
      const growth=smoke?.72+age*1.15: p.type==='flame'?1.12-age*.48:.8+life*.25;
      c.save();c.translate(p.x,p.y);c.rotate(p.rotation);c.globalAlpha=p.alpha*fade;
      const size=base*p.size*growth;
      c.drawImage(sprite.canvas,-size/2,-size/2,size,size);c.restore();
    }
    drawMissile(m){
      if(m.destroyed)return;
      const c=this.ctx;
      if(m.hit){
        c.globalAlpha=Math.max(0,1-m.impactAge*1.1);c.fillStyle=rgba(this.rgb,.22);c.beginPath();c.arc(m.position.x,m.position.y,10+m.impactAge*22,0,TAU);c.fill();c.globalAlpha=1;return;
      }
      const angle=Math.atan2((M.length(m.velocity)>2?m.velocity:m.launchDirection).y,(M.length(m.velocity)>2?m.velocity:m.launchDirection).x);
      c.save();c.translate(m.position.x,m.position.y);c.rotate(angle);c.globalAlpha=.98;c.drawImage(this.sprites.missile.canvas,-17,-8,34,17);c.restore();
    }
    drawActors(){
      const c=this.ctx,sim=this.sim,target=sim.target();
      const launcherAngle=Math.atan2(target.y-sim.launcher.y,target.x-sim.launcher.x);
      c.save();c.translate(sim.launcher.x,sim.launcher.y);c.rotate(launcherAngle);c.fillStyle='#172326';c.fillRect(-14,-9,20,18);c.fillStyle=rgba(this.rgb,.9);c.fillRect(0,-5,16,10);c.fillStyle='#081011';c.fillRect(8,-3,9,6);c.fillStyle='#d6eea1';c.fillRect(15,-2,3,4);c.restore();
      c.save();c.translate(target.x,target.y);c.strokeStyle='rgba(109,224,226,.42)';c.lineWidth=1;c.beginPath();c.arc(0,0,17+Math.sin(this.sim.elapsed*3)*2,0,TAU);c.stroke();c.strokeStyle='#7be7e5';c.beginPath();c.arc(0,0,7,0,TAU);c.stroke();c.fillStyle='#efffff';c.fillRect(-2,-2,4,4);c.restore();
    }
    draw(){
      const c=this.ctx,sim=this.sim;
      this.background();
      const v=this.view();
      c.save();c.translate(sim.width/2,sim.height/2);c.scale(v.scale,v.scale);c.translate(-v.cx,-v.cy);
      sim.missiles.forEach(m=>this.drawTrail(m));
      this.particles.forEach(p=>this.drawParticle(p));
      sim.missiles.forEach(m=>this.drawMissile(m));
      this.drawActors();
      c.restore();
    }
  }

  function cardFor(module){
    const card=document.createElement('article');
    card.className='pixel-module';card.style.setProperty('--accent',module.accent);
    card.innerHTML=`<header class="pixel-module-head"><div class="pixel-module-id"><span class="pixel-index">${module.index}</span><div class="pixel-module-title"><h3>${module.title}</h3><p>${module.subtitle}</p></div></div><div class="pixel-status"><i></i><span class="pixel-state-text">READY</span></div></header><div class="pixel-module-actions"><button class="fire" type="button" aria-label="发射 4 枚${module.title}导弹">发射</button><button class="reset" type="button" aria-label="重置${module.title}模块">重置</button></div><div class="pixel-canvas-wrap"><canvas class="pixel-canvas" aria-label="${module.title}像素弹道画布"></canvas><span class="pixel-canvas-label">${module.id.toUpperCase()} / SPRITE FIELD</span><span class="pixel-canvas-hint">点击设置目标</span></div><div class="pixel-module-info"><div class="pixel-info"><small>MISSILES</small><strong class="pixel-missile-count">00</strong></div><div class="pixel-info"><small>HITS</small><strong class="pixel-module-hits">00</strong></div><div class="pixel-info"><small>PHASE</small><strong class="pixel-phase">BOOST</strong></div><div class="pixel-info"><small>MAX SPEED</small><strong class="pixel-speed">000</strong></div></div>`;
    document.getElementById('pixelGrid').appendChild(card);
    const canvas=card.querySelector('.pixel-canvas');
    const simulation=new ns.MissileSimulation({mode:module.id,module,canvas,targetProvider:normalizedTarget,launchAngleDeg:state.launchAngleDeg,randomLaunch:ns.POWERED_MODES.includes(module.id),speedScale:1.38,guidanceScale:3.2,guidanceRamp:0,turnDelay:0,maxAcceleration:9000});
    const renderer=new PixelRenderer(simulation,module);
    simulation.renderer=renderer;
    simulation.spawn(4);
    card.querySelector('.fire').addEventListener('click',()=>simulation.spawn(4));
    card.querySelector('.reset').addEventListener('click',()=>{simulation.reset();renderer.particles=[];renderer.resetView();simulation.spawn(4);});
    canvas.addEventListener('pointerdown',event=>{const rect=canvas.getBoundingClientRect();state.target={x:M.clamp((event.clientX-rect.left)/rect.width,.06,.94),y:M.clamp((event.clientY-rect.top)/rect.height,.1,.9)};});
    simulation.card=card;simulation.nodes={count:card.querySelector('.pixel-missile-count'),hits:card.querySelector('.pixel-module-hits'),phase:card.querySelector('.pixel-phase'),speed:card.querySelector('.pixel-speed'),state:card.querySelector('.pixel-state-text')};
    simulations.push(simulation);
  }
  modules.forEach(cardFor);

  function updateReadouts(){
    let active=0,hits=0;
    simulations.forEach(sim=>{
      active+=sim.activeCount();hits+=sim.hitCount;
      const n=sim.nodes;n.count.textContent=String(sim.missiles.length).padStart(2,'0');n.hits.textContent=String(sim.hitCount).padStart(2,'0');n.speed.textContent=Math.round(sim.missiles.reduce((max,m)=>Math.max(max,m.maxSpeed),0));
      const live=sim.activeCount()>0;n.state.textContent=live?'ACTIVE':sim.hitCount?'HIT':'READY';n.phase.textContent=live&&sim.missiles.some(m=>m.age<.5&&!m.hit&&!m.destroyed)?'BOOST':'GUIDE';
    });
    state.totalHits=hits;document.getElementById('pixelActive').textContent=String(active).padStart(3,'0');document.getElementById('pixelHits').textContent=String(hits).padStart(3,'0');
  }
  function frame(now){
    const dt=Math.min(.035,(now-state.last)/1000);state.last=now;
    if(!state.paused){state.time+=dt;simulations.forEach(sim=>{sim.update(dt);sim.missiles.forEach(m=>{if(m.hit)m.impactAge+=dt;});sim.renderer.updateParticles(dt);sim.renderer.draw();});updateReadouts();}
    root.requestAnimationFrame(frame);
  }
  document.getElementById('pixelFireAll').addEventListener('click',()=>simulations.forEach(sim=>sim.spawn(4)));
  document.getElementById('pixelPause').addEventListener('click',event=>{state.paused=!state.paused;event.currentTarget.textContent=state.paused?'继续':'暂停';});
  document.querySelectorAll('[data-pixel-target]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-pixel-target]').forEach(item=>item.classList.remove('active'));button.classList.add('active');state.targetMode=button.dataset.pixelTarget;}));
  document.getElementById('pixelDrift').addEventListener('input',event=>{state.drift=Number(event.target.value);document.getElementById('pixelDriftValue').textContent=state.drift.toFixed(2);});
  document.getElementById('pixelAngle').addEventListener('input',event=>{state.launchAngleDeg=Number(event.target.value);simulations.forEach(sim=>sim.launchAngleDeg=state.launchAngleDeg);document.getElementById('pixelAngleValue').textContent=`${state.launchAngleDeg}°`;});
  root.addEventListener('resize',()=>simulations.forEach(sim=>{sim.resize();sim.renderer.resize();}));
  updateReadouts();simulations.forEach(sim=>sim.renderer.draw());root.requestAnimationFrame(frame);
  ns.pixelApp={state,simulations,renderers:simulations.map(sim=>sim.renderer)};
})(window);

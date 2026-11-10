(function(root){
  const ns=root.MissileLab, modules=ns.MODULES, simulations=[];
  const grid=document.getElementById('moduleGrid');
  const state={paused:false,time:0,last:performance.now(),targetMode:'static',drift:.42,launchAngleDeg:0,target:{x:.78,y:.48}};
  function normalizedTarget(sim){
    const b=state.target,t=state.time;
    if(state.targetMode==='static')return{x:b.x*sim.width,y:b.y*sim.height,velocity:{x:0,y:0}};
    const x=b.x+Math.sin(t*.55+1.2)*.095*state.drift+Math.sin(t*.19)*.035*state.drift;
    const y=b.y+Math.cos(t*.42)*.075*state.drift+Math.sin(t*.31+2)*.03*state.drift;
    const vx=(Math.cos(t*.55+1.2)*.095*.55+Math.cos(t*.19)*.035*.19)*state.drift*sim.width;
    const vy=(-Math.sin(t*.42)*.075*.42+Math.cos(t*.31+2)*.03*.31)*state.drift*sim.height;
    return{x:ns.math.clamp(x,.06,.94)*sim.width,y:ns.math.clamp(y,.1,.9)*sim.height,velocity:{x:vx,y:vy}};
  }
  function cardFor(module){
    const card=document.createElement('article');card.className='module';card.style.setProperty('--accent',module.accent);
    card.innerHTML=`<header class="module-head"><div class="module-id"><span class="module-index">${module.index}</span><div class="module-title"><h3>${module.title}</h3><p>${module.subtitle}</p></div></div><div class="module-state"><i class="state-dot"></i><span class="state-text">READY</span></div></header><div class="module-actions"><button class="module-action fire" type="button" aria-label="发射 4 枚导弹">发射</button><button class="module-action reset" type="button" aria-label="重置本模块">重置</button></div><div class="canvas-box"><canvas class="sim-canvas" aria-label="${module.title} 独立轨迹画布"></canvas><span class="canvas-label">${module.id.toUpperCase()} / LIVE FIELD</span><span class="canvas-hint">点击设置目标</span></div><div class="module-info"><div class="info-cell"><small>MISSILES</small><strong class="missile-count">00</strong></div><div class="info-cell"><small>HITS</small><strong class="module-hits">00</strong></div><div class="info-cell"><small>PHASE</small><strong class="phase-readout">BOOST</strong></div><div class="info-cell"><small>MAX SPEED</small><strong class="speed-readout">000</strong></div></div>`;
    grid.appendChild(card);
    const canvas=card.querySelector('.sim-canvas');
    const simulation=new ns.MissileSimulation({mode:module.id,module,canvas,targetProvider:normalizedTarget,launchAngleDeg:state.launchAngleDeg,randomLaunch:ns.POWERED_MODES.includes(module.id)});
    simulation.spawn(4);
    card.querySelector('.fire').addEventListener('click',()=>simulation.spawn(4));
    card.querySelector('.reset').addEventListener('click',()=>{simulation.reset();simulation.spawn(4);});
    canvas.addEventListener('pointerdown',event=>{const rect=canvas.getBoundingClientRect();state.target={x:ns.math.clamp((event.clientX-rect.left)/rect.width,.06,.94),y:ns.math.clamp((event.clientY-rect.top)/rect.height,.1,.9)};});
    simulation.card=card;simulation.nodes={count:card.querySelector('.missile-count'),hits:card.querySelector('.module-hits'),phase:card.querySelector('.phase-readout'),speed:card.querySelector('.speed-readout'),state:card.querySelector('.state-text')};simulations.push(simulation);
  }
  modules.forEach(cardFor);
  function updateReadouts(){
    let active=0,hits=0;
    simulations.forEach(sim=>{active+=sim.activeCount();hits+=sim.hitCount;const n=sim.nodes;n.count.textContent=String(sim.missiles.length).padStart(2,'0');n.hits.textContent=String(sim.hitCount).padStart(2,'0');n.speed.textContent=Math.round(sim.missiles.reduce((max,m)=>Math.max(max,m.maxSpeed),0));const hasLive=sim.activeCount()>0;n.state.textContent=hasLive?'ACTIVE':sim.hitCount?'HIT':'READY';n.phase.textContent=hasLive&&(sim.missiles.some(m=>m.age<.5&&!m.hit&&!m.destroyed))?'BOOST':'GUIDE';});
    document.getElementById('activeMetric').textContent=String(active).padStart(3,'0');document.getElementById('hitMetric').textContent=String(hits).padStart(3,'0');document.getElementById('timeMetric').textContent=`T+${state.time.toFixed(1).padStart(4,'0')}`;
  }
  function frame(now){const dt=Math.min(.035,(now-state.last)/1000);state.last=now;if(!state.paused){state.time+=dt;simulations.forEach(sim=>{sim.update(dt);sim.draw();});updateReadouts();}root.requestAnimationFrame(frame);}
  document.getElementById('fireAllButton').addEventListener('click',()=>simulations.forEach(sim=>sim.spawn(4)));
  document.getElementById('pauseButton').addEventListener('click',event=>{state.paused=!state.paused;event.currentTarget.textContent=state.paused?'继续':'暂停';});
  document.querySelectorAll('[data-target-mode]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-target-mode]').forEach(item=>item.classList.remove('active'));button.classList.add('active');state.targetMode=button.dataset.targetMode;document.getElementById('targetModeLabel').textContent=state.targetMode==='drift'?'DRIFT':'STATIC';}));
  document.getElementById('driftRange').addEventListener('input',event=>{state.drift=Number(event.target.value);document.getElementById('driftOutput').textContent=state.drift.toFixed(2);});
  document.getElementById('launchAngleRange').addEventListener('input',event=>{state.launchAngleDeg=Number(event.target.value);simulations.forEach(sim=>sim.launchAngleDeg=state.launchAngleDeg);document.getElementById('launchAngleOutput').textContent=`${state.launchAngleDeg}°`;});
  root.addEventListener('resize',()=>simulations.forEach(sim=>sim.resize()));
  updateReadouts();simulations.forEach(sim=>sim.draw());root.requestAnimationFrame(frame);
  ns.app={state,simulations};
})(window);

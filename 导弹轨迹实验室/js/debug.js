(function(root){
  const ns=root.MissileLab,M=ns.math;
  const modeSelect=document.getElementById('debugMode'),durationInput=document.getElementById('debugDuration'),startButton=document.getElementById('debugStart'),resetButton=document.getElementById('debugReset'),statusNode=document.getElementById('debugStatus'),logNode=document.getElementById('coordinateLog'),resultNode=document.getElementById('finalResult'),canvas=document.getElementById('debugCanvas');
  ns.MODULES.forEach(module=>{const option=document.createElement('option');option.value=module.id;option.textContent=`${module.index} · ${module.title}`;modeSelect.appendChild(option);});
  const targetProvider=sim=>({x:sim.width*.78,y:sim.height*.48,velocity:{x:0,y:0}});
  let simulation=null,testing=false,lastLogged=0,startedAt=0,frameHandle=0;
  function ensureSimulation(){const module=ns.MODULES.find(item=>item.id===modeSelect.value)||ns.MODULES[0];simulation=new ns.MissileSimulation({mode:module.id,module,canvas,targetProvider,randomLaunch:true,salvoSize:1});simulation.reset();simulation.spawn(1,{randomDirection:true});}
  function lineAnalysis(samples){
    if(samples.length<8)return{isLine:true,confidence:0,maxDeviation:0,reason:'采样点太少'};
    const first=samples[0],last=samples[samples.length-1],axis=M.normalize({x:last.x-first.x,y:last.y-first.y});
    let maxDeviation=0,sumDeviation=0;
    samples.forEach(sample=>{const rel={x:sample.x-first.x,y:sample.y-first.y};const deviation=Math.abs(rel.x*axis.y-rel.y*axis.x);maxDeviation=Math.max(maxDeviation,deviation);sumDeviation+=deviation;});
    const travel=Math.max(1,M.length({x:last.x-first.x,y:last.y-first.y}));
    const normalized=maxDeviation/travel,mean=(sumDeviation/samples.length)/travel;
    return{isLine:normalized<.035&&mean<.018,confidence:Math.max(0,1-normalized*8),maxDeviation:Number(maxDeviation.toFixed(3)),normalizedDeviation:Number(normalized.toFixed(5)),meanDeviation:Number(mean.toFixed(5)),reason:normalized<.035?'所有点接近首尾连线':'坐标点明显偏离首尾连线'};
  }
  function appendSample(){if(!simulation||!simulation.missiles[0])return;const missile=simulation.missiles[0],sample=missile.samples[missile.samples.length-1];if(!sample||sample.time<=lastLogged)return;lastLogged=sample.time;const lines=logNode.textContent==='等待开始测试……'?[]:logNode.textContent.split('\n');lines.push(`${sample.time.toFixed(3)}s  x=${sample.x.toFixed(2)}  y=${sample.y.toFixed(2)}`);logNode.textContent=lines.slice(-500).join('\n');logNode.scrollTop=logNode.scrollHeight;}
  function finish(reason){testing=false;statusNode.textContent='DONE';const missile=simulation.missiles[0],analysis=lineAnalysis(missile.samples),target=simulation.target(),targetAngle=Math.atan2(target.y-simulation.launcher.y,target.x-simulation.launcher.x)*180/Math.PI,launchAngle=Math.atan2(missile.launchDirection.y,missile.launchDirection.x)*180/Math.PI;const payload={mode:simulation.mode,sampleCount:missile.samples.length,termination:reason,hit:missile.hit,destroyed:missile.destroyed,initialDirection:{angleDeg:Number(launchAngle.toFixed(2)),targetAngleDeg:Number(targetAngle.toFixed(2)),differenceDeg:Number((((launchAngle-targetAngle+540)%360)-180).toFixed(2))},isLine:analysis.isLine,analysis,coordinates:missile.samples};resultNode.textContent=JSON.stringify(payload,null,2);startButton.disabled=false;cancelAnimationFrame(frameHandle);}
  function loop(){if(!testing)return;const now=performance.now(),dt=Math.min(.035,(now-(loop.last||now))/1000);loop.last=now;simulation.update(dt);simulation.draw();appendSample();const missile=simulation.missiles[0];if(simulation.elapsed>=Number(durationInput.value)||missile.hit||missile.destroyed){finish(missile.hit?'命中目标':missile.destroyed?'距离超过 5×发射器-目标距离':'达到测试时长');return;}frameHandle=requestAnimationFrame(loop);}
  startButton.addEventListener('click',()=>{cancelAnimationFrame(frameHandle);ensureSimulation();logNode.textContent='';resultNode.textContent='测试进行中，结束后输出最终结果……';statusNode.textContent='RUNNING';testing=true;lastLogged=0;loop.last=performance.now();startedAt=loop.last;startButton.disabled=true;frameHandle=requestAnimationFrame(loop);});
  resetButton.addEventListener('click',()=>{cancelAnimationFrame(frameHandle);testing=false;statusNode.textContent='READY';if(simulation){simulation.reset();simulation.draw();}logNode.textContent='等待开始测试……';resultNode.textContent='最终结果将在一次测试结束后写入这里。';startButton.disabled=false;});
  ensureSimulation();simulation.draw();
})(window);

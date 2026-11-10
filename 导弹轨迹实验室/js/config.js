(function(root){
  root.MissileLab = root.MissileLab || {};
  root.MissileLab.TAU = Math.PI * 2;
  root.MissileLab.POWERED_MODES = ['bezier','hermite','spline','pn','homing','physics','pid','xuesen','spiral-hermite'];
  root.MissileLab.MODULES = [
    {id:'straight', index:'01', title:'直线拦截', subtitle:'VECTOR LOCK · 固定发射角', accent:'#ff9158'},
    {id:'ballistic', index:'02', title:'抛物线', subtitle:'BALLISTIC · 固定角 + 重力', accent:'#e2c76e'},
    {id:'bezier', index:'03', title:'贝塞尔曲线', subtitle:'BEZIER · 随机航向 → 控制点', accent:'#f28dbe'},
    {id:'hermite', index:'04', title:'埃尔米特曲线', subtitle:'HERMITE · 随机航向 → 切线', accent:'#bca2ff'},
    {id:'spline', index:'05', title:'样条曲线', subtitle:'CATMULL-ROM · 随机航向 → 平滑', accent:'#7dd8a5'},
    {id:'pn', index:'06', title:'比例导航', subtitle:'PN · 随机航向 → 视线角速度', accent:'#86aaff'},
    {id:'homing', index:'07', title:'追踪目标', subtitle:'HOMING · 随机航向 → 预测拦截', accent:'#6de0e2'},
    {id:'physics', index:'08', title:'物理模拟', subtitle:'PHYSICS · 随机航向 + 惯性', accent:'#f4a261'},
    {id:'pid', index:'09', title:'PID 控制器', subtitle:'PID · 随机航向 → 平滑收敛', accent:'#d9f36b'},
    {id:'xuesen', index:'10', title:'钱学森弹道', subtitle:'XUESEN · 随机助推 → 俯冲', accent:'#ff6b70'},
    {id:'spiral-hermite', index:'11', title:'旋转埃尔米特', subtitle:'HERMITE SPIRAL · 切线 + 旋转终点保持', accent:'#ffb86b'}
  ];
})(window);

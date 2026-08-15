# 气候调优套件

该套件会把气候模拟参数同真实地球进行自动对齐。它在 Node 中直接运行高度图导入管线，使用 `assets/earth.png` 生成网格并模拟风、洋流、降水、温度和柯本气候，然后把模拟结果同观测柯本-盖革分类比较。

## 评分

- `exactAcc`：30 类柯本精确匹配率。
- `majorAcc`：A/B/C/D/E 大类匹配率。
- `macroF1`：各真实出现类别的非加权平均 F1。
- `objective = 0.5·exactAcc + 0.5·macroF1`：优化器最大化目标。

## 用法

```bash
node tuning/climate/evaluate.mjs --maps
node tuning/climate/optimize.mjs
node tuning/climate/optimize.mjs --iters 500 --subset all --label big-run
node tuning/climate/evaluate.mjs --params tuning/results/climate/<label>-best.json --n 160000 --maps
node tuning/climate/apply-params.mjs tuning/results/climate/<label>-best.json
```

默认网格分辨率为 `--n 40000`。写回参数前仍应在 160K 以上验证。

## 文件

```text
evaluate.mjs        评分单组参数并输出报告
optimize.mjs        优化参数空间
apply-params.mjs    把调优值写回 js/climate-config.js
param-space.mjs     参数范围和高影响标记
diagnose.mjs        空间误差报告
probe.mjs           参数敏感度探针
lib/                地球网格、评分、真实数据解析和渲染
```

## 诊断流程

调优循环为：诊断 -> 探针 -> 修改/调优 -> 再诊断。

```bash
node tuning/climate/diagnose.mjs --n 160000
node tuning/climate/probe.mjs
```

对比图颜色：绿色为精确匹配，黄色为大类匹配，红色为大类错误，深色为不评分区域。

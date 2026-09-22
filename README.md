---
![Stone Badge](https://stone.professorlee.work/api/stone/WenZhimo/Frontend)
---
# Frontend
前端合集。

[👉点我进入文件索引](https://wenzhimo.github.io/Frontend/)

## 索引自动更新

仓库目录索引由 `generate_full_index.py` 生成。当前仓库已经提供两层自动化：

- 本地提交前钩子会自动运行生成脚本，并把更新后的 `index.html` 加入当前提交。首次在新克隆的工作区运行 `setup_git_hooks.bat` 即可启用。
- `.github/workflows/update-index.yml` 会在推送到 `main` 后检查索引；即使提交来自 GitHub 网页或没有配置本地钩子的工作区，也会自动补齐索引。

索引日期取最近一次非 `index.html` 提交，避免 GitHub Actions 自动补交索引时反复触发工作流。

大部分内容可在[我的博客](https://www.wenzhimo.xyz/category/article/programing/html-css3/))里查看效果。

如果您为了寻找一些前端的效果而来，也请看看其它大佬的优秀仓库：[前端小小项目](https://github.com/Silvana-kite/html-css-js-project)和[前端特效存档](https://github.com/yangxi0126/javaScript)。

“扑克轮播”和“故障文字”来自BiliBili网站up主[JIEJOE_轻敲代码](https://space.bilibili.com/3546390319860710)。

关于“ASCII字符画”，详情请看[ASCII字符画编解码](https://www.wenzhimo.xyz/ascii%e5%ad%97%e7%ac%a6%e7%94%bb%e7%bc%96%e8%a7%a3%e7%a0%81/)，该文章介绍了如何对图像进行编解码，并附上python编码器实现。

免责声明：我不会前端，大部分代码都是AI写的，其中Gemini3Pro占绝大多数；因此你可以拿着这份代码去问AI，请不要问我。

如果您对嵌入式系统感兴趣，也可以看看[我的嵌入式系统项目](https://github.com/S-R-Afraid/Embedded-STM32)。

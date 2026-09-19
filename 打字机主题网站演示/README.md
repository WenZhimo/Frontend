# My Archive — 静态打字机主题演示

这是“打字机主题网站”的静态演示版本。它不依赖 WordPress 或构建工具，可以直接被 GitHub Pages、任意静态服务器，或本地 `python -m http.server` 提供。

## 本地运行

在仓库根目录执行：

```bash
python -m http.server 4173 --directory 打字机主题网站演示
```

然后打开 <http://localhost:4173>。

## 交互说明

- 悬停文件夹：取消上一项打印，立即开始新的标题预览。
- 点击文件夹：进入纸张阅读视图，并写入 `#/slug` 路由；浏览器前进/后退可用。
- 首次访问会播放启动纸张；`Shift + F5` 或阅读页的 `REPLAY OPENING` 可重播。
- 当前文章数据位于 `app.js` 的 `articles` 对象中，后续可把同一接口替换成 WordPress REST API。

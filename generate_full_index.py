import os
import urllib.parse
import datetime

# ================= 配置区域 =================
# 你的 GitHub Pages 基础 URL
BASE_URL = "https://s-r-afraid.github.io/Frontend/"

# 输出文件名
OUTPUT_FILENAME = "index.html"

# 忽略配置
EXCLUDED_DIRS = {'.git', '.github', '.vscode', 'node_modules', '__pycache__', 'dist', 'venv'}
EXCLUDED_FILES = {'.DS_Store', 'CNAME', '.gitignore', 'package-lock.json', '_config.yml',}
# ===========================================

def get_web_url(relative_path, is_markdown=False):
    """生成带前缀的完整 URL"""
    path = relative_path.replace(os.sep, '/')
    if path.startswith('./'):
        path = path[2:]
    
    # === 关键修改 ===
    # 如果是 Markdown 文件，将链接后缀改为 .html
    # 这样 GitHub Pages 就会显示渲染后的页面，而不是源码
    if is_markdown and path.endswith('.md'):
        path = path[:-3] + '.html'
        
    safe_path = urllib.parse.quote(path)
    return BASE_URL + safe_path

def generate_tree_html(current_dir):
    """递归生成 HTML 结构"""
    try:
        items = os.listdir(current_dir)
    except PermissionError:
        return ""

    dirs = []
    files = []

    for item in items:
        if item.startswith('.') or item in EXCLUDED_FILES or item in EXCLUDED_DIRS:
            continue
            
        full_path = os.path.join(current_dir, item)
        if os.path.isdir(full_path):
            dirs.append(item)
        else:
            files.append(item)

    dirs.sort()
    files.sort()

    if not dirs and not files:
        return ""

    html = '<ul class="tree-list">\n'

    # 1. 文件夹
    for d in dirs:
        sub_path = os.path.join(current_dir, d)
        sub_html = generate_tree_html(sub_path)
        
        if sub_html:
            html += f'''
            <li class="folder-item">
                <details> 
                    <summary class="folder-name"><span class="icon">📂</span>{d}</summary>
                    {sub_html}
                </details>
            </li>
            '''
        else:
            html += f'<li class="folder-item empty"><span class="icon">📂</span>{d} (空)</li>'

    # 2. 文件
    for f in files:
        rel_path = os.path.join(current_dir, f)
        
        # 判断是否为 markdown 文件
        is_md = f.lower().endswith('.md')
        
        # 获取链接 (如果是 md，内部会自动转为 html 链接)
        url = get_web_url(rel_path, is_markdown=is_md)
        
        # 设置不同的图标
        icon = "📝" if is_md else "📄"
        
        # 显示文件名 (保持原名，不改后缀，这样你知道它是 md)
        html += f'<li class="file-item"><span class="icon">{icon}</span><a href="{url}" target="_blank">{f}</a></li>\n'

    html += '</ul>'
    return html

def main():
    print("正在生成暗黑模式 HTML 目录树 (Markdown 自动渲染版)...")
    
    tree_content = generate_tree_html(".")
    
    full_html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Frontend Index</title>
    <style>
        :root {{
            --bg-color: #0d1117;
            --card-bg: #161b22;
            --text-color: #c9d1d9;
            --link-color: #58a6ff;
            --link-hover: #79c0ff;
            --border-color: #30363d;
            --hover-bg: #21262d;
            --icon-color: #8b949e;
        }}
        
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 20px;
            line-height: 1.5;
        }}

        .container {{
            max-width: 900px;
            margin: 0 auto;
            background: var(--card-bg);
            padding: 40px;
            border-radius: 6px;
            border: 1px solid var(--border-color);
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }}

        h1 {{
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 15px;
            margin-bottom: 20px;
            font-size: 24px;
            color: #f0f6fc;
        }}
        
        .meta-info {{
            font-size: 13px;
            color: var(--icon-color);
            margin-bottom: 25px;
            background: rgba(56, 139, 253, 0.1);
            padding: 10px;
            border-radius: 6px;
            border: 1px solid rgba(56, 139, 253, 0.4);
        }}

        .meta-info a {{
            color: var(--text-color);
            text-decoration: underline;
        }}

        ul.tree-list {{
            list-style-type: none;
            padding-left: 18px;
            margin: 0;
            border-left: 1px solid var(--border-color);
        }}
        
        .container > ul.tree-list {{
            padding-left: 0;
            border-left: none;
        }}

        li {{ margin: 2px 0; }}

        .icon {{ margin-right: 8px; opacity: 0.8; }}

        details > summary {{
            cursor: pointer;
            padding: 6px 10px;
            border-radius: 6px;
            list-style: none; 
            transition: background 0.2s;
            display: flex;
            align-items: center;
        }}
        
        details > summary::-webkit-details-marker {{ display: none; }}
        
        details > summary::before {{
            content: "▶";
            font-size: 10px;
            display: inline-block;
            margin-right: 8px;
            color: var(--icon-color);
            transition: transform 0.2s;
        }}

        details[open] > summary::before {{ transform: rotate(90deg); }}

        details > summary:hover {{
            background-color: var(--hover-bg);
            color: #f0f6fc;
        }}

        .file-item {{
            padding-left: 28px;
            padding-top: 4px;
            padding-bottom: 4px;
        }}

        a {{
            text-decoration: none;
            color: var(--link-color);
            transition: color 0.2s;
        }}

        a:hover {{
            color: var(--link-hover);
            text-decoration: underline;
        }}
        
        footer {{
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: var(--icon-color);
            border-top: 1px solid var(--border-color);
            padding-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🗂️ Frontend Project Index</h1>
        <div class="meta-info">
            <strong>Base URL:</strong> {BASE_URL} <br>
            <strong>Last Updated:</strong> {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} <br>
            <span style="font-size:12px; opacity:0.7">Note: .md files are automatically linked to their rendered .html versions.</span>
        </div>
        
        {tree_content}
        
        <footer>
            Generated by automated Python script
        </footer>
    </div>
</body>
</html>
    """

    with open(OUTPUT_FILENAME, 'w', encoding='utf-8') as f:
        f.write(full_html)
        print(f"✅ 更新完成！Markdown 文件现在指向渲染页面: {OUTPUT_FILENAME}")

if __name__ == "__main__":
    main()

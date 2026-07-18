from pathlib import Path
from urllib.parse import quote
from dataclasses import dataclass
import html
import json
import re


INPUT_DIR = Path(__file__).resolve().parent
OUTPUT_HTML = Path(__file__).with_name("完整字体预览.html")
PREVIEW_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 汉字预览测试 文于止墨丰川祥子实验"

FONT_EXTS = {".ttf", ".otf", ".ttc", ".woff", ".woff2"}
PREFERRED_SUFFIX_ORDER = {".woff2": 0, ".woff": 1, ".ttf": 2, ".otf": 3, ".ttc": 4}
ALLOWED_PARENT_DIRS = {"static", "font", "fonts", "ttf", "otf", "woff", "woff2", "truetype", "opentype", "variable"}
SUBSET_MARKERS = {
    "latin", "latinext", "cyrillic", "cyrillicext", "greek", "greekext",
    "vietnamese", "hebrew", "arabic", "thai", "khmer", "lao", "devanagari",
    "bengali", "gujarati", "gurmukhi", "kannada", "malayalam", "oriya",
    "sinhala", "tamil", "telugu"
}
WEIGHT_MARKERS = {"100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "italic"}
FRAGMENT_SIDECARS = {"index.html", "index.proto", "reporter.bin", "result.css"}
HEX_HASH_RE = re.compile(r"^[0-9a-f]{16,}$", re.IGNORECASE)
CSS_FONT_FAMILY_RE = re.compile(
    r"font-family\s*:\s*(?:\"((?:\\.|[^\"])*)\"|'((?:\\.|[^'])*)'|([^;,{]+))",
    re.IGNORECASE,
)
META_FONT_FAMILY_RE = re.compile(r"FontFamilyName\s+([^\r\n]+)")


@dataclass
class FontEntry:
    display_name: str
    source_path: Path
    css_family: str
    source_kind: str
    uses_split: bool


def normalize_subset_text(text: str) -> str:
    text = text.lower()
    text = text.replace("latin-ext", "latinext")
    text = text.replace("cyrillic-ext", "cyrillicext")
    text = text.replace("greek-ext", "greekext")
    return text


def looks_like_subset_bucket(text: str) -> bool:
    normalized = normalize_subset_text(text)
    tokens = set(re.split(r"[-_\s]+", normalized))
    return bool(tokens & SUBSET_MARKERS) and bool(tokens & WEIGHT_MARKERS)


def is_split_woff_fragment(font_path: Path) -> bool:
    if font_path.suffix.lower() not in {".woff", ".woff2"}:
        return False
    if HEX_HASH_RE.fullmatch(font_path.stem):
        return True
    return any((font_path.parent / sidecar).exists() for sidecar in FRAGMENT_SIDECARS)


def is_fragment_font(font_path: Path, root: Path) -> bool:
    rel = font_path.relative_to(root)
    if is_split_woff_fragment(font_path):
        return True
    if looks_like_subset_bucket(font_path.stem):
        return True

    for part in rel.parts[:-1]:
        part_lower = part.lower()
        if part_lower in ALLOWED_PARENT_DIRS:
            continue
        if looks_like_subset_bucket(part):
            return True

    return False


def normalize_font_key(font_path: Path) -> str:
    return normalize_font_text(font_path.stem)


def normalize_font_text(text: str) -> str:
    text = text.lower()
    text = re.sub(r"-exfont[0-9a-f]+$", "", text)
    return re.sub(r"[^0-9a-z一-鿿]+", "", text)


def keys_are_related(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left == right:
        return True
    return min(len(left), len(right)) >= 4 and (left.startswith(right) or right.startswith(left))


def clean_css_family(value: str) -> str:
    value = value.replace(r"\"", '"').replace(r"\'", "'")
    return re.sub(r"\s+", " ", value).strip().strip("\"'")


def parse_result_css_family(css_path: Path) -> str:
    text = css_path.read_text(encoding="utf-8", errors="ignore")

    match = CSS_FONT_FAMILY_RE.search(text)
    if match:
        return clean_css_family(next(part for part in match.groups() if part))

    match = META_FONT_FAMILY_RE.search(text)
    if match:
        return clean_css_family(match.group(1))

    return clean_css_family(css_path.parent.name)


def collect_complete_fonts(root: Path, covered_paths=None):
    covered_paths = covered_paths or set()
    candidates = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in FONT_EXTS:
            continue
        if path.resolve() in covered_paths:
            continue
        if is_fragment_font(path, root):
            continue
        candidates.append(path)

    selected = {}
    for path in candidates:
        key = normalize_font_key(path)
        rel = path.relative_to(root)
        score = (
            PREFERRED_SUFFIX_ORDER.get(path.suffix.lower(), 99),
            len(rel.parts),
            len(str(rel)),
            str(rel).lower(),
        )
        current = selected.get(key)
        if current is None or score < current[0]:
            selected[key] = (score, path)

    return sorted((item[1] for item in selected.values()), key=lambda p: str(p.relative_to(root)).lower())


def font_files_for_split_matching(top_dir: Path):
    for path in top_dir.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in FONT_EXTS:
            continue
        if is_split_woff_fragment(path):
            continue
        yield path


def collect_split_entries(root: Path):
    entries = []
    covered_paths = set()

    for css_path in sorted(root.rglob("result.css"), key=lambda p: str(p.relative_to(root)).lower()):
        rel = css_path.relative_to(root)
        css_family = parse_result_css_family(css_path)
        display_name = css_path.parent.name
        entries.append(FontEntry(display_name, css_path, css_family, "切片 CSS", True))

        top_dir = root / rel.parts[0]
        split_keys = {
            normalize_font_text(css_path.parent.name),
            normalize_font_text(css_family),
            normalize_font_text(css_path.parent.parent.name),
        }

        for font_path in font_files_for_split_matching(top_dir):
            full_key = normalize_font_key(font_path)
            if any(keys_are_related(full_key, split_key) for split_key in split_keys):
                covered_paths.add(font_path.resolve())

    return entries, covered_paths


def collect_font_entries(root: Path):
    split_entries, covered_paths = collect_split_entries(root)
    complete_fonts = collect_complete_fonts(root, covered_paths)
    full_entries = [
        FontEntry(display_name_for(path, root), path, "", "完整文件", False)
        for path in complete_fonts
    ]

    entries = split_entries + full_entries
    entries.sort(key=lambda entry: str(entry.source_path.relative_to(root)).lower())

    for index, entry in enumerate(entries, start=1):
        if not entry.css_family:
            entry.css_family = f"FontPreview{index:04d}"

    return entries


def css_url_for(source_path: Path, html_path: Path) -> str:
    rel_path = source_path.relative_to(html_path.parent).as_posix()
    return quote(rel_path, safe="/")


def display_name_for(font_path: Path, root: Path) -> str:
    rel = font_path.relative_to(root)
    if len(rel.parts) > 1:
        return rel.parts[0]
    return font_path.stem


def css_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', r"\"").replace("\n", " ")


def build_font_styles(font_entries, html_path: Path) -> str:
    imports = []
    font_faces = []

    for entry in font_entries:
        family = css_string(entry.css_family)
        url = css_url_for(entry.source_path, html_path)
        if entry.uses_split:
            imports.append(f'@import url("{url}");')
        else:
            font_faces.append(
                f'@font-face {{ font-family: "{family}"; src: url("{url}"); font-display: swap; }}'
            )

    return "\n".join(imports + font_faces)


def build_font_cards(font_entries, root: Path) -> str:
    cards = []
    for entry in font_entries:
        family = css_string(entry.css_family)
        rel_path = entry.source_path.relative_to(root).as_posix()
        source_detail = f"{entry.source_kind}: {rel_path}"
        if entry.uses_split:
            source_detail = f"{source_detail} · font-family: {entry.css_family}"
        search_text = f"{entry.display_name} {entry.css_family} {rel_path} {entry.source_kind}".lower()
        style = f'font-family: "{family}", var(--fallback-font);'
        cards.append(f"""
      <article class="font-card" data-search="{html.escape(search_text, quote=True)}">
        <div class="font-meta">
          <h2>{html.escape(entry.display_name)}</h2>
          <p>{html.escape(source_detail)}</p>
        </div>
        <p class="font-sample" style="{html.escape(style, quote=True)}">{html.escape(PREVIEW_TEXT)}</p>
      </article>""")
    return "\n".join(cards)


def build_html(font_entries, root: Path, html_path: Path) -> str:
    font_styles = build_font_styles(font_entries, html_path)
    font_cards = build_font_cards(font_entries, root)
    font_count = len(font_entries)
    escaped_preview = html.escape(PREVIEW_TEXT, quote=True)
    preview_json = json.dumps(PREVIEW_TEXT, ensure_ascii=False)

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>完整字体预览</title>
  <style>
{font_styles}

:root {{
  --bg: #f7f4ef;
  --surface: #fffefa;
  --text: #1e2528;
  --muted: #697073;
  --line: #d8d1c7;
  --accent: #186a5a;
  --accent-weak: #d8ebe4;
  --fallback-font: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif;
}}

* {{
  box-sizing: border-box;
}}

body {{
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--fallback-font);
}}

.shell {{
  width: min(1560px, calc(100% - 32px));
  margin: 0 auto;
}}

.topbar {{
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--line);
  background: rgba(247, 244, 239, 0.96);
  backdrop-filter: blur(10px);
}}

.topbar-inner {{
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(280px, 2fr) auto;
  gap: 16px;
  align-items: end;
  padding: 18px 0;
}}

h1 {{
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
  font-weight: 700;
}}

.count {{
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}}

.controls {{
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 2fr) 132px;
  gap: 10px;
  align-items: end;
}}

.field {{
  display: grid;
  gap: 6px;
}}

label {{
  color: var(--muted);
  font-size: 12px;
}}

input {{
  min-width: 0;
  height: 38px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  padding: 0 11px;
}}

input:focus {{
  border-color: var(--accent);
  outline: 2px solid var(--accent-weak);
  outline-offset: 1px;
}}

.size-value {{
  color: var(--muted);
  font-size: 12px;
  text-align: right;
}}

.grid {{
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 14px;
  padding: 18px 0 40px;
}}

.font-card {{
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  overflow: hidden;
}}

.font-meta {{
  border-bottom: 1px solid var(--line);
  padding: 12px 14px 10px;
}}

.font-meta h2 {{
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
  font-weight: 700;
}}

.font-meta p {{
  margin: 5px 0 0;
  color: var(--muted);
  font-family: Consolas, "SFMono-Regular", monospace;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}}

.font-sample {{
  min-height: 132px;
  margin: 0;
  padding: 18px 14px 20px;
  font-size: var(--sample-size, 42px);
  line-height: 1.24;
  overflow-wrap: anywhere;
}}

.empty {{
  display: none;
  margin: 60px 0;
  color: var(--muted);
  text-align: center;
}}

.is-filter-empty .empty {{
  display: block;
}}

.is-filter-empty .grid {{
  display: none;
}}

@media (max-width: 900px) {{
  .topbar-inner {{
    grid-template-columns: 1fr;
    align-items: stretch;
  }}

  .controls {{
    grid-template-columns: 1fr;
  }}

  .size-value {{
    text-align: left;
  }}
}}

@media (max-width: 520px) {{
  .shell {{
    width: min(100% - 20px, 1560px);
  }}

  .grid {{
    grid-template-columns: 1fr;
  }}

  h1 {{
    font-size: 23px;
  }}
}}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="shell topbar-inner">
      <div>
        <h1>完整字体预览</h1>
        <p class="count"><span id="visibleCount">{font_count}</span> / {font_count} 个字体</p>
      </div>
      <div class="controls" role="search">
        <div class="field">
          <label for="searchInput">搜索</label>
          <input id="searchInput" type="search" autocomplete="off" placeholder="字体名或路径">
        </div>
        <div class="field">
          <label for="previewInput">预览文本</label>
          <input id="previewInput" type="text" value="{escaped_preview}">
        </div>
        <div class="field">
          <label for="sizeInput">字号</label>
          <input id="sizeInput" type="range" min="24" max="96" value="42">
          <span class="size-value"><span id="sizeValue">42</span>px</span>
        </div>
      </div>
    </div>
  </header>
  <main class="shell" id="pageRoot">
    <section class="grid" id="fontGrid" aria-live="polite">
{font_cards}
    </section>
    <p class="empty" id="emptyState">没有匹配的字体。</p>
  </main>
  <script>
const searchInput = document.querySelector("#searchInput");
const previewInput = document.querySelector("#previewInput");
const sizeInput = document.querySelector("#sizeInput");
const sizeValue = document.querySelector("#sizeValue");
const visibleCount = document.querySelector("#visibleCount");
const pageRoot = document.querySelector("#pageRoot");
const cards = Array.from(document.querySelectorAll(".font-card"));
const samples = Array.from(document.querySelectorAll(".font-sample"));

function updateSearch() {{
  const query = searchInput.value.trim().toLowerCase();
  let count = 0;
  for (const card of cards) {{
    const matched = !query || card.dataset.search.includes(query);
    card.hidden = !matched;
    if (matched) count += 1;
  }}
  visibleCount.textContent = String(count);
  pageRoot.classList.toggle("is-filter-empty", count === 0);
}}

function updatePreviewText() {{
  const text = previewInput.value || {preview_json};
  for (const sample of samples) {{
    sample.textContent = text;
  }}
}}

function updateSampleSize() {{
  document.documentElement.style.setProperty("--sample-size", `${{sizeInput.value}}px`);
  sizeValue.textContent = sizeInput.value;
}}

searchInput.addEventListener("input", updateSearch);
previewInput.addEventListener("input", updatePreviewText);
sizeInput.addEventListener("input", updateSampleSize);
updateSampleSize();
  </script>
</body>
</html>
"""


def main():
    if not INPUT_DIR.exists():
        print(f"错误: 未找到字体目录: {INPUT_DIR}")
        return

    font_entries = collect_font_entries(INPUT_DIR)
    if not font_entries:
        print("错误: 未找到可预览的完整字体。")
        return

    OUTPUT_HTML.write_text(build_html(font_entries, INPUT_DIR, OUTPUT_HTML), encoding="utf-8")
    split_count = sum(1 for entry in font_entries if entry.uses_split)
    full_count = len(font_entries) - split_count
    print(f"找到 {len(font_entries)} 个可预览字体。")
    print(f"其中 {split_count} 个使用切片 CSS，{full_count} 个使用完整文件。")
    print(f"静态预览页已保存: {OUTPUT_HTML}")


if __name__ == "__main__":
    main()

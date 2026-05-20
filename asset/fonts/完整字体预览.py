from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont


INPUT_DIR = Path(r"D:\盒子\HTML\asset\fonts")
OUTPUT_IMAGE = Path(__file__).with_name("完整字体预览.png")
PREVIEW_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 汉字预览测试 文于止墨丰川祥子实验"
FONT_SIZE = 160
TITLE_SIZE = 80
PADDING = 24
LINE_SPACING = 12
TITLE_LINE_SPACING = 16
PREVIEW_LINE_SPACING = 14

FONT_EXTS = {".ttf", ".otf", ".ttc"}
PREFERRED_SUFFIX_ORDER = {".ttf": 0, ".otf": 1, ".ttc": 2}
ALLOWED_PARENT_DIRS = {"static", "ttf", "otf"}
SUBSET_MARKERS = {
    "latin", "latinext", "cyrillic", "cyrillicext", "greek", "greekext",
    "vietnamese", "hebrew", "arabic", "thai", "khmer", "lao", "devanagari",
    "bengali", "gujarati", "gurmukhi", "kannada", "malayalam", "oriya",
    "sinhala", "tamil", "telugu"
}
WEIGHT_MARKERS = {"100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "italic"}


def load_title_font(size: int):
    for name in ("msyh.ttc", "msyhbd.ttc", "simhei.ttf", "simsun.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    print("警告: 未找到常见中文系统字体，标题将退回 PIL 默认字体。")
    return ImageFont.load_default()


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


def is_fragment_font(font_path: Path, root: Path) -> bool:
    rel = font_path.relative_to(root)
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
    stem = font_path.stem.lower()
    stem = re.sub(r"-exfont[0-9a-f]+$", "", stem)
    return re.sub(r"[^0-9a-z一-鿿]+", "", stem)


def collect_complete_fonts(root: Path):
    candidates = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in FONT_EXTS:
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


def measure_lines(lines, font, spacing: int):
    widths = []
    total_height = 0
    for index, line in enumerate(lines):
        sample = line or "Ag"
        bbox = font.getbbox(sample)
        line_width = font.getlength(line) if line else 0
        line_height = bbox[3] - bbox[1]
        widths.append(line_width)
        total_height += line_height
        if index < len(lines) - 1:
            total_height += spacing
    return max(widths, default=0), total_height


def measure_lines(lines, font, spacing: int):
    widths = []
    total_height = 0
    for index, line in enumerate(lines):
        sample = line or "Ag"
        bbox = font.getbbox(sample)
        line_width = font.getlength(line) if line else 0
        line_height = bbox[3] - bbox[1]
        widths.append(line_width)
        total_height += line_height
        if index < len(lines) - 1:
            total_height += spacing
    return max(widths, default=0), total_height


def main():
    if not INPUT_DIR.exists():
        print(f"错误: 未找到字体目录: {INPUT_DIR}")
        return

    font_files = collect_complete_fonts(INPUT_DIR)
    if not font_files:
        print("错误: 未找到可预览的完整字体。")
        return

    print(f"找到 {len(font_files)} 个完整字体，开始计算预览布局...")

    title_font = load_title_font(TITLE_SIZE)
    processed_fonts = []
    max_content_width = 0
    total_height = PADDING

    for font_path in font_files:
        rel_path = font_path.relative_to(INPUT_DIR).as_posix()
        title_text = f"字体文件: {rel_path}"

        try:
            preview_font = ImageFont.truetype(str(font_path), FONT_SIZE)
            title_lines = [title_text]
            preview_lines = [PREVIEW_TEXT]

            title_width, title_height = measure_lines(title_lines, title_font, TITLE_LINE_SPACING)
            preview_width, preview_height = measure_lines(preview_lines, preview_font, PREVIEW_LINE_SPACING)

            max_content_width = max(max_content_width, title_width, preview_width)
            section_height = title_height + LINE_SPACING + preview_height + PADDING * 2 + 1
            total_height += section_height

            processed_fonts.append({
                "font_path": font_path,
                "title_lines": title_lines,
                "preview_lines": preview_lines,
                "title_height": title_height,
                "preview_height": preview_height,
            })
        except Exception as e:
            print(f"跳过: {rel_path} - {e}")

    if not processed_fonts:
        print("错误: 没有成功加载的完整字体。")
        return

    img_width = max(int(max_content_width + PADDING * 2), 1200)
    img_height = max(int(total_height), 200)

    print(f"成功处理 {len(processed_fonts)} 个字体，输出尺寸: {img_width} x {img_height}")

    img = Image.new("RGB", (img_width, img_height), color="white")
    draw = ImageDraw.Draw(img)
    y_offset = PADDING

    for font_info in processed_fonts:
        preview_font = ImageFont.truetype(str(font_info["font_path"]), FONT_SIZE)

        draw.multiline_text(
            (PADDING, y_offset),
            "\n".join(font_info["title_lines"]),
            fill=(120, 120, 120),
            font=title_font,
            spacing=TITLE_LINE_SPACING,
        )
        y_offset += font_info["title_height"] + LINE_SPACING

        draw.multiline_text(
            (PADDING, y_offset),
            "\n".join(font_info["preview_lines"]),
            fill=(0, 0, 0),
            font=preview_font,
            spacing=PREVIEW_LINE_SPACING,
        )
        y_offset += font_info["preview_height"] + PADDING

        draw.line((0, y_offset, img_width, y_offset), fill=(230, 230, 230), width=1)
        y_offset += PADDING

    img.save(OUTPUT_IMAGE)
    print(f"预览图已保存: {OUTPUT_IMAGE}")


if __name__ == "__main__":
    main()

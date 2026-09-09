#!/usr/bin/env python3
"""Extract Ogg files from the C.A.S.S.I.E OGGDATA1 archive format."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


def read_7bit_int(handle) -> int:
    count = 0
    shift = 0
    while True:
        raw = handle.read(1)
        if not raw:
            raise EOFError("unexpected EOF while reading 7-bit integer")
        byte = raw[0]
        count |= (byte & 0x7F) << shift
        if (byte & 0x80) == 0:
            return count
        shift += 7
        if shift >= 35:
            raise ValueError("invalid 7-bit integer")


def read_dotnet_string(handle) -> str:
    length = read_7bit_int(handle)
    return handle.read(length).decode("utf-8")


def slugify(name: str) -> str:
    stem = Path(name).stem.strip().replace("'", "")
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem)
    stem = re.sub(r"_+", "_", stem).strip("._-")
    return (stem or "clip")[:90]


def ogg_info(data: bytes) -> tuple[float, int, int]:
    sample_rate = 0
    channels = 0

    marker = data.find(b"\x01vorbis")
    if marker >= 0 and marker + 16 <= len(data):
        channels = data[marker + 11]
        sample_rate = int.from_bytes(data[marker + 12 : marker + 16], "little")

    opus = data.find(b"OpusHead")
    if not sample_rate and opus >= 0 and opus + 19 <= len(data):
        channels = data[opus + 9]
        sample_rate = 48000

    pos = 0
    max_granule = -1
    while True:
        page = data.find(b"OggS", pos)
        if page < 0 or page + 27 > len(data):
            break
        granule = int.from_bytes(data[page + 6 : page + 14], "little", signed=True)
        if granule >= 0:
            max_granule = max(max_granule, granule)
        segments = data[page + 26]
        table_start = page + 27
        table_end = table_start + segments
        if table_end > len(data):
            break
        pos = table_end + sum(data[table_start:table_end])

    duration = round(max_granule / sample_rate, 4) if sample_rate and max_granule >= 0 else 0
    return duration, channels, sample_rate


def extract_archive(archive_path: Path, output_dir: Path) -> dict:
    output_dir.mkdir(parents=True, exist_ok=True)
    entries = []

    with archive_path.open("rb") as handle:
        magic = handle.read(8)
        if magic != b"OGGDATA1":
            raise ValueError(f"unsupported archive magic: {magic!r}")

        count = int.from_bytes(handle.read(4), "little", signed=True)
        for _ in range(count):
            relative_name = read_dotnet_string(handle)
            length = int.from_bytes(handle.read(8), "little", signed=True)
            if length < 0:
                raise ValueError(f"negative length for {relative_name}")
            data = handle.read(length)
            if len(data) != length:
                raise EOFError(f"truncated entry: {relative_name}")

            digest = hashlib.sha1(relative_name.encode("utf-8")).hexdigest()[:8]
            suffix = Path(relative_name).suffix.lower() or ".ogg"
            output_name = f"{slugify(relative_name)}__{digest}{suffix}"
            output_path = output_dir / output_name
            output_path.write_bytes(data)

            duration, channels, sample_rate = ogg_info(data)
            entries.append(
                {
                    "name": Path(relative_name).stem,
                    "originalPath": relative_name,
                    "file": output_name,
                    "bytes": length,
                    "duration": duration,
                    "channels": channels,
                    "sampleRate": sample_rate,
                }
            )

    manifest = {
        "archive": str(archive_path),
        "count": len(entries),
        "entries": entries,
    }
    (output_dir / "archive-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Path to cassie.data")
    parser.add_argument("output_dir", type=Path, help="Directory for extracted .ogg files")
    args = parser.parse_args()

    manifest = extract_archive(args.archive, args.output_dir)
    print(f"Extracted {manifest['count']} files to {args.output_dir}")


if __name__ == "__main__":
    main()

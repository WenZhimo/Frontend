#!/usr/bin/env python3
"""Download official C.A.S.S.I.E. wiki MP3 samples into the local manifest."""

from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import date
from pathlib import Path


SOURCE_PAGE = "https://en.scpslgame.com/index.php?title=C.A.S.S.I.E."
USER_AGENT = "CASSIE-web-importer/1.0"

WIKI_AUDIO = [
    ("Official MTF SCPs Alive", "Cassie_Multiple_SCPs_remain2.mp3", "Mobile Task Force", "MTF spawn when SCPs are alive."),
    ("Official MTF No SCPs Alive", "CASSIE_no_scps2.mp3", "Mobile Task Force", "MTF spawn when no SCPs are alive."),
    ("Official NTF Backup", "NTFBackup.mp3", "Mobile Task Force", "Nine-Tailed Fox backup unit spawn."),
    ("Official MTF Ghostbusters", "Ghostbusters.mp3", "Mobile Task Force", "Halloween Ghostbusters spawn announcement."),
    ("Official Tactical Holiday MTF", "Xmas_MTF_Spawn.mp3", "Mobile Task Force", "Tactical Holiday Unit spawn announcement."),
    ("Official Chaos Standard Wave", "ChaosSpawning.mp3", "Chaos Insurgency", "Standard Chaos Insurgency wave."),
    ("Official Chaos Mini Wave", "ChaosMiniSpawning.mp3", "Chaos Insurgency", "Mini Chaos Insurgency wave."),
    ("Official SCP Tesla Termination", "SCP_Telsa5.mp3", "SCP Related", "SCP terminated by Automatic Security System / Tesla."),
    ("Official SCP Contained By Chaos", "SCP_contain_by_Chaos.mp3", "SCP Related", "SCP contained by Chaos Insurgency."),
    ("Official SCP Contained By Scientist", "SCP_contain_by_Scientist.mp3", "SCP Related", "SCP contained by Science Personnel."),
    ("Official SCP Friendly Fire", "SCPFriendlyFire.mp3", "SCP Related", "SCP terminated by another SCP."),
    ("Official SCP Contained By Class D", "SCP_contain_by_Class_D.mp3", "SCP Related", "SCP contained by Class-D Personnel."),
    ("Official SCP Containment Unit NTF", "Containment_Unit_NTF3.mp3", "SCP Related", "SCP contained by a named containment unit."),
    ("Official SCP Unknown Unit", "SCPUnknown.mp3", "SCP Related", "SCP contained successfully; containment unit unknown."),
    ("Official SCP Lost In Decontamination", "SCP_Decon3.mp3", "SCP Related", "SCP lost in Decontamination Sequence."),
    ("Official SCP Termination Cause Unspecified", "Termination_Cause_Unspecified4.mp3", "SCP Related", "SCP successfully terminated; cause unspecified."),
    ("Official SCP Marshmallow Man", "MarshmanSCPKill.mp3", "SCP Related", "SCP terminated by Marshmallow Man."),
    ("Official SCP Alpha Warhead Termination", "SCP_warhead4.mp3", "SCP Related", "SCP terminated by Alpha Warhead."),
    ("Official Generator One Of Three", "1of3button.mp3", "Emergency Power Stations", "1 out of 3 generators activated."),
    ("Official Generator Two Of Three", "2of3button.mp3", "Emergency Power Stations", "2 out of 3 generators activated."),
    ("Official Generator Three Of Three", "3of3button.mp3", "Emergency Power Stations", "3 out of 3 generators activated."),
    ("Official Overcharge Countdown", "OverchargeIn.mp3", "Emergency Power Stations", "Overcharge countdown."),
    ("Official Facility Operational", "OverchargeNo079.mp3", "Emergency Power Stations", "Facility is back in operational mode."),
    ("Official Warhead Start", "Warhead_Start.mp3", "Alpha Warhead", "Emergency detonation sequence activated."),
    ("Official Warhead Cancelled", "WarheadCancelled.mp3", "Alpha Warhead", "Detonation sequence cancelled."),
    ("Official Warhead Resume", "Warhead_Resume.mp3", "Alpha Warhead", "Emergency detonation sequence resumed."),
    ("Official Dead Mans Switch", "Dms_ann.mp3", "Alpha Warhead", "Dead Man's Switch C.A.S.S.I.E. announcement."),
    ("Official Timer 120 Seconds", "120s.mp3", "Alpha Warhead", "120 seconds timer clip."),
    ("Official Timer 110 Seconds", "110s.mp3", "Alpha Warhead", "110 seconds timer clip."),
    ("Official Timer 100 Seconds", "100s.mp3", "Alpha Warhead", "100 seconds timer clip."),
    ("Official Timer 90 Seconds", "90s.mp3", "Alpha Warhead", "90 seconds timer clip."),
    ("Official Timer 80 Seconds", "80s.mp3", "Alpha Warhead", "80 seconds timer clip."),
    ("Official Timer 70 Seconds", "70s.mp3", "Alpha Warhead", "70 seconds timer clip."),
    ("Official Timer 60 Seconds", "60s.mp3", "Alpha Warhead", "60 seconds timer clip."),
    ("Official Timer 50 Seconds", "50s.mp3", "Alpha Warhead", "50 seconds timer clip."),
    ("Official Timer 40 Seconds", "40s.mp3", "Alpha Warhead", "40 seconds timer clip."),
    ("Official Timer 30 Seconds", "30s.mp3", "Alpha Warhead", "30 seconds timer clip."),
    ("Official Decontamination 15 Minutes", "Decontamination_15_minutes.mp3", "Decontamination", "15 minutes left."),
    ("Official Decontamination 10 Minutes", "Decontamination_10.mp3", "Decontamination", "10 minutes left."),
    ("Official Decontamination 5 Minutes", "Decontamination5minutes.mp3", "Decontamination", "5 minutes left."),
    ("Official Decontamination 1 Minute", "Decontamination1minute.mp3", "Decontamination", "1 minute left."),
    ("Official Decontamination Countdown", "Decont_countdown.mp3", "Decontamination", "30 seconds left countdown."),
    ("Official Decontamination Begun", "Decont_begun_Bells.mp3", "Decontamination", "LCZ locked down and decontamination begun."),
    ("Official Site 02 Welcome", "Site02Welcome.mp3", "Custom", "Hello and welcome to Site-02."),
    ("Official SCP 999 Terminated", "SCP-999_3.mp3", "Custom", "SCP-999 successfully terminated."),
    ("Official HCZ Terminal Unauthorized", "096TerminalUnauthorized.mp3", "Custom", "Unauthorized user detected at HCZ-096 terminal."),
    ("Official GLaDOS CASSIE", "GLaDOSCASSIE.mp3", "Custom", "Oh, it's you."),
]

FILENAME_TO_URL = {
    "ChaosMiniSpawning.mp3": "https://hub.scpslgame.com/images/0/06/ChaosMiniSpawning.mp3",
    "ChaosSpawning.mp3": "https://hub.scpslgame.com/images/0/0b/ChaosSpawning.mp3",
    "3of3button.mp3": "https://hub.scpslgame.com/images/0/0c/3of3button.mp3",
    "SCP_Telsa5.mp3": "https://hub.scpslgame.com/images/0/0c/SCP_Telsa5.mp3",
    "110s.mp3": "https://hub.scpslgame.com/images/1/1e/110s.mp3",
    "SCP_contain_by_Chaos.mp3": "https://hub.scpslgame.com/images/2/21/SCP_contain_by_Chaos.mp3",
    "SCP_contain_by_Scientist.mp3": "https://hub.scpslgame.com/images/2/24/SCP_contain_by_Scientist.mp3",
    "NTFBackup.mp3": "https://hub.scpslgame.com/images/2/2f/NTFBackup.mp3",
    "Decontamination_15_minutes.mp3": "https://hub.scpslgame.com/images/3/31/Decontamination_15_minutes.mp3",
    "CASSIE_no_scps2.mp3": "https://hub.scpslgame.com/images/3/34/CASSIE_no_scps2.mp3",
    "100s.mp3": "https://hub.scpslgame.com/images/3/39/100s.mp3",
    "SCPFriendlyFire.mp3": "https://hub.scpslgame.com/images/4/40/SCPFriendlyFire.mp3",
    "SCP-999_3.mp3": "https://hub.scpslgame.com/images/4/46/SCP-999_3.mp3",
    "SCP_contain_by_Class_D.mp3": "https://hub.scpslgame.com/images/4/48/SCP_contain_by_Class_D.mp3",
    "Warhead_Start.mp3": "https://hub.scpslgame.com/images/4/4f/Warhead_Start.mp3",
    "1of3button.mp3": "https://hub.scpslgame.com/images/5/51/1of3button.mp3",
    "120s.mp3": "https://hub.scpslgame.com/images/5/5d/120s.mp3",
    "Containment_Unit_NTF3.mp3": "https://hub.scpslgame.com/images/6/61/Containment_Unit_NTF3.mp3",
    "Decont_begun_Bells.mp3": "https://hub.scpslgame.com/images/6/65/Decont_begun_Bells.mp3",
    "SCPUnknown.mp3": "https://hub.scpslgame.com/images/6/67/SCPUnknown.mp3",
    "WarheadCancelled.mp3": "https://hub.scpslgame.com/images/6/67/WarheadCancelled.mp3",
    "Decontamination_10.mp3": "https://hub.scpslgame.com/images/6/68/Decontamination_10.mp3",
    "Dms_ann.mp3": "https://hub.scpslgame.com/images/6/6b/Dms_ann.mp3",
    "50s.mp3": "https://hub.scpslgame.com/images/6/6f/50s.mp3",
    "30s.mp3": "https://hub.scpslgame.com/images/7/7b/30s.mp3",
    "90s.mp3": "https://hub.scpslgame.com/images/7/7c/90s.mp3",
    "Ghostbusters.mp3": "https://hub.scpslgame.com/images/8/85/Ghostbusters.mp3",
    "OverchargeIn.mp3": "https://hub.scpslgame.com/images/8/88/OverchargeIn.mp3",
    "Xmas_MTF_Spawn.mp3": "https://hub.scpslgame.com/images/8/8a/Xmas_MTF_Spawn.mp3",
    "Decontamination1minute.mp3": "https://hub.scpslgame.com/images/8/8c/Decontamination1minute.mp3",
    "60s.mp3": "https://hub.scpslgame.com/images/9/94/60s.mp3",
    "Cassie_Multiple_SCPs_remain2.mp3": "https://hub.scpslgame.com/images/9/9a/Cassie_Multiple_SCPs_remain2.mp3",
    "70s.mp3": "https://hub.scpslgame.com/images/9/9f/70s.mp3",
    "096TerminalUnauthorized.mp3": "https://hub.scpslgame.com/images/a/a5/096TerminalUnauthorized.mp3",
    "Decont_countdown.mp3": "https://hub.scpslgame.com/images/a/a5/Decont_countdown.mp3",
    "Termination_Cause_Unspecified4.mp3": "https://hub.scpslgame.com/images/a/ae/Termination_Cause_Unspecified4.mp3",
    "OverchargeNo079.mp3": "https://hub.scpslgame.com/images/b/b4/OverchargeNo079.mp3",
    "40s.mp3": "https://hub.scpslgame.com/images/c/c3/40s.mp3",
    "MarshmanSCPKill.mp3": "https://hub.scpslgame.com/images/c/c5/MarshmanSCPKill.mp3",
    "Decontamination5minutes.mp3": "https://hub.scpslgame.com/images/c/cc/Decontamination5minutes.mp3",
    "2of3button.mp3": "https://hub.scpslgame.com/images/c/cd/2of3button.mp3",
    "GLaDOSCASSIE.mp3": "https://hub.scpslgame.com/images/c/cf/GLaDOSCASSIE.mp3",
    "80s.mp3": "https://hub.scpslgame.com/images/e/e2/80s.mp3",
    "SCP_Decon3.mp3": "https://hub.scpslgame.com/images/e/e4/SCP_Decon3.mp3",
    "SCP_warhead4.mp3": "https://hub.scpslgame.com/images/f/f2/SCP_warhead4.mp3",
    "Site02Welcome.mp3": "https://hub.scpslgame.com/images/f/f2/Site02Welcome.mp3",
    "Warhead_Resume.mp3": "https://hub.scpslgame.com/images/f/f7/Warhead_Resume.mp3",
}


def mp3_info(data: bytes) -> tuple[float, int, int]:
    bitrates = {
        (3, 3): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
        (3, 2): [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
        (3, 1): [0, 32, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256],
        (2, 3): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
        (2, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        (2, 1): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        (0, 3): [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
        (0, 2): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
        (0, 1): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    }
    sample_rates = {
        3: [44100, 48000, 32000],
        2: [22050, 24000, 16000],
        0: [11025, 12000, 8000],
    }

    pos = 0
    if data.startswith(b"ID3") and len(data) >= 10:
        tag_size = ((data[6] & 0x7F) << 21) | ((data[7] & 0x7F) << 14) | ((data[8] & 0x7F) << 7) | (data[9] & 0x7F)
        pos = 10 + tag_size

    duration = 0.0
    channels = 0
    sample_rate = 0
    frames = 0
    while pos + 4 <= len(data):
        header = int.from_bytes(data[pos : pos + 4], "big")
        if (header & 0xFFE00000) != 0xFFE00000:
            pos += 1
            continue

        version = (header >> 19) & 0b11
        layer = (header >> 17) & 0b11
        bitrate_index = (header >> 12) & 0b1111
        sample_index = (header >> 10) & 0b11
        padding = (header >> 9) & 0b1
        mode = (header >> 6) & 0b11
        if version == 1 or layer == 0 or bitrate_index in (0, 15) or sample_index == 3:
            pos += 1
            continue

        bitrate = bitrates.get((version, layer), [])[bitrate_index] * 1000
        sr = sample_rates[version][sample_index]
        if layer == 3:
            frame_len = int((12 * bitrate / sr + padding) * 4)
            samples = 384
        elif layer == 2:
            frame_len = int(144 * bitrate / sr + padding)
            samples = 1152
        else:
            samples = 1152 if version == 3 else 576
            frame_len = int((144 if version == 3 else 72) * bitrate / sr + padding)

        if frame_len <= 4:
            pos += 1
            continue

        duration += samples / sr
        channels = 1 if mode == 3 else 2
        sample_rate = sr
        frames += 1
        pos += frame_len

    return round(duration, 4), channels, sample_rate


def download(url: str, path: Path) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        data = response.read()
    path.write_bytes(data)
    return data


def rebuild_counts(manifest: dict) -> None:
    clips = manifest.get("clips", [])
    manifest["counts"] = {
        "total": len(clips),
        "word": sum(1 for clip in clips if clip.get("category") == "word"),
        "phrase": sum(1 for clip in clips if clip.get("category") == "phrase"),
        "background": sum(1 for clip in clips if clip.get("category") == "background"),
        "supplemental": sum(1 for clip in clips if clip.get("supplemental")),
        "failed": manifest.get("counts", {}).get("failed", 0),
    }


def import_wiki_audio(project_dir: Path) -> dict:
    manifest_path = project_dir / "assets" / "audio" / "manifest.json"
    output_dir = project_dir / "assets" / "audio" / "wiki-announcements"
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["clips"] = [
        clip for clip in manifest.get("clips", [])
        if clip.get("source") != "official_wiki"
    ]

    imported = []
    for name, filename, section, description in WIKI_AUDIO:
        url = FILENAME_TO_URL[filename]
        output_path = output_dir / filename
        data = output_path.read_bytes() if output_path.exists() else download(url, output_path)
        duration, channels, sample_rate = mp3_info(data)
        entry = {
            "name": name,
            "file": f"assets/audio/wiki-announcements/{filename}",
            "duration": duration,
            "channels": channels,
            "sampleRate": sample_rate,
            "category": "phrase",
            "source": "official_wiki",
            "sourcePage": SOURCE_PAGE,
            "sourceUrl": url,
            "sourceSection": section,
            "description": description,
            "supplemental": True,
        }
        imported.append(entry)

    manifest["clips"].extend(imported)
    manifest["officialWikiAudio"] = {
        "sourcePage": SOURCE_PAGE,
        "importedAt": date.today().isoformat(),
        "count": len(imported),
        "excluded": [
            "Foundation_theme.mp3",
            "Sixxy_-_Dead_Mans_Switch_V2.mp3",
            "Dead_Mans_Sequence_Alarm.mp3",
        ],
    }
    rebuild_counts(manifest)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"downloadedOrVerified": len(imported), "outputDir": str(output_dir), "counts": manifest["counts"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "project_dir",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="C.A.S.S.I.E. web project directory",
    )
    args = parser.parse_args()
    result = import_wiki_audio(args.project_dir)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

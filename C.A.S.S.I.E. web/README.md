# C.A.S.S.I.E Web Sentence Builder

Static browser port of the C.A.S.S.I.E sentence builder. It concatenates locally extracted SCP: Secret Laboratory voice clips with Web Audio and exports a generated WAV file.

## Run

```powershell
cd "D:\盒子\HTML\C.A.S.S.I.E. web"
python -m http.server 5173
```

Open `http://localhost:5173/`.

## Assets

Primary audio was extracted from:

`C:\Users\LENOVO\Downloads\CASSIE-1.2.0\cassie.data`

That file is a custom `.NET BinaryReader` archive:

1. `OGGDATA1` magic, 8 bytes
2. little-endian `Int32` file count
3. repeated entries: 7-bit length UTF-8 path, little-endian `Int64` byte length, raw Ogg bytes

Extracted files live in `assets/audio/cassie-data/`. The app manifest lives at `assets/audio/manifest.json`.

Official wiki MP3 samples are also mirrored into `assets/audio/wiki-announcements/`. These are full rendered announcement examples from the wiki, so they are useful for exact playback of missing-word announcements, but they cannot replace fill-in templates when the player wants a different SCP number, unit designation, or count.

To decode another copy:

```powershell
python tools\extract-cassie-data.py "C:\Users\LENOVO\Downloads\CASSIE-1.2.0\cassie.data" "assets\audio\cassie-data"
```

To refresh the official wiki MP3 mirrors and manifest entries:

```powershell
python tools\import-wiki-audio.py
```

## Announcement templates

Template subtitles were checked against:

`https://en.scpslgame.com/index.php?title=C.A.S.S.I.E.`

`E:\SteamLibrary\steamapps\common\SCP Secret Laboratory\Translations\en\Subtitles.txt`

The wiki revision checked here was last edited on 2026-09-08 and includes both in-game announcements and suggested/custom announcement examples.

The in-page template builder includes fill-in official announcements that can be produced by the extracted audio library:

- MTF / NTF entry announcements, including entry + re-containment count and entry + `All SCPs secured` variants.
- Awaiting re-containment count announcements.
- SCP termination announcements: unspecified cause, by SCP, Automatic Security System, Alpha Warhead, and Marshmallow Man.
- SCP containment announcements: Science Personnel, Class-D Personnel, Chaos Insurgency, unknown unit, specific containment unit, and lost in Decontamination Sequence.
- Generator progress and completion announcements, including `3 out of 3 generators activated. All generators have been successfully engaged.`
- Overcharge, Facility operational, LCZ decontamination, Alpha Warhead start/cancel/resume with time selection, Dead Man's Switch, and Chaos Insurgency Gate A announcements.
- Custom-announcement examples from the wiki that can be fully voiced locally: `Hello and welcome to Site-02.`, `SCP-999 successfully terminated.`, and `Unauthorized user detected at HCZ-096 terminal.`

The template builder also includes official wiki MP3 one-click templates for full announcements that cannot be rebuilt word-by-word from the local archive:

- MTF entry with SCPs alive, MTF entry with no SCPs alive, Ghostbusters, Tactical Holiday, full Dead Man's Switch, and the GLaDOS custom example.

Some wiki announcements are still not exposed as full fill-in templates because the local audio archive is missing required words:

- Full standard MTF evacuation sentence: missing `advised`, `protocols`, `reaches`, and `destination`; the `No SCPs Alive` variant also lacks `safety`, `remains`, `within`, and `exercise`.
- Ghostbusters announcement: missing `ghostbusters` and `specters`.
- Full Tactical Holiday announcement: missing `holiday`, `workshop`, `elves`, `gingerbread`, `festivized`, `sight`, and related seasonal terms, despite local partial clips such as `xmas_epsilon11` and `xmas_scpsubjects`.
- Full Dead Man's Switch sentence can use local `dms_ann`; word-by-word rebuild is not available because `underground`, `section`, `set`, `recovery`, and `switch` are missing.
- GLaDOS joke example is not exposed because `oh` and `GLaDOS` are missing.

## Notes

- The raw voice clips are dry, but the app defaults to program-style processing: `3000ms` voice delay and `60` tail reverb.
- Background audio is optional and defaults off.
- `BG_4` through `BG_40` are selected by the number after `BG_`, which is the noise-bed duration between the leading and trailing prompt sounds.
- `cassie.data` contains `BG_4..BG_40` except `BG_14`; this project keeps a generated `BG_14.wav` supplement so every duration from 4 to 40 is available.
- The app selects `BG_N` by `ceil(sentence duration + voice delay)`, clamped to the available `4..40` range, matching the original folder lookup behavior.
- `the` is an input alias: it resolves to `the_vowel` before vowel-sound words and `the_consonant` otherwise.
- SCP numeric designations are read digit-by-digit: `SCP-999` becomes `SCP`, `9`, `9`, `9` instead of a single `999` token.
- Wiki-style `Epsilon-11`, `re-containment`, and `Dead Man's Switch` spellings are normalized before matching so copied announcement text does not drop those clips.
- English number words are aliases for existing numeric clips when available: for example `eleven` resolves to `11`.
- Text input greedily matches multiword clip names before falling back to single words: for example `nine tailed fox` resolves to `Nine-Tailed Fox`, and `mobile task force unit` resolves to `Mobile Task Force unit`.
- The archive also contains hidden letter clips (`_a.._z`), suffix clips (`_suffix_ing`, `_suffix_plural_regular`, etc.), and fragment clips (`anti-`, `pre-`, `-ish`, `-like`). They remain searchable in the clip list for manual composition.
- Speed and pitch follow the original C# behavior: both are applied as a playback-rate/resampling factor.
- Voice gap, overlap, and voice delay mirror the original builder semantics.

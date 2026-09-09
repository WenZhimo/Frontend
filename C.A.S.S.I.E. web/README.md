# C.A.S.S.I.E. Web Sentence Builder

Static browser port of the C.A.S.S.I.E. sentence builder. It concatenates locally extracted SCP: Secret Laboratory voice clips with Web Audio and exports a generated WAV file.

## Run

Double-click `run-local.bat` to start the local static server and open the app in the default browser.

```powershell
cd "D:\盒子\HTML\C.A.S.S.I.E. web"
python -m http.server 5173 --bind 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

## Modes

The app has two separate generator surfaces:

- **Original clip mode** keeps the SCP:SL / C.A.S.S.I.E. behavior: it tokenizes text, matches words and phrases against the extracted audio library, optionally adds the duration-matched `BG_4..BG_40` bed, then exports a WAV.
- **Kokoro TTS mode** sends the full text directly to a browser-side Kokoro model. It does not validate each word against the C.A.S.S.I.E. clip library, so high-frequency words and missing archive terms can be spoken normally.

Kokoro TTS currently exposes these voices:

- `am_michael`
- `bm_daniel`
- `am_adam`

The static page loads `kokoro-js` from the jsDelivr ESM CDN inside `src/tts-worker.js`, so model loading and speech generation do not block the main UI thread. The default model is `onnx-community/Kokoro-82M-v1.0-ONNX`, with automatic WebGPU-first loading and WASM fallback. First use needs network access to download the model files; after the browser caches them, later loads are faster. The model ID, backend, and dtype can be edited in the page for custom Kokoro-compatible models.

TTS mode keeps the original processing controls: gap, overlap, voice delay, speed, pitch, tail reverb, and optional duration-matched `BG_N` background audio. Normal mode splits text into sentence/line segments. Fragment mode generates one word at a time, then stitches the words together to mimic the clipped original C.A.S.S.I.E. cadence. Progress and elapsed time update during generation, and generation can be cancelled between units.

TTS announcement templates use pure text. Fillable official-announcement fields are rendered as normal form controls, highlighted in the preview, and then inserted into the TTS text box as plain editable text.

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
- The duplicate-asset cleanup pass found no byte-identical audio files, duplicate manifest entries, or unreferenced `.ogg`/`.mp3`/`.wav` assets, so no audio files were removed.
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

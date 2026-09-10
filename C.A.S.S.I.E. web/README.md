# C.A.S.S.I.E. Web 语句生成器

- 原项目：[Convex89524/C.A.S.S.I.E](https://github.com/Convex89524/C.A.S.S.I.E)
- 本项目 GitHub Pages：[C.A.S.S.I.E. web](https://wenzhimo.github.io/Frontend/C.A.S.S.I.E.%20web/index.html)

这是 C.A.S.S.I.E. 语句生成器的静态网页版本。它可以在浏览器内拼接本地提取的《SCP: Secret Laboratory》C.A.S.S.I.E. 语音片段，通过 Web Audio 生成预览音频并导出 WAV；同时也支持 Kokoro TTS 模型生成。

## 授权协议

本项目新增代码、页面和文档采用 CC BY-SA（署名-相同方式共享）协议发布。涉及原 C.A.S.S.I.E. 项目、《SCP: Secret Laboratory》及其音频、文本、名称、公告素材的部分，不由本项目重新授权，使用和分发以原项目、游戏及相关权利方声明为准。Kokoro、Kokoro TTS 模型、音色和模型文件也不由本项目重新授权，使用时以对应模型 / 上游项目的许可证和条款为准。

字体资源位于 `assets/fonts/`：标题等特殊文字使用 `0xA000-Monochrome`，英文正文使用 `manifold`，中文正文使用思源黑体 / Source Han Sans。以上字体权利归各自权利人所有，不受本项目 CC BY-SA 协议重新授权，使用和再分发请遵循对应字体的原始许可证和条款。

## 运行方式

双击项目目录里的 `run-local.bat`，脚本会启动本地静态服务，并自动用默认浏览器打开网页。

手动启动也可以：

```powershell
python -m http.server 5173 --bind 127.0.0.1
```

然后打开：

```text
http://127.0.0.1:5173/
```

## 功能模式

应用有两个独立界面：

- **原版语音拼接模式**：保留 SCP:SL / C.A.S.S.I.E. 的片段拼接思路。程序会把输入文本分词，优先匹配词库中的单词和短语，可选叠加按时长匹配的 `BG_4..BG_40` 背景提示音，最后导出 WAV。
- **Kokoro TTS 模式**：将文本交给浏览器侧 Kokoro 模型生成语音，不再逐词检查 C.A.S.S.I.E. 词库，因此极高频词和本地片段缺失的词也可以正常朗读。

Kokoro TTS 当前预置音色：

- `am_michael`
- `bm_daniel`
- `am_adam`

静态页面会在 `src/tts-worker.js` 中从 jsDelivr ESM CDN 加载 `kokoro-js`，模型加载和生成都在 worker 中执行，避免阻塞主界面。默认模型为 `onnx-community/Kokoro-82M-v1.0-ONNX`，会优先尝试 WebGPU，并在不可用时回退到 WASM。首次使用需要联网下载模型文件；浏览器缓存后，后续加载会更快。页面中也可以编辑模型 ID、后端和 dtype，以使用兼容 Kokoro 的自定义模型。

TTS 模式保留原版处理参数：间隔、提前播放、语音延迟、语速、音高、尾音混响，以及可选的 `BG_N` 背景提示音。正常模式按句段生成，并可在估算的句内词边界插入间隔；碎片模式会先用 C.A.S.S.I.E. 词库做最长短语匹配，再把剩余普通词组成 2-3 词短碎片生成，以保留更明显的拼接感。生成过程中会显示进度和耗时，也可以中途停止。

TTS 版官方公告模板使用纯文本。可填写字段以普通表单控件展示，预览中会高亮字段，应用后会把完整文本写入 TTS 输入框，方便继续编辑。

## C.A.S.S.I.E. 指令效果

原版拼接和 Kokoro TTS 都支持在文本中插入控制指令。指令不会被朗读，而是在它出现的位置加入对应效果；TTS 模式会先移除指令，再把效果加入最终音频时间线。

```text
Attention $SLEEP_500 all personnel
Danger, $SPAC_200 light containment zone
The system is $STUTT_3 malfunctioning
Repeat this $REPEAT_2 announcement
Warning $JAM_500_3 all personnel
Alert $NOISE_300 immediately
```

- `$SLEEP_毫秒`、`$SPAC_毫秒`：插入静音。两者在网页生成器中都表示当前位置的停顿。
- `$STUTT_次数`：把前一个语音单元的尾音快速重复指定次数，中间使用短间隔。
- `$STUTTER_起点_片段长度_次数`：使用游戏原生三参数格式，在下一个语音单元中反复播放指定短片段；例如 `$STUTTER_0.500_0.13_3`。旧式 `jam_(delay)_(stutter amount)` 也会按短片段卡顿处理。
- `$REPEAT_次数`：把前一个语音单元连续重复指定次数。
- `$NOISE_毫秒`：插入本地 `static` 杂音片段，并按指定时长循环或裁剪。
- `$JAM_延迟毫秒_次数`：先插入指定延迟，再播放本地 `g1` 故障音若干次。单独输入 `.g1` 到 `.g6` 可以直接插入对应故障音。

省略参数时会使用默认值：停顿 500ms、杂音 300ms、故障延迟 180ms、卡顿 3 次、重复 1 次。网页会限制异常大的参数，避免一次生成占用过长时间。

## 音频资源

主要语音资源来自：

```text
CASSIE-1.2.0\cassie.data
(见原项目：Convex89524/C.A.S.S.I.E)
```

`cassie.data` 是一个自定义 `.NET BinaryReader` 归档，结构如下：

1. `OGGDATA1` 魔数，8 字节。
2. 小端 `Int32` 文件数量。
3. 重复条目：7-bit 长度 UTF-8 路径、小端 `Int64` 字节长度、原始 Ogg 数据。

已提取文件位于 `assets/audio/cassie-data/`，应用 manifest 位于 `assets/audio/manifest.json`。

官方 wiki MP3 示例也已镜像到 `assets/audio/wiki-announcements/`。这些文件是完整渲染后的公告示例，适合直接播放缺词公告，但当玩家需要自定义 SCP 编号、单位代号或数量时，仍不能替代可填写模板。

重新解码另一份 `cassie.data`：

```powershell
python tools\extract-cassie-data.py "<cassie.data 文件路径>" "assets\audio\cassie-data"
```

刷新官方 wiki MP3 镜像和 manifest 条目：

```powershell
python tools\import-wiki-audio.py
```

## 官方公告模板

模板字幕已对照以下来源核查：

```text
https://en.scpslgame.com/index.php?title=C.A.S.S.I.E.
<SCP: Secret Laboratory 安装目录>\Translations\en\Subtitles.txt
```

本次核查的 wiki 版本最后编辑于 2026-09-08，包含游戏内公告和建议 / 自定义公告示例。

页面内模板生成器已包含可由本地语音库拼出的可填写官方公告：

- MTF / NTF 入场公告，包括入场 + 待收容数量，以及入场 + `All SCPs secured` 变体。
- 待重新收容数量公告。
- SCP 终止公告：未指定原因、由 SCP 终止、由 Automatic Security System 终止、由 Alpha Warhead 终止、由 Marshmallow Man 终止。
- SCP 收容公告：由 Science Personnel、Class-D Personnel、Chaos Insurgency、未知单位、指定 Containment Unit 收容，以及在 Decontamination Sequence 中丢失。
- 发电机进度和完成公告，包括 `3 out of 3 generators activated. All generators have been successfully engaged.`。
- Overcharge、Facility operational、LCZ decontamination、Alpha Warhead 启动 / 取消 / 恢复与时间选择、Dead Man's Switch、Chaos Insurgency Gate A 公告。
- wiki 中可完全本地配音的自定义示例：`Hello and welcome to Site-02.`、`SCP-999 successfully terminated.`、`Unauthorized user detected at HCZ-096 terminal.`。

模板生成器也包含官方 wiki MP3 一键模板，用于播放无法逐词从本地归档重建的完整公告：

- MTF 入场且仍有 SCP 存活。
- MTF 入场且无 SCP 存活。
- Ghostbusters。
- Tactical Holiday。
- 完整 Dead Man's Switch。
- GLaDOS 自定义示例。

仍未作为完整可填写模板暴露的 wiki 公告，主要原因是本地音频归档缺少必要词语：

- 标准 MTF 疏散完整句缺少 `advised`、`protocols`、`reaches`、`destination`；`No SCPs Alive` 变体还缺少 `safety`、`remains`、`within`、`exercise`。
- Ghostbusters 公告缺少 `ghostbusters` 和 `specters`。
- Tactical Holiday 完整公告缺少 `holiday`、`workshop`、`elves`、`gingerbread`、`festivized`、`sight` 及相关季节词，尽管本地有 `xmas_epsilon11`、`xmas_scpsubjects` 等部分片段。
- 完整 Dead Man's Switch 可以使用本地 `dms_ann` 片段，但无法逐词重建，因为缺少 `underground`、`section`、`set`、`recovery`、`switch`。
- GLaDOS 笑话示例缺少 `oh` 和 `GLaDOS`。

## 重要说明

- 原始语音片段本身是干声；程序默认添加类似游戏播报的后处理：`3000ms` 语音延迟和 `60` 尾音混响。
- 背景提示音默认关闭，可在界面中手动启用。
- 重复资源清理检查没有发现字节完全相同的音频、重复 manifest 条目或未引用的 `.ogg` / `.mp3` / `.wav`，因此没有删除音频文件。
- `BG_4` 到 `BG_40` 会按文件名数字选择；数字表示两段提示音之间背景噪声的持续秒数。
- `cassie.data` 中包含 `BG_4..BG_40`，但缺少 `BG_14`；本项目保留了生成的 `BG_14.wav` 补充文件，使 4 到 40 秒区间完整可用。
- 应用会按 `ceil(语句时长 + 语音延迟)` 选择 `BG_N`，并限制在可用的 `4..40` 范围内，匹配原项目的文件夹查找行为。
- `the` 是输入别名：元音音素前解析为 `the_vowel`，其他情况解析为 `the_consonant`。
- SCP 数字编号会逐位朗读：`SCP-999` 会变成 `SCP`、`9`、`9`、`9`，而不是单个 `999`。
- 自动文本匹配会保留标点边界：逗号、分号、冒号等会插入短停顿，句号、问号、感叹号和换行会插入更长停顿，词库短语和 TTS 自动短语不会跨过这些边界。
- 复制 wiki 文本时，`Epsilon-11`、`re-containment`、`Dead Man's Switch` 等写法会在匹配前规范化，避免遗漏对应片段。
- 英文数字词会在可用时映射到数字音频，例如 `eleven` 会解析为 `11`。
- 文本输入会优先贪婪匹配多词片段，再回退到单词。例如 `nine tailed fox` 会解析为 `Nine-Tailed Fox`，`mobile task force unit` 会解析为 `Mobile Task Force unit`。
- `Awating Recontainment Of` 会作为完整短语 `awaiting re-containment of` 处理，匹配实际音频内容，避免生成公告时重复出现 `of`。
- 归档中还包含隐藏字母片段（`_a.._z`）、后缀片段（`_suffix_ing`、`_suffix_plural_regular` 等）和词缀片段（`anti-`、`pre-`、`-ish`、`-like`）。这些仍可在片段列表中搜索并手动组合。
- 语速和音高沿用原 C# 行为：二者都会作为播放率 / 重采样系数应用。
- 间隔、提前播放和语音延迟沿用原生成器语义。
- TTS 正常模式保持句段级生成，然后用“间隔”参数在估算的低能量词边界插入短暂停顿；遇到 `SCP-173 has` 这类编号时会额外拆成 `S C P`、`1 7 3`、后续句段，避免编号和后文黏读。
- TTS 碎片模式优先使用 C.A.S.S.I.E. 词库短语，再把剩余词组为 2-3 词自动短语；`SCP-173 has` 这类编号会拆为 `S C P`、`1 7 3`、后续词，避免把编号前缀或最后一位数字粘到上下文里。它不再生成额外上下文进行裁剪，以避免上下文尾音泄漏，同时保留更清晰的拼接感。
- 碎片音频会用 8ms RMS 窗口剪裁每段首尾静音，并保留接近原版词片段中位数的边缘留白：开头约 16ms，结尾约 52ms，然后再应用用户设置的间隔。

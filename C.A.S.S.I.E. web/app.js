import { parseCassieControlCommands, controlLabel, buildCassieTimeline, scheduleCassieTimeline } from "./src/cassie-controls.js";
import { parseInlineTtsEffects, attachInlineTtsEffects, applyInlineEffectsToChannels } from "./src/tts-inline-effects.js";
import { synthesizeExactBackgroundChannels } from "./src/background-audio.js";

// Application state and DOM bindings
const state = {
  manifest: null,
  clips: [],
  words: [],
  phrases: [],
  backgrounds: [],
  synthesizedBackground: null,
  selected: [],
  category: "word",
  decoded: new Map(),
  generatedBuffer: null,
  generatedBlobUrl: null,
  generatedDirty: true,
  lastBackgroundClip: null,
  currentSource: null,
  audioContext: null,
  activeMode: "cassie",
  playback: {
    mode: null,
    buffer: null,
    offset: 0,
    startedAt: 0,
    rafId: null,
    progressByMode: {
      cassie: 0,
      tts: 0,
    },
    dragMode: null,
    dragPointerId: null,
    dragWasPlaying: false,
  },
  tts: {
    worker: null,
    voices: [],
    currentJobId: 0,
    pendingJob: null,
    isGenerating: false,
    timerId: null,
    timerStartedAt: 0,
    elapsedMs: 0,
    lastBackgroundClip: null,
    generatedBuffer: null,
    generatedBlobUrl: null,
    generatedDirty: true,
  },
};

const els = {
  modeCassie: document.querySelector("#modeCassie"),
  modeTts: document.querySelector("#modeTts"),
  cassieWorkspace: document.querySelector("#cassieWorkspace"),
  ttsWorkspace: document.querySelector("#ttsWorkspace"),
  assetCount: document.querySelector("#assetCount"),
  renderDuration: document.querySelector("#renderDuration"),
  libraryMeta: document.querySelector("#libraryMeta"),
  reloadAssets: document.querySelector("#reloadAssets"),
  wordSearch: document.querySelector("#wordSearch"),
  wordList: document.querySelector("#wordList"),
  sentenceMeta: document.querySelector("#sentenceMeta"),
  clearSentence: document.querySelector("#clearSentence"),
  textInput: document.querySelector("#textInput"),
  applyText: document.querySelector("#applyText"),
  sampleOne: document.querySelector("#sampleOne"),
  sampleTwo: document.querySelector("#sampleTwo"),
  announcementTemplate: document.querySelector("#announcementTemplate"),
  templateFields: document.querySelector("#templateFields"),
  templatePreview: document.querySelector("#templatePreview"),
  templateMeta: document.querySelector("#templateMeta"),
  applyTemplate: document.querySelector("#applyTemplate"),
  missingTokens: document.querySelector("#missingTokens"),
  sentenceList: document.querySelector("#sentenceList"),
  gapMs: document.querySelector("#gapMs"),
  overlapMs: document.querySelector("#overlapMs"),
  voiceDelayMs: document.querySelector("#voiceDelayMs"),
  speedPercent: document.querySelector("#speedPercent"),
  pitchSemitones: document.querySelector("#pitchSemitones"),
  reverbLevel: document.querySelector("#reverbLevel"),
  enableBackground: document.querySelector("#enableBackground"),
  backgroundGain: document.querySelector("#backgroundGain"),
  backgroundGainValue: document.querySelector("#backgroundGainValue"),
  waveform: document.querySelector("#waveform"),
  generatePreview: document.querySelector("#generatePreview"),
  playAudio: document.querySelector("#playAudio"),
  stopAudio: document.querySelector("#stopAudio"),
  downloadAudio: document.querySelector("#downloadAudio"),
  status: document.querySelector("#status"),
  ttsInput: document.querySelector("#ttsInput"),
  ttsTemplate: document.querySelector("#ttsTemplate"),
  ttsTemplateFields: document.querySelector("#ttsTemplateFields"),
  ttsTemplatePreview: document.querySelector("#ttsTemplatePreview"),
  ttsTemplateMeta: document.querySelector("#ttsTemplateMeta"),
  applyTtsTemplate: document.querySelector("#applyTtsTemplate"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsModel: document.querySelector("#ttsModel"),
  ttsBackend: document.querySelector("#ttsBackend"),
  ttsDtype: document.querySelector("#ttsDtype"),
  ttsGenerationMode: document.querySelector("#ttsGenerationMode"),
  ttsGapMs: document.querySelector("#ttsGapMs"),
  ttsOverlapMs: document.querySelector("#ttsOverlapMs"),
  ttsVoiceDelayMs: document.querySelector("#ttsVoiceDelayMs"),
  ttsSpeedPercent: document.querySelector("#ttsSpeedPercent"),
  ttsPitchSemitones: document.querySelector("#ttsPitchSemitones"),
  ttsReverbLevel: document.querySelector("#ttsReverbLevel"),
  ttsEnableBackground: document.querySelector("#ttsEnableBackground"),
  ttsBackgroundGain: document.querySelector("#ttsBackgroundGain"),
  ttsBackgroundGainValue: document.querySelector("#ttsBackgroundGainValue"),
  loadTtsModel: document.querySelector("#loadTtsModel"),
  generateTts: document.querySelector("#generateTts"),
  playTts: document.querySelector("#playTts"),
  stopTts: document.querySelector("#stopTts"),
  downloadTts: document.querySelector("#downloadTts"),
  ttsProgress: document.querySelector("#ttsProgress"),
  ttsProgressBar: document.querySelector("#ttsProgressBar"),
  ttsProgressLabel: document.querySelector("#ttsProgressLabel"),
  ttsProgressCount: document.querySelector("#ttsProgressCount"),
  ttsWaveform: document.querySelector("#ttsWaveform"),
  ttsRenderDuration: document.querySelector("#ttsRenderDuration"),
  ttsStatus: document.querySelector("#ttsStatus"),
};

// Token normalization and clip alias data
const textSplitRe = /[ ,.!?\r\n;:\t，。！？；：、]+/g;
const speechBoundaryRe = /[,;:，；：、]+|[.!?。！？]+|\n+/g;
const scpNumberRe = /\bSCP\s*[-_#]?\s*(\d+(?:[-_]\d+)*)\b/gi;
const phraseSeparatorRe = /[^a-z0-9]+/g;
const vowelSoundTokens = new Set(["scp", "a", "e", "f", "h", "i", "l", "m", "n", "o", "r", "s", "x", "8", "11", "18", "80", "80s"]);
const consonantSoundTokens = new Set(["euclid", "one", "once", "u", "unit", "universal", "usbdrive", "use", "user", "using"]);
const numberWordAliases = new Map([
  ["zero", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["ten", "10"],
  ["eleven", "11"],
  ["twelve", "12"],
  ["thirteen", "13"],
  ["fourteen", "14"],
  ["fifteen", "15"],
  ["sixteen", "16"],
  ["seventeen", "17"],
  ["eighteen", "18"],
  ["nineteen", "19"],
  ["twenty", "20"],
  ["thirty", "30"],
  ["forty", "40"],
  ["fifty", "50"],
  ["sixty", "60"],
  ["seventy", "70"],
  ["eighty", "80"],
  ["ninety", "90"],
]);
const exactTokenAliases = new Map([
  ["awaiting", "awating"],
  ["class-d", "classd"],
  ["mtf", "_mtfu"],
  ["re-containment", "recontainment"],
  ["mtfu", "_mtfu"],
]);
const ttsFragmentTokenAliases = new Map([
  ["_mtfu", "M T F"],
  ["awating", "awaiting"],
  ["cassie", "Cassie"],
  ["classd", "Class D"],
  ["dms_ann", "Dead Man's Switch"],
  ["hcz", "H C Z"],
  ["lcz", "L C Z"],
  ["mtf", "M T F"],
  ["ntf", "N T F"],
  ["outof", "out of"],
  ["scp", "S C P"],
]);
const phraseClipAliases = [
  { phrase: "awaiting recontainment of", clipName: "Awating Recontainment Of" },
  { phrase: "awaiting re containment of", clipName: "Awating Recontainment Of" },
  { phrase: "awating recontainment of", clipName: "Awating Recontainment Of" },
  { phrase: "detonation sequence cancelled", clipName: "cancelled" },
  { phrase: "detonation sequence canceled", clipName: "cancelled" },
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmtSeconds = (seconds) => `${seconds.toFixed(2).padStart(5, "0")}s`;
const waveformColors = {
  cassie: "#d8d2c7",
  tts: "#9f121b",
};
const waveformPeakCache = new WeakMap();
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const kokoroVoices = ["am_michael", "bm_daniel", "am_adam"];
const TTS_WORKER_URL = new URL("./src/tts-worker.js", import.meta.url);
const TTS_MAX_UNIT_CHARS = 360;
const TTS_FRAGMENT_TRIM_THRESHOLD = 0.01;
const TTS_FRAGMENT_TRIM_WINDOW_MS = 8;
const TTS_FRAGMENT_LEADING_PADDING_MS = 16;
const TTS_FRAGMENT_TRAILING_PADDING_MS = 52;
const TTS_FRAGMENT_AUTO_GROUP_MAX_TOKENS = 3;
const TTS_FRAGMENT_AUTO_GROUP_MAX_CHARS = 40;
const TTS_WORD_GAP_SEARCH_MS = 260;
const TTS_WORD_GAP_WINDOW_MS = 10;
const TTS_WORD_GAP_FADE_MS = 6;
const SOFT_PUNCTUATION_PAUSE_MS = 180;
const HARD_PUNCTUATION_PAUSE_MS = 280;
const SCP_PREFIX_PAUSE_MS = 150;
const SCP_DIGIT_PAUSE_MS = 70;
const SCP_SUFFIX_PAUSE_MS = 150;

// Official announcement template data
const warheadTimeOptions = [
  { value: "120s", label: "120 seconds" },
  { value: "110s", label: "110 seconds" },
  { value: "100s", label: "100 seconds" },
  { value: "90s", label: "90 seconds" },
  { value: "80s", label: "80 seconds" },
  { value: "70s", label: "70 seconds" },
  { value: "60s", label: "60 seconds" },
  { value: "50s", label: "50 seconds" },
  { value: "40s", label: "40 seconds" },
  { value: "30s", label: "30 seconds" },
];
const officialWikiAnnouncementTemplates = [
  {
    id: "official-mtf-scps-alive",
    title: "官方音频：MTF 入场（有 SCP 存活）",
    description: "Wiki MP3: full MTF entry announcement with standard evacuation text and awaiting re-containment.",
    fields: [],
    build: () => "Official MTF SCPs Alive",
  },
  {
    id: "official-mtf-no-scps",
    title: "官方音频：MTF 入场（无 SCP 存活）",
    description: "Wiki MP3: full MTF entry announcement with standard evacuation text and caution line.",
    fields: [],
    build: () => "Official MTF No SCPs Alive",
  },
  {
    id: "official-ghostbusters",
    title: "官方音频：Ghostbusters 活动公告",
    description: "Wiki MP3: Halloween 2021 / 2023 Ghostbusters MTF announcement.",
    fields: [],
    build: () => "Official MTF Ghostbusters",
  },
  {
    id: "official-tactical-holiday",
    title: "官方音频：Tactical Holiday 公告",
    description: "Wiki MP3: December 25th-31st Tactical Holiday Unit announcement.",
    fields: [],
    build: () => "Official Tactical Holiday MTF",
  },
  {
    id: "official-dead-mans-switch",
    title: "官方音频：Dead Man's Switch 完整公告",
    description: "Wiki MP3: full Site Recovery Failure / Dead Man's Switch announcement.",
    fields: [],
    build: () => "Official Dead Mans Switch",
  },
  {
    id: "official-glados",
    title: "官方音频：GLaDOS 自定义示例",
    description: "Wiki MP3: custom announcement example #4, \"Oh, it's you.\"",
    fields: [],
    build: () => "Official GLaDOS CASSIE",
  },
];
const announcementTemplates = [
  {
    id: "mtf-entry",
    title: "MTF Epsilon-11 进入设施",
    description: "Mobile Task Force Unit Epsilon-11 designated [designation] has entered the facility.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox", placeholder: "Nine-Tailed Fox" },
    ],
    build: (values) => `mobile task force unit epsilon eleven designated ${fieldValue(values, "designation", "Nine-Tailed Fox")} has entered the facility`,
  },
  {
    id: "mtf-entry-recontainment",
    title: "MTF Epsilon-11 入场 + 重新收容",
    description: "Mobile Task Force Unit Epsilon-11 designated [designation] has entered the facility. Awaiting re-containment of: [count] SCP subjects.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox", placeholder: "Nine-Tailed Fox" },
      { id: "count", label: "count", type: "number", value: "3", min: "1", max: "9", step: "1" },
    ],
    build: (values) => {
      const count = fieldValue(values, "count", "3");
      const subject = normalizeName(count) === "1" || normalizeName(count) === "one" ? "SCP subject" : "SCP subjects";
      return `mobile task force unit epsilon eleven designated ${fieldValue(values, "designation", "Nine-Tailed Fox")} has entered the facility awaiting recontainment of ${count} ${subject}`;
    },
  },
  {
    id: "mtf-entry-secured",
    title: "MTF Epsilon-11 入场 + 所有 SCP 已收容",
    description: "Mobile Task Force Unit Epsilon-11 designated [designation] has entered the facility. All SCPs secured.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox", placeholder: "Nine-Tailed Fox" },
    ],
    build: (values) => `mobile task force unit epsilon eleven designated ${fieldValue(values, "designation", "Nine-Tailed Fox")} has entered the facility all scps secured`,
  },
  {
    id: "ntf-backup",
    title: "Nine-Tailed Fox 后备单位",
    description: "Nine-Tailed Fox Backup Unit has entered the facility.",
    fields: [],
    build: () => "nine tailed fox backup unit has entered the facility",
  },
  {
    id: "awaiting-recontainment",
    title: "等待重新收容",
    description: "Awaiting re-containment of: [count] SCP subjects.",
    fields: [
      { id: "count", label: "count", type: "number", value: "3", min: "1", max: "9", step: "1" },
    ],
    build: (values) => {
      const count = fieldValue(values, "count", "3");
      const subject = normalizeName(count) === "1" || normalizeName(count) === "one" ? "SCP subject" : "SCP subjects";
      return `awaiting recontainment of ${count} ${subject}`;
    },
  },
  {
    id: "scp-terminated-unspecified",
    title: "SCP 被终止：原因未知",
    description: "[SCP-Designation] successfully terminated. Termination cause unspecified.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "939", placeholder: "939" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "939"))} successfully terminated termination cause unspecified`,
  },
  {
    id: "scp-terminated-by-scp",
    title: "SCP 被另一个 SCP 终止",
    description: "[SCP-Designation] terminated by SCP-[scp].",
    fields: [
      { id: "scp", label: "terminated SCP", type: "text", value: "939", placeholder: "939" },
      { id: "killerScp", label: "killer SCP", type: "text", value: "173", placeholder: "173" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "939"))} terminated by ${formatScpDesignation(fieldValue(values, "killerScp", "173"))}`,
  },
  {
    id: "scp-terminated-auto-security",
    title: "SCP 被自动安保系统终止",
    description: "[SCP-Designation] successfully terminated by Automatic Security System.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "939", placeholder: "939" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "939"))} successfully terminated by automatic security system`,
  },
  {
    id: "scp-terminated-warhead",
    title: "SCP 被 Alpha Warhead 终止",
    description: "[SCP-Designation] successfully terminated by Alpha Warhead.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "939", placeholder: "939" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "939"))} successfully terminated by alpha warhead`,
  },
  {
    id: "scp-terminated-marshmallow",
    title: "SCP 被 Marshmallow Man 终止",
    description: "[SCP-Designation] terminated by Marshmallow Man.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "939", placeholder: "939" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "939"))} terminated by marshmallow man`,
  },
  {
    id: "scp-contained-science",
    title: "SCP 被科学人员收容",
    description: "[SCP-Designation] contained successfully by Science Personnel.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "049", placeholder: "049" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "049"))} contained successfully by science personnel`,
  },
  {
    id: "scp-contained-classd",
    title: "SCP 被 Class-D 收容",
    description: "[SCP-Designation] contained successfully by Class-D Personnel.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "049", placeholder: "049" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "049"))} contained successfully by class d personnel`,
  },
  {
    id: "scp-contained-chaos",
    title: "SCP 被混沌分裂者收容",
    description: "[SCP-Designation] contained successfully by Chaos Insurgency.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "049", placeholder: "049" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "049"))} contained successfully by chaos insurgency`,
  },
  {
    id: "scp-contained-unknown",
    title: "SCP 被收容：单位未知",
    description: "[SCP-Designation] contained successfully. Containment unit unknown.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "079", placeholder: "079" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "079"))} contained successfully containment unit unknown`,
  },
  {
    id: "scp-contained-unit",
    title: "SCP 被指定单位收容",
    description: "[SCP-Designation] contained successfully. Containment Unit [designation].",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "079", placeholder: "079" },
      { id: "designation", label: "containment unit", type: "text", value: "Nine-Tailed Fox", placeholder: "Nine-Tailed Fox" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "079"))} contained successfully containment unit ${fieldValue(values, "designation", "Nine-Tailed Fox")}`,
  },
  {
    id: "scp-lost-decont",
    title: "SCP 死于净化序列",
    description: "[SCP-Designation] lost in Decontamination Sequence.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "173", placeholder: "173" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "173"))} lost in decontamination sequence`,
  },
  {
    id: "generator-progress",
    title: "发电机进度",
    description: "[current] out of [max] generators activated.",
    fields: [
      { id: "current", label: "current", type: "number", value: "1", min: "0", max: "3", step: "1" },
      { id: "max", label: "max", type: "number", value: "3", min: "1", max: "3", step: "1" },
    ],
    build: (values) => `${fieldValue(values, "current", "1")} out of ${fieldValue(values, "max", "3")} generators activated`,
  },
  {
    id: "generator-complete",
    title: "发电机全部启动",
    description: "[current] out of [max] generators activated. All generators have been successfully engaged.",
    fields: [
      { id: "current", label: "current", type: "number", value: "3", min: "0", max: "3", step: "1" },
      { id: "max", label: "max", type: "number", value: "3", min: "1", max: "3", step: "1" },
    ],
    build: (values) => `${fieldValue(values, "current", "3")} out of ${fieldValue(values, "max", "3")} generators activated all generators have been successfully engaged`,
  },
  {
    id: "overcharge",
    title: "过载倒数",
    description: "Overcharge in 3... 2... 1...",
    fields: [],
    build: () => "overcharge in three two one",
  },
  {
    id: "facility-operational",
    title: "设施恢复运行",
    description: "Facility is back in operational mode.",
    fields: [],
    build: () => "facility is back in operational mode",
  },
  {
    id: "lcz-decont",
    title: "LCZ 净化公告",
    description: "Light Containment Zone decontamination messages.",
    fields: [
      {
        id: "decontClip",
        label: "decont stage",
        type: "select",
        value: "Decont_15",
        options: [
          { value: "Decont_15", label: "T-15 minutes" },
          { value: "Decont_10", label: "T-10 minutes" },
          { value: "Decont_5", label: "T-5 minutes" },
          { value: "Decont_1", label: "T-1 minute" },
          { value: "Decont_countdown", label: "T-30 seconds + doors open" },
          { value: "Decont_begun", label: "Lockdown / begun" },
        ],
      },
    ],
    build: (values) => fieldValue(values, "decontClip", "Decont_15"),
  },
  {
    id: "warhead-start",
    title: "Alpha Warhead 启动",
    description: "EMERGENCY DETONATION SEQUENCE: ACTIVATED. T-[time] SECONDS.",
    fields: [
      { id: "time", label: "time", type: "select", value: "90s", options: warheadTimeOptions },
    ],
    build: (values) => `Warhead Start ${fieldValue(values, "time", "90s")}`,
  },
  {
    id: "warhead-cancelled",
    title: "Alpha Warhead 取消",
    description: "DETONATION SEQUENCE: CANCELLED.",
    fields: [],
    build: () => "detonation sequence cancelled",
  },
  {
    id: "warhead-resume",
    title: "Alpha Warhead 恢复",
    description: "EMERGENCY DETONATION SEQUENCE: RESUMED. T-[time] SECONDS.",
    fields: [
      { id: "time", label: "time", type: "select", value: "90s", options: warheadTimeOptions },
    ],
    build: (values) => `Warhead Resume ${fieldValue(values, "time", "90s")}`,
  },
  {
    id: "dead-mans-switch",
    title: "Dead Man's Switch",
    description: "SITE RECOVERY FAILURE - DEAD MAN's SWITCH ACTIVATED. T-90 SECONDS.",
    fields: [],
    build: () => "dms_ann",
  },
  ...officialWikiAnnouncementTemplates,
  {
    id: "chaos-detected",
    title: "Gate A 检测到混沌部队",
    description: "Attention, all personnel. Detected [number] Chaos Insurgency forces at Gate A. Lethal force authorized.",
    fields: [
      { id: "number", label: "number", type: "number", value: "5", min: "1", max: "9", step: "1" },
    ],
    build: (values) => `attention all personnel detected ${fieldValue(values, "number", "5")} chaos insurgency forces at gate A lethal force authorized`,
  },
  {
    id: "chaos-additional",
    title: "Gate A 新增敌对部队",
    description: "Acquired [number] additional hostile forces at Gate A. Defense model: updated.",
    fields: [
      { id: "number", label: "number", type: "number", value: "5", min: "1", max: "9", step: "1" },
    ],
    build: (values) => `acquired ${fieldValue(values, "number", "5")} additional hostile forces at gate A defense module updated`,
  },
  {
    id: "welcome-site-02",
    title: "自定义示例：Site-02 欢迎",
    description: "Hello and welcome to Site-02.",
    fields: [],
    build: () => "hello and welcome to site 0 2",
  },
  {
    id: "custom-scp-terminated",
    title: "自定义示例：SCP 成功终止",
    description: "SCP-[designation] successfully terminated.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "999", placeholder: "999" },
    ],
    build: (values) => `${formatScpDesignation(fieldValue(values, "scp", "999"))} successfully terminated`,
  },
  {
    id: "hcz-terminal",
    title: "自定义示例：HCZ 终端警告",
    description: "Unauthorized user detected at HCZ-[number] terminal.",
    fields: [
      { id: "terminal", label: "terminal number", type: "text", value: "096", placeholder: "096" },
    ],
    build: (values) => `unauthorized user detected at heavy containment zone ${spaceDigits(fieldValue(values, "terminal", "096"))} terminal`,
  },
];

const ttsAnnouncementTemplates = [
  {
    id: "tts-mtf-scps-alive",
    title: "MTF 入场（有 SCP 存活）",
    template: "Mobile Task Force Unit Epsilon-11 designated {designation} has entered the facility. All remaining personnel are advised to proceed with standard evacuation protocols until an MTF squad reaches your destination. Awaiting re-containment of: {count} SCP subjects.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox-3", placeholder: "Nine-Tailed Fox-3" },
      { id: "count", label: "SCP count", type: "number", value: "3", min: "1", max: "9", step: "1" },
    ],
  },
  {
    id: "tts-mtf-no-scps",
    title: "MTF 入场（无 SCP 存活）",
    template: "Mobile Task Force Unit Epsilon-11 designated {designation} has entered the facility. All remaining personnel are advised to proceed with standard evacuation protocols until an MTF squad reaches your destination. Substantial threat to safety remains within the facility -- exercise caution.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox-3", placeholder: "Nine-Tailed Fox-3" },
    ],
  },
  {
    id: "tts-ntf-backup",
    title: "Nine-Tailed Fox 后备单位",
    template: "Nine-Tailed Fox Backup Unit has entered the facility.",
    fields: [],
  },
  {
    id: "tts-ghostbusters",
    title: "Ghostbusters 活动公告",
    template: "Mobile Task Force Unit Epsilon-11 designated Ghostbusters {designation} has entered the facility. All remaining personnel are advised to proceed with standard evacuation protocols until an MTF squad reaches your destination. Awaiting re-containment of: {count} specters.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox-3", placeholder: "Nine-Tailed Fox-3" },
      { id: "count", label: "specter count", type: "number", value: "3", min: "1", max: "9", step: "1" },
    ],
  },
  {
    id: "tts-tactical-holiday",
    title: "Tactical Holiday 公告",
    template: "Tactical Holiday Unit Epsilon-11 designated {designation} has entered the workshop. All remaining elves are advised to seek shelter in the nearest gingerbread house until a unit has festivized the facility. Awaiting recontainment of {count} spoil-sport holiday haters.",
    fields: [
      { id: "designation", label: "designation", type: "text", value: "Nine-Tailed Fox-3", placeholder: "Nine-Tailed Fox-3" },
      { id: "count", label: "count", type: "number", value: "3", min: "1", max: "9", step: "1" },
    ],
  },
  {
    id: "tts-chaos-standard",
    title: "Gate A 检测到混沌部队",
    template: "Attention, all personnel. Detected {number} Chaos Insurgency forces at Gate A. Lethal force authorized.",
    fields: [
      { id: "number", label: "number", type: "number", value: "5", min: "1", max: "99", step: "1" },
    ],
  },
  {
    id: "tts-chaos-mini",
    title: "Gate A 新增敌对部队",
    template: "Acquired {number} additional hostile forces at Gate A. Defense model: updated.",
    fields: [
      { id: "number", label: "number", type: "number", value: "5", min: "1", max: "99", step: "1" },
    ],
  },
  {
    id: "tts-terminated-unspecified",
    title: "SCP 被终止：原因未知",
    template: "{scp} successfully terminated. Termination cause unspecified.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-939", placeholder: "SCP-939" },
    ],
  },
  {
    id: "tts-terminated-by-scp",
    title: "SCP 被另一个 SCP 终止",
    template: "{scp} terminated by {killerScp}.",
    fields: [
      { id: "scp", label: "terminated SCP", type: "text", value: "SCP-939", placeholder: "SCP-939" },
      { id: "killerScp", label: "killer SCP", type: "text", value: "SCP-173", placeholder: "SCP-173" },
    ],
  },
  {
    id: "tts-terminated-auto-security",
    title: "SCP 被自动安保系统终止",
    template: "{scp} successfully terminated by Automatic Security System.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-939", placeholder: "SCP-939" },
    ],
  },
  {
    id: "tts-terminated-warhead",
    title: "SCP 被 Alpha Warhead 终止",
    template: "{scp} successfully terminated by Alpha Warhead.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-939", placeholder: "SCP-939" },
    ],
  },
  {
    id: "tts-terminated-marshmallow",
    title: "SCP 被 Marshmallow Man 终止",
    template: "{scp} terminated by Marshmallow Man.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-939", placeholder: "SCP-939" },
    ],
  },
  {
    id: "tts-contained-science",
    title: "SCP 被科学人员收容",
    template: "{scp} contained successfully by Science Personnel.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-049", placeholder: "SCP-049" },
    ],
  },
  {
    id: "tts-contained-classd",
    title: "SCP 被 Class-D 收容",
    template: "{scp} contained successfully by Class-D Personnel.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-049", placeholder: "SCP-049" },
    ],
  },
  {
    id: "tts-contained-chaos",
    title: "SCP 被混沌分裂者收容",
    template: "{scp} contained successfully by Chaos Insurgency.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-049", placeholder: "SCP-049" },
    ],
  },
  {
    id: "tts-contained-unknown",
    title: "SCP 被收容：单位未知",
    template: "{scp} contained successfully. Containment unit unknown.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-079", placeholder: "SCP-079" },
    ],
  },
  {
    id: "tts-contained-unit",
    title: "SCP 被指定单位收容",
    template: "{scp} contained successfully. Containment Unit {designation}.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-079", placeholder: "SCP-079" },
      { id: "designation", label: "containment unit", type: "text", value: "Nine-Tailed Fox", placeholder: "Nine-Tailed Fox" },
    ],
  },
  {
    id: "tts-lost-decont",
    title: "SCP 死于净化序列",
    template: "{scp} lost in Decontamination Sequence.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-173", placeholder: "SCP-173" },
    ],
  },
  {
    id: "tts-generator-progress",
    title: "发电机进度",
    template: "{current} out of {max} generators activated.",
    fields: [
      { id: "current", label: "current", type: "number", value: "1", min: "0", max: "3", step: "1" },
      { id: "max", label: "max", type: "number", value: "3", min: "1", max: "3", step: "1" },
    ],
  },
  {
    id: "tts-generator-complete",
    title: "发电机全部启动",
    template: "{current} out of {max} generators activated. All generators have been successfully engaged.",
    fields: [
      { id: "current", label: "current", type: "number", value: "3", min: "0", max: "3", step: "1" },
      { id: "max", label: "max", type: "number", value: "3", min: "1", max: "3", step: "1" },
    ],
  },
  {
    id: "tts-overcharge",
    title: "过载倒数",
    template: "Overcharge in 3... 2... 1...",
    fields: [],
  },
  {
    id: "tts-facility-operational",
    title: "设施恢复运行",
    template: "Facility is back in operational mode.",
    fields: [],
  },
  {
    id: "tts-warhead-start",
    title: "Alpha Warhead 启动",
    template: "Emergency detonation sequence activated. The underground section of this facility is set to self-destruct in: T-{time}.",
    fields: [
      { id: "time", label: "time", type: "select", value: "90 seconds", options: warheadTimeOptions.map((item) => ({ value: item.label, label: item.label })) },
    ],
  },
  {
    id: "tts-warhead-cancelled",
    title: "Alpha Warhead 取消",
    template: "Detonation sequence cancelled.",
    fields: [],
  },
  {
    id: "tts-warhead-resume",
    title: "Alpha Warhead 恢复",
    template: "Emergency detonation sequence resumed. T-{time}.",
    fields: [
      { id: "time", label: "time", type: "select", value: "90 seconds", options: warheadTimeOptions.map((item) => ({ value: item.label, label: item.label })) },
    ],
  },
  {
    id: "tts-dead-mans-switch",
    title: "Dead Man's Switch 完整公告",
    template: "Site recovery failure. Dead Man's Switch activated. The underground section of this facility will self-destruct in: T-{time}.",
    fields: [
      { id: "time", label: "time", type: "select", value: "90 seconds", options: warheadTimeOptions.map((item) => ({ value: item.label, label: item.label })) },
    ],
  },
  {
    id: "tts-decont-15",
    title: "LCZ 净化：15 分钟",
    template: "Attention, all personnel. The Light Containment Zone decontamination process will occur in T-15 minutes. All biological substances must be removed in order to avoid destruction.",
    fields: [],
  },
  {
    id: "tts-decont-10",
    title: "LCZ 净化：10 分钟",
    template: "Danger, Light Containment Zone overall decontamination in T-10 minutes.",
    fields: [],
  },
  {
    id: "tts-decont-5",
    title: "LCZ 净化：5 分钟",
    template: "Danger, Light Containment Zone overall decontamination in T-5 minutes.",
    fields: [],
  },
  {
    id: "tts-decont-1",
    title: "LCZ 净化：1 分钟",
    template: "Danger, Light Containment Zone overall decontamination in T-1 minute.",
    fields: [],
  },
  {
    id: "tts-decont-countdown",
    title: "LCZ 净化：30 秒倒数",
    template: "Danger, Light Containment Zone overall decontamination in T-30 seconds. All checkpoint doors have been permanently opened. Please evacuate immediately.20.19.18.17.16.15.14.13.12.10 seconds.9.8.7.6.5.4.3.2.1.Light Containment Zone is locked down and ready for decontamination. The removal of organic substances has now begun.",
    fields: [],
  },
  {
    id: "tts-decont-begun",
    title: "LCZ 净化：已开始",
    template: "Light Containment Zone is locked down and ready for decontamination. The removal of organic substances has now begun.",
    fields: [],
  },
  {
    id: "tts-welcome-site-02",
    title: "自定义示例：Site-02 欢迎",
    template: "Hello and welcome to Site-02.",
    fields: [],
  },
  {
    id: "tts-custom-scp-terminated",
    title: "自定义示例：SCP 成功终止",
    template: "{scp} successfully terminated.",
    fields: [
      { id: "scp", label: "SCP designation", type: "text", value: "SCP-999", placeholder: "SCP-999" },
    ],
  },
  {
    id: "tts-hcz-terminal",
    title: "自定义示例：HCZ 终端警告",
    template: "Unauthorized user detected at HCZ-{terminal} terminal.",
    fields: [
      { id: "terminal", label: "terminal number", type: "text", value: "096", placeholder: "096" },
    ],
  },
  {
    id: "tts-command-syntax-demo",
    title: "自定义示例：播报指令示意",
    template: [
      "Attention #{$SLEEP_500} #{#停顿：在 Attention 后插入 500ms 静音} all personnel.",
      "A #{containm--ent} #{#拖音：拉长 containment 中间的音素} #{brea-a-a-a-ch} #{#卡顿：在 breach 的 a 处加入 3 个额外 a，因此卡顿 3 次} has been #{det_det_det_detected} #{#复读：连续说出 3 次 det，再完整朗读 detected}.",
      "All personnel are advised to remain calm and await further instructions.",
      "#{$G_1,G_2,G_3,G_4,G_5,G_6} #{#故障音覆盖：可用 G_1、G_2、G_3、G_4、G_5、G_6；本例依次全部叠加到下一段语音} Security systems are now operating under emergency protocols.",
    ].join("\n"),
    fields: [],
  },
  {
    id: "tts-glados",
    title: "自定义示例：GLaDOS",
    template: "Oh, it's you.",
    fields: [],
  },
];

// Shared browser and option helpers
function getAudioContext() {
  if (!state.audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioCtx({ sampleRate: 44100 });
  }
  return state.audioContext;
}

function setStatus(message, tone = "normal") {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
}

function setTtsStatus(message, tone = "normal") {
  els.ttsStatus.textContent = message;
  els.ttsStatus.dataset.tone = tone;
}

function getOptions() {
  return {
    gapMs: clamp(Number(els.gapMs.value) || 0, 0, 5000),
    overlapMs: clamp(Number(els.overlapMs.value) || 0, 0, 5000),
    voiceDelayMs: clamp(Number(els.voiceDelayMs.value) || 0, 0, 20000),
    speedPercent: clamp(Number(els.speedPercent.value) || 100, 10, 400),
    pitchSemitones: clamp(Number(els.pitchSemitones.value) || 0, -24, 24),
    reverbLevel: clamp(Number(els.reverbLevel.value) || 0, 0, 120),
    enableBackground: els.enableBackground.checked,
    backgroundGain: clamp(Number(els.backgroundGain.value) || 0, 0, 100) / 100,
  };
}

function getTtsOptions() {
  return {
    gapMs: clamp(Number(els.ttsGapMs.value) || 0, 0, 5000),
    overlapMs: clamp(Number(els.ttsOverlapMs.value) || 0, 0, 5000),
    voiceDelayMs: clamp(Number(els.ttsVoiceDelayMs.value) || 0, 0, 20000),
    speedPercent: clamp(Number(els.ttsSpeedPercent.value) || 100, 10, 400),
    pitchSemitones: clamp(Number(els.ttsPitchSemitones.value) || 0, -24, 24),
    reverbLevel: clamp(Number(els.ttsReverbLevel.value) || 0, 0, 120),
    enableBackground: els.ttsEnableBackground.checked,
    backgroundGain: clamp(Number(els.ttsBackgroundGain.value) || 0, 0, 100) / 100,
  };
}

function getTtsModelSettings() {
  return {
    modelId: String(els.ttsModel.value || "").trim() || KOKORO_MODEL_ID,
    device: els.ttsBackend.value || "auto",
    dtype: els.ttsDtype.value || "auto",
  };
}

function markDirty() {
  state.generatedDirty = true;
  els.downloadAudio.classList.add("is-disabled");
  els.downloadAudio.setAttribute("aria-disabled", "true");
}

function markTtsDirty() {
  state.tts.generatedDirty = true;
  els.downloadTts.classList.add("is-disabled");
  els.downloadTts.setAttribute("aria-disabled", "true");
  setTtsReadyState(false);
}

function reloadTtsModelOnNextUse() {
  if (state.tts.isGenerating) return;
  if (state.tts.worker) {
    state.tts.worker.terminate();
    state.tts.worker = null;
  }
  state.tts.voices = [];
  state.tts.pendingJob = null;
  state.tts.currentJobId += 1;
  setTtsProgress("模型设置已变更", 0, 0);
  markTtsDirty();
}

// Original C.A.S.S.I.E. token matching
function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

function fieldValue(values, id, fallback) {
  const value = String(values?.[id] ?? "").trim();
  return value || fallback;
}

function formatScpDesignation(value) {
  const raw = String(value || "").trim().replace(/^scp\s*[-_#]?\s*/i, "");
  const parts = raw.match(/\d+/g);
  return parts ? `SCP-${parts.join("-")}` : "SCP-939";
}

function spaceDigits(value, fallback = "0") {
  const digits = String(value || "").replace(/\D/g, "");
  return (digits || fallback).split("").join(" ");
}

function canonicalTokenName(token) {
  const normalized = normalizeName(token);
  return exactTokenAliases.get(normalized) || numberWordAliases.get(normalized) || normalized;
}

function normalizePhraseKey(value) {
  return normalizeName(value)
    .replace(phraseSeparatorRe, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCanonicalPhraseKey(value) {
  const tokens = normalizePhraseKey(value).split(" ").filter(Boolean);
  return normalizePhraseTokens(tokens);
}

function normalizePhraseTokens(tokens) {
  return normalizePhraseKey(tokens.map((token) => canonicalTokenName(token)).join(" "));
}

function splitPlainText(text) {
  return text
    .split(textSplitRe)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeSentenceInput(text) {
  return String(text || "")
    .replace(/\bepsilon\s*[-–—]\s*11\b/gi, "epsilon 11")
    .replace(/\bre\s*[-–—]\s*containment\b/gi, "recontainment")
    .replace(/\bdead\s+man's\s+switch\b/gi, "dms_ann");
}

function punctuationPauseMs(boundary) {
  if (!boundary) return 0;
  return /[.!?。！？\n]/.test(boundary) ? HARD_PUNCTUATION_PAUSE_MS : SOFT_PUNCTUATION_PAUSE_MS;
}

function withBoundaryPunctuation(text, boundary) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return "";
  const punctuation = String(boundary || "").replace(/\s+/g, "");
  return punctuation ? `${cleanText}${punctuation}` : cleanText;
}

function applyTokenMinGap(part, gapMs) {
  if (!part || gapMs <= 0) return part;
  part.minGapAfterMs = Math.max(Number(part.minGapAfterMs) || 0, gapMs);
  return part;
}

function tokenPartToken(part) {
  return typeof part === "string" ? part : part?.token;
}

function tokenPartMinGapAfterMs(part) {
  return Math.max(0, Number(part?.minGapAfterMs) || 0);
}

function tokenPartHasBoundaryAfter(part) {
  return tokenPartMinGapAfterMs(part) > 0;
}

function tokenPartTokens(parts) {
  return parts.map(tokenPartToken).filter(Boolean);
}

function splitSpeechTextSegments(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n");
  const segments = [];
  let cursor = 0;
  let match;

  speechBoundaryRe.lastIndex = 0;
  while ((match = speechBoundaryRe.exec(normalized)) !== null) {
    const chunk = normalized.slice(cursor, match.index).trim();
    if (chunk) {
      segments.push({
        text: withBoundaryPunctuation(chunk, match[0]),
        minGapAfterMs: punctuationPauseMs(match[0]),
      });
    }
    cursor = match.index + match[0].length;
  }

  const tail = normalized.slice(cursor).trim();
  if (tail) segments.push({ text: tail, minGapAfterMs: 0 });
  return segments;
}

function pushPlainTokenParts(parts, text) {
  splitPlainText(text).forEach((token) => {
    parts.push({ token, minGapAfterMs: 0 });
  });
}

function pushScpDesignationParts(parts, digitsText) {
  const digits = String(digitsText || "").replace(/\D/g, "").split("").filter(Boolean);
  parts.push({
    token: "SCP",
    minGapAfterMs: SCP_PREFIX_PAUSE_MS,
    isScpDesignationPrefix: true,
  });

  digits.forEach((digit, index) => {
    parts.push({
      token: digit,
      minGapAfterMs: index === digits.length - 1 ? SCP_SUFFIX_PAUSE_MS : SCP_DIGIT_PAUSE_MS,
      isScpDesignationDigit: true,
    });
  });
}

function tokenizeSpeechSegmentParts(text) {
  const parts = [];
  let cursor = 0;
  let match;

  scpNumberRe.lastIndex = 0;
  while ((match = scpNumberRe.exec(text)) !== null) {
    pushPlainTokenParts(parts, text.slice(cursor, match.index));
    pushScpDesignationParts(parts, match[1]);
    cursor = match.index + match[0].length;
  }

  pushPlainTokenParts(parts, text.slice(cursor));
  return parts;
}

function tokenizeSentenceParts(text) {
  const normalizedText = normalizeSentenceInput(text);
  const parts = [];

  splitSpeechTextSegments(normalizedText).forEach((segment) => {
    const segmentParts = tokenizeSpeechSegmentParts(segment.text);
    if (segmentParts.length > 0) {
      applyTokenMinGap(segmentParts[segmentParts.length - 1], segment.minGapAfterMs);
      parts.push(...segmentParts);
    }
  });

  return parts;
}

function tokenizeSentenceText(text) {
  return tokenPartTokens(tokenizeSentenceParts(text));
}

function hasBoundaryWithinTokenParts(tokenParts, startIndex, tokenCount) {
  if (!tokenParts || tokenCount <= 1) return false;
  for (let index = startIndex; index < startIndex + tokenCount - 1; index += 1) {
    if (tokenPartHasBoundaryAfter(tokenParts[index])) return true;
  }
  return false;
}

function startsWithVowelSound(token) {
  const normalized = canonicalTokenName(token).replace(/^_+/, "");
  if (!normalized || consonantSoundTokens.has(normalized)) return false;
  return vowelSoundTokens.has(normalized) || /^[aeiou]/.test(normalized);
}

function shouldUseHiddenLetterClip(token, previousToken) {
  const raw = String(token || "").trim();
  const normalized = normalizeName(raw);
  if (!/^[a-z]$/.test(normalized)) return false;
  return /^[A-Z]$/.test(raw) || normalizeName(previousToken) === "gate";
}

function resolveClipForToken(token, nextToken, byName, previousToken) {
  const normalized = normalizeName(token);
  if (shouldUseHiddenLetterClip(token, previousToken)) {
    const letterClip = byName.get(`_${normalized}`);
    if (letterClip) return letterClip;
  }

  if (normalized === "the") {
    const variantName = startsWithVowelSound(nextToken) ? "the_vowel" : "the_consonant";
    return byName.get(variantName);
  }

  const canonical = canonicalTokenName(token);
  return byName.get(canonical) || byName.get(normalized);
}

function buildTextLookup() {
  const speechClips = state.clips.filter((clip) => clip.category !== "background");
  const byName = new Map(speechClips.map((clip) => [normalizeName(clip.name), clip]));
  const phraseCandidates = speechClips
    .filter((clip) => isPhraseCandidate(clip))
    .map((clip) => {
      const key = normalizePhraseKey(clip.name);
      const keys = new Set([key, normalizeCanonicalPhraseKey(clip.name)]);
      const normalizedTokenCount = key.split(" ").filter(Boolean).length;
      const rawTokenCount = splitPlainText(clip.name).length;
      const tokenCounts = [...new Set([normalizedTokenCount, rawTokenCount])]
        .filter((count) => count > 1)
        .sort((a, b) => b - a);
      return {
        clip,
        keys,
        tokenCounts,
        sortTokenCount: Math.max(...tokenCounts),
      };
    })
    .filter((candidate) => candidate.tokenCounts.length > 0)
    .concat(buildPhraseAliasCandidates(byName))
    .sort((a, b) => b.sortTokenCount - a.sortTokenCount);

  return { byName, phraseCandidates };
}

function buildPhraseAliasCandidates(byName) {
  return phraseClipAliases
    .map(({ phrase, clipName }) => {
      const key = normalizePhraseKey(phrase);
      const clip = byName.get(normalizeName(clipName));
      const tokenCount = key.split(" ").filter(Boolean).length;
      return clip && tokenCount > 1
        ? {
          clip,
          keys: new Set([key, normalizeCanonicalPhraseKey(phrase)]),
          tokenCounts: [tokenCount],
          sortTokenCount: tokenCount,
        }
        : null;
    })
    .filter(Boolean);
}

function isPhraseCandidate(clip) {
  const name = String(clip.name || "").trim();
  return Boolean(name)
    && !name.startsWith("_")
    && !name.startsWith("-")
    && !name.endsWith("-");
}

function findPhraseClip(tokens, startIndex, phraseCandidates, tokenParts = null) {
  for (const candidate of phraseCandidates) {
    for (const tokenCount of candidate.tokenCounts) {
      if (tokenCount > tokens.length - startIndex) continue;
      if (hasBoundaryWithinTokenParts(tokenParts, startIndex, tokenCount)) continue;

      const segmentKey = normalizePhraseTokens(tokens.slice(startIndex, startIndex + tokenCount));
      if (candidate.keys.has(segmentKey)) {
        return {
          clip: candidate.clip,
          tokenCount,
        };
      }
    }
  }

  return null;
}

function makeSelectedItem(clip, meta = {}) {
  return {
    kind: "clip",
    clip,
    minGapAfterMs: Math.max(0, Number(meta.minGapAfterMs) || 0),
  };
}

function makeControlItem(control) {
  return { kind: "control", control };
}

function selectedClip(item) {
  return item?.clip || item;
}

function selectedControl(item) {
  return item?.kind === "control" ? item.control : null;
}

// Manifest loading and clip browser rendering
async function loadManifest() {
  setStatus("正在加载本地音频 manifest");
  const response = await fetch("assets/audio/manifest.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`manifest 加载失败：HTTP ${response.status}`);
  }

  state.manifest = await response.json();
  state.clips = state.manifest.clips || [];
  state.words = state.clips.filter((clip) => clip.category === "word");
  state.phrases = state.clips.filter((clip) => clip.category === "phrase");
  state.backgrounds = state.clips
    .filter((clip) => clip.category === "background")
    .sort((a, b) => getBackgroundSeconds(a) - getBackgroundSeconds(b));
  state.synthesizedBackground = null;

  els.assetCount.textContent = `${state.manifest.counts.total} clips / ${state.manifest.counts.word} words`;
  els.libraryMeta.textContent = `${state.manifest.counts.word} 词 · ${state.manifest.counts.phrase} 公告 · ${state.manifest.counts.background} BG`;
  setStatus("词库就绪。默认语音延迟 3000ms，尾音混响 60；背景会按完整播报时长精确生成。");
  renderWordList();
  applyTextToSentence();
}

function visibleClips() {
  const query = normalizeName(els.wordSearch.value);
  const source = state.category === "all"
    ? state.clips.filter((clip) => clip.category !== "background")
    : state.clips.filter((clip) => clip.category === state.category);

  if (!query) return source;
  return source.filter((clip) => normalizeName(clip.name).includes(query));
}

function renderWordList() {
  const clips = visibleClips();
  const fragment = document.createDocumentFragment();

  clips.forEach((clip) => {
    const row = document.createElement("div");
    row.className = "word-row";
    row.setAttribute("role", "option");
    row.innerHTML = `
      <div>
        <strong title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</strong>
        <small>${clip.category} · ${clip.duration.toFixed(2)}s · ${clip.channels}ch</small>
      </div>
      <button type="button" aria-label="Add ${escapeHtml(clip.name)}">+</button>
    `;
    row.querySelector("button").addEventListener("click", () => addClip(clip));
    row.addEventListener("dblclick", () => addClip(clip));
    fragment.appendChild(row);
  });

  els.wordList.replaceChildren(fragment);
}

function renderSentence() {
  const clipCount = state.selected.filter((item) => !selectedControl(item)).length;
  const controlCount = state.selected.length - clipCount;
  els.sentenceMeta.textContent = `${clipCount} clips${controlCount ? ` · ${controlCount} controls` : ""}`;
  const fragment = document.createDocumentFragment();

  state.selected.forEach((selected, index) => {
    const clip = selectedClip(selected);
    const control = selectedControl(selected);
    const label = control ? controlLabel(control) : clip.name;
    const item = document.createElement("li");
    item.className = "sentence-item";
    item.innerHTML = `
      <span class="sentence-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="sentence-name" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <span class="item-tools">
        <button type="button" data-action="up" aria-label="Move ${escapeHtml(label)} up">↑</button>
        <button type="button" data-action="down" aria-label="Move ${escapeHtml(label)} down">↓</button>
        <button type="button" data-action="remove" aria-label="Remove ${escapeHtml(label)}">×</button>
      </span>
    `;

    item.querySelector('[data-action="up"]').addEventListener("click", () => moveClip(index, -1));
    item.querySelector('[data-action="down"]').addEventListener("click", () => moveClip(index, 1));
    item.querySelector('[data-action="remove"]').addEventListener("click", () => removeClip(index));
    fragment.appendChild(item);
  });

  els.sentenceList.replaceChildren(fragment);
}

function addClip(clip) {
  state.selected.push(makeSelectedItem(clip));
  markDirty();
  renderSentence();
}

function removeClip(index) {
  state.selected.splice(index, 1);
  markDirty();
  renderSentence();
}

function moveClip(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= state.selected.length) return;
  const [clip] = state.selected.splice(index, 1);
  state.selected.splice(next, 0, clip);
  markDirty();
  renderSentence();
}

function clearSentence() {
  state.selected = [];
  els.missingTokens.textContent = "";
  markDirty();
  renderSentence();
  drawEmptyWaveform();
}

function applyTextToSentence() {
  let segments;
  try {
    segments = parseCassieControlCommands(els.textInput.value);
  } catch (error) {
    state.selected = [];
    markDirty();
    renderSentence();
    els.missingTokens.textContent = error.message;
    setStatus(error.message, "error");
    return;
  }
  const { byName, phraseCandidates } = buildTextLookup();
  const picked = [];
  const missing = [];
  segments.forEach((segment) => {
    segment.controlsBefore.forEach((control) => picked.push(makeControlItem(control)));
    const tokenParts = tokenizeSentenceParts(segment.text);
    const tokens = tokenPartTokens(tokenParts);
    let index = 0;
    while (index < tokens.length) {
      const phraseMatch = findPhraseClip(tokens, index, phraseCandidates, tokenParts);
      if (phraseMatch) {
        picked.push(makeSelectedItem(
          phraseMatch.clip,
          tokenParts[index + phraseMatch.tokenCount - 1],
        ));
        index += phraseMatch.tokenCount;
        continue;
      }

      const token = tokens[index];
      const clip = resolveClipForToken(token, tokens[index + 1], byName, tokens[index - 1]);
      if (clip) picked.push(makeSelectedItem(clip, tokenParts[index]));
      else missing.push(token);
      index += 1;
    }
  });

  state.selected = picked;
  const controlCount = picked.filter((item) => selectedControl(item)).length;
  const controlLabel = controlCount ? `已识别 ${controlCount} 个控制指令。` : "";
  els.missingTokens.textContent = [
    missing.length ? `未匹配：${missing.join(", ")}` : "",
    controlLabel,
  ].filter(Boolean).join(" ");
  markDirty();
  renderSentence();
}

// Announcement form rendering
function renderAnnouncementTemplates() {
  const options = announcementTemplates.map((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.title;
    return option;
  });

  els.announcementTemplate.replaceChildren(...options);
  els.templateMeta.textContent = `${announcementTemplates.length} 个模板 · 来自游戏字幕`;
  renderTemplateFields();
}

function selectedAnnouncementTemplate() {
  return announcementTemplates.find((template) => template.id === els.announcementTemplate.value)
    || announcementTemplates[0];
}

function renderTemplateFields() {
  const template = selectedAnnouncementTemplate();
  const fragment = document.createDocumentFragment();

  template.fields.forEach((field) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = field.label;

    const control = field.type === "select"
      ? document.createElement("select")
      : document.createElement("input");
    control.dataset.templateField = field.id;

    if (field.type === "select") {
      field.options.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        control.appendChild(option);
      });
      control.value = field.value;
    } else {
      control.type = field.type || "text";
      control.value = field.value || "";
      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.min) control.min = field.min;
      if (field.max) control.max = field.max;
      if (field.step) control.step = field.step;
    }

    control.addEventListener("input", updateTemplatePreview);
    control.addEventListener("change", updateTemplatePreview);
    label.append(text, control);
    fragment.appendChild(label);
  });

  els.templateFields.replaceChildren(fragment);
  updateTemplatePreview();
}

function readTemplateValues(template) {
  const values = {};
  template.fields.forEach((field) => {
    const control = els.templateFields.querySelector(`[data-template-field="${field.id}"]`);
    values[field.id] = control?.value ?? field.value ?? "";
  });
  return values;
}

function updateTemplatePreview() {
  const template = selectedAnnouncementTemplate();
  const values = readTemplateValues(template);
  els.templatePreview.textContent = template.build(values);
}

function applyAnnouncementTemplate() {
  const template = selectedAnnouncementTemplate();
  const values = readTemplateValues(template);
  els.textInput.value = template.build(values);
  applyTextToSentence();
}

function renderTtsTemplates() {
  const options = ttsAnnouncementTemplates.map((template) => {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.title;
    return option;
  });

  els.ttsTemplate.replaceChildren(...options);
  els.ttsTemplateMeta.textContent = `${ttsAnnouncementTemplates.length} 个纯文本模板 · 字段高亮`;
  renderTtsTemplateFields();
}

function selectedTtsTemplate() {
  return ttsAnnouncementTemplates.find((template) => template.id === els.ttsTemplate.value)
    || ttsAnnouncementTemplates[0];
}

function renderTtsTemplateFields() {
  const template = selectedTtsTemplate();
  const fragment = document.createDocumentFragment();

  template.fields.forEach((field) => {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = field.label;

    const control = field.type === "select"
      ? document.createElement("select")
      : document.createElement("input");
    control.dataset.ttsTemplateField = field.id;

    if (field.type === "select") {
      field.options.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        control.appendChild(option);
      });
      control.value = field.value;
    } else {
      control.type = field.type || "text";
      control.value = field.value || "";
      if (field.placeholder) control.placeholder = field.placeholder;
      if (field.min) control.min = field.min;
      if (field.max) control.max = field.max;
      if (field.step) control.step = field.step;
    }

    control.addEventListener("input", updateTtsTemplatePreview);
    control.addEventListener("change", updateTtsTemplatePreview);
    label.append(text, control);
    fragment.appendChild(label);
  });

  els.ttsTemplateFields.replaceChildren(fragment);
  updateTtsTemplatePreview();
}

function readTtsTemplateValues(template) {
  const values = {};
  template.fields.forEach((field) => {
    const control = els.ttsTemplateFields.querySelector(`[data-tts-template-field="${field.id}"]`);
    values[field.id] = control?.value ?? field.value ?? "";
  });
  return values;
}

function buildTtsTemplateText(template, values) {
  return template.template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, id) => fieldValue(values, id, match));
}

function updateTtsTemplatePreview() {
  const template = selectedTtsTemplate();
  const values = readTtsTemplateValues(template);
  const fragment = document.createDocumentFragment();
  const parts = template.template.split(/(\{[A-Za-z0-9_]+\})/g);

  parts.forEach((part) => {
    const match = /^\{([A-Za-z0-9_]+)\}$/.exec(part);
    if (!match) {
      fragment.append(document.createTextNode(part));
      return;
    }

    const mark = document.createElement("mark");
    mark.textContent = fieldValue(values, match[1], part);
    fragment.append(mark);
  });

  els.ttsTemplatePreview.replaceChildren(fragment);
}

function applyTtsTemplate() {
  const template = selectedTtsTemplate();
  const values = readTtsTemplateValues(template);
  els.ttsInput.value = buildTtsTemplateText(template, values);
  markTtsDirty();
}

// Audio rendering and playback
async function decodeClip(clip) {
  if (state.decoded.has(clip.file)) {
    return state.decoded.get(clip.file);
  }

  const response = await fetch(clip.file);
  if (!response.ok) {
    throw new Error(`${clip.name} 加载失败：HTTP ${response.status}`);
  }

  const audioData = await response.arrayBuffer();
  const decoded = await getAudioContext().decodeAudioData(audioData);
  state.decoded.set(clip.file, decoded);
  return decoded;
}

function createOfflineContext(channelCount, length, sampleRate) {
  try {
    return new OfflineAudioContext({
      numberOfChannels: channelCount,
      length,
      sampleRate,
    });
  } catch {
    return new OfflineAudioContext(channelCount, length, sampleRate);
  }
}

function getBackgroundSeconds(clip) {
  const explicit = Number(clip.backgroundSeconds);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const match = /^BG_(\d+)$/i.exec(clip.name || "");
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function getBackgroundMasterClip() {
  if (state.backgrounds.length === 0) return null;
  const timedBackgrounds = state.backgrounds.filter((clip) => Number.isFinite(getBackgroundSeconds(clip)));
  if (timedBackgrounds.length === 0) return null;
  return timedBackgrounds.find((clip) => getBackgroundSeconds(clip) === 40)
    || timedBackgrounds.reduce((longest, clip) => (
      getBackgroundSeconds(clip) > getBackgroundSeconds(longest) ? clip : longest
    ), timedBackgrounds[0]);
}

function createBufferFromChannels(channels, sampleRate) {
  const output = getAudioContext().createBuffer(channels.length, channels[0].length, sampleRate);
  channels.forEach((channel, index) => output.getChannelData(index).set(channel));
  return output;
}

async function getExactBackgroundBuffer(targetSeconds) {
  const masterClip = getBackgroundMasterClip();
  if (!masterClip) return null;
  const target = Math.max(4, Math.ceil(Number(targetSeconds) || 0));
  const cacheKey = `${masterClip.file}:${target}`;
  if (state.synthesizedBackground?.key === cacheKey) return state.synthesizedBackground.value;

  const masterBuffer = await decodeClip(masterClip);
  const sourceChannels = Array.from(
    { length: masterBuffer.numberOfChannels },
    (_, index) => masterBuffer.getChannelData(index),
  );
  const synthesized = synthesizeExactBackgroundChannels(sourceChannels, masterBuffer.sampleRate, target);
  const result = {
    buffer: createBufferFromChannels(synthesized.channels, masterBuffer.sampleRate),
    clip: {
      ...masterClip,
      name: `BG_AUTO_${synthesized.plan.targetSeconds}s`,
      backgroundSeconds: synthesized.plan.targetSeconds,
      generated: true,
    },
  };
  state.synthesizedBackground = { key: cacheKey, value: result };
  return result;
}

async function prepareControlRenderItem(control) {
  if (control.type !== "glitch-overlay") return { control };
  const buffers = await Promise.all(control.clipNames.map(async (clipName) => {
    const clip = state.clips.find((candidate) => normalizeName(candidate.name) === clipName);
    if (!clip) throw new Error(`缺少故障音资源：${clipName}`);
    return decodeClip(clip);
  }));
  return { control, buffers };
}

async function renderAudioBuffer() {
  if (state.selected.length === 0) {
    throw new Error("句子队列为空");
  }

  const options = getOptions();
  const resampleFactor = Math.max(0.1, options.speedPercent / 100) * Math.pow(2, options.pitchSemitones / 12);
  const decodedItems = await Promise.all(state.selected.map(async (item) => {
    const control = selectedControl(item);
    if (control) return prepareControlRenderItem(control);
    return { ...item, buffer: await decodeClip(selectedClip(item)) };
  }));
  return renderSpeechTimeline(decodedItems, options, "cassie", resampleFactor);
}

async function renderSpeechTimeline(items, options, mode, playbackRate) {
  const timeline = buildCassieTimeline(items, { ...options, playbackRate });
  const resultState = mode === "tts" ? state.tts : state;
  const sampleRate = 44100;
  let backgroundBuffer = null;
  resultState.lastBackgroundClip = null;
  if (options.enableBackground) {
    const background = await getExactBackgroundBuffer(timeline.duration);
    if (background) {
      resultState.lastBackgroundClip = background.clip;
      backgroundBuffer = background.buffer;
    }
  }

  const totalSeconds = Math.max(0.25, timeline.duration, backgroundBuffer?.duration || 0);
  const outputChannels = mode === "cassie" ? (options.enableBackground ? 2 : 1)
    : Math.max(1, backgroundBuffer?.numberOfChannels || 1, ...items.map((item) => item.buffer?.numberOfChannels || 1));
  const offline = createOfflineContext(outputChannels, Math.ceil(totalSeconds * sampleRate), sampleRate);

  if (backgroundBuffer) {
    const bgSource = offline.createBufferSource();
    const bgGain = offline.createGain();
    bgSource.buffer = backgroundBuffer;
    bgGain.gain.value = options.backgroundGain;
    bgSource.connect(bgGain).connect(offline.destination);
    bgSource.start(0);
  }

  scheduleCassieTimeline(offline, timeline);
  const dryBuffer = await offline.startRendering();
  return applyReverbTail(dryBuffer, options.reverbLevel);
}

function applyReverbTail(inputBuffer, reverbLevel) {
  if (reverbLevel <= 0.01) return inputBuffer;

  const sampleRate = inputBuffer.sampleRate;
  const channels = inputBuffer.numberOfChannels;
  const delayA = Math.round(0.08 * sampleRate);
  const delayB = Math.round(0.16 * sampleRate);
  const delayC = Math.round(0.24 * sampleRate);
  const outLength = inputBuffer.length + sampleRate;
  const output = getAudioContext().createBuffer(channels, outLength, sampleRate);
  const baseAmp = Math.min(1, reverbLevel / 100);

  for (let channel = 0; channel < channels; channel += 1) {
    const input = inputBuffer.getChannelData(channel);
    const out = output.getChannelData(channel);
    out.set(input, 0);
    for (let i = 0; i < input.length; i += 1) {
      const sample = input[i] * baseAmp;
      addClamped(out, i + delayA, sample * 0.5);
      addClamped(out, i + delayB, sample * 0.3);
      addClamped(out, i + delayC, sample * 0.15);
    }
  }

  return output;
}

function addClamped(channelData, index, value) {
  if (index >= channelData.length) return;
  channelData[index] = clamp(channelData[index] + value, -1, 1);
}

async function generatePreview() {
  try {
    stopCurrentSource();
    setBusy(true);
    setStatus("正在预生成音频");
    const buffer = await renderAudioBuffer();
    state.generatedBuffer = buffer;
    state.generatedDirty = false;
    updateDownload(buffer);
    drawWaveform(buffer);
    els.renderDuration.textContent = fmtSeconds(buffer.duration);
    const bgLabel = state.lastBackgroundClip ? `，背景 ${state.lastBackgroundClip.name}` : "";
    const controlCount = state.selected.filter((item) => selectedControl(item)).length;
    const controlLabel = controlCount ? `，已应用 ${controlCount} 个控制指令` : "";
    setStatus(`预生成完成：${state.selected.length - controlCount} 个片段${controlLabel}，${fmtSeconds(buffer.duration)}${bgLabel}。`);
    return buffer;
  } catch (error) {
    setStatus(error.message || String(error), "error");
    throw error;
  } finally {
    setBusy(false);
  }
}

function cancelPlaybackProgressLoop() {
  if (state.playback.rafId) {
    cancelAnimationFrame(state.playback.rafId);
    state.playback.rafId = null;
  }
}

function getWaveformCanvas(mode) {
  return mode === "tts" ? els.ttsWaveform : els.waveform;
}

function getWaveformColor(mode) {
  return mode === "tts" ? waveformColors.tts : waveformColors.cassie;
}

function getGeneratedBuffer(mode) {
  return mode === "tts" ? state.tts.generatedBuffer : state.generatedBuffer;
}

function getPlaybackProgress(mode = state.playback.mode) {
  if (!mode) return 0;
  const buffer = state.playback.mode === mode && state.playback.buffer
    ? state.playback.buffer
    : getGeneratedBuffer(mode);
  if (!buffer?.duration) return 0;
  if (state.currentSource && state.playback.mode === mode && state.audioContext) {
    const elapsed = state.playback.offset + Math.max(0, state.audioContext.currentTime - state.playback.startedAt);
    return clamp(elapsed / buffer.duration, 0, 1);
  }
  return clamp(state.playback.progressByMode[mode] || 0, 0, 1);
}

function renderWaveformProgress(mode, progress = getPlaybackProgress(mode)) {
  const nextProgress = clamp(Number(progress) || 0, 0, 1);
  const buffer = getGeneratedBuffer(mode);
  state.playback.progressByMode[mode] = nextProgress;
  if (buffer) {
    drawWaveformFor(getWaveformCanvas(mode), buffer, getWaveformColor(mode), nextProgress);
  } else {
    drawEmptyWaveformFor(getWaveformCanvas(mode));
  }
  updateWaveformAria(mode, nextProgress, buffer);
}

function isModePlaying(mode) {
  return Boolean(state.currentSource && state.playback.mode === mode && state.playback.buffer);
}

function getPlaybackStartOffset(mode, buffer) {
  const progress = getPlaybackProgress(mode);
  if (!buffer?.duration || progress >= 0.995) return 0;
  return clamp(progress * buffer.duration, 0, Math.max(0, buffer.duration - 0.001));
}

function startPlaybackProgressLoop() {
  cancelPlaybackProgressLoop();
  const tick = () => {
    const { mode } = state.playback;
    if (!state.currentSource || !mode || !state.playback.buffer) return;
    const progress = getPlaybackProgress(mode);
    renderWaveformProgress(mode, progress);
    if (progress < 1) state.playback.rafId = requestAnimationFrame(tick);
  };
  state.playback.rafId = requestAnimationFrame(tick);
}

function finishPlayback(source, mode) {
  if (state.currentSource !== source) return;
  state.currentSource = null;
  cancelPlaybackProgressLoop();
  renderWaveformProgress(mode, 1);
  state.playback.mode = null;
  state.playback.buffer = null;
  state.playback.offset = 0;
  state.playback.startedAt = 0;
}

function stopCurrentSource({ resetProgress = false } = {}) {
  const mode = state.playback.mode;
  const progress = mode && !resetProgress ? getPlaybackProgress(mode) : 0;
  cancelPlaybackProgressLoop();
  if (state.currentSource) {
    const source = state.currentSource;
    state.currentSource = null;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Source may already have ended.
    }
    source.disconnect();
  }
  if (mode) {
    renderWaveformProgress(mode, progress);
  }
  state.playback.mode = null;
  state.playback.buffer = null;
  state.playback.offset = 0;
  state.playback.startedAt = 0;
}

async function playBuffer(buffer, mode = state.activeMode, offset = 0) {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();

  stopCurrentSource();
  const playbackMode = mode === "tts" ? "tts" : "cassie";
  const startOffset = clamp(Number(offset) || 0, 0, Math.max(0, buffer.duration - 0.001));
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    finishPlayback(source, playbackMode);
  };
  state.currentSource = source;
  state.playback.mode = playbackMode;
  state.playback.buffer = buffer;
  state.playback.offset = startOffset;
  state.playback.startedAt = context.currentTime;
  renderWaveformProgress(playbackMode, buffer.duration ? startOffset / buffer.duration : 0);
  source.start(0, startOffset);
  startPlaybackProgressLoop();
}

async function playAudio() {
  try {
    const buffer = state.generatedDirty || !state.generatedBuffer
      ? await generatePreview()
      : state.generatedBuffer;

    await playBuffer(buffer, "cassie", getPlaybackStartOffset("cassie", buffer));
    setStatus("正在播放预生成音频。");
  } catch {
    // generatePreview already reported the concrete error.
  }
}

function stopAudio() {
  stopCurrentSource();
  setStatus("停止播放。");
}

function updateDownload(buffer) {
  const wavBlob = new Blob([encodeWav(buffer)], { type: "audio/wav" });
  if (state.generatedBlobUrl) URL.revokeObjectURL(state.generatedBlobUrl);
  state.generatedBlobUrl = URL.createObjectURL(wavBlob);
  els.downloadAudio.href = state.generatedBlobUrl;
  els.downloadAudio.classList.remove("is-disabled");
  els.downloadAudio.setAttribute("aria-disabled", "false");
}

function updateTtsDownload(buffer) {
  const wavBlob = new Blob([encodeWav(buffer)], { type: "audio/wav" });
  if (state.tts.generatedBlobUrl) URL.revokeObjectURL(state.tts.generatedBlobUrl);
  state.tts.generatedBlobUrl = URL.createObjectURL(wavBlob);
  els.downloadTts.href = state.tts.generatedBlobUrl;
  els.downloadTts.classList.remove("is-disabled");
  els.downloadTts.setAttribute("aria-disabled", "false");
}

// Kokoro TTS worker orchestration
function splitLongTtsUnit(text) {
  const units = [];
  let remaining = String(text || "").trim();
  while (remaining.length > TTS_MAX_UNIT_CHARS) {
    let cut = remaining.lastIndexOf(" ", TTS_MAX_UNIT_CHARS);
    if (cut <= 0) cut = TTS_MAX_UNIT_CHARS;
    const head = remaining.slice(0, cut).trim();
    if (head) units.push(head);
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) units.push(remaining);
  return units;
}

function splitLongTtsSegment(segment) {
  const chunks = splitLongTtsUnit(segment.text);
  return chunks.map((text, index) => ({
    text,
    minGapAfterMs: index === chunks.length - 1 ? segment.minGapAfterMs : 0,
  }));
}

function splitTtsSpeechSegments(text) {
  return splitSpeechTextSegments(text).flatMap(splitLongTtsSegment);
}

function hasTtsSpeechContent(text) {
  return /[a-z0-9]/i.test(String(text || ""));
}

function pushTtsNormalTextSegments(segments, text, minGapAfterMs = 0) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  if (!hasTtsSpeechContent(cleanText)) {
    if (segments.length > 0) {
      applyUnitMinGap(segments[segments.length - 1], minGapAfterMs);
    }
    return;
  }

  splitLongTtsUnit(cleanText).forEach((chunk, index, chunks) => {
    segments.push({
      text: chunk,
      minGapAfterMs: index === chunks.length - 1 ? minGapAfterMs : 0,
    });
  });
}

function pushTtsScpDesignationSegments(segments, digitsText) {
  const digits = String(digitsText || "").replace(/\D/g, "").split("").filter(Boolean);
  segments.push({ text: "S C P", minGapAfterMs: SCP_PREFIX_PAUSE_MS });
  if (digits.length > 0) {
    segments.push({ text: digits.join(" "), minGapAfterMs: SCP_SUFFIX_PAUSE_MS });
  }
}

function splitTtsNormalSegment(segment) {
  const text = String(segment?.text || "");
  const segments = [];
  let cursor = 0;
  let match;

  scpNumberRe.lastIndex = 0;
  while ((match = scpNumberRe.exec(text)) !== null) {
    pushTtsNormalTextSegments(segments, text.slice(cursor, match.index));
    pushTtsScpDesignationSegments(segments, match[1]);
    cursor = match.index + match[0].length;
  }

  pushTtsNormalTextSegments(segments, text.slice(cursor), Math.max(0, Number(segment?.minGapAfterMs) || 0));
  return segments;
}

function splitTtsNormalSpeechSegments(text) {
  return splitSpeechTextSegments(normalizeTtsSpeechText(text, { preserveScpDesignation: true }))
    .flatMap(splitTtsNormalSegment);
}

function normalizeTtsFragmentSourceText(text) {
  return String(text || "")
    .replace(/\bHCZ\s*[-_#]?\s*(\d+(?:[-_]\d+)*)\b/gi, (_match, digits) => `HCZ ${digits.replace(/\D/g, "").split("").join(" ")}`)
    .replace(/\bT\s*[-–—]\s*(\d+)/gi, "T minus $1")
    .replace(/\bSite\s*[-–—]\s*(\d+)/gi, (_match, digits) => `Site ${digits.replace(/\D/g, "").split("").join(" ")}`)
    .replace(/\bC\.?\s*A\.?\s*S\.?\s*S\.?\s*I\.?\s*E\.?\b/gi, "Cassie");
}

function formatTtsFragmentToken(token) {
  const raw = String(token || "").trim();
  const normalized = normalizeName(raw);
  const alias = ttsFragmentTokenAliases.get(normalized);
  if (alias) return alias;
  return raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function formatTtsFragmentUnit(tokens) {
  return tokens
    .map(formatTtsFragmentToken)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeTtsUnit(text, source = "sentence", extra = {}) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) return null;
  const targetText = String(extra.targetText || cleanText).replace(/\s+/g, " ").trim();
  return {
    text: cleanText,
    targetText,
    displayText: targetText,
    source,
    ...extra,
  };
}

function makeTtsFragmentUnit(tokens, source = "lexicon-phrase", extra = {}) {
  const targetText = formatTtsFragmentUnit(tokens);
  return makeTtsUnit(targetText, source, {
    tokenCount: tokens.length,
    targetTokens: tokens,
    ...extra,
    targetText,
  });
}

function countTtsWords(text) {
  return splitPlainText(text)
    .filter((token) => /[a-z0-9]/i.test(token))
    .length;
}

function makeSentenceTtsUnit(segment) {
  const text = typeof segment === "string" ? segment : segment.text;
  return makeTtsUnit(text, "sentence", {
    wordGapSlots: Math.max(0, countTtsWords(text) - 1),
    minGapAfterMs: Math.max(0, Number(segment?.minGapAfterMs) || 0),
  });
}

function isScpDesignationPrefixPart(part) {
  return Boolean(part?.isScpDesignationPrefix);
}

function isScpDesignationDigitPart(part) {
  return Boolean(part?.isScpDesignationDigit);
}

function splitFallbackFragmentParts(parts) {
  if (parts.length <= 1) return [parts];

  const chunks = [];
  let index = 0;
  while (index < parts.length) {
    if (isScpDesignationPrefixPart(parts[index]) && isScpDesignationDigitPart(parts[index + 1])) {
      chunks.push([parts[index]]);
      index += 1;
      const digitStart = index;
      while (index < parts.length && isScpDesignationDigitPart(parts[index])) index += 1;
      chunks.push(parts.slice(digitStart, index));
      continue;
    }

    let end = Math.min(parts.length, index + TTS_FRAGMENT_AUTO_GROUP_MAX_TOKENS);
    for (let cursor = index; cursor < end - 1; cursor += 1) {
      if (tokenPartHasBoundaryAfter(parts[cursor])) {
        end = cursor + 1;
        break;
      }
    }

    while (
      end > index + 1
      && formatTtsFragmentUnit(tokenPartTokens(parts.slice(index, end))).length > TTS_FRAGMENT_AUTO_GROUP_MAX_CHARS
    ) {
      end -= 1;
    }

    if (parts.length - end === 1 && end - index > 2) end -= 1;
    chunks.push(parts.slice(index, end));
    index = end;
  }

  return chunks;
}

function buildTtsFragmentSpans(tokenParts, phraseCandidates) {
  const tokens = tokenPartTokens(tokenParts);
  const spans = [];
  let index = 0;
  while (index < tokens.length) {
    const phraseMatch = findPhraseClip(tokens, index, phraseCandidates, tokenParts);
    if (phraseMatch) {
      const phraseTokens = tokens.slice(index, index + phraseMatch.tokenCount);
      spans.push({
        type: "lexicon",
        tokens: phraseTokens,
        clipName: phraseMatch.clip?.name || "",
        minGapAfterMs: tokenPartMinGapAfterMs(tokenParts[index + phraseMatch.tokenCount - 1]),
      });
      index += phraseMatch.tokenCount;
      continue;
    }

    spans.push({
      type: "fallback",
      tokenPart: tokenParts[index],
      tokens: [tokens[index]],
      minGapAfterMs: tokenPartMinGapAfterMs(tokenParts[index]),
    });
    index += 1;
  }
  return spans;
}

function splitTtsFragmentSentences(text) {
  const normalized = normalizeTtsFragmentSourceText(text);
  return splitSpeechTextSegments(normalized)
    .map((segment) => tokenizeSentenceParts(segment.text))
    .filter((tokenParts) => tokenParts.length > 0);
}

function makeAutoFragmentUnit(chunk) {
  const source = chunk.length === 1 ? "auto-single" : "auto-group";
  return makeTtsFragmentUnit(chunk, source);
}

function applyUnitMinGap(unit, minGapAfterMs) {
  if (!unit || minGapAfterMs <= 0) return unit;
  unit.minGapAfterMs = Math.max(Number(unit.minGapAfterMs) || 0, minGapAfterMs);
  return unit;
}

function splitTtsFragmentSentenceUnits(tokenParts, phraseCandidates) {
  const spans = buildTtsFragmentSpans(tokenParts, phraseCandidates);
  const units = [];
  let index = 0;
  while (index < spans.length) {
    const span = spans[index];
    if (span.type === "lexicon") {
      units.push(applyUnitMinGap(
        makeTtsFragmentUnit(span.tokens, "lexicon-phrase", { clipName: span.clipName }),
        span.minGapAfterMs,
      ));
      index += 1;
      continue;
    }

    const fallbackParts = [];
    while (index < spans.length && spans[index].type === "fallback") {
      fallbackParts.push(spans[index].tokenPart);
      index += 1;
    }

    splitFallbackFragmentParts(fallbackParts).forEach((chunk) => {
      const tokens = tokenPartTokens(chunk);
      const unit = makeAutoFragmentUnit(tokens);
      units.push(applyUnitMinGap(unit, tokenPartMinGapAfterMs(chunk[chunk.length - 1])));
    });
  }

  return units.filter(Boolean);
}

function splitTtsFragmentUnits(text) {
  const sentences = splitTtsFragmentSentences(text);
  if (sentences.length === 0) return [];

  const phraseCandidates = state.clips.length === 0 ? [] : buildTextLookup().phraseCandidates;
  return sentences.flatMap((tokenParts) => splitTtsFragmentSentenceUnits(tokenParts, phraseCandidates));
}

function buildTtsUnits(rawText) {
  const mode = els.ttsGenerationMode.value || "normal";
  const unitItems = [];
  let pendingControls = [];
  parseCassieControlCommands(rawText).forEach((segment) => {
    pendingControls.push(...segment.controlsBefore);
    const inline = parseInlineTtsEffects(segment.text);
    const segmentUnits = mode === "fragment"
      ? splitTtsFragmentUnits(inline.text)
      : splitTtsNormalSpeechSegments(inline.text).map(makeSentenceTtsUnit);
    const attached = attachInlineTtsEffects(segmentUnits, inline.effects);
    if (attached.unmatched.length > 0) {
      throw new Error(`无法定位词内效果：${attached.unmatched.map((effect) => effect.rawWord).join("、")}`);
    }
    if (segmentUnits.length === 0) return;
    if (pendingControls.length > 0) {
      segmentUnits[0].controlsBefore = pendingControls;
      pendingControls = [];
    }
    unitItems.push(...segmentUnits);
  });

  if (pendingControls.length > 0 && unitItems.length > 0) {
    unitItems[unitItems.length - 1].controlsAfter = pendingControls;
  }
  return {
    mode,
    units: unitItems.filter(Boolean).map((unit, index) => ({ index, ...unit })),
  };
}

function ttsModeLabel(mode) {
  return mode === "fragment" ? "词库短语/自动短语" : "句段";
}

function getWindowMaxRms(buffer, start, end) {
  let maxRms = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      sum += data[i] * data[i];
    }
    maxRms = Math.max(maxRms, Math.sqrt(sum / Math.max(1, end - start)));
  }
  return maxRms;
}

function trimAudioBufferSilence(
  buffer,
  threshold = TTS_FRAGMENT_TRIM_THRESHOLD,
  leadingPaddingMs = TTS_FRAGMENT_LEADING_PADDING_MS,
  trailingPaddingMs = TTS_FRAGMENT_TRAILING_PADDING_MS,
) {
  const windowSize = Math.max(1, Math.round((TTS_FRAGMENT_TRIM_WINDOW_MS / 1000) * buffer.sampleRate));
  let firstAudible = buffer.length;
  let lastAudible = -1;

  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
    if (getWindowMaxRms(buffer, start, end) <= threshold) continue;
    if (start < firstAudible) firstAudible = start;
    lastAudible = end - 1;
  }

  if (lastAudible < firstAudible) return buffer;

  const leadingPadding = Math.round((leadingPaddingMs / 1000) * buffer.sampleRate);
  const trailingPadding = Math.round((trailingPaddingMs / 1000) * buffer.sampleRate);
  const start = Math.max(0, firstAudible - leadingPadding);
  const end = Math.min(buffer.length, lastAudible + trailingPadding + 1);
  if (start === 0 && end === buffer.length) return buffer;

  const trimmed = getAudioContext().createBuffer(
    buffer.numberOfChannels,
    Math.max(1, end - start),
    buffer.sampleRate,
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    trimmed.getChannelData(channel).set(buffer.getChannelData(channel).subarray(start, end));
  }

  return trimmed;
}

function prepareTtsFragmentPart(part) {
  return trimAudioBufferSilence(part.buffer);
}

function applyTtsInlineEffects(buffer, effects) {
  if (!effects?.length) return buffer;
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, index) => buffer.getChannelData(index),
  );
  const processed = applyInlineEffectsToChannels(channels, buffer.sampleRate, effects);
  return createBufferFromChannels(processed, buffer.sampleRate);
}

function findQuietWordBoundary(buffer, approximateSample, minSample, maxSample) {
  const windowSize = Math.max(1, Math.round((TTS_WORD_GAP_WINDOW_MS / 1000) * buffer.sampleRate));
  const searchRadius = Math.round((TTS_WORD_GAP_SEARCH_MS / 1000) * buffer.sampleRate);
  const startSample = clamp(approximateSample - searchRadius, minSample, maxSample);
  const endSample = clamp(approximateSample + searchRadius, startSample, maxSample);
  let bestSample = approximateSample;
  let bestRms = Number.POSITIVE_INFINITY;

  for (let start = startSample; start <= endSample; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
    const rms = getWindowMaxRms(buffer, start, end);
    if (rms < bestRms) {
      bestRms = rms;
      bestSample = Math.round((start + end) / 2);
    }
  }

  return clamp(bestSample, minSample, maxSample);
}

function findWordGapBoundaries(buffer, slotCount) {
  const minSpacingSamples = Math.round(0.12 * buffer.sampleRate);
  const maxSlotsByDuration = Math.max(0, Math.floor(buffer.duration / 0.16) - 1);
  const usableSlots = Math.min(Math.floor(slotCount), maxSlotsByDuration, 80);
  const boundaries = [];
  let previousBoundary = 0;

  for (let slot = 1; slot <= usableSlots; slot += 1) {
    const remainingSlots = usableSlots - slot;
    const approximate = Math.round((buffer.length * slot) / (usableSlots + 1));
    const minSample = Math.max(previousBoundary + minSpacingSamples, 1);
    const maxSample = Math.min(buffer.length - 1 - remainingSlots * minSpacingSamples, buffer.length - 1);
    if (minSample >= maxSample) break;

    const boundary = findQuietWordBoundary(buffer, approximate, minSample, maxSample);
    boundaries.push(boundary);
    previousBoundary = boundary;
  }

  return boundaries;
}

function applyFadeAroundInsertedGap(outputData, beforeGapEnd, afterGapStart, fadeSamples) {
  if (fadeSamples <= 1) return;

  const fadeOutStart = Math.max(0, beforeGapEnd - fadeSamples);
  for (let index = fadeOutStart; index < beforeGapEnd; index += 1) {
    outputData[index] *= clamp((beforeGapEnd - index) / fadeSamples, 0, 1);
  }

  const fadeInEnd = Math.min(outputData.length, afterGapStart + fadeSamples);
  for (let index = afterGapStart; index < fadeInEnd; index += 1) {
    outputData[index] *= clamp((index - afterGapStart) / fadeSamples, 0, 1);
  }
}

function insertWordGaps(buffer, slotCount, gapMs) {
  const gapSamples = Math.round((Math.max(0, gapMs) / 1000) * buffer.sampleRate);
  if (gapSamples <= 0 || slotCount <= 0) return buffer;

  const boundaries = findWordGapBoundaries(buffer, slotCount);
  if (boundaries.length === 0) return buffer;

  const fadeSamples = Math.min(
    Math.round((TTS_WORD_GAP_FADE_MS / 1000) * buffer.sampleRate),
    Math.floor(gapSamples / 2),
  );
  const output = getAudioContext().createBuffer(
    buffer.numberOfChannels,
    buffer.length + boundaries.length * gapSamples,
    buffer.sampleRate,
  );

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const inputData = buffer.getChannelData(channel);
    const outputData = output.getChannelData(channel);
    const gapEdges = [];
    let inputCursor = 0;
    let outputCursor = 0;

    boundaries.forEach((boundary) => {
      const segment = inputData.subarray(inputCursor, boundary);
      outputData.set(segment, outputCursor);
      const beforeGapEnd = outputCursor + segment.length;
      const afterGapStart = beforeGapEnd + gapSamples;
      outputCursor = afterGapStart;
      inputCursor = boundary;
      gapEdges.push({ beforeGapEnd, afterGapStart });
    });

    outputData.set(inputData.subarray(inputCursor), outputCursor);
    gapEdges.forEach(({ beforeGapEnd, afterGapStart }) => {
      applyFadeAroundInsertedGap(outputData, beforeGapEnd, afterGapStart, fadeSamples);
    });
  }

  return output;
}

function prepareTtsSentencePart(part, options) {
  const gapMs = Math.max(0, options.gapMs - options.overlapMs);
  return insertWordGaps(part.buffer, part.wordGapSlots || 0, gapMs);
}

function makeTtsRenderItem(buffer, part) {
  return {
    buffer,
    minGapAfterMs: Math.max(0, Number(part?.minGapAfterMs) || 0),
    controlsBefore: part?.controlsBefore || [],
    controlsAfter: part?.controlsAfter || [],
    inlineEffects: part?.inlineEffects || [],
  };
}

function normalizeTtsRenderItem(item) {
  return item?.buffer ? makeTtsRenderItem(item.buffer, item) : makeTtsRenderItem(item, {});
}

function prepareTtsRenderItemsForMode(parts, mode, options) {
  if (mode !== "fragment") {
    return parts.map((part) => {
      const effected = applyTtsInlineEffects(part.buffer, part.inlineEffects);
      return makeTtsRenderItem(prepareTtsSentencePart({ ...part, buffer: effected }, options), part);
    });
  }
  return parts.map((part) => {
    const trimmed = prepareTtsFragmentPart(part);
    return makeTtsRenderItem(applyTtsInlineEffects(trimmed, part.inlineEffects), part);
  });
}

function setTtsReadyState(isReady) {
  els.playTts.classList.toggle("is-ready", isReady);
}

function setTtsProgress(label, done = 0, total = 0, progress = null) {
  const ratio = progress ?? (total > 0 ? done / total : 0);
  els.ttsProgressLabel.textContent = label;
  els.ttsProgressCount.textContent = total > 0 ? `${done} / ${total}` : `${Math.round(clamp(ratio, 0, 1) * 100)}%`;
  els.ttsProgressBar.value = clamp(ratio, 0, 1);
}

function startTtsTimer() {
  if (state.tts.timerId) clearInterval(state.tts.timerId);
  state.tts.timerStartedAt = performance.now();
  state.tts.elapsedMs = 0;
  els.ttsRenderDuration.textContent = fmtSeconds(0);
  state.tts.timerId = setInterval(() => {
    state.tts.elapsedMs = performance.now() - state.tts.timerStartedAt;
    els.ttsRenderDuration.textContent = fmtSeconds(state.tts.elapsedMs / 1000);
  }, 100);
}

function stopTtsTimer() {
  if (state.tts.timerId) {
    clearInterval(state.tts.timerId);
    state.tts.timerId = null;
  }
  if (state.tts.timerStartedAt) {
    state.tts.elapsedMs = performance.now() - state.tts.timerStartedAt;
    els.ttsRenderDuration.textContent = fmtSeconds(state.tts.elapsedMs / 1000);
  }
  return state.tts.elapsedMs;
}

function ensureTtsWorker() {
  if (state.tts.worker) return state.tts.worker;

  const worker = new Worker(TTS_WORKER_URL, { type: "module" });
  worker.onmessage = handleTtsWorkerMessage;
  worker.onerror = (event) => {
    finishTtsJobWithError(state.tts.currentJobId, new Error(event.message || "TTS worker failed"));
  };
  state.tts.worker = worker;
  return worker;
}

function formatLoadedStatus(message) {
  const backend = String(message.backend || "unknown").toUpperCase();
  const dtype = message.dtype || "auto";
  const enabledVoices = message.enabledVoices || kokoroVoices;
  if (message.voices?.length) {
    const missingVoices = enabledVoices.filter((voice) => !message.voices.includes(voice));
    const suffix = missingVoices.length
      ? ` 未在模型列表中看到：${missingVoices.join(", ")}；仍保留选项，生成时以模型返回为准。`
      : ` 当前页面启用：${enabledVoices.join(", ")}。`;
    return `Kokoro 模型已加载（${backend} / ${dtype}），可用音色 ${message.voices.length} 个。${suffix}`;
  }
  return `Kokoro 模型已加载（${backend} / ${dtype}）。当前页面启用：${enabledVoices.join(", ")}。`;
}

function resolvePendingTtsJob(jobId, value) {
  const pending = state.tts.pendingJob;
  if (pending?.jobId === jobId) {
    pending.resolve(value);
    state.tts.pendingJob = null;
  }
}

function rejectPendingTtsJob(jobId, error) {
  const pending = state.tts.pendingJob;
  if (pending?.jobId === jobId) {
    pending.reject(error);
    state.tts.pendingJob = null;
  }
}

function resetTtsGenerationUi() {
  state.tts.isGenerating = false;
  setTtsBusy(false);
  els.stopTts.textContent = "停止";
}

function handleTtsWorkerMessage(event) {
  const message = event.data || {};
  if (message.jobId && message.jobId !== state.tts.currentJobId) return;

  switch (message.type) {
    case "backend": {
      if (message.stage === "fallback") {
        setTtsStatus(`WebGPU 加载失败，正在回退到 WASM / ${message.dtype}。`);
      } else {
        setTtsStatus(`正在加载 Kokoro 模型（${String(message.backend || "").toUpperCase()} / ${message.dtype}）。`);
      }
      break;
    }
    case "progress": {
      if (message.phase === "load") {
        setTtsProgress("正在下载 / 加载模型", 0, 0, message.progress || 0);
      } else if (message.phase === "generate") {
        const label = ttsModeLabel(message.mode);
        setTtsProgress(`正在生成 ${label}`, message.done || 0, message.total || 0);
      }
      break;
    }
    case "loaded": {
      state.tts.voices = message.voices || [];
      setTtsStatus(formatLoadedStatus(message));
      const pending = state.tts.pendingJob;
      if (pending?.kind === "load" && pending.jobId === message.jobId) {
        setTtsProgress("模型已加载", 1, 1);
        setTtsBusy(false);
        resolvePendingTtsJob(message.jobId, message);
      }
      break;
    }
    case "done": {
      finishGeneratedTtsJob(message).catch((error) => finishTtsJobWithError(message.jobId, error));
      break;
    }
    case "cancelled": {
      stopTtsTimer();
      resetTtsGenerationUi();
      setTtsReadyState(Boolean(state.tts.generatedBuffer) && !state.tts.generatedDirty);
      setTtsProgress("已停止生成", message.done || 0, message.total || 0);
      setTtsStatus("TTS 生成已停止；已保留上一次可播放结果。", "error");
      rejectPendingTtsJob(message.jobId, new Error("TTS generation cancelled"));
      break;
    }
    case "error": {
      finishTtsJobWithError(message.jobId, new Error(message.message || "TTS generation failed"));
      break;
    }
    default:
      break;
  }
}

async function finishGeneratedTtsJob(message) {
  const parts = [...(message.parts || [])].sort((a, b) => a.index - b.index);
  const isFragmentMode = message.mode === "fragment";
  setTtsProgress(isFragmentMode ? "正在裁剪并后处理自动短语音频" : "正在后处理音频", parts.length, parts.length);
  const decodedParts = [];
  for (const part of parts) {
    decodedParts.push({
      ...part,
      buffer: await getAudioContext().decodeAudioData(part.wav.slice(0)),
    });
  }

  if (message.jobId !== state.tts.currentJobId) return;

  const options = getTtsOptions();
  const preparedItems = prepareTtsRenderItemsForMode(decodedParts, message.mode, options);
  const buffer = await renderTtsPostProcessedBuffer(preparedItems, options);
  if (message.jobId !== state.tts.currentJobId) return;

  const elapsedMs = stopTtsTimer();
  state.tts.generatedBuffer = buffer;
  state.tts.generatedDirty = false;
  updateTtsDownload(buffer);
  drawTtsWaveform(buffer);
  setTtsReadyState(true);
  resetTtsGenerationUi();
  setTtsProgress("生成完成，可以播放", parts.length, parts.length);

  const modeLabel = ttsModeLabel(message.mode);
  const bgLabel = state.tts.lastBackgroundClip ? `，背景 ${state.tts.lastBackgroundClip.name}` : "";
  const lexiconCount = decodedParts.filter((part) => part.source === "lexicon-phrase").length;
  const autoGroupCount = decodedParts.filter((part) => String(part.source || "").startsWith("auto-group")).length;
  const autoSingleCount = decodedParts.filter((part) => String(part.source || "").startsWith("auto-single")).length;
  const wordGapCount = decodedParts.reduce((sum, part) => sum + (part.wordGapSlots || 0), 0);
  const controlCount = decodedParts.reduce(
    (sum, part) => sum + (part.controlsBefore?.length || 0) + (part.controlsAfter?.length || 0),
    0,
  );
  const inlineEffectCount = decodedParts.reduce((sum, part) => sum + (part.inlineEffects?.length || 0), 0);
  const trimLabel = isFragmentMode
    ? `，词库短语 ${lexiconCount}，自动短语 ${autoGroupCount}，落单词 ${autoSingleCount}，已剪裁短语首尾静音`
    : "";
  const wordGapLabel = !isFragmentMode && wordGapCount > 0 && options.gapMs > options.overlapMs
    ? `，句内词间隔 ${wordGapCount} 处`
    : "";
  const controlLabel = controlCount ? `，控制指令 ${controlCount} 个` : "";
  const inlineLabel = inlineEffectCount ? `，词内效果 ${inlineEffectCount} 个` : "";
  setTtsStatus(`TTS 生成完成：${els.ttsVoice.value}，${parts.length} 个${modeLabel}，音频 ${fmtSeconds(buffer.duration)}，耗时 ${fmtSeconds(elapsedMs / 1000)}，后端 ${String(message.backend || "").toUpperCase()} / ${message.dtype}${bgLabel}${trimLabel}${wordGapLabel}${controlLabel}${inlineLabel}。已应用间隔 ${options.gapMs}ms、提前播放 ${options.overlapMs}ms、延迟 ${options.voiceDelayMs}ms、语速 ${options.speedPercent}%、音高 ${options.pitchSemitones}、尾音混响 ${options.reverbLevel}。`);
  resolvePendingTtsJob(message.jobId, buffer);
}

function finishTtsJobWithError(jobId, error) {
  stopTtsTimer();
  resetTtsGenerationUi();
  setTtsProgress("生成失败", 0, 0);
  setTtsStatus(error.message || String(error), "error");
  rejectPendingTtsJob(jobId, error);
}

function queueTtsWorkerJob(kind, payload) {
  const jobId = ++state.tts.currentJobId;
  const promise = new Promise((resolve, reject) => {
    state.tts.pendingJob = { jobId, kind, resolve, reject };
  });
  ensureTtsWorker().postMessage({ ...payload, jobId });
  return { jobId, promise };
}

async function handleLoadTtsModel() {
  if (state.tts.isGenerating) return;

  setTtsReadyState(false);
  setTtsBusy(true);
  setTtsProgress("准备加载模型", 0, 0);
  setTtsStatus("正在准备 Kokoro 模型；自动模式会优先尝试 WebGPU。", "normal");
  const { promise } = queueTtsWorkerJob("load", {
    type: "load",
    settings: getTtsModelSettings(),
  });

  try {
    await promise;
  } catch {
    // The status panel already contains the concrete error.
  }
}

function normalizeTtsSpeechText(text, options = {}) {
  let normalized = String(text || "");
  if (!options.preserveScpDesignation) {
    normalized = normalized.replace(
      /\bSCP\s*[-_#]?\s*(\d+(?:[-_]\d+)*)\b/gi,
      (_match, digits) => `S C P ${digits.replace(/\D/g, "").split("").join(" ")}`,
    );
  }

  return normalized
    .replace(/\bHCZ\s*[-_#]?\s*(\d+)/gi, (_match, digits) => `H C Z ${digits.replace(/\D/g, "").split("").join(" ")}`)
    .replace(/\bLCZ\b/gi, "L C Z")
    .replace(/\bMTF\b/gi, "M T F")
    .replace(/\bNTF\b/gi, "N T F")
    .replace(/\bT\s*[-–—]\s*(\d+)/gi, "T minus $1")
    .replace(/\bSite\s*[-–—]\s*(\d+)/gi, (_match, digits) => `Site ${digits.split("").join(" ")}`)
    .replace(/\bC\.?\s*A\.?\s*S\.?\s*S\.?\s*I\.?\s*E\.?\b/gi, "Cassie");
}

async function renderTtsPostProcessedBuffer(rawItems, options) {
  const items = rawItems.map(normalizeTtsRenderItem);
  if (items.length === 0) throw new Error("TTS 文本为空");
  const timelineItems = [];
  for (const item of items) {
    for (const control of item.controlsBefore) {
      timelineItems.push(await prepareControlRenderItem(control));
    }
    timelineItems.push({ ...item, controlsBefore: [], controlsAfter: [] });
    for (const control of item.controlsAfter) {
      timelineItems.push(await prepareControlRenderItem(control));
    }
  }
  return renderSpeechTimeline(timelineItems, options, "tts", Math.pow(2, options.pitchSemitones / 12));
}

async function generateTtsPreview() {
  if (state.tts.isGenerating) return state.tts.pendingJob?.promise;

  const rawText = els.ttsInput.value.trim();
  if (!rawText) {
    const error = new Error("TTS 文本为空");
    setTtsStatus(error.message, "error");
    throw error;
  }

  let mode, units;
  try {
    ({ mode, units } = buildTtsUnits(rawText));
  } catch (error) {
    setTtsStatus(error.message, "error");
    throw error;
  }
  if (units.length === 0) {
    const error = new Error("TTS 文本没有可生成的句段或自动短语");
    setTtsStatus(error.message, "error");
    throw error;
  }

  stopCurrentSource();
  setTtsReadyState(false);
  state.tts.isGenerating = true;
  setTtsBusy(true, { allowCancel: true });
  startTtsTimer();
  setTtsProgress(`准备生成 ${ttsModeLabel(mode)}`, 0, units.length);
  setTtsStatus(`正在使用 ${els.ttsVoice.value} 生成 ${units.length} 个${ttsModeLabel(mode)}；自动模式会优先尝试 WebGPU。`);

  const speed = clamp(Number(els.ttsSpeedPercent.value) || 100, 10, 400) / 100;
  const { promise } = queueTtsWorkerJob("generate", {
    type: "generate",
    settings: getTtsModelSettings(),
    voice: els.ttsVoice.value || kokoroVoices[0],
    speed,
    mode,
    units,
  });

  return promise;
}

async function playTtsAudio() {
  try {
    const buffer = state.tts.generatedDirty || !state.tts.generatedBuffer
      ? await generateTtsPreview()
      : state.tts.generatedBuffer;

    if (!buffer) return;
    await playBuffer(buffer, "tts", getPlaybackStartOffset("tts", buffer));
    setTtsStatus("正在播放 Kokoro TTS 音频。");
  } catch {
    // generateTtsPreview already reported the concrete error.
  }
}

function cancelTtsGeneration() {
  if (!state.tts.isGenerating) return false;
  ensureTtsWorker().postMessage({ type: "cancel", jobId: state.tts.currentJobId });
  setTtsStatus("正在停止生成；会在当前句段或自动短语完成后结束。", "error");
  setTtsProgress("正在停止生成", 0, 0);
  return true;
}

function stopTtsAudio() {
  if (cancelTtsGeneration()) return;
  stopCurrentSource();
  setTtsStatus("停止播放。");
}

// Export and waveform drawing
function encodeWav(buffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  writeString(view, offset, "RIFF"); offset += 4;
  view.setUint32(offset, 36 + dataLength, true); offset += 4;
  writeString(view, offset, "WAVE"); offset += 4;
  writeString(view, offset, "fmt "); offset += 4;
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString(view, offset, "data"); offset += 4;
  view.setUint32(offset, dataLength, true); offset += 4;

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(channelData[channel][i], -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function drawEmptyWaveformFor(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#080809";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#3c3d41";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

function getWaveformPeaks(buffer, width) {
  let cacheByWidth = waveformPeakCache.get(buffer);
  if (!cacheByWidth) {
    cacheByWidth = new Map();
    waveformPeakCache.set(buffer, cacheByWidth);
  }
  if (cacheByWidth.has(width)) return cacheByWidth.get(width);

  const mins = new Float32Array(width);
  const maxs = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const start = Math.floor((x / width) * buffer.length);
    const end = Math.min(buffer.length, Math.max(start + 1, Math.floor(((x + 1) / width) * buffer.length)));
    let min = 1;
    let max = -1;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = start; i < end; i += 1) {
        const sample = data[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }
    mins[x] = min === 1 ? 0 : min;
    maxs[x] = max === -1 ? 0 : max;
  }

  const peaks = { mins, maxs };
  cacheByWidth.set(width, peaks);
  return peaks;
}

function strokeWaveformPeaks(ctx, peaks, width, height, color, alpha = 1) {
  const mid = height / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    ctx.moveTo(x, mid + peaks.mins[x] * mid * 0.86);
    ctx.lineTo(x, mid + peaks.maxs[x] * mid * 0.86);
  }
  ctx.stroke();
  ctx.restore();
}

function drawWaveformFor(canvas, buffer, color = "#d8d2c7", progress = 0) {
  if (!canvas || !buffer) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const peaks = getWaveformPeaks(buffer, width);
  const playhead = clamp(Number(progress) || 0, 0, 1) * width;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#080809";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(216, 210, 199, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  strokeWaveformPeaks(ctx, peaks, width, height, color, 0.34);

  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, playhead, height);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, playhead, height);
  ctx.clip();
  strokeWaveformPeaks(ctx, peaks, width, height, color, 1);
  ctx.restore();

  const lineX = Math.max(0, Math.min(width, playhead));
  const handleX = clamp(lineX, 5, width - 5);
  ctx.strokeStyle = "#f2eadc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lineX, 0);
  ctx.lineTo(lineX, height);
  ctx.stroke();
  ctx.fillStyle = "#f2eadc";
  ctx.beginPath();
  ctx.arc(handleX, height / 2, 5, 0, Math.PI * 2);
  ctx.fill();
}

function updateWaveformAria(mode, progress = 0, buffer = getGeneratedBuffer(mode)) {
  const canvas = getWaveformCanvas(mode);
  if (!canvas) return;
  const ratio = clamp(Number(progress) || 0, 0, 1);
  const duration = buffer?.duration || 0;
  canvas.setAttribute("aria-valuemin", "0");
  canvas.setAttribute("aria-valuemax", "100");
  canvas.setAttribute("aria-valuenow", String(Math.round(ratio * 100)));
  canvas.setAttribute("aria-valuetext", `${fmtSeconds(duration * ratio)} / ${fmtSeconds(duration)}`);
  canvas.title = duration
    ? `拖动或点击跳转：${fmtSeconds(duration * ratio)} / ${fmtSeconds(duration)}`
    : "生成音频后可拖动或点击跳转";
}

function drawEmptyWaveform() {
  drawEmptyWaveformFor(els.waveform);
  state.playback.progressByMode.cassie = 0;
  updateWaveformAria("cassie", 0, null);
}

function drawTtsEmptyWaveform() {
  drawEmptyWaveformFor(els.ttsWaveform);
  state.playback.progressByMode.tts = 0;
  updateWaveformAria("tts", 0, null);
}

function drawWaveform(buffer) {
  state.playback.progressByMode.cassie = 0;
  drawWaveformFor(els.waveform, buffer, waveformColors.cassie, 0);
  updateWaveformAria("cassie", 0, buffer);
}

function drawTtsWaveform(buffer) {
  state.playback.progressByMode.tts = 0;
  drawWaveformFor(els.ttsWaveform, buffer, waveformColors.tts, 0);
  updateWaveformAria("tts", 0, buffer);
}

function getCanvasProgressFromPointer(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return 0;
  return clamp((event.clientX - rect.left) / rect.width, 0, 1);
}

function reportPlaybackError(mode, error) {
  const message = error?.message || String(error);
  if (mode === "tts") {
    setTtsStatus(message, "error");
  } else {
    setStatus(message, "error");
  }
}

function announceWaveformSeek(mode, progress) {
  const buffer = getGeneratedBuffer(mode);
  if (!buffer?.duration) return;
  const message = `播放位置：${fmtSeconds(buffer.duration * progress)} / ${fmtSeconds(buffer.duration)}。`;
  if (mode === "tts") {
    setTtsStatus(message);
  } else {
    setStatus(message);
  }
}

function seekWaveform(mode, progress, options = {}) {
  const buffer = getGeneratedBuffer(mode);
  if (!buffer) return;
  const nextProgress = clamp(Number(progress) || 0, 0, 1);
  renderWaveformProgress(mode, nextProgress);
  if (options.resume && nextProgress < 0.995) {
    playBuffer(buffer, mode, nextProgress * buffer.duration).catch((error) => reportPlaybackError(mode, error));
    return;
  }
  announceWaveformSeek(mode, nextProgress);
}

function setWaveformPointerCapture(canvas, pointerId, shouldCapture) {
  try {
    if (shouldCapture) {
      canvas.setPointerCapture?.(pointerId);
    } else {
      canvas.releasePointerCapture?.(pointerId);
    }
  } catch {
    // Synthetic pointer events and some browser edge cases do not own capture.
  }
}

function bindWaveformScrubber(canvas, mode) {
  if (!canvas) return;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "slider");

  canvas.addEventListener("pointerdown", (event) => {
    if (!getGeneratedBuffer(mode)) return;
    event.preventDefault();
    canvas.focus();
    const wasPlaying = isModePlaying(mode);
    if (state.currentSource) stopCurrentSource();
    state.playback.dragMode = mode;
    state.playback.dragPointerId = event.pointerId;
    state.playback.dragWasPlaying = wasPlaying;
    setWaveformPointerCapture(canvas, event.pointerId, true);
    renderWaveformProgress(mode, getCanvasProgressFromPointer(canvas, event));
  });

  canvas.addEventListener("pointermove", (event) => {
    if (state.playback.dragMode !== mode || state.playback.dragPointerId !== event.pointerId) return;
    event.preventDefault();
    renderWaveformProgress(mode, getCanvasProgressFromPointer(canvas, event));
  });

  canvas.addEventListener("pointerup", (event) => {
    if (state.playback.dragMode !== mode || state.playback.dragPointerId !== event.pointerId) return;
    event.preventDefault();
    const shouldResume = state.playback.dragWasPlaying;
    const progress = getCanvasProgressFromPointer(canvas, event);
    state.playback.dragMode = null;
    state.playback.dragPointerId = null;
    state.playback.dragWasPlaying = false;
    setWaveformPointerCapture(canvas, event.pointerId, false);
    seekWaveform(mode, progress, { resume: shouldResume });
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (state.playback.dragMode !== mode || state.playback.dragPointerId !== event.pointerId) return;
    state.playback.dragMode = null;
    state.playback.dragPointerId = null;
    state.playback.dragWasPlaying = false;
    setWaveformPointerCapture(canvas, event.pointerId, false);
  });

  canvas.addEventListener("keydown", (event) => {
    const buffer = getGeneratedBuffer(mode);
    if (!buffer?.duration) return;

    const currentOffset = getPlaybackProgress(mode) * buffer.duration;
    const step = event.shiftKey ? 1 : 5;
    let nextOffset = currentOffset;
    if (event.key === "ArrowLeft") nextOffset = currentOffset - step;
    if (event.key === "ArrowRight") nextOffset = currentOffset + step;
    if (event.key === "Home") nextOffset = 0;
    if (event.key === "End") nextOffset = buffer.duration;
    if (nextOffset === currentOffset) return;

    event.preventDefault();
    const progress = clamp(nextOffset / buffer.duration, 0, 1);
    seekWaveform(mode, progress, { resume: isModePlaying(mode) });
  });
}

// UI state and event binding
function bindSpeechControls() {
  document.querySelectorAll("[data-speech-controls]").forEach((container) => {
    const target = document.getElementById(container.dataset.speechControls);
    const helpId = `speech-command-help-${target.id}`;
    const helpTitleId = `${helpId}-title`;
    container.innerHTML = `
      <div class="speech-control-type">
        <label><span>语法快捷插入</span><select data-speech-command-control aria-label="播报指令类型">
          <option value="SLEEP">停顿</option>
          <option value="GLITCH">故障音覆盖</option>
          <option value="COMMENT">注释</option>
        </select></label>
        <button class="speech-help-trigger" type="button" title="查看播报指令说明" aria-label="查看播报指令说明" aria-expanded="false" aria-controls="${helpId}">?</button>
        <section class="speech-command-popover" id="${helpId}" role="dialog" aria-labelledby="${helpTitleId}" hidden>
          <header>
            <div>
              <strong id="${helpTitleId}">播报指令说明</strong>
              <small>仅写在 <code>#{...}</code> 内时生效</small>
            </div>
            <button class="speech-help-close" type="button" title="关闭说明" aria-label="关闭播报指令说明">×</button>
          </header>
          <div class="speech-help-section">
            <b>通用命令</b>
            <dl>
              <dt><code>#{$SLEEP_500}</code></dt>
              <dd>停顿 500ms，可填写 0–10000ms。</dd>
              <dt><code>#{$G_3,G_1,G_3}</code></dt>
              <dd>按顺序叠加故障音，不占用语音时间线；可用 G_1 至 G_6，可重复。</dd>
              <dt><code>#{#编辑备注}</code></dt>
              <dd>整段注释直接丢弃，不参与匹配、朗读或后处理。</dd>
            </dl>
          </div>
          <div class="speech-help-section">
            <b>TTS 词内效果</b>
            <dl>
              <dt><code>#{brea-a-a-a-ch}</code></dt>
              <dd>在原本的 a 处卡顿；3 个额外 a 表示卡顿 3 次。</dd>
              <dt><code>#{containm--ent}</code></dt>
              <dd>拖长连字符前的音素；连续连字符越多，拖音越长。</dd>
              <dt><code>#{det_det_det_detected}</code></dt>
              <dd>最后一段是完整单词，前面各段必须是它的前缀；生成 det det det detected。</dd>
              <dt><code>#{detected_detected_detected_detected}</code></dt>
              <dd>前置段可以等于完整单词；此例完整复读 detected 4 次。</dd>
            </dl>
          </div>
        </section>
      </div>
      <label><span data-unit>时长 ms</span><input data-speech-command-control type="number" aria-label="指令参数" min="0" max="10000" step="10" value="500"></label>
      <button class="speech-insert-button" data-speech-command-control type="button" title="在光标处插入指令" aria-label="在光标处插入指令">+</button>
      <small class="speech-control-help">可用故障音：G_1、G_2、G_3、G_4、G_5、G_6；可按任意顺序组合或重复。</small>
    `;
    const select = container.querySelector("select");
    const input = container.querySelector("input");
    const valueLabel = container.querySelector("[data-unit]");
    const helpRoot = container.querySelector(".speech-control-type");
    const helpButton = container.querySelector(".speech-help-trigger");
    const helpPanel = container.querySelector(".speech-command-popover");
    const closeHelpButton = container.querySelector(".speech-help-close");
    const setHelpOpen = (isOpen, restoreFocus = false) => {
      helpPanel.hidden = !isOpen;
      helpButton.setAttribute("aria-expanded", String(isOpen));
      if (isOpen) closeHelpButton.focus();
      else if (restoreFocus) helpButton.focus();
    };
    helpButton.addEventListener("click", () => setHelpOpen(helpPanel.hidden));
    closeHelpButton.addEventListener("click", () => setHelpOpen(false, true));
    document.addEventListener("click", (event) => {
      if (!helpPanel.hidden && !helpRoot.contains(event.target)) setHelpOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !helpPanel.hidden) setHelpOpen(false, true);
    });
    select.addEventListener("change", () => {
      const isGlitch = select.value === "GLITCH";
      const isComment = select.value === "COMMENT";
      const usesText = isGlitch || isComment;
      valueLabel.textContent = isGlitch ? "音频序列" : (isComment ? "注释内容" : "时长 ms");
      input.type = usesText ? "text" : "number";
      input.value = isGlitch ? "G_1,G_2,G_3,G_4,G_5,G_6" : (isComment ? "注释内容" : "500");
      input.min = usesText ? "" : "0";
      input.max = usesText ? "" : "10000";
      input.step = usesText ? "" : "10";
      input.required = isGlitch;
      input.pattern = isGlitch ? "G_[1-6](\\s*,\\s*G_[1-6])*" : "";
      input.title = isGlitch ? "使用 G_1 到 G_6，并以英文逗号分隔" : "";
    });
    container.querySelector(".speech-insert-button").addEventListener("click", () => {
      if (!input.reportValidity()) return;
      const command = select.value === "GLITCH"
        ? `#{${"$"}${input.value.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean).join(",")}}`
        : (select.value === "COMMENT"
          ? `#{#${input.value.replace(/[{}\r\n]/g, " ")}}`
          : `#{${"$"}SLEEP_${Number(input.value) || 0}}`);
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const leading = start > 0 && !/\s/.test(target.value[start - 1]) ? " " : "";
      const trailing = !/\s/.test(target.value[end] || "") ? " " : "";
      target.setRangeText(`${leading}${command}${trailing}`, start, end, "end");
      target.focus();
      if (target === els.textInput) applyTextToSentence();
      else markTtsDirty();
    });
  });
}

function setBusy(isBusy) {
  [els.generatePreview, els.playAudio, els.applyText, els.applyTemplate, els.reloadAssets].forEach((el) => {
    el.disabled = isBusy;
  });
  document.querySelectorAll('[data-speech-controls="textInput"] [data-speech-command-control]').forEach((el) => { el.disabled = isBusy; });
}

function setTtsBusy(isBusy, options = {}) {
  const allowCancel = Boolean(options.allowCancel);
  [
    els.loadTtsModel,
    els.generateTts,
    els.playTts,
    els.applyTtsTemplate,
    els.ttsVoice,
    els.ttsModel,
    els.ttsBackend,
    els.ttsDtype,
    els.ttsGenerationMode,
    els.ttsTemplate,
    els.ttsInput,
    els.ttsGapMs,
    els.ttsOverlapMs,
    els.ttsVoiceDelayMs,
    els.ttsSpeedPercent,
    els.ttsPitchSemitones,
    els.ttsReverbLevel,
    els.ttsEnableBackground,
    els.ttsBackgroundGain,
  ].forEach((el) => {
    if (el) el.disabled = isBusy;
  });

  els.stopTts.disabled = isBusy ? !allowCancel : false;
  els.stopTts.textContent = isBusy && allowCancel ? "停止生成" : "停止";

  els.ttsTemplateFields.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = isBusy;
  });
  document.querySelectorAll('[data-speech-controls="ttsInput"] [data-speech-command-control]').forEach((el) => { el.disabled = isBusy; });
}

function switchMode(mode) {
  const nextMode = mode === "tts" ? "tts" : "cassie";
  state.activeMode = nextMode;
  stopCurrentSource();

  els.cassieWorkspace.classList.toggle("is-hidden", nextMode !== "cassie");
  els.ttsWorkspace.classList.toggle("is-hidden", nextMode !== "tts");

  els.modeCassie.classList.toggle("is-active", nextMode === "cassie");
  els.modeTts.classList.toggle("is-active", nextMode === "tts");
  els.modeCassie.setAttribute("aria-pressed", String(nextMode === "cassie"));
  els.modeTts.setAttribute("aria-pressed", String(nextMode === "tts"));
  document.body.dataset.mode = nextMode;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bindEvents() {
  bindSpeechControls();
  bindWaveformScrubber(els.waveform, "cassie");
  bindWaveformScrubber(els.ttsWaveform, "tts");

  els.modeCassie.addEventListener("click", () => switchMode("cassie"));
  els.modeTts.addEventListener("click", () => switchMode("tts"));
  els.reloadAssets.addEventListener("click", loadManifest);
  els.wordSearch.addEventListener("input", renderWordList);
  els.clearSentence.addEventListener("click", clearSentence);
  els.applyText.addEventListener("click", applyTextToSentence);
  els.announcementTemplate.addEventListener("change", renderTemplateFields);
  els.applyTemplate.addEventListener("click", applyAnnouncementTemplate);
  els.ttsTemplate.addEventListener("change", renderTtsTemplateFields);
  els.applyTtsTemplate.addEventListener("click", applyTtsTemplate);
  els.ttsInput.addEventListener("input", markTtsDirty);
  els.ttsVoice.addEventListener("change", markTtsDirty);
  els.ttsModel.addEventListener("input", markTtsDirty);
  els.ttsModel.addEventListener("change", reloadTtsModelOnNextUse);
  els.ttsBackend.addEventListener("change", reloadTtsModelOnNextUse);
  els.ttsDtype.addEventListener("change", reloadTtsModelOnNextUse);
  els.ttsGenerationMode.addEventListener("change", markTtsDirty);
  els.loadTtsModel.addEventListener("click", handleLoadTtsModel);
  els.generateTts.addEventListener("click", () => {
    generateTtsPreview().catch(() => {
      // The TTS status panel already contains the concrete error.
    });
  });
  els.playTts.addEventListener("click", playTtsAudio);
  els.stopTts.addEventListener("click", stopTtsAudio);
  els.sampleOne.addEventListener("click", () => {
    els.textInput.value = "SCP-999 contained successfully";
    applyTextToSentence();
  });
  els.sampleTwo.addEventListener("click", () => {
    els.textInput.value = "mobile task force unit epsilon eleven designated nine tailed fox";
    applyTextToSentence();
  });
  els.generatePreview.addEventListener("click", () => {
    generatePreview().catch(() => { /* The status panel contains the error. */ });
  });
  els.playAudio.addEventListener("click", playAudio);
  els.stopAudio.addEventListener("click", stopAudio);
  els.backgroundGain.addEventListener("input", () => {
    els.backgroundGainValue.textContent = `${els.backgroundGain.value}%`;
    markDirty();
  });
  els.ttsBackgroundGain.addEventListener("input", () => {
    els.ttsBackgroundGainValue.textContent = `${els.ttsBackgroundGain.value}%`;
    markTtsDirty();
  });

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segment").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.category = button.dataset.category;
      renderWordList();
    });
  });

  [
    els.gapMs,
    els.overlapMs,
    els.voiceDelayMs,
    els.speedPercent,
    els.pitchSemitones,
    els.reverbLevel,
    els.enableBackground,
  ].forEach((control) => {
    control.addEventListener("input", markDirty);
    control.addEventListener("change", markDirty);
  });

  [
    els.ttsGapMs,
    els.ttsOverlapMs,
    els.ttsVoiceDelayMs,
    els.ttsSpeedPercent,
    els.ttsPitchSemitones,
    els.ttsReverbLevel,
    els.ttsEnableBackground,
  ].forEach((control) => {
    control.addEventListener("input", markTtsDirty);
    control.addEventListener("change", markTtsDirty);
  });
}

renderAnnouncementTemplates();
renderTtsTemplates();
bindEvents();
drawEmptyWaveform();
drawTtsEmptyWaveform();
switchMode("cassie");
loadManifest().catch((error) => {
  const extra = location.protocol === "file:"
    ? "请通过本地 HTTP 服务打开，例如 python -m http.server 5173。"
    : "";
  setStatus(`${error.message || error}。${extra}`, "error");
});

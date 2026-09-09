const state = {
  manifest: null,
  clips: [],
  words: [],
  phrases: [],
  backgrounds: [],
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
  tts: {
    engine: null,
    voices: [],
    generatedBuffer: null,
    generatedBlobUrl: null,
    generatedDirty: true,
    modelPromise: null,
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
  ttsGapMs: document.querySelector("#ttsGapMs"),
  ttsOverlapMs: document.querySelector("#ttsOverlapMs"),
  ttsVoiceDelayMs: document.querySelector("#ttsVoiceDelayMs"),
  ttsSpeedPercent: document.querySelector("#ttsSpeedPercent"),
  ttsPitchSemitones: document.querySelector("#ttsPitchSemitones"),
  ttsReverbLevel: document.querySelector("#ttsReverbLevel"),
  loadTtsModel: document.querySelector("#loadTtsModel"),
  generateTts: document.querySelector("#generateTts"),
  playTts: document.querySelector("#playTts"),
  stopTts: document.querySelector("#stopTts"),
  downloadTts: document.querySelector("#downloadTts"),
  ttsWaveform: document.querySelector("#ttsWaveform"),
  ttsRenderDuration: document.querySelector("#ttsRenderDuration"),
  ttsStatus: document.querySelector("#ttsStatus"),
};

const textSplitRe = /[ ,.!?\r\n;:\t，。！？；：、]+/g;
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
const phraseClipAliases = [
  { phrase: "detonation sequence cancelled", clipName: "cancelled" },
  { phrase: "detonation sequence canceled", clipName: "cancelled" },
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const fmtSeconds = (seconds) => `${seconds.toFixed(2).padStart(5, "0")}s`;
const KOKORO_IMPORT_URL = "https://cdn.jsdelivr.net/npm/kokoro-js/+esm";
const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const kokoroVoices = ["am_michael", "bm_daniel", "am_adam"];
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
    template: "Danger, Light Containment Zone overall decontamination in T-30 seconds. All checkpoint doors have been permanently opened. Please evacuate immediately.",
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
    id: "tts-glados",
    title: "自定义示例：GLaDOS",
    template: "Oh, it's you.",
    fields: [],
  },
];

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
}

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

function tokenizeSentenceText(text) {
  const tokens = [];
  const normalizedText = normalizeSentenceInput(text);
  let cursor = 0;
  let match;

  scpNumberRe.lastIndex = 0;
  while ((match = scpNumberRe.exec(normalizedText)) !== null) {
    tokens.push(...splitPlainText(normalizedText.slice(cursor, match.index)));
    tokens.push("SCP", ...match[1].replace(/\D/g, "").split(""));
    cursor = match.index + match[0].length;
  }

  tokens.push(...splitPlainText(normalizedText.slice(cursor)));
  return tokens;
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

function findPhraseClip(tokens, startIndex, phraseCandidates) {
  for (const candidate of phraseCandidates) {
    for (const tokenCount of candidate.tokenCounts) {
      if (tokenCount > tokens.length - startIndex) continue;

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

  els.assetCount.textContent = `${state.manifest.counts.total} clips / ${state.manifest.counts.word} words`;
  els.libraryMeta.textContent = `${state.manifest.counts.word} 词 · ${state.manifest.counts.phrase} 公告 · ${state.manifest.counts.background} BG`;
  setStatus("词库就绪。默认语音延迟 3000ms，尾音混响 60；背景会按语句时长匹配 BG_4~BG_40。");
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
  els.sentenceMeta.textContent = `${state.selected.length} clips`;
  const fragment = document.createDocumentFragment();

  state.selected.forEach((clip, index) => {
    const item = document.createElement("li");
    item.className = "sentence-item";
    item.innerHTML = `
      <span class="sentence-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="sentence-name" title="${escapeHtml(clip.name)}">${escapeHtml(clip.name)}</span>
      <span class="item-tools">
        <button type="button" data-action="up" aria-label="Move ${escapeHtml(clip.name)} up">↑</button>
        <button type="button" data-action="down" aria-label="Move ${escapeHtml(clip.name)} down">↓</button>
        <button type="button" data-action="remove" aria-label="Remove ${escapeHtml(clip.name)}">×</button>
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
  state.selected.push(clip);
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
  const { byName, phraseCandidates } = buildTextLookup();
  const tokens = tokenizeSentenceText(els.textInput.value);

  const picked = [];
  const missing = [];
  let index = 0;
  while (index < tokens.length) {
    const phraseMatch = findPhraseClip(tokens, index, phraseCandidates);
    if (phraseMatch) {
      picked.push(phraseMatch.clip);
      index += phraseMatch.tokenCount;
      continue;
    }

    const token = tokens[index];
    const clip = resolveClipForToken(token, tokens[index + 1], byName, tokens[index - 1]);
    if (clip) picked.push(clip);
    else missing.push(token);
    index += 1;
  }

  state.selected = picked;
  els.missingTokens.textContent = missing.length ? `未匹配：${missing.join(", ")}` : "";
  markDirty();
  renderSentence();
}

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

function getBackgroundClip(targetSeconds) {
  if (state.backgrounds.length === 0) return null;

  const target = clamp(Math.ceil(targetSeconds), 4, 40);
  const direct = state.backgrounds.find((clip) => getBackgroundSeconds(clip) === target);
  if (direct) return direct;

  return state.backgrounds.reduce((best, clip) => {
    const currentDiff = Math.abs(getBackgroundSeconds(clip) - target);
    const bestDiff = Math.abs(getBackgroundSeconds(best) - target);
    return currentDiff < bestDiff ? clip : best;
  }, state.backgrounds[0]);
}

async function renderAudioBuffer() {
  if (state.selected.length === 0) {
    throw new Error("句子队列为空");
  }

  const options = getOptions();
  const resampleFactor = Math.max(0.1, options.speedPercent / 100) * Math.pow(2, options.pitchSemitones / 12);
  const effectiveGap = Math.max(0, options.gapMs - options.overlapMs) / 1000;
  const decodedWords = await Promise.all(state.selected.map((clip) => decodeClip(clip)));
  const sampleRate = 44100;
  const outputChannels = options.enableBackground ? 2 : 1;

  let speechEndSeconds = options.voiceDelayMs / 1000;
  decodedWords.forEach((buffer, index) => {
    speechEndSeconds += buffer.duration / resampleFactor;
    if (index !== decodedWords.length - 1) speechEndSeconds += effectiveGap;
  });

  let backgroundBuffer = null;
  state.lastBackgroundClip = null;
  if (options.enableBackground) {
    state.lastBackgroundClip = getBackgroundClip(speechEndSeconds);
    if (state.lastBackgroundClip) {
      backgroundBuffer = await decodeClip(state.lastBackgroundClip);
    }
  }

  const totalSeconds = Math.max(0.25, speechEndSeconds, backgroundBuffer?.duration || 0);
  const offline = createOfflineContext(outputChannels, Math.ceil(totalSeconds * sampleRate), sampleRate);

  if (backgroundBuffer) {
    const bgSource = offline.createBufferSource();
    const bgGain = offline.createGain();
    bgSource.buffer = backgroundBuffer;
    bgGain.gain.value = options.backgroundGain;
    bgSource.connect(bgGain).connect(offline.destination);
    bgSource.start(0);
  }

  let cursor = options.voiceDelayMs / 1000;
  decodedWords.forEach((buffer, index) => {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = resampleFactor;
    source.connect(offline.destination);
    source.start(cursor);
    cursor += buffer.duration / resampleFactor;
    if (index !== decodedWords.length - 1) cursor += effectiveGap;
  });

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
    setBusy(true);
    setStatus("正在预生成音频");
    const buffer = await renderAudioBuffer();
    state.generatedBuffer = buffer;
    state.generatedDirty = false;
    updateDownload(buffer);
    drawWaveform(buffer);
    els.renderDuration.textContent = fmtSeconds(buffer.duration);
    const bgLabel = state.lastBackgroundClip ? `，背景 ${state.lastBackgroundClip.name}` : "";
    setStatus(`预生成完成：${state.selected.length} 个片段，${fmtSeconds(buffer.duration)}${bgLabel}。`);
    return buffer;
  } catch (error) {
    setStatus(error.message || String(error), "error");
    throw error;
  } finally {
    setBusy(false);
  }
}

function stopCurrentSource() {
  if (state.currentSource) {
    try {
      state.currentSource.stop();
    } catch {
      // Source may already have ended.
    }
    state.currentSource.disconnect();
    state.currentSource = null;
  }
}

async function playBuffer(buffer) {
  const context = getAudioContext();
  if (context.state === "suspended") await context.resume();

  stopCurrentSource();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (state.currentSource === source) state.currentSource = null;
  };
  state.currentSource = source;
  source.start();
}

async function playAudio() {
  try {
    const buffer = state.generatedDirty || !state.generatedBuffer
      ? await generatePreview()
      : state.generatedBuffer;

    await playBuffer(buffer);
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

function normalizeKokoroVoiceList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((voice) => typeof voice === "string");
  if (value instanceof Map) return [...value.keys()].filter((voice) => typeof voice === "string");
  if (typeof value === "object") {
    const nestedVoices = value.voices || value.voiceIds || value.voice_ids || value.names;
    if (nestedVoices) return normalizeKokoroVoiceList(nestedVoices);
    return Object.keys(value).filter((voice) => /^[a-z]{2}_[a-z0-9_]+$/i.test(voice));
  }
  return [];
}

async function loadKokoroModel() {
  if (state.tts.engine) return state.tts.engine;

  if (!state.tts.modelPromise) {
    state.tts.modelPromise = (async () => {
      setTtsStatus("正在加载 Kokoro 82M q8 / WASM 模型，首次运行需要下载模型文件。");
      const { KokoroTTS } = await import(KOKORO_IMPORT_URL);
      const engine = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: "q8",
        device: "wasm",
      });
      state.tts.engine = engine;
      const listedVoices = typeof engine.list_voices === "function" ? await engine.list_voices() : [];
      state.tts.voices = normalizeKokoroVoiceList(listedVoices);
      if (state.tts.voices.length > 0) {
        const missingVoices = kokoroVoices.filter((voice) => !state.tts.voices.includes(voice));
        const suffix = missingVoices.length
          ? ` 未在模型列表中看到：${missingVoices.join(", ")}；仍保留选项，生成时以模型返回为准。`
          : ` 当前页面启用：${kokoroVoices.join(", ")}。`;
        setTtsStatus(`Kokoro 模型已加载，可用音色 ${state.tts.voices.length} 个。${suffix}`);
      } else {
        setTtsStatus(`Kokoro 模型已加载。当前页面启用：${kokoroVoices.join(", ")}。`);
      }
      return engine;
    })().catch((error) => {
      state.tts.modelPromise = null;
      throw error;
    });
  }

  return state.tts.modelPromise;
}

async function handleLoadTtsModel() {
  try {
    setTtsBusy(true);
    await loadKokoroModel();
  } catch (error) {
    setTtsStatus(`Kokoro 模型加载失败：${error.message || error}`, "error");
  } finally {
    setTtsBusy(false);
  }
}

function normalizeTtsSpeechText(text) {
  return String(text || "")
    .replace(/\bSCP\s*[-_#]?\s*(\d+(?:[-_]\d+)*)\b/gi, (_match, digits) => `S C P ${digits.replace(/\D/g, "").split("").join(" ")}`)
    .replace(/\bHCZ\s*[-_#]?\s*(\d+)/gi, (_match, digits) => `H C Z ${digits.replace(/\D/g, "").split("").join(" ")}`)
    .replace(/\bLCZ\b/gi, "L C Z")
    .replace(/\bMTF\b/gi, "M T F")
    .replace(/\bNTF\b/gi, "N T F")
    .replace(/\bT\s*[-–—]\s*(\d+)/gi, "T minus $1")
    .replace(/\bSite\s*[-–—]\s*(\d+)/gi, (_match, digits) => `Site ${digits.split("").join(" ")}`)
    .replace(/\bC\.?\s*A\.?\s*S\.?\s*S\.?\s*I\.?\s*E\.?\b/gi, "Cassie");
}

function splitTtsSpeechSegments(text) {
  const paragraphs = String(text || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const segments = [];
  paragraphs.forEach((paragraph) => {
    const sentenceParts = paragraph.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) || [paragraph];
    sentenceParts
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => segments.push(part));
  });

  return segments.length > 0 ? segments : [];
}

async function audioBufferFromKokoroAudio(audio) {
  if (audio && typeof audio.toBlob === "function") {
    const blob = await audio.toBlob();
    const arrayBuffer = await blob.arrayBuffer();
    return getAudioContext().decodeAudioData(arrayBuffer.slice(0));
  }

  const samples = audio?.audio || audio?.data || audio?.samples;
  if (samples && typeof samples.length === "number") {
    const sampleRate = audio.sampling_rate || audio.sample_rate || audio.sampleRate || 24000;
    const buffer = getAudioContext().createBuffer(1, samples.length, sampleRate);
    buffer.getChannelData(0).set(samples);
    return buffer;
  }

  throw new Error("Kokoro 返回了无法识别的音频对象");
}

async function renderTtsPostProcessedBuffer(rawBuffers, options) {
  if (rawBuffers.length === 0) throw new Error("TTS 文本为空");

  const resampleFactor = Math.max(0.1, options.speedPercent / 100) * Math.pow(2, options.pitchSemitones / 12);
  const effectiveGap = Math.max(0, options.gapMs - options.overlapMs) / 1000;
  const sampleRate = 44100;
  const outputChannels = Math.max(...rawBuffers.map((buffer) => buffer.numberOfChannels), 1);

  let totalSeconds = options.voiceDelayMs / 1000;
  rawBuffers.forEach((buffer, index) => {
    totalSeconds += buffer.duration / resampleFactor;
    if (index !== rawBuffers.length - 1) totalSeconds += effectiveGap;
  });

  const offline = createOfflineContext(outputChannels, Math.ceil(Math.max(0.25, totalSeconds) * sampleRate), sampleRate);
  let cursor = options.voiceDelayMs / 1000;
  rawBuffers.forEach((buffer, index) => {
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = resampleFactor;
    source.connect(offline.destination);
    source.start(cursor);
    cursor += buffer.duration / resampleFactor;
    if (index !== rawBuffers.length - 1) cursor += effectiveGap;
  });

  const dryBuffer = await offline.startRendering();
  return applyReverbTail(dryBuffer, options.reverbLevel);
}

async function generateTtsPreview() {
  try {
    setTtsBusy(true);
    const rawText = els.ttsInput.value.trim();
    if (!rawText) throw new Error("TTS 文本为空");

    const engine = await loadKokoroModel();
    const options = getTtsOptions();
    const voice = els.ttsVoice.value || kokoroVoices[0];
    const speechText = normalizeTtsSpeechText(rawText);
    const speechSegments = splitTtsSpeechSegments(speechText);
    setTtsStatus(`正在使用 ${voice} 生成 ${speechSegments.length} 个 TTS 句段。`);
    const rawBuffers = [];
    for (const segment of speechSegments) {
      const audio = await engine.generate(segment, { voice });
      rawBuffers.push(await audioBufferFromKokoroAudio(audio));
    }
    const buffer = await renderTtsPostProcessedBuffer(rawBuffers, options);

    state.tts.generatedBuffer = buffer;
    state.tts.generatedDirty = false;
    updateTtsDownload(buffer);
    drawTtsWaveform(buffer);
    els.ttsRenderDuration.textContent = fmtSeconds(buffer.duration);
    setTtsStatus(`TTS 生成完成：${voice}，${speechSegments.length} 个句段，${fmtSeconds(buffer.duration)}。已应用间隔 ${options.gapMs}ms、提前播放 ${options.overlapMs}ms、延迟 ${options.voiceDelayMs}ms、语速 ${options.speedPercent}%、音高 ${options.pitchSemitones}、尾音混响 ${options.reverbLevel}。`);
    return buffer;
  } catch (error) {
    setTtsStatus(error.message || String(error), "error");
    throw error;
  } finally {
    setTtsBusy(false);
  }
}

async function playTtsAudio() {
  try {
    const buffer = state.tts.generatedDirty || !state.tts.generatedBuffer
      ? await generateTtsPreview()
      : state.tts.generatedBuffer;

    await playBuffer(buffer);
    setTtsStatus("正在播放 Kokoro TTS 音频。");
  } catch {
    // generateTtsPreview already reported the concrete error.
  }
}

function stopTtsAudio() {
  stopCurrentSource();
  setTtsStatus("停止播放。");
}

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
  ctx.fillStyle = "#111418";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#343a42";
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

function drawWaveformFor(canvas, buffer, color = "#6ee7d8") {
  if (!canvas || !buffer) return;
  const ctx = canvas.getContext("2d");
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / canvas.width));
  const mid = canvas.height / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111418";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(230, 180, 80, 0.22)";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < canvas.width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    for (let i = 0; i < step && start + i < data.length; i += 1) {
      const sample = data[start + i];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    ctx.moveTo(x, mid + min * mid * 0.86);
    ctx.lineTo(x, mid + max * mid * 0.86);
  }
  ctx.stroke();
}

function drawEmptyWaveform() {
  drawEmptyWaveformFor(els.waveform);
}

function drawTtsEmptyWaveform() {
  drawEmptyWaveformFor(els.ttsWaveform);
}

function drawWaveform(buffer) {
  drawWaveformFor(els.waveform, buffer);
}

function drawTtsWaveform(buffer) {
  drawWaveformFor(els.ttsWaveform, buffer, "#e6b450");
}

function setBusy(isBusy) {
  [els.generatePreview, els.playAudio, els.applyText, els.applyTemplate, els.reloadAssets].forEach((el) => {
    el.disabled = isBusy;
  });
}

function setTtsBusy(isBusy) {
  [
    els.loadTtsModel,
    els.generateTts,
    els.playTts,
    els.stopTts,
    els.applyTtsTemplate,
    els.ttsVoice,
    els.ttsTemplate,
    els.ttsInput,
    els.ttsGapMs,
    els.ttsOverlapMs,
    els.ttsVoiceDelayMs,
    els.ttsSpeedPercent,
    els.ttsPitchSemitones,
    els.ttsReverbLevel,
  ].forEach((el) => {
    if (el) el.disabled = isBusy;
  });

  els.ttsTemplateFields.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = isBusy;
  });
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
  els.loadTtsModel.addEventListener("click", handleLoadTtsModel);
  els.generateTts.addEventListener("click", generateTtsPreview);
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
  els.generatePreview.addEventListener("click", generatePreview);
  els.playAudio.addEventListener("click", playAudio);
  els.stopAudio.addEventListener("click", stopAudio);
  els.backgroundGain.addEventListener("input", () => {
    els.backgroundGainValue.textContent = `${els.backgroundGain.value}%`;
    markDirty();
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

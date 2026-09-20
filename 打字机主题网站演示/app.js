const files = {
  recent: { title: '最近', description: '最新动态', side: 'left', slug: 'recent', article: 'field-note' },
  archive: { title: '档案', description: '文章与记录', side: 'left', slug: 'archive', article: 'archive' },
  projects: { title: '项目', description: '精选作品', side: 'left', slug: 'projects', article: 'project-001' },
  notes: { title: '笔记', description: '想法与灵感', side: 'left', slug: 'notes', article: 'note-017' },
  index: { title: '索引', description: '全部文件', side: 'right', slug: 'index', article: 'index' },
  categories: { title: '分类', description: '主题与标签', side: 'right', slug: 'categories', article: 'categories' },
  about: { title: '关于', description: '关于作者', side: 'right', slug: 'about', article: 'about' },
  contact: { title: '联系', description: '留下消息', side: 'right', slug: 'contact', article: 'contact' },
};

const articles = {
  'field-note': { file: '最近-017 / 随笔', title: '保存记录的安静工作', author: '档案管理员', date: '2026.09.19', category: '随笔', dek: '为那些值得记住的事物留出一点空间。', sections: [{ heading: '给未完成之物留位', paragraphs: ['日子大多悄无声息地抵达。页边的一句话、还没有找到相框的照片、在另一个标签页里慢慢呼吸的链接。它们发生时，都不像档案。', '档案从我们决定认真看一眼的那一刻开始。我喜欢给文件命名之前那一小段停顿，它像是在说：这件事发生过，而我在这里看见了它。'] }, { heading: '机器是一只节拍器', paragraphs: ['打字机从不催促效率。每个字都有位置，每行都有真实的尽头。敲击声提醒我们，思考由动作组成，而不只是结果。', '这个网站借用了那种节奏。文件在边缘等待，纸张来到中央，机械部件只在处理某件事时短暂出现。'] }], toc: ['给未完成之物留位', '机器是一只节拍器'] },
  'archive': { file: '档案-000 / 目录', title: '平凡日子的目录', author: '档案管理员', date: '2026.09.12', category: '档案', dek: '收集笔记、项目，以及它们之间留白的索引。', sections: [{ heading: '这份索引', paragraphs: ['档案没有盛大的入口，只有文件夹、日期，以及一次次继续寻找的决定。目录是一张在使用中慢慢长大的地图。', '从收藏的边缘开始浏览：最近的笔记、漫长的项目，还有暂时无法归类的问题。'] }], toc: ['这份索引'] },
  'project-001': { file: '项目-001 / 过程记录', title: '做一份更柔软的界面', author: '档案管理员', date: '2026.08.27', category: '项目', dek: '借助实体隐喻，让数字内容变得近到可以触摸。', sections: [{ heading: '像素之前先有纸', paragraphs: ['第一张草图是一张空桌子和一页纸，其余的一切都必须证明自己值得出现。文件夹成为导航，因为它承诺里面有东西，而你可以在准备好时打开它。', '打印机故意只露出一部分：滚筒、打印头、少量金属与阴影。它是过程的提示，不是需要欣赏的模型。'] }, { heading: '慢一点的点击', paragraphs: ['界面只有一条小规则：动作要传达意思。悬停是预览，点击是请求，打印出来的行是回应。即使连接很慢，机器也能继续工作，不让读者等在空房间里。'] }], toc: ['像素之前先有纸', '慢一点的点击'] },
  'note-017': { file: '笔记-017 / 页边', title: '关于留出空间的笔记', author: '档案管理员', date: '2026.07.04', category: '笔记', dek: '页边并不空，它是下一个念头开始的地方。', sections: [{ heading: '有用的页边', paragraphs: ['最有帮助的界面会留下一点没有被占用的空间，让重要的事不必提高声音也能抵达。', '这些笔记刻意保持简短。页面可以容纳一个想法，也可以不把读者包裹得太紧。'] }], toc: ['有用的页边'] },
  index: { file: '索引-全部 / 目录', title: '完整索引', author: '档案管理员', date: '2026.09.19', category: '目录', dek: '这份小小的工作收藏里目前有八个文件。', sections: [{ heading: '桌面上的文件', paragraphs: ['最近保存最新的田野笔记，档案收纳目录，项目记录过程，而笔记给尚未完成的想法留出位置。', '索引有意保持克制。它是一个内容管理系统主题的起点，这里用本地静态数据呈现，让互动可以在任何地方测试。'] }], toc: ['桌面上的文件'] },
  categories: { file: '标签-004 / 索引', title: '每件事都有一个分类', author: '档案管理员', date: '2026.06.16', category: '分类', dek: '几枚有用的标签，帮助我们回到收藏中的任何位置。', sections: [{ heading: '当前标签', paragraphs: ['笔记记录一闪而过的想法，项目承载更长的时间，档案保存那些希望再次找到的记录。', '分类不是围栏，而是让抽屉更容易打开的铅笔记号。'] }], toc: ['当前标签'] },
  about: { file: '关于-001 / 介绍', title: '文件背后的那个人', author: '档案管理员', date: '2026.01.01', category: '关于', dek: '设计师、写作者，也是小型数字房间的保管人。', sections: [{ heading: '简短介绍', paragraphs: ['我制作网站、界面，也记录人们穿行其中的方式。工作总从一个实体问题开始：如果握在手里，它会是什么感觉？', '我的档案是一个主题概念的静态演示。真正的版本可以把这些动作接入文章、页面、分类和内容接口。'] }], toc: ['简短介绍'] },
  contact: { file: '联系-001 / 留言', title: '留下一句话', author: '档案管理员', date: '2026.09.19', category: '联系', dek: '这条线为问候、合作，或一个认真思考过的问题保持开放。', sections: [{ heading: '安静的收件箱', paragraphs: ['目前这张纸是联系表单的占位。在主题正式版本里，它可以连接到简单的接口，或你习惯使用的邮箱。', '重要的是，这个文件属于这里：写好地址、盖上印章，随时可以寄出。'] }], toc: ['安静的收件箱'] },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const desktop = $('[data-desktop]');
const reader = $('[data-reader]');
const paper = $('[data-paper-preview]');
const paperLog = $('[data-paper-log]');
const sheet = $('[data-article]');
const paperSlot = $('[data-paper-slot]');
const printHead = $('.print-head');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let printTimer;
let activePrint = null;
let feedAnimation;
let strikeAnimation;
let soundEnabled = false;
let soundContext;
let keyNoise;
let waitForPointerMove = true;
let readingJob = null;
let returnJob = null;
let currentArticle = null;
let lastPrintedRow = null;
let lastPreviewSlug = null;
let paperScale = 1;
const fontReady = document.fonts.load('23px "ChaoHua Typewriter"', '欢迎来到我的档案文章信息').catch(() => []);
const printHistory = [];
const MAX_PRINT_MESSAGES = 100;

function renderFolders() {
  $$('[data-folder-group]').forEach(group => {
    const side = group.dataset.folderGroup;
    group.innerHTML = Object.values(files).filter(file => file.side === side).map((file, index) => `
      <button class="folder" type="button" data-file="${file.slug}" style="--rotate:${(index % 2 ? -1 : 1) * (index + 1) * .45}deg">
        <span class="folder__arrow">→</span><span class="folder__title">${file.title}</span><span class="folder__description">${file.description}</span>
      </button>`).join('');
  });
  $$('.folder').forEach(folder => {
    folder.addEventListener('mouseenter', () => {
      if (!waitForPointerMove) previewFile(folder.dataset.file);
    });
    folder.addEventListener('pointermove', () => {
      if (waitForPointerMove) {
        waitForPointerMove = false;
        previewFile(folder.dataset.file);
      }
    });
    // Clicking a hovered folder also focuses it; that must not print twice.
    folder.addEventListener('focus', () => {
      if (!folder.matches(':hover') || !folder.classList.contains('is-active')) previewFile(folder.dataset.file);
    });
    folder.addEventListener('mouseleave', () => folder.classList.remove('is-active'));
    folder.addEventListener('blur', () => folder.classList.remove('is-active'));
    folder.addEventListener('click', () => openFile(folder.dataset.file));
  });
}

function updatePaperScale() {
  if (sheet.parentElement !== paper) return;
  paperScale = paper.clientWidth / sheet.offsetWidth;
  paper.style.setProperty('--paper-scale', paperScale);
  // Keep the last struck line at the roller. Revealed article bodies stay on
  // the sheet below it, out of sight, instead of being erased on the way back.
  const tail = Math.max(0, sheet.offsetHeight - printedSheetHeight());
  paper.style.setProperty('--paper-tail', `${tail * paperScale}px`);
  movePrintHead();
}

function printedSheetHeight() {
  if (!lastPrintedRow?.isConnected) return sheet.offsetHeight;
  const rect = sheet.getBoundingClientRect();
  const scale = rect.width / sheet.offsetWidth;
  return (lastPrintedRow.getBoundingClientRect().bottom - rect.top) / scale +
    parseFloat(getComputedStyle(sheet).paddingBottom);
}

function feedPaper(update) {
  const previousLine = paperLog.lastElementChild;
  const previousTop = previousLine?.getBoundingClientRect().top;
  feedAnimation?.cancel();
  update();
  updatePaperScale();
  if (!previousLine?.isConnected || reducedMotion.matches) return;
  const distance = (previousTop - previousLine.getBoundingClientRect().top) / paperScale;
  if (Math.abs(distance) < .1) return;
  feedAnimation = paperLog.animate([
    { transform: `translateY(${distance}px)` },
    { transform: 'translateY(0)' },
  ], { duration: 150, easing: 'ease-out' });
}

function stopPrinting(completed = false) {
  clearTimeout(printTimer);
  const job = activePrint;
  activePrint = null;
  paper.classList.remove('is-printing');
  $('[data-print-state]').textContent = '准备就绪 / 选择文件';
  if (job && !completed && job.entry.element.isConnected) {
    // Reuse a pending blank line if cancellation happened during a carriage
    // return between fields. A task without ink has never reached the DOM.
    job.fields.filter(field => !field.element.textContent).forEach(field => { field.element.hidden = true; });
    lastPrintedRow = job.fields.filter(field => field.element.textContent).at(-1)?.element ?? lastPrintedRow;
    updatePaperScale();
  }
  job?.resolve(completed);
}

function appendEntry(entry) {
  printHistory.push(entry);
  paperLog.append(entry.element);
  if (printHistory.length > MAX_PRINT_MESSAGES) printHistory.shift().element.remove();
}

// Print into the final semantic nodes. Their width, font, and line breaks never
// change between the printer and the reader; only the camera scale changes.
function printFields(entry, fields, label, { interval = 38, returnDelay = 150, immediate = false } = {}) {
  stopPrinting();
  entry.text = '';
  fields.forEach(field => {
    field.element.textContent = '';
    field.element.hidden = true;
    field.element.dataset.printRow = '';
    field.characters = Array.from(field.text);
  });
  const job = { entry, fields, fieldIndex: 0, index: 0, awaitingInitialReturn: true };
  const completion = new Promise(resolve => { job.resolve = resolve; });
  activePrint = job;
  paper.classList.add('is-printing');
  $('[data-print-state]').textContent = `打印中 / ${label}`;

  function typeCharacter() {
    if (activePrint !== job) return;
    // A real carriage returns before the first strike on a fresh line. Keep
    // the pending entry out of the DOM during that movement so cancelling a
    // fast hover cannot leave a blank printed row.
    if (job.awaitingInitialReturn) {
      job.awaitingInitialReturn = false;
      printHead.classList.add('is-returning');
      movePrintHeadToStart();
      printTimer = setTimeout(typeCharacter, returnDelay);
      return;
    }
    const field = fields[job.fieldIndex];
    let returning = false;
    if (job.index >= field.characters.length) {
      if (job.fieldIndex === fields.length - 1) {
        stopPrinting(true);
        return;
      }
      job.fieldIndex += 1;
      job.index = 0;
      entry.text += '\n';
      feedPaper(() => {
        fields[job.fieldIndex].element.hidden = false;
        lastPrintedRow = fields[job.fieldIndex].element;
      });
      returning = true;
    } else {
      const character = field.characters[job.index++];
      const previousHeight = field.element.offsetHeight;
      feedPaper(() => {
        if (!entry.element.isConnected) {
          field.element.hidden = false;
          appendEntry(entry);
          lastPrintedRow = field.element;
        }
        field.element.textContent += character;
        entry.text += character;
      });
      returning = field.element.offsetHeight > previousHeight + 1;
      if (character !== ' ') {
        strikeAnimation?.cancel();
        strikeAnimation = printHead.querySelector('span').animate([
          { transform: 'translateY(0)' },
          { transform: 'translateY(-7px)', offset: .3 },
          { transform: 'translateY(0)' },
        ], { duration: 65 });
      }
    }
    printHead.classList.toggle('is-returning', returning);
    movePrintHead();
    playMechanicalSound(returning);
    printTimer = setTimeout(typeCharacter, returning ? returnDelay : interval);
  }

  fontReady.then(() => {
    if (activePrint !== job) return;
    if (immediate || reducedMotion.matches) {
      fields.forEach(field => {
        field.element.hidden = false;
        field.element.textContent = field.text;
      });
      entry.text = fields.map(field => field.text).join('\n');
      lastPrintedRow = fields.at(-1).element;
      feedPaper(() => appendEntry(entry));
      stopPrinting(true);
    } else {
      printTimer = setTimeout(typeCharacter, 160);
    }
  });
  return completion;
}

function printMessage(message, label = message) {
  const entry = { element: document.createElement('div') };
  entry.element.className = 'paper-line';
  const fields = message.split('\n').map(text => {
    const element = document.createElement('span');
    element.className = 'paper-line__row';
    entry.element.append(element);
    return { element, text };
  });
  return printFields(entry, fields, label);
}

function movePrintHead() {
  const line = lastPrintedRow;
  if (!line?.isConnected || sheet.parentElement !== paper) return;
  const range = document.createRange();
  if (line.firstChild) range.setStart(line.firstChild, line.firstChild.length);
  else range.selectNodeContents(line);
  range.collapse(true);
  const caret = range.getBoundingClientRect();
  const stage = $('[data-printer-stage]').getBoundingClientRect();
  const x = (line.textContent && caret.height ? caret.left : line.getBoundingClientRect().left) - stage.left;
  printHead.style.left = `${Math.min(stage.width - 50, Math.max(0, x - 25))}px`;
}

function movePrintHeadToStart() {
  if (sheet.parentElement !== paper) return;
  const stage = $('[data-printer-stage]').getBoundingClientRect();
  const lineStart = paperLog.getBoundingClientRect().left - stage.left;
  printHead.style.left = `${Math.min(stage.width - 50, Math.max(0, lineStart - 25))}px`;
}

async function toggleSound() {
  const button = $('[data-sound]');
  if (!soundEnabled) {
    try {
      soundContext ??= new AudioContext();
      await soundContext.resume();
      if (!keyNoise) {
        keyNoise = soundContext.createBuffer(1, soundContext.sampleRate * .12, soundContext.sampleRate);
        const samples = keyNoise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
    } catch {
      toast('音效不可用');
      return;
    }
  }
  soundEnabled = !soundEnabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  toast(soundEnabled ? '音效已开启' : '音效已关闭');
  if (soundEnabled) playMechanicalSound();
}

function playMechanicalSound(returning = false) {
  if (!soundEnabled || soundContext.state !== 'running') return;
  const now = soundContext.currentTime;
  const noise = soundContext.createBufferSource();
  const filter = soundContext.createBiquadFilter();
  const gain = soundContext.createGain();
  noise.buffer = keyNoise;
  filter.type = 'highpass';
  filter.frequency.value = returning ? 500 : 1800;
  const duration = returning ? .11 : .032;
  gain.gain.setValueAtTime(returning ? .06 : .095, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  noise.connect(filter).connect(gain).connect(soundContext.destination);
  noise.start(now);
  noise.stop(now + duration);
  noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };

  if (returning) {
    const bell = soundContext.createOscillator();
    const envelope = soundContext.createGain();
    bell.frequency.value = 1650;
    envelope.gain.setValueAtTime(.025, now);
    envelope.gain.exponentialRampToValueAtTime(.001, now + .22);
    bell.connect(envelope).connect(soundContext.destination);
    bell.start(now);
    bell.stop(now + .22);
    bell.onended = () => { bell.disconnect(); envelope.disconnect(); };
  }
}

function previewFile(slug) {
  // Only a different folder starts a new preview. Pointermove, mouseenter and
  // keyboard focus can all fire repeatedly for the same button.
  if (readingJob || reader.classList.contains('is-visible')) return;
  const file = files[slug];
  if (!file) return;
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  if (lastPreviewSlug === slug) return;
  lastPreviewSlug = slug;
  printMessage(file.title, `预览 / ${file.title}`);
}

function restoreDesk() {
  returnJob?.animations.forEach(animation => animation.cancel());
  returnJob = null;
  cancelReading();
  waitForPointerMove = true;
  paper.append(sheet);
  sheet.style.marginTop = '';
  reader.classList.remove('is-visible', 'is-returning');
  reader.setAttribute('aria-hidden', 'true');
  desktop.style.display = '';
  desktop.inert = false;
  currentArticle = null;
  updatePaperScale();
}

async function returnHome(immediate = false) {
  if (returnJob) return returnJob.promise;
  if (!currentArticle || sheet.parentElement !== paperSlot || !reader.classList.contains('is-visible')) {
    restoreDesk();
    return;
  }

  // Capture the current camera, including an interrupted entry animation.
  const sourceRect = sheet.getBoundingClientRect();
  const sourceScale = sourceRect.width / sheet.offsetWidth;
  const sourceClip = getComputedStyle(sheet).clipPath;
  const interrupted = readingJob?.animations.length > 0;
  const layerStates = new Map();
  if (interrupted) {
    $$('.roller, .print-head, .printer-base, .folder-rail, .workspace__topline, .workspace__bottomline, .reader__toolbar, .reader__toc, .reader__index').forEach(element => {
      const style = getComputedStyle(element);
      layerStates.set(element, { transform: style.transform, opacity: style.opacity });
    });
  }
  cancelReading();
  const job = { animations: [], promise: null };
  returnJob = job;
  job.promise = (async () => {
    desktop.style.display = '';
    desktop.style.setProperty('--desktop-top', `${$('.topbar').offsetHeight}px`);
    desktop.classList.add('is-departing', 'is-returning');
    desktop.inert = true;
    reader.classList.add('is-entering', 'is-returning');
    reader.inert = true;
    document.body.classList.add('is-reading-transition');

    // Keep the sheet in the reader until the camera reaches the desk. Moving
    // it into the perspective stage earlier changes its coordinate system.
    const baseRect = sheet.getBoundingClientRect();
    const paperRect = paper.getBoundingClientRect();
    const targetScale = paperRect.width / sheet.offsetWidth;
    const printedHeight = printedSheetHeight();
    const targetLeft = paperRect.left;
    const targetTop = paperRect.bottom - printedHeight * targetScale;
    const hiddenBottom = Math.max(0, sheet.offsetHeight - printedHeight);
    const frames = [
      { transform: `translate(${targetLeft - baseRect.left}px, ${targetTop - baseRect.top}px) scale(${targetScale})`, clipPath: `inset(-200vh 0 ${hiddenBottom}px)` },
      { transform: `translate(${sourceRect.left - baseRect.left}px, ${sourceRect.top - baseRect.top}px) scale(${sourceScale})`, clipPath: sourceClip === 'none' ? 'inset(-200vh 0 0px)' : sourceClip },
    ];
    animateCamera(job, frames, { reverse: true, immediate, layerStates });

    await Promise.allSettled(job.animations.map(animation => animation.finished));
    if (returnJob !== job) return;
    restoreDesk();
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('.brand').focus({ preventScroll: true });
  })();
  return job.promise;
}

async function openFile(slug, replace = false) {
  const file = files[slug];
  const article = articles[file?.article];
  if (!article) return;
  if (!returnJob && replace && (readingJob?.slug === slug ||
    (currentArticle?.slug === slug && reader.classList.contains('is-visible')))) return;
  restoreDesk();
  lastPreviewSlug = slug;
  const job = { slug, animations: [] };
  readingJob = job;
  desktop.setAttribute('aria-busy', 'true');
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  const entry = renderArticle(article, slug);
  currentArticle = entry;
  const url = `#/${file.slug}`;
  if (replace) history.replaceState({ slug }, '', url); else history.pushState({ slug }, '', url);
  document.title = `${article.title} — 我的档案`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const completed = await printFields(entry, entry.fields, `${file.title} / 文章信息`, {
    interval: 14, returnDelay: 140, immediate: replace,
  });
  if (!completed || readingJob !== job) return;
  await focusReadingPaper(job, replace || reducedMotion.matches);
  if (readingJob !== job) return;
  finishReading(job);
}

function cancelReading() {
  stopPrinting();
  const job = readingJob;
  readingJob = null;
  job?.animations.forEach(animation => animation.cancel());
  feedAnimation?.cancel();
  strikeAnimation?.cancel();
  desktop.classList.remove('is-departing', 'is-returning');
  desktop.style.removeProperty('--desktop-top');
  desktop.style.removeProperty('--desktop-height');
  desktop.removeAttribute('aria-busy');
  desktop.inert = false;
  reader.classList.remove('is-entering', 'is-returning');
  reader.inert = false;
  document.body.classList.remove('is-reading-transition');
}

async function focusReadingPaper(job, immediate = false) {
  feedAnimation?.finish();
  const sourceRect = sheet.getBoundingClientRect();
  const sourceScale = paperScale;
  const sourceHeight = printedSheetHeight();
  const deskRect = desktop.getBoundingClientRect();
  const entry = currentArticle;
  desktop.style.setProperty('--desktop-top', `${deskRect.top}px`);
  desktop.style.setProperty('--desktop-height', `${deskRect.height}px`);
  desktop.classList.add('is-departing');
  desktop.inert = true;
  reader.classList.add('is-visible', 'is-entering');
  reader.setAttribute('aria-hidden', 'false');
  reader.inert = true;
  document.body.classList.add('is-reading-transition');
  $('[data-print-state]').textContent = '打印完成 / 聚焦纸张';

  // Move the actual sheet, never a copy. Crop older ink above the reading
  // viewport while preserving a few original lines directly over the header.
  paperSlot.append(sheet);
  entry.reveal.hidden = false;
  const separatorTop = entry.fields[0].element.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  sheet.style.marginTop = `${-Math.max(0, separatorTop - 85)}px`;
  const targetRect = sheet.getBoundingClientRect();
  if (immediate) return;
  const translateX = sourceRect.left - targetRect.left;
  const translateY = sourceRect.top - targetRect.top;
  const hiddenBottom = Math.max(0, sheet.offsetHeight - sourceHeight);
  animateCamera(job, [
    { transform: `translate(${translateX}px, ${translateY}px) scale(${sourceScale})`, clipPath: `inset(-200vh 0 ${hiddenBottom}px)` },
    { transform: 'translate(0, 0) scale(1)', clipPath: 'inset(-200vh 0 0px)' },
  ], { reveal: entry.reveal });
  await Promise.allSettled(job.animations.map(animation => animation.finished));
}

function animateCamera(job, paperFrames, { reverse = false, immediate = false, reveal, layerStates = new Map() } = {}) {
  const duration = immediate || reducedMotion.matches ? 1 : 1250;
  const animate = (element, frames, options = {}) => {
    if (layerStates.has(element)) frames[frames.length - 1] = layerStates.get(element);
    const animation = element.animate(frames, {
      duration, easing: 'cubic-bezier(.42,0,.2,1)', fill: 'both',
      direction: reverse ? 'reverse' : 'normal', ...options,
    });
    job.animations.push(animation);
    return animation;
  };
  animate(sheet, paperFrames);
  $$('.roller, .print-head, .printer-base', desktop).forEach(element => animate(element, [
    { transform: 'translateY(0) scale(1)' },
    { transform: `translateY(${window.innerHeight}px) scale(1.8)` },
  ]));
  $$('.folder-rail', desktop).forEach((element, index) => animate(element, [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: `translateX(${index ? 180 : -180}px) scale(1.1)`, opacity: 0 },
  ]));
  $$('.workspace__topline, .workspace__bottomline', desktop).forEach(element =>
    animate(element, [{ opacity: 1 }, { opacity: 0, offset: .2 }, { opacity: 0 }]));
  if (reveal) animate(reveal, [{ opacity: 0 }, { opacity: 0, offset: .2 }, { opacity: 1 }]);
  $$('.reader__toolbar, .reader__toc, .reader__index', reader).forEach(element => animate(element, [
    { opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 },
  ]));
}

function finishReading(job) {
  if (readingJob !== job) return;
  desktop.style.display = 'none';
  cancelReading();
  desktop.inert = true;
  reader.setAttribute('aria-hidden', 'false');
  $('[data-article-title]', currentArticle.element).focus({ preventScroll: true });
}

function renderArticle(article, slug) {
  const element = $('[data-article-template]').content.firstElementChild.cloneNode(true);
  const fields = [
    ['separator', '· · · 文章信息 · · ·'],
    ['file', article.file], ['title', article.title], ['author', `作者：${article.author}`],
    ['date', `日期：${article.date}`], ['category', `分类：${article.category}`],
  ].map(([key, text]) => ({ element: $(`[data-article-${key}]`, element), text }));
  $('[data-article-dek]', element).textContent = article.dek;
  const serial = ++renderArticle.serial;
  $('[data-toc]').innerHTML = article.toc.map((item, index) => `<li><a href="#section-${serial}-${index}">${item}</a></li>`).join('');
  $('[data-article-body]', element).innerHTML = article.sections.map((section, index) => `<section id="section-${serial}-${index}"><h2>${section.heading}</h2>${section.paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`).join('');
  $('[data-article-footer-date]', element).textContent = article.date;
  $('[data-reader-count]').textContent = `共 ${article.sections.length} 节`;
  return { slug, element, fields, reveal: $('.article-paper__reveal', element) };
}
renderArticle.serial = 0;

function goHome(replace = false) {
  if (returnJob) return returnJob.promise;
  if (replace) history.replaceState({}, '', location.pathname + location.search); else history.pushState({}, '', location.pathname + location.search);
  $$('.folder').forEach(folder => folder.classList.remove('is-active'));
  document.title = '我的档案 — 打字机文件';
  if (reader.classList.contains('is-visible') && currentArticle) return returnHome();
  restoreDesk();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function syncRoute() {
  const slug = location.hash.replace(/^#\//, '');
  if (slug && files[slug]) openFile(slug, true); else goHome(true);
}

function toast(message) {
  const el = $('[data-toast]'); el.textContent = message; el.classList.add('is-visible');
  setTimeout(() => el.classList.remove('is-visible'), 2200);
}

async function reprintWelcome() {
  if (readingJob || returnJob || reader.classList.contains('is-visible')) await goHome();
  if (readingJob || returnJob || reader.classList.contains('is-visible')) return;
  lastPreviewSlug = null;
  printMessage('欢迎来到\n我的档案', '欢迎词');
}

renderFolders();
updatePaperScale();
document.addEventListener('pointermove', () => { waitForPointerMove = false; });
$$('[data-nav="home"]').forEach(button => button.addEventListener('click', () => goHome()));
$('[data-replay-opening]').addEventListener('click', reprintWelcome);
$('[data-sound]').addEventListener('click', toggleSound);
window.addEventListener('resize', () => {
  if (returnJob) restoreDesk();
  else if (readingJob && reader.classList.contains('is-entering')) finishReading(readingJob);
  updatePaperScale();
});
window.addEventListener('popstate', syncRoute);
window.addEventListener('hashchange', syncRoute);
window.addEventListener('keydown', event => { if (event.shiftKey && event.key === 'F5') { event.preventDefault(); reprintWelcome(); } });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (readingJob || returnJob || reader.classList.contains('is-visible'))) goHome();
});
$('[data-toc]').addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link) return;
  event.preventDefault();
  document.getElementById(link.hash.slice(1))?.scrollIntoView({
    behavior: reducedMotion.matches ? 'instant' : 'smooth',
  });
});

const now = new Date();
$('[data-clock]').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
$('[data-weekday]').textContent = now.toLocaleDateString('zh-CN', { weekday: 'short' });
if (location.hash) syncRoute();
else reprintWelcome();

const files = {
  recent: { title: 'RECENT', description: 'Latest updates', side: 'left', slug: 'recent', article: 'field-note' },
  archive: { title: 'ARCHIVE', description: 'Articles & posts', side: 'left', slug: 'archive', article: 'archive' },
  projects: { title: 'PROJECTS', description: 'Selected works', side: 'left', slug: 'projects', article: 'project-001' },
  notes: { title: 'NOTES', description: 'Thoughts & ideas', side: 'left', slug: 'notes', article: 'note-017' },
  index: { title: 'INDEX', description: 'All files', side: 'right', slug: 'index', article: 'index' },
  categories: { title: 'CATEGORIES', description: 'Topics & tags', side: 'right', slug: 'categories', article: 'categories' },
  about: { title: 'ABOUT', description: 'Who I am', side: 'right', slug: 'about', article: 'about' },
  contact: { title: 'CONTACT', description: 'Get in touch', side: 'right', slug: 'contact', article: 'contact' },
};

const articles = {
  'field-note': { file: 'RECENT-017 / FIELD NOTE', title: 'The quiet work of keeping a record', author: 'M. ARCHIVE', date: '2026.09.19', category: 'NOTES', dek: 'A small argument for making room around the things we mean to remember.', sections: [{ heading: 'A place for the unfinished', paragraphs: ['Most days arrive without ceremony. A sentence in a margin, a photograph that has not yet found its frame, a link opened and left breathing in another tab. None of these things feel like an archive when they happen.', 'The archive begins later, when we decide that the fragments are worth a little attention. I like the small pause before a document is named. It is a way of saying: this happened, and I was here to notice.'] }, { heading: 'The machine is a metronome', paragraphs: ['A typewriter does not ask to be efficient. It gives each letter a place and each line a physical end. The sound is a reminder that thought is made of gestures, not only outcomes.', 'This website borrows that rhythm. Files wait at the edges. A paper arrives in the middle. The mechanical parts only appear long enough to tell us that something is being handled.'] }], toc: ['A place for the unfinished', 'The machine is a metronome'] },
  'archive': { file: 'ARCHIVE-000 / CATALOGUE', title: 'A catalogue of ordinary days', author: 'M. ARCHIVE', date: '2026.09.12', category: 'ARCHIVE', dek: 'An index of collected notes, projects, and the spaces between them.', sections: [{ heading: 'The index', paragraphs: ['There is no grand entrance to an archive. There are only folders, dates, and the repeated decision to keep looking. The catalogue is a map that grows through use.', 'Browse by the edges of the collection: recent notes, long projects, and the questions that do not fit anywhere else.'] }], toc: ['The index'] },
  'project-001': { file: 'PROJECT-001 / PROCESS LOG', title: 'Building a softer interface', author: 'M. ARCHIVE', date: '2026.08.27', category: 'PROJECTS', dek: 'On using physical metaphors to make digital content feel close enough to touch.', sections: [{ heading: 'Paper before pixels', paragraphs: ['The first sketch was a blank desk and a sheet of paper. Everything else had to earn its place. Folders became navigation because they hold a promise: something is inside, and you may open it when you are ready.', 'The printer is deliberately partial. We see the roller, the head, a little metal and shadow. It is a cue for the process, not a model to admire.'] }, { heading: 'A slower click', paragraphs: ['The interface has one small rule: movement should communicate. Hovering is a preview, clicking is a request, and the printed line is a response. On a slow connection the machine can keep working without making the reader wait in an empty room.'] }], toc: ['Paper before pixels', 'A slower click'] },
  'note-017': { file: 'NOTE-017 / MARGIN', title: 'Notes on making room', author: 'M. ARCHIVE', date: '2026.07.04', category: 'NOTES', dek: 'A margin is not empty. It is where the next thought starts.', sections: [{ heading: 'A useful margin', paragraphs: ['The most helpful interfaces leave a little unclaimed space. It lets the important thing arrive without having to shout.', 'These notes are kept short on purpose. A page can be a container for an idea without becoming a container around the reader.'] }], toc: ['A useful margin'] },
  index: { file: 'INDEX-ALL / DIRECTORY', title: 'The complete index', author: 'MY ARCHIVE', date: '2026.09.19', category: 'DIRECTORY', dek: 'Eight files currently live in this small, working collection.', sections: [{ heading: 'Files on the desk', paragraphs: ['Recent keeps the newest field notes close. Archive holds the catalogue. Projects collect process logs, while Notes leaves space for unfinished ideas.', 'The index is intentionally modest. It is a starting point for a WordPress-powered archive, represented here with local static data so the interaction can be tested anywhere.'] }], toc: ['Files on the desk'] },
  categories: { file: 'TAGS-004 / INDEX', title: 'Everything has a category', author: 'MY ARCHIVE', date: '2026.06.16', category: 'CATEGORIES', dek: 'A few useful labels for finding a way back into the collection.', sections: [{ heading: 'The current labels', paragraphs: ['NOTES for the passing thought. PROJECTS for the thing with a longer horizon. ARCHIVE for records that want to be found again.', 'Categories are not fences. They are the pencil marks that make a drawer easier to open.'] }], toc: ['The current labels'] },
  about: { file: 'ABOUT-001 / PROFILE', title: 'A person behind the files', author: 'M. ARCHIVE', date: '2026.01.01', category: 'ABOUT', dek: 'Designer, writer, and keeper of small digital rooms.', sections: [{ heading: 'The short version', paragraphs: ['I make websites, interfaces, and notes about the ways people move through them. My work begins with a physical question: what would this feel like to hold?', 'My Archive is a static demonstration of a WordPress theme concept. The real version can connect these same gestures to posts, pages, categories, and the REST API.'] }], toc: ['The short version'] },
  contact: { file: 'CONTACT-001 / OPEN LINE', title: 'Leave a note', author: 'MY ARCHIVE', date: '2026.09.19', category: 'CONTACT', dek: 'The line is open for a thoughtful hello, a collaboration, or a good question.', sections: [{ heading: 'A quiet inbox', paragraphs: ['For now, this paper is a placeholder for a contact form. In a WordPress build it could become a simple endpoint or a link to your preferred mailbox.', 'The important part is that the file feels like it belongs here: addressed, stamped, and ready to be sent.'] }], toc: ['A quiet inbox'] },
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
let currentArticle = null;
let lastPrintedRow = null;
let paperScale = 1;
const fontReady = document.fonts.load('23px "ChaoHua Typewriter"').catch(() => []);
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
  movePrintHead();
}

function feedPaper(update) {
  const previousLine = paperLog.lastElementChild;
  const previousTop = previousLine?.getBoundingClientRect().top;
  feedAnimation?.cancel();
  update();
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
  $('[data-print-state]').textContent = 'READY / SELECT A FILE';
  job?.resolve(completed);
}

function appendEntry(entry) {
  feedPaper(() => {
    printHistory.push(entry);
    paperLog.append(entry.element);
    if (printHistory.length > MAX_PRINT_MESSAGES) printHistory.shift().element.remove();
  });
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
  fields[0].element.hidden = false;
  appendEntry(entry);
  const job = { entry, fields, fieldIndex: 0, index: 0 };
  const completion = new Promise(resolve => { job.resolve = resolve; });
  activePrint = job;
  paper.classList.add('is-printing');
  $('[data-print-state]').textContent = `PRINTING / ${label}`;
  lastPrintedRow = fields[0].element;
  printHead.classList.add('is-returning');
  movePrintHead();
  if (printHistory.length > 1) playMechanicalSound(true);

  function typeCharacter() {
    if (activePrint !== job) return;
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
      feedPaper(() => { fields[job.fieldIndex].element.hidden = false; });
      lastPrintedRow = fields[job.fieldIndex].element;
      returning = true;
    } else {
      const character = field.characters[job.index++];
      const previousHeight = field.element.offsetHeight;
      feedPaper(() => {
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
      movePrintHead();
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
      toast('SOUND UNAVAILABLE');
      return;
    }
  }
  soundEnabled = !soundEnabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  toast(soundEnabled ? 'SOUND ON' : 'SOUND OFF');
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
  // Only a click may replace an article request. Passing the pointer over
  // another folder must not cancel metadata printing or the camera movement.
  if (readingJob || reader.classList.contains('is-visible')) return;
  const file = files[slug];
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  printMessage(file.title);
}

function restoreDesk() {
  cancelReading();
  waitForPointerMove = true;
  // Headers remain as ink on the roll. Body content is shown while reading.
  $$('.article-paper__reveal', sheet).forEach(element => { element.hidden = true; });
  paper.append(sheet);
  sheet.style.marginTop = '';
  reader.classList.remove('is-visible');
  reader.setAttribute('aria-hidden', 'true');
  desktop.style.display = '';
  desktop.inert = false;
  currentArticle = null;
  updatePaperScale();
}

async function openFile(slug, replace = false) {
  const file = files[slug];
  const article = articles[file?.article];
  if (!article) return;
  if (replace && (readingJob?.slug === slug ||
    (currentArticle?.slug === slug && reader.classList.contains('is-visible')))) return;
  restoreDesk();
  const job = { slug, animations: [] };
  readingJob = job;
  desktop.setAttribute('aria-busy', 'true');
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  const entry = renderArticle(article, slug);
  currentArticle = entry;
  const url = `#/${file.slug}`;
  if (replace) history.replaceState({ slug }, '', url); else history.pushState({ slug }, '', url);
  document.title = `${article.title} — My Archive`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  const completed = await printFields(entry, entry.fields, `${file.title} / METADATA`, {
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
  desktop.classList.remove('is-departing');
  desktop.style.removeProperty('--desktop-top');
  desktop.style.removeProperty('--desktop-height');
  desktop.removeAttribute('aria-busy');
  desktop.inert = false;
  reader.classList.remove('is-entering');
  reader.inert = false;
  document.body.classList.remove('is-reading-transition');
}

async function focusReadingPaper(job, immediate = false) {
  feedAnimation?.finish();
  const sourceRect = sheet.getBoundingClientRect();
  const sourceScale = paperScale;
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
  $('[data-print-state]').textContent = 'PRINT COMPLETE / FOCUSING PAPER';

  // Move the actual sheet, never a copy. Crop older ink above the reading
  // viewport while preserving a few original lines directly over the header.
  paperSlot.append(sheet);
  entry.reveal.hidden = false;
  const headerTop = entry.fields[0].element.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
  sheet.style.marginTop = `${-Math.max(0, headerTop - 120)}px`;
  const targetRect = sheet.getBoundingClientRect();
  if (immediate) return;
  const translateX = sourceRect.left - targetRect.left;
  const translateY = sourceRect.top - targetRect.top;
  const hiddenBottom = Math.max(0, sheet.offsetHeight - sourceRect.height / sourceScale);
  const duration = 1250;
  const animate = (element, frames, options = {}) => {
    const animation = element.animate(frames, {
      duration, easing: 'cubic-bezier(.42,0,.2,1)', fill: 'both', ...options,
    });
    job.animations.push(animation);
    return animation;
  };
  animate(sheet, [
    { transform: `translate(${translateX}px, ${translateY}px) scale(${sourceScale})`, clipPath: `inset(-200vh 0 ${hiddenBottom}px)` },
    { transform: 'translate(0, 0) scale(1)', clipPath: 'inset(-200vh 0 0px)' },
  ]);
  $$('.roller, .print-head, .printer-base', desktop).forEach(element => animate(element, [
    { transform: 'translateY(0) scale(1)' },
    { transform: `translateY(${window.innerHeight}px) scale(1.8)` },
  ]));
  $$('.folder-rail', desktop).forEach((element, index) => animate(element, [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: `translateX(${index ? 180 : -180}px) scale(1.1)`, opacity: 0 },
  ]));
  $$('.workspace__topline, .workspace__bottomline', desktop).forEach(element =>
    animate(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 }));
  animate(entry.reveal, [{ opacity: 0 }, { opacity: 0, offset: .2 }, { opacity: 1 }]);
  $$('.reader__toolbar, .reader__toc, .reader__index', reader).forEach(element => animate(element, [
    { opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 },
  ]));
  await Promise.allSettled(job.animations.map(animation => animation.finished));
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
    ['file', article.file], ['title', article.title], ['author', `AUTHOR: ${article.author}`],
    ['date', `DATE: ${article.date}`], ['category', `CATEGORY: ${article.category}`],
  ].map(([key, text]) => ({ element: $(`[data-article-${key}]`, element), text }));
  $('[data-article-dek]', element).textContent = article.dek;
  const serial = ++renderArticle.serial;
  $('[data-toc]').innerHTML = article.toc.map((item, index) => `<li><a href="#section-${serial}-${index}">${item}</a></li>`).join('');
  $('[data-article-body]', element).innerHTML = article.sections.map((section, index) => `<section id="section-${serial}-${index}"><h2>${section.heading}</h2>${section.paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`).join('');
  $('[data-article-footer-date]', element).textContent = article.date;
  $('[data-reader-count]').textContent = `PAGE ${String(article.sections.length).padStart(3, '0')}`;
  return { slug, element, fields, reveal: $('.article-paper__reveal', element) };
}
renderArticle.serial = 0;

function goHome(replace = false) {
  restoreDesk();
  if (replace) history.replaceState({}, '', location.pathname + location.search); else history.pushState({}, '', location.pathname + location.search);
  $$('.folder').forEach(folder => folder.classList.remove('is-active'));
  document.title = 'My Archive — Typewriter Files';
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

function reprintWelcome() {
  if (readingJob || reader.classList.contains('is-visible')) goHome();
  printMessage('WELCOME TO\nMY ARCHIVE', 'WELCOME');
}

renderFolders();
updatePaperScale();
document.addEventListener('pointermove', () => { waitForPointerMove = false; });
$$('[data-nav="home"]').forEach(button => button.addEventListener('click', () => goHome()));
$('[data-replay-opening]').addEventListener('click', reprintWelcome);
$('[data-sound]').addEventListener('click', toggleSound);
window.addEventListener('resize', () => {
  if (readingJob && reader.classList.contains('is-entering')) finishReading(readingJob);
  updatePaperScale();
});
window.addEventListener('popstate', syncRoute);
window.addEventListener('hashchange', syncRoute);
window.addEventListener('keydown', event => { if (event.shiftKey && event.key === 'F5') { event.preventDefault(); reprintWelcome(); } });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && readingJob) goHome();
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
$('[data-weekday]').textContent = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
if (location.hash) syncRoute();
else reprintWelcome();

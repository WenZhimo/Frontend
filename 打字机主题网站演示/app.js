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

function feedPaper(update) {
  const previousLine = paperLog.lastElementChild;
  const previousTop = previousLine?.getBoundingClientRect().top;
  update();
  if (!previousLine || reducedMotion.matches) return;
  if (previousTop === previousLine.getBoundingClientRect().top) return;

  // Keep the visible position continuous even if another line interrupts a feed.
  feedAnimation?.cancel();
  const distance = previousTop - previousLine.getBoundingClientRect().top;
  feedAnimation = paperLog.animate([
    { transform: `translateY(${distance}px)` },
    { transform: 'translateY(0)' },
  ], { duration: 160, easing: 'ease-out' });
}

function stopPrinting() {
  clearTimeout(printTimer);
  activePrint = null;
  paper.classList.remove('is-printing');
  $('[data-print-state]').textContent = 'READY / SELECT A FILE';
}

function printMessage(message, label = message) {
  stopPrinting();
  const entry = { text: '', element: document.createElement('div') };
  entry.element.className = 'paper-line';
  feedPaper(() => {
    printHistory.push(entry);
    paperLog.append(entry.element);
    if (printHistory.length > MAX_PRINT_MESSAGES) printHistory.shift().element.remove();
  });
  const job = { entry, characters: Array.from(message), index: 0 };
  activePrint = job;
  paper.classList.add('is-printing');
  $('[data-print-state]').textContent = `PRINTING / ${label}`;
  printHead.classList.add('is-returning');
  movePrintHead();
  if (printHistory.length > 1) playMechanicalSound(true);

  if (reducedMotion.matches) {
    entry.text = message;
    entry.element.textContent = entry.text;
    stopPrinting();
    return;
  }

  function typeCharacter() {
    if (activePrint !== job) return;
    const character = job.characters[job.index++];
    feedPaper(() => {
      entry.text += character;
      entry.element.textContent = entry.text;
    });
    const returning = character === '\n';
    printHead.classList.toggle('is-returning', returning);
    movePrintHead();
    playMechanicalSound(returning);
    if (!returning && character !== ' ') {
      strikeAnimation?.cancel();
      strikeAnimation = printHead.querySelector('span').animate([
        { transform: 'translateY(0)' },
        { transform: 'translateY(-7px)', offset: .3 },
        { transform: 'translateY(0)' },
      ], { duration: 65 });
    }
    if (job.index >= job.characters.length) stopPrinting();
    else printTimer = setTimeout(typeCharacter, returning ? 180 : 42);
  }
  printTimer = setTimeout(typeCharacter, 160);
}

function movePrintHead() {
  const line = paperLog.lastElementChild;
  if (!line) return;
  const range = document.createRange();
  if (line.firstChild) range.setStart(line.firstChild, line.firstChild.length);
  else range.selectNodeContents(line);
  range.collapse(true);
  const caret = range.getBoundingClientRect();
  const stage = $('[data-printer-stage]').getBoundingClientRect();
  const atLineStart = !line.textContent || line.textContent.endsWith('\n');
  const x = (!atLineStart && (caret.width || caret.height) ? caret.left : line.getBoundingClientRect().left) - stage.left;
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
  const file = files[slug];
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  printMessage(file.title);
}

function openFile(slug, replace = false) {
  const file = files[slug];
  const article = articles[file.article];
  if (!article) return;
  stopPrinting();
  renderArticle(article);
  const url = `#/${file.slug}`;
  if (replace) history.replaceState({ slug }, '', url); else history.pushState({ slug }, '', url);
  desktop.style.display = 'none';
  reader.classList.add('is-visible');
  reader.setAttribute('aria-hidden', 'false');
  $('.topbar').classList.add('is-reader');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast('PRINT COMPLETE / READING MODE');
}

function renderArticle(article) {
  $('[data-article-file]').textContent = article.file;
  $('[data-article-title]').textContent = article.title;
  $('[data-article-author]').textContent = `AUTHOR: ${article.author}`;
  $('[data-article-date]').textContent = `DATE: ${article.date}`;
  $('[data-article-category]').textContent = `CATEGORY: ${article.category}`;
  $('[data-article-dek]').textContent = article.dek;
  $('[data-toc]').innerHTML = article.toc.map((item, index) => `<li><a href="#section-${index}">${item}</a></li>`).join('');
  $('[data-article-body]').innerHTML = article.sections.map((section, index) => `<section id="section-${index}"><h2>${section.heading}</h2>${section.paragraphs.map(p => `<p>${p}</p>`).join('')}</section>`).join('');
  $('[data-article-footer-date]').textContent = article.date;
  $('[data-reader-count]').textContent = `PAGE ${String(article.sections.length).padStart(3, '0')}`;
}

function goHome(replace = false) {
  stopPrinting();
  // A layout change under a stationary pointer is not a new preview request.
  waitForPointerMove = true;
  reader.classList.remove('is-visible');
  reader.setAttribute('aria-hidden', 'true');
  desktop.style.display = '';
  if (replace) history.replaceState({}, '', location.pathname + location.search); else history.pushState({}, '', location.pathname + location.search);
  $$('.folder').forEach(folder => folder.classList.remove('is-active'));
  movePrintHead();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  if (reader.classList.contains('is-visible')) goHome();
  printMessage('WELCOME TO\nMY ARCHIVE', 'WELCOME');
}

renderFolders();
document.addEventListener('pointermove', () => { waitForPointerMove = false; });
$$('[data-nav="home"]').forEach(button => button.addEventListener('click', () => goHome()));
$('[data-replay-opening]').addEventListener('click', reprintWelcome);
$('[data-sound]').addEventListener('click', toggleSound);
window.addEventListener('resize', movePrintHead);
window.addEventListener('popstate', syncRoute);
window.addEventListener('hashchange', syncRoute);
window.addEventListener('keydown', event => { if (event.shiftKey && event.key === 'F5') { event.preventDefault(); reprintWelcome(); } });

const now = new Date();
$('[data-clock]').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
$('[data-weekday]').textContent = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
if (location.hash) syncRoute();
else reprintWelcome();

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
const opening = $('[data-opening]');
let printTimer;

function renderFolders() {
  $$('[data-folder-group]').forEach(group => {
    const side = group.dataset.folderGroup;
    group.innerHTML = Object.values(files).filter(file => file.side === side).map((file, index) => `
      <button class="folder" type="button" data-file="${file.slug}" style="--rotate:${(index % 2 ? -1 : 1) * (index + 1) * .45}deg">
        <span class="folder__arrow">→</span><span class="folder__title">${file.title}</span><span class="folder__description">${file.description}</span>
      </button>`).join('');
  });
  $$('.folder').forEach(folder => {
    folder.addEventListener('mouseenter', () => previewFile(folder.dataset.file));
    folder.addEventListener('focus', () => previewFile(folder.dataset.file));
    folder.addEventListener('mouseleave', resetPreview);
    folder.addEventListener('blur', resetPreview);
    folder.addEventListener('click', () => openFile(folder.dataset.file));
  });
}

function typeText(el, text, speed = 35) {
  clearInterval(printTimer);
  el.textContent = '';
  let index = 0;
  printTimer = setInterval(() => {
    el.textContent = text.slice(0, ++index);
    if (index >= text.length) clearInterval(printTimer);
  }, speed);
}

function previewFile(slug) {
  const file = files[slug];
  const paper = $('[data-paper-preview]');
  paper.classList.add('is-printing');
  $$('.folder').forEach(folder => folder.classList.toggle('is-active', folder.dataset.file === slug));
  $('[data-print-state]').textContent = `PRINTING / ${file.title}`;
  typeText($('[data-preview-title]'), file.title, 42);
  $('[data-preview-sub]').textContent = file.description.toUpperCase();
  $('.print-head').style.left = `${19 + (Object.keys(files).indexOf(slug) % 4) * 20}%`;
}

function resetPreview() {
  clearInterval(printTimer);
  $('[data-paper-preview]').classList.remove('is-printing');
  $$('.folder').forEach(folder => folder.classList.remove('is-active'));
  $('[data-print-state]').textContent = 'READY / SELECT A FILE';
  $('[data-preview-title]').innerHTML = 'WELCOME TO<br />MY ARCHIVE<span class="cursor">▮</span>';
  $('[data-preview-sub]').textContent = 'SELECT A FILE TO BEGIN';
}

function openFile(slug, replace = false) {
  const file = files[slug];
  const article = articles[file.article];
  if (!article) return;
  clearInterval(printTimer);
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
  clearInterval(printTimer);
  reader.classList.remove('is-visible');
  reader.setAttribute('aria-hidden', 'true');
  desktop.style.display = '';
  if (replace) history.replaceState({}, '', location.pathname + location.search); else history.pushState({}, '', location.pathname + location.search);
  resetPreview();
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

function showOpening() {
  opening.classList.remove('is-hidden'); opening.setAttribute('aria-hidden', 'false');
  const status = $('[data-opening-status]'); const title = $('[data-opening-title]');
  typeText(title, 'WELCOME TO\nMY ARCHIVE', 72);
  status.textContent = 'BOOTING ARCHIVE SYSTEM';
  setTimeout(() => { status.textContent = 'PAPER / ROLLER / MEMORY'; }, 920);
  setTimeout(() => { status.textContent = 'SELECT A FILE TO BEGIN'; }, 1850);
  setTimeout(hideOpening, 3100);
}
function hideOpening() { opening.classList.add('is-hidden'); opening.setAttribute('aria-hidden', 'true'); localStorage.setItem('archive-opening-seen', '1'); }

renderFolders();
$$('[data-nav="home"]').forEach(button => button.addEventListener('click', () => goHome()));
$('[data-skip-opening]').addEventListener('click', hideOpening);
$('[data-replay-opening]').addEventListener('click', showOpening);
$('[data-sound]').addEventListener('click', event => { const active = event.currentTarget.getAttribute('aria-pressed') === 'true'; event.currentTarget.setAttribute('aria-pressed', String(!active)); toast(active ? 'SOUND OFF' : 'SOUND ON / IMAGINED'); });
window.addEventListener('popstate', syncRoute);
window.addEventListener('hashchange', syncRoute);
window.addEventListener('keydown', event => { if (event.shiftKey && event.key === 'F5') { event.preventDefault(); localStorage.removeItem('archive-opening-seen'); showOpening(); } });

const now = new Date();
$('[data-clock]').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}  ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
$('[data-weekday]').textContent = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
if (location.hash) syncRoute();
else if (!localStorage.getItem('archive-opening-seen')) showOpening(); else hideOpening();

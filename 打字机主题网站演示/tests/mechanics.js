/* Open mechanics.html through the same static server. No test dependencies. */
const frame = document.querySelector('iframe');
const output = document.querySelector('#results');
const report = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(check, timeout = 10000) {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) throw new Error('等待超时');
    await sleep(10);
  }
}
async function test(name, action) {
  try { await action(); report.push(`通过：${name}`); }
  catch (error) { report.push(`失败：${name} — ${error.message}`); }
  output.textContent = report.join('\n');
}

frame.addEventListener('load', async () => {
  const win = frame.contentWindow;
  const doc = win.document;
  const $ = selector => doc.querySelector(selector);
  const sheet = $('[data-article]');
  const log = $('[data-paper-log]');
  const rows = () => [...doc.querySelectorAll('.print-row')];
  const idle = () => !$('[data-paper-preview]').classList.contains('is-printing');
  const hover = slug => {
    doc.dispatchEvent(new win.Event('pointermove'));
    $(`[data-file="${slug}"]`).dispatchEvent(new win.MouseEvent('mouseenter'));
  };
  const deskReady = () => !$('.reader').classList.contains('is-visible') && !$('.desktop').inert;
  const reading = () => $('.reader').classList.contains('is-visible') && !$('.reader').classList.contains('is-entering');
  const errors = [];
  win.addEventListener('error', event => errors.push(event.message));
  win.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));

  await test('欢迎词、空闲时无运行中的动画', async () => {
    await until(idle);
    assert(log.textContent === '欢迎来到我的档案', '欢迎词不完整');
    await sleep(80);
    assert(doc.getAnimations().length === 0, '空闲时仍有动画');
  });
  await test('重复悬停不重启任务，首字前切换复用空行', async () => {
    const count = log.children.length;
    hover('archive');
    await sleep(120);
    hover('notes');
    hover('notes');
    await until(idle);
    assert(log.children.length === count + 1, '出现空记录或重复记录');
    assert(log.lastElementChild.textContent === '笔记', '新预览不完整');
    hover('notes');
    await sleep(250);
    assert(log.children.length === count + 1, '同一文件被重新打印');
    assert(rows().every(row => row.textContent.length > 0), '留下空行');
  });
  await test('长文本回车、固定字格和墨迹保留', async () => {
    const history = log.textContent;
    const value = '机械动作需要与纸张上的每一个字保持一致'.repeat(3);
    await win.printMessage(value, '长行检查');
    assert(log.textContent.startsWith(history), '历史墨迹改变');
    assert(log.lastElementChild.textContent === value, '长行丢字');
    assert(log.lastElementChild.querySelectorAll('.print-row').length >= 2, '未在右边界换行');
    assert(rows().every(row => row.childElementCount <= 26), '字格超出纸张');
  });

  let enterTime;
  let frameIntervals = [];
  let longTasks = [];
  await test('字锤接触后落字，走纸和字车移动时不落字', async () => {
    const issues = [];
    let strikes = 0;
    let spaces = 0;
    const observer = new win.MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!node.matches?.('.print-cell')) continue;
        const moving = $('.print-head').getAnimations().some(animation => animation.playState === 'running');
        const feeding = sheet.getAnimations().some(animation => animation.playState === 'running');
        if (node.textContent !== ' ' && (moving || feeding)) issues.push(`移动期间落字：${node.textContent}`);
        const center = node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2;
        const head = $('.print-head').getBoundingClientRect();
        if (Math.abs(center - head.left - head.width / 2) > 1.5) issues.push('字锤未对齐字符');
        const atContact = new win.DOMMatrix(win.getComputedStyle($('.print-head__hammer')).transform).m22 > .99;
        if (node.textContent !== ' ') { strikes++; if (!atContact) issues.push('接触前落字'); }
        else { spaces++; if (atContact) issues.push('空格触发击锤'); }
      }
    });
    observer.observe(log, { childList: true, subtree: true });
    let sampling = true;
    let last;
    const sample = now => {
      if (last !== undefined) frameIntervals.push(now - last);
      last = now;
      if (sampling) win.requestAnimationFrame(sample);
    };
    win.requestAnimationFrame(sample);
    const tasks = new win.PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
    tasks.observe({ type: 'longtask' });
    const start = performance.now();
    $('[data-file="recent"]').click();
    await until(reading, 12000);
    enterTime = Math.round(performance.now() - start);
    sampling = false;
    observer.disconnect();
    tasks.disconnect();
    assert(strikes > 30 && spaces > 0, '未捕获足够打印样本');
    assert(issues.length === 0, [...new Set(issues)].join('、'));
  });
  await test('进入 / 返回保持同一张纸、全部墨迹和字号', async () => {
    const ink = log.innerHTML;
    assert(sheet === $('[data-paper-slot] [data-article]'), '进入时更换纸张');
    const sizes = [...log.querySelectorAll('.print-cell')].map(cell => win.getComputedStyle(cell).fontSize);
    assert(sizes.every(size => size === '23px'), '打印字号不一致');
    $('.back-button').click();
    await until(deskReady);
    assert(sheet === $('[data-paper-preview] [data-article]'), '返回时更换纸张');
    assert(log.innerHTML === ink, '返回改变纸张内容');
    await sleep(80);
    assert(doc.getAnimations().length === 0, '返回后仍在运转');
  });
  await test('长距离走纸后继续预览；Esc 可中断打印', async () => {
    hover('about');
    await until(idle);
    assert(log.lastElementChild.textContent === '关于', '正文后预览失败');
    $('[data-file="projects"]').click();
    await sleep(320);
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    await until(deskReady);
    await sleep(200);
    const ink = log.textContent;
    await sleep(150);
    assert(idle() && log.textContent === ink, '取消后仍在落字');
  });
  await test('转场中途返回无纸张替换；直接链接与后退可用', async () => {
    $('[data-file="contact"]').click();
    await until(() => $('.reader').classList.contains('is-entering'));
    await sleep(260);
    const ink = log.innerHTML;
    win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    await until(deskReady);
    assert(log.innerHTML === ink && $('[data-article]') === sheet, '中途返回改变墨迹');
    win.location.hash = '/about';
    await until(reading);
    assert($('[data-reader] h1:last-of-type') !== null, '直接链接正文缺失');
    win.history.back();
    await until(deskReady);
  });
  await test('后台暂停机械动作，恢复后不丢字', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(doc, 'hidden');
    let hidden = false;
    Object.defineProperty(doc, 'hidden', { configurable: true, get: () => hidden });
    const message = '恢复之后继续在同一张纸上打印';
    const printing = win.printMessage(message, '后台检查');
    try {
      await until(() => $('.print-head__hammer').getAnimations().some(animation => animation.playState === 'running'));
      hidden = true;
      doc.dispatchEvent(new win.Event('visibilitychange'));
      await sleep(50);
      const ink = log.textContent;
      await sleep(160);
      assert(log.textContent === ink, '后台仍在落字');
      assert(doc.getAnimations().every(animation => animation.playState !== 'running'), '后台仍有活动动画');
    } finally {
      hidden = false;
      doc.dispatchEvent(new win.Event('visibilitychange'));
      if (descriptor) Object.defineProperty(doc, 'hidden', descriptor);
      else delete doc.hidden;
    }
    await printing;
    assert(log.lastElementChild.textContent === message, '恢复后丢字或重复');
  });
  await test('只保留最后 100 条记录，空闲动画为零', async () => {
    for (let i = 0; i < 105; i++) {
      const element = doc.createElement('div');
      const field = doc.createElement('span');
      element.append(field);
      await win.printFields({ element }, [{ element: field, text: `记录${i}` }], '容量检查', { immediate: true });
    }
    assert(log.children.length === 100, `保留了 ${log.children.length} 条`);
    assert(log.firstElementChild.textContent === '记录5', '历史裁切错误');
    await sleep(150);
    assert(doc.getAnimations().length === 0, '空闲后仍在运转');
    assert(errors.length === 0, errors.join('\n'));
  });
  frameIntervals.sort((a, b) => a - b);
  report.push(`进入文章：${enterTime}ms；帧间隔 P95：${frameIntervals[Math.floor(frameIntervals.length * .95)]?.toFixed(1)}ms；>50ms 长任务：${longTasks.length}`);
  output.textContent = report.join('\n');
  output.dataset.complete = 'true';
  document.title = report.some(line => line.startsWith('失败')) ? '机械检查失败' : '机械检查通过';
});

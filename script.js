'use strict';
/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="i"><use href="#${n}"/></svg>`;
const DAY = 864e5, OPEN = 96, TRASH_DAYS = 30;

/* ---------- storage: IndexedDB (fallback: localStorage) ---------- */
const LS = 'nexus2.';
const lsGet = (k, f) => { try { return JSON.parse(localStorage.getItem(LS + k)) ?? f; } catch { return f; } };
const lsSet = (k, v) => localStorage.setItem(LS + k, JSON.stringify(v)); // may throw (quota / blocked)
let notes = [], tasks = [], trash = [], ready = false;
let settings = { theme: 'light', lang: 'en', sort: 'new', vibrate: true, accent: 'violet', vib: { checks: true, del: true, save: true }, ...lsGet('settings', {}) };

const store = {
  mode: 'idb', db: null,
  async init() {
    try {
      if (!window.indexedDB) throw 0;
      this.db = await new Promise((ok, no) => {
        const r = indexedDB.open('nexus', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(new Error('blocked'));
      });
    } catch { this.mode = 'ls'; }
  },
  get(k) {
    if (this.mode === 'ls') return Promise.resolve(lsGet(k));
    return new Promise((ok, no) => { const r = this.db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  },
  set(k, v) {
    if (this.mode === 'ls') return new Promise((ok, no) => { try { lsSet(k, v); ok(); } catch (e) { no(e); } });
    return new Promise((ok, no) => {
      const tx = this.db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k);
      tx.oncomplete = ok; tx.onerror = tx.onabort = () => no(tx.error);
    });
  }
};
const save = (...ks) => { const m = { notes, tasks, trash }; Promise.all(ks.map(k => store.set(k, m[k]))).catch(storageError); };
const saveSettings = () => { try { lsSet('settings', settings); } catch (e) { storageError(e); } };
function storageError(e) {
  console.error('Storage error:', e);
  $('#bannerMsg').textContent = t('storageErr'); $('#banner').hidden = false;
}
$('#bannerX').addEventListener('click', () => { $('#banner').hidden = true; });

async function boot() {
  await store.init();
  try {
    let n = await store.get('notes'), k = await store.get('tasks'), tr = await store.get('trash');
    if (store.mode === 'idb' && n === undefined && k === undefined) { // one-time move from localStorage
      n = lsGet('notes', []); k = lsGet('tasks', []); notes = n; tasks = k;
      await Promise.all([store.set('notes', n), store.set('tasks', k)]);
      localStorage.removeItem(LS + 'notes'); localStorage.removeItem(LS + 'tasks');
    }
    notes = Array.isArray(n) ? n : []; tasks = Array.isArray(k) ? k : []; trash = Array.isArray(tr) ? tr : [];
  } catch (e) { storageError(e); }
  const keep = trash.filter(x => x.deletedAt > Date.now() - TRASH_DAYS * DAY);
  if (keep.length !== trash.length) { trash = keep; save('trash'); }
  ready = true; renderAll(); stagger('notes');
  Promise.resolve(navigator.storage?.persist?.()).catch(() => {});
}

/* ---------- i18n (UI only, user content is never translated) ---------- */
const L = {
  en: { myNotes: 'My notes', searchPh: 'Search notes…', newNote: 'New note', tasks: 'Tasks', addTask: 'Add task', settings: 'Settings',
    theme: 'Theme', accent: 'Accent color', light: 'Light', dark: 'Dark', language: 'Language', reset: 'Reset all data', resetAsk: 'Delete all notes, tasks and trash?',
    noNotes: 'No notes yet', noNotesSub: 'Tap “New note” to start', nothing: 'Nothing found', nothingSub: 'Try a different word',
    noTasks: 'No tasks', noTasksSub: 'Tap “Add task” to start', titlePh: 'Title', textPh: 'Start writing…', untitled: 'Untitled',
    noContent: 'No content', today: 'Today', yesterday: 'Yesterday', updated: 'updated', nothingYet: 'nothing yet', taskPh: 'Task title',
    checkPh: 'Add a checklist item…', save: 'Save', cancel: 'Cancel', noteW: ['note', 'notes'], taskW: ['item', 'items'],
    trash: 'Trash', emptyTrash: 'Empty trash', trashNote: 'Deleted items are removed after 30 days', trashEmpty: 'Trash is empty',
    trashEmptySub: 'Deleted notes and tasks appear here', restore: 'Restore', purge: 'Delete forever', emptyAsk: 'Delete everything in the trash forever?',
    noteDeleted: 'Note deleted', taskDeleted: 'Task deleted', undo: 'Undo', restored: 'Restored', kindNote: 'Note', kindTask: 'Task',
    export: 'Export data', import: 'Import data', exported: 'Backup saved', imported: 'Imported', importBad: 'This file is not a valid backup',
    nothingNew: 'Nothing new to import', vibration: 'Vibration', vibWhat: 'What vibrates', vibChecks: 'Checkmarks and tasks', vibDel: 'Delete and undo', vibSave: 'Saving and restoring', done: 'Done', sort_new: 'Newest first', sort_old: 'Oldest first', sort_az: 'Title A–Z',
    storageErr: 'Couldn’t save your changes. Storage may be full or blocked by the browser. Export a backup if you can.' },
  ru: { myNotes: 'Мои заметки', searchPh: 'Поиск заметок…', newNote: 'Новая заметка', tasks: 'Задачи', addTask: 'Добавить задачу', settings: 'Настройки',
    theme: 'Тема', accent: 'Цвет акцента', light: 'Светлая', dark: 'Тёмная', language: 'Язык', reset: 'Удалить все данные', resetAsk: 'Удалить все заметки, задачи и корзину?',
    noNotes: 'Заметок пока нет', noNotesSub: 'Нажмите «Новая заметка»', nothing: 'Ничего не найдено', nothingSub: 'Попробуйте другое слово',
    noTasks: 'Задач нет', noTasksSub: 'Нажмите «Добавить задачу»', titlePh: 'Заголовок', textPh: 'Начните писать…', untitled: 'Без названия',
    noContent: 'Пусто', today: 'Сегодня', yesterday: 'Вчера', updated: 'обновлено', nothingYet: 'пока пусто', taskPh: 'Название задачи',
    checkPh: 'Добавить пункт…', save: 'Сохранить', cancel: 'Отмена', noteW: ['заметка', 'заметки', 'заметок'], taskW: ['задача', 'задачи', 'задач'],
    trash: 'Корзина', emptyTrash: 'Очистить корзину', trashNote: 'Удалённое хранится 30 дней', trashEmpty: 'Корзина пуста',
    trashEmptySub: 'Здесь появятся удалённые заметки и задачи', restore: 'Восстановить', purge: 'Удалить навсегда', emptyAsk: 'Удалить всё из корзины навсегда?',
    noteDeleted: 'Заметка удалена', taskDeleted: 'Задача удалена', undo: 'Отменить', restored: 'Восстановлено', kindNote: 'Заметка', kindTask: 'Задача',
    export: 'Экспорт данных', import: 'Импорт данных', exported: 'Резервная копия сохранена', imported: 'Импортировано', importBad: 'Файл не похож на резервную копию',
    nothingNew: 'Новых данных нет', vibration: 'Вибрация', vibWhat: 'Что вибрирует', vibChecks: 'Галочки и задачи', vibDel: 'Удаление и отмена', vibSave: 'Сохранение и восстановление', done: 'Готово', sort_new: 'Сначала новые', sort_old: 'Сначала старые', sort_az: 'По названию А–Я',
    storageErr: 'Не удалось сохранить изменения. Возможно, нет места или хранилище заблокировано. Сделайте экспорт данных.' }
};
const t = k => L[settings.lang][k];
function count(n, key) {
  const f = t(key);
  if (settings.lang === 'en') return `${n} ${n === 1 ? f[0] : f[1]}`;
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2]}`;
}
function fmtDate(ts) {
  const d = new Date(ts), today = new Date().setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(ts).setHours(0, 0, 0, 0)) / DAY);
  if (diff <= 0) return t('today');
  if (diff === 1) return t('yesterday');
  return d.toLocaleDateString(settings.lang, diff < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
}
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.accent = settings.accent;
  $$('#swatches button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.accent));
}
function applyLang() {
  document.documentElement.lang = settings.lang;
  $$('[data-i18n]').forEach(el => el.textContent = t(el.dataset.i18n));
  $$('[data-i18n-ph]').forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $$('#segTheme button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.theme));
  $$('#segLang button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.lang));
  renderAll();
}

/* ---------- shared UI helpers ---------- */
const A = p => `<svg class="art" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const ART = {
  notes: A('<rect x="18" y="12" width="50" height="68" rx="11"/><path d="M30 33h26M30 46h26M30 59h14" opacity=".45"/><path d="m58 72 22-22 9 9-22 22-12 3z" fill="currentColor" fill-opacity=".18"/>'),
  tasks: A('<rect x="16" y="14" width="64" height="68" rx="14"/><path d="M32 36l5 5 9-10M32 62l5 5 9-10"/><path d="M54 38h14M54 64h14" opacity=".45"/>'),
  search: A('<circle cx="42" cy="42" r="22" fill="currentColor" fill-opacity=".12"/><path d="m59 59 20 20"/><path d="M32 40a11 11 0 0 1 10-10" opacity=".45"/>'),
  trash: A('<path d="M24 28h48M38 28v-8h20v8M30 28l4 50h28l4-50"/><path d="M42 42v22M54 42v22" opacity=".45"/>')
};
const emptyHTML = (a, b, art) => `<div class="empty">${ART[art] || ''}<b>${a}</b>${b}</div>`;
const buzz = (ms = 10, kind = 'checks') => { if (settings.vibrate && settings.vib?.[kind] !== false && navigator.vibrate) navigator.vibrate(ms); };
function stagger(id) {
  const l = $('.list', $('#' + id)); if (!l) return;
  l.classList.add('stagger'); setTimeout(() => l.classList.remove('stagger'), 800);
}
let toastTimer;
function toast(msg, label, fn, ms = 5000) {
  const el = $('#toast'), b = $('#toastBtn');
  $('#toastMsg').textContent = msg; b.hidden = !label; b.textContent = label || '';
  b.onclick = () => { el.classList.remove('show'); if (fn) fn(); };
  el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function removeAnimated(el, done) {
  el.style.height = el.offsetHeight + 'px'; el.style.overflow = 'hidden'; void el.offsetHeight;
  el.style.transition = 'height .25s var(--ease),opacity .25s,margin .25s';
  el.style.height = '0'; el.style.opacity = '0'; el.style.marginBottom = '-12px';
  setTimeout(done, 260);
}
/* swipe left to reveal a delete button; list clicks are handled by the caller */
function enableSwipe(box) {
  let st = null, moved = false;
  box.addEventListener('pointerdown', e => {
    moved = false;
    const sw = e.target.closest('.swipe');
    $$('.swipe.open', box).forEach(o => o !== sw && o.classList.remove('open'));
    if (!sw || e.target.closest('.swipe-del, input')) return;
    st = { sw, fg: $('.swipe-fg', sw), x: e.clientX, y: e.clientY, base: sw.classList.contains('open') ? -OPEN : 0, cur: 0, lock: false };
  });
  box.addEventListener('pointermove', e => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.lock) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
      if (Math.abs(dx) < 8) return;
      st.lock = true; st.fg.style.transition = 'none'; st.sw.setPointerCapture(e.pointerId);
    }
    st.cur = Math.max(-OPEN - 24, Math.min(0, st.base + dx));
    st.fg.style.transform = `translateX(${st.cur}px)`;
  });
  const end = () => {
    if (!st) return;
    if (st.lock) { moved = true; st.fg.style.transition = ''; st.fg.style.transform = ''; st.sw.classList.toggle('open', st.cur < -OPEN / 2); }
    st = null;
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('click', e => {
    const sw = e.target.closest('.swipe');
    if (moved) { moved = false; e.stopPropagation(); return; }
    if (sw && sw.classList.contains('open') && !e.target.closest('.swipe-del')) { sw.classList.remove('open'); e.stopPropagation(); }
  }, true);
}
const delBtn = `<button class="swipe-del" aria-label="Delete">${icon('bin')}</button>`;

/* ---------- trash + undo ---------- */
function toTrash(kind, item) {
  const x = { tid: uid(), kind, item, deletedAt: Date.now() };
  trash.unshift(x); return x.tid;
}
function undoDelete(tid, kind) {
  buzz(20, 'del');
  toast(t(kind === 'note' ? 'noteDeleted' : 'taskDeleted'), t('undo'), () => { restore(tid); buzz(10, 'save'); });
}
function restore(tid) {
  const i = trash.findIndex(x => x.tid === tid); if (i < 0) return;
  const [x] = trash.splice(i, 1);
  if (x.kind === 'note') { notes.push(x.item); fresh = x.item.id; } else { tasks.push(x.item); freshTask = x.item.id; }
  save('notes', 'tasks', 'trash'); renderAll();
}
function renderTrash() {
  $('#trashCount').textContent = trash.length || '';
  $('#trashList').innerHTML = trash.length ? trash.map(x => `
    <div class="card titem" data-tid="${x.tid}">
      <div class="row1"><span class="t">${esc(x.kind === 'note' ? (x.item.title || t('untitled')) : x.item.text)}</span>
        <span class="d">${t(x.kind === 'note' ? 'kindNote' : 'kindTask')} · ${fmtDate(x.deletedAt)}</span></div>
      <div class="tact"><button data-act="restore">${t('restore')}</button><button data-act="purge" class="danger">${t('purge')}</button></div>
    </div>`).join('') : emptyHTML(t('trashEmpty'), t('trashEmptySub'), 'trash');
  $('#emptyTrash').hidden = !trash.length;
}
$('#trashList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const tid = b.closest('.titem').dataset.tid;
  if (b.dataset.act === 'restore') { restore(tid); toast(t('restored')); buzz(10, 'save'); }
  else { trash = trash.filter(x => x.tid !== tid); save('trash'); renderTrash(); }
});
$('#emptyTrash').addEventListener('click', () => {
  if (!confirm(t('emptyAsk'))) return;
  trash = []; save('trash'); renderTrash();
});

/* ---------- navigation ---------- */
function show(name) {
  const tab = name === 'trash' ? 'settings' : name;
  $$('.screen:not(.editor)').forEach(s => s.classList.toggle('active', s.id === name));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderAll(); stagger(name);
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
$('#openTrash').addEventListener('click', () => show('trash'));
$('#trashBack').addEventListener('click', () => show('settings'));

/* ---------- notes list + sorting ---------- */
let fresh = null;
const SORTS = ['new', 'old', 'az'];
const sorters = {
  new: (a, b) => b.updated - a.updated,
  old: (a, b) => a.updated - b.updated,
  az: (a, b) => (a.title.trim() || '\uffff').localeCompare(b.title.trim() || '\uffff', settings.lang, { sensitivity: 'base' })
};
const sorted = () => [...notes].sort(sorters[settings.sort] || sorters.new);
const snippet = n => n.text.split('\n').map(s => s.trim()).find(Boolean) || t('noContent');
const noteHTML = n => `
  <div class="swipe${n.id === fresh ? ' pop' : ''}" data-id="${n.id}">${delBtn}
    <div class="swipe-fg card">
      <div class="row1"><span class="t">${esc(n.title || t('untitled'))}</span><span class="d">${fmtDate(n.updated)}</span></div>
      <p class="s">${esc(snippet(n))}</p>
    </div>
  </div>`;
function renderNotes() {
  const q = $('#homeSearch').value.trim().toLowerCase();
  const list = sorted().filter(n => !q || n.title.toLowerCase().includes(q) || n.text.toLowerCase().includes(q));
  $('#notesMeta').textContent = notes.length
    ? `${count(notes.length, 'noteW')} • ${t('updated')} ${fmtDate(Math.max(...notes.map(n => n.updated))).toLowerCase()}`
    : `${count(0, 'noteW')} • ${t('nothingYet')}`;
  $('#notesList').innerHTML = list.length ? list.map(noteHTML).join('')
    : q ? emptyHTML(t('nothing'), t('nothingSub'), 'search') : emptyHTML(t('noNotes'), t('noNotesSub'), 'notes');
  $('#sortMenu').innerHTML = SORTS.map(v => `<button data-v="${v}" class="${settings.sort === v ? 'on' : ''}">${t('sort_' + v)}${settings.sort === v ? icon('check') : ''}</button>`).join('');
  fresh = null;
}
$('#homeSearch').addEventListener('input', renderNotes);
$('#newNote').addEventListener('click', () => openNote(null));
$('#sortBtn').addEventListener('click', e => { e.stopPropagation(); $('#moreMenu').classList.remove('show'); $('#sortMenu').classList.toggle('show'); });
$('#sortMenu').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  settings.sort = b.dataset.v; saveSettings(); $('#sortMenu').classList.remove('show'); renderNotes();
});
document.addEventListener('click', e => {
  if (!e.target.closest('#sortMenu')) $('#sortMenu').classList.remove('show');
  if (!e.target.closest('#moreMenu')) $('#moreMenu').classList.remove('show');
});
$('#notesList').addEventListener('click', e => {
  const sw = e.target.closest('.swipe'); if (!sw) return;
  if (e.target.closest('.swipe-del'))
    return removeAnimated(sw, () => {
      const n = notes.find(x => x.id === sw.dataset.id); notes = notes.filter(x => x !== n);
      const tid = toTrash('note', n); save('notes', 'trash'); renderAll(); undoDelete(tid, 'note');
    });
  openNote(sw.dataset.id);
});

/* ---------- note editor (title + text only) ---------- */
let cur = null, timer;
const eTitle = $('#eTitle'), eText = $('#eText');
const setBar = () => { $('#barTitle').textContent = cur.title.trim() || t('newNote'); };
function openNote(id) {
  cur = id ? notes.find(n => n.id === id) : { id: uid(), title: '', text: '', updated: Date.now() };
  eTitle.value = cur.title; eText.value = cur.text; setBar();
  $('#app').classList.add('in-editor'); $('#editor').classList.add('active');
  if (!id) eTitle.focus();
}
function commit() {
  clearTimeout(timer);
  if (!cur) return;
  cur.updated = Date.now();
  if (!notes.includes(cur)) {
    if (!cur.title.trim() && !cur.text.trim()) return;
    notes.push(cur); fresh = cur.id;
  }
  save('notes');
}
const touch = () => { clearTimeout(timer); timer = setTimeout(commit, 250); };
function closeEditor() {
  commit(); cur = null;
  $('#editor').classList.remove('active'); $('#app').classList.remove('in-editor');
  renderAll();
}
eTitle.addEventListener('input', () => { cur.title = eTitle.value; setBar(); touch(); });
eTitle.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); eText.focus(); } });
eText.addEventListener('input', () => { cur.text = eText.value; touch(); });
$('#back').addEventListener('click', closeEditor);
$('#menuBtn').addEventListener('click', () => {
  clearTimeout(timer);
  const n = cur;
  if (notes.includes(n)) {
    notes = notes.filter(x => x !== n);
    const tid = toTrash('note', n); save('notes', 'trash');
    cur = null; closeEditor(); undoDelete(tid, 'note');
  } else { cur = null; closeEditor(); }
});
window.addEventListener('pagehide', commit);
document.addEventListener('visibilitychange', () => { if (document.hidden) commit(); });

/* ---------- tasks (title + checklist) ---------- */
const expanded = new Set();
let freshTask = null;
const checkHTML = c => `
  <li class="${c.done ? 'done' : ''}" data-cid="${c.id}">
    <button class="cb" data-act="cb">${icon('check')}</button><span class="ct">${esc(c.text)}</span>
    <button class="cx" data-act="cx" aria-label="Delete">${icon('x')}</button>
  </li>`;
const progress = k => `${k.checks.filter(c => c.done).length}/${k.checks.length}`;
const pct = k => k.checks.length ? Math.round(k.checks.filter(c => c.done).length / k.checks.length * 100) : 0;
const taskHTML = k => `
  <div class="swipe${k.id === freshTask ? ' pop' : ''}" data-id="${k.id}">${delBtn}
    <div class="swipe-fg task${k.done ? ' done' : ''}${expanded.has(k.id) ? ' expanded' : ''}">
      <div class="thead">
        <button class="circle" data-act="done" aria-label="Done">${icon('check')}</button>
        <span class="tt" data-act="expand">${esc(k.text)}</span>
        ${k.checks.length ? `<span class="prog">${progress(k)}</span>` : ''}
        <button class="chev" data-act="expand" aria-label="Expand">${icon('chev-d')}</button>
      </div>
      ${k.checks.length ? `<div class="bar"><i style="width:${pct(k)}%"></i></div>` : ''}
      <div class="cwrap${k.checks.length > 2 ? ' more' : ''}">
        <ul class="clist">${k.checks.map(checkHTML).join('')}</ul>
        <input class="cadd" placeholder="${esc(t('checkPh'))}" autocomplete="off">
      </div>
    </div>
  </div>`;
function renderTasks() {
  $('#tasksMeta').textContent = `${t('today')} · ${count(tasks.length, 'taskW')}`;
  $('#tasksList').innerHTML = tasks.length ? tasks.map(taskHTML).join('') : emptyHTML(t('noTasks'), t('noTasksSub'), 'tasks');
  freshTask = null;
}
$('#tasksList').addEventListener('click', e => {
  const sw = e.target.closest('.swipe'); if (!sw) return;
  const k = tasks.find(x => x.id === sw.dataset.id), fg = $('.swipe-fg', sw);
  if (e.target.closest('.swipe-del'))
    return removeAnimated(sw, () => {
      tasks = tasks.filter(x => x !== k); expanded.delete(k.id);
      const tid = toTrash('task', k); save('tasks', 'trash'); renderAll(); undoDelete(tid, 'task');
    });
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'done') { k.done = !k.done; fg.classList.toggle('done', k.done); buzz(); if (k.done) { b.classList.remove('burst'); void b.offsetWidth; b.classList.add('burst'); } }
  else if (a === 'expand') { fg.classList.toggle('expanded') ? expanded.add(k.id) : expanded.delete(k.id); }
  else {
    const li = b.closest('li'), c = k.checks.find(x => x.id === li.dataset.cid);
    if (a === 'cb') { c.done = !c.done; li.classList.toggle('done', c.done); $('.prog', sw).textContent = progress(k); $('.bar i', sw).style.width = pct(k) + '%'; buzz(); }
    if (a === 'cx') { k.checks = k.checks.filter(x => x !== c); save('tasks'); return renderTasks(); }
  }
  save('tasks');
});
$('#tasksList').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('cadd') || !e.target.value.trim()) return;
  const sw = e.target.closest('.swipe'), k = tasks.find(x => x.id === sw.dataset.id);
  k.checks.push({ id: uid(), text: e.target.value.trim(), done: false }); save('tasks'); renderTasks();
  $(`.swipe[data-id="${k.id}"] .cadd`).focus();
});

/* add-task sheet: title first, then checklist items */
let draft = [];
const sheet = $('#sheet');
const drawDraft = () => {
  $('#sChecks').innerHTML = draft.map((c, i) => `<li data-i="${i}"><span class="cb"></span><span class="ct">${esc(c)}</span><button class="cx" aria-label="Delete">${icon('x')}</button></li>`).join('');
};
function pushDraft() { const v = $('#sAdd').value.trim(); if (v) { draft.push(v); drawDraft(); } $('#sAdd').value = ''; }
const closeSheet = () => sheet.classList.remove('show');
$('#addTask').addEventListener('click', () => {
  draft = []; $('#sTitle').value = ''; $('#sAdd').value = ''; drawDraft();
  sheet.classList.add('show'); setTimeout(() => $('#sTitle').focus(), 250);
});
$('#sTitle').addEventListener('keydown', e => { if (e.key === 'Enter') $('#sAdd').focus(); });
$('#sAdd').addEventListener('keydown', e => { if (e.key === 'Enter') pushDraft(); });
$('#sChecks').addEventListener('click', e => {
  const li = e.target.closest('li'); if (li && e.target.closest('.cx')) { draft.splice(+li.dataset.i, 1); drawDraft(); }
});
$('#sCancel').addEventListener('click', closeSheet);
$('#scrim').addEventListener('click', closeSheet);
$('#sSave').addEventListener('click', () => {
  pushDraft();
  const title = $('#sTitle').value.trim();
  if (!title) { const el = $('#sTitle'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.focus(); return; }
  const k = { id: uid(), text: title, done: false, checks: draft.map(text => ({ id: uid(), text, done: false })) };
  tasks.push(k); freshTask = k.id; save('tasks'); closeSheet(); renderTasks(); buzz(15, 'save');
  const list = $('#tasksList'); list.scrollTop = list.scrollHeight;
});

/* ---------- settings, export / import ---------- */
$('#segTheme').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.theme = b.dataset.v; saveSettings(); applyTheme(); applyLang(); });
$('#segLang').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.lang = b.dataset.v; saveSettings(); applyLang(); });
$('#swatches').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; settings.accent = b.dataset.v; saveSettings(); applyTheme(); });
$('#setVib').checked = settings.vibrate;
$('#setVib').addEventListener('change', e => { settings.vibrate = e.target.checked; saveSettings(); buzz(); });
$('#resetData').addEventListener('click', () => {
  if (!confirm(t('resetAsk'))) return;
  notes = []; tasks = []; trash = []; expanded.clear(); save('notes', 'tasks', 'trash'); renderAll();
});
$('#exportBtn').addEventListener('click', () => {
  const data = { app: 'lumo', version: 3, exportedAt: new Date().toISOString(), notes, tasks };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `lumo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast(t('exported'));
});
$('#importBtn').addEventListener('click', () => $('#importFile').click());
const cleanNote = n => ({ id: String(n.id || uid()), title: String(n.title || ''), text: String(n.text || ''), updated: Number(n.updated) || Date.now() });
const cleanTask = k => ({
  id: String(k.id || uid()), text: String(k.text || ''), done: !!k.done,
  checks: (Array.isArray(k.checks) ? k.checks : []).filter(c => c && typeof c === 'object').map(c => ({ id: String(c.id || uid()), text: String(c.text || ''), done: !!c.done }))
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !['nexus', 'lumo'].includes(d.app) || (!Array.isArray(d.notes) && !Array.isArray(d.tasks))) throw new Error('bad file');
    const have = new Set([...notes, ...tasks].map(x => x.id)); let nn = 0, kk = 0;
    const take = (list, clean, target, onAdd) => (Array.isArray(list) ? list : []).forEach(raw => {
      if (!raw || typeof raw !== 'object') return;
      const x = clean(raw); if (have.has(x.id)) return;
      have.add(x.id); target.push(x); onAdd();
    });
    take(d.notes, cleanNote, notes, () => nn++);
    take(d.tasks, cleanTask, tasks, () => kk++);
    if (nn + kk) { save('notes', 'tasks'); renderAll(); toast(`${t('imported')}: ${count(nn, 'noteW')}, ${count(kk, 'taskW')}`); }
    else toast(t('nothingNew'));
  } catch { toast(t('importBad')); }
});

/* main-screen "..." menu (export / import) */
$('#moreBtn').addEventListener('click', e => { e.stopPropagation(); $('#sortMenu').classList.remove('show'); $('#moreMenu').classList.toggle('show'); });

/* vibration details sheet: tap the row (not the switch) */
const vibSheet = $('#vibSheet');
$('#vibRow').addEventListener('click', e => { if (!e.target.closest('.switch')) vibSheet.classList.add('show'); });
$$('[data-vib]').forEach(i => {
  i.checked = settings.vib?.[i.dataset.vib] !== false;
  i.addEventListener('change', () => { settings.vib = { ...settings.vib, [i.dataset.vib]: i.checked }; saveSettings(); buzz(10, i.dataset.vib); });
});
$('#vibDone').addEventListener('click', () => vibSheet.classList.remove('show'));
$('[data-close]', vibSheet).addEventListener('click', () => vibSheet.classList.remove('show'));

/* ---------- init ---------- */
function renderAll() { if (!ready) return; renderNotes(); renderTasks(); renderTrash(); }
enableSwipe($('#notesList'));
enableSwipe($('#tasksList'));
applyTheme();
applyLang();
boot();

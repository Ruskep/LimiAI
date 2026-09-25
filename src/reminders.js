// Напоминания («Запланировано»): единоразовые и повторяющиеся.
// Хранятся в JSON-файле в userData, чтобы переживать перезапуск приложения.

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let cache = null;      // массив напоминаний
let filePath = null;

function dataFile() {
  if (!filePath) {
    filePath = path.join(app.getPath('userData'), 'reminders.json');
  }
  return filePath;
}

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(dataFile(), 'utf8');
    const arr = JSON.parse(raw);
    cache = Array.isArray(arr) ? arr : [];
  } catch (_) {
    cache = [];
  }
  return cache;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    fs.writeFileSync(dataFile(), JSON.stringify(cache, null, 2), 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function newId() {
  return 'rem_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 99999).toString(36);
}

// repeat: 'once' | 'daily' | 'weekly' | 'monthly'
function normalizeRepeat(r) {
  return ['once', 'daily', 'weekly', 'monthly'].includes(r) ? r : 'once';
}

// следующий момент срабатывания повторяющегося напоминания после dueAt
function nextDue(repeat, dueAt) {
  const d = new Date(dueAt);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else return null; // once — не сдвигаем
  return d.getTime();
}

// список (отсортирован по времени срабатывания)
function list() {
  const arr = load();
  return arr.slice().sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
}

function get(id) {
  return load().find((r) => r.id === id) || null;
}

function add({ title, description, dueAt, repeat }) {
  const t = String(title || '').trim();
  if (!t) return { error: 'title_required' };
  const due = Number(dueAt) || Date.now();
  const r = normalizeRepeat(repeat);
  const rem = {
    id: newId(),
    title: t,
    description: String(description || '').trim(),
    dueAt: due,
    repeat: r,
    createdAt: Date.now(),
    lastShownAt: null
  };
  load().push(rem);
  save();
  return { ok: true, reminder: rem };
}

function update(id, patch) {
  const rem = get(id);
  if (!rem) return { error: 'not_found' };
  if (patch && typeof patch.title === 'string') {
    const t = patch.title.trim();
    if (t) rem.title = t;
  }
  if (patch && typeof patch.description === 'string') {
    rem.description = patch.description.trim();
  }
  if (patch && patch.repeat) rem.repeat = normalizeRepeat(patch.repeat);
  if (patch && patch.dueAt != null && Number.isFinite(Number(patch.dueAt))) {
    rem.dueAt = Number(patch.dueAt);
  }
  rem.updatedAt = Date.now();
  save();
  return { ok: true, reminder: rem };
}

function remove(id) {
  const arr = load();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx < 0) return { error: 'not_found' };
  arr.splice(idx, 1);
  save();
  return { ok: true };
}

// напоминания, которые пора показать (dueAt <= now)
function due(now) {
  const t = Number(now) || Date.now();
  return load().filter((r) => (r.dueAt || 0) <= t);
}

// отметить как показанное: once — удалить, повторяющееся — сдвинуть на следующий период
function markShown(id, now) {
  const rem = get(id);
  if (!rem) return null;
  const t = Number(now) || Date.now();
  if (rem.repeat === 'once') {
    remove(id);
    return { removed: true };
  }
  const next = nextDue(rem.repeat, rem.dueAt);
  rem.lastShownAt = t;
  rem.dueAt = next || (t + 24 * 60 * 60 * 1000);
  save();
  return { removed: false, reminder: rem };
}

module.exports = { list, get, add, update, remove, due, markShown, nextDue };
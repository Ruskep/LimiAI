const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const lib = path.join(app.getPath('userData'), 'workspaces.json');

// виртуальный воркспейс для чатов без выбранного проекта
const NONE_ID = 'none';
// виртуальный воркспейс ROLimi — интеграция с Roblox Studio (чаты без папки проекта)
const ROLI_ID = 'rolimi';

let wsCache = null;

function load() {
  if (wsCache) return wsCache;
  try {
    wsCache = JSON.parse(fs.readFileSync(lib, 'utf8'));
  } catch (_) {
    wsCache = [];
  }
  if (!Array.isArray(wsCache)) wsCache = [];
  ensureNoneWorkspace();
  ensureRoliWorkspace();
  dedupeChatIds();
  return wsCache;
}

// чаты должны иметь глобально уникальные id — иначе чат с одинаковым id
// в двух папках подсвечивается как «выбранный» и открывается не тот чат
function uniqueChatId() {
  let id;
  do {
    id = 'chat_' + Date.now() + '_' + Math.floor(Math.random() * 9999);
  } while (wsCache.some((w) => (w.chats || []).some((c) => c.id === id)));
  return id;
}

function dedupeChatIds() {
  const seen = new Set();
  let changed = false;
  for (const w of wsCache) {
    for (const c of (w.chats || [])) {
      if (!c.id || seen.has(c.id)) {
        c.id = uniqueChatId();
        seen.add(c.id);
        changed = true;
      } else {
        seen.add(c.id);
      }
    }
  }
  if (changed) save();
}

function ensureNoneWorkspace() {
  if (!wsCache.some((w) => w.id === NONE_ID)) {
    wsCache.unshift({ id: NONE_ID, name: 'Без проекта', path: null, chats: [] });
    save();
  }
}

// ROLimi — виртуальный воркспейс-раздел: чаты для Roblox Studio, без папки проекта.
// kind='rolimi' помечает раздел: рендерер включает синюю тему и Roblox-промт,
// а агент подключает MCP-инструменты Roblox Studio.
function ensureRoliWorkspace() {
  if (!wsCache.some((w) => w.id === ROLI_ID)) {
    wsCache.push({ id: ROLI_ID, name: 'ROLimi', path: null, kind: 'rolimi', chats: [] });
    save();
  }
}

function isRoli(ws) { return !!(ws && ws.kind === 'rolimi'); }

function save() {
  try {
    fs.mkdirSync(path.dirname(lib), { recursive: true });
    fs.writeFileSync(lib, JSON.stringify(wsCache, null, 2), 'utf8');
  } catch (err) {
    console.error('workspaces save failed:', err.message);
  }
}

function init() { load(); }

function list() { return load(); }

function get(id) {
  return load().find((w) => w.id === id) || null;
}

function add(folderPath) {
  load();
  const resolved = path.resolve(folderPath);
  let existing = wsCache.find((w) => w.path === resolved);
  if (existing) return existing;

  const ws = {
    id: 'ws_' + Date.now() + '_' + Math.floor(Math.random() * 9999),
    name: path.basename(resolved) || resolved,
    path: resolved,
    chats: []
  };
  wsCache.unshift(ws);
  save();
  return ws;
}

function remove(id) {
  load();
  if (id === NONE_ID || id === ROLI_ID) return;
  wsCache = wsCache.filter((w) => w.id !== id);
  save();
}

function saveChat(workspaceId, chat) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return null;
  let id = chat.id;
  // защита от дубликатов: если id уже занят чатом в ДРУГОМ воркспейсе,
  // а в этом его нет — сохраняем под новым id
  const inThis = ws.chats.some((c) => c.id === id);
  const inOther = !inThis && wsCache.some((w) => w.id !== workspaceId && (w.chats || []).some((c) => c.id === id));
  if (inOther) {
    id = uniqueChatId();
    chat = { ...chat, id };
  }
  const idx = ws.chats.findIndex((c) => c.id === id);
  if (idx >= 0) ws.chats[idx] = chat;
  else ws.chats.unshift(chat);
  save();
  return ws;
}

function deleteChat(workspaceId, chatId) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return [];
  ws.chats = ws.chats.filter((c) => c.id !== chatId);
  save();
  return ws.chats;
}

function renameChat(workspaceId, chatId, title) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return null;
  const chat = ws.chats.find((c) => c.id === chatId);
  if (!chat) return null;
  chat.title = String(title || '').trim() || chat.title;
  save();
  return ws.chats;
}

/* ---------- проекты (2.0): менеджер + работники ---------- */

function getChat(workspaceId, chatId) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return null;
  return ws.chats.find((c) => c.id === chatId) || null;
}

// создать чат-менеджер проекта. Проект — это обычный чат со статусом kind='project';
// он живёт в воркспейсе и хранит цель проекта.
function createProject(workspaceId, name, goal) {
  const chat = {
    id: uniqueChatId(),
    title: String(name || '').trim() || 'Новый проект',
    manualTitle: false,
    kind: 'project',
    goal: String(goal || '').trim(),
    status: 'planning', // planning | active | done
    messages: [],
    updatedAt: Date.now()
  };
  saveChat(workspaceId, chat);
  return getChat(workspaceId, chat.id);
}

// создать чат-работника под конкретным менеджером
function createWorker(workspaceId, managerId, title, task) {
  const chat = {
    id: uniqueChatId(),
    title: String(title || '').trim() || 'Новая задача',
    manualTitle: true,
    kind: 'worker',
    managerId,
    task: String(task || '').trim(),
    status: 'idle', // idle | running | done | error
    messages: [],
    result: '',
    updatedAt: Date.now()
  };
  saveChat(workspaceId, chat);
  return getChat(workspaceId, chat.id);
}

function setWorkerStatus(workspaceId, workerId, status) {
  const chat = getChat(workspaceId, workerId);
  if (chat) { chat.status = status; chat.updatedAt = Date.now(); save(); }
  return chat;
}

function setWorkerResult(workspaceId, workerId, result) {
  const chat = getChat(workspaceId, workerId);
  if (chat) { chat.result = result; chat.updatedAt = Date.now(); save(); }
  return chat;
}

// добавить сообщение (или массив) в чат (manager/worker) и сохранить
function appendChatMessages(workspaceId, chatId, msgs) {
  const chat = getChat(workspaceId, chatId);
  if (!chat) return null;
  chat.messages = chat.messages.concat(Array.isArray(msgs) ? msgs : [msgs]);
  chat.updatedAt = Date.now();
  save();
  return chat;
}

function listWorkers(workspaceId, managerId) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return [];
  return ws.chats.filter((c) => c.kind === 'worker' && c.managerId === managerId);
}

// все проекты по всем воркспейсам (для раздела «Проекты»)
function listProjects() {
  load();
  const out = [];
  for (const ws of wsCache) {
    for (const c of (ws.chats || [])) {
      if (c.kind === 'project') out.push({ workspaceId: ws.id, project: c, workers: ws.chats.filter((w) => w.kind === 'worker' && w.managerId === c.id) });
    }
  }
  return out;
}

// удалить чат со всеми его работниками (если это менеджер)
function deleteChatCascade(workspaceId, chatId) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  if (!ws) return [];
  const chat = ws.chats.find((c) => c.id === chatId);
  if (chat && chat.kind === 'project') {
    ws.chats = ws.chats.filter((c) => !(c.managerId === chatId && c.kind === 'worker'));
  }
  ws.chats = ws.chats.filter((c) => c.id !== chatId);
  save();
  return ws.chats;
}

/* ---------- память проекта ---------- */

const MEMORY_FILE = '.infinity-memory.md';
const MAX_MEMORY = 15;

function memoryPath(ws) {
  if (ws && ws.path) return path.join(ws.path, MEMORY_FILE);
  // у воркспейса «Без проекта» нет папки — храним память в служебной папке приложения
  if (ws) return path.join(app.getPath('userData'), 'memory-' + ws.id + '.md');
  return null;
}

// каждая запись — одна строка: "- вопрос → ответ"
function readMemory(workspaceId) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  const p = memoryPath(ws);
  if (!p || !fs.existsSync(p)) return [];
  let text = '';
  try { text = fs.readFileSync(p, 'utf8'); } catch (_) { return []; }
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^-\s(.+?)\s→\s(.+)$/);
    if (m) entries.push({ q: m[1].trim(), a: m[2].trim() });
  }
  return entries;
}

// нормализация вопроса для сравнения: регистр, пунктуация, лишние пробелы
function normalizeQ(q) {
  return String(q || '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// стоп-слова — не несут смысла при сравнении вопросов
const Q_STOP = new Set(['как', 'что', 'такое', 'про', 'это', 'этот', 'эта', 'эти', 'мне', 'меня', 'ты', 'вы', 'ну', 'же', 'давай', 'расскажи', 'скажи', 'объясни', 'покажи', 'помоги', 'можно', 'пожалуйста', 'потом', 'сейчас', 'вообще', 'вот', 'ещё', 'только', 'очень', 'просто', 'надо', 'нужно', 'хочу', 'есть', 'был', 'была', 'было', 'были', 'быть', 'сделай', 'сделать', 'напиши', 'написать', 'создай', 'создать', 'добавь', 'добавить', 'измени', 'изменить', 'удали', 'удалить', 'почини', 'починить', 'исправь', 'исправить', 'проверь', 'проверить', 'запусти', 'запустить', 'обнови', 'обновить', 'переведи', 'перевести', 'найди', 'найти', 'посмотри', 'посмотреть', 'открой', 'открыть', 'закрой', 'закрыть']);

// грубый стемминг русских окончаний для сравнения (не лингвистический, а эвристика)
function stemWord(w) {
  if (w.length <= 4) return w;
  const suffixes = ['ами', 'ями', 'ться', 'ется', 'аться', 'овать', 'ывать', 'ить', 'ять', 'еть', 'ся', 'ть', 'ый', 'ий', 'ой', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ь', 'ы', 'и', 'а', 'я', 'у', 'ю', 'е', 'о', 'й', 'ов', 'ев', 'ей', 'ом', 'ем', 'ам', 'ям', 'ах', 'ях'];
  for (const s of suffixes) {
    if (w.length - s.length >= 3 && w.endsWith(s)) return w.slice(0, w.length - s.length);
  }
  return w;
}

// похожесть двух вопросов по пересечению значимых слов (0..1)
function qSimilarity(a, b) {
  const wa = normalizeQ(a).split(' ').filter((w) => w.length > 2 && !Q_STOP.has(w)).map(stemWord);
  const wb = normalizeQ(b).split(' ').filter((w) => w.length > 2 && !Q_STOP.has(w)).map(stemWord);
  if (!wa.length || !wb.length) return 0;
  const set = new Set(wb);
  let hit = 0;
  for (const w of wa) if (set.has(w)) hit++;
  return hit / Math.max(wa.length, wb.length);
}

function appendMemory(workspaceId, q, a) {
  load();
  const ws = wsCache.find((w) => w.id === workspaceId);
  const p = memoryPath(ws);
  if (!p || !q || !a) return [];
  const entries = readMemory(workspaceId);
  // дедупликация: похожий вопрос уже обсуждался — обновляем ответ и поднимаем запись наверх
  let dupIdx = -1;
  for (let i = 0; i < entries.length; i++) {
    if (qSimilarity(q, entries[i].q) >= 0.6) { dupIdx = i; break; }
  }
  if (dupIdx >= 0) {
    const dup = entries.splice(dupIdx, 1)[0];
    dup.a = a;
    entries.unshift(dup);
  } else {
    entries.unshift({ q, a });
  }
  const trimmed = entries.slice(0, MAX_MEMORY);
  const lines = trimmed.map((e) => `- ${e.q} → ${e.a}`);
  const text = '# Память проекта (LimiAI)\n# Автоматический конспект обсуждений. Последнее — сверху. Можно редактировать.\n\n' + lines.join('\n') + '\n';
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
  } catch (err) { console.error('memory save failed:', err.message); }
  return trimmed;
}

module.exports = { init, list, get, add, remove, saveChat, deleteChat, renameChat, readMemory, appendMemory, getChat, createProject, createWorker, setWorkerStatus, setWorkerResult, appendChatMessages, listWorkers, listProjects, deleteChatCascade, NONE_ID, ROLI_ID, isRoli };
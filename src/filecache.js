/* ============================================================
   filecache.js — кэш файлов проекта для агента.

   Проблема, которую решаем: модель видит содержимое файлов
   только в истории чата (tool-сообщения). После сжатия контекста
   или в новом чате она «забывает» структуру проекта и содержимое
   файлов — и начинает заново листать list_dir / read_file.

   Решение: отдельный файл-кэш (.limi-files.md) в корне проекта,
   куда автоматически пишутся:
     - дерево папок (из list_dir);
     - содержимое прочитанных/записанных файлов (из read_file,
       write_file, edit_file).
   Текст кэша подмешивается в system prompt каждого запроса, поэтому
   модель всегда знает структуру проекта и уже виденные файлы —
   без повторных обращений к диску.

   Файл можно редактировать вручную — он обычный markdown.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const CACHE_FILE = '.limi-files.md';
const MAX_FILE_CHARS = 6000;    // максимум символов содержимого одного файла
const MAX_TOTAL_CHARS = 40000;  // максимум суммарного текста кэша для промта
const MAX_FILES = 12;           // максимум файлов с содержимым в кэше

// папки, которые не показываем в дереве (шум / тяжёлые)
const SKIP_DIRS = new Set(['node_modules', '.git', 'release', 'dist', 'build', 'out', 'coverage', '.vs', '.idea', '__pycache__', '.venv', 'venv', '.cache']);
// файлы, содержимое которых не кэшируем (это служебные файлы самого приложения)
const SKIP_FILES = new Set([CACHE_FILE, '.infinity-memory.md', 'package-lock.json', 'package.json']);

function cachePath(wsPath) {
  if (!wsPath) return null;
  return path.join(wsPath, CACHE_FILE);
}

/* ---------- парсинг / сериализация ---------- */

// текст файла -> { dirs: { 'rel/': [names] }, files: [ { rel, content } ] }
function parse(text) {
  const data = { dirs: {}, files: [] };
  if (!text) return data;
  const lines = String(text).split(/\r?\n/);
  let section = null; // 'tree' | 'file'
  let curFile = null;
  let curBody = [];
  const treeLines = [];
  const flushFile = () => {
    if (curFile) data.files.push({ rel: curFile, content: curBody.join('\n').trimEnd() });
    curFile = null;
    curBody = [];
  };
  for (let line of lines) {
    line = line.replace(/\r$/, '');
    if (line.startsWith('## Дерево')) { flushFile(); section = 'tree'; continue; }
    const fm = line.match(/^## Файл: (.+)$/);
    if (fm) { flushFile(); section = 'file'; curFile = fm[1].trim(); continue; }
    if (section === 'tree') {
      if (line.trim() && !line.trim().startsWith('#')) treeLines.push(line);
    } else if (section === 'file') {
      curBody.push(line);
    }
  }
  flushFile();
  // дерево: строки вида "  name/" (папка) и "  name" (файл)
  const dirStack = []; // { indent, rel }
  for (const line of treeLines) {
    const indent = (line.match(/^[ ]*/) || [''])[0].length;
    const name = line.trim();
    while (dirStack.length && dirStack[dirStack.length - 1].indent >= indent) dirStack.pop();
    if (name.endsWith('/')) {
      const parent = dirStack.length ? dirStack[dirStack.length - 1].rel : '/';
      const rel = (parent === '/' ? '' : parent) + name.slice(0, -1) + '/';
      const dir = { indent, rel };
      dirStack.push(dir);
      if (!data.dirs[rel]) data.dirs[rel] = [];
      // папка должна быть видна и в списке родителя (иначе сериализация её не выведет).
      // Корень ('/') сам себе родитель — его в список не добавляем.
      if (name !== '/') {
        if (!data.dirs[parent]) data.dirs[parent] = [];
        if (!data.dirs[parent].includes(name)) data.dirs[parent].push(name);
      }
    } else {
      const parent = dirStack.length ? dirStack[dirStack.length - 1].rel : '/';
      if (!data.dirs[parent]) data.dirs[parent] = [];
      if (!data.dirs[parent].includes(name)) data.dirs[parent].push(name);
    }
  }
  return data;
}

// { dirs, files } -> текст файла
function serialize(data) {
  const out = [];
  out.push('# Файлы проекта (LimiAI)');
  out.push('# Автокэш: структура проекта и содержимое прочитанных/изменённых файлов.');
  out.push('# Обновляется автоматически при работе агента. Можно редактировать вручную.');
  out.push('');
  out.push('## Дерево');
  const printDir = (rel, indent) => {
    const prefix = '  '.repeat(indent);
    const names = data.dirs[rel] || [];
    for (const name of names) {
      if (name.endsWith('/')) {
        const childName = name.slice(0, -1);
        const childRel = (rel === '/' ? '' : rel) + childName + '/';
        out.push(prefix + childName + '/');
        if (data.dirs[childRel]) printDir(childRel, indent + 1);
      } else {
        out.push(prefix + name);
      }
    }
  };
  out.push('/');
  printDir('/', 1);
  out.push('');
  for (const f of data.files) {
    out.push('## Файл: ' + f.rel);
    out.push(f.content);
    out.push('');
  }
  return out.join('\n').trimEnd() + '\n';
}

/* ---------- загрузка / сохранение ---------- */

function load(wsPath) {
  const p = cachePath(wsPath);
  if (!p || !fs.existsSync(p)) return { dirs: {}, files: [] };
  try {
    return parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return { dirs: {}, files: [] };
  }
}

function save(wsPath, data) {
  const p = cachePath(wsPath);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, serialize(data), 'utf8');
  } catch (err) {
    console.error('filecache save failed:', err.message);
  }
}

/* ---------- обновление ---------- */

function normRel(rel) {
  return String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

// записать результат list_dir в кэш
function updateTree(wsPath, relPath, entries) {
  const data = load(wsPath);
  const key = normRel(relPath);
  const dirKey = key ? key + '/' : '/';
  const names = [];
  for (const e of entries || []) {
    if (e.type === 'dir') {
      if (!SKIP_DIRS.has(e.name)) names.push(e.name + '/');
    } else {
      if (!SKIP_FILES.has(e.name)) names.push(e.name);
    }
  }
  data.dirs[dirKey] = names;
  save(wsPath, data);
}

// записать содержимое файла в кэш (read_file / write_file / edit_file)
function updateFile(wsPath, relPath, content) {
  const rel = normRel(relPath);
  if (!rel || SKIP_FILES.has(rel)) return;
  let text = String(content || '');
  if (text.length > MAX_FILE_CHARS) {
    text = text.slice(0, MAX_FILE_CHARS) + '\n… [обрезано: файл больше ' + MAX_FILE_CHARS + ' символов]';
  }
  const data = load(wsPath);
  data.files = data.files.filter((f) => f.rel !== rel);
  data.files.push({ rel, content: text });
  // вытесняем самые старые файлы, если их слишком много
  while (data.files.length > MAX_FILES) data.files.shift();
  // добавляем файл в дерево родительской папки, если она известна
  const idx = rel.lastIndexOf('/');
  const parent = idx > 0 ? rel.slice(0, idx) + '/' : '/';
  const name = idx > 0 ? rel.slice(idx + 1) : rel;
  if (data.dirs[parent] && !data.dirs[parent].includes(name)) data.dirs[parent].push(name);
  save(wsPath, data);
}

// файл удалён/перезаписан — убрать из кэша
function invalidate(wsPath, relPath) {
  const rel = normRel(relPath);
  if (!rel) return;
  const data = load(wsPath);
  data.files = data.files.filter((f) => f.rel !== rel);
  // убираем имя из дерева родительской папки
  const idx = rel.lastIndexOf('/');
  const parent = idx > 0 ? rel.slice(0, idx) + '/' : '/';
  const name = idx > 0 ? rel.slice(idx + 1) : rel;
  if (data.dirs[parent]) data.dirs[parent] = data.dirs[parent].filter((n) => n !== name);
  save(wsPath, data);
}

/* ---------- формат для промта ---------- */

// собрать текст кэша для system prompt, укладываясь в лимит символов.
// Дерево показываем целиком, содержимое файлов — самые свежие в пределах лимита.
function format(wsPath) {
  const data = load(wsPath);
  const out = [];
  out.push('Файлы проекта (кэш): дерево папок и содержимое уже прочитанных файлов.');
  out.push('НЕ трать раунды на повторные list_dir/read_file — используй этот кэш,');
  out.push('если не нужно проверить свежесть файла.');
  out.push('');
  out.push('## Дерево');
  const printDir = (rel, indent) => {
    const prefix = '  '.repeat(indent);
    const names = data.dirs[rel] || [];
    for (const name of names) {
      if (name.endsWith('/')) {
        const childName = name.slice(0, -1);
        const childRel = (rel === '/' ? '' : rel) + childName + '/';
        out.push(prefix + childName + '/');
        if (data.dirs[childRel]) printDir(childRel, indent + 1);
      } else {
        out.push(prefix + name);
      }
    }
  };
  out.push('/');
  printDir('/', 1);
  out.push('');
  let budget = MAX_TOTAL_CHARS - out.join('\n').length;
  // показываем файлы с конца (самые свежие), пока влезают в бюджет
  const files = data.files.slice();
  while (files.length && budget > 0) {
    const f = files.pop();
    const block = '## Файл: ' + f.rel + '\n' + f.content + '\n\n';
    if (budget - block.length < 0 && out.join('\n').length > 4000) break; // не режем единственный большой файл целиком
    out.push('## Файл: ' + f.rel);
    out.push(f.content);
    out.push('');
    budget -= block.length;
  }
  return out.join('\n').trim();
}

module.exports = { cachePath, updateTree, updateFile, invalidate, format, load, save, serialize, CACHE_FILE };
const { app, BrowserWindow, ipcMain, Menu, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const settings = require('./src/settings');
const gateway = require('./src/gateway');
const skills = require('./src/skills');
const workspaces = require('./src/workspaces');
const fsx = require('./src/fsx');
const shell = require('./src/shell');
const texttools = require('./src/texttools');
const webtools = require('./src/webtools');
const mcp = require('./src/mcp');

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Выполнить команду в терминале (в папке проекта). Windows, cmd.exe. Возвращает stdout/stderr и код выхода.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда для выполнения, например: dir, npm install, git status' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Прочитать содержимое файла внутри папки проекта (относительный путь).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Относительный путь к файлу, например src/index.js' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Создать или полностью перезаписать файл внутри папки проекта (относительный путь). Создаёт недостающие папки.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Относительный путь к файлу' },
          content: { type: 'string', description: 'Полное содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Заменить фрагмент текста в файле внутри папки проекта. old и new должны быть уникальными в файле.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Относительный путь к файлу' },
          old_string: { type: 'string', description: 'Точный фрагмент для замены' },
          new_string: { type: 'string', description: 'Новый текст' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Удалить файл или пустую папку внутри проекта (относительный путь).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Относительный путь' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'Перечислить файлы и папки внутри проекта (относительный путь, пусто = корень).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Относительный путь или пустая строка для корня' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Поиск в интернете (DuckDuckGo). Вернёт список результатов: заголовок, ссылка, сниппет. Используй, чтобы найти актуальную информацию, документацию, примеры.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Прочитать веб-страницу по URL и вернуть её текстовое содержимое (заголовок, текст, ссылки). Подходит для документации, статей, сайтов.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Полный URL страницы, например https://example.com/page' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Задать пользователю вопрос с выбором вариантов (как анкета/опрос). Показывается интерактивная карточка: можно выбрать один вариант, несколько, или написать свой текст. Используй, когда нужно мнение/выбор пользователя, а не просто информация.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Текст вопроса' },
          title: { type: 'string', description: 'Заголовок опроса (короткое название темы, необязательно)' },
          options: { type: 'array', items: { anyOf: [ { type: 'string' }, { type: 'object', properties: { value: { type: 'string', description: 'Текст варианта' }, description: { type: 'string', description: 'Короткое пояснение к варианту (необязательно)' } }, required: ['value'] } ] }, description: 'Варианты ответа (2–10). Можно передать строки или объекты {value, description}' },
          multiple: { type: 'boolean', description: 'Разрешить выбирать несколько вариантов (по умолчанию false)' },
          allowCustom: { type: 'boolean', description: 'Показывать поле для своего варианта (по умолчанию true)' }
        },
        required: ['question', 'options']
      }
    }
  },
  // ===== менеджер проекта (2.0) =====
  {
    type: 'function',
    function: {
      name: 'project_status',
      description: 'Узнать текущее состояние проекта: список работников, их задачи и статусы (idle/running/done/error). Используй, чтобы оценить прогресс и решить, кому поставить следующую задачу.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_worker',
      description: 'Создать чат-работника в своём проекте. Работник — отдельный ИИ-исполнитель. Сразу назначь ему задачу: без task воркер полезен мало. Возвращает worker_id.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Короткое имя задачи/работника, например "Написать парсер"' },
          task: { type: 'string', description: 'Чёткая задача для работника: что сделать, какие файлы/папки трогать, что вернуть в конце. Пиши как бриф — максимально конкретно.' }
        },
        required: ['title', 'task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'assign_task',
      description: 'Назначить задачу существующему работнику: обновить его бриф и запустить выполнение (статус станет running). Используй, когда нужна новая итерация или докрутка работы.',
      parameters: {
        type: 'object',
        properties: {
          worker_id: { type: 'string', description: 'id работника из project_status / create_worker' },
          task: { type: 'string', description: 'Новая/уточнённая задача для работника' }
        },
        required: ['worker_id', 'task']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_worker',
      description: 'Прочитать последнюю переписку работника: что он делал, какие инструменты запускал и что ответил. Используй для контроля качества и решений о следующем шаге.',
      parameters: {
        type: 'object',
        properties: {
          worker_id: { type: 'string', description: 'id работника' }
        },
        required: ['worker_id']
      }
    }
  }
];

// Разрешения, запомненные на текущую сессию ("Always for this session")
const sessionRules = [];   // { tool, pathPrefix, allow }

// Набор инструментов, которые отдаём модели (учитывая настройку «веб-доступ»)
// role='manager' — руководитель проекта: управляет работниками, но НЕ трогает код сам.
// role='worker' — исполнитель: обычные инструменты, но без менеджерских.
async function toolSet(cfg, isManager, isWorker) {
  const MANAGER_TOOLS = new Set(['project_status', 'create_worker', 'assign_task', 'read_worker']);
  let tools = TOOLS.filter((t) => !['web_search', 'web_fetch'].includes(t.function.name));
  if (cfg.webTools !== false) {
    tools = TOOLS.slice();
  }
  if (isManager) {
    tools = TOOLS.filter((t) => MANAGER_TOOLS.has(t.function.name) || ['web_search', 'web_fetch', 'ask_user', 'read_file', 'list_dir'].includes(t.function.name));
  } else if (isWorker) {
    tools = tools.filter((t) => !MANAGER_TOOLS.has(t.function.name) && t.function.name !== 'ask_user');
  }
  if (cfg.agentMode && (cfg.mcpServers || []).length) {
    try {
      const mcpTools = await mcp.listTools(cfg.mcpServers);
      if (mcpTools.length) tools = tools.concat(mcpTools);
    } catch (err) {
      console.error('MCP tools load failed:', err.message);
    }
  }
  return tools;
}

let mainWindow = null;
// активные стримы по сессиям: сессия из рендерера (id чата) -> AbortController
const controllers = new Map();   // sessionId -> AbortController
let activeWorkspaceId = null;

/* ---------- updates ---------- */

let updateState = { status: 'idle', version: null, progress: 0, downloading: false };

function sendUpdateUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState);
  }
}

function broadcastUpdateStatus(status, extra) {
  updateState = Object.assign({}, updateState, { status }, extra || {});
  sendUpdateUpdate();
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'Ruskep', repo: 'infinity-claude' });

  autoUpdater.on('checking-for-update', () => broadcastUpdateStatus('checking'));
  autoUpdater.on('update-available', (info) => broadcastUpdateStatus('available', { version: info.version }));
  autoUpdater.on('update-not-available', () => broadcastUpdateStatus('uptodate'));
  autoUpdater.on('error', (err) => broadcastUpdateStatus('error', { message: String(err && err.message || err) }));
  autoUpdater.on('download-progress', (p) => broadcastUpdateStatus('downloading', { progress: p.percent || 0 }));
  autoUpdater.on('update-downloaded', (info) => {
    updateState = Object.assign({}, updateState, { status: 'downloaded', version: info.version, progress: 100 });
    sendUpdateUpdate();
  });
}

function checkForUpdates() {
  if (!app.isPackaged) return Promise.resolve();
  return autoUpdater.checkForUpdates().catch((err) => {
    broadcastUpdateStatus('error', { message: String(err && err.message || err) });
  });
}

function downloadAndInstallUpdate() {
  broadcastUpdateStatus('downloading', { progress: 0 });
  autoUpdater.downloadUpdate().then(() => {
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 800);
  }).catch((err) => {
    broadcastUpdateStatus('error', { message: String(err && err.message || err) });
  });
}

ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:download', () => downloadAndInstallUpdate());
ipcMain.handle('update:getState', () => updateState);

/* ---------- window ---------- */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'InfinityClaude',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#f9f7f4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.platform === 'win32') {
    mainWindow.setIcon(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.ico')));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // блокирует меню на Alt полностью
  if (process.platform === 'win32') {
    app.setAppUserModelId('infinityclaude.desktop');
  }
  settings.init();
  workspaces.init();
  createWindow();
  setupAutoUpdater();
  if (settings.get().autoUpdate !== false) {
    setTimeout(checkForUpdates, 5000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* ---------- settings ---------- */

ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('settings:set', (_e, patch) => settings.set(patch));
ipcMain.handle('settings:reset', () => settings.reset());

ipcMain.handle('settings:test', async (_e, cfg) => {
  try {
    const start = Date.now();
    const models = await gateway.listModels(cfg || settings.get());
    return { ok: true, timeMs: Date.now() - start, count: (models || []).length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

/* ---------- models ---------- */

ipcMain.handle('models:list', async (_e, cfg) => {
  try {
    return await gateway.listModels(cfg || settings.get());
  } catch (err) {
    return { error: err.message };
  }
});

/* ---------- workspaces ---------- */

ipcMain.handle('workspace:list', () => workspaces.list());

ipcMain.handle('workspace:select', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Выберите папку проекта'
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const ws = workspaces.add(res.filePaths[0]);
  activeWorkspaceId = ws.id;
  return ws;
});

ipcMain.handle('workspace:activate', (_e, id) => {
  activeWorkspaceId = id;
  return workspaces.get(id);
});

ipcMain.handle('workspace:remove', (_e, id) => workspaces.remove(id));

ipcMain.handle('workspace:saveChat', (_e, { workspaceId, chat }) => {
  const ws = workspaces.saveChat(workspaceId, chat);
  return ws ? ws.chats : [];
});

ipcMain.handle('workspace:deleteChat', (_e, { workspaceId, chatId }) => {
  return workspaces.deleteChat(workspaceId, chatId);
});

ipcMain.handle('workspace:renameChat', (_e, { workspaceId, chatId, title }) => {
  return workspaces.renameChat(workspaceId, chatId, title);
});

/* ---------- проекты (2.0): менеджер + работники ---------- */

ipcMain.handle('project:list', () => workspaces.listProjects());

ipcMain.handle('project:create', (_e, { workspaceId, name, goal }) => {
  const p = workspaces.createProject(workspaceId, name, goal);
  return p;
});

ipcMain.handle('project:delete', (_e, { workspaceId, projectId }) => {
  return workspaces.deleteChatCascade(workspaceId, projectId);
});

ipcMain.handle('project:getChat', (_e, { workspaceId, chatId }) => {
  return workspaces.getChat(workspaceId, chatId);
});

/* ---------- memory (память проекта) ---------- */

ipcMain.handle('memory:read', (_e, { workspaceId }) => {
  return workspaces.readMemory(workspaceId);
});

ipcMain.handle('memory:append', (_e, { workspaceId, q, a }) => {
  return workspaces.appendMemory(workspaceId, q, a);
});

/* ---------- контекст: сжатие чата в резюме ---------- */

ipcMain.handle('context:summarize', async (_e, { model, messages, budget, keepTail }) => {
  const cfg = settings.get();
  const baseUrl = cfg.baseUrl;
  const apiKey = cfg.apiKey;
  // берём только «старую» часть (всё, кроме хвоста), превращаем в текст
  const slice = messages.slice(0, -keepTail);
  const parts = slice.map((m) => {
    let t = '';
    if (typeof m.content === 'string') t = m.content;
    else if (Array.isArray(m.content)) t = m.content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('\n');
    else if (m.content && typeof m.content === 'object') t = JSON.stringify(m.content);
    return (m.role === 'user' ? 'Пользователь: ' : 'Ассистент: ') + t;
  });
  const body = parts.join('\n\n');
  if (!body.trim()) return { ok: false, message: 'Нечего сжимать' };
  // не тащим на сжатие весь чат — режем до ~45К символов (последние сообщения),
  // остальное схватывается резюме; так модель отвечает заметно быстрее
  const maxIn = 45000;
  const bodyShort = body.length > maxIn ? body.slice(-maxIn) : body;
  const prompt = [
    'Ниже — переписка пользователя с ИИ. Сожми её в краткое резюме на русском языке:',
    'перечисли что решено, что сделано/изменено, важные факты и договорённости.',
    'Только суть, без воды. Не добавляй ничего, чего нет в переписке.',
    'Ориентируйся на объём примерно до ' + Math.max(400, Math.round((budget || 120000) * 0.18)) + ' символов.',
    '',
    bodyShort
  ].join('\n');
  // шлюз иногда отдаёт стрим без ни одного куска текста — пробуем снова, с небольшой паузой
  let text = '';
  let errMsg = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await gateway.streamChat({
      baseUrl, apiKey,
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 4096,
      topP: 1,
      streamIdleMs: 25000,
      requestTimeoutMs: 60000
    });
    if (res.ok && res.text && res.text.trim()) {
      text = res.text.trim();
      break;
    }
    if (!res.ok) errMsg = res.message || errMsg;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  if (!text) return { ok: false, message: errMsg || 'Пустое резюме' };
  return { ok: true, text };
});

/* ---------- skills ---------- */

ipcMain.handle('skills:list', () => skills.list());
ipcMain.handle('skills:readBody', (_e, id) => skills.readBody(id));
ipcMain.handle('skills:create', async (_e, { name, description }) => skills.create(name, description));
ipcMain.handle('skills:updateBody', (_e, { id, body }) => skills.updateBody(id, body));
ipcMain.handle('skills:remove', (_e, id) => skills.removeSkill(id));
ipcMain.handle('skills:install', async (_e, { command }) => skills.installSkill(command));

/* ---------- MCP ---------- */

ipcMain.handle('mcp:test', async (_e, server) => {
  try {
    return await mcp.test(server);
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:locale', () => app.getLocale());
ipcMain.handle('app:onboarded', (_e, value) => {
  settings.set({ onboarded: value === true });
  return true;
});

app.on('will-quit', () => {
  try { mcp.disconnectAll(); } catch (_) { }
});

/* ---------- fsx helpers for renderer (direct calls, no agent) ---------- */

ipcMain.handle('fsx:read', async (_e, { workspaceId, relPath }) => {
  try {
    const ws = workspaces.get(workspaceId);
    if (!ws) return { error: 'нет воркспейса' };
    return { content: await fsx.read(ws.path, relPath) };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fsx:readAttached', async (_e, { filePath }) => {
  try {
    const fs = require('fs');
    const buf = fs.readFileSync(filePath);
    const isText = /\.(txt|md|js|ts|jsx|tsx|json|py|html|css|xml|yml|yaml|sh|bat|ps1|cs|java|c|cpp|h|sql|log|ini|toml|cfg|env|gitignore|vue|rs|go|rb|php|swift|kt)$/i.test(filePath);
    if (isText) {
      return { text: buf.toString('utf8'), size: buf.length };
    }
    return { text: null, size: buf.length, base64: buf.toString('base64') };
  } catch (err) { return { error: err.message }; }
});

/* ---------- agent ---------- */

async function requestApproval(sender, sessionId, { workspaceId, tool, params }) {
  const ws = workspaces.get(workspaceId);
  const wsPath = ws ? ws.path : null;
  const argPath = params.path || '';
  const auto = settings.get().autoApprove;

  const isReadOnly = tool === 'read_file' || tool === 'list_dir';

  if (auto === 'all' || (auto === 'read' && isReadOnly)) {
    return { allow: true };
  }

  const remembered = sessionRules.find((r) => r.tool === tool && (r.pathPrefix === '*' || r.pathPrefix === argPath) && r.allow);
  if (remembered) return { allow: remembered.allow };

  const humanize = {
    bash: 'Команда в терминале',
    write_file: 'Запись в файл',
    edit_file: 'Правка файла',
    delete_file: 'Удаление файла',
    read_file: 'Чтение файла',
    list_dir: 'Список папки'
  };

  const description =
    tool === 'bash'
      ? { title: 'Выполнить команду', code: params.command }
      : { title: `${humanize[tool] || tool}: ${params.path}`, code: tool === 'edit_file' ? params.old_string : (params.content || '') };

  const answer = await dispatchApproval(sender, sessionId, {
    tool, argPath, humanized: { label: humanize[tool] || tool, ...description }
  });

  if (answer && answer.remember) {
    sessionRules.push({ tool, pathPrefix: answer.globally ? '*' : argPath, allow: answer.allow });
  }
  return { allow: !!answer.allow };
}

function dispatchApproval(sender, sessionId, payload) {
  return new Promise((resolve) => {
    const once = (_e, res) => {
      if (res && res.sessionId && res.sessionId !== sessionId) return; // ответ от другой сессии
      ipcMain.removeListener('agent:approval:reply', once);
      resolve(res);
    };
    ipcMain.on('agent:approval:reply', once);
    if (!sender.isDestroyed()) sender.send('agent:approval', Object.assign({ sessionId }, payload));
  });
}

const pendingPolls = new Map(); // sessionId -> resolve

ipcMain.on('agent:poll:reply', (_e, res) => {
  const key = (res && res.sessionId) || null;
  const resolve = key !== null && pendingPolls.has(key) ? pendingPolls.get(key) : null;
  if (resolve) { pendingPolls.delete(key); resolve(res); }
});

function dispatchPoll(sender, sessionId, payload) {
  return new Promise((resolve) => {
    pendingPolls.set(sessionId, resolve);
    if (!sender.isDestroyed()) sender.send('agent:poll', Object.assign({ sessionId }, payload));
  });
}

async function runAgent(sender, { sessionId, workspaceId, model, messages, chatId, role }) {
  const ws = workspaces.get(workspaceId);
  const cfg = settings.get();
  const baseUrl = cfg.baseUrl;
  const apiKey = cfg.apiKey;
  const hasTools = cfg.agentMode; // инструменты доступны всегда в режиме агента
  const workingDir = (ws && ws.path) || app.getPath('documents'); // без проекта работаем в Документах

  // менеджерский режим: чат-проект (kind=project) руководит работниками и НЕ пишет код сам
  const isManager = role === 'manager';
  const isWorker = role === 'worker';

  const push = (chunk) => {
    if (!sender.isDestroyed()) sender.send('agent:chunk', Object.assign({ sessionId }, chunk));
  };

  const controller = new AbortController();
  controllers.set(sessionId, controller);

  const ctx = { messages: messages.slice(), workingDir: workingDir };
  let emptyRetries = 0;
  let finalText = '';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // похоже ли сообщение на «шлюз перегружен/занят» — такие ошибки можно повторить
  const isBusy = (msg) => {
    if (!msg) return false;
    const s = String(msg).toLowerCase();
    return /(503|429|502|busy|occupied|admission|structure_limit|перегружен|занят|соединение закрыт|overload)/.test(s);
  };

  try {
    for (let round = 0; round < cfg.maxToolRounds; round++) {
      push({ type: 'round', round, own: true });

      // запрос к шлюзу с авто-повтором при «сервер занят/перегружен»:
      // OmniRoute любит отвечать 503 (chat_admission_busy), когда параллельно
      // работают несколько чатов — подождём и попробуем снова, вместо ошибки.
      let streamResult = null;
      let busyAttempts = Math.max(0, cfg.busyRetries || 0);
      while (true) {
        streamResult = await gateway.streamChat({
          baseUrl, apiKey,
          model,
          messages: ctx.messages,
          tools: hasTools ? await toolSet(cfg, isManager, isWorker) : undefined,
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          topP: cfg.topP,
          presencePenalty: cfg.presencePenalty,
          frequencyPenalty: cfg.frequencyPenalty,
          seed: cfg.seed,
          streamIdleMs: cfg.streamIdleMs,
          requestTimeoutMs: cfg.requestTimeoutMs,
          signal: controller.signal,
          onContent: (text, snapshot) => {
            push({ type: 'text', text, snapshot, round });
          }
        });
        if (streamResult.aborted) break;
        if (!streamResult.ok && isBusy(streamResult.message) && busyAttempts > 0) {
          busyAttempts--;
          push({ type: 'busy', message: streamResult.message || 'Шлюз занят', remaining: busyAttempts });
          await sleep(cfg.busyRetryDelayMs || 2500);
          continue;
        }
        break;
      }

      if (streamResult.aborted) {
        push({ type: 'aborted' });
        return { ok: false, aborted: true };
      }
      if (!streamResult.ok) {
        push({ type: 'error', message: streamResult.message || 'Ошибка шлюза' });
        return { ok: false, message: streamResult.message };
      }

      finalText = streamResult.text || finalText;

      // Если шлюз не вернул структурированные вызовы, проверяем «текстовый» формат
      let toolCalls = streamResult.toolCalls || [];
      let assistantText = streamResult.text || '';

      if (!toolCalls.length && hasTools) {
        const parsed = texttools.parseTextToolCalls(assistantText);
        if (parsed.calls.length) {
          toolCalls = parsed.calls.map((c, i) => ({
            id: `txt_${Date.now()}_${i}`,
            name: c.name,
            arguments: JSON.stringify(c.args || {})
          }));
          assistantText = parsed.cleanText;
          // обновляем текст у рендерера: убираем блоки вызовов из отображения
          push({ type: 'text_replace', text: assistantText, round });
          finalText = assistantText;
        }
      }

      // Модель может «молча» вернуть пустой ответ (ни текста, ни вызовов) —
      // особенно на продолжении после инструментов. Тогда не завершаемся,
      // а просим её продолжить, чтобы задача реально пошла дальше.
      if (!toolCalls.length && !assistantText.trim()) {
        if (emptyRetries < Math.max(0, cfg.maxEmptyRetries || 0)) {
          emptyRetries++;
          push({ type: 'text_replace', text: assistantText, round });
          ctx.messages.push({ role: 'assistant', content: '' });
          ctx.messages.push({
            role: 'user',
            content: '[Твой предыдущий ответ был пустым. Продолжай выполнение задачи: скажи, что делаешь дальше, и используй инструменты, если нужно. Не пиши пустых ответов.]'
          });
          continue;
        }
        push({ type: 'error', message: 'Модель несколько раз вернула пустой ответ. Попробуй ещё раз или смени модель.' });
        return { ok: false, message: 'empty response' };
      }

      // Если модель даёт текстовый ответ без инструментов, но в контексте есть задачи,
      // требующие действий (например, работа с файлами, командами), напомним об инструментах
      if (!toolCalls.length && assistantText.trim() && hasTools) {
        // Проверяем, содержит ли ответ слова-индикаторы действий без реального выполнения
        const actionWords = ['проверю', 'посмотрю', 'изучу', 'найду', 'исправлю', 'сделаю', 'добавлю', 'удалю', 'изменю', 'попробую', 'буду', 'сейчас'];
        const hasActionWords = actionWords.some(word => assistantText.toLowerCase().includes(word));
        
        // Проверяем последнее сообщение пользователя - содержит ли оно запрос на действие
        const lastUserMessage = ctx.messages.filter(m => m.role === 'user').pop();
        const lastUserText = lastUserMessage ? 
          (typeof lastUserMessage.content === 'string' ? lastUserMessage.content : 
           Array.isArray(lastUserMessage.content) ? lastUserMessage.content.map(p => p.text || '').join(' ') : '') : '';
        
        const userRequestsAction = lastUserText && (
          lastUserText.toLowerCase().includes('исправь') ||
          lastUserText.toLowerCase().includes('найди') ||
          lastUserText.toLowerCase().includes('добавь') ||
          lastUserText.toLowerCase().includes('удали') ||
          lastUserText.toLowerCase().includes('измени') ||
          lastUserText.toLowerCase().includes('сделай') ||
          lastUserText.toLowerCase().includes('создай') ||
          lastUserText.toLowerCase().includes('проверь') ||
          lastUserText.toLowerCase().includes('посмотри')
        );
        
        // Проверяем, не забыл ли модель контекст после ask_user
        const hasAskUserInHistory = ctx.messages.some(m => 
          m.role === 'tool' && m.content && 
          typeof m.content === 'string' && 
          m.content.includes('"approved":true')
        );
        
        const seemsToForgetContext = assistantText.toLowerCase().includes('что') && 
                                    assistantText.toLowerCase().includes('делать') &&
                                    hasAskUserInHistory;
        
        // Если есть слова действий но нет инструментов, и пользователь явно просит действие
        // ИЛИ модель кажется забыла контекст после ask_user
        if ((hasActionWords && userRequestsAction || seemsToForgetContext) && 
            emptyRetries < Math.max(0, cfg.maxEmptyRetries || 0)) {
          emptyRetries++;
          push({ type: 'text_replace', text: assistantText, round });
          ctx.messages.push({ role: 'assistant', content: assistantText });
          
          let reminder = '';
          if (seemsToForgetContext) {
            // Модель забыла контекст после ask_user
            reminder = '[Ты только что получил ответ от пользователя через ask_user. Продолжай выполнение исходной задачи с учетом этого ответа. Не спрашивай снова что делать.]';
          } else {
            // Модель говорит о действиях без инструментов
            reminder = '[Ты сказал что сделаешь действие, но не использо��ал инструменты. Пожалуйста, используй инструменты (read_file, write_file, bash и т.д.) для выполнения задачи. Не просто описывай что будешь делать - делай это с помощью инструментов.]';
          }
          
          ctx.messages.push({ role: 'user', content: reminder });
          continue;
        }
      }

      if (assistantText.trim() || toolCalls.length) emptyRetries = 0;

      // OmniRoute/Kiro на продолжении «молчит», если tool_calls в истории
      // заданы плоской структурой {id,name,arguments}. Всегда отправляем
      // вложенный OpenAI-формат {id,type,function:{name,arguments}}.
      const historyCalls = toolCalls.map((tc, i) => ({
        id: tc.id || `call_${Date.now()}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}) }
      }));

      ctx.messages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: historyCalls.length ? historyCalls : undefined
      });

      if (!toolCalls.length) {
        push({ type: 'done', text: finalText, usage: streamResult.usage });
        return { ok: true, text: finalText };
      }

      // выполняем инструменты
      let lastCallSig = null;
      let callRepeat = 0;
      for (const call of toolCalls) {
        let params = {};
        if (typeof call.arguments === 'object' && call.arguments !== null) {
          params = call.arguments;
        } else if (call.arguments) {
          try { params = JSON.parse(call.arguments); } catch (_) { params = { _raw: call.arguments }; }
        }

        // защита от зацикливания (если включена): одна и та же команда/файл подряд 3+ раз — стоп
        const sig = call.name + '|' + (typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}));
        if (cfg.loopProtection !== false) {
          if (sig === lastCallSig) callRepeat++; else { lastCallSig = sig; callRepeat = 1; }
          if (callRepeat >= 3) {
            const names = { bash: 'команда', read_file: 'чтение файла', write_file: 'запись файла', edit_file: 'правка файла', delete_file: 'удаление', list_dir: 'список папки', web_search: 'поиск', web_fetch: 'чтение страницы', ask_user: 'опрос' };
            push({
              type: 'error',
              message: 'Модель зациклилась: ' + (names[call.name] || call.name) + ' повторяется без результата. Остановлено, попробуй уточнить задачу или смени модель.'
            });
            return { ok: false, message: 'loop detected: ' + sig };
          }
        }

        // менеджерские инструменты (2.0): управляют работниками проекта локально,
        // без вопросов пользователю — работают только в чатах-менеджерах
        if (isManager && ['create_worker', 'assign_task', 'read_worker', 'project_status'].includes(call.name)) {
          push({ type: 'tool_start', tool: call.name, params, callId: call.id, allowed: true });
          let r;
          try {
            r = await executeManagerTool(call.name, params, { workspaceId, chatId });
            result = r.result;
          } catch (err) {
            result = JSON.stringify({ approved: true, error: err.message });
          }
          push({ type: 'tool_result', tool: call.name, params, callId: call.id, result });
          ctx.messages.push({ role: 'tool', tool_call_id: call.id, content: result });
          // работник мог появиться/обновиться — обновляем дерево проектов в интерфейсе
          if (call.name !== 'read_worker' && call.name !== 'project_status') {
            broadcastProjectChange(workspaceId, chatId);
          }
          continue;
        }

        if (call.name === 'ask_user') {
          // карточка-опрос: показываем рендереру и ждём ответ пользователя
          push({ type: 'tool_start', tool: 'ask_user', params, callId: call.id, allowed: true });
          push({ type: 'poll', callId: call.id, poll: params });
          const answer = await dispatchPoll(sender, sessionId, { callId: call.id, poll: params });
          let result;
          if (answer && answer.aborted) {
            result = JSON.stringify({ approved: false, error: 'Пользователь прервал опрос' });
          } else {
            result = JSON.stringify({ approved: true, picks: answer ? answer.picks : [], custom: answer ? answer.custom : '' });
          }
          push({ type: 'tool_result', tool: 'ask_user', params, callId: call.id, result });
          ctx.messages.push({ role: 'tool', tool_call_id: call.id, content: result });
          
          // После ask_user добавляем напоминание о контексте задачи
          if (answer && !answer.aborted && (answer.picks?.length > 0 || answer.custom)) {
            // Ищем первоначальную задачу в сообщениях пользователя
            const userMessages = ctx.messages.filter(m => m.role === 'user');
            const lastUserTask = userMessages[userMessages.length - 1];
            if (lastUserTask && typeof lastUserTask.content === 'string' && lastUserTask.content.length > 0) {
              // Добавляем напоминание о задаче
              const reminder = `[Напомню: твоя задача была: "${lastUserTask.content.substring(0, 200)}". Теперь продолжай выполнение с учетом ответа пользователя.]`;
              ctx.messages.push({ role: 'user', content: reminder });
            }
          }
          
          continue;
        }

        const approval = await requestApproval(sender, sessionId, { workspaceId, tool: call.name, params });
        push({ type: 'tool_start', tool: call.name, params, callId: call.id, allowed: approval.allow });

        let result;
        if (!approval.allow) {
          result = JSON.stringify({ approved: false, error: 'Пользователь запретил действие' });
        } else {
          try {
            result = await executeTool(call.name, params, workingDir);
          } catch (err) {
            result = JSON.stringify({ approved: true, error: err.message });
          }
        }

        push({ type: 'tool_result', tool: call.name, params, callId: call.id, result });

        ctx.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: result
        });
      }
    }

    push({ type: 'error', message: 'Достигнут лимит раундов инструментов' });
    return { ok: false, message: 'Достигнут лимит раундов' };
  } catch (err) {
    push({ type: 'error', message: err.message });
    return { ok: false, message: err.message };
  } finally {
    if (controllers.get(sessionId) === controller) controllers.delete(sessionId);
    if (pendingPolls.has(sessionId)) pendingPolls.delete(sessionId);
  }
}

// менеджерские инструменты проекта: создание/назначение задач работникам, чтение их чатов.
// Выполняются в main-процессе, потому что им нужен доступ к хранилищу воркспейсов.
async function executeManagerTool(name, params, { workspaceId, chatId }) {
  switch (name) {
    case 'project_status': {
      const proj = workspaces.getChat(workspaceId, chatId);
      const workers = workspaces.listWorkers(workspaceId, chatId);
      return { result: JSON.stringify({ ok: true, project: proj ? { id: proj.id, title: proj.title, status: proj.status, goal: proj.goal } : null, workers: workers.map((w) => ({ id: w.id, title: w.title, task: w.task, status: w.status, updatedAt: w.updatedAt })) }) };
    }
    case 'create_worker': {
      const title = String(params.title || '').trim();
      const task = String(params.task || '').trim();
      if (!task) return { result: JSON.stringify({ ok: false, error: 'worker_task_required' }) };
      const w = workspaces.createWorker(workspaceId, chatId, title, task);
      return { result: JSON.stringify({ ok: true, worker_id: w.id, title: w.title, task: w.task, status: w.status }) };
    }
    case 'assign_task': {
      const workerId = String(params.worker_id || '').trim();
      const task = String(params.task || '').trim();
      const w = workspaces.getChat(workspaceId, workerId);
      if (!w || w.kind !== 'worker') return { result: JSON.stringify({ ok: false, error: 'worker_not_found' }) };
      w.task = task; w.status = 'idle'; w.updatedAt = Date.now();
      workspaces.saveChat(workspaceId, w);
      // автоматический запуск работника в фоне (статус станет running)
      if (task) setTimeout(() => runWorker(workspaceId, w.id), 50);
      return { result: JSON.stringify({ ok: true, worker_id: w.id, status: 'running' }) };
    }
    case 'read_worker': {
      const workerId = String(params.worker_id || '').trim();
      const w = workspaces.getChat(workspaceId, workerId);
      if (!w) return { result: JSON.stringify({ ok: false, error: 'worker_not_found' }) };
      const log = (w.messages || []).slice(-14).map((m) => {
        const c = typeof m.content === 'string' ? m.content : (m.content && m.content.length ? m.content.map((p) => p.text || '').join('\n') : '');
        return (m.role === 'user' ? 'Работник: ' : m.role === 'assistant' ? 'Ответ: ' : 'Инструмент: ') + String(c || '').slice(0, 500);
      });
      return { result: JSON.stringify({ ok: true, worker: { id: w.id, title: w.title, task: w.task, status: w.status, result: (w.result || '').slice(0, 1500) }, log }) };
    }
    default:
      throw new Error('Неизвестный менеджерский инструмент: ' + name);
  }
}

// уведомить рендерер, что дерево проектов изменилось
function broadcastProjectChange(workspaceId, managerId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('project:changed', { workspaceId, managerId });
  }
}

async function executeTool(name, params, wsPath) {
  switch (name) {
    case 'bash':
      return await shell.run(params.command, wsPath);
    case 'read_file':
      return JSON.stringify({ content: await fsx.read(wsPath, params.path) });
    case 'write_file':
      await fsx.write(wsPath, params.path, params.content);
      return JSON.stringify({ ok: true, wrote: params.path });
    case 'edit_file':
      await fsx.edit(wsPath, params.path, params.old_string, params.new_string);
      return JSON.stringify({ ok: true, edited: params.path });
    case 'delete_file':
      await fsx.remove(wsPath, params.path);
      return JSON.stringify({ ok: true, deleted: params.path });
    case 'list_dir':
      return JSON.stringify({ entries: await fsx.list(wsPath, params.path || '') });
    case 'web_search':
      return await webtools.webSearch(params.query);
    case 'web_fetch':
      return await webtools.webFetch(params.url);
    default:
      if (typeof name === 'string' && name.startsWith('mcp__')) {
        return await mcp.call(name, params);
      }
      throw new Error('Неизвестный инструмент: ' + name);
  }
}

ipcMain.handle('agent:start', async (event, payload) => {
  return await runAgent(event.sender, payload);
});

ipcMain.handle('agent:stop', (_e, sessionId) => {
  if (sessionId) {
    const c = controllers.get(sessionId);
    if (c) c.abort();
    if (pendingPolls.has(sessionId)) { pendingPolls.get(sessionId)({ aborted: true }); pendingPolls.delete(sessionId); }
  } else {
    for (const c of controllers.values()) c.abort();
    for (const resolve of pendingPolls.values()) resolve({ aborted: true });
    pendingPolls.clear();
  }
  return true;
});

ipcMain.handle('agent:clearRules', () => {
  sessionRules.length = 0;
  return true;
});

/* ---------- автозапуск работника (2.0) ----------
   Менеджер назначил задачу — работник выполняет её САМ в фоне:
   переписка идёт в его чат, результат сохраняется и уходит менеджеру. */

const workerRuns = new Map(); // workerId -> AbortController

async function runWorker(workspaceId, workerId) {
  const cfg = settings.get();
  const ws = workspaces.get(workspaceId);
  const baseUrl = cfg.baseUrl;
  const apiKey = cfg.apiKey;
  const workingDir = (ws && ws.path) || app.getPath('documents');

  const w = workspaces.getChat(workspaceId, workerId);
  if (!w || w.status === 'running') return;
  w.status = 'running';
  w.updatedAt = Date.now();
  workspaces.saveChat(workspaceId, w);
  broadcastProjectChange(workspaceId, w.managerId);

  const ctx = { messages: [], workingDir };
  const sys = [
    'Ты — работник-исполнитель в составе команды проекта. Ты отвечаешь ТОЛЬКО за свою задачу.',
    'Рабочая папка проекта: ' + workingDir + '. Все пути в инструментах — относительные к ней.',
    'Выполни задачу максимально качественно. Используй инструменты (файлы, терминал), когда это помогает.',
    'В конце обязательно напиши краткий ответ-отчёт: что сделано, какие файлы изменены, что проверить. Без воды.',
    '',
    'Твоя задача:',
    (w.task || '').trim()
  ].join('\n');
  ctx.messages = [{ role: 'system', content: sys }];

  const controller = new AbortController();
  workerRuns.set(workerId, controller);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isBusy = (msg) => {
    if (!msg) return false;
    const s = String(msg).toLowerCase();
    return /(503|429|502|busy|occupied|admission|structure_limit|перегружен|занят|соединение закрыт|overload)/.test(s);
  };

  try {
    let finalText = '';
    let emptyRetries = 0;
    for (let round = 0; round < cfg.maxToolRounds; round++) {
      let streamResult = null;
      let busyAttempts = Math.max(0, cfg.busyRetries || 0);
      while (true) {
        streamResult = await gateway.streamChat({
          baseUrl, apiKey,
          model: cfg.model,
          messages: ctx.messages,
          tools: await toolSet(cfg, false, true),
          temperature: cfg.temperature,
          maxTokens: cfg.maxTokens,
          topP: cfg.topP,
          presencePenalty: cfg.presencePenalty,
          frequencyPenalty: cfg.frequencyPenalty,
          seed: cfg.seed,
          streamIdleMs: cfg.streamIdleMs,
          requestTimeoutMs: cfg.requestTimeoutMs,
          signal: controller.signal
        });
        if (streamResult.aborted) break;
        if (!streamResult.ok && isBusy(streamResult.message) && busyAttempts > 0) {
          busyAttempts--;
          await sleep(cfg.busyRetryDelayMs || 2500);
          continue;
        }
        break;
      }

      if (streamResult.aborted) {
        workspaces.setWorkerStatus(workspaceId, workerId, 'idle');
        broadcastProjectChange(workspaceId, w.managerId);
        return;
      }
      if (!streamResult.ok) {
        const w2 = workspaces.getChat(workspaceId, workerId);
        if (w2) {
          w2.status = 'error';
          w2.result = streamResult.message || 'Ошибка';
          workspaces.saveChat(workspaceId, w2);
        }
        broadcastProjectChange(workspaceId, w.managerId);
        return;
      }

      finalText = streamResult.text || finalText;

      let toolCalls = streamResult.toolCalls || [];
      let assistantText = streamResult.text || '';
      if (!toolCalls.length) {
        const parsed = texttools.parseTextToolCalls(assistantText);
        if (parsed.calls.length) {
          toolCalls = parsed.calls.map((c, i) => ({
            id: `txt_${Date.now()}_${i}`,
            name: c.name,
            arguments: JSON.stringify(c.args || {})
          }));
          assistantText = parsed.cleanText;
          finalText = assistantText;
        }
      }

      if (!toolCalls.length && !assistantText.trim()) {
        if (emptyRetries < Math.max(0, cfg.maxEmptyRetries || 0)) {
          emptyRetries++;
          ctx.messages.push({ role: 'assistant', content: '' });
          ctx.messages.push({ role: 'user', content: '[Твой ответ был пустым. Продолжай выполнение задачи.]' });
          continue;
        }
        const w2 = workspaces.getChat(workspaceId, workerId);
        if (w2) { w2.status = 'error'; w2.result = 'Модель вернула пустой ответ'; workspaces.saveChat(workspaceId, w2); }
        broadcastProjectChange(workspaceId, w.managerId);
        return;
      }
      emptyRetries = 0;

      const historyCalls = toolCalls.map((tc, i) => ({
        id: tc.id || `call_${Date.now()}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}) }
      }));

      ctx.messages.push({
        role: 'assistant',
        content: assistantText || null,
        tool_calls: historyCalls.length ? historyCalls : undefined
      });

      if (!toolCalls.length) {
        // сохраняем результат в чат работника
        const w2 = workspaces.getChat(workspaceId, workerId);
        if (w2) {
          w2.status = 'done';
          w2.result = finalText;
          w2.messages.push(
            { role: 'user', content: w.task },
            { role: 'assistant', content: finalText }
          );
          w2.updatedAt = Date.now();
          workspaces.saveChat(workspaceId, w2);
        }
        broadcastProjectChange(workspaceId, w.managerId);
        return;
      }

      // выполняем инструменты работника без подтверждений (работник автономен по заданию)
      for (const call of toolCalls) {
        let params = {};
        if (typeof call.arguments === 'object' && call.arguments !== null) params = call.arguments;
        else if (call.arguments) { try { params = JSON.parse(call.arguments); } catch (_) { params = { _raw: call.arguments }; } }
        let result;
        try {
          result = await executeTool(call.name, params, workingDir);
        } catch (err) {
          result = JSON.stringify({ approved: true, error: err.message });
        }
        ctx.messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }

    const w2 = workspaces.getChat(workspaceId, workerId);
    if (w2) {
      w2.status = 'error';
      w2.result = 'Достигнут лимит раундов инструментов';
      workspaces.saveChat(workspaceId, w2);
    }
    broadcastProjectChange(workspaceId, w.managerId);
  } catch (err) {
    const w2 = workspaces.getChat(workspaceId, workerId);
    if (w2) { w2.status = 'error'; w2.result = String(err.message || err); workspaces.saveChat(workspaceId, w2); }
    broadcastProjectChange(workspaceId, w.managerId);
  } finally {
    workerRuns.delete(workerId);
  }
}

module.exports = { executeTool, TOOLS };
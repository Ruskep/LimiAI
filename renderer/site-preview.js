/* ============================================================
   SITE PREVIEW (предпросмотр сайта справа)
   Открывается автоматически, когда агент пишет .html файл.
   Site — живой предпросмотр в iframe, Code — код файлов сайта.
   Панель привязана к чату: у каждого чата свой предпросмотр.
   ============================================================ */
const siteState = {
  open: false,
  fullscreen: false,
  url: null,
  rootDir: null,
  relHtml: null,
  files: [],
  currentCodeFile: null,
  view: 'site',
  // perChat: ключ чата -> { url, rootDir, relHtml, open, view }
  perChat: {}
};

const SITE_EXT_RE = /\.(html?|css|js|mjs)$/i;

function siteIsHtml(relPath) {
  return relPath && /\.html?$/i.test(relPath);
}

function sitePanel() { return document.getElementById('site-panel'); }
function siteIframe() { return document.getElementById('site-iframe'); }

function siteRelDir(relPath) {
  const i = relPath.lastIndexOf('/');
  return i >= 0 ? relPath.slice(0, i) : '';
}

/* ---- привязка к чату ---- */

function siteChatKey() {
  const ws = state.activeWorkspace;
  return (ws ? ws.id : 'ws') + ':' + (state.activeChatId || '__new__');
}

// сохранить текущее состояние панели за чатом (вызывается перед переключением)
function siteSaveForChat() {
  const key = siteChatKey();
  if (!siteState.open) { delete siteState.perChat[key]; return; }
  siteState.perChat[key] = {
    url: siteState.url,
    rootDir: siteState.rootDir,
    relHtml: siteState.relHtml,
    open: true,
    view: siteState.view,
    fullscreen: false
  };
}

// синхронизировать панель с активным чатом (вызывается после переключения)
async function siteSyncToChat() {
  const key = siteChatKey();
  const saved = siteState.perChat[key];
  const panel = sitePanel();
  if (!panel) return;
  if (!saved || !saved.relHtml) {
    // у этого чата нет сайта — закрываем панель
    siteState.open = false;
    siteState.fullscreen = false;
    panel.classList.remove('open', 'fullscreen');
    setTimeout(() => { if (!siteState.open) panel.classList.add('hidden'); }, 280);
    return;
  }
  // восстановить предпросмотр этого чата
  const ws = state.activeWorkspace;
  // ВСЕГДА перезапрашиваем URL у сервера: сервер один на воркспейс, и при
  // переключении между воркспейсами порт мог смениться (старый URL мёртв ->
  // белый экран). siteOpen дешёвый: если сервер уже на этом root, вернёт тот же URL.
  let url = saved.url;
  if (!ws || !ws.path) return;
  try {
    const r = await api.siteOpen({ dir: ws.path });
    if (!r || !r.url) throw new Error('no url');
    url = r.url;
    saved.url = url;
    saved.rootDir = ws.path;
  } catch (e) {
    showToast('Не удалось запустить предпросмотр сайта', 'error');
    return;
  }
  siteState.open = true;
  siteState.fullscreen = false;
  siteState.url = url;
  siteState.rootDir = saved.rootDir;
  siteState.relHtml = saved.relHtml;
  siteState.view = saved.view || 'site';

  panel.classList.remove('hidden');
  void panel.offsetWidth; // перезапуск CSS-перехода
  panel.classList.add('open');
  panel.classList.remove('fullscreen');

  const fileEl = document.getElementById('site-panel-file');
  if (fileEl) fileEl.textContent = saved.relHtml;

  setSiteIframe(url + saved.relHtml);
  switchSiteView(siteState.view, true);
  updateFsIcon();
}

/* ---- открытие / закрытие ---- */

// Умное открытие предпросмотра: html — сразу; css/js — если панель ещё не открыта,
// ищем index.html рядом и показываем его (чтобы сайт появлялся, даже когда модель
// сначала пишет стили/скрипты). Вызывается из renderer.js на каждую запись файла.
async function maybeOpenSitePreview(tool, params) {
  const relPath = params && params.path;
  if (!relPath) return;
  if (siteIsHtml(relPath)) {
    openSitePreview(relPath);
    return;
  }
  if (!SITE_EXT_RE.test(relPath) || siteState.open) return;
  const ws = state.activeWorkspace;
  if (!ws || !ws.path) return;
  const dir = siteRelDir(relPath);
  try {
    const r = await api.fsxList({ workspaceId: ws.id, relPath: dir });
    const entries = (r && r.entries) || [];
    const idx = entries.find((e) => e.type === 'file' && /^index\.html?$/i.test(e.name));
    if (idx) openSitePreview((dir ? dir + '/' : '') + idx.name);
  } catch (_) {}
}

async function openSitePreview(relHtml) {
  const ws = state.activeWorkspace;
  if (!ws || !ws.path) {
    showToast('Для предпросмотра сайта открой папку проекта (кнопка «Добавить папку» слева)', 'warning', 6000);
    return;
  }
  const dir = ws.path;
  // Всегда запрашиваем живой URL у сервера (если сервер уже на этом root —
  // вернёт тот же URL; если порт сменился — получим актуальный).
  let url;
  try {
    const r = await api.siteOpen({ dir });
    if (!r || !r.url) throw new Error('no url');
    url = r.url;
  } catch (e) {
    showToast('Не удалось запустить предпросмотр сайта', 'error');
    return;
  }
  siteState.url = url;
  siteState.rootDir = dir;
  siteState.relHtml = relHtml;
  siteState.open = true;
  siteState.view = 'site';

  const panel = sitePanel();
  panel.classList.remove('hidden');
  void panel.offsetWidth; // перезапуск CSS-перехода (плавный выезд)
  panel.classList.add('open');

  const fileEl = document.getElementById('site-panel-file');
  if (fileEl) fileEl.textContent = relHtml;

  setSiteIframe(url + relHtml);
  switchSiteView('site', true);
  updateFsIcon();

  // если открыта вкладка Code — обновить список файлов
  const codeView = document.getElementById('site-view-code');
  if (codeView && !codeView.classList.contains('hidden')) {
    refreshSiteFiles();
  }
}

function setSiteIframe(src) {
  const ifr = siteIframe();
  if (!ifr) return;
  if (ifr.src !== src) {
    const loading = document.getElementById('site-loading');
    const errEl = document.getElementById('site-load-error');
    if (loading) loading.classList.remove('hidden');
    if (errEl) errEl.classList.add('hidden');
    clearTimeout(ifr._loadTimer);
    ifr._loadTimer = setTimeout(() => {
      // iframe не сообщил о загрузке — показываем ошибку вместо белого экрана
      if (loading) loading.classList.add('hidden');
      if (errEl) errEl.classList.remove('hidden');
    }, 10000);
    ifr.onload = () => {
      clearTimeout(ifr._loadTimer);
      if (loading) loading.classList.add('hidden');
      if (errEl) errEl.classList.add('hidden');
    };
    ifr.src = src;
  }
}

function reloadSitePreview() {
  if (!siteState.open || !siteState.url) return;
  const sep = siteState.relHtml.includes('?') ? '&' : '?';
  setSiteIframe(siteState.url + siteState.relHtml + sep + '_t=' + Date.now());
}

function closeSitePanel() {
  const panel = sitePanel();
  if (!panel) return;
  // закрыли панель — забываем предпросмотр этого чата, чтобы при
  // переключении туда-сюда он не «воскрес»
  delete siteState.perChat[siteChatKey()];
  panel.classList.remove('open');
  setTimeout(() => {
    if (!siteState.open) panel.classList.add('hidden');
  }, 280);
  siteState.open = false;
  siteState.fullscreen = false;
  panel.classList.remove('fullscreen');
  updateFsIcon();
  const btn = document.getElementById('site-fullscreen-btn');
  if (btn) btn.classList.remove('fullscreen-active');
}

function toggleSiteFullscreen() {
  const panel = sitePanel();
  if (!panel || !siteState.open) return;
  siteState.fullscreen = !siteState.fullscreen;
  panel.classList.toggle('fullscreen', siteState.fullscreen);
  const btn = document.getElementById('site-fullscreen-btn');
  if (btn) btn.classList.toggle('fullscreen-active', siteState.fullscreen);
  updateFsIcon();
}

function updateFsIcon() {
  const exp = document.getElementById('site-fs-icon-expand');
  const col = document.getElementById('site-fs-icon-collapse');
  if (exp) exp.style.display = siteState.fullscreen ? 'none' : '';
  if (col) col.style.display = siteState.fullscreen ? '' : 'none';
}

function switchSiteView(view, silent) {
  const tabs = document.querySelectorAll('.site-tab');
  for (const t of tabs) t.classList.toggle('active', t.dataset.siteView === view);
  const siteView = document.getElementById('site-view-site');
  const codeView = document.getElementById('site-view-code');
  const isCode = view === 'code';
  if (siteView) siteView.classList.toggle('hidden', isCode);
  if (codeView) codeView.classList.toggle('hidden', !isCode);
  if (!silent) siteState.view = view;
  if (isCode) refreshSiteFiles();
}

async function refreshSiteFiles() {
  const ws = state.activeWorkspace;
  if (!ws) return;
  const dir = siteRelDir(siteState.relHtml || '');
  let entries = [];
  try {
    const r = await api.fsxList({ workspaceId: ws.id, relPath: dir });
    entries = (r && r.entries) || [];
  } catch (_) {}
  const files = entries
    .filter((e) => e.type === 'file' && SITE_EXT_RE.test(e.name))
    .map((e) => ({ path: (dir ? dir + '/' : '') + e.name, name: e.name }));
  files.sort((a, b) => {
    const ai = a.name === 'index.html' ? 0 : 1;
    const bi = b.name === 'index.html' ? 0 : 1;
    return ai - bi || a.name.localeCompare(b.name);
  });
  siteState.files = files;
  renderSiteCodeTabs();
  if (!siteState.currentCodeFile || !files.some((f) => f.path === siteState.currentCodeFile)) {
    if (files.length) loadSiteCodeFile(files[0].path);
  } else {
    loadSiteCodeFile(siteState.currentCodeFile);
  }
}

function renderSiteCodeTabs() {
  const wrap = document.getElementById('site-code-tabs');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!siteState.files.length) {
    const empty = document.createElement('div');
    empty.className = 'site-panel-empty';
    empty.textContent = i18nT('siteNoFiles');
    wrap.appendChild(empty);
    return;
  }
  for (const f of siteState.files) {
    const b = document.createElement('button');
    b.className = 'site-code-tab' + (f.path === siteState.currentCodeFile ? ' active' : '');
    b.textContent = f.path;
    b.title = f.path;
    b.addEventListener('click', () => loadSiteCodeFile(f.path));
    wrap.appendChild(b);
  }
}

async function loadSiteCodeFile(filePath) {
  siteState.currentCodeFile = filePath;
  const ws = state.activeWorkspace;
  const codeEl = document.getElementById('site-code');
  const preEl = document.getElementById('site-code-pre');
  if (!ws || !codeEl) return;
  try {
    const r = await api.fsxRead({ workspaceId: ws.id, relPath: filePath });
    codeEl.textContent = (r && r.content) || '';
    if (preEl) preEl.classList.remove('hidden');
  } catch (_) {
    codeEl.textContent = '// ' + filePath + '\n' + i18nT('siteNoFiles');
  }
  renderSiteCodeTabs();
}

// обновление в реальном времени: файл сайта изменился — перезагружаем iframe
api.onSiteChanged(() => {
  if (siteState.open) reloadSitePreview();
});

// ГЛАВНОЕ: renderer.js вызывает window.maybeOpenSitePreview при записи .html/.css/.js.
// Без этого присвоения панель НИКОГДА не открывалась (typeof === 'function' был false).
window.maybeOpenSitePreview = maybeOpenSitePreview;

if (!window.__sitePreviewReady) {
  window.__sitePreviewReady = true;
  document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('site-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeSitePanel);
    const fsBtn = document.getElementById('site-fullscreen-btn');
    if (fsBtn) fsBtn.addEventListener('click', toggleSiteFullscreen);
    const tabs = document.querySelectorAll('.site-tab');
    for (const t of tabs) t.addEventListener('click', () => switchSiteView(t.dataset.siteView));
    const errBtn = document.getElementById('site-load-error-btn');
    if (errBtn) errBtn.addEventListener('click', () => {
      const errEl = document.getElementById('site-load-error');
      if (errEl) errEl.classList.add('hidden');
      reloadSitePreview();
    });
  });
}
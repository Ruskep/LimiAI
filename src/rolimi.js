/**
 * ROLimi — интеграция с Roblox Studio
 * 
 * Этот модуль управляет подключением к Roblox Studio через MCP-протокол.
 * Работает с официальным MCP-сервером Roblox Studio (mcp.bat).
 */

const rolimiMcp = require('./rolimi-mcp');

let status = {
  serverRunning: false,
  robloxConnected: false,
  error: null
};

/**
 * Инициализировать ROLimi (проверить наличие Roblox Studio)
 */
function init() {
  if (rolimiMcp.isRobloxStudioInstalled()) {
    status.robloxConnected = false;
    status.error = null;
    return { installed: true };
  } else {
    status.error = 'Roblox Studio не установлен';
    return { installed: false, error: status.error };
  }
}

/**
 * Запустить MCP-сервер для ROLimi
 */
async function start() {
  try {
    const result = await rolimiMcp.start();
    status.serverRunning = true;
    status.robloxConnected = true;
    status.error = null;
    return result;
  } catch (err) {
    status.serverRunning = false;
    status.robloxConnected = false;
    status.error = err.message;
    throw err;
  }
}

/**
 * Остановить MCP-сервер
 */
function stop() {
  rolimiMcp.stop();
  status.serverRunning = false;
  status.robloxConnected = false;
  status.error = null;
}

/**
 * Получить текущий статус подключения
 */
function getStatus() {
  const mcpStatus = rolimiMcp.getStatus();
  status.serverRunning = mcpStatus.serverRunning;
  status.robloxConnected = mcpStatus.robloxConnected;
  status.error = mcpStatus.error;
  return status;
}

/**
 * Проверить, установлен ли Roblox Studio
 */
function isRobloxStudioInstalled() {
  return rolimiMcp.isRobloxStudioInstalled();
}

/**
 * Проверить, является ли инструмент ROLimi-инструментом
 * (для пропуска подтверждений — Roblox Studio MCP официальные инструменты безопасны)
 */
function isRoliTool(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  // Официальные инструменты Roblox Studio MCP имеют префикс roblox_studio__
  // Инструменты из rolimi-mcp.js имеют префикс rolox_
  return toolName.startsWith('mcp__roblox_studio__') || 
         toolName.startsWith('mcp__rolimi__') ||
         toolName.startsWith('rolox_');
}

/**
 * Получить MCP-конфиг для подключения к Roblox Studio
 */
function getMcpConfig() {
  return rolimiMcp.getMcpConfig();
}

/**
 * Системный промт для ROLimi — Limi понимает контекст Roblox Studio
 */
function getSystemPrompt() {
  return `## Ты работаешь с Roblox Studio

Ты подключен к Roblox Studio через MCP и можешь напрямую взаимодействовать с игрой:
- читать и редактировать Lua/Luau скрипты (ServerScripts, LocalScripts, ModuleScripts)
- искать объекты в DataModel (Workspace, ReplicatedStorage, ServerScriptService и т.д.)
- выполнять Luau код прямо в Studio
- запускать/останавливать плейтесты
- генерировать меши и материалы
- искать и вставлять ассеты из Toolbox
- делать скриншоты из Studio

**Язык скриптов:** Luau (расширенный Lua 5.1 с типизацией)

**Структура игры:**
- Workspace — игровой мир (Part, Model, NPC, Terrain)
- ReplicatedStorage — общие ресурсы (модули, события, значения)
- ServerScriptService — серверные скрипты
- StarterPlayerScripts — клиентские скрипты игрока
- StarterGui — UI-экраны
- Lighting — освещение

**Лучшие практики Roblox:**
1. Используй :WaitForChild() вместо прямого доступа к потомкам
2. Проверяй типы через typeof() и :IsA()
3. Серверная логика — в ServerScriptService, клиентская — в StarterPlayerScripts
4. Общие модули — в ReplicatedStorage
5. Используй RemoteEvent/RemoteFunction для клиент-серверного общения

**При создании скриптов:**
- Давай понятные имена (GameController, PlayerManager, DataStore)
- Добавляй комментарии к ключевым функциям
- Следуй Roblox Lua Style Guide

Ты — помощник Roblox-разработчика. Помогаешь создавать игры, исправлять баги, оптимизировать код.`;
}

module.exports = {
  init,
  start,
  stop,
  getStatus,
  isRobloxStudioInstalled,
  isRoliTool,
  getMcpConfig,
  getSystemPrompt
};

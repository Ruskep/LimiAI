/**
 * ROLimi MCP — интеграция с Roblox Studio через официальный MCP-сервер
 * 
 * Roblox Studio имеет встроенный MCP-сервер, который запускается через:
 * cmd.exe /c %LOCALAPPDATA%\Roblox\mcp.bat
 * 
 * Документация: https://create.roblox.com/docs/studio/mcp
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const mcp = require('./mcp');

let mcpProcess = null;
let status = {
  serverRunning: false,
  robloxConnected: false,
  error: null
};

/**
 * Получить путь к mcp.bat
 */
function getMcpBatPath() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Roblox', 'mcp.bat');
}

/**
 * Проверить, установлен ли Roblox Studio (есть ли mcp.bat)
 */
function isRobloxStudioInstalled() {
  const mcpPath = getMcpBatPath();
  const fs = require('fs');
  return fs.existsSync(mcpPath);
}

/**
 * Запустить MCP-сервер Roblox Studio
 */
async function start() {
  if (mcpProcess) {
    return { alreadyRunning: true };
  }

  const mcpPath = getMcpBatPath();
  
  // Проверяем наличие файла
  const fs = require('fs');
  if (!fs.existsSync(mcpPath)) {
    status.error = 'Roblox Studio не установлен или MCP недоступен';
    throw new Error(status.error);
  }

  return new Promise((resolve, reject) => {
    try {
      // Запускаем mcp.bat через cmd.exe
      mcpProcess = spawn('cmd.exe', ['/c', mcpPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      let initialized = false;

      mcpProcess.stdout.on('data', (data) => {
        if (!initialized) {
          initialized = true;
          status.serverRunning = true;
          status.robloxConnected = true;
          status.error = null;
          resolve({ 
            success: true, 
            pid: mcpProcess.pid,
            message: 'MCP-сервер Roblox Studio запущен'
          });
        }
      });

      mcpProcess.stderr.on('data', (data) => {
        console.error('[ROLimi MCP] stderr:', data.toString());
      });

      mcpProcess.on('error', (err) => {
        status.serverRunning = false;
        status.robloxConnected = false;
        status.error = err.message;
        if (!initialized) {
          reject(err);
        }
      });

      mcpProcess.on('close', (code) => {
        mcpProcess = null;
        status.serverRunning = false;
        status.robloxConnected = false;
        if (code !== 0 && code !== null) {
          status.error = `MCP-сервер завершился с кодом ${code}`;
        }
      });

      // Таймаут инициализации (10 секунд)
      setTimeout(() => {
        if (!initialized) {
          initialized = true;
          status.serverRunning = true;
          status.robloxConnected = true;
          status.error = null;
          resolve({ 
            success: true, 
            message: 'MCP-сервер запущен (без подтверждения от Studio)'
          });
        }
      }, 10000);

    } catch (err) {
      status.error = err.message;
      reject(err);
    }
  });
}

/**
 * Остановить MCP-сервер
 */
function stop() {
  if (mcpProcess) {
    try {
      mcpProcess.kill();
    } catch (err) {
      console.error('[ROLimi MCP] Error stopping:', err.message);
    }
    mcpProcess = null;
  }
  status.serverRunning = false;
  status.robloxConnected = false;
  status.error = null;
}

/**
 * Получить статус подключения
 */
function getStatus() {
  return { ...status };
}

/**
 * Получить конфиг MCP-сервера для подключения через mcp.js
 * Это используется в main.js для добавления Roblox MCP в список серверов
 */
function getMcpConfig() {
  const mcpPath = getMcpBatPath();
  return {
    id: 'roblox_studio',
    name: 'Roblox Studio',
    command: `cmd.exe /c "${mcpPath}"`,
    enabled: true,
    transport: 'stdio'
  };
}

/**
 * Получить список инструментов Roblox Studio
 * (реальные инструменты приходят от MCP-сервера при подключении)
 */
function getToolDescriptions() {
  return [
    { name: 'script_read', desc: 'Прочитать Lua-скрипт из Studio' },
    { name: 'script_multi_edit', desc: 'Редактировать несколько скриптов' },
    { name: 'script_search', desc: 'Найти скрипты по шаблону' },
    { name: 'execute_luau', desc: 'Выполнить Luau код в Studio' },
    { name: 'search_game_tree', desc: 'Найти объекты в DataModel' },
    { name: 'inspect_instance', desc: 'Получить свойства объекта' },
    { name: 'screen_capture', desc: 'Скриншот из Studio' },
    { name: 'start_stop_play', desc: 'Запустить/остановить плейтест' },
    { name: 'mesh_generate', desc: 'Сгенерировать 3D-меш' },
    { name: 'material_generate', desc: 'Сгенерировать материал' },
    { name: 'asset_search', desc: 'Найти ассет в Toolbox' },
    { name: 'asset_insert', desc: 'Вставить ассет в игру' },
    { name: 'http_get', desc: 'HTTP-запрос к API Roblox' }
  ];
}

module.exports = {
  start,
  stop,
  getStatus,
  getMcpConfig,
  getMcpBatPath,
  isRobloxStudioInstalled,
  getToolDescriptions
};

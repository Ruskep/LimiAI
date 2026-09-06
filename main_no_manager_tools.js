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

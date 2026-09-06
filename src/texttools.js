// Распознавание «текстовых» вызовов инструментов в формате Claude Code / антропных скилов:
//   <tool_calls> <invoke name="Bash"> <parameter name="command">dir</parameter> </invoke> </tool_calls>
//   а также antml: префикс, <|tool_calls|>, fullwidth ＜＞｜亖 и БЕЗ закрывающих тегов
//   (модели часто обрывают блок, не дописав </invoke></tool_calls>).
// Возвращает { calls: [{name, args}], cleanText } — текст без блоков вызовов.

function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

function mapToolName(raw) {
  const key = String(raw || '').trim().toLowerCase();
  const map = {
    // bash/terminal commands
    'bash': 'bash', 'shell': 'bash', 'terminal': 'bash', 'cmd': 'bash', 
    'powershell': 'bash', 'command': 'bash', 'run': 'bash', 'execute': 'bash',
    
    // file operations
    'read_file': 'read_file', 'readfile': 'read_file', 'read': 'read_file',
    'readfile': 'read_file', 'openfile': 'read_file', 'cat': 'read_file',
    
    'write_file': 'write_file', 'writefile': 'write_file', 'write': 'write_file',
    'createfile': 'write_file', 'savefile': 'write_file',
    
    'edit_file': 'edit_file', 'editfile': 'edit_file', 'edit': 'edit_file',
    'updatefile': 'edit_file', 'modifyfile': 'edit_file', 'multiedit': 'edit_file',
    'replace': 'edit_file',
    
    'delete_file': 'delete_file', 'deletefile': 'delete_file', 'delete': 'delete_file',
    'removefile': 'delete_file', 'rm': 'delete_file', 'del': 'delete_file',
    
    'list_dir': 'list_dir', 'listdir': 'list_dir', 'list': 'list_dir',
    'ls': 'list_dir', 'dir': 'list_dir', 'glob': 'list_dir', 'files': 'list_dir',
    
    // web operations
    'web_search': 'web_search', 'websearch': 'web_search', 'search': 'web_search',
    'internet_search': 'web_search', 'duckduckgo': 'web_search',
    
    'web_fetch': 'web_fetch', 'webfetch': 'web_fetch', 'fetch': 'web_fetch',
    'read_url': 'web_fetch', 'scrape': 'web_fetch',
    
    // user interaction
    'ask_user': 'ask_user', 'askuser': 'ask_user', 'poll': 'ask_user',
    'question': 'ask_user', 'survey': 'ask_user',
    
    // manager tools
    'project_status': 'project_status', 'projectstatus': 'project_status',
    'status': 'project_status',
    
    'create_worker': 'create_worker', 'createworker': 'create_worker',
    'new_worker': 'create_worker',
    
    'assign_task': 'assign_task', 'assigntask': 'assign_task',
    'task': 'assign_task',
    
    'read_worker': 'read_worker', 'readworker': 'read_worker',
    'worker_log': 'read_worker'
  };
  return map[key] || null;
}

// приводит параметры антропного формата к параметрам наших функций
function normalizeParams(tool, params) {
  const p = { ...params };
  if (tool === 'bash') {
    if (!p.command && p.cmd) p.command = p.cmd;
    delete p.description;
    return p;
  }
  if (tool === 'read_file' || tool === 'delete_file') {
    if (!p.path && p.file_path) p.path = p.file_path;
    if (p.path && p.path.startsWith('.') && p.path !== './') p.path = p.path.replace(/^\.\//, '');
    return p;
  }
  if (tool === 'write_file') {
    if (!p.path && p.file_path) p.path = p.file_path;
    if (!p.content) p.content = p.body || p.text || '';
    return p;
  }
  if (tool === 'edit_file') {
    if (!p.path && p.file_path) p.path = p.file_path;
    if (!p.old_string) p.old_string = p.old || p.search || '';
    if (!p.new_string) p.new_string = p.new || p.replacement || p.replace || '';
    return p;
  }
  if (tool === 'list_dir') {
    if (!p.path) p.path = p.directory || p.dir || '';
    return p;
  }
  return p;
}

function parseTextToolCalls(text) {
  if (!text || typeof text !== 'string') return { calls: [], cleanText: text || '' };

  // нормализация: fullwidth ＜＞｜亖 → ASCII, убираем antml: и | обёртки
  let t = String(text)
    .replace(/[＜＞]/g, (m) => (m === '＜' ? '<' : '>'))
    .replace(/[｜]/g, '|')
    .replace(/亖/gi, '#')
    .replace(/<\s*\|?\s*antml:\s*/gi, '<')
    .replace(/<\/\s*\|?\s*antml:\s*/gi, '</')
    .replace(/<\|/g, '<')
    .replace(/<\/\|/g, '</')
    .replace(/\|>/g, '>')
    .replace(/\|\s*>/g, '>');

  // Дополнительная нормализация: обработка различных форматов вызовов
  // 1. Формат Anthropic: <tool_calls><invoke name="tool"><parameter name="param">value</parameter></invoke></tool_calls>
  // 2. Формат OpenAI-style: {"name": "tool", "arguments": {"param": "value"}}
  // 3. Простой формат: [TOOL: tool] {param: value}
  
  // Сначала пробуем парсить JSON-формат
  let callsFromJson = [];
  try {
    // Ищем JSON-подобные структуры в тексте
    const jsonRegex = /\{[\s\n]*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    let jsonMatch;
    while ((jsonMatch = jsonRegex.exec(t)) !== null) {
      try {
        const name = jsonMatch[1];
        const args = JSON.parse(jsonMatch[2]);
        if (name && args) {
          const mappedName = mapToolName(name);
          if (mappedName) {
            callsFromJson.push({ name: mappedName, args: normalizeParams(mappedName, args) });
          }
        }
      } catch (e) {
        // Пропускаем некорректные JSON
      }
    }
  } catch (e) {
    // Игнорируем ошибки парсинга JSON
  }

  // позиции открывающих <invoke ... name="X">
  const invokes = [];
  const invokeOpenRe = /<\s*invoke\s+name\s*=\s*["']?([^\s"'|>]+)["']?\s*(?:>|$)/gi;
  let m;
  while ((m = invokeOpenRe.exec(t)) !== null) {
    invokes.push({ name: m[1].trim(), index: m.index, rawEnd: m.index + m[0].length });
  }

  // Если есть вызовы из JSON и нет XML-вызовов, используем JSON
  if (callsFromJson.length > 0 && invokes.length === 0) {
    // Найдем и удалим JSON вызовы из текста
    const jsonCallRegex = /\{[\s\n]*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    let cleanText = t.replace(jsonCallRegex, '').trim();
    cleanText = cleanText
      .replace(/^\s*[\r\n]+/, '')
      .replace(/\s*$/, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { calls: callsFromJson, cleanText };
  }

  if (!invokes.length) return { calls: [], cleanText: t.trim() };

  // разделим t на сегменты по открывающим тегам
  const segments = [];
  for (let i = 0; i <= invokes.length; i++) {
    const start = i === 0 ? 0 : invokes[i - 1].rawEnd;
    const end = i === invokes.length ? t.length : invokes[i].index;
    segments.push({ text: t.slice(start, end) });
  }

  const calls = [];
  let firstRemove = null;
  let lastRemove = -1;

  for (let i = 0; i < invokes.length; i++) {
    const inv = invokes[i];
    const body = segments[i + 1].text;
    const rawName = inv.name;
    const name = mapToolName(rawName);
    if (!name) continue;

    if (firstRemove === null) firstRemove = inv.index;

    // параметры: <parameter name="K" ...>value</parameter> либо value до следующего <parameter/<invoke/</...>
    const params = {};
    const paramRe = /<\s*parameter\s+name\s*=\s*["']?([^\s"'|>]+)["']?(?:\s+[^>]*?)?\s*>([\s\S]*?)(?=<\s*\/\s*parameter\b|<\s*parameter\b|<\s*\/\s*invoke\b|<\s*\/\s*tool_calls\b|<\s*invoke\b|$)/gi;
    let pm;
    while ((pm = paramRe.exec(body)) !== null) {
      const key = pm[1].trim().toLowerCase();
      let val = unescapeHtml(pm[2]).trim();
      val = val.replace(/<\s*\/?\s*(?:antml:)?(?:parameter|invoke|tool_calls|function_calls)\b[^>]*>/gi, ' ').trim();
      params[key] = val;
    }

    // также пробуем парсить параметры в виде JSON внутри invoke
    const jsonInInvokeRegex = /<\s*invoke[^>]*>([\s\S]*?)<\s*\/\s*invoke\b/i;
    const jsonMatch = body.match(jsonInInvokeRegex);
    if (jsonMatch) {
      const innerContent = jsonMatch[1];
      // Ищем JSON внутри
      const innerJsonRegex = /\{[\s\S]*?\}/g;
      let innerJsonMatch;
      while ((innerJsonMatch = innerJsonRegex.exec(innerContent)) !== null) {
        try {
          const jsonObj = JSON.parse(innerJsonMatch[0]);
          Object.assign(params, jsonObj);
        } catch (e) {
          // Игнорируем некорректн��й JSON
        }
      }
    }

    // граница удаления блока: закрывающий тег после этого invoke, либо следующий invoke, либо конец
    const closeMatch = body.match(/<\s*\/\s*(?:invoke|tool_calls|function_calls)\b/i);
    if (closeMatch) {
      lastRemove = Math.max(lastRemove, inv.index + body.indexOf(closeMatch[0]) + closeMatch[0].length);
    } else if (i + 1 < invokes.length) {
      lastRemove = Math.max(lastRemove, invokes[i + 1].index);
    } else {
      lastRemove = Math.max(lastRemove, inv.index + body.length);
    }

    calls.push({ name, args: normalizeParams(name, params) });
  }

  if (firstRemove === null) return { calls, cleanText: t.trim() };

  let cleanText = t.slice(0, firstRemove) + t.slice(lastRemove);
  cleanText = cleanText
    .replace(/^\s*[\r\n]+/, '')
    .replace(/\s*$/, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { calls, cleanText };
}

module.exports = { parseTextToolCalls, mapToolName, normalizeParams };
const fs = require('fs');
const path = require('path');

const PLAN_FILE = '.limi-plan.md';

function resolveDir(wsPath, userDataPath) {
  if (wsPath) return wsPath;
  return path.join(userDataPath || '', 'plans');
}

function planPath(wsPath, userDataPath) {
  return path.join(resolveDir(wsPath, userDataPath), PLAN_FILE);
}

function read(wsPath, userDataPath) {
  try {
    return fs.readFileSync(planPath(wsPath, userDataPath), 'utf8');
  } catch (_) {
    return '';
  }
}

function write(wsPath, content, userDataPath) {
  const dir = resolveDir(wsPath, userDataPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PLAN_FILE), String(content || ''), 'utf8');
  return true;
}

module.exports = { read, write, PLAN_FILE };

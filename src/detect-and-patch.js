import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync, readdirSync, copyFileSync } from 'fs';
import { dirname, join, basename } from 'path';
import { IS_WINDOWS, HOME, PATCH_MARKER, BACKUP_PREFIX } from './utils.js';

// ─── Detection ──────────────────────────────────────────

export function isJavaScriptFile(filePath) {
  try {
    if (IS_WINDOWS && /\.(cmd|bat)$/i.test(filePath)) return false;
    const buffer = readFileSync(filePath);
    const firstTwo = buffer.slice(0, 2).toString();
    if (firstTwo === '#!' && buffer.length < 500) return false;
    if (firstTwo === '#!') return true;
    if (firstTwo === 'MZ') return false;
    if (buffer.slice(0, 5).toString().toLowerCase() === '@echo') return false;
    const magic = buffer.slice(0, 4).toString('hex');
    if (['cafebabe', 'cffaedfe', 'cefaedfe'].includes(magic)) return false;
    if (magic === '7f454c46') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all Claude Code installations on the system.
 * This searches via which/where and common npm paths.
 */
export function findAllClaudeInstallations() {
  const installations = [];

  // Find via which/where
  try {
    const cmd = IS_WINDOWS ? 'where claude' : '/bin/bash -c "which -a claude 2>/dev/null"';
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    for (const p of result.split('\n').filter(x => x.trim())) {
      try {
        const normalized = p.trim().replace(/\r/g, '');
        const realPath = realpathSync(normalized);
        if (existsSync(realPath) && !installations.find(i => i.path === realPath)) {
          const isJS = isJavaScriptFile(realPath);
          installations.push({
            path: realPath,
            symlink: normalized !== realPath ? normalized : null,
            isJavaScript: isJS,
            type: isJS ? 'npm' : 'binary',
          });
        }
      } catch {}
    }
  } catch {}

  // Common npm paths
  const npmPaths = [];

  if (IS_WINDOWS) {
    const appData = process.env.APPDATA || join(HOME, 'AppData/Roaming');
    npmPaths.push(join(appData, 'npm/node_modules/@anthropic-ai/claude-code/cli.js'));
  } else {
    npmPaths.push(
      join(HOME, '.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
      '/usr/local/node/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
      join(HOME, 'node_modules/@anthropic-ai/claude-code/cli.js'),
    );
  }

  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    npmPaths.unshift(join(npmRoot, '@anthropic-ai/claude-code/cli.js'));
  } catch {}

  for (const p of npmPaths) {
    try {
      if (existsSync(p) && !installations.find(i => i.path === p)) {
        installations.push({ path: p, symlink: null, isJavaScript: true, type: 'npm' });
      }
    } catch {}
  }

  return installations;
}

/**
 * Find the active Claude CLI that the system is currently using.
 * Returns the real path to cli.js if it's a JavaScript file.
 */
export function findSystemClaudeCli() {
  // First try: find via which/where (the one the user actually runs)
  try {
    const cmd = IS_WINDOWS ? 'where claude' : '/bin/bash -c "which claude"';
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0].replace(/\r/g, '');
    const realPath = realpathSync(result);
    if (isJavaScriptFile(realPath)) return realPath;
  } catch {}

  // Second try: find any npm installation
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);
  if (jsInstall) return jsInstall.path;

  throw new Error(
    'No patchable Claude Code installation found.\n\n' +
    'Please install Claude Code first:\n' +
    '  npm install -g @anthropic-ai/claude-code\n\n' +
    'Then run: cc-vietnamese patch'
  );
}

export function getActiveClaudeInfo() {
  try {
    const cmd = IS_WINDOWS ? 'where claude' : '/bin/bash -c "which claude"';
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0].replace(/\r/g, '');
    const realPath = realpathSync(result);
    const isJS = isJavaScriptFile(realPath);
    let version = 'unknown';
    try {
      version = execSync('claude --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    } catch {}
    return {
      path: realPath,
      symlink: result !== realPath ? result : null,
      isJavaScript: isJS,
      type: isJS ? 'npm' : 'binary',
      version,
    };
  } catch {
    return null;
  }
}

export function getNativeVersionDir() {
  const dir = join(HOME, '.local/share/claude/versions');
  if (!existsSync(dir)) return null;
  return dir;
}

// ─── Patch Logic ────────────────────────────────────────

export function isPatched(content) {
  return content.includes(PATCH_MARKER);
}

export function getClaudeVersion(content) {
  const match = content.match(/\/\/ Version: ([\d.]+)/);
  return match ? match[1] : 'unknown';
}

export function createBackup(cliPath) {
  const dir = dirname(cliPath);
  const name = basename(cliPath, '.js');
  const backupPath = join(dir, `${BACKUP_PREFIX}${Date.now()}.${name}.js`);
  copyFileSync(cliPath, backupPath);
  return backupPath;
}

export function findLatestBackup(cliPath) {
  const dir = dirname(cliPath);
  const files = readdirSync(dir)
    .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js'))
    .sort().reverse();
  return files.length > 0 ? join(dir, files[0]) : null;
}

export function listBackups(cliPath) {
  try {
    return readdirSync(dirname(cliPath))
      .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js'))
      .sort().reverse();
  } catch { return []; }
}

function generatePatch(keyVar, inputVar, cursorVar, textUpdateFunc, offsetFunc, cb1, cb2) {
  let p = `if(!${keyVar}.backspace&&!${keyVar}.delete&&(${inputVar}.includes("\\x7f")||${inputVar}.includes("\\x08"))){${PATCH_MARKER}`;
  p += `let _v=${cursorVar};`;
  p += `for(let _i=0;_i<${inputVar}.length;_i++){`;
  p += `let _c=${inputVar}.charCodeAt(_i);`;
  p += `if(_c===127||_c===8){_v=_v.deleteTokenBefore?.()??_v.backspace()}`;
  p += `else{_v=_v.insert(${inputVar}[_i])}`;
  p += `}`;
  p += `if(!${cursorVar}.equals(_v)){`;
  p += `if(${cursorVar}.text!==_v.text)${textUpdateFunc}(_v.text);`;
  p += `${offsetFunc}(_v.offset)}`;
  if (cb1 && cb2) p += `${cb1}(),${cb2}();`;
  p += `return}`;
  return p;
}

export function applyPatch(content) {
  const DEL = String.fromCharCode(127);

  let patternIdx = content.indexOf(`.includes("${DEL}")`);
  if (patternIdx === -1) patternIdx = content.indexOf('.includes("\\x7f")');
  if (patternIdx === -1) return null;

  const realIdx = content.indexOf(`.includes("${DEL}")`);
  if (realIdx !== -1) patternIdx = realIdx;

  let start = content.lastIndexOf('if(!', patternIdx);
  if (start === -1) return null;

  let bc = 0, end = start, ff = false;
  for (let i = start; i < content.length && i < start + 1000; i++) {
    if (content[i] === '{') { bc++; ff = true; }
    else if (content[i] === '}') { bc--; if (ff && bc === 0) { end = i + 1; break; } }
  }

  const original = content.substring(start, end);
  if (original.includes(PATCH_MARKER)) return content;

  const km = original.match(/if\(!([a-zA-Z0-9_$]+)\.backspace/);
  const im = original.match(/([a-zA-Z0-9_$]+)\.includes\("/);
  const cm = original.match(/,([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/) || original.match(/([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/);
  const cbm = original.match(/([a-zA-Z0-9_$]+)\(\),([a-zA-Z0-9_$]+)\(\);return/);

  let tf, of_;
  const tfm1 = original.match(/\.text!==\w+\.text\)([a-zA-Z0-9_$]+)\(/);
  const ofm1 = original.match(/\.text\);([a-zA-Z0-9_$]+)\(\w+\.offset\)/);

  if (tfm1 && ofm1) {
    tf = tfm1[1]; of_ = ofm1[1];
  } else {
    const tfm2 = original.match(/([a-zA-Z0-9_$]+)\([a-zA-Z0-9_$]+\.text\)/);
    const ofm2 = original.match(/([a-zA-Z0-9_$]+)\([a-zA-Z0-9_$]+\.offset\)/);
    if (tfm2 && ofm2) { tf = tfm2[1]; of_ = ofm2[1]; }
  }

  if (!km || !im || !cm || !tf || !of_) return null;

  const patch = generatePatch(km[1], im[1], cm[2], tf, of_, cbm?.[1], cbm?.[2]);
  return content.substring(0, start) + patch + content.substring(end);
}

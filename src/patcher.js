import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync, readlinkSync, readdirSync, copyFileSync, unlinkSync, mkdirSync, symlinkSync } from 'fs';
import { dirname, join, basename } from 'path';

const PATCH_MARKER = '/* Vietnamese IME fix */';
const BACKUP_PREFIX = '.backup.';
const HOME = process.env.HOME || '';
const LOCAL_PREFIX = join(HOME, '.cc-vietnamese');

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ─── Detection ──────────────────────────────────────────

function isJavaScriptFile(filePath) {
  try {
    const buffer = readFileSync(filePath);
    const firstTwo = buffer.slice(0, 2).toString();
    if (firstTwo === '#!') return true;
    const magic = buffer.slice(0, 4).toString('hex');
    if (['cafebabe', 'cffaedfe', 'cefaedfe'].includes(magic)) return false;
    // ELF magic: 7f454c46
    if (magic === '7f454c46') return false;
    return true;
  } catch {
    return false;
  }
}

function findAllClaudeInstallations() {
  const installations = [];

  try {
    const whichResult = execSync('/bin/bash -c "which -a claude 2>/dev/null"', { encoding: 'utf8' }).trim();
    for (const p of whichResult.split('\n').filter(x => x.trim())) {
      try {
        const realPath = realpathSync(p);
        if (existsSync(realPath) && !installations.find(i => i.path === realPath)) {
          const isJS = isJavaScriptFile(realPath);
          installations.push({ path: realPath, symlink: p !== realPath ? p : null, isJavaScript: isJS, type: isJS ? 'npm' : 'binary' });
        }
      } catch {}
    }
  } catch {}

  // Common npm paths
  const npmPaths = [
    join(LOCAL_PREFIX, 'lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    join(HOME, '.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    '/usr/local/node/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    join(HOME, 'node_modules/@anthropic-ai/claude-code/cli.js'),
  ];

  try {
    const npmRoot = execSync('npm root -g 2>/dev/null', { encoding: 'utf8' }).trim();
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

function findClaudeCli() {
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);
  if (!jsInstall) {
    throw new Error(
      'No patchable Claude Code installation found.\n\n' +
      'Run: cc-vietnamese install\n' +
      'This will auto-install the npm version for patching.\n\n' +
      'Found installations:\n' +
      installations.map(i => `  ${i.type}: ${i.path}`).join('\n')
    );
  }
  return jsInstall.path;
}

function getActiveClaudeInfo() {
  try {
    const result = execSync('/bin/bash -c "which claude"', { encoding: 'utf8' }).trim();
    const realPath = realpathSync(result);
    const isJS = isJavaScriptFile(realPath);
    let version = 'unknown';
    try { version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim(); } catch {}
    return { path: realPath, symlink: result !== realPath ? result : null, isJavaScript: isJS, type: isJS ? 'npm' : 'binary', version };
  } catch {
    return null;
  }
}

function getNativeVersionDir() {
  const dir = join(HOME, '.local/share/claude/versions');
  if (!existsSync(dir)) return null;
  return dir;
}

// ─── Patch Logic ────────────────────────────────────────

function isPatched(content) {
  return content.includes(PATCH_MARKER);
}

function getClaudeVersion(content) {
  const match = content.match(/\/\/ Version: ([\d.]+)/);
  return match ? match[1] : 'unknown';
}

function createBackup(cliPath) {
  const dir = dirname(cliPath);
  const name = basename(cliPath, '.js');
  const backupPath = join(dir, `${BACKUP_PREFIX}${Date.now()}.${name}.js`);
  copyFileSync(cliPath, backupPath);
  return backupPath;
}

function findLatestBackup(cliPath) {
  const dir = dirname(cliPath);
  const files = readdirSync(dir).filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js')).sort().reverse();
  return files.length > 0 ? join(dir, files[0]) : null;
}

function listBackups(cliPath) {
  try {
    return readdirSync(dirname(cliPath)).filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js')).sort().reverse();
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

function applyPatch(content) {
  const DEL = String.fromCharCode(127);

  // Find DEL pattern
  let patternIdx = content.indexOf(`.includes("${DEL}")`);
  if (patternIdx === -1) patternIdx = content.indexOf('.includes("\\x7f")');
  if (patternIdx === -1) return null;

  // Re-search with actual DEL char (may differ from escaped)
  const realIdx = content.indexOf(`.includes("${DEL}")`);
  if (realIdx !== -1) patternIdx = realIdx;

  let start = content.lastIndexOf('if(!', patternIdx);
  if (start === -1) return null;

  // Match braces
  let bc = 0, end = start, ff = false;
  for (let i = start; i < content.length && i < start + 1000; i++) {
    if (content[i] === '{') { bc++; ff = true; }
    else if (content[i] === '}') { bc--; if (ff && bc === 0) { end = i + 1; break; } }
  }

  const original = content.substring(start, end);
  if (original.includes(PATCH_MARKER)) return content;

  // Extract vars - try primary pattern
  const km = original.match(/if\(!([a-zA-Z0-9_$]+)\.backspace/);
  const im = original.match(/([a-zA-Z0-9_$]+)\.includes\("/);
  const cm = original.match(/,([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/) || original.match(/([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/);
  const cbm = original.match(/([a-zA-Z0-9_$]+)\(\),([a-zA-Z0-9_$]+)\(\);return/);

  // Try two extraction strategies
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

// ─── Native Support ─────────────────────────────────────

function ensureNpmVersion() {
  const cliPath = join(LOCAL_PREFIX, 'lib/node_modules/@anthropic-ai/claude-code/cli.js');
  if (existsSync(cliPath)) return cliPath;

  console.log('  Installing npm version to ~/.cc-vietnamese/ ...');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  execSync(`npm install -g @anthropic-ai/claude-code --prefix "${LOCAL_PREFIX}" 2>&1`, { encoding: 'utf8', timeout: 120000 });

  if (!existsSync(cliPath)) throw new Error('npm install succeeded but cli.js not found');
  return cliPath;
}

function updateNpmVersion() {
  console.log('  Updating npm version in ~/.cc-vietnamese/ ...');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  const out = execSync(`npm install -g @anthropic-ai/claude-code@latest --prefix "${LOCAL_PREFIX}" 2>&1`, { encoding: 'utf8', timeout: 120000 });
  const cliPath = join(LOCAL_PREFIX, 'lib/node_modules/@anthropic-ai/claude-code/cli.js');
  if (!existsSync(cliPath)) throw new Error('npm install succeeded but cli.js not found');
  return cliPath;
}

function redirectSymlink() {
  const npmBin = join(LOCAL_PREFIX, 'bin/claude');
  const localBin = join(HOME, '.local/bin/claude');

  if (!existsSync(npmBin)) {
    console.log(colors.yellow('  npm bin not found, skipping symlink'));
    return false;
  }

  // Check if symlink already points to our target (compare raw link, not resolved)
  try {
    const rawTarget = readlinkSync(localBin);
    if (rawTarget === npmBin) {
      console.log('  Symlink already correct');
      return true;
    }
  } catch {}

  // Redirect
  try {
    try { unlinkSync(localBin); } catch {}
    symlinkSync(npmBin, localBin);
    console.log(`  ${colors.dim(localBin)} -> ${colors.dim(npmBin)}`);
    return true;
  } catch (err) {
    console.log(colors.red(`  Failed to redirect symlink: ${err.message}`));
    return false;
  }
}

function setupWatcher() {
  const unitDir = join(HOME, '.config/systemd/user');
  mkdirSync(unitDir, { recursive: true });

  const ccVietBin = join(LOCAL_PREFIX, 'bin/claude');
  const localBin = join(HOME, '.local/bin/claude');

  // Write a small fix script that doesn't depend on npx/node path
  const fixScript = join(LOCAL_PREFIX, 'fix-symlink.sh');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  writeFileSync(fixScript, `#!/bin/bash
# Auto-fix Claude symlink — called by systemd watcher
TARGET="${ccVietBin}"
LINK="${localBin}"
CURRENT=$(readlink "$LINK" 2>/dev/null)
if [ "$CURRENT" != "$TARGET" ] && [ -f "$TARGET" ]; then
  rm -f "$LINK"
  ln -s "$TARGET" "$LINK"
fi
`, { mode: 0o755 });

  // Watch the versions directory — native updater writes new binaries here
  const versionsDir = join(HOME, '.local/share/claude/versions');

  writeFileSync(join(unitDir, 'claude-viet-watcher.path'), `[Unit]
Description=Watch Claude native binary updates and auto-fix symlink

[Path]
PathModified=${versionsDir}
PathChanged=${HOME}/.local/bin
Unit=claude-viet-watcher.service

[Install]
WantedBy=default.target
`);

  writeFileSync(join(unitDir, 'claude-viet-watcher.service'), `[Unit]
Description=Fix Claude symlink after native auto-update

[Service]
Type=oneshot
ExecStart=/bin/bash ${fixScript}
`);

  execSync('systemctl --user daemon-reload', { encoding: 'utf8' });
  execSync('systemctl --user enable --now claude-viet-watcher.path 2>&1', { encoding: 'utf8' });
  return true;
}

function isWatcherActive() {
  try {
    execSync('systemctl --user is-active claude-viet-watcher.path 2>/dev/null', { encoding: 'utf8' });
    return true;
  } catch { return false; }
}

// ─── Commands ───────────────────────────────────────────

export async function install() {
  console.log(colors.cyan('Vietnamese IME Fix for Claude Code\n'));

  const active = getActiveClaudeInfo();
  const isNative = active && !active.isJavaScript;

  if (isNative) {
    console.log(colors.bold('Detected: Native binary'));
    console.log(`  ${colors.dim(active.path)} (${active.version})\n`);
  }

  // Step 1: Ensure npm version exists
  console.log('[1/4] Ensuring npm version...');
  let cliPath;
  try {
    const localCli = join(LOCAL_PREFIX, 'lib/node_modules/@anthropic-ai/claude-code/cli.js');
    if (existsSync(localCli)) {
      cliPath = localCli;
      console.log(`  Found: ${colors.dim(cliPath)}`);
    } else {
      cliPath = ensureNpmVersion();
      console.log(`  Installed: ${colors.dim(cliPath)}`);
    }
  } catch {
    // Fallback to any existing npm installation
    cliPath = findClaudeCli();
    console.log(`  Using existing: ${colors.dim(cliPath)}`);
  }

  // Step 2: Patch
  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);

  console.log(`[2/4] Patching... (v${version})`);
  if (isPatched(content)) {
    console.log(colors.green('  Already patched'));
  } else {
    const backupPath = createBackup(cliPath);
    console.log(`  Backup: ${colors.dim(backupPath)}`);

    const patched = applyPatch(content);
    if (!patched) {
      throw new Error(`Could not find code pattern to patch.\nClaude CLI v${version} may be incompatible.`);
    }
    writeFileSync(cliPath, patched, 'utf8');
    console.log(colors.green('  Patch applied'));
  }

  // Step 3: Redirect symlink (always ensure it points to cc-vietnamese)
  console.log('[3/4] Checking symlink...');
  const localBin = join(HOME, '.local/bin/claude');
  let needsSymlink = true;
  try {
    const rawTarget = readlinkSync(localBin);
    needsSymlink = rawTarget !== join(LOCAL_PREFIX, 'bin/claude');
  } catch {}
  if (needsSymlink) {
    redirectSymlink();
  } else {
    console.log('  Symlink already correct');
  }

  // Step 4: Watcher (Linux only - watches for native auto-update overwriting symlink)
  if (process.platform === 'linux') {
    console.log('[4/4] Setting up auto-fix watcher...');
    if (isWatcherActive()) {
      console.log('  Watcher already active');
    } else {
      try {
        setupWatcher();
        console.log(colors.green('  Watcher installed'));
      } catch (err) {
        console.log(colors.yellow(`  Watcher setup failed: ${err.message}`));
        console.log('  Run manually after updates: cc-vietnamese fix');
      }
    }
  } else {
    console.log('[4/4] Watcher: not needed');
  }

  console.log(colors.green('\n✓ Vietnamese input fix installed!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.\n'));
}

export async function uninstall() {
  console.log(colors.cyan('Restoring Claude Code\n'));

  const cliPath = findClaudeCli();
  console.log(`CLI: ${colors.dim(cliPath)}`);

  const backupPath = findLatestBackup(cliPath);
  if (!backupPath) {
    const content = readFileSync(cliPath, 'utf8');
    if (!isPatched(content)) {
      console.log(colors.yellow('\n✓ Not patched. Nothing to restore.'));
      return;
    }
    throw new Error('No backup found. Cannot restore.');
  }

  console.log('Restoring from backup...');
  copyFileSync(backupPath, cliPath);
  unlinkSync(backupPath);

  // Restore native symlink if exists
  const versionDir = getNativeVersionDir();
  if (versionDir) {
    try {
      const versions = readdirSync(versionDir).filter(f => !f.startsWith('.')).sort().reverse();
      if (versions.length > 0) {
        const nativePath = join(versionDir, versions[0]);
        const localBin = join(HOME, '.local/bin/claude');
        if (existsSync(localBin)) unlinkSync(localBin);
        symlinkSync(nativePath, localBin);
        console.log(`Restored native symlink: ${colors.dim(nativePath)}`);
      }
    } catch {}
  }

  // Disable watcher
  try {
    execSync('systemctl --user disable --now claude-viet-watcher.path 2>/dev/null', { encoding: 'utf8' });
    console.log('Watcher disabled');
  } catch {}

  console.log(colors.green('\n✓ Original Claude Code restored!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

export async function update() {
  console.log(colors.cyan('Updating Claude Code + Vietnamese IME\n'));

  // Step 1: Update npm version
  console.log('[1/3] Updating npm package...');
  let cliPath;
  try {
    cliPath = updateNpmVersion();
  } catch {
    cliPath = join(LOCAL_PREFIX, 'lib/node_modules/@anthropic-ai/claude-code/cli.js');
    if (!existsSync(cliPath)) {
      cliPath = ensureNpmVersion();
    }
  }

  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);
  console.log(`  Version: ${version}`);

  // Step 2: Patch
  console.log('[2/3] Patching...');
  if (isPatched(content)) {
    console.log(colors.green('  Already patched'));
  } else {
    createBackup(cliPath);
    const patched = applyPatch(content);
    if (!patched) {
      throw new Error(`Could not find code pattern to patch (v${version}).`);
    }
    writeFileSync(cliPath, patched, 'utf8');
    console.log(colors.green('  Patch applied'));
  }

  // Step 3: Fix symlink
  console.log('[3/3] Fixing symlink...');
  redirectSymlink();

  console.log(colors.green('\n✓ Update complete!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

export async function fix() {
  // Quick fix - just redirect symlink (called by watcher)
  redirectSymlink();
}

export async function alias() {
  console.log(colors.cyan('Adding Claude alias to shell config\n'));

  const npmBin = join(LOCAL_PREFIX, 'bin/claude');

  // Fallback to any npm installation
  let targetBin = npmBin;
  if (!existsSync(npmBin)) {
    const installations = findAllClaudeInstallations();
    const jsInstall = installations.find(i => i.isJavaScript);
    if (!jsInstall) {
      console.log(colors.red('No npm version found. Run: cc-vietnamese install'));
      process.exit(1);
    }
    targetBin = jsInstall.path.replace('/lib/node_modules/@anthropic-ai/claude-code/cli.js', '/bin/claude');
  }

  const shell = process.env.SHELL || '/bin/bash';
  const configFile = shell.includes('zsh')
    ? join(HOME, '.zshrc')
    : (existsSync(join(HOME, '.bash_profile')) ? join(HOME, '.bash_profile') : join(HOME, '.bashrc'));

  const aliasLine = `alias claude="${targetBin}"`;

  let configContent = '';
  try { configContent = readFileSync(configFile, 'utf8'); } catch {}

  if (configContent.includes(aliasLine)) {
    console.log(colors.green('✓ Alias already configured in ' + configFile));
  } else if (configContent.includes('alias claude=')) {
    console.log(colors.yellow('⚠ Different alias exists in ' + configFile));
    console.log('  Update to: ' + colors.bold(aliasLine));
  } else {
    const nl = configContent.endsWith('\n') ? '' : '\n';
    writeFileSync(configFile, configContent + nl + `\n# Vietnamese-patched Claude Code\n${aliasLine}\n`, 'utf8');
    console.log(colors.green('✓ Added alias to ' + configFile));
  }

  console.log(`\nTo activate: ${colors.bold(`source ${configFile}`)}\n`);
}

export async function setup() {
  console.log(colors.cyan('Vietnamese IME Setup for Claude Code\n'));

  const active = getActiveClaudeInfo();
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (active) {
    console.log(colors.bold('Active:'));
    console.log(`  Type:    ${active.type === 'binary' ? colors.yellow('Native Binary') : colors.green('NPM')}`);
    console.log(`  Version: ${active.version}`);
    console.log(`  Path:    ${colors.dim(active.path)}`);
    console.log('');
  }

  if (!jsInstall) {
    console.log('No npm version found. Run:\n');
    console.log(colors.bold('  cc-vietnamese install'));
    console.log(colors.dim('  This will auto-install npm version, patch it, and redirect your claude command.\n'));
    return;
  }

  const content = readFileSync(jsInstall.path, 'utf8');
  const patched = isPatched(content);

  console.log(colors.bold('NPM Version:'));
  console.log(`  Version: ${getClaudeVersion(content)}`);
  console.log(`  Status:  ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
  console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
  console.log('');

  if (!patched) {
    console.log('To install: ' + colors.bold('cc-vietnamese install\n'));
  }

  console.log(colors.bold('Quick Start:\n'));
  console.log('  cc-vietnamese install    # Install/patch (handles native + npm)');
  console.log('  cc-vietnamese update     # Update npm + re-patch');
  console.log('  cc-vietnamese fix        # Fix symlink after native update');
  console.log('  cc-vietnamese status     # Check everything');
}

export async function status() {
  console.log(colors.cyan('Claude Code Vietnamese IME Status\n'));

  const active = getActiveClaudeInfo();
  if (active) {
    const typeColor = active.isJavaScript ? colors.green : colors.yellow;
    console.log(colors.bold('Active Installation:'));
    console.log(`  Type:    ${typeColor(active.type === 'binary' ? 'Native Binary' : 'NPM (JavaScript)')}`);
    console.log(`  Version: ${active.version}`);
    console.log(`  Path:    ${colors.dim(active.path)}`);
    if (active.symlink) console.log(`  Symlink: ${colors.dim(active.symlink)}`);
    console.log('');
  }

  // Check native versions
  const versionDir = getNativeVersionDir();
  if (versionDir) {
    try {
      const versions = readdirSync(versionDir).filter(f => !f.startsWith('.'));
      if (versions.length > 0) {
        console.log(colors.bold('Native Versions:'));
        for (const v of versions.sort().reverse()) console.log(`  ${colors.dim(join(versionDir, v))}`);
        console.log('');
      }
    } catch {}
  }

  // NPM version status
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (jsInstall) {
    try {
      const content = readFileSync(jsInstall.path, 'utf8');
      const version = getClaudeVersion(content);
      const patched = isPatched(content);
      const backups = listBackups(jsInstall.path);

      console.log(colors.bold('NPM Version (patchable):'));
      console.log(`  Version: ${version}`);
      console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
      console.log(`  Status:  ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
      if (backups.length > 0) console.log(`  Backups: ${backups.length}`);
      console.log('');

      // Check symlink health
      const localBin = join(HOME, '.local/bin/claude');
      try {
        const rawTarget = readlinkSync(localBin);
        const ccVietBin = join(LOCAL_PREFIX, 'bin/claude');
        const symlinkOk = rawTarget === ccVietBin;
        console.log(colors.bold('Symlink:'));
        console.log(`  ${localBin} -> ${colors.dim(rawTarget)}`);
        console.log(`  Points to cc-vietnamese: ${symlinkOk ? colors.green('YES') : colors.red('NO — run: cc-vietnamese fix')}`);
        console.log('');
      } catch {}

    } catch (err) {
      console.log(colors.red(`  Error: ${err.message}\n`));
    }
  } else {
    console.log(colors.yellow('No npm version found. Run: cc-vietnamese install\n'));
  }

  // Watcher status (Linux only)
  if (process.platform === 'linux') {
    console.log(colors.bold('Auto-fix Watcher:'));
    console.log(`  Status: ${isWatcherActive() ? colors.green('ACTIVE') : colors.yellow('NOT ACTIVE')}`);
    if (!isWatcherActive()) console.log(`  Enable: cc-vietnamese install`);
    console.log('');
  }
}

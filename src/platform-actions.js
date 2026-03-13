import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, readlinkSync, readdirSync, unlinkSync, mkdirSync, symlinkSync, renameSync, chmodSync } from 'fs';
import { join } from 'path';
import { IS_WINDOWS, HOME, LOCAL_PREFIX, colors } from './utils.js';
import { getNpmCliPath, getNativeVersionDir } from './detect-and-patch.js';

// ─── NPM Management ────────────────────────────────────

export function ensureNpmVersion() {
  const cliPath = getNpmCliPath();
  if (existsSync(cliPath)) return cliPath;

  console.log('  Installing npm version to ~/.cc-vietnamese/ ...');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  execSync(`npm install -g @anthropic-ai/claude-code --prefix "${LOCAL_PREFIX}" 2>&1`, {
    encoding: 'utf8',
    timeout: 120000,
  });

  if (!existsSync(cliPath)) throw new Error('npm install succeeded but cli.js not found');
  return cliPath;
}

export function updateNpmVersion() {
  console.log('  Updating npm version in ~/.cc-vietnamese/ ...');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  execSync(`npm install -g @anthropic-ai/claude-code@latest --prefix "${LOCAL_PREFIX}" 2>&1`, {
    encoding: 'utf8',
    timeout: 120000,
  });
  const cliPath = getNpmCliPath();
  if (!existsSync(cliPath)) throw new Error('npm install succeeded but cli.js not found');
  return cliPath;
}

// ─── Redirect Command ──────────────────────────────────

export function redirectCommand() {
  if (IS_WINDOWS) return redirectCommandWindows();
  return redirectCommandUnix();
}

function redirectCommandUnix() {
  const npmBin = join(LOCAL_PREFIX, 'bin/claude');
  const localBin = join(HOME, '.local/bin/claude');

  if (!existsSync(npmBin)) {
    console.log(colors.yellow('  npm bin not found, skipping symlink'));
    return false;
  }

  try {
    const rawTarget = readlinkSync(localBin);
    if (rawTarget === npmBin) {
      console.log('  Symlink already correct');
      return true;
    }
  } catch {}

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

function redirectCommandWindows() {
  const cliPath = getNpmCliPath();
  if (!existsSync(cliPath)) {
    console.log(colors.yellow('  npm cli.js not found, skipping redirect'));
    return false;
  }

  const localBinDir = join(HOME, '.local', 'bin');
  const claudeExe = join(localBinDir, 'claude.exe');
  const claudeOriginal = join(localBinDir, 'claude-original.exe');
  const claudeCmd = join(localBinDir, 'claude.cmd');
  const claudeBash = join(localBinDir, 'claude');

  // Already redirected: .cmd exists and .exe is gone
  if (existsSync(claudeCmd) && !existsSync(claudeExe)) {
    console.log('  Already redirected');
    return true;
  }

  // Rename claude.exe → claude-original.exe
  if (existsSync(claudeExe)) {
    try {
      if (existsSync(claudeOriginal)) unlinkSync(claudeOriginal);
      renameSync(claudeExe, claudeOriginal);
      console.log(`  Renamed: claude.exe -> claude-original.exe`);
    } catch (err) {
      console.log(colors.red(`  Failed to rename claude.exe: ${err.message}`));
      console.log(colors.yellow('  Tip: Close Claude Code first, then retry'));
      return false;
    }
  }

  // Create claude.cmd for CMD/PowerShell
  const cliPathWin = cliPath.replace(/\//g, '\\');
  writeFileSync(claudeCmd, `@echo off\r\nnode "${cliPathWin}" %*\r\n`);
  console.log(`  Created: ${colors.dim(claudeCmd)}`);

  // Create claude (no extension) for Git Bash / WSL
  const cliPathUnix = cliPath.replace(/\\/g, '/');
  writeFileSync(claudeBash, `#!/bin/bash\nexec node "${cliPathUnix}" "$@"\n`);
  try { chmodSync(claudeBash, 0o755); } catch {}
  console.log(`  Created: ${colors.dim(claudeBash)} (Git Bash)`);

  return true;
}

// ─── Restore Command ───────────────────────────────────

export function restoreCommand() {
  if (IS_WINDOWS) return restoreCommandWindows();
  return restoreCommandUnix();
}

function restoreCommandUnix() {
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
}

function restoreCommandWindows() {
  const localBinDir = join(HOME, '.local', 'bin');
  const claudeExe = join(localBinDir, 'claude.exe');
  const claudeOriginal = join(localBinDir, 'claude-original.exe');
  const claudeCmd = join(localBinDir, 'claude.cmd');
  const claudeBash = join(localBinDir, 'claude');

  // Remove wrapper files
  try { if (existsSync(claudeCmd)) unlinkSync(claudeCmd); } catch {}
  try { if (existsSync(claudeBash)) unlinkSync(claudeBash); } catch {}
  console.log('  Removed wrapper files');

  // Restore original .exe
  if (existsSync(claudeOriginal)) {
    try {
      if (existsSync(claudeExe)) unlinkSync(claudeExe);
      renameSync(claudeOriginal, claudeExe);
      console.log(`  Restored: claude-original.exe -> claude.exe`);
    } catch (err) {
      console.log(colors.red(`  Failed to restore: ${err.message}`));
    }
  }
}

export function isCommandRedirected() {
  if (IS_WINDOWS) {
    const claudeCmd = join(HOME, '.local', 'bin', 'claude.cmd');
    const claudeExe = join(HOME, '.local', 'bin', 'claude.exe');
    return existsSync(claudeCmd) && !existsSync(claudeExe);
  }
  try {
    const localBin = join(HOME, '.local/bin/claude');
    const rawTarget = readlinkSync(localBin);
    return rawTarget === join(LOCAL_PREFIX, 'bin/claude');
  } catch { return false; }
}

// ─── Watcher ────────────────────────────────────────────

export function setupWatcher() {
  if (IS_WINDOWS) return setupWatcherWindows();
  if (process.platform === 'linux') return setupWatcherLinux();
  return false;
}

function setupWatcherLinux() {
  const unitDir = join(HOME, '.config/systemd/user');
  mkdirSync(unitDir, { recursive: true });

  const ccVietBin = join(LOCAL_PREFIX, 'bin/claude');
  const localBin = join(HOME, '.local/bin/claude');
  const versionsDir = join(HOME, '.local/share/claude/versions');

  const fixScript = join(LOCAL_PREFIX, 'fix-symlink.sh');
  mkdirSync(LOCAL_PREFIX, { recursive: true });
  writeFileSync(fixScript, [
    '#!/bin/bash',
    `TARGET="${ccVietBin}"`,
    `LINK="${localBin}"`,
    'CURRENT=$(readlink "$LINK" 2>/dev/null)',
    'if [ "$CURRENT" != "$TARGET" ] && [ -f "$TARGET" ]; then',
    '  rm -f "$LINK"',
    '  ln -s "$TARGET" "$LINK"',
    'fi',
    '',
  ].join('\n'), { mode: 0o755 });

  writeFileSync(join(unitDir, 'claude-viet-watcher.path'), [
    '[Unit]',
    'Description=Watch Claude native binary updates and auto-fix symlink',
    '',
    '[Path]',
    `PathModified=${versionsDir}`,
    `PathChanged=${HOME}/.local/bin`,
    'Unit=claude-viet-watcher.service',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n'));

  writeFileSync(join(unitDir, 'claude-viet-watcher.service'), [
    '[Unit]',
    'Description=Fix Claude symlink after native auto-update',
    '',
    '[Service]',
    'Type=oneshot',
    `ExecStart=/bin/bash ${fixScript}`,
    '',
  ].join('\n'));

  execSync('systemctl --user daemon-reload', { encoding: 'utf8' });
  execSync('systemctl --user enable --now claude-viet-watcher.path 2>&1', { encoding: 'utf8' });
  return true;
}

function setupWatcherWindows() {
  const taskName = 'ClaudeVietnameseAutoFix';
  const fixScript = join(LOCAL_PREFIX, 'fix-redirect.cmd');
  const fixVbs = join(LOCAL_PREFIX, 'fix-redirect.vbs');
  const localBinDir = join(HOME, '.local', 'bin').replace(/\//g, '\\');
  const cliPath = getNpmCliPath().replace(/\//g, '\\');

  mkdirSync(LOCAL_PREFIX, { recursive: true });

  // Fix script: if claude.exe reappears after auto-update, rename it and restore .cmd
  writeFileSync(fixScript, [
    '@echo off',
    `set "CLAUDE_EXE=${localBinDir}\\claude.exe"`,
    `set "CLAUDE_ORIG=${localBinDir}\\claude-original.exe"`,
    `set "CLAUDE_CMD=${localBinDir}\\claude.cmd"`,
    `set "CLI_PATH=${cliPath}"`,
    '',
    'if not exist "%CLAUDE_EXE%" goto :eof',
    'if exist "%CLAUDE_ORIG%" del /f "%CLAUDE_ORIG%"',
    'ren "%CLAUDE_EXE%" claude-original.exe',
    'if not exist "%CLAUDE_CMD%" (',
    '  echo @echo off> "%CLAUDE_CMD%"',
    '  echo node "%CLI_PATH%" %%*>> "%CLAUDE_CMD%"',
    ')',
    '',
  ].join('\r\n'));

  // VBS wrapper: runs the cmd script silently (no visible window)
  const fixScriptWin = fixScript.replace(/\//g, '\\');
  writeFileSync(fixVbs, `CreateObject("WScript.Shell").Run "cmd /c ""${fixScriptWin}""", 0, False\r\n`);

  try {
    // Delete existing task if any
    try { execSync(`schtasks /delete /tn "${taskName}" /f 2>nul`, { encoding: 'utf8' }); } catch {}

    const fixVbsWin = fixVbs.replace(/\//g, '\\');
    execSync(
      `schtasks /create /tn "${taskName}" /tr "wscript.exe \\"${fixVbsWin}\\"" /sc MINUTE /mo 5 /f`,
      { encoding: 'utf8' },
    );
    return true;
  } catch (err) {
    console.log(colors.yellow(`  Task scheduler failed: ${err.message}`));
    console.log(colors.dim('  Run manually after updates: cc-vietnamese fix'));
    return false;
  }
}

export function isWatcherActive() {
  if (IS_WINDOWS) {
    try {
      execSync('schtasks /query /tn "ClaudeVietnameseAutoFix"', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      return true;
    } catch { return false; }
  }
  if (process.platform === 'linux') {
    try {
      execSync('systemctl --user is-active claude-viet-watcher.path 2>/dev/null', { encoding: 'utf8' });
      return true;
    } catch { return false; }
  }
  return false;
}

export function disableWatcher() {
  if (IS_WINDOWS) {
    try { execSync('schtasks /delete /tn "ClaudeVietnameseAutoFix" /f 2>nul', { encoding: 'utf8' }); } catch {}
    // Clean up VBS wrapper
    const fixVbs = join(LOCAL_PREFIX, 'fix-redirect.vbs');
    try { if (existsSync(fixVbs)) unlinkSync(fixVbs); } catch {}
    return;
  }
  try { execSync('systemctl --user disable --now claude-viet-watcher.path 2>/dev/null', { encoding: 'utf8' }); } catch {}
}

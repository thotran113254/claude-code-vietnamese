import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync, readdirSync, readlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { IS_WINDOWS, HOME, LOCAL_PREFIX, colors } from './utils.js';
import {
  findAllClaudeInstallations, findClaudeCli, getActiveClaudeInfo,
  getNativeVersionDir, getNpmCliPath,
  isPatched, getClaudeVersion, createBackup, findLatestBackup, listBackups, applyPatch,
} from './detect-and-patch.js';
import {
  ensureNpmVersion, updateNpmVersion,
  redirectCommand, restoreCommand, isCommandRedirected,
  setupWatcher, isWatcherActive, disableWatcher,
} from './platform-actions.js';

// ─── Install ────────────────────────────────────────────

export async function install() {
  console.log(colors.cyan('Vietnamese IME Fix for Claude Code\n'));

  const active = getActiveClaudeInfo();
  const isNative = active && !active.isJavaScript;

  if (isNative) {
    const platform = IS_WINDOWS ? 'Windows' : 'Linux/macOS';
    console.log(colors.bold(`Detected: Native binary (${platform})`));
    console.log(`  ${colors.dim(active.path)} (${active.version})\n`);
  }

  // Step 1: Ensure npm version exists
  console.log('[1/4] Ensuring npm version...');
  let cliPath;
  try {
    const localCli = getNpmCliPath();
    if (existsSync(localCli)) {
      cliPath = localCli;
      console.log(`  Found: ${colors.dim(cliPath)}`);
    } else {
      cliPath = ensureNpmVersion();
      console.log(`  Installed: ${colors.dim(cliPath)}`);
    }
  } catch {
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

  // Step 3: Redirect command
  console.log('[3/4] Redirecting claude command...');
  if (isCommandRedirected()) {
    console.log('  Already redirected');
  } else {
    redirectCommand();
  }

  // Step 4: Watcher (Linux: systemd, Windows: Task Scheduler)
  const hasWatcherSupport = IS_WINDOWS || process.platform === 'linux';
  if (hasWatcherSupport) {
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
    console.log('[4/4] Watcher: not needed (macOS)');
  }

  console.log(colors.green('\nVietnamese input fix installed!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.\n'));
}

// ─── Uninstall ──────────────────────────────────────────

export async function uninstall() {
  console.log(colors.cyan('Restoring Claude Code\n'));

  const cliPath = findClaudeCli();
  console.log(`CLI: ${colors.dim(cliPath)}`);

  const backupPath = findLatestBackup(cliPath);
  if (!backupPath) {
    const content = readFileSync(cliPath, 'utf8');
    if (!isPatched(content)) {
      console.log(colors.yellow('\nNot patched. Nothing to restore.'));
      return;
    }
    throw new Error('No backup found. Cannot restore.');
  }

  console.log('Restoring from backup...');
  copyFileSync(backupPath, cliPath);
  unlinkSync(backupPath);

  // Restore original command
  restoreCommand();

  // Disable watcher
  disableWatcher();
  console.log('Watcher disabled');

  console.log(colors.green('\nOriginal Claude Code restored!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

// ─── Update ─────────────────────────────────────────────

export async function update() {
  console.log(colors.cyan('Updating Claude Code + Vietnamese IME\n'));

  // Step 1: Update npm version
  console.log('[1/3] Updating npm package...');
  let cliPath;
  try {
    cliPath = updateNpmVersion();
  } catch {
    cliPath = getNpmCliPath();
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

  // Step 3: Fix redirect
  console.log('[3/3] Fixing redirect...');
  redirectCommand();

  console.log(colors.green('\nUpdate complete!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

// ─── Fix ────────────────────────────────────────────────

export async function fix() {
  redirectCommand();
}

// ─── Alias ──────────────────────────────────────────────

export async function alias() {
  console.log(colors.cyan('Adding Claude alias to shell config\n'));

  if (IS_WINDOWS) {
    aliasWindows();
    return;
  }
  aliasUnix();
}

function aliasUnix() {
  const npmBin = join(LOCAL_PREFIX, 'bin/claude');
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
    console.log(colors.green('Alias already configured in ' + configFile));
  } else if (configContent.includes('alias claude=')) {
    console.log(colors.yellow('Different alias exists in ' + configFile));
    console.log('  Update to: ' + colors.bold(aliasLine));
  } else {
    const nl = configContent.endsWith('\n') ? '' : '\n';
    writeFileSync(configFile, configContent + nl + `\n# Vietnamese-patched Claude Code\n${aliasLine}\n`, 'utf8');
    console.log(colors.green('Added alias to ' + configFile));
  }

  console.log(`\nTo activate: ${colors.bold(`source ${configFile}`)}\n`);
}

function aliasWindows() {
  const cliPath = getNpmCliPath();
  if (!existsSync(cliPath)) {
    console.log(colors.red('No npm version found. Run: cc-vietnamese install'));
    process.exit(1);
  }

  // PowerShell profile
  const psProfileDirs = [
    join(HOME, 'Documents/PowerShell'),      // PS 7+
    join(HOME, 'Documents/WindowsPowerShell'), // PS 5.1
  ];

  for (const psDir of psProfileDirs) {
    const profilePath = join(psDir, 'Microsoft.PowerShell_profile.ps1');
    const cliPathWin = cliPath.replace(/\//g, '\\');
    const funcLine = `function claude { node "${cliPathWin}" @args }`;

    let content = '';
    try { content = readFileSync(profilePath, 'utf8'); } catch {}

    if (content.includes('function claude')) {
      console.log(colors.green(`Alias already in ${profilePath}`));
      continue;
    }

    try { mkdirSync(psDir, { recursive: true }); } catch {}

    const nl = content.endsWith('\n') || content === '' ? '' : '\n';
    writeFileSync(profilePath, content + nl + `\n# Vietnamese-patched Claude Code\n${funcLine}\n`, 'utf8');
    console.log(colors.green(`Added alias to ${profilePath}`));
  }

  console.log(colors.dim('\nRestart PowerShell for changes to take effect.\n'));
  console.log(colors.dim('Note: If using CMD/Git Bash, the .cmd wrapper in ~/.local/bin/ handles it automatically.\n'));
}

// ─── Setup ──────────────────────────────────────────────

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
    if (IS_WINDOWS) console.log(`  Platform: Windows`);
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
  console.log(`  Status:  ${patched ? colors.green('Patched') : colors.yellow('Not patched')}`);
  console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
  console.log('');

  if (!patched) {
    console.log('To install: ' + colors.bold('cc-vietnamese install\n'));
  }

  console.log(colors.bold('Quick Start:\n'));
  console.log('  cc-vietnamese install    # Install/patch (handles native + npm)');
  console.log('  cc-vietnamese update     # Update npm + re-patch');
  console.log('  cc-vietnamese fix        # Fix redirect after native update');
  console.log('  cc-vietnamese status     # Check everything');
}

// ─── Status ─────────────────────────────────────────────

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
    console.log(`  Platform: ${IS_WINDOWS ? 'Windows' : process.platform}`);
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
      console.log(`  Status:  ${patched ? colors.green('Patched') : colors.yellow('Not patched')}`);
      if (backups.length > 0) console.log(`  Backups: ${backups.length}`);
      console.log('');

      // Redirect status
      console.log(colors.bold('Command Redirect:'));
      if (IS_WINDOWS) {
        const claudeCmd = join(HOME, '.local', 'bin', 'claude.cmd');
        const claudeExe = join(HOME, '.local', 'bin', 'claude.exe');
        const claudeOrig = join(HOME, '.local', 'bin', 'claude-original.exe');
        console.log(`  claude.cmd:          ${existsSync(claudeCmd) ? colors.green('EXISTS') : colors.red('MISSING')}`);
        console.log(`  claude.exe:          ${existsSync(claudeExe) ? colors.yellow('EXISTS (will shadow .cmd!)') : colors.green('REMOVED (correct)')}`);
        console.log(`  claude-original.exe: ${existsSync(claudeOrig) ? colors.green('BACKED UP') : colors.dim('not found')}`);
        const redirected = isCommandRedirected();
        console.log(`  Redirect active:     ${redirected ? colors.green('YES') : colors.red('NO — run: cc-vietnamese fix')}`);
      } else {
        const localBin = join(HOME, '.local/bin/claude');
        try {
          const rawTarget = readlinkSync(localBin);
          const ccVietBin = join(LOCAL_PREFIX, 'bin/claude');
          const symlinkOk = rawTarget === ccVietBin;
          console.log(`  ${localBin} -> ${colors.dim(rawTarget)}`);
          console.log(`  Points to cc-vietnamese: ${symlinkOk ? colors.green('YES') : colors.red('NO — run: cc-vietnamese fix')}`);
        } catch {
          console.log(`  No symlink found`);
        }
      }
      console.log('');

    } catch (err) {
      console.log(colors.red(`  Error: ${err.message}\n`));
    }
  } else {
    console.log(colors.yellow('No npm version found. Run: cc-vietnamese install\n'));
  }

  // Watcher status
  const hasWatcherSupport = IS_WINDOWS || process.platform === 'linux';
  if (hasWatcherSupport) {
    console.log(colors.bold('Auto-fix Watcher:'));
    const watcherType = IS_WINDOWS ? 'Task Scheduler' : 'systemd';
    console.log(`  Type:   ${watcherType}`);
    console.log(`  Status: ${isWatcherActive() ? colors.green('ACTIVE') : colors.yellow('NOT ACTIVE')}`);
    if (!isWatcherActive()) console.log(`  Enable: cc-vietnamese install`);
    console.log('');
  }
}

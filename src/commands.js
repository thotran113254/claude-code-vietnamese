import { readFileSync, writeFileSync, copyFileSync } from 'fs';
import { colors } from './utils.js';
import { execSync } from 'child_process';
import {
  findAllClaudeInstallations, findSystemClaudeCli, getActiveClaudeInfo,
  isPatched, getClaudeVersion, createBackup, findLatestBackup, listBackups, applyPatch,
} from './detect-and-patch.js';
import {
  findNativeBinary, isNativeBinaryPatched,
  createNativeBinaryBackup, findNativeBinaryLatestBackup,
  applyNativeBinaryPatch,
} from './native-binary-patch.js';

// ─── Shared Helpers ──────────────────────────────────────

/** Patch JS cli.js — returns true if patched or already patched */
function patchJs(cliPath, label = 'JS') {
  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);
  if (isPatched(content)) {
    console.log(colors.green(`  ${label}: Already patched (v${version})`));
    return true;
  }
  createBackup(cliPath);
  const patched = applyPatch(content);
  if (!patched) {
    console.log(colors.yellow(`  ${label}: Could not find pattern (v${version})`));
    return false;
  }
  writeFileSync(cliPath, patched, 'utf8');
  console.log(colors.green(`  ${label}: Patched (v${version})`));
  return true;
}

/** Patch native binary — returns true if patched or already patched */
function patchBinary(binaryPath) {
  if (isNativeBinaryPatched(binaryPath)) {
    console.log(colors.green('  Native binary: Already patched'));
    return true;
  }
  const backup = createNativeBinaryBackup(binaryPath);
  console.log(`  Backup: ${colors.dim(backup)}`);
  const result = applyNativeBinaryPatch(binaryPath);
  if (!result) {
    console.log(colors.yellow('  Native binary: Could not find pattern'));
    return false;
  }
  console.log(colors.green(`  Native binary: Patched (${result.patchedCount} occurrences)`));
  return true;
}

function showActiveInfo() {
  const active = getActiveClaudeInfo();
  if (!active) return;
  console.log(colors.bold('Detected Claude Code:'));
  console.log(`  Type:    ${active.type === 'binary' ? colors.yellow('Native Binary') : colors.green('NPM')}`);
  console.log(`  Version: ${active.version}`);
  console.log(`  Path:    ${colors.dim(active.path)}\n`);
}

// ─── Commands ────────────────────────────────────────────

export async function install() {
  console.log(colors.cyan('Vietnamese IME Fix for Claude Code\n'));
  showActiveInfo();

  let jsOk = false, binOk = false;
  let cliPath = null;
  try { cliPath = findSystemClaudeCli(); } catch {}

  console.log('[1/2] Patching JavaScript...');
  if (cliPath) { jsOk = patchJs(cliPath); }
  else { console.log(colors.dim('  No JS installation found, skipping')); }

  console.log('[2/2] Patching native binary...');
  const binaryPath = findNativeBinary();
  if (binaryPath) { binOk = patchBinary(binaryPath); }
  else { console.log(colors.dim('  No native binary found, skipping')); }

  if (!jsOk && !binOk && !cliPath && !binaryPath) {
    console.log(colors.red('\nNo patchable Claude Code installation found.'));
    console.log('Install Claude Code first: npm install -g @anthropic-ai/claude-code');
    return;
  }
  console.log(colors.green('\nVietnamese input fix installed!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
  console.log(colors.dim('Note: After "claude update", re-run "cc-vietnamese fix" to re-patch.\n'));
}

export async function uninstall() {
  console.log(colors.cyan('Restoring Claude Code\n'));
  let restored = false;

  let cliPath = null;
  try { cliPath = findSystemClaudeCli(); } catch {}
  if (cliPath && isPatched(readFileSync(cliPath, 'utf8'))) {
    const backup = findLatestBackup(cliPath);
    if (backup) { copyFileSync(backup, cliPath); console.log(colors.green('JS installation restored')); restored = true; }
    else { console.log(colors.yellow('JS: No backup found')); }
  }

  const binaryPath = findNativeBinary();
  if (binaryPath && isNativeBinaryPatched(binaryPath)) {
    const backup = findNativeBinaryLatestBackup(binaryPath);
    if (backup) { copyFileSync(backup, binaryPath); console.log(colors.green('Native binary restored')); restored = true; }
    else { console.log(colors.yellow('Native binary: No backup found')); }
  }

  if (!restored) { console.log(colors.yellow('Nothing to restore.')); return; }
  console.log(colors.green('\nOriginal Claude Code restored!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

export async function update() {
  console.log(colors.cyan('Updating Claude Code + Vietnamese IME\n'));

  console.log('[1/3] Updating Claude Code...');
  try {
    const output = execSync('claude update', { encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ${output.trim().split('\n').join('\n  ')}`);
  } catch (err) {
    const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    if (out.includes('already') || out.includes('up to date')) {
      console.log(colors.green('  Already up to date'));
    } else {
      try {
        execSync('npm update -g @anthropic-ai/claude-code', { encoding: 'utf8', timeout: 120000 });
        console.log(colors.green('  Updated via npm'));
      } catch { console.log(colors.yellow('  Could not auto-update. Update manually.')); }
    }
  }

  console.log('[2/3] Re-patching JavaScript...');
  let cliPath = null;
  try { cliPath = findSystemClaudeCli(); } catch {}
  if (cliPath) { patchJs(cliPath); } else { console.log(colors.dim('  No JS installation')); }

  console.log('[3/3] Re-patching native binary...');
  const binaryPath = findNativeBinary();
  if (binaryPath) { patchBinary(binaryPath); } else { console.log(colors.dim('  No native binary')); }

  console.log(colors.green('\nUpdate complete!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

export async function fix() {
  console.log(colors.cyan('Re-patching Claude Code after update\n'));

  let cliPath = null;
  try { cliPath = findSystemClaudeCli(); } catch {}
  if (cliPath) { patchJs(cliPath); }

  const binaryPath = findNativeBinary();
  if (binaryPath) { patchBinary(binaryPath); }

  if (!cliPath && !binaryPath) {
    console.log(colors.red('No patchable Claude Code installation found.'));
    return;
  }
  console.log(colors.dim('\nRestart Claude Code for changes to take effect.'));
}

export async function setup() {
  console.log(colors.cyan('Vietnamese IME Setup for Claude Code\n'));
  showActiveInfo();
  console.log(colors.bold('Commands:\n'));
  console.log('  cc-vietnamese install    # Patch Vietnamese IME fix');
  console.log('  cc-vietnamese update     # Update Claude + re-patch');
  console.log('  cc-vietnamese fix        # Re-patch after system update');
  console.log('  cc-vietnamese uninstall  # Remove patch, restore original');
  console.log('  cc-vietnamese status     # Check patch status\n');
}

export async function status() {
  console.log(colors.cyan('Claude Code Vietnamese IME Status\n'));

  const active = getActiveClaudeInfo();
  if (active) {
    console.log(colors.bold('Active Installation:'));
    console.log(`  Type:    ${active.isJavaScript ? colors.green('NPM') : colors.yellow('Native Binary')}`);
    console.log(`  Version: ${active.version}`);
    console.log(`  Path:    ${colors.dim(active.path)}`);
    if (active.symlink) console.log(`  Symlink: ${colors.dim(active.symlink)}`);
    console.log('');
  }

  const binaryPath = findNativeBinary();
  if (binaryPath) {
    const patched = isNativeBinaryPatched(binaryPath);
    console.log(colors.bold('Native Binary:'));
    console.log(`  Path:    ${colors.dim(binaryPath)}`);
    console.log(`  Status:  ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}\n`);
  }

  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);
  if (jsInstall) {
    try {
      const content = readFileSync(jsInstall.path, 'utf8');
      console.log(colors.bold('JavaScript Installation:'));
      console.log(`  Version: ${getClaudeVersion(content)}`);
      console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
      console.log(`  Status:  ${isPatched(content) ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
      const backups = listBackups(jsInstall.path);
      if (backups.length > 0) console.log(`  Backups: ${backups.length}`);
      console.log('');
    } catch (err) {
      console.log(colors.red(`  Error: ${err.message}\n`));
    }
  }

  if (!binaryPath && !jsInstall) {
    console.log(colors.yellow('No Claude Code installation found.'));
    console.log(`Install: ${colors.bold('npm install -g @anthropic-ai/claude-code')}\n`);
  }
}

export async function alias() {
  console.log(colors.yellow('Alias is no longer needed. Use "claude" directly after "cc-vietnamese install".\n'));
}

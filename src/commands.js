import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync, readlinkSync } from 'fs';
import { join } from 'path';
import { IS_WINDOWS, HOME, colors } from './utils.js';
import {
  findAllClaudeInstallations, findSystemClaudeCli, getActiveClaudeInfo,
  getNativeVersionDir,
  isPatched, getClaudeVersion, createBackup, findLatestBackup, listBackups, applyPatch,
} from './detect-and-patch.js';

// ─── Install / Patch ────────────────────────────────────

export async function install() {
  console.log(colors.cyan('Vietnamese IME Fix for Claude Code\n'));

  const active = getActiveClaudeInfo();
  if (active) {
    console.log(colors.bold('Detected Claude Code:'));
    console.log(`  Type:    ${active.type === 'binary' ? colors.yellow('Native Binary') : colors.green('NPM')}`);
    console.log(`  Version: ${active.version}`);
    console.log(`  Path:    ${colors.dim(active.path)}`);
    console.log('');
  }

  // Step 1: Find system Claude Code cli.js
  console.log('[1/2] Finding Claude Code...');
  let cliPath;
  try {
    cliPath = findSystemClaudeCli();
    console.log(`  Found: ${colors.dim(cliPath)}`);
  } catch (err) {
    console.log(colors.red(`  ${err.message}`));
    return;
  }

  // Step 2: Patch
  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);

  console.log(`[2/2] Patching... (v${version})`);
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

  console.log(colors.green('\nVietnamese input fix installed!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
  console.log('');
  console.log(colors.dim('Note: After running "claude update", re-run "cc-vietnamese install" to re-patch.'));
  console.log('');
}

// ─── Uninstall ──────────────────────────────────────────

export async function uninstall() {
  console.log(colors.cyan('Restoring Claude Code\n'));

  let cliPath;
  try {
    cliPath = findSystemClaudeCli();
  } catch (err) {
    console.log(colors.red(err.message));
    return;
  }

  console.log(`CLI: ${colors.dim(cliPath)}`);

  const content = readFileSync(cliPath, 'utf8');
  if (!isPatched(content)) {
    console.log(colors.yellow('\nNot patched. Nothing to restore.'));
    return;
  }

  const backupPath = findLatestBackup(cliPath);
  if (!backupPath) {
    throw new Error('No backup found. Cannot restore.');
  }

  console.log('Restoring from backup...');
  copyFileSync(backupPath, cliPath);

  console.log(colors.green('\nOriginal Claude Code restored!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

// ─── Update ─────────────────────────────────────────────

export async function update() {
  console.log(colors.cyan('Updating Claude Code + Vietnamese IME\n'));

  // Step 1: Run claude update
  console.log('[1/2] Updating Claude Code via system...');
  try {
    const { execSync } = await import('child_process');
    const output = execSync('claude update', { encoding: 'utf8', timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(`  ${output.trim().split('\n').join('\n  ')}`);
  } catch (err) {
    const stderr = err.stderr?.toString() || '';
    const stdout = err.stdout?.toString() || '';
    if (stdout.includes('already') || stdout.includes('up to date') || stderr.includes('already')) {
      console.log(colors.green('  Already up to date'));
    } else {
      console.log(colors.yellow(`  Update via "claude update" failed, trying npm...`));
      try {
        const { execSync } = await import('child_process');
        execSync('npm update -g @anthropic-ai/claude-code', { encoding: 'utf8', timeout: 120000 });
        console.log(colors.green('  Updated via npm'));
      } catch {
        console.log(colors.yellow('  Could not auto-update. Please update Claude Code manually.'));
      }
    }
  }

  // Step 2: Re-patch
  console.log('[2/2] Re-patching...');
  let cliPath;
  try {
    cliPath = findSystemClaudeCli();
  } catch (err) {
    console.log(colors.red(err.message));
    return;
  }

  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);
  console.log(`  Version: ${version}`);

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

  console.log(colors.green('\nUpdate complete!'));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

// ─── Fix (re-patch after system update) ─────────────────

export async function fix() {
  console.log(colors.cyan('Re-patching Claude Code after update\n'));

  let cliPath;
  try {
    cliPath = findSystemClaudeCli();
  } catch (err) {
    console.log(colors.red(err.message));
    return;
  }

  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);

  if (isPatched(content)) {
    console.log(colors.green('Already patched (v' + version + ')'));
    return;
  }

  createBackup(cliPath);
  const patched = applyPatch(content);
  if (!patched) {
    throw new Error(`Could not find code pattern to patch (v${version}).`);
  }
  writeFileSync(cliPath, patched, 'utf8');
  console.log(colors.green(`Patched successfully (v${version})`));
  console.log(colors.dim('Restart Claude Code for changes to take effect.'));
}

// ─── Setup ──────────────────────────────────────────────

export async function setup() {
  console.log(colors.cyan('Vietnamese IME Setup for Claude Code\n'));

  const active = getActiveClaudeInfo();
  if (active) {
    console.log(colors.bold('Active Claude Code:'));
    console.log(`  Type:    ${active.type === 'binary' ? colors.yellow('Native Binary') : colors.green('NPM')}`);
    console.log(`  Version: ${active.version}`);
    console.log(`  Path:    ${colors.dim(active.path)}`);
    console.log('');
  }

  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (!jsInstall) {
    console.log('No patchable installation found.\n');
    console.log('Install Claude Code first:');
    console.log(colors.bold('  npm install -g @anthropic-ai/claude-code\n'));
    console.log('Then patch:');
    console.log(colors.bold('  cc-vietnamese install\n'));
    return;
  }

  const content = readFileSync(jsInstall.path, 'utf8');
  const patched = isPatched(content);

  console.log(colors.bold('Patchable Installation:'));
  console.log(`  Version: ${getClaudeVersion(content)}`);
  console.log(`  Status:  ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
  console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
  console.log('');

  if (!patched) {
    console.log('To patch: ' + colors.bold('cc-vietnamese install\n'));
  }

  console.log(colors.bold('Commands:\n'));
  console.log('  cc-vietnamese install    # Patch Vietnamese IME fix');
  console.log('  cc-vietnamese update     # Update Claude + re-patch');
  console.log('  cc-vietnamese fix        # Re-patch after system update');
  console.log('  cc-vietnamese uninstall  # Remove patch, restore original');
  console.log('  cc-vietnamese status     # Check patch status');
  console.log('');
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

  // Patchable installation status
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (jsInstall) {
    try {
      const content = readFileSync(jsInstall.path, 'utf8');
      const version = getClaudeVersion(content);
      const patched = isPatched(content);
      const backups = listBackups(jsInstall.path);

      console.log(colors.bold('Patchable Installation:'));
      console.log(`  Version: ${version}`);
      console.log(`  Path:    ${colors.dim(jsInstall.path)}`);
      console.log(`  Status:  ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
      if (backups.length > 0) console.log(`  Backups: ${backups.length}`);
      console.log('');

      if (!patched) {
        console.log(colors.yellow('Vietnamese IME fix is NOT active.'));
        console.log(`Run: ${colors.bold('cc-vietnamese install')}\n`);
      }

    } catch (err) {
      console.log(colors.red(`  Error: ${err.message}\n`));
    }
  } else {
    console.log(colors.yellow('No patchable installation found.'));
    console.log(`Install Claude Code first: ${colors.bold('npm install -g @anthropic-ai/claude-code')}\n`);
  }
}

// ─── Alias (kept for backward compatibility) ────────────

export async function alias() {
  console.log(colors.yellow('Note: Alias is no longer needed.\n'));
  console.log('This tool now patches your system Claude Code directly.');
  console.log('Just use "claude" as normal after running "cc-vietnamese install".\n');
}

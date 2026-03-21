import { join } from 'path';
import { execSync } from 'child_process';

export const IS_WINDOWS = process.platform === 'win32';
export const HOME = process.env.USERPROFILE || process.env.HOME || '';
export const PATCH_MARKER = '/* Vietnamese IME fix */';
export const BACKUP_PREFIX = '.backup.';

export const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** Check if Claude Code processes are currently running */
export function isClaudeRunning() {
  try {
    const cmd = IS_WINDOWS
      ? 'tasklist /FI "IMAGENAME eq claude.exe" /NH'
      : 'pgrep -x claude';
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/** Warn if Claude is running, returns true if running (non-blocking) */
export function warnIfClaudeRunning() {
  if (!isClaudeRunning()) return false;
  console.log(colors.yellow('Note: Claude Code is currently running.'));
  console.log(colors.dim('Patch will apply on next restart. "claude update" may fail while running.\n'));
  return true;
}

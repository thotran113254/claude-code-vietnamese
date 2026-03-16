import { join } from 'path';

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

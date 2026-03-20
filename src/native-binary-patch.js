import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { IS_WINDOWS, HOME, PATCH_MARKER, BACKUP_PREFIX } from './utils.js';
import { extractPatchVars } from './detect-and-patch.js';

// Unique pattern in the patch for "already patched" detection (no marker needed)
const BINARY_PATCH_SIGNATURE = '/[\\x7F\\b]/.test(';

// ─── Native Binary Detection ────────────────────────────

function getNativeVersionsDir() {
  const candidates = [join(HOME, '.local/share/claude/versions')];
  if (process.platform === 'darwin') {
    candidates.push(join(HOME, 'Library/Application Support/claude/versions'));
  }
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** Find the latest native Claude binary in the versions directory */
export function findNativeBinary() {
  const dir = getNativeVersionsDir();
  if (!dir) return null;

  const versions = readdirSync(dir)
    .filter(f => !f.startsWith('.') && !f.startsWith(BACKUP_PREFIX))
    .sort((a, b) => {
      const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pb[i] || 0) - (pa[i] || 0);
        if (diff) return diff;
      }
      return 0;
    });

  if (versions.length === 0) return null;
  const binaryPath = join(dir, versions[0]);
  return existsSync(binaryPath) ? binaryPath : null;
}

/** Check if native binary is already patched */
export function isNativeBinaryPatched(binaryPath) {
  const buf = readFileSync(binaryPath);
  // Check for full marker, short marker, or patch signature
  return buf.indexOf(Buffer.from(PATCH_MARKER)) !== -1
    || buf.indexOf(Buffer.from(BINARY_PATCH_SIGNATURE)) !== -1;
}

/** Create backup of native binary */
export function createNativeBinaryBackup(binaryPath) {
  const dir = dirname(binaryPath);
  const name = basename(binaryPath);
  const backupPath = join(dir, `${BACKUP_PREFIX}${Date.now()}.${name}`);
  copyFileSync(binaryPath, backupPath);
  return backupPath;
}

/** Find latest backup for native binary */
export function findNativeBinaryLatestBackup(binaryPath) {
  const dir = dirname(binaryPath);
  const files = readdirSync(dir)
    .filter(f => f.startsWith(BACKUP_PREFIX) && !f.endsWith('.js'))
    .sort()
    .reverse();
  return files.length > 0 ? join(dir, files[0]) : null;
}

// ─── Binary Patch Logic ─────────────────────────────────

/**
 * Generate Vietnamese IME fix patch padded to exact target length.
 * Strategy: generate core patch, then dynamically add marker/padding.
 */
function generateSameLengthPatch(originalBlock, vars) {
  const { keyVar, inputVar, cursorVar, textFunc, offsetFunc, cb1, cb2 } = vars;

  // Build core patch using for...of (compact, saves ~18-20 bytes vs indexed loop)
  function buildCore(optChain) {
    const del = optChain ? 'O.deleteTokenBefore?.()??O.backspace()' : 'O.deleteTokenBefore()??O.backspace()';
    let c = `if(!${keyVar}.backspace&&!${keyVar}.delete&&${inputVar}.includes("\\x7F")){`;
    c += `let O=${cursorVar};for(let c of ${inputVar})`;
    c += `O=/[\\x7F\\b]/.test(c)?${del}:O.insert(c);`;
    c += `if(!${cursorVar}.equals(O)){if(${cursorVar}.text!==O.text)${textFunc}(O.text);${offsetFunc}(O.offset)}`;
    if (cb1 && cb2) c += `${cb1}(),${cb2}();`;
    c += `return}`;
    return c;
  }

  // Prefer optional chaining; fall back if it doesn't fit
  let core = buildCore(true);
  if (originalBlock.length - core.length < 0) core = buildCore(false);

  const available = originalBlock.length - core.length;

  if (available < 0) return null; // Patch too long, cannot fit

  // Insert marker/padding right after the opening {
  const braceIdx = core.indexOf('{') + 1;
  const before = core.slice(0, braceIdx);
  const after = core.slice(braceIdx);

  if (available === 0) return core;

  let filler;
  if (available >= PATCH_MARKER.length + 4) {
    // Full marker + comment padding
    const extra = available - PATCH_MARKER.length;
    filler = PATCH_MARKER + (extra >= 4 ? '/*' + ' '.repeat(extra - 4) + '*/' : ' '.repeat(extra));
  } else if (available >= PATCH_MARKER.length) {
    // Full marker + spaces
    filler = PATCH_MARKER + ' '.repeat(available - PATCH_MARKER.length);
  } else if (available >= 4) {
    // Short comment
    filler = '/*' + ' '.repeat(available - 4) + '*/';
  } else {
    // Just spaces
    filler = ' '.repeat(available);
  }

  return before + filler + after;
}

/**
 * Apply Vietnamese IME patch to a native Claude Code binary.
 * Byte-level in-place replacement with same-length constraint.
 * Returns { patchedCount } or null if pattern not found.
 */
export function applyNativeBinaryPatch(binaryPath) {
  const buf = Buffer.from(readFileSync(binaryPath));

  // Already patched?
  if (buf.indexOf(Buffer.from(BINARY_PATCH_SIGNATURE)) !== -1) {
    return { patchedCount: 0, alreadyPatched: true };
  }

  const anchor = Buffer.from('.backspace&&!');
  let offset = 0;
  let patchedCount = 0;

  while (true) {
    const idx = buf.indexOf(anchor, offset);
    if (idx === -1) break;

    // Find 'if(!' before the anchor
    let blockStart = -1;
    for (let i = idx - 1; i >= Math.max(0, idx - 30); i--) {
      if (buf.toString('utf8', i, i + 4) === 'if(!') {
        blockStart = i;
        break;
      }
    }
    if (blockStart === -1) { offset = idx + 1; continue; }

    // Read chunk and find 'return}' end
    const chunkEnd = Math.min(buf.length, blockStart + 600);
    const chunk = buf.toString('utf8', blockStart, chunkEnd);

    if (!chunk.includes('.includes(') || !chunk.includes('.delete&&')) {
      offset = idx + 1;
      continue;
    }

    const returnIdx = chunk.indexOf('return}');
    if (returnIdx === -1) { offset = idx + 1; continue; }

    const originalBlock = chunk.substring(0, returnIdx + 7);

    // Skip if already contains our patch signature
    if (originalBlock.includes(BINARY_PATCH_SIGNATURE)) {
      offset = blockStart + returnIdx + 7;
      continue;
    }

    // Extract variable names
    const vars = extractPatchVars(originalBlock);
    if (!vars) { offset = idx + 1; continue; }

    // Generate same-length patch
    const patch = generateSameLengthPatch(originalBlock, vars);
    if (!patch) {
      throw new Error(
        `Binary patch cannot fit in block (original: ${originalBlock.length} bytes). ` +
        `This Claude Code version may need a code update.`
      );
    }

    if (patch.length !== originalBlock.length) {
      throw new Error(`Length mismatch: patch=${patch.length}, original=${originalBlock.length}. Aborting.`);
    }

    // Write patch bytes into buffer
    Buffer.from(patch, 'utf8').copy(buf, blockStart);
    patchedCount++;
    offset = blockStart + patch.length;
  }

  if (patchedCount === 0) return null;

  writeFileSync(binaryPath, buf);
  return { patchedCount };
}

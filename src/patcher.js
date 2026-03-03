import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, realpathSync, readdirSync, copyFileSync, unlinkSync, statSync } from 'fs';
import { dirname, join, basename } from 'path';

const PATCH_MARKER = '/* Vietnamese IME fix */';
const BACKUP_PREFIX = '.backup.';

// Colors for terminal output
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Check if a file is a JavaScript file (not binary)
 */
function isJavaScriptFile(filePath) {
  try {
    const buffer = readFileSync(filePath);
    // Check for shebang (#!/usr/bin/env node) or starts with text
    const firstTwo = buffer.slice(0, 2).toString();
    if (firstTwo === '#!') return true;
    // Check for common binary magic bytes
    const magic = buffer.slice(0, 4).toString('hex');
    if (magic === 'cafebabe' || magic === 'cffaedfe' || magic === 'cefaedfe') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Find all Claude CLI installations
 */
function findAllClaudeInstallations() {
  const installations = [];

  // Check which command results
  try {
    const whichResult = execSync('/bin/bash -c "which -a claude 2>/dev/null"', { encoding: 'utf8' }).trim();
    const paths = whichResult.split('\n').filter(p => p.trim());
    for (const p of paths) {
      try {
        const realPath = realpathSync(p);
        if (existsSync(realPath) && !installations.find(i => i.path === realPath)) {
          const isJS = isJavaScriptFile(realPath);
          installations.push({
            path: realPath,
            symlink: p !== realPath ? p : null,
            isJavaScript: isJS,
            type: isJS ? 'npm' : 'binary',
          });
        }
      } catch {}
    }
  } catch {}

  // Add common npm paths
  const npmPaths = [
    '/usr/local/node/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    '/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js',
    join(process.env.HOME || '', '.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    join(process.env.HOME || '', 'node_modules/@anthropic-ai/claude-code/cli.js'),
  ];

  // Try npm root global
  try {
    const npmRoot = execSync('npm root -g 2>/dev/null', { encoding: 'utf8' }).trim();
    npmPaths.unshift(join(npmRoot, '@anthropic-ai/claude-code/cli.js'));
  } catch {}

  for (const p of npmPaths) {
    try {
      if (existsSync(p) && !installations.find(i => i.path === p)) {
        installations.push({
          path: p,
          symlink: null,
          isJavaScript: true,
          type: 'npm',
        });
      }
    } catch {}
  }

  return installations;
}

/**
 * Find Claude CLI JavaScript file to patch
 */
function findClaudeCli() {
  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (!jsInstall) {
    throw new Error(
      'No patchable Claude Code installation found.\n\n' +
      'This tool requires the npm-installed JavaScript version.\n' +
      'Install it with: npm install -g @anthropic-ai/claude-code\n\n' +
      'Found installations:\n' +
      installations.map(i => `  ${i.type}: ${i.path}`).join('\n')
    );
  }

  return jsInstall.path;
}

/**
 * Check if content is already patched
 */
function isPatched(content) {
  return content.includes(PATCH_MARKER);
}

/**
 * Get Claude version from file content
 */
function getClaudeVersion(content) {
  const match = content.match(/\/\/ Version: ([\d.]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Create backup of CLI file
 */
function createBackup(cliPath) {
  const dir = dirname(cliPath);
  const name = basename(cliPath, '.js');
  const timestamp = Date.now();
  const backupName = `${BACKUP_PREFIX}${timestamp}.${name}.js`;
  const backupPath = join(dir, backupName);

  copyFileSync(cliPath, backupPath);
  return backupPath;
}

/**
 * Find latest backup file
 */
function findLatestBackup(cliPath) {
  const dir = dirname(cliPath);
  const files = readdirSync(dir)
    .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js'))
    .sort()
    .reverse();

  return files.length > 0 ? join(dir, files[0]) : null;
}

/**
 * List all backups
 */
function listBackups(cliPath) {
  const dir = dirname(cliPath);
  try {
    return readdirSync(dir)
      .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.js'))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Generate the patched code block
 * Fixed version that processes each character individually for Vietnamese IME
 */
function generatePatch(keyVar, inputVar, cursorVar, textUpdateFunc, offsetFunc, callback1, callback2) {
  // Build the patch with character-by-character processing
  let patch = `if(!${keyVar}.backspace&&!${keyVar}.delete&&(${inputVar}.includes("\\x7f")||${inputVar}.includes("\\x08"))){${PATCH_MARKER}`;
  patch += `let _v=${cursorVar};`;
  patch += `for(let _i=0;_i<${inputVar}.length;_i++){`;
  patch += `let _c=${inputVar}.charCodeAt(_i);`;
  patch += `if(_c===127||_c===8){_v=_v.deleteTokenBefore?.()??_v.backspace()}`;
  patch += `else{_v=_v.insert(${inputVar}[_i])}`;
  patch += `}`;
  patch += `if(!${cursorVar}.equals(_v)){`;
  patch += `if(${cursorVar}.text!==_v.text)${textUpdateFunc}(_v.text);`;
  patch += `${offsetFunc}(_v.offset)}`;
  if (callback1 && callback2) {
    patch += `${callback1}(),${callback2}();`;
  }
  patch += `return}`;
  return patch;
}

/**
 * Apply the Vietnamese IME fix patch
 */
function applyPatch(content) {
  // DEL character (0x7f = 127)
  const DEL = String.fromCharCode(127);

  // Find the pattern containing DEL character in includes()
  const includesIdx = content.indexOf(`.includes("${DEL}")`);
  if (includesIdx === -1) {
    // Try escaped version
    const escapedIdx = content.indexOf('.includes("\\x7f")');
    if (escapedIdx === -1) {
      return null;
    }
  }

  // Use the actual DEL character for searching
  const searchPattern = `.includes("${DEL}")`;
  const patternIdx = content.indexOf(searchPattern);

  if (patternIdx === -1) {
    return null;
  }

  // Find start of if statement
  let start = content.lastIndexOf('if(!', patternIdx);
  if (start === -1) {
    return null;
  }

  // Extract the block by matching braces
  let braceCount = 0;
  let end = start;
  let foundFirstBrace = false;

  for (let i = start; i < content.length && i < start + 1000; i++) {
    if (content[i] === '{') {
      braceCount++;
      foundFirstBrace = true;
    } else if (content[i] === '}') {
      braceCount--;
      if (foundFirstBrace && braceCount === 0) {
        end = i + 1;
        break;
      }
    }
  }

  const original = content.substring(start, end);

  // Check if already patched
  if (original.includes(PATCH_MARKER)) {
    return content; // Already patched
  }

  // Extract variable names from the original block
  const keyMatch = original.match(/if\(!([a-zA-Z0-9_$]+)\.backspace/);
  const inputMatch = original.match(/([a-zA-Z0-9_$]+)\.includes\("/);
  const cursorMatch = original.match(/,([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/);
  const textFuncMatch = original.match(/\.text!==\w+\.text\)([a-zA-Z0-9_$]+)\(/);
  const offsetFuncMatch = original.match(/\.text\);([a-zA-Z0-9_$]+)\(\w+\.offset\)/);
  const callbackMatch = original.match(/([a-zA-Z0-9_$]+)\(\),([a-zA-Z0-9_$]+)\(\);return/);

  if (!keyMatch || !inputMatch || !cursorMatch || !textFuncMatch || !offsetFuncMatch) {
    // Try alternative extraction for different code patterns
    const keyMatch2 = original.match(/!([a-zA-Z0-9_$]+)\.backspace&&!\1\.delete/);
    const inputMatch2 = original.match(/([a-zA-Z0-9_$]+)\.includes\(/);
    const initMatch = original.match(/([a-zA-Z0-9_$]+)=([a-zA-Z0-9_$]+);for/);

    if (keyMatch2 && inputMatch2 && initMatch) {
      const origCursor = initMatch[2];
      const textMatch = original.match(/([a-zA-Z0-9_$]+)\([a-zA-Z0-9_$]+\.text\)/);
      const offMatch = original.match(/([a-zA-Z0-9_$]+)\([a-zA-Z0-9_$]+\.offset\)/);

      if (textMatch && offMatch) {
        const patch = generatePatch(
          keyMatch2[1],
          inputMatch2[1],
          origCursor,
          textMatch[1],
          offMatch[1],
          callbackMatch?.[1],
          callbackMatch?.[2]
        );
        return content.substring(0, start) + patch + content.substring(end);
      }
    }
    return null;
  }

  const origCursor = cursorMatch[2];

  const patch = generatePatch(
    keyMatch[1],
    inputMatch[1],
    origCursor,
    textFuncMatch[1],
    offsetFuncMatch[1],
    callbackMatch?.[1],
    callbackMatch?.[2]
  );

  return content.substring(0, start) + patch + content.substring(end);
}

/**
 * Get active Claude installation info
 */
function getActiveClaudeInfo() {
  try {
    const result = execSync('/bin/bash -c "which claude"', { encoding: 'utf8' }).trim();
    const realPath = realpathSync(result);
    const isJS = isJavaScriptFile(realPath);

    let version = 'unknown';
    try {
      version = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
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

/**
 * Install the Vietnamese IME fix
 */
export async function install() {
  console.log(colors.cyan('Vietnamese IME Fix for Claude Code\n'));

  // Check active installation
  const active = getActiveClaudeInfo();
  if (active && !active.isJavaScript) {
    console.log(colors.yellow('⚠ Warning: You are using the native binary version of Claude Code.'));
    console.log(`  Active: ${colors.dim(active.path)} (${active.version})`);
    console.log('');
    console.log('  This tool patches the npm JavaScript version instead.');
    console.log('  After patching, use the npm version with:');
    console.log(colors.bold('    /usr/local/node/bin/claude'));
    console.log('');
    console.log('  Or create an alias in your ~/.zshrc or ~/.bashrc:');
    console.log(colors.bold('    alias claude="/usr/local/node/bin/claude"'));
    console.log('');
  }

  // Find JavaScript CLI
  console.log('Finding Claude CLI (npm version)...');
  const cliPath = findClaudeCli();
  console.log(`  ${colors.dim(cliPath)}`);

  // Read content
  const content = readFileSync(cliPath, 'utf8');
  const version = getClaudeVersion(content);
  console.log(`  Version: ${version}`);

  // Check if already patched
  if (isPatched(content)) {
    console.log(colors.green('\n✓ Already patched!'));

    if (active && !active.isJavaScript) {
      console.log(colors.yellow('\n⚠ But you need to use the npm version:'));
      console.log(`  Run: ${colors.bold('/usr/local/node/bin/claude')}`);
      console.log(`  Or:  ${colors.bold('alias claude="/usr/local/node/bin/claude"')}`);
    }
    return;
  }

  // Create backup
  console.log('\nCreating backup...');
  const backupPath = createBackup(cliPath);
  console.log(`  ${colors.dim(backupPath)}`);

  // Apply patch
  console.log('\nApplying patch...');
  const patched = applyPatch(content);

  if (!patched) {
    throw new Error(
      'Could not find the code pattern to patch.\n' +
      'Claude CLI version may be incompatible.\n' +
      `Current version: ${version}`
    );
  }

  // Write patched content
  writeFileSync(cliPath, patched, 'utf8');

  console.log(colors.green('\n✓ Vietnamese input fix installed successfully!'));

  if (active && !active.isJavaScript) {
    console.log(colors.yellow('\n⚠ You are using the binary version. To use Vietnamese input:'));
    console.log('');
    console.log('  Run this to add alias to your shell:');
    console.log(colors.bold('    cc-vietnamese alias'));
    console.log('');
    console.log('  Then reload your shell:');
    console.log(colors.bold('    source ~/.zshrc'));
  } else {
    console.log(colors.dim('\nRestart Claude Code for changes to take effect.'));
  }
}

/**
 * Uninstall the patch and restore original
 */
export async function uninstall() {
  console.log(colors.cyan('Restoring Claude Code\n'));

  // Find CLI
  console.log('Finding Claude CLI...');
  const cliPath = findClaudeCli();
  console.log(`  ${colors.dim(cliPath)}`);

  // Find backup
  const backupPath = findLatestBackup(cliPath);

  if (!backupPath) {
    const content = readFileSync(cliPath, 'utf8');
    if (!isPatched(content)) {
      console.log(colors.yellow('\n✓ Not patched. Nothing to restore.'));
      return;
    }
    throw new Error('No backup found. Cannot restore original CLI.');
  }

  // Restore from backup
  console.log('\nRestoring from backup...');
  console.log(`  ${colors.dim(backupPath)}`);

  copyFileSync(backupPath, cliPath);
  unlinkSync(backupPath);

  console.log(colors.green('\n✓ Original Claude Code restored successfully!'));
  console.log(colors.dim('\nRestart Claude Code for changes to take effect.'));
}

/**
 * Add alias to shell config file
 */
export async function alias() {
  console.log(colors.cyan('Adding Claude alias to shell config\n'));

  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (!jsInstall) {
    console.log(colors.red('No npm (JavaScript) version found.'));
    console.log('Install first: npm install -g @anthropic-ai/claude-code');
    process.exit(1);
  }

  // Determine the claude bin path
  const npmBinPath = jsInstall.path.replace('/lib/node_modules/@anthropic-ai/claude-code/cli.js', '/bin/claude');

  // Detect shell config file
  const shell = process.env.SHELL || '/bin/zsh';
  const home = process.env.HOME;
  let configFile;

  if (shell.includes('zsh')) {
    configFile = join(home, '.zshrc');
  } else if (shell.includes('bash')) {
    // Check for .bash_profile first (macOS preference)
    const bashProfile = join(home, '.bash_profile');
    const bashrc = join(home, '.bashrc');
    configFile = existsSync(bashProfile) ? bashProfile : bashrc;
  } else {
    configFile = join(home, '.profile');
  }

  const aliasLine = `alias claude="${npmBinPath}"`;

  // Check if alias already exists
  let configContent = '';
  try {
    configContent = readFileSync(configFile, 'utf8');
  } catch {
    // File doesn't exist, will create
  }

  if (configContent.includes(`alias claude=`)) {
    // Check if it's our alias
    if (configContent.includes(aliasLine)) {
      console.log(colors.green('✓ Alias already configured in ' + configFile));
    } else {
      console.log(colors.yellow('⚠ A different claude alias exists in ' + configFile));
      console.log('  Please update it manually to:');
      console.log(colors.bold(`  ${aliasLine}`));
    }
  } else {
    // Add the alias
    const newContent = configContent + (configContent.endsWith('\n') ? '' : '\n') +
      `\n# Vietnamese-patched Claude Code\n${aliasLine}\n`;

    writeFileSync(configFile, newContent, 'utf8');
    console.log(colors.green('✓ Added alias to ' + configFile));
  }

  console.log('');
  console.log('To activate now, run:');
  console.log(colors.bold(`  source ${configFile}`));
  console.log('');
  console.log('Or restart your terminal.');
}

/**
 * Setup helper - shows instructions to use patched version
 */
export async function setup() {
  console.log(colors.cyan('Vietnamese IME Setup for Claude Code\n'));

  const installations = findAllClaudeInstallations();
  const jsInstall = installations.find(i => i.isJavaScript);

  if (!jsInstall) {
    console.log(colors.yellow('No npm (JavaScript) version found.\n'));
    console.log('Install Claude Code via npm:');
    console.log(colors.bold('  npm install -g @anthropic-ai/claude-code\n'));
    console.log('Then run:');
    console.log(colors.bold('  cc-vietnamese install'));
    return;
  }

  // Check if patched
  const content = readFileSync(jsInstall.path, 'utf8');
  const patched = isPatched(content);
  const version = getClaudeVersion(content);

  console.log(`NPM Version: ${version}`);
  console.log(`Patch Status: ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);
  console.log('');

  if (!patched) {
    console.log('First, apply the patch:');
    console.log(colors.bold('  sudo cc-vietnamese install\n'));
  }

  // Determine the claude bin path from the cli.js path
  const npmBinPath = jsInstall.path.replace('/lib/node_modules/@anthropic-ai/claude-code/cli.js', '/bin/claude');

  console.log(colors.bold('To use Vietnamese input, choose one option:\n'));

  console.log('Option 1: Run directly');
  console.log(colors.dim('  ' + npmBinPath + '\n'));

  console.log('Option 2: Create an alias (recommended)');
  console.log('  Add this line to your ~/.zshrc or ~/.bashrc:\n');
  console.log(colors.bold(`  alias claude="${npmBinPath}"`));
  console.log('');
  console.log('  Then reload your shell:');
  console.log(colors.bold('  source ~/.zshrc'));
  console.log('');

  console.log('Option 3: Quick test');
  console.log(colors.dim(`  ${npmBinPath} --version`));
}

/**
 * Show current status
 */
export async function status() {
  console.log(colors.cyan('Claude Code Status\n'));

  // Show active installation
  const active = getActiveClaudeInfo();
  if (active) {
    console.log(colors.bold('Active Installation:'));
    console.log(`  Type:     ${active.type === 'binary' ? colors.yellow('Native Binary') : colors.green('NPM (JavaScript)')}`);
    console.log(`  Version:  ${active.version}`);
    console.log(`  Path:     ${colors.dim(active.path)}`);
    if (active.symlink) {
      console.log(`  Symlink:  ${colors.dim(active.symlink)}`);
    }
    console.log('');
  }

  // Show all installations
  const installations = findAllClaudeInstallations();
  if (installations.length > 1) {
    console.log(colors.bold('All Installations:'));
    for (const inst of installations) {
      const marker = inst.path === active?.path ? ' (active)' : '';
      console.log(`  ${inst.type}: ${colors.dim(inst.path)}${marker}`);
    }
    console.log('');
  }

  // Show npm version patch status
  const jsInstall = installations.find(i => i.isJavaScript);
  if (jsInstall) {
    try {
      const content = readFileSync(jsInstall.path, 'utf8');
      const version = getClaudeVersion(content);
      const patched = isPatched(content);
      const backups = listBackups(jsInstall.path);

      console.log(colors.bold('NPM Version (patchable):'));
      console.log(`  Version:  ${version}`);
      console.log(`  Path:     ${colors.dim(jsInstall.path)}`);
      console.log(`  Status:   ${patched ? colors.green('Patched ✓') : colors.yellow('Not patched')}`);

      if (backups.length > 0) {
        console.log(`  Backups:  ${backups.length}`);
      }

      if (patched && active && !active.isJavaScript) {
        console.log('');
        console.log(colors.yellow('⚠ Patch applied but you\'re using the binary version.'));
        console.log('  To use Vietnamese input, run:');
        console.log(colors.bold(`    ${jsInstall.path.replace('/lib/node_modules/@anthropic-ai/claude-code/cli.js', '/bin/claude')}`));
      }
    } catch (err) {
      console.log(colors.red(`  Error: ${err.message}`));
    }
  } else {
    console.log(colors.yellow('No npm (JavaScript) version found to patch.'));
    console.log('Install with: npm install -g @anthropic-ai/claude-code');
  }
}

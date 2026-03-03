# cc-vietnamese

Fix Vietnamese input in Claude Code CLI.

Vietnamese Input Method Editors (IMEs) like **Unikey**, **OpenKey**, **EVKey**, and macOS default Vietnamese input send backspace characters followed by Unicode text when composing diacritics. The Claude Code CLI processes the deletion but fails to insert the remaining characters, causing input loss.

This tool patches the CLI to handle Vietnamese input correctly.

## Quick Start

```bash
# 1. Install the tool
npm install -g cc-vietnamese

sudo npm install -g @anthropic-ai/claude-code@latest

# 3. Apply the Vietnamese fix
sudo cc-vietnamese install

# 4. Add alias to your shell (auto-detects zsh/bash)
cc-vietnamese alias

# 5. Reload shell config
source ~/.zshrc
```

Or in one line:

```bash
sudo npm i -g cc-vietnamese @anthropic-ai/claude-code@latest && sudo cc-vietnamese install && cc-vietnamese alias && source ~/.zshrc
```

## Important: Binary vs NPM Version

Claude Code has two installation types:

| Type                 | Path                         | Can be patched? |
| -------------------- | ---------------------------- | --------------- |
| **Native Binary**    | `~/.local/bin/claude`        | No              |
| **NPM (JavaScript)** | `/usr/local/node/bin/claude` | **Yes**         |

This tool only patches the **NPM version**. If you're using the binary version (default on macOS), you need to:

1. Install/update the npm version
2. Apply the patch
3. Use the npm version instead

Check which version you're using:

```bash
cc-vietnamese status
```

## Installation

```bash
npm install -g cc-vietnamese
```

## Commands

| Command                        | Description                                       |
| ------------------------------ | ------------------------------------------------- |
| `sudo cc-vietnamese install`   | Apply Vietnamese IME fix (creates backup)         |
| `sudo cc-vietnamese uninstall` | Restore original Claude Code from backup          |
| `cc-vietnamese alias`          | Add alias to shell config (~/.zshrc or ~/.bashrc) |
| `cc-vietnamese status`         | Show patch status and installation info           |
| `cc-vietnamese setup`          | Show manual setup instructions                    |

## Using the Patched Version

After patching, you need to use the npm version of Claude Code.

### Recommended: Use the alias command

```bash
cc-vietnamese alias
source ~/.zshrc
```

This automatically adds the alias to your shell config.

### Alternative: Manual setup

**Direct path:**

```bash
/usr/local/node/bin/claude
```

**Manual alias** (add to ~/.zshrc):

```bash
alias claude="/usr/local/node/bin/claude"
```

**PATH priority** (add to ~/.zshrc):

```bash
export PATH="/usr/local/node/bin:$PATH"
```

## How it works

Vietnamese IMEs send input like this when typing "việt":

```
v → i → e [DEL] ê → t [DEL] ệ → t
```

The original code only handles the DEL character and returns early, losing the replacement text. The fix processes each character individually:

```javascript
// For each character in input:
// - If DEL (127) or BS (8): backspace
// - Otherwise: insert the character
```

## Troubleshooting

### Vietnamese still not working

1. Make sure you're using the **npm version**, not the binary:

   ```bash
   cc-vietnamese status
   which claude
   ```

2. Update npm version to latest:

   ```bash
   sudo npm install -g @anthropic-ai/claude-code@latest
   sudo cc-vietnamese install
   ```

3. Restart Claude Code completely

### Permission denied

```bash
sudo cc-vietnamese install
```

### Pattern not found

The Claude Code version may have changed. Check compatibility:

```bash
cc-vietnamese status
```

## Supported IME methods

- **Telex**: Most popular method (e.g., "vieejt" → "việt")
- **VNI**: Number-based method (e.g., "vie6t" → "việt")
- **VIQR**: ASCII-based method

## Supported IME software

- macOS Vietnamese Input
- OpenKey
- EVKey
- Unikey (Windows, with Wine on macOS)

## Credits

Based on the technical research from [claude-code-vime](https://github.com/trancong12102/claude-code-vime).

## License

MIT

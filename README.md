# cc-vietnamese

Fix Vietnamese input in Claude Code CLI — supports **Windows**, **Linux**, and **macOS** with both **native binary** and **npm** installations.

Vietnamese IMEs (Unikey, OpenKey, EVKey, macOS Vietnamese input) send backspace + replacement characters when composing diacritics. Claude Code processes the deletion but drops the replacement text. This tool patches the CLI to handle each character individually.

## Quick Start

```bash
# One-liner — no npm publish needed, install directly from GitHub
npx github:thotran113254/claude-code-vietnamese install
```

Or install globally for repeated use:

```bash
npm install -g github:thotran113254/claude-code-vietnamese
cc-vietnamese install
```

That's it. Works on Windows, Linux, macOS with both native binary and npm installations. No sudo/admin required.

## How It Works

| Platform | Installation Type | Strategy |
|---|---|---|
| **All** | **NPM (JavaScript)** | Patches `cli.js` directly |
| **Linux/macOS** | **Native Binary** | Installs npm version to `~/.cc-vietnamese/`, patches it, redirects symlink, sets up systemd watcher |
| **Windows** | **Native Binary** | Installs npm version to `~/.cc-vietnamese/`, patches it, renames `claude.exe`, creates `.cmd` + bash wrappers, sets up Task Scheduler watcher |

### Native Binary Flow (Linux)

```
Native auto-update overwrites symlink
        ↓
systemd watcher detects change
        ↓
cc-vietnamese fix (restores symlink → patched npm version)
```

### Native Binary Flow (Windows)

```
Native auto-update places new claude.exe
        ↓
Task Scheduler detects claude.exe
        ↓
Auto-fix renames exe + restores claude.cmd wrapper
```

## Commands

| Command | Description |
|---|---|
| `cc-vietnamese install` | Full setup: install npm version, patch, redirect command, setup watcher |
| `cc-vietnamese update` | Update npm version + re-patch + fix redirect |
| `cc-vietnamese fix` | Fix redirect after native auto-update |
| `cc-vietnamese uninstall` | Restore original Claude Code + disable watcher |
| `cc-vietnamese status` | Check patch status, redirect, watcher |
| `cc-vietnamese alias` | Add alias to shell config (PowerShell / bash / zsh) |
| `cc-vietnamese setup` | Show setup instructions |

## After Claude Updates

The auto-fix watcher handles most updates automatically. If versions diverge significantly, run:

```bash
cc-vietnamese update
```

## File Locations

### Linux/macOS

| File | Path |
|---|---|
| NPM version | `~/.cc-vietnamese/` |
| Patched CLI | `~/.cc-vietnamese/lib/node_modules/@anthropic-ai/claude-code/cli.js` |
| Symlink | `~/.local/bin/claude` → patched npm version |
| Watcher | `~/.config/systemd/user/claude-viet-watcher.*` |

### Windows

| File | Path |
|---|---|
| NPM version | `%USERPROFILE%\.cc-vietnamese\` |
| Patched CLI | `%USERPROFILE%\.cc-vietnamese\node_modules\@anthropic-ai\claude-code\cli.js` |
| CMD wrapper | `%USERPROFILE%\.local\bin\claude.cmd` |
| Git Bash wrapper | `%USERPROFILE%\.local\bin\claude` (no extension) |
| Original binary | `%USERPROFILE%\.local\bin\claude-original.exe` |
| Watcher | Task Scheduler: `ClaudeVietnameseAutoFix` |

## Vietnamese IME Input

Vietnamese IMEs send input like this when typing "viet":

```
v → i → e [DEL] ê → t [DEL] ệ → t
```

The original code handles only the DEL and returns early, losing the replacement. The fix processes each character:
- DEL (0x7f) or BS (0x08): backspace
- Otherwise: insert the character

## Supported IME Software

- Unikey
- OpenKey
- EVKey
- macOS Vietnamese Input

## Supported IME Methods

- **Telex**: e.g., "vieejt" → "viet"
- **VNI**: e.g., "vie6t" → "viet"
- **VIQR**: ASCII-based

## Troubleshooting

### Check status

```bash
cc-vietnamese status
```

### Vietnamese still not working

**Linux/macOS:**
```bash
readlink -f $(which claude)
# Should point to ~/.cc-vietnamese/lib/node_modules/@anthropic-ai/claude-code/cli.js
cc-vietnamese fix
```

**Windows:**
```cmd
where claude
:: Should show %USERPROFILE%\.local\bin\claude.cmd
cc-vietnamese fix
```

### After major version update

```bash
cc-vietnamese update
```

### Permission issues

The tool installs to `~/.cc-vietnamese/` (user directory) — no sudo/admin required.

On Windows, the Task Scheduler watcher runs as the current user (no elevation needed).

## Credits

Inspired by [claude-code-vime](https://github.com/trancong12102/claude-code-vime) by [@trancong12102](https://github.com/trancong12102).

Original project by [@quangpl](https://github.com/quangpl/claude-code-vietnamese).

## License

MIT

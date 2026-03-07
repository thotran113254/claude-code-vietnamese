# cc-vietnamese

Fix Vietnamese input in Claude Code CLI — supports both **native binary** and **npm** installations.

Vietnamese IMEs (Unikey, OpenKey, EVKey, macOS Vietnamese input) send backspace + replacement characters when composing diacritics. Claude Code processes the deletion but drops the replacement text. This tool patches the CLI to handle each character individually.

## Quick Start

```bash
npm install -g cc-vietnamese
cc-vietnamese install
```

That's it. Works with both native binary and npm installations.

## How It Works

| Installation Type | Strategy |
|---|---|
| **NPM (JavaScript)** | Patches `cli.js` directly |
| **Native Binary** | Auto-installs npm version to `~/.cc-vietnamese/`, patches it, redirects `~/.local/bin/claude` symlink, sets up systemd watcher to auto-fix after native auto-updates |

### Native Binary Flow

```
Native auto-update overwrites symlink
        ↓
systemd watcher detects change
        ↓
cc-vietnamese fix (restores symlink → patched npm version)
```

## Commands

| Command | Description |
|---|---|
| `cc-vietnamese install` | Full setup: install npm version, patch, redirect symlink, setup watcher |
| `cc-vietnamese update` | Update npm version + re-patch + fix symlink |
| `cc-vietnamese fix` | Fix symlink only (fast — used by auto-fix watcher) |
| `cc-vietnamese uninstall` | Restore original Claude Code + disable watcher |
| `cc-vietnamese status` | Check patch status, symlink, watcher |
| `cc-vietnamese alias` | Add alias to shell config (~/.zshrc or ~/.bashrc) |
| `cc-vietnamese setup` | Show setup instructions |

## After Claude Updates

When Claude auto-updates the native binary, the systemd watcher automatically fixes the symlink. If versions diverge significantly, run:

```bash
cc-vietnamese update
```

## File Locations

| File | Path |
|---|---|
| NPM version | `~/.cc-vietnamese/` |
| Patched CLI | `~/.cc-vietnamese/lib/node_modules/@anthropic-ai/claude-code/cli.js` |
| Symlink | `~/.local/bin/claude` → patched npm version |
| Watcher units | `~/.config/systemd/user/claude-viet-watcher.*` |

## Vietnamese IME Input

Vietnamese IMEs send input like this when typing "việt":

```
v → i → e [DEL] ê → t [DEL] ệ → t
```

The original code handles only the DEL and returns early, losing the replacement. The fix processes each character:
- DEL (0x7f) or BS (0x08): backspace
- Otherwise: insert the character

## Supported IME Software

- macOS Vietnamese Input
- Unikey
- OpenKey
- EVKey

## Supported IME Methods

- **Telex**: e.g., "vieejt" → "việt"
- **VNI**: e.g., "vie6t" → "việt"
- **VIQR**: ASCII-based

## Troubleshooting

### Check status

```bash
cc-vietnamese status
```

### Vietnamese still not working

```bash
# Verify which binary is active
readlink -f $(which claude)
# Should point to ~/.cc-vietnamese/lib/node_modules/@anthropic-ai/claude-code/cli.js

# If not, fix it
cc-vietnamese fix
```

### After major version update

```bash
cc-vietnamese update
```

### Permission issues

The tool installs to `~/.cc-vietnamese/` (user directory) — no sudo needed.

## Credits

Inspired by [claude-code-vime](https://github.com/trancong12102/claude-code-vime) by [@trancong12102](https://github.com/trancong12102).

Original project by [@quangpl](https://github.com/quangpl/claude-code-vietnamese).

## License

MIT

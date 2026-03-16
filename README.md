# cc-vietnamese

Fix Vietnamese input in Claude Code CLI — patches your system Claude Code directly.

Vietnamese IMEs (Unikey, OpenKey, EVKey, macOS Vietnamese input) send backspace + replacement characters when composing diacritics. Claude Code processes the deletion but drops the replacement text. This tool patches the CLI to handle each character individually.

## ✨ What's New in v3

- **No separate install** — patches your system Claude Code directly
- **No symlink redirect** — `claude` command stays exactly as the system configured it
- **No watcher/systemd** — no background services interfering with Claude updates
- **Claude updates work normally** — just re-run `cc-vietnamese fix` after updating

## Quick Start

```bash
# One-liner — install directly from GitHub
npx github:thotran113254/claude-code-vietnamese install
```

Or install globally for repeated use:

```bash
npm install -g github:thotran113254/claude-code-vietnamese
cc-vietnamese install
```

That's it. Works on Windows, Linux, macOS. No sudo/admin required.

## How It Works

The tool finds your system's Claude Code `cli.js` and patches it in-place:

```
claude update          → Claude Code updates normally
                       ↓
cc-vietnamese fix      → Re-patches the updated cli.js
                       ↓
claude                 → Vietnamese IME works ✓
```

**No separate npm install. No symlink hijacking. No background watchers.**

## Commands

| Command | Description |
|---|---|
| `cc-vietnamese install` | Find system Claude Code and patch Vietnamese IME fix |
| `cc-vietnamese update` | Run `claude update` + re-patch |
| `cc-vietnamese fix` | Re-patch after Claude Code updates |
| `cc-vietnamese uninstall` | Remove patch, restore original from backup |
| `cc-vietnamese status` | Check patch status |
| `cc-vietnamese setup` | Show setup instructions |

## After Claude Updates

When Claude Code updates itself, the patch is overwritten. Simply re-patch:

```bash
cc-vietnamese fix
```

Or update + re-patch in one step:

```bash
cc-vietnamese update
```

## Vietnamese IME Input

Vietnamese IMEs send input like this when typing "việt":

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

- **Telex**: e.g., "vieejt" → "việt"
- **VNI**: e.g., "vie6t" → "việt"
- **VIQR**: ASCII-based

## Troubleshooting

### Check status

```bash
cc-vietnamese status
```

### Vietnamese still not working after update

```bash
cc-vietnamese fix
```

### Permission issues

The tool patches files in your existing Claude Code installation directory. If Claude Code was installed with `npm install -g`, you may need appropriate permissions for that directory.

## Upgrading from v2

If you previously used v2 (which installed a separate npm version in `~/.cc-vietnamese/` and used systemd watchers):

1. Run: `cc-vietnamese install` (the new version patches in-place)
2. Optionally clean up the old setup:
   ```bash
   # Disable old watcher
   systemctl --user disable --now claude-viet-watcher.path 2>/dev/null
   # Remove old separate install
   rm -rf ~/.cc-vietnamese
   ```

## Credits

Inspired by [claude-code-vime](https://github.com/trancong12102/claude-code-vime) by [@trancong12102](https://github.com/trancong12102).

Original project by [@quangpl](https://github.com/quangpl/claude-code-vietnamese).

## License

MIT

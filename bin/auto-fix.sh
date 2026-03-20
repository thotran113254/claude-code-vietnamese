#!/bin/bash
# Auto-fix Vietnamese IME for Claude Code (npm + native binary)
# Uses state tracking for O(1) fast path — no large file scanning when nothing changed
# Safe to run from cron, systemd watcher, or manually

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$HOME/.local/share/cc-vietnamese"
LOG="$STATE_DIR/auto-fix.log"
VERSIONS_DIR="$HOME/.local/share/claude/versions"

mkdir -p "$STATE_DIR"

NEED_FIX=0

# --- Check native binary (compare latest version filename with stored state) ---
if [ -d "$VERSIONS_DIR" ]; then
  LATEST=$(ls "$VERSIONS_DIR" 2>/dev/null | grep -v '^\.' | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)
  PATCHED_BIN=$(cat "$STATE_DIR/patched-binary" 2>/dev/null)
  [ -n "$LATEST" ] && [ "$LATEST" != "$PATCHED_BIN" ] && NEED_FIX=1
fi

# --- Check npm cli.js (compare mtime with stored state) ---
CLI_JS=""
for p in \
  "$(npm root -g 2>/dev/null)/@anthropic-ai/claude-code/cli.js" \
  "$HOME/.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js" \
  "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js"; do
  [ -f "$p" ] && CLI_JS="$p" && break
done

if [ -n "$CLI_JS" ]; then
  CURRENT_MTIME=$(stat -c %Y "$CLI_JS" 2>/dev/null || stat -f %m "$CLI_JS" 2>/dev/null)
  PATCHED_MTIME=$(cat "$STATE_DIR/patched-npm-mtime" 2>/dev/null)
  [ "$CURRENT_MTIME" != "$PATCHED_MTIME" ] && NEED_FIX=1
fi

# --- Fast path: nothing changed ---
[ "$NEED_FIX" = "0" ] && exit 0

# --- Apply fix ---
cd "$SCRIPT_DIR" || exit 1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Detected update, applying fix..." >> "$LOG"
node bin/cc-vietnamese.js fix >> "$LOG" 2>&1
EXIT_CODE=$?

# --- Update state on success ---
if [ $EXIT_CODE -eq 0 ]; then
  [ -n "$LATEST" ] && echo "$LATEST" > "$STATE_DIR/patched-binary"
  if [ -n "$CLI_JS" ]; then
    stat -c %Y "$CLI_JS" 2>/dev/null > "$STATE_DIR/patched-npm-mtime" || \
    stat -f %m "$CLI_JS" 2>/dev/null > "$STATE_DIR/patched-npm-mtime"
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fix applied successfully" >> "$LOG"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Fix failed (exit $EXIT_CODE)" >> "$LOG"
fi

# Keep log under 100 lines
tail -100 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG" 2>/dev/null

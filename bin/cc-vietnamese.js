#!/usr/bin/env node

import { install, uninstall, update, fix, status, setup, alias } from '../src/patcher.js';

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
cc-vietnamese - Fix Vietnamese input in Claude Code (native + npm)

Usage:
  cc-vietnamese install    Auto-install npm version, patch, redirect symlink, setup watcher
  cc-vietnamese update     Update npm version + re-patch + fix symlink
  cc-vietnamese fix        Fix symlink only (fast, used by auto-fix watcher)
  cc-vietnamese uninstall  Restore original Claude Code + disable watcher
  cc-vietnamese status     Check patch status, symlink, watcher
  cc-vietnamese alias      Add alias to shell config (~/.zshrc or ~/.bashrc)
  cc-vietnamese setup      Show setup instructions
  cc-vietnamese help       Show this help

Quick Start:
  cc-vietnamese install
`;

async function main() {
  switch (command) {
    case 'install':
      await install();
      break;
    case 'uninstall':
      await uninstall();
      break;
    case 'update':
      await update();
      break;
    case 'fix':
      await fix();
      break;
    case 'status':
      await status();
      break;
    case 'alias':
      await alias();
      break;
    case 'setup':
      await setup();
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node

import { install, uninstall, update, fix, status, setup, alias } from '../src/commands.js';

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
cc-vietnamese - Fix Vietnamese input in Claude Code CLI

Usage:
  cc-vietnamese install    Patch Vietnamese IME fix into Claude Code
  cc-vietnamese update     Update Claude Code + re-patch
  cc-vietnamese fix        Re-patch after Claude Code updates
  cc-vietnamese uninstall  Remove patch, restore original
  cc-vietnamese status     Check patch status
  cc-vietnamese setup      Show setup instructions
  cc-vietnamese help       Show this help

Quick Start:
  npm install -g @anthropic-ai/claude-code   # Install Claude Code (if not installed)
  cc-vietnamese install                       # Patch Vietnamese IME fix

After Claude updates:
  cc-vietnamese fix                           # Re-patch after "claude update"
`;

async function main() {
  switch (command) {
    case 'install':
    case 'patch':
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

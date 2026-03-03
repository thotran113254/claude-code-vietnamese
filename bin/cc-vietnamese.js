#!/usr/bin/env node

import { install, uninstall, status, setup, alias } from '../src/patcher.js';

const args = process.argv.slice(2);
const command = args[0];

const HELP = `
cc-vietnamese - Fix Vietnamese input in Claude Code

Usage:
  cc-vietnamese install    Apply Vietnamese IME fix (creates backup)
  cc-vietnamese uninstall  Restore original Claude Code
  cc-vietnamese status     Check current patch status
  cc-vietnamese alias      Add alias to shell config (~/.zshrc)
  cc-vietnamese setup      Show manual setup instructions
  cc-vietnamese help       Show this help

Quick Start:
  sudo cc-vietnamese install && cc-vietnamese alias
`;

async function main() {
  switch (command) {
    case 'install':
      await install();
      break;
    case 'uninstall':
      await uninstall();
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

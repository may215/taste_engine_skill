#!/usr/bin/env node
/**
 * Uninstall Taste Engine adapter for this platform.
 *
 * Removes config files and hooks created by install.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectDir = process.argv[2] || process.cwd();

function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('  Removed ' + filePath);
  }
}

function removeFromFile(filePath, marker) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(marker)) {
    content = content.split('\n').filter(l => !l.includes(marker) && !l.includes('Taste Engine')).join('\n');
    fs.writeFileSync(filePath, content);
    console.log('  Cleaned ' + filePath);
  }
}

console.log('Uninstalling Taste Engine...');

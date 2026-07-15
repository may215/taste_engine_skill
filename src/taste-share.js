#!/usr/bin/env node
/**
 * taste-share.js — Share and import taste profiles.
 *
 * Push your learned coding patterns as a portable artifact.
 * Pull someone else's profile to adopt their style.
 *
 * Usage:
 *   taste-share.js push [--name <profile-name>] [--output <path>]
 *   taste-share.js pull <source>
 *   taste-share.js pull <user>/<profile>
 *   taste-share.js pull ./path/to/taste.json
 *   taste-share.js pull <url>
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const MEMORY_DIR = TASTE_DIR + '/memory';
const EXPORT_DIR = TASTE_DIR + '/exports';

// ── Export ────────────────────────────────────────────────────────────────────

function exportProfile(name) {
  if (!fs.existsSync(MEMORY_DIR)) {
    console.error('No taste memories found. Nothing to export.');
    process.exit(1);
  }

  const memories = {};
  function walkDir(dir, prefix) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'raw') {
        walkDir(fullPath, prefix ? prefix + '/' + entry.name : entry.name);
      } else if (entry.name.endsWith('.md') && entry.name !== 'MEMORY.md') {
        const relPath = prefix ? prefix + '/' + entry.name : entry.name;
        try {
          memories[relPath] = fs.readFileSync(fullPath, 'utf8');
        } catch (e) {}
      }
    }
  }
  walkDir(MEMORY_DIR, '');

  const profile = {
    name: name || 'untitled-taste-profile',
    exportedAt: new Date().toISOString(),
    patterns: memories,
    count: Object.keys(memories).length,
  };

  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const outPath = path.join(EXPORT_DIR, (name || 'taste') + '.json');
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2));
  console.log('Exported ' + profile.count + ' patterns to ' + outPath);
  return outPath;

  // Optionally push as gist
  // if (args.includes('--gist') || args.includes('--push')) {
  //   const json = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  //   pushToGist(json);
  // }
}

// ── Verify imported profile ───────────────────────────────────────────────────

function verifyProfile(profile) {
  const warnings = [];
  if (!profile.patterns || typeof profile.patterns !== 'object') {
    warnings.push('Missing or invalid "patterns" object');
  }
  if (!profile.name) warnings.push('Missing profile name');
  if (profile.exportedAt && isNaN(Date.parse(profile.exportedAt))) {
    warnings.push('Invalid exportedAt date');
  }

  // Check each pattern for required frontmatter
  if (profile.patterns) {
    let badCount = 0;
    for (const [relPath, content] of Object.entries(profile.patterns)) {
      if (!content.startsWith('---\n')) {
        badCount++;
        warnings.push('Missing frontmatter in ' + relPath);
      }
    }
    if (badCount > 0) warnings.push(badCount + ' patterns missing frontmatter');
  }

  return warnings;
}

// ── Import ────────────────────────────────────────────────────────────────────

function importProfile(source) {
  let data;

  // Local file
  if (fs.existsSync(source)) {
    data = fs.readFileSync(source, 'utf8');
  }
  // URL
  else if (source.startsWith('http://') || source.startsWith('https://')) {
    const result = spawnSync('curl', ['-sL', source], { timeout: 10000, encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout) {
      console.error('Failed to fetch: ' + source);
      process.exit(1);
    }
    data = result.stdout;
  } else {
    console.error('Unknown source: ' + source);
    process.exit(1);
  }

  let profile;
  try {
    profile = JSON.parse(data);
  } catch (e) {
    console.error('Invalid JSON in profile');
    process.exit(1);
  }

  const warnings = verifyProfile(profile);
  if (warnings.length > 0) {
    console.log('Profile warnings:');
    for (const w of warnings) console.log('  ⚠ ' + w);
  }

  const patternCount = Object.keys(profile.patterns || {}).length;
  if (patternCount === 0) {
    console.error('No patterns found in profile');
    process.exit(1);
  }

  // Write each pattern, preserving category directory structure
  let written = 0;
  for (const [relPath, content] of Object.entries(profile.patterns)) {
    const targetPath = path.join(MEMORY_DIR, relPath);
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetPath, content);
    written++;
  }

  console.log('Imported ' + written + ' patterns from "' + profile.name + '"');
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const w of warnings) console.log('  ⚠ ' + w);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'push':
    case 'export': {
      let name = 'taste';
      let nameIdx = args.indexOf('--name');
      if (nameIdx >= 0 && args[nameIdx + 1]) name = args[nameIdx + 1];
      exportProfile(name);
      break;
    }

    case 'pull':
    case 'import': {
      const source = args[1];
      if (!source) {
        console.error('Usage: taste-share.js pull <source>');
        process.exit(1);
      }
      importProfile(source);
      break;
    }

    default:
      console.log('Usage:');
      console.log('  taste-share.js push [--name <name>]           Export profile');
      console.log('  taste-share.js pull <source>                  Import profile');
      console.log('');
      console.log('Sources:');
      console.log('  ./path/to/taste.json                          Local file');
      console.log('  https://example.com/profile.json              Remote URL');
  }
}

main();

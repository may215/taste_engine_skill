#!/usr/bin/env node
/**
 * taste-commands.js — Handles /taste subcommands.
 *
 * Usage:
 *   taste-commands.js list [category]
 *   taste-commands.js show <pattern>
 *   taste-commands.js search <query>
 *   taste-commands.js reset [pattern]
 *   taste-commands.js status
 *   taste-commands.js inject
 */

const fs = require('fs');
const path = require('path');

const TASTE_DIR = process.env.HOME + '/.claude/skills/taste';
const MEMORY_DIR = TASTE_DIR + '/memory';
const CACHE_DIR = TASTE_DIR + '/cache';

// ── Utility ──────────────────────────────────────────────────────────────────

function walkMemories(dir, prefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMemories(fullPath, prefix ? prefix + '/' + entry.name : entry.name));
    } else if (entry.name.endsWith('.md') && entry.name !== 'MEMORY.md') {
      const rel = prefix ? prefix + '/' + entry.name : entry.name;
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const nameMatch = content.match(/name:\s*(\S+)/);
        const descMatch = content.match(/description:\s*"(.+?)"/);
        const strengthMatch = content.match(/strength:\s*([\d.]+)/);
        results.push({
          slug: entry.name.replace('.md', ''),
          name: nameMatch ? nameMatch[1] : entry.name.replace('.md', ''),
          description: descMatch ? descMatch[1] : '',
          strength: strengthMatch ? parseFloat(strengthMatch[1]) : 0,
          category: prefix || 'uncategorized',
          path: rel,
          fullPath,
          content,
        });
      } catch (e) {}
    }
  }
  return results;
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdList(category) {
  const memories = walkMemories(MEMORY_DIR, '');
  if (memories.length === 0) {
    console.log('No taste patterns learned yet. Start by writing/editing code.');
    return;
  }

  const filtered = category
    ? memories.filter(m => m.category === category)
    : memories;

  if (filtered.length === 0) {
    console.log('No patterns in category "' + category + '"');
    console.log('Available categories: ' + [...new Set(memories.map(m => m.category))].join(', '));
    return;
  }

  const sorted = filtered.sort((a, b) => b.strength - a.strength);
  console.log('Taste profile (' + filtered.length + ' patterns):');
  console.log('');
  for (const m of sorted) {
    const bar = strengthBar(m.strength);
    console.log('  ' + bar + ' ' + m.name + ' — ' + m.description);
    console.log('       (' + m.category + ')');
  }
}

function cmdShow(patternName) {
  const memories = walkMemories(MEMORY_DIR, '');
  const match = memories.find(m => m.name === patternName || m.slug === patternName);
  if (!match) {
    console.log('Pattern not found: ' + patternName);
    return;
  }
  console.log('── ' + match.name + ' ───────────────────────────────────');
  console.log('  Category: ' + match.category);
  console.log('  Strength: ' + strengthBar(match.strength) + ' (' + match.strength.toFixed(2) + ')');
  console.log('  Path: ' + match.path);
  console.log('');
  console.log(match.content);
}

function cmdSearch(query) {
  const memories = walkMemories(MEMORY_DIR, '');
  const lower = query.toLowerCase();
  const results = memories.filter(m =>
    m.name.toLowerCase().includes(lower) ||
    m.description.toLowerCase().includes(lower) ||
    m.category.toLowerCase().includes(lower) ||
    m.content.toLowerCase().includes(lower)
  );

  if (results.length === 0) {
    console.log('No patterns match "' + query + '"');
    return;
  }

  const sorted = results.sort((a, b) => b.strength - a.strength);
  console.log('Patterns matching "' + query + '" (' + results.length + '):');
  for (const m of sorted) {
    console.log('  ' + strengthBar(m.strength) + ' ' + m.name + ' — ' + m.description);
  }
}

function cmdReset(patternName) {
  if (patternName) {
    const memories = walkMemories(MEMORY_DIR, '');
    const match = memories.find(m => m.name === patternName || m.slug === patternName);
    if (!match) { console.log('Pattern not found: ' + patternName); return; }
    fs.unlinkSync(match.fullPath);
    console.log('Deleted pattern: ' + match.name);
  } else {
    // Recursive delete all memories
    const memories = walkMemories(MEMORY_DIR, '');
    for (const m of memories) {
      try { fs.unlinkSync(m.fullPath); } catch (e) {}
    }
    // Delete raw + category subdirs
    const keep = [MEMORY_DIR + '/MEMORY.md'];
    function cleanDir(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        if (keep.includes(fullPath)) continue;
        if (fs.statSync(fullPath).isDirectory()) {
          cleanDir(fullPath);
          try { fs.rmdirSync(fullPath); } catch (e) {}
        } else {
          try { fs.unlinkSync(fullPath); } catch (e) {}
        }
      }
    }
    cleanDir(MEMORY_DIR);
    console.log('All taste patterns reset. Ready to learn fresh.');
  }
  // Clear cache
  const cachePath = CACHE_DIR + '/taste-cache.json';
  if (fs.existsSync(cachePath)) {
    try { fs.writeFileSync(cachePath, JSON.stringify({ files: {} })); } catch (e) {}
  }
}

function cmdStatus() {
  const memories = walkMemories(MEMORY_DIR, '');
  // Also check for compound patterns
  const compoundDir = MEMORY_DIR + '/compound';
  const compoundCount = fs.existsSync(compoundDir) ? fs.readdirSync(compoundDir).filter(e => e.endsWith('.md')).length : 0;
  const categories = [...new Set(memories.map(m => m.category))];
  const avgStrength = memories.length
    ? (memories.reduce((s, m) => s + m.strength, 0) / memories.length).toFixed(2)
    : '0';
  const cachePath = CACHE_DIR + '/taste-cache.json';
  let cacheEntries = 0;
  try { cacheEntries = Object.keys(JSON.parse(fs.readFileSync(cachePath, 'utf8')).files || {}).length; } catch(e) {}

  console.log('Taste Engine Status');
  console.log('');
  console.log('  Patterns learned:  ' + memories.length);
  console.log('  Categories:        ' + categories.join(', '));
  console.log('  Avg strength:      ' + avgStrength);
  console.log('  Cache entries:     ' + cacheEntries);
  console.log('  Memory dir:        ' + MEMORY_DIR);
  console.log('');
  console.log('Compound patterns:  ' + compoundCount);
  console.log('Hook active:         ' + (memories.length > 0 ? '✓ (PostToolUse)' : '— (no patterns yet)'));
  console.log('Watcher:             ' + (fs.existsSync(CACHE_DIR + '/watch.pid') ? '✓ running' : '— stopped'));
  console.log('');
  console.log('Commands: /taste list | show <p> | search <q> | forget <p> | reset | status | decay | compound');
}

function cmdInject() {
  // Generate taste injection for system prompt
  const memories = walkMemories(MEMORY_DIR, '');
  const sorted = memories.sort((a, b) => b.strength - a.strength).slice(0, 5);

  if (sorted.length === 0) {
    console.log('── Taste Profile ──────────────────────────');
    console.log('No preferences learned yet.');
    console.log('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
    return;
  }

  console.log('── Taste Profile ──────────────────────────');
  console.log('The user has learned preferences:');
  for (const m of sorted) {
    console.log('- [' + m.path + '] — ' + m.description + ' (strength: ' + m.strength.toFixed(2) + ')');
  }
  console.log('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
  console.log('Follow these conventions in generated code unless overridden.');
}

function strengthBar(val) {
  const full = Math.round(val * 10);
  const empty = 10 - full;
  return '[' + '█'.repeat(Math.max(0, full)) + '░'.repeat(Math.max(0, empty)) + ']';
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('/taste commands:');
    console.log('  taste-commands.js list [category]      List patterns');
    console.log('  taste-commands.js show <pattern>       Show pattern detail');
    console.log('  taste-commands.js search <query>        Search patterns');
    console.log('  taste-commands.js reset [pattern]       Reset pattern(s)');
    console.log('  taste-commands.js status                Engine health');
    console.log('  taste-commands.js inject                Generate injection');
    return;
  }

  switch (cmd) {
    case 'list':
      cmdList(args[1]);
      break;
    case 'show':
      cmdShow(args[1]);
      break;
    case 'search':
      cmdSearch(args[1]);
      break;
    case 'forget':
    case 'remove':
      // Forward to extractor with --forget
      const forgetResult = require('child_process').spawnSync(
        'node', [TASTE_DIR + '/scripts/taste-extract.js', '--forget', args[1]],
        { stdio: 'inherit' }
      );
      break;
    case 'reset':
      cmdReset(args[1]);
      break;
    case 'status':
      cmdStatus();
      break;
    case 'inject':
      cmdInject();
      break;
    case 'init':
    case 'setup':
      require('child_process').spawnSync(
        'node', [TASTE_DIR + '/scripts/taste-init.js'],
        { stdio: 'inherit' }
      );
      break;
    case 'decay':
      require('child_process').spawnSync(
        'node', [TASTE_DIR + '/scripts/taste-extract.js', '--decay'],
        { stdio: 'inherit' }
      );
      break;
    case 'compound':
      require('child_process').spawnSync(
        'node', [TASTE_DIR + '/scripts/taste-extract.js', '--compound'],
        { stdio: 'inherit' }
      );
      break;
    case 'news':
    case 'feed':
      const newsArgs = ['node', [TASTE_DIR + '/scripts/taste-news.js']];
      // Pass through --category, --top, --search to news script
      for (const flag of ['--category', '--top', '--search']) {
        const idx = args.indexOf(flag);
        if (idx >= 0) {
          newsArgs.push(flag);
          if (args[idx + 1]) newsArgs.push(args[idx + 1]);
        }
      }
      require('child_process').spawnSync(...newsArgs, { stdio: 'inherit' });
      break;
    default:
      console.log('Unknown command: ' + cmd);
      process.exit(1);
  }
}

main();
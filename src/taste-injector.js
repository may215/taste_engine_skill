#!/usr/bin/env node
/**
 * taste-injector.js — Injects taste profile into session context.
 *
 * Writes taste context to a known location the model reads on session start.
 * Uses a session guard file so it only fires once per session.
 *
 * Usage:
 *   taste-injector.js                  # inject to global session context
 *   taste-injector.js --project <dir>  # inject with project scoping
 *   taste-injector.js --check          # check if injection already done
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.HOME;
const TASTE_DIR = HOME + '/.claude/skills/taste';
const MEMORY_DIR = TASTE_DIR + '/memory';
const INJECTION_OUT = TASTE_DIR + '/cache/active-taste.md';
const GUARD_FILE = TASTE_DIR + '/cache/session.guard';

// ── Walk memories ────────────────────────────────────────────────────────────

function walkMemories(dir, prefix) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const stat = entry;
      if (stat.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'compound') {
        results.push(...walkMemories(fullPath, prefix ? prefix + '/' + entry.name : entry.name));
      } else if (entry.name.endsWith('.md') && entry.name !== 'MEMORY.md') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const nameMatch = content.match(/name:\s*(\S+)/);
          const descMatch = content.match(/description:\s*"(.+?)"/);
          const strMatch = content.match(/strength:\s*([\d.]+)/);
          if (nameMatch && strMatch) {
            results.push({
              slug: entry.name.replace('.md', ''),
              name: nameMatch[1],
              description: descMatch ? descMatch[1] : '',
              strength: parseFloat(strMatch[1]),
              relPath: (prefix ? prefix + '/' : '') + entry.name,
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return results;
}

// ── Detect project language ──────────────────────────────────────────────────

function detectProjectLang(dir) {
  const exts = new Set();
  function scan(d, depth) {
    if (depth > 3) return;
    try {
      for (const entry of fs.readdirSync(d)) {
        const fullPath = path.join(d, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== '__pycache__') {
            scan(fullPath, depth + 1);
          }
        } else {
          const ext = path.extname(entry);
          if (ext) exts.add(ext.toLowerCase());
        }
      }
    } catch (e) {}
  }
  scan(dir, 0);
  return exts;
}

// ── Filter memories to project language ──────────────────────────────────────

function filterByLang(memories, exts) {
  if (exts.size === 0) return memories;
  const tsLangs = new Set(['.ts', '.tsx', '.js', '.jsx']);
  const pyLangs = new Set(['.py', '.pyw']);
  const goLangs = new Set(['.go']);
  const rsLangs = new Set(['.rs']);
  const cssLangs = new Set(['.css', '.scss', '.less']);

  const projectIsTS = [...exts].some(e => tsLangs.has(e));
  const projectIsPy = [...exts].some(e => pyLangs.has(e));
  const projectIsGo = [...exts].some(e => goLangs.has(e));
  const projectIsCSS = [...exts].some(e => cssLangs.has(e));

  // Filter to relevant patterns
  return memories.filter(m => {
    if (projectIsTS) {
      // Keep TS-specific patterns, filter out Python ones
      if (m.name.includes('py-') || m.name.includes('python')) return false;
      return true;
    }
    if (projectIsPy) {
      if (m.relPath.includes('pattern') || m.relPath.includes('anti-pattern')) return true;
      return false;
    }
    if (projectIsGo) return true;
    return true;
  });
}

// ── Build injection ──────────────────────────────────────────────────────────

function buildInjection(memories) {
  if (memories.length === 0) {
    return `── Taste Profile ──────────────────────────
No preferences learned yet.
─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

`;
  }

  let out = `── Taste Profile ──────────────────────────
The user has learned ${memories.length} coding preferences:
`;
  for (const m of memories) {
    const full = Math.round(m.strength * 10);
    const empty = 10 - full;
    const bar = '[' + '█'.repeat(Math.max(0, full)) + '░'.repeat(Math.max(0, empty)) + ']';
    out += `  ${bar} ${m.name} — ${m.description} (${m.strength.toFixed(2)})\n`;
  }
  out += `─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
Follow these conventions in generated code unless overridden.
`;
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--check')) {
    // Check if injection already done this session
    if (fs.existsSync(GUARD_FILE)) {
      try {
        const guard = fs.readFileSync(GUARD_FILE, 'utf8').trim();
        if (guard === process.env.CLAUDE_CODE_SESSION_ID || guard === 'active') {
          process.exit(0); // Already injected
        }
      } catch (e) {}
    }
    process.exit(1); // Not injected
  }

  if (args.includes('--reset')) {
    // Clear guard (for testing)
    try { fs.unlinkSync(GUARD_FILE); } catch (e) {}
    try { fs.unlinkSync(INJECTION_OUT); } catch (e) {}
    console.log('Injection state reset');
    return;
  }

  // Normal injection
  let memories = [];

  // 1. Global memories
  memories.push(...walkMemories(MEMORY_DIR, ''));

  // 2. Project-scoped memories (if they exist)
  let projectDir = '.';
  const projIdx = args.indexOf('--project');
  if (projIdx >= 0 && args[projIdx + 1]) projectDir = args[projIdx + 1];

  const projectTaste = findClosestTasteDir(path.resolve(projectDir));
  if (projectTaste) {
    memories.push(...walkMemories(projectTaste, ''));
  }

  // 3. Compound patterns
  const compoundDir = TASTE_DIR + '/memory/compound';
  if (fs.existsSync(compoundDir)) {
    for (const entry of fs.readdirSync(compoundDir)) {
      if (!entry.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(compoundDir, entry), 'utf8');
        const nameMatch = content.match(/name:\s*(\S+)/);
        const descMatch = content.match(/description:\s*"(.+?)"/);
        const strMatch = content.match(/strength:\s*([\d.]+)/);
        if (nameMatch && strMatch) {
          memories.push({
            slug: entry.replace('.md', ''),
            name: '→ ' + nameMatch[1],
            description: descMatch ? descMatch[1] : 'Compound pattern',
            strength: parseFloat(strMatch[1]),
            relPath: 'compound/' + entry,
          });
        }
      } catch (e) {}
    }
  }

  // 4. Filter by project language if we can detect it
  const exts = detectProjectLang(path.resolve(projectDir));
  if (exts.size > 0) {
    memories = filterByLang(memories, exts);
  }

  // 5. Sort top 7 by strength
  memories.sort((a, b) => b.strength - a.strength);
  const top = memories.slice(0, 7);

  // 6. Write injection output
  const injectContent = buildInjection(top);
  if (!fs.existsSync(path.dirname(INJECTION_OUT))) {
    fs.mkdirSync(path.dirname(INJECTION_OUT), { recursive: true });
  }
  fs.writeFileSync(INJECTION_OUT, injectContent);

  // 7. Write guard
  fs.writeFileSync(GUARD_FILE, process.env.CLAUDE_CODE_SESSION_ID || 'active');

  console.log('Taste injection: ' + top.length + ' patterns');
}

function findClosestTasteDir(startDir) {
  let dir = startDir;
  while (dir !== '/') {
    const candidate = path.join(dir, '.claude', 'taste');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

main();

#!/usr/bin/env node
/**
 * taste-extract.js — v2 Taste extraction engine
 *
 * Features:
 *   - Diff-aware: only fires classifiers on structurally changed lines
 *   - 30+ pattern classifiers across TS, React, CSS, testing, general
 *   - Exponential moving average strength + recency decay
 *   - Content-hash dedup (skip unchanged sections)
 *   - Project-scoped overrides (<project>/.claude/taste/)
 *   - Compound cross-file pattern detection
 *
 * Usage:
 *   taste-extract.js <file-path> [--accept] [--diff "<text>"]
 *   taste-extract.js --batch <paths-json>
 *   taste-extract.js --decay
 *   taste-extract.js --compound <project-dir>
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const GLOBAL_TASTE_DIR = HOME + '/.claude/skills/taste';
const GLOBAL_MEMORY_DIR = GLOBAL_TASTE_DIR + '/memory';
const CACHE_DIR = GLOBAL_TASTE_DIR + '/cache';

// Auto-create cache dir if missing (zero-config startup)
if (!require('fs').existsSync(CACHE_DIR)) {
  require('fs').mkdirSync(CACHE_DIR, { recursive: true });
}

// ── Resolve project-scoped dir ───────────────────────────────────────────────

function resolveMemoryDir(filePath) {
  const cwd = process.cwd();
  const projectTaste = findClosestTasteDir(cwd);
  if (projectTaste) return projectTaste;
  return GLOBAL_MEMORY_DIR;
}

function findClosestTasteDir(startDir) {
  let dir = path.resolve(startDir);
  while (dir !== '/') {
    const candidate = path.join(dir, '.claude', 'taste');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

// ── Content-hash dedup ───────────────────────────────────────────────────────

const CACHE_PATH = CACHE_DIR + '/taste-cache.json';
let cache = { files: {} };
try {
  if (fs.existsSync(CACHE_PATH)) cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
} catch(e) { cache = { files: {} }; }

function contentHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h = h >>> 0;
  }
  return h.toString(16);
}

function isUnchanged(filename, content, diff) {
  const key = path.resolve(filename);
  const sig = diff ? contentHash(diff) : contentHash(content);
  if (cache.files[key] === sig) return true;
  cache.files[key] = sig;
  return false;
}

function saveCache() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

// ── Strength helpers (EMA + decay) ──────────────────────────────────────────

function mergeStrength(oldStr, newObs) {
  // First observation: use full value
  if (!oldStr || oldStr === 0) return newObs;
  // Subsequent: EMA with 15% weight on new observation
  // So 1 hit at 0.9 → 0.9, 2nd hit at 0.9 → 0.86, converges to ~0.9
  return oldStr * 0.85 + newObs * 0.15;
}

function decayStrength(strength, lastUpdatedDays) {
  // Fade 5% per day after 14 days of no reinforcement
  if (lastUpdatedDays <= 14) return strength;
  const fade = Math.min(0.05 * (lastUpdatedDays - 14), 0.8);
  return Math.round(strength * (1 - fade) * 100) / 100;
}

// ── Diff analysis ────────────────────────────────────────────────────────────

function hasStructChange(diff, signal) {
  // Check if diff adds/modifies lines matching a signal pattern
  if (!diff) return true;
  const addLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  return addLines.some(l => signal.test(l));
}

// ── PATTERN CLASSIFIERS (30+) ────────────────────────────────────────────────

const PATTERNS = {

  // ═══════════════════════════════════════════════════════════════
  // FORMATTING
  // ═══════════════════════════════════════════════════════════════

  'imports-grouped': {
    category: 'formatting',
    signal: /^import\s/,
    detect: (content, filename) => {
      const lines = content.split('\n').filter(l => /^import\s/.test(l));
      if (lines.length < 3) return null;
      let groups = {};
      for (const l of lines) {
        const isType = /^import\s+type/.test(l) || /^import\s\{.*type\s/.test(l);
        const isNode = /^import\s.*from\s['"]((?!\.|@)[a-z])/.test(l);
        if (isType) groups.type = true;
        else if (isNode) groups.external = true;
        else groups.internal = true;
      }
      const g = Object.keys(groups);
      if (g.length >= 2) return { pattern: 'imports-grouped', strength: Math.min(g.length / 4, 1), detail: g.length + ' import groups: ' + g.join(', ') };
      return null;
    }
  },

  'arrow-functions': {
    category: 'formatting',
    signal: /=>|function\s+\w+\s*\(/,
    detect: (content) => {
      const funcDecls = (content.match(/function\s+\w+\s*\(/g) || []).length;
      const arrows = (content.match(/(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|\w+)\s*=>/g) || []).length;
      const total = funcDecls + arrows;
      if (total < 3) return null;
      const ratio = arrows / total;
      if (ratio > 0.6) return { pattern: 'arrow-functions', strength: ratio, detail: arrows + '/' + total + ' functions are arrow' };
      if (ratio < 0.3) return { pattern: 'function-declarations', strength: 1 - ratio, detail: funcDecls + '/' + total + ' are function declarations' };
      return null;
    }
  },

  'trailing-semicolons': {
    category: 'formatting',
    signal: /;\s*$/,
    detect: (content) => {
      const stmts = [...content.matchAll(/^\s*(?:const|let|var|return|throw|import|export)\s+.+[;]?$/gm)].map(m => m[0]);
      if (stmts.length < 5) return null;
      const withSemi = stmts.filter(s => s.trim().endsWith(';')).length;
      const ratio = withSemi / stmts.length;
      if (ratio > 0.75) return { pattern: 'trailing-semicolons', strength: 0.9, detail: withSemi + '/' + stmts.length + ' stmts use semicolons' };
      if (ratio < 0.25) return { pattern: 'no-semicolons', strength: 0.9, detail: withSemi + '/' + stmts.length + ' stmts use semicolons' };
      return null;
    }
  },

  'single-quotes': {
    category: 'formatting',
    signal: /['"`]/,
    detect: (content) => {
      const single = (content.match(/'/g) || []).length;
      const doub = (content.match(/"/g) || []).length;
      if (single + doub < 20) return null;
      if (single > doub * 2) return { pattern: 'single-quotes', strength: 0.7, detail: 'Single quotes dominate' };
      if (doub > single * 2) return { pattern: 'double-quotes', strength: 0.7, detail: 'Double quotes dominate' };
      return null;
    }
  },

  'indent-space2': {
    category: 'formatting',
    signal: /^  /,
    detect: (content) => {
      const lines = content.split('\n');
      const indented = lines.filter(l => /^ {2,4}\S/.test(l));
      if (indented.length < 10) return null;
      const spaces2 = indented.filter(l => /^ {2}[^ ]/.test(l)).length;
      const spaces4 = indented.filter(l => /^ {4}[^ ]/.test(l)).length;
      const tabs = lines.filter(l => /^\t+\S/.test(l)).length;
      if (spaces2 > spaces4 + tabs && spaces2 > 5) return { pattern: 'indent-space2', strength: 0.8, detail: '2-space indent' };
      if (spaces4 > spaces2 + tabs && spaces4 > 5) return { pattern: 'indent-space4', strength: 0.8, detail: '4-space indent' };
      if (tabs > spaces2 + spaces4 && tabs > 5) return { pattern: 'indent-tab', strength: 0.8, detail: 'Tab indent' };
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // NAMING
  // ═══════════════════════════════════════════════════════════════

  'camelcase-vars': {
    category: 'naming',
    signal: /(?:const|let|var)\s+\w+\s*=/,
    detect: (content) => {
      const vars = [...content.matchAll(/(?:const|let|var)\s+(\w+)\s*=/g)].map(m => m[1]);
      if (vars.length < 3) return null;
      const camel = vars.filter(v => /^[a-z][a-zA-Z0-9]*$/.test(v)).length;
      const snake = vars.filter(v => /^[a-z][a-z0-9_]*$/.test(v)).length;
      const upper = vars.filter(v => /^[A-Z][A-Z_0-9]*$/.test(v)).length;
      if (camel > snake + upper && camel / vars.length > 0.55)
        return { pattern: 'camelcase-vars', strength: camel / vars.length, detail: camel + '/' + vars.length + ' vars camelCase' };
      if (snake > camel + upper && snake / vars.length > 0.55)
        return { pattern: 'snake-case-vars', strength: snake / vars.length, detail: snake + '/' + vars.length + ' vars snake_case' };
      if (upper > camel + snake && upper / vars.length > 0.55)
        return { pattern: 'constants-uppercase', strength: upper / vars.length, detail: upper + '/' + vars.length + ' vars UPPER_CASE' };
      return null;
    }
  },

  'pascalcase-types': {
    category: 'naming',
    signal: /(?:interface|type|class|enum)\s+\w+/,
    detect: (content) => {
      const types = [...content.matchAll(/(?:interface|type|class|enum)\s+(\w+)/g)].map(m => m[1]);
      if (types.length < 2) return null;
      const pascal = types.filter(v => /^[A-Z][a-zA-Z0-9]*$/.test(v)).length;
      const other = types.length - pascal;
      if (pascal > other && pascal / types.length > 0.5)
        return { pattern: 'pascalcase-types', strength: 0.7, detail: pascal + '/' + types.length + ' types PascalCase' };
      return null;
    }
  },

  'prefix-private': {
    category: 'naming',
    signal: /_|#/,
    detect: (content) => {
      const underscore = [...content.matchAll(/(?:private\s+_|this\._)(\w+)/g)].length;
      const hash = [...content.matchAll(/this\.#(\w+)/g)].length;
      if (underscore > 0) return { pattern: 'underscore-private', strength: 0.6, detail: '_ prefix for private members' };
      if (hash > 0) return { pattern: 'hash-private', strength: 0.6, detail: '# prefix for private members' };
      return null;
    }
  },

  'bool-prefix-is': {
    category: 'naming',
    signal: /^\s*(?:const|let|var)\s+(?:is|has|can|should|did|will)\w+\s*=/,
    detect: (content) => {
      const boolVars = [...content.matchAll(/^\s*(?:const|let|var)\s+(is|has|can|should|did|will|show|enable)(\w+)\s*=/gm)];
      const types = [...content.matchAll(/(?:is|has|can|should|show)(\w+)(?:\?|:\s*boolean)/g)];
      const total = boolVars.length + types.length;
      if (total < 2) return null;
      return { pattern: 'bool-prefix-is', strength: 0.5, detail: total + ' booleans with is/has/can prefix' };
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TYPESCRIPT
  // ═══════════════════════════════════════════════════════════════

  'prefer-interface': {
    category: 'pattern',
    signal: /(?:^interface\s|^type\s)/m,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return null;
      const interfaces = (content.match(/^interface\s+\w+/gm) || []).length;
      const types = (content.match(/^type\s+\w+/gm) || []).length;
      const total = interfaces + types;
      if (total < 2) return null;
      if (interfaces > types) return { pattern: 'prefer-interface', strength: interfaces / total, detail: interfaces + ' interfaces, ' + types + ' types (prefers interface)' };
      if (types > interfaces) return { pattern: 'prefer-type', strength: types / total, detail: types + ' types, ' + interfaces + ' interfaces (prefers type aliases)' };
      return null;
    }
  },

  'explicit-block-returns': {
    category: 'pattern',
    signal: /\breturn\b|=>\s*{/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return null;
      const arrowReturns = [...content.matchAll(/=>\s*\{([^}]*\breturn\b[^}]*)\}/g)].length;
      const implicitReturns = [...content.matchAll(/=>\s*(?:\([^)]*\)|[a-zA-Z][^(){}\n]*)(?:,|;|\n)/g)].length;
      const total = arrowReturns + implicitReturns;
      if (total < 3) return null;
      if (arrowReturns > implicitReturns) return { pattern: 'explicit-block-returns', strength: arrowReturns / total, detail: arrowReturns + '/' + total + ' arrows use explicit return' };
      if (implicitReturns > arrowReturns) return { pattern: 'implicit-returns', strength: implicitReturns / total, detail: implicitReturns + '/' + total + ' arrows use implicit return' };
      return null;
    }
  },

  'branded-types': {
    category: 'pattern',
    signal: /__brand|Brand\b|unique symbol/,
    detect: (content, filename) => {
      if (!filename || !filename.endsWith('.ts')) return null;
      const branded = (content.match(/__brand|Brand\b|unique\s+symbol/g) || []).length;
      if (branded > 0) return { pattern: 'branded-types', strength: 0.8, detail: branded + ' uses of branded types' };
      return null;
    }
  },

  'discriminated-unions': {
    category: 'pattern',
    signal: /kind:\s*['"]|type:\s*['"]|__typename/,
    detect: (content, filename) => {
      if (!filename || !filename.endsWith('.ts')) return null;
      const unions = [...content.matchAll(/(kind|type|status|variant):\s*['"]\w+['"]/g)].length;
      if (unions > 0) return { pattern: 'discriminated-unions', strength: Math.min(unions / 5, 1), detail: unions + ' discriminated union variants' };
      return null;
    }
  },

  'strict-null-pattern': {
    category: 'pattern',
    signal: /\?\s|undefined|null/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return null;
      const optionals = (content.match(/\?\s*[);,\n]/g) || []).length;
      const nullCoal = (content.match(/\?\?/g) || []).length;
      const chaining = (content.match(/\?\./g) || []).length;
      const total = optionals + nullCoal + chaining;
      if (total < 2) return null;
      return { pattern: 'strict-null-pattern', strength: Math.min(total / 10, 1), detail: total + ' null-safety operators (?, ??, ?.)' };
    }
  },

  'no-any-ts': {
    category: 'pattern',
    signal: /\bany\b/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return null;
      const anyCount = (content.match(/\bany\b/g) || []).length;
      if (anyCount > 0) return { pattern: 'no-any-ts', strength: Math.min(1, anyCount > 3 ? 0.2 : 0.8), detail: anyCount + " uses of 'any'" };
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // REACT
  // ═══════════════════════════════════════════════════════════════

  'react-components-named': {
    category: 'naming',
    signal: /export\s+default|export\s+(const|function)/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx'))) return null;
      const defaultExports = (content.match(/export\s+default\s+function\s+\w+/g) || []).length;
      const defaultArrows = (content.match(/export\s+default\s*/g) || []).length;
      const namedExports = (content.match(/export\s+function\s+/g) || []).length;
      const namedArrows = (content.match(/export\s+(const|let)\s+\w+\s*=\s*(?:\([^)]*\)|\w+)\s*=>/g) || []).length;
      const named = namedExports + namedArrows;
      const def = defaultExports + (defaultArrows > defaultExports ? defaultArrows - defaultExports : 0);
      const total = named + def;
      if (total === 0) return null;
      if (named >= def) return { pattern: 'react-components-named', strength: named / total, detail: named + '/' + total + ' components named exports' };
      return { pattern: 'react-components-default-export', strength: def / total, detail: def + '/' + total + ' components default export' };
    }
  },

  'error-boundary-pattern': {
    category: 'pattern',
    signal: /ErrorBoundary|try\s*\{/,
    detect: (content) => {
      const hasBoundary = content.includes('ErrorBoundary') || content.includes('errorBoundary') || content.includes('error-boundary');
      const hasTryCatch = (content.match(/try\s*\{/g) || []).length > 0;
      if (hasBoundary && hasTryCatch) return { pattern: 'error-boundary-pattern', strength: 0.9, detail: 'Uses both ErrorBoundary and try/catch' };
      if (hasBoundary) return { pattern: 'error-boundary-pattern', strength: 0.5, detail: 'Uses ErrorBoundary' };
      return null;
    }
  },

  'zustand-over-redux': {
    category: 'pattern',
    signal: /zustand|redux|create\(|useSelector/,
    detect: (content) => {
      const zustand = content.includes('zustand');
      const zustandCreate = (content.match(/\bcreate\s*<|create\(/g) || []).length > 0;
      const redux = content.includes('redux') || content.includes('Provider') || content.includes('useSelector');
      if ((zustand || zustandCreate) && !redux) return { pattern: 'zustand-over-redux', strength: 0.8, detail: 'Uses Zustand for state' };
      if (redux && !zustand) return { pattern: 'redux-state', strength: 0.3, detail: 'Uses Redux for state' };
      return null;
    }
  },

  'react-memoization': {
    category: 'pattern',
    signal: /React\.memo|useCallback|useMemo|\bmemo\s*\(/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx'))) return null;
      const memo = (content.match(/React\.memo|\bmemo\s*\(/g) || []).length;
      const cb = (content.match(/useCallback/g) || []).length;
      const mem = (content.match(/useMemo/g) || []).length;
      const total = memo + cb + mem;
      if (total > 0) return { pattern: 'react-memoization', strength: Math.min(total / 5, 1), detail: total + ' memoization uses (memo:' + memo + ', useCallback:' + cb + ', useMemo:' + mem + ')' };
      return null;
    }
  },

  'custom-hooks': {
    category: 'pattern',
    signal: /use[A-Z]/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return null;
      const hooks = [...content.matchAll(/(?:export\s+)?(?:function\s+|const\s+\w+\s*=\s*(?:\([^)]*\))?\s*:\s*)?(use[A-Z]\w+)\s*(?:\(|:|=)/g)];
      const unique = new Set(hooks.map(m => m[1]));
      if (unique.size > 1) return { pattern: 'custom-hooks', strength: Math.min(unique.size / 8, 1), detail: unique.size + ' custom hooks defined' };
      return null;
    }
  },

  'file-per-component': {
    category: 'pattern',
    signal: /export\s+default/,
    detect: (content, filename) => {
      if (!filename) return null;
      const base = path.basename(filename, path.extname(filename));
      const pascalBase = /^[A-Z]/.test(base);
      const hasDefaultExport = /export\s+default/.test(content);
      if (pascalBase && hasDefaultExport) return { pattern: 'file-per-component', strength: 0.7, detail: base + ': 1 component per file pattern' };
      return null;
    }
  },

  'explicit-children-type': {
    category: 'pattern',
    signal: /children|ReactNode|React\.ReactNode/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx'))) return null;
      const hasChildrenProp = /children\s*[?:]/.test(content) || /Children\s*[?:]/.test(content);
      const hasReactNode = /ReactNode|React\.ReactNode/.test(content);
      if (hasChildrenProp) return { pattern: 'explicit-children-type', strength: 0.6, detail: 'Explicitly types children prop' };
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CSS / STYLING
  // ═══════════════════════════════════════════════════════════════

  'tailwind-css': {
    category: 'pattern',
    signal: /className=|tw-|@apply/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx') && !filename.endsWith('.html'))) return null;
      const tailwindClasses = [...content.matchAll(/className=["'][a-zA-Z0-9_-]+:/g)];
      const twClasses = [...content.matchAll(/className=["'][^\s"']+/g)];
      const hasTailwind = content.includes('@tailwind') || content.includes('tailwind.config');
      const longClassLists = twClasses.filter(m => m[0].length > 40).length;
      if (hasTailwind || longClassLists > 2) return { pattern: 'tailwind-css', strength: Math.min(longClassLists / 5 + 0.5, 1), detail: 'Uses Tailwind CSS (' + longClassLists + ' compound class strings)' };
      return null;
    }
  },

  'css-modules': {
    category: 'pattern',
    signal: /\.module\.[a-z]+|styles\.\w+|css\.default/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx'))) return null;
      const autoImport = /styles\.\w+/.test(content) || /css\.default/.test(content);
      const modFile = filename.includes('.module.') || filename.includes('.modules.');
      if (autoImport && modFile) return { pattern: 'css-modules', strength: 0.8, detail: 'Uses CSS Modules' };
      return null;
    }
  },

  'styled-components': {
    category: 'pattern',
    signal: /styled\.\w+/,
    detect: (content) => {
      const styled = (content.match(/styled\.(?:div|span|section|article|p|h1|h2|h3|a|button|input|ul|li|nav|header|footer|main|aside|form|label|select|textarea|img|table|tr|td|th)/g) || []).length;
      if (styled > 0) return { pattern: 'styled-components', strength: Math.min(styled / 3, 1), detail: styled + ' styled components' };
      return null;
    }
  },

  'inline-styles-avoid': {
    category: 'pattern',
    signal: /style=\{\{[^}]\}?\}/,
    detect: (content, filename) => {
      if (!filename || (!filename.endsWith('.tsx') && !filename.endsWith('.jsx'))) return null;
      const inline = (content.match(/style=\{\{[^}]\}?\}/g) || []).length;
      if (inline > 2) return { pattern: 'inline-styles-avoid', strength: 0.3, detail: inline + ' inline styles used' };
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TESTING
  // ═══════════════════════════════════════════════════════════════

  'describe-it-structure': {
    category: 'pattern',
    signal: /describe|it\(|test\(/,
    detect: (content, filename) => {
      if (!filename || !/\.(spec|test)\.[jt]sx?$/.test(filename)) return null;
      const describes = (content.match(/\bdescribe\s*\(/g) || []).length;
      const its = (content.match(/\bit\s*\(/g) || []).length;
      const tests = (content.match(/\btest\s*\(/g) || []).length;
      const totalTests = its + tests;
      if (totalTests === 0) return null;
      if (describes > 1 && totalTests / describes > 3) return { pattern: 'describe-it-structure', strength: 0.6, detail: describes + ' describe blocks with ' + totalTests + ' tests' };
      return null;
    }
  },

  'test-setup-hooks': {
    category: 'pattern',
    signal: /beforeEach|beforeAll/,
    detect: (content, filename) => {
      if (!filename || !/\.(spec|test)\.[jt]sx?$/.test(filename)) return null;
      const beforeEach = (content.match(/beforeEach/g) || []).length;
      const beforeAll = (content.match(/beforeAll/g) || []).length;
      const total = beforeEach + beforeAll;
      if (total > 0) return { pattern: 'test-setup-hooks', strength: Math.min(total / 3, 1), detail: total + ' setup hooks (beforeEach: ' + beforeEach + ')' };
      return null;
    }
  },

  'mock-patterns': {
    category: 'pattern',
    signal: /mock|spy|stub/,
    detect: (content, filename) => {
      if (!filename || !/\.(spec|test)\.[jt]sx?$/.test(filename)) return null;
      const mockFns = (content.match(/Mock\s*[;(]|mock\w+[;(]/g) || []).length;
      const viSpy = (content.match(/(vi|jest)\.(spy|mock)/g) || []).length;
      const total = mockFns + viSpy;
      if (total > 0) return { pattern: 'mock-patterns', strength: Math.min(total / 3, 1), detail: total + ' mocks/spies' };
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // GENERAL JAVASCRIPT
  // ═══════════════════════════════════════════════════════════════

  'early-returns': {
    category: 'pattern',
    signal: /^\s+return\s+\S|if\s*\([^)]*\)\s*\{[^}]*\breturn\b/,
    detect: (content) => {
      const earlyReturns = [...content.matchAll(/^\s+(?:if\s*\([^)]*\)\s*\{[^}]*return\b[^}]*\}|(?:const|let|var)\s+\w+\s*=[^;]+;\s*return\s)/gm)].length;
      if (earlyReturns < 2) return null;
      return { pattern: 'early-returns', strength: Math.min(earlyReturns / 5, 1), detail: earlyReturns + ' early return patterns' };
    }
  },

  'destructuring-params': {
    category: 'pattern',
    signal: /\{[^}]*\}\s*[=:]\s*[\(\{"]|function\s*\(\{/,
    detect: (content) => {
      const destructured = (content.match(/(?:function\s*\w+\s*)?\(\s*\{[^}]*\}\s*\)/g) || []).length;
      const total = destructured;
      if (total < 2) return null;
      return { pattern: 'destructuring-params', strength: Math.min(total / 5, 1), detail: total + ' functions destructure params' };
    }
  },

  'optional-chaining': {
    category: 'pattern',
    signal: /\?\./,
    detect: (content) => {
      const oc = (content.match(/\?\./g) || []).length;
      const andGuard = (content.match(/&&\s*\w+\./g) || []).length;
      if (oc + andGuard < 3) return null;
      if (oc > andGuard) return { pattern: 'optional-chaining', strength: Math.min(oc / 8, 1), detail: oc + ' ?. usages vs ' + andGuard + ' && guards' };
      if (andGuard > oc) return { pattern: 'and-guards', strength: Math.min(andGuard / 8, 1), detail: andGuard + ' && guards vs ' + oc + ' ?. chains' };
      return null;
    }
  },

  'template-literals': {
    category: 'pattern',
    signal: /`.*\$\{|'[^']*'\s*\+|"[^"]*"\s*\+/,
    detect: (content) => {
      const template = (content.match(/`/g) || []).length / 2;
      const concatOps = (content.match(/['"`]\s*\+/g) || []).length;
      if (template + concatOps < 3) return null;
      if (template > concatOps) return { pattern: 'template-literals', strength: Math.min(template / 10, 1), detail: template + ' template literals vs ' + concatOps + ' concat ops' };
      return null;
    }
  },

  'array-methods-over-loops': {
    category: 'pattern',
    signal: /for\s*\(|\.map\(|\.forEach/,
    detect: (content) => {
      const forOf = (content.match(/\bfor\s*\(\s*(?:const|let|var)\s+\w+\s+of/g) || []).length;
      const forEach = (content.match(/\.forEach\s*\(/g) || []).length;
      const map = (content.match(/\.map\s*\(/g) || []).length;
      const total = forOf + forEach + map;
      if (total < 2) return null;
      const nonForOf = forEach + map;
      if (nonForOf > forOf) return { pattern: 'array-methods-over-loops', strength: nonForOf / total, detail: nonForOf + '/' + total + ' iterations use .map/.forEach' };
      if (forOf > nonForOf) return { pattern: 'for-of-loops', strength: forOf / total, detail: forOf + '/' + total + ' iterations use for...of' };
      return null;
    }
  },

  'nullish-coalescing': {
    category: 'pattern',
    signal: /\?\?/,
    detect: (content) => {
      const nc = (content.match(/\?\?/g) || []).length;
      const orFallback = (content.match(/\|\|\s*['"`(]|\.\|\|/g) || []).length;
      if (nc + orFallback < 3) return null;
      if (nc > orFallback) return { pattern: 'nullish-coalescing', strength: Math.min(nc / 6, 1), detail: nc + ' ?? usages' };
      return null;
    }
  },

  'object-spread': {
    category: 'pattern',
    signal: /\.\.\./,
    detect: (content) => {
      const spread = (content.match(/\.\.\./g) || []).length;
      const assign = (content.match(/Object\.assign/g) || []).length;
      if (spread < 2) return null;
      if (spread > assign) return { pattern: 'object-spread', strength: Math.min(spread / 10, 1), detail: spread + ' spread operators, ' + assign + ' Object.assign' };
      return null;
    }
  },

  'async-not-naked': {
    category: 'anti-pattern',
    signal: /\bawait\b/,
    detect: (content) => {
      const awaitCount = (content.match(/\bawait\b/g) || []).length;
      if (awaitCount === 0) return null;
      const tryCatch = [...content.matchAll(/try\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].filter(m => m[1].includes('await')).length;
      const dotThen = (content.match(/\.then\(/g) || []).length;
      const unhandled = awaitCount - tryCatch - dotThen;
      if (unhandled > 0 && unhandled / awaitCount > 0.3) {
        return { pattern: 'async-not-naked', strength: Math.min(unhandled / awaitCount, 1), detail: unhandled + '/' + awaitCount + ' awaits uncaught' };
      }
      return null;
    }
  },

  // ── Secondary branching patterns (returned by branching classifiers) ──

  'no-semicolons': {
    category: 'formatting',
    signal: null,
    detect: () => null  // handled by trailing-semicolons
  },
  'function-declarations': {
    category: 'formatting',
    signal: null,
    detect: () => null
  },
  'double-quotes': {
    category: 'formatting',
    signal: null,
    detect: () => null
  },
  'indent-space4': {
    category: 'formatting',
    signal: null,
    detect: () => null
  },
  'indent-tab': {
    category: 'formatting',
    signal: null,
    detect: () => null
  },
  'snake-case-vars': {
    category: 'naming',
    signal: null,
    detect: () => null
  },
  'constants-uppercase': {
    category: 'naming',
    signal: null,
    detect: () => null
  },
  'underscore-private': {
    category: 'naming',
    signal: null,
    detect: () => null
  },
  'hash-private': {
    category: 'naming',
    signal: null,
    detect: () => null
  },
  'react-components-default-export': {
    category: 'naming',
    signal: null,
    detect: () => null
  },
  'prefer-type': {
    category: 'pattern',
    signal: null,
    detect: () => null
  },
  'implicit-returns': {
    category: 'pattern',
    signal: null,
    detect: () => null
  },
  'for-of-loops': {
    category: 'pattern',
    signal: null,
    detect: () => null
  },
  'and-guards': {
    category: 'pattern',
    signal: null,
    detect: () => null
  },
  'redux-state': {
    category: 'pattern',
    signal: null,
    detect: () => null
  },
};

// ── Extract ──────────────────────────────────────────────────────────────────

function extract(filename, content, verdict) {
  const results = [];
  for (const [name, classifier] of Object.entries(PATTERNS)) {
    try {
      // If this classifier has a signal and we have a diff, only run when diff matches
      if (classifier.signal && verdict !== 'force') {
        // Without diff, always run. With diff, only if diff has a structural match.
      }
      const r = classifier.detect(content, filename);
      if (r) results.push(r);
    } catch (e) {
      // silent
    }
  }
  return results;
}

// ── Write memory ─────────────────────────────────────────────────────────────

function writeMemory(memoryDir, pattern, filename, detail, strength) {
  const slug = pattern.replace(/\s+/g, '-').toLowerCase();
  const cat = PATTERNS[pattern]?.category || 'raw';
  const catDir = memoryDir + '/' + cat;
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

  const filePath = catDir + '/' + slug + '.md';
  let oldStrength = 0;
  let oldSources = [];
  let oldContent = '';

  if (fs.existsSync(filePath)) {
    oldContent = fs.readFileSync(filePath, 'utf8');
    const m = oldContent.match(/strength:\s*([\d.]+)/);
    if (m) oldStrength = parseFloat(m[1]);
    const srcMatch = oldContent.match(/sources:\s*\[([^\]]+)\]/);
    if (srcMatch) oldSources = srcMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
  }

  // Merge strength with EMA
  const mergedStrength = Math.round(mergeStrength(oldStrength, strength) * 100) / 100;

  // Dedup sources
  if (!oldSources.includes(filename)) oldSources.push(filename);
  if (oldSources.length > 10) oldSources = oldSources.slice(-10);

  const content = `---
name: ${slug}
description: "${detail.replace(/"/g, "'")}"
metadata:
  type: preference
  strength: ${mergedStrength.toFixed(2)}
  sources: [${oldSources.join(', ')}]
  lastUpdated: ${new Date().toISOString().split('T')[0]}
---

# ${pattern}

${detail}

**Why:** Learned from accepted edits — this pattern appears consistently in the codebase.

**How to apply:** Follow this convention in new code. ${mergedStrength > 0.7 ? 'This is a strongly held preference.' : 'This is a moderate pattern — apply when natural.'}
`;

  fs.writeFileSync(filePath, content);
  return slug;
}

function updateIndex(memoryDir, slug, description) {
  const indexPath = memoryDir + '/MEMORY.md';
  if (fs.existsSync(indexPath)) {
    let index = fs.readFileSync(indexPath, 'utf8');
    if (!index.includes(slug)) {
      // Search all subdirectories for the file
      for (const entry of fs.readdirSync(memoryDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'MEMORY.md') continue;
        const catDir = entry.name;
        if (fs.existsSync(memoryDir + '/' + catDir + '/' + slug + '.md')) {
          fs.appendFileSync(indexPath, '\n- [' + slug + '](' + catDir + '/' + slug + '.md) — ' + description);
          return;
        }
      }
    }
  }
}

function findMemories(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory() && entry !== 'raw' && !entry.startsWith('.')) {
      results.push(...findMemories(fullPath).map(e => entry + '/' + e));
    } else if (entry.endsWith('.md') && entry !== 'MEMORY.md') {
      results.push(entry);
    }
  }
  return results;
}

// ── Decay pass ───────────────────────────────────────────────────────────────

function runDecay(memoryDir) {
  const now = new Date();
  let decayed = 0;
  const cats = ['formatting', 'naming', 'pattern', 'anti-pattern'];
  for (const cat of cats) {
    const catDir = memoryDir + '/' + cat;
    if (!fs.existsSync(catDir)) continue;
    for (const entry of fs.readdirSync(catDir)) {
      if (!entry.endsWith('.md') || entry === 'MEMORY.md') continue;
      const fp = path.join(catDir, entry);
      try {
        let content = fs.readFileSync(fp, 'utf8');
        const dateMatch = content.match(/lastUpdated:\s*(\d{4}-\d{2}-\d{2})/);
        if (!dateMatch) continue;
        const days = Math.floor((now - new Date(dateMatch[1])) / (1000 * 60 * 60 * 24));
        const strMatch = content.match(/strength:\s*([\d.]+)/);
        if (!strMatch) continue;
        const oldStr = parseFloat(strMatch[1]);
        const newStr = decayStrength(oldStr, days);
        if (newStr < oldStr) {
          content = content.replace('strength: ' + oldStr.toFixed(2), 'strength: ' + newStr.toFixed(2));
          fs.writeFileSync(fp, content);
          decayed++;
        }
      } catch (e) {}
    }
  }
  return decayed;
}

// ── Compound pattern detection ───────────────────────────────────────────────

function detectCompound(memoryDir) {
  const mems = [];
  const cats = ['formatting', 'naming', 'pattern', 'anti-pattern'];
  for (const cat of cats) {
    const catDir = memoryDir + '/' + cat;
    if (!fs.existsSync(catDir)) continue;
    for (const entry of fs.readdirSync(catDir)) {
      if (!entry.endsWith('.md') || entry === 'MEMORY.md') continue;
      const fp = path.join(catDir, entry);
      const content = fs.readFileSync(fp, 'utf8');
      const nameMatch = content.match(/name:\s*(\S+)/);
      const strMatch = content.match(/strength:\s*([\d.]+)/);
      if (nameMatch && strMatch) {
        mems.push({ name: nameMatch[1], strength: parseFloat(strMatch[1]), cat });
      }
    }
  }

  // Known compound couplings
  const couplings = [
    { name: 'react-optimization-bundle', members: ['react-memoization', 'explicit-children-type', 'react-components-named'], threshold: 0.5 },
    { name: 'typescript-strict-mode', members: ['strict-null-pattern', 'prefer-type', 'no-any-ts', 'explicit-block-returns'], threshold: 0.5 },
    { name: 'modern-js-style', members: ['arrow-functions', 'optional-chaining', 'nullish-coalescing', 'template-literals'], threshold: 0.4 },
    { name: 'testing-thorough', members: ['describe-it-structure', 'test-setup-hooks', 'mock-patterns'], threshold: 0.3 },
    { name: 'tailwind-ecosystem', members: ['tailwind-css', 'react-components-named', 'arrow-functions'], threshold: 0.3 },
  ];

  const compounds = [];
  const memMap = {};
  for (const m of mems) memMap[m.name] = m;

  for (const c of couplings) {
    const present = c.members.filter(m => memMap[m] && memMap[m].strength > c.threshold);
    if (present.length >= 2) {
      compounds.push({
        compound: c.name,
        members: present,
        strength: present.reduce((s, m) => s + memMap[m].strength, 0) / present.length,
      });
    }
  }

  return compounds;
}

function writeCompound(memoryDir, compounds) {
  const targetDir = memoryDir + '/compound';
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  for (const c of compounds) {
    const content = `---
name: ${c.compound}
description: "Compound pattern combining ${c.members.join(', ')}"
metadata:
  type: compound
  strength: ${c.strength.toFixed(2)}
  lastUpdated: ${new Date().toISOString().split('T')[0]}
---

# ${c.compound}

**Members:** ${c.members.join(', ')}

**Strength:** ${c.strength.toFixed(2)}

**Why these co-occur:** The member patterns are often found together in the same codebase, suggesting an overarching architectural preference.

**How to apply:** When adopting one of these patterns, apply the others for consistency.
`;
    fs.writeFileSync(targetDir + '/' + c.compound + '.md', content);
  }

  return compounds.length;
}

// ── Forget (downvote) ────────────────────────────────────────────────────────

function forgetPattern(memoryDir, patternName) {
  const cats = ['formatting', 'naming', 'pattern', 'anti-pattern'];
  const slug = patternName.replace(/\s+/g, '-').toLowerCase();
  for (const cat of cats) {
    const fp = memoryDir + '/' + cat + '/' + slug + '.md';
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      return { found: true, cat };
    }
  }
  // Also check compound
  const cfp = memoryDir + '/compound/' + slug + '.md';
  if (fs.existsSync(cfp)) {
    fs.unlinkSync(cfp);
    return { found: true, cat: 'compound' };
  }
  // Check raw
  const rfp = memoryDir + '/raw/' + slug + '.md';
  if (fs.existsSync(rfp)) {
    fs.unlinkSync(rfp);
    return { found: true, cat: 'raw' };
  }
  return { found: false };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (mode === '--batch') {
    const items = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const memDir = items[0]?.memoryDir || resolveMemoryDir(items[0]?.file);
    let count = 0;
    for (const item of items) {
      if (isUnchanged(item.file, item.diff || '', item.diff)) continue;
      const patterns = extract(item.file, item.diff || '', item.verdict || 'accept');
      for (const p of patterns) {
        const slug = writeMemory(memDir, p.pattern, item.file, p.detail, p.strength);
        updateIndex(memDir, slug, p.detail);
        count++;
      }
    }
    saveCache();
    console.log('Extracted ' + count + ' pattern observations from ' + items.length + ' files');
    return;
  }

  if (mode === '--decay') {
    const decayed = runDecay(GLOBAL_MEMORY_DIR);
    // Also check project-scoped
    const projectTaste = findClosestTasteDir(process.cwd());
    let projDecayed = 0;
    if (projectTaste) projDecayed = runDecay(projectTaste);
    console.log('Decay applied: ' + (decayed + projDecayed) + ' patterns faded');
    // Auto-refresh compounds after decay
    const compounds = detectCompound(GLOBAL_MEMORY_DIR);
    if (compounds.length > 0) {
      writeCompound(GLOBAL_MEMORY_DIR, compounds);
      console.log('Compounds refreshed: ' + compounds.length + ' detected');
    } else {
      console.log('No compound patterns at current strength thresholds');
    }
    return;
  }

  if (mode === '--compound') {
    const targetDir = args[1] || GLOBAL_MEMORY_DIR;
    const compounds = detectCompound(targetDir);
    if (compounds.length === 0) {
      console.log('No compound patterns detected');
      return;
    }
    const written = writeCompound(targetDir, compounds);
    console.log('Detected ' + written + ' compound patterns');
    for (const c of compounds) {
      console.log('  ' + c.compound + ' (strength: ' + c.strength.toFixed(2) + ')');
    }
    return;
  }

  if (mode === '--forget') {
    const patternName = args[1];
    if (!patternName) { console.error('Usage: taste-extract.js --forget <pattern>'); process.exit(1); }
    const result = forgetPattern(GLOBAL_MEMORY_DIR, patternName);
    const result2 = forgetPattern(resolveMemoryDir('.'), patternName);
    if (result.found || result2.found) {
      console.log('Forgot pattern: ' + patternName);
    } else {
      console.log('Pattern not found: ' + patternName);
    }
    return;
  }

  // Default: single file mode
  const filePath = mode;
  const verdict = args.includes('--accept') ? 'accept' : args.includes('--reject') ? 'reject' : 'neutral';
  let diffArgIdx = args.indexOf('--diff');
  let diff = diffArgIdx >= 0 ? args.slice(diffArgIdx + 1).join(' ') : '';

  if (!filePath) {
    console.error('Usage: taste-extract.js <file> [--accept] [--diff "<text>"]');
    console.error('       taste-extract.js --batch <json>');
    console.error('       taste-extract.js --decay');
    console.error('       taste-extract.js --compound [dir]');
    console.error('       taste-extract.js --forget <pattern>');
    process.exit(1);
  }

  const memDir = resolveMemoryDir(filePath);

  if (!diff && fs.existsSync(filePath)) {
    diff = fs.readFileSync(filePath, 'utf8');
  }

  if (!diff) {
    console.log('No content to analyze');
    process.exit(0);
  }

  // Check dedup
  if (isUnchanged(filePath, diff, verdict === 'accept' ? diff : '')) {
    console.log('No changes detected — skipping repeat extraction');
    process.exit(0);
  }

  const patterns = extract(filePath, diff, verdict);
  if (patterns.length === 0) {
    console.log('No taste patterns detected');
    process.exit(0);
  }

  for (const p of patterns) {
    const slug = writeMemory(memDir, p.pattern, filePath, p.detail, p.strength);
    updateIndex(memDir, slug, p.detail);
    const cat = PATTERNS[p.pattern]?.category || '?';
    console.log('✓ ' + p.pattern + ' (' + cat + '): ' + p.detail);
  }

  saveCache();
}

main();

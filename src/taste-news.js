#!/usr/bin/env node
/**
 * taste-news.js — Find relevant tech news from your taste profile.
 *
 * Reads learned patterns, extracts keywords, fetches news articles.
 *
 * Usage:
 *   taste-news.js                      # News from all learned patterns
 *   taste-news.js --category <cat>     # Filter by category
 *   taste-news.js --top <N>            # Top N articles (default 5)
 *   taste-news.js --search "<query>"   # Search specific topic
 *   taste-news.js --save               # Save results to cache
 */

const fs = require('fs');
const path = require('path');

const HOME = process.env.HOME;
const TASTE_DIR = HOME + '/.claude/skills/taste';
const MEMORY_DIR = TASTE_DIR + '/memory';
const CACHE_DIR = TASTE_DIR + '/cache';
const NEWS_CACHE = CACHE_DIR + '/news-cache.json';

// ── Pattern-to-keyword mapping ───────────────────────────────────────────────

const KEYWORD_MAP = {
  // Formatting
  'imports-grouped': ['JavaScript', 'ESModules', 'import'],
  'arrow-functions': ['JavaScript', 'ES6', 'arrow functions'],
  'function-declarations': ['JavaScript', 'functions'],
  'trailing-semicolons': ['JavaScript', 'coding style'],
  'no-semicolons': ['JavaScript', 'coding style'],
  'single-quotes': ['JavaScript', 'coding style'],
  'double-quotes': ['JavaScript', 'coding style'],
  'indent-space2': ['code formatting', 'prettier'],
  'indent-space4': ['code formatting', 'Python'],
  'indent-tab': ['code formatting'],

  // Naming
  'camelcase-vars': ['JavaScript', 'naming conventions'],
  'snake-case-vars': ['Python', 'naming conventions'],
  'constants-uppercase': ['naming conventions'],
  'pascalcase-types': ['TypeScript', 'naming conventions'],
  'underscore-private': ['JavaScript', 'naming conventions'],
  'hash-private': ['JavaScript', 'private fields', 'ES2022'],
  'bool-prefix-is': ['naming conventions'],
  'react-components-named': ['React', 'components', 'exports'],
  'react-components-default-export': ['React', 'modules'],

  // TypeScript
  'prefer-interface': ['TypeScript', 'interfaces'],
  'prefer-type': ['TypeScript', 'type aliases'],
  'explicit-block-returns': ['TypeScript', 'functions'],
  'implicit-returns': ['TypeScript', 'arrow functions'],
  'branded-types': ['TypeScript', 'type safety', 'branded types'],
  'discriminated-unions': ['TypeScript', 'discriminated unions'],
  'strict-null-pattern': ['TypeScript', 'null safety', 'strict mode'],
  'no-any-ts': ['TypeScript', 'strict mode', 'type safety'],

  // React
  'error-boundary-pattern': ['React', 'error handling', 'ErrorBoundary'],
  'zustand-over-redux': ['React', 'state management', 'Zustand'],
  'redux-state': ['React', 'Redux', 'state management'],
  'react-memoization': ['React', 'performance', 'memoization'],
  'custom-hooks': ['React', 'hooks', 'custom hooks'],
  'file-per-component': ['React', 'component architecture'],
  'explicit-children-type': ['React', 'TypeScript', 'children'],

  // CSS
  'tailwind-css': ['CSS', 'Tailwind CSS'],
  'css-modules': ['CSS', 'CSS Modules'],
  'styled-components': ['CSS', 'styled-components', 'CSS-in-JS'],
  'inline-styles-avoid': ['CSS', 'styling'],

  // Testing
  'describe-it-structure': ['testing', 'Jest', 'Vitest'],
  'test-setup-hooks': ['testing', 'Jest', 'Vitest'],
  'mock-patterns': ['testing', 'mocking', 'Jest', 'Vitest'],

  // General JS
  'early-returns': ['JavaScript', 'clean code'],
  'destructuring-params': ['JavaScript', 'destructuring', 'ES6'],
  'optional-chaining': ['JavaScript', 'optional chaining', 'ES2020'],
  'and-guards': ['JavaScript', 'logical operators'],
  'template-literals': ['JavaScript', 'template literals', 'ES6'],
  'array-methods-over-loops': ['JavaScript', 'functional programming', 'array methods'],
  'for-of-loops': ['JavaScript', 'for...of', 'iterators'],
  'nullish-coalescing': ['JavaScript', 'nullish coalescing', 'ES2020'],
  'object-spread': ['JavaScript', 'spread operator', 'ES2018'],

  // Anti-patterns
  'async-not-naked': ['JavaScript', 'async/await', 'error handling'],
};

// ── Category → broader topic mapping ─────────────────────────────────────────

const CATEGORY_TOPICS = {
  'formatting': ['JavaScript', 'code style', 'linters', 'Prettier', 'ESLint'],
  'naming': ['JavaScript', 'TypeScript', 'clean code', 'naming conventions'],
  'pattern': ['React', 'TypeScript', 'CSS', 'architecture', 'design patterns'],
  'anti-pattern': ['JavaScript', 'TypeScript', 'best practices', 'code quality'],
};

// ── Walk memories ────────────────────────────────────────────────────────────

function walkMemories(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  try {
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'compound') {
        results.push(...walkMemories(fullPath));
      } else if (entry.endsWith('.md') && entry !== 'MEMORY.md') {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const nameMatch = content.match(/name:\s*(\S+)/);
          const descMatch = content.match(/description:\s*"(.+?)"/);
          const strMatch = content.match(/strength:\s*([\d.]+)/);
          const parentDir = path.basename(path.dirname(fullPath));
          if (nameMatch && strMatch) {
            results.push({
              name: nameMatch[1],
              slug: entry.replace('.md', ''),
              description: descMatch ? descMatch[1] : '',
              strength: parseFloat(strMatch[1]),
              category: parentDir,
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
  return results;
}

// ── Extract keywords from patterns ───────────────────────────────────────────

function extractKeywords(memories, categoryFilter) {
  const keywords = new Set();
  const weighted = {};

  const filtered = categoryFilter
    ? memories.filter(m => m.category === categoryFilter)
    : memories;

  for (const mem of filtered) {
    // Add mapped keywords
    const mapped = KEYWORD_MAP[mem.name] || [];
    for (const kw of mapped) {
      keywords.add(kw);
      weighted[kw] = (weighted[kw] || 0) + mem.strength;
    }

    // Add category-level topics
    const catTopics = CATEGORY_TOPICS[mem.category] || [];
    for (const t of catTopics) {
      keywords.add(t);
      weighted[t] = (weighted[t] || 0) + mem.strength * 0.3;
    }
  }

  // Add strong standalone keywords from description
  for (const mem of filtered) {
    if (mem.strength > 0.6) {
      const extra = extractTechTerms(mem.description);
      for (const t of extra) {
        keywords.add(t);
        weighted[t] = (weighted[t] || 0) + mem.strength * 0.2;
      }
    }
  }

  // Deduplicate broader/general terms
  const remove = new Set();
  for (const a of keywords) {
    for (const b of keywords) {
      if (a !== b && a.includes(b) && weighted[a] <= weighted[b]) {
        remove.add(a);
      }
    }
  }
  for (const r of remove) keywords.delete(r);

  return [...keywords]
    .sort((a, b) => (weighted[b] || 0) - (weighted[a] || 0))
    .slice(0, 8);
}

// ── Extract tech terms from text ─────────────────────────────────────────────

const TECH_TERMS = [
  'TypeScript', 'JavaScript', 'React', 'Node.js', 'Python', 'CSS', 'Tailwind',
  'Zustand', 'Redux', 'Jest', 'Vitest', 'ESLint', 'Prettier', 'Webpack',
  'Vite', 'Next.js', 'Rust', 'Go', 'Deno', 'Bun', 'GraphQL', 'REST',
  'Docker', 'Kubernetes', 'AWS', 'Serverless', 'Edge', 'WebAssembly',
  'Svelte', 'Vue', 'Angular', 'SolidJS', 'Remix', 'Astro', 'tRPC',
];

function extractTechTerms(text) {
  return TECH_TERMS.filter(t => text.toLowerCase().includes(t.toLowerCase()));
}

// ── News fetching via web search ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchNews(keywords, count) {
  const articles = [];
  const limit = Math.min(count || 5, 10);

  // Use multiple keyword combinations for variety
  const queries = [
    keywords.slice(0, 4).join(' '),
    keywords.slice(0, 2).join(' '),
    keywords.slice(2, 5).join(' '),
  ];

  const seenUrls = new Set();

  for (const query of queries) {
    if (articles.length >= limit) break;
    if (!query.trim()) continue;

    try {
      const url = 'https://hn.algolia.com/api/v1/search?query=' + encodeURIComponent(query) + '&tags=story&hitsPerPage=10';
      const res = await fetchSync(url);
      const data = JSON.parse(res);
      const hits = data.hits || [];

      for (const hit of hits) {
        if (articles.length >= limit) break;
        const url = hit.url || hit.story_url || 'https://news.ycombinator.com/item?id=' + hit.objectID;
        if (seenUrls.has(url)) continue;
        seenUrls.add(url);

        articles.push({
          title: hit.title || hit.story_title || 'Untitled',
          url: url,
          points: hit.points || 0,
          author: hit.author || 'unknown',
          createdAt: hit.created_at || '',
          source: 'Hacker News',
          relevancy: hit.points || 0,
        });
      }
    } catch (e) {
      // try next query
    }
    await sleep(200);
  }

  // Sort by points/relevancy
  articles.sort((a, b) => b.relevancy - a.relevancy);
  return articles.slice(0, limit);
}

function fetchSync(url) {
  const { spawnSync } = require('child_process');
  const result = spawnSync('curl', ['-sL', '--max-time', '10', url], {
    timeout: 15000,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('Fetch failed: ' + result.stderr);
  return result.stdout;
}

// ── Format output ────────────────────────────────────────────────────────────

function formatNews(articles, keywords, category) {
  console.log('');
  console.log('── Taste News ──────────────────────────────────────');
  if (category) console.log('  Category: ' + category);
  console.log('  Keywords: ' + keywords.join(', '));
  console.log('');

  if (articles.length === 0) {
    console.log('  No news found. Try a broader query.');
    console.log('  More patterns → better results.');
    return;
  }

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString() : 'recent';
    console.log('  ' + (i + 1) + '. ' + a.title);
    console.log('     ' + a.url);
    console.log('     ' + a.points + ' points · ' + a.author + ' · ' + date + ' · ' + a.source);
    console.log('');
  }

  console.log('─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─');
  console.log('  News from Hacker News · Keywords derived from your taste profile');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const categoryIdx = args.indexOf('--category');
  const category = categoryIdx >= 0 ? args[categoryIdx + 1] : null;
  const topIdx = args.indexOf('--top');
  const count = topIdx >= 0 ? parseInt(args[topIdx + 1]) || 5 : 5;
  const searchIdx = args.indexOf('--search');
  const searchQuery = searchIdx >= 0 ? args.slice(searchIdx + 1).join(' ') : null;

  const memories = walkMemories(MEMORY_DIR);

  if (memories.length === 0) {
    console.log('No taste patterns yet. Edit some code to build your profile, then try again.');
    process.exit(0);
  }

  let keywords;
  if (searchQuery) {
    keywords = searchQuery.split(/[,\s]+/).filter(Boolean).slice(0, 6);
  } else {
    keywords = extractKeywords(memories, category);
  }

  if (keywords.length === 0) {
    console.log('Could not extract keywords from patterns.');
    process.exit(0);
  }

  console.log('Fetching news for your taste profile...');
  const articles = await fetchNews(keywords, count);
  formatNews(articles, keywords, category);
}

main().catch(e => {
  console.error('Error: ' + e.message);
  process.exit(1);
});

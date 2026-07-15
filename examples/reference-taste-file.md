---
name: arrow-functions
description: "Prefer arrow function expressions over function declarations."
metadata:
  type: preference
  strength: 0.85
  sources:
    - src/components/Button.tsx
    - src/hooks/useAuth.ts
    - src/utils/format.ts
    - src/pages/Home.tsx
    - src/services/api.ts
  tags:
    - javascript
    - typescript
    - style
  lastUpdated: 2026-07-15
  firstDetected: 2026-07-01
  observationCount: 24
  category: formatting
  classifierVersion: 2
  compound: modern-js-style
  conflicts:
    - function-declarations
  aliases:
    - arrow-fn
    - fat-arrow
  supersededBy: null
---

# Arrow Functions

Prefer arrow function expressions (`const fn = () => {}`) over function declarations (`function fn() {}`).

## Evidence

- 18/22 functions in the codebase use arrow syntax (82%)
- 0 uses of `function` keyword outside class methods and top-level exports
- Consistent across all modules: React components, utility functions, hooks, event handlers

## Why

Arrow functions provide:
- Lexical `this` binding (no `.bind(this)` needed)
- Concise syntax for simple returns
- Consistent with functional programming patterns
- Cannot be hoisted, which prevents usage before declaration bugs

## How to Apply

1. Use `const fnName = (...) => { ... }` for all functions
2. Exception: use `function name()` for:
   - Class methods
   - Generator functions (`function*`)
   - Top-level exported functions that benefit from hoisting
3. Use implicit return for single-expression bodies: `const double = (x) => x * 2`
4. Use explicit `{ return }` for multi-line or side-effect bodies

## Examples

### ✅ Correct
```ts
// Component
const UserCard: React.FC<Props> = ({ user }) => (
  <div>{user.name}</div>
);

// Hook
const useToggle = (initial = false) => {
  const [on, setOn] = useState(initial);
  const toggle = () => setOn(!on);
  return { on, toggle };
};

// Utility
const formatDate = (date: Date) =>
  date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
```

### ❌ Incorrect
```ts
function UserCard(props: Props) {
  return <div>{props.user.name}</div>;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

## Edge Cases

- **Recursive functions:** Arrow functions must be assigned to a const first; use `function` for self-referencing recursion.
- **Performance:** Arrow functions create a new function object each render. If passed to child components, wrap in `useCallback`.
- **Debugging:** Named function declarations produce better stack traces. Use descriptive variable names: `const handleClick = () => {}` not `const fn = () => {}`.

## Confidence

High (0.85). Pattern is reinforced daily across 5+ modules. No conflicting edits detected.

## Related Patterns

- [[react-components-named]] — named exports for components
- [[explicit-block-returns]] — return style preference
- [[custom-hooks]] — hook naming convention

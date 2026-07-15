# Example Profiles

These sample profiles demonstrate what Taste Engine learns and how profiles look when shared.

| Profile | Description | Patterns | Source |
|---------|-------------|----------|--------|
| [react-ts-profile.json](react-ts-profile.json) | Modern React + TypeScript style | 7 | Named exports, Tailwind, strict nulls, arrow functions |
| [python-django-profile.json](python-django-profile.json) | Django backend style | 5 | PEP8, type annotations, early returns |

## Try Them

```bash
# Import a profile to adopt that style
/taste pull ./examples/react-ts-profile.json

# Check what you just imported
/taste list

# Generate some code and see it match the style
```

## Building Your Own

The easiest way to understand the profile format is to let the engine build one naturally:

1. Install Taste Engine
2. Write code normally for a day
3. Run `/taste push` to export
4. Inspect the JSON — it's just markdown files wrapped in a JSON envelope

## Sharing

```bash
# Export your own
/taste push --name my-team-profile

# Share the output file
open ~/.claude/skills/taste/exports/my-team-profile.json
```

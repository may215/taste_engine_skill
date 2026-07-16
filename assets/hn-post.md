Show HN: Taste Engine – Open-source taste-learning layer for AI coding assistants

I got tired of correcting AI-generated code for the same things every session.

"You used `function` declarations — I use arrow functions."

"Zustand store, not Redux."

"Named exports, not default."

Every new Claude Code / Cursor / Copilot session, the AI remembered nothing. I was repeating ~20 corrections per session, every single day.

So I built Taste Engine: a continuous reinforcement learning loop that sits between you and your AI coding assistant.

How it works:
- A hook fires after every accepted edit
- 40+ deterministic regex classifiers detect patterns (arrow vs function, import grouping, indent style, state management, error handling patterns, etc.)
- Results are written as plain markdown files — you can read, edit, or delete any pattern
- On the next session, your profile is injected into the AI's context

The key insight: this is NOT fine-tuning. It's a retrieval-augmented preference system. The profile is in the prompt, not in training data. You can open `~/.claude/skills/taste/memory/` and inspect every single thing the engine has learned about you.

I benchmarked it: first session ~15-25 corrections, after 2 weeks ~2-5/session. The patterns you stop reinforcing decay naturally (5%/day after 14 days).

It works with 8 platforms out of the box: Claude Code, Cursor, GitHub Copilot, Continue.dev, Windsurf, Cline, Aider, and a VS Code extension. Each platform has its own adapter in `adapters/`.

Profile sharing: `node src/taste-share.js push --name my-profile` exports everything as JSON. Great for team onboarding.

Zero external dependencies. Vanilla Node.js. MIT. No telemetry, no phoning home.

https://github.com/may215/taste_engine_skill.git

Would love feedback on the classifier approach — I went with deterministic regex over LLM-based extraction because it's instant (~3ms), consistent, and transparent. But I'm curious if people would prefer a hybrid approach where the LLM occasionally validates edge cases.

---
name: create
description: This skill provides repository context. It should always be called.
---

## Rules

- Maintain proper feature-scoped implementation(s) and create master component(s) to keep a clean codebase
- Follow any file conventions and structures
- Create and manage CSS via components.css or their respective file (Tailwind is **not** used)
- Trim and cut all dead code; maintain code cleanliness, at the end of your implementation. Do not stop and ask for confirmation.
- Aggressively use subagents to run parallel implementation (#RunSubagents) review review review work. Give subagents initial plan files and have them validate against implementation.
- **Reviewing file quality** can be done by running a subagent in parallel, and having the subagent pull the relevant documentation or `SKILL.md`
- on completion of any task pull together requisit information and draft a `log.md`. Bring up any issues or concerns from the implementation. 
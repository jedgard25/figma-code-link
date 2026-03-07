---
name: execute-implementation-plan
description: Guide for executing an implementation plan. Use this when the user requests a feature implementation and has supplied an `implementation-plan.md`, or when they ask to "implement", "build", or "execute" a plan. Also trigger when a user supplies a plan document and asks you to carry it out, even if they don't explicitly reference this skill.
---

## Executing an Implementation Plan

This skill helps you orchestrate the implementation of a feature, update, or structured plan.

## Instructions

Analyze the pending tasks and todos in the plan document, then split them into subtasks. For each task or group of tasks, spawn a subagent and orchestrate them properly. Run as many steps in parallel as possible.

You are the orchestrator: assign subagents to multiple tasks and run in parallel as much as possible. Avoid bloating your own context. Launch subagents to research and edit simultaneously where safe.

> When instructing subagents, prefer direct system tool calls over terminal command calls.

---

## Completion Checks

After implementation, run the project's type/compile checks and resolve any errors before reporting completion. For example:
- TypeScript/Svelte: `npm run check`
- Rust: `cargo check`
- Python: type check with `mypy` or equivalent

Adapt to whatever the project uses.

---

## Post-Task Log

After informing the user of completion status, create or append a `log.md`:

**Summary:** What changed and why (1–2 sentences)
**Files Modified:** List each file path
**Functions/Components Changed:** Name + one-line description of change
**Breaking Changes:** API changes, removed functionality, or migration requirements

---

## Code Quality Standards

**Core Principles:** SSOT, elegant solutions, mature/extensible code — no bandaids or patchwork.

**Review Checklist:**
- SSOT maintained? Data/state truth is clear and clean?
- Patchwork fixes? (excess events/vars, duplicated logic, non-standard patterns)
- Solutions elegant? Comments accurate? (remove transient comments)
- Code bloat/smell? Overly-complex state management?
- Files need atomization?

**Meta-question:** Does this implementation make sense for the bigger goal? Can we refactor for a cleaner, simpler system?

> **Project-specific standards:** If an `architecture.md` reference file exists alongside this skill, read it now and apply its patterns throughout the implementation. See [Architecture Reference](#architecture-reference) below.

---

## Architecture Reference

If this skill has an accompanying `references/architecture.md`, load it before beginning implementation and follow its conventions strictly. This file should document:
- State management patterns and rules
- Framework/language-specific conventions
- Async/concurrency constraints
- Styling and component standards
- Any SSOT or store architecture

If no `architecture.md` exists, infer conventions from the existing codebase.

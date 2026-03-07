---
name: create-implementation-plan
description: Guide for creating a structured implementation plan for a feature, component, or refactoring task. Use this when the user requests generation of an implementation plan, asks how to approach a feature, or needs a multi-agent execution roadmap. Trigger for any request involving planning, architecting, or breaking down a complex implementation before writing code.
---

## Creating an Implementation Plan

This skill helps you create a well-designed implementation plan suitable for multi-agent parallel execution.

## Instructions

Spawn subagents to crawl the codebase. Instruct them to return accurate, clear information in context of the requested feature, component, or refactor, and to note any concerns (code bloat, slop, poor practices). Avoid bloating your own context — run subagents in parallel as much as possible.

### Step 1 — Draft `review.md` first

Before writing any plan, step back. With the research in hand, draft `review.md` as a senior architectural review of the request itself. This is not a rubber stamp — it is the moment to surface anything that should change the approach or scope before any agent writes a line of code.

Ask yourself:

- **Does the request make sense?** Is the user asking for something that will cause unnecessary complexity, a large unintended refactor, or a decision they'd regret with fuller context?
- **Are there existing problems this touches?** If the relevant area of the codebase already has design debt, flag it. If solving both the request and the debt together is cleaner than doing them separately, say so explicitly.
- **Is there a simpler path?** Could the goal be achieved with less surface area, fewer moving parts, or a reuse of something already present?
- **What are the real risks?** Breaking changes, performance cliffs, state management violations, SSOT erosion — call them out directly.

`review.md` should be concise and direct. Its job is to either confirm the approach is sound, propose a better one, or flag a blocker. It should inform and possibly reshape the plan that follows.

### Step 2 — Draft `implementation-plan.md`

With the review resolved, produce the plan. The plan should reflect any adjustments surfaced in the review — do not plan the original request if the review concluded a different approach is better.

### Fast Path

If the implementation is safe, quick, and direct — succinctly output your plan in chat and immediately execute. Do not create `review.md` or `implementation-plan.md`.

---

## Plan Structure

**1. Phases** — Group steps by dependencies.
- Phase 1 = no deps (run in parallel)
- Phase 2 = depends on Phase 1, etc.

**2. Per step:**
- **Agent:** Domain (backend, frontend, db, integration, etc.)
- **Deps:** Step IDs that must complete first (or "none")
- **Context:** Background/constraints + relevant file paths
- **What:** Clear objective (no code blocks)
- **How/Where:** Approach and target location
- **Contract:** What this step produces for dependents (interfaces, events, schemas)

**3. Final section:** Checklist mapping original request to discrete deliverable items.

Keep it tight — no example code, minimal prose. The plan should enable parallel work while maintaining clarity.

---

## Code Quality Standards

The plan must reflect the project's codebase standards. Agents need sufficient context in the plan so core standards are followed on execution.

**Core Principles:** SSOT, elegant solutions, mature/extensible code — no bandaids or patchwork.

**Review Checklist:**
- SSOT maintained? Data/state truth is clear and clean?
- Patchwork fixes? (excess events/vars, duplicated logic, non-standard patterns)
- Solutions elegant? Comments accurate?
- Code bloat/smell? Overly-complex state management?
- Files need atomization?

> **Project-specific standards:** If an `architecture.md` reference file exists alongside this skill, read it now and incorporate its patterns, state management rules, and conventions into the plan. See [Architecture Reference](#architecture-reference) below.

---

## Architecture Reference

If this skill has an accompanying `references/architecture.md`, load it and apply its guidance throughout the plan. This file should document:
- State management patterns and rules
- Framework/language-specific conventions
- Async/concurrency constraints
- Styling and component standards
- Any SSOT or store architecture

If no `architecture.md` exists, apply general best practices appropriate to the project's detected stack.
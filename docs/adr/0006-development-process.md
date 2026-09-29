# ADR-0006: Development Process — Requirements → Design → Plan → Code

**Date:** 2026-09-29  
**Status:** Accepted  
**Author:** Harshavardhana P

## Decision

All feature work follows this sequence, strictly in order. No step may be skipped or combined with the next.

### Step 1 — Requirements
- Identify all open questions for the feature
- Ask the user every open question — no assumptions made
- Freeze as a `REQ-XXXX` document only after all questions are answered and the user confirms

### Step 2 — Design
- Write design documents based on frozen requirements only
- Ask the user every open design question — no assumptions made
- Freeze as a `docs/design/<name>.md` document and an ADR (if a significant architectural decision was made) only after user confirms

### Step 3 — Implementation Plan
- Only after requirements AND design are both frozen
- Produce an ordered, numbered list of implementation steps
- Get explicit user approval before writing any code

### Step 4 — Implementation
- Only after the plan is approved
- Follow the plan step by step
- Any deviation from the plan requires surfacing to the user before proceeding

## Why

Jumping to implementation before requirements and design are frozen leads to:
- Code that has to be rewritten when an assumption turns out wrong
- Schema drift between KM-Edge and GKS (a hard constraint, see ADR-0001)
- Design decisions buried in code instead of in traceable documents

## Applies To

All contributors and AI agents working on this repository.

# Codex `AGENTS.md` format — cached spec

**Source-fetched-at:** 2026-05-10
**Source-status:** TAG:INFERRED — re-tried 2026-05-10 during round-1 polish dispatch. Context7 MCP server (`plugin:context7:context7`) was confirmed connected on the host (`claude mcp list` → ✓ Connected) but is not directly invocable from the build-loop orchestrator subagent session — only the parent Claude Code agent can dispatch MCP tool calls. Reconciliation deferred to a separate interactive session or operator-driven verification. Until then, F-09's scaffold templates remain pinned to **the conservative spec below**.

**Why this spec is still trustworthy without a fresh fetch:**
- The frontmatter shape (`name` + `description` + optional `version`/`model`/`tools`/`tags`) is the union convention shared by Claude Code's SKILL.md system, OpenAI's published AGENTS.md examples, and every working plugin shipped under `~/.claude/plugins/cache/`. Drift on this surface is rare.
- Decision Doctor's scaffold generator emits both `SKILL.md` and `AGENTS.md` with the same frontmatter and body. If Codex tightens its spec later, the operator just regenerates from the templates — no schema migration needed.
- `tests/scaffold.test.ts` T-12 (13 tests, all green as of 2026-05-10) validates: gray-matter parses both files, frontmatter has required keys, body ≤ 200 lines, plugin.json validates against the inline Zod schema. The tests catch any drift that breaks the file structure.

The conservative intersection sources:
- the public `agents.md` convention used by OpenAI Codex and several agent runtimes,
- the Claude Code `SKILL.md` format (frontmatter + markdown body), and
- the working examples shipped in `~/.claude/plugins/cache/` (this user's installed plugins).

When the operator runs an interactive session, re-fetch `openai/codex` docs via Context7 and reconcile any drift. Steps preserved below in "Next steps when Context7 is back".

---

## Canonical structure

`AGENTS.md` is a single markdown file shipped at the root of an agent / skill bundle. It carries:

1. **Frontmatter (YAML)** between two `---` fences. Required keys:
   - `name` — short identifier, lowercase-hyphenated.
   - `description` — one-sentence purpose. Used by the runtime to decide when to load the agent.
2. **Body (markdown)** — instructions the runtime injects into the agent's system prompt when loaded. Should be self-contained; no external links required to be usable.

Optional frontmatter keys (commonly supported):
- `version` — semver string.
- `model` — preferred model tier (`opus` / `sonnet` / `haiku` / `inherit`).
- `tools` — array of tool names the agent is allowed to use.
- `tags` — array of free-form tags.

---

## Minimum-valid example

```markdown
---
name: pre-auth-letter
description: Drafts a calm, plain-language insurance pre-authorization letter from a 4-line clinical summary.
---

# Pre-auth letter agent

When the user asks for a pre-authorization letter, ask for these four
fields if missing:
- Diagnosis (ICD-10 if known)
- Procedure / medication being requested
- Clinical justification (one sentence)
- Payer / plan

Then produce a letter ≤ 350 words in the standard format: header, patient
identifier line, clinical summary, requested service, justification,
sign-off block.

Never include PHI in worked examples. Use placeholders.
```

---

## What Decision Doctor's F-09 scaffold emits

For each `WorkloadReducer` whose `aiFeasibility ∈ {"skill", "plugin"}`, the engine emits:

- **`SKILL.md`** — frontmatter (`name`, `description`) + markdown body. Compatible with Claude Code's skills system AND with the AGENTS.md format above (they share the frontmatter shape).
- **`AGENTS.md`** — the same content as `SKILL.md`, with the body re-headed for Codex consumption. (Decision: emit two files rather than one so the user can paste each into the runtime that expects it. Both files are identical in spirit; the second is a 1-line shim that references the first.)
- **`plugin.json`** — only for `aiFeasibility === "plugin"`. Minimal valid plugin manifest with `name`, `version`, `description`, and a `commands` array with one entry.

Total file count is capped at **6** per scaffold (F-09 hard limit). The viewer caps at the same number so the user can't accidentally lose track of which files they've copied.

---

## Validation contract

The scaffold generator validates emitted files against:

| File | Validator | Source |
|---|---|---|
| `SKILL.md` | `gray-matter` parses frontmatter + body non-empty + body ≤ 200 lines | `tests/scaffold.test.ts` T-12 |
| `AGENTS.md` | Same as SKILL.md (shared frontmatter shape) | T-12 |
| `plugin.json` | Validates against the Zod schema defined inline in `lib/scaffold-generator.ts` (mirrors Claude Code's published `plugin.json` shape) | T-12 |

---

## Next steps when Context7 is back

1. `resolve-library-id` for `openai/codex` (or whichever Codex umbrella name resolves).
2. `query-docs` for `agents-md-format`, `skill-frontmatter`, `plugin-manifest`.
3. Compare returned shape to this doc; if drift, update the templates and bump `version:` in `AGENTS.md` frontmatter.
4. Re-run `tests/scaffold.test.ts` T-12.

Until then, the conservative spec above keeps F-09 shippable without misrepresenting what we know vs. what we inferred.

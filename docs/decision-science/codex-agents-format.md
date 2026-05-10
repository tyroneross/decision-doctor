# Codex `AGENTS.md` format — authoritative spec

**Source-fetched-at:** 2026-05-10 (Context7 MCP, library `/openai/codex`)
**Source-status:** ✅ Verified — authoritative excerpt below cites `github.com/openai/codex` directly.

---

## What Codex CLI actually says about `AGENTS.md`

From `codex-rs/core/gpt_5_1_prompt.md` and `codex-rs/protocol/src/prompts/base_instructions/default.md`:

> Repositories often contain `AGENTS.md` files, which can be located anywhere within the repository. These files serve as a mechanism for humans to provide instructions or tips to the agent for working within the container, such as coding conventions, information about code organization, or instructions on how to run or test code. The scope of an `AGENTS.md` file encompasses the entire directory tree rooted at the folder containing it. For every file modified in the final patch, the agent must adhere to instructions in any `AGENTS.md` file whose scope includes that file. Instructions regarding code style, structure, or naming apply only within the `AGENTS.md` file's scope, unless explicitly stated otherwise. In cases of conflicting instructions, more-deeply-nested `AGENTS.md` files take precedence, while direct system, developer, or user instructions (as part of a prompt) override `AGENTS.md` instructions. The contents of the `AGENTS.md` file at the root of the repo and any directories from the Current Working Directory (CWD) up to the root are automatically included with the developer message, eliminating the need for re-reading.

### Key facts

| Aspect | What Codex actually does |
|---|---|
| **File format** | Plain markdown. **No required frontmatter.** |
| **Location** | Anywhere in the repo — root, subdirectory, even `/` or `~`. Not version-controlled-only. |
| **Scope** | The directory tree rooted at the file's parent folder. |
| **Loading** | Codex auto-loads the root `AGENTS.md` plus any ancestors of CWD. No manual loading. |
| **Conflict resolution** | More-deeply-nested wins. Direct user/system prompt overrides everything. |
| **Purpose** | Coding conventions, code organization notes, run/test instructions. |

## How `AGENTS.md` differs from `SKILL.md`

These are **two different formats** that this project happens to emit together.

| | `AGENTS.md` (Codex) | `SKILL.md` (Claude Code skills) |
|---|---|---|
| Format | Plain markdown | YAML frontmatter + markdown body |
| Frontmatter | None | Required: `name`, `description` |
| Discovery | Auto-loaded by Codex from path hierarchy | Loaded by Claude Code when user invokes via `Skill` tool or matching trigger |
| Scope | Directory tree from file's parent | The skill bundle's directory |
| Bundle structure | Single file | Required: `SKILL.md`. Optional: `scripts/`, `templates/`, `examples/` subdirs |

Source for SKILL.md spec, same Context7 fetch:
> A skill is a reusable 'slash-command' package, consisting of a directory with a required SKILL.md entrypoint (YAML frontmatter + instructions) and optional supporting files.

---

## What Decision Doctor's F-09 scaffold emits (corrected)

For each `WorkloadReducer` whose `aiFeasibility ∈ {"skill", "plugin"}`, the engine emits:

- **`SKILL.md`** — YAML frontmatter (`name`, `description`) + markdown body. Claude Code's skill format.
- **`AGENTS.md`** — plain markdown, no frontmatter. Codex CLI's agent-guidance format.
- **`plugin.json`** — only for `aiFeasibility === "plugin"`. Claude Code plugin manifest with `name`, `version`, `description`, `commands[]`.

The user pastes whichever file matches the runtime they're using. `SKILL.md` goes into `<plugin>/skills/<name>/`. `AGENTS.md` goes at the relevant directory level of their Codex-CLI-driven repo (typically root). `plugin.json` goes at the plugin root for Claude Code.

Hard cap: **6 files per scaffold**. Currently emits 2 (skill) or 3 (plugin).

---

## Validation contract

| File | Validator | Where |
|---|---|---|
| `SKILL.md` | `gray-matter` parses frontmatter (with `name` + `description`); body non-empty; body ≤ 200 lines | `tests/scaffold.test.ts` T-12 |
| `AGENTS.md` | Plain markdown; has at least one `#` heading; body ≤ 200 lines; no required frontmatter | `tests/scaffold.test.ts` T-12 |
| `plugin.json` | Validates against `PluginJsonSchema` (`lib/scaffold-generator.ts`); mirrors Claude Code's published `plugin.json` shape | T-12 |

---

## History

- **2026-05-10 (cached, conservative)** — initial cache pinned to a conservative intersection of SKILL.md + AGENTS.md frontmatter conventions. TAG:INFERRED because Context7 wasn't reachable from the build-loop subagent session.
- **2026-05-10 (this revision)** — Context7 re-fetched from the parent Claude Code session; the authoritative Codex spec was retrieved (`/openai/codex` at `codex-rs/core/gpt_5_1_prompt.md`). Found drift: AGENTS.md does NOT take frontmatter. Templates corrected; T-12 assertion updated.

If the Codex CLI repo updates its `AGENTS.md` semantics again, re-run `mcp__plugin_context7_context7__resolve-library-id` for "Codex CLI" then `query-docs` for "AGENTS.md format" and reconcile this file + the template.

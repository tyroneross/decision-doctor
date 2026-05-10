# AI Plugin Architecture: Skills, Scripts, Hooks, MCP Servers & Scaffolding

## Executive Summary

Modern AI plugin systems — particularly around Claude Code and compatible agentic platforms — are built from a small set of composable primitives: **skills** (context loaded by the agent), **commands** (user-triggered shortcuts), **agents/subagents** (specialized instances), **hooks** (deterministic lifecycle automation), **scripts** (deterministic execution), **MCP servers** (external capability gateways), **reference files** (structured context), and **scaffolding files** like `CLAUDE.md` and `plugin.json`. Each component solves a distinct problem in the context-reliability-automation triad. Choosing the wrong one is the most common failure mode — not bad prompt engineering.

***

## The Core Mental Model: Who Decides to Act?

Before covering each component, the most important design question is: **who makes the decision to trigger this behavior?**

| Component | Who triggers it | Nature of control | Context cost |
|-----------|----------------|-------------------|--------------|
| Rules / CLAUDE.md | Always-on | Probabilistic (model interprets) | Always paid |
| Skills | The agent (auto-detected) | Probabilistic | Paid when relevant |
| Commands | The user (explicit `/cmd`) | Deterministic (injected) | Paid when used |
| Hooks | The system (lifecycle events) | **Deterministic** (enforced) | Zero (runs outside model) |
| Scripts | Called by hooks or skills | Deterministic | Zero (runs outside model) |
| MCP Servers | The agent (tool calls) | Semi-deterministic | Paid per tool invocation |
| Subagents | The parent agent or user | Isolated probabilistic | Separate context budget |

This framing matters because **a behavior you put in a rule can be ignored; a behavior you put in a hook cannot**. Most teams over-invest in rules and under-invest in hooks and scripts.[^1]

***

## Skills

### What Skills Are

A skill is a folder containing a `SKILL.md` file and optional supporting assets (reference docs, scripts, templates). It represents **just-in-time expertise** — the agent scans skill metadata and loads full content only when it determines the skill is relevant to the current task. This is often described as "lazy loading for context".[^2][^3]

Skills live at `skills/<skill-name>/SKILL.md` within a plugin or at `.claude/skills/<skill-name>/SKILL.md` within a project.[^4]

### Key Components of a Skill

```
skills/
└── pdf-processor/
    ├── SKILL.md            ← Required: name, description, instructions
    ├── reference.md        ← Optional: heavy reference content
    ├── examples/           ← Optional: usage examples
    └── scripts/            ← Optional: deterministic helper scripts
```

**SKILL.md frontmatter** requires two fields:[^5]
- `name`: kebab-case, max 64 chars, no reserved words like `anthropic` or `claude`
- `description`: max 1024 chars, **written in third person**, non-empty — this is the routing field

**The description field is the most important field you will write.** The agent uses it to select the right skill from potentially 100+ options. It must include what the skill does *and* specific triggers/contexts. A vague description means the skill never gets loaded.[^5]

### What Makes a Great Skill

- **Description routes, body executes.** Keep the description packed with the keywords that will appear in actual tasks. The body is a procedure, not a wiki.[^3]
- **Body under 500 lines.** Split heavy content into referenced files; Claude reads them only when needed.[^5]
- **References one level deep.** Nested references cause partial reads — Claude may `head -100` a file instead of reading it fully.[^5]
- **Define "done" explicitly.** Include success criteria and stop conditions. Skills that leave the definition of done ambiguous produce scope creep on every invocation.[^3]
- **Use scripts for deterministic steps.** Anything repeatable and exact — data fetching, build execution, file transforms — belongs in a script bundled with the skill, not in AI inference.[^6]
- **Include explicit NOT-DO sections.** A skill that only says what to do leaves the model free to invent the rest.[^7]
- **Test across all target models.** A skill tuned for Opus may need more detail for Haiku.[^5]

### What Makes a Poor Skill

| Anti-pattern | Problem |
|---|---|
| **The Encyclopedia** | Reads like a wiki page; too long; agent ignores or skims it |
| **The Everything Bagel** | Applies to every task; should be a rule instead |
| **The Secret Handshake** | Description too abstract; agent never discovers it |
| **The Fragile Skill** | Hard-coded paths/values; breaks on repo changes |
| **First-person description** | "I can help you..." breaks routing discovery |

***

## Commands

### What Commands Are

Commands are flat Markdown files that inject instructions when a user types a `/command-name` shortcut. They are **explicit** and **deterministic** — the user decides, the tool injects, the agent executes. There is no model-level discovery or selection.[^8][^3]

Commands live at `commands/<name>.md` or inside `skills/` as `SKILL.md` files (modern plugins prefer the skills directory structure for new development).[^2]

Commands can accept positional arguments via `$1`, `$2`, etc., making them parametric without requiring the user to re-type full prompts.[^3]

### Commands vs. Skills: The Key Distinction

> **Commands: the user decides. Skills: the agent decides.**[^8]

```
/release          ← User explicitly triggers this
/refactor $1      ← User decides with argument

vs.

"pdf-processor" skill ← Agent loads when it detects PDF work
```

The strongest pattern is **composing them**: use commands as ergonomic shortcuts that load one or more skills, keeping the command list short and memorable while keeping the policy logic in reviewable, version-controlled skills.[^3]

***

## Hooks

### What Hooks Are

Hooks are **deterministic lifecycle event handlers** — shell commands, HTTP calls, MCP tool invocations, or prompt-based checks that fire at specific points in the agent's execution lifecycle. Unlike rules or skills, hooks cannot be overridden by model reasoning. Exit code `2` from a hook blocks the triggering operation unconditionally.[^9][^7]

This is the critical insight: **hooks are not better prompts. They are the system that makes certain behaviors non-negotiable.**[^1]

### The Hook Lifecycle: Full Event Reference

As of May 2026, Claude Code supports 22+ hook events:[^9][^2]

| Event | When It Fires | Primary Use Cases |
|-------|--------------|-------------------|
| `SessionStart` | Session begins or resumes | Load context, install deps, environment setup |
| `Setup` | `--init-only` or CI/maintenance mode | One-time prep, CI pipelines |
| `UserPromptSubmit` | Before Claude processes prompt | Inject context, validate input, block PII |
| `UserPromptExpansion` | When a command expands to a prompt | Block or modify command expansion |
| `PreToolUse` | Before a tool call executes | **Block destructive operations, validate parameters** |
| `PermissionRequest` | Permission dialog appears | Auto-approve safe patterns |
| `PermissionDenied` | Auto-mode denies action | Return `{retry: true}` to allow retry |
| `PostToolUse` | After a tool call succeeds | Auto-lint, auto-format, run tests |
| `PostToolUseFailure` | After a tool call fails | Error handling, fallback logic |
| `PostToolBatch` | After a full batch of parallel calls | Coordination before next model call |
| `Notification` | Claude sends a notification | Route to Slack/Telegram |
| `SubagentStart` | Subagent is spawned | Configure subagent context |
| `SubagentStop` | Subagent finishes | Aggregate results, validate output |
| `TaskCreated` | Task created via `TaskCreate` | Audit, logging |
| `TaskCompleted` | Task marked complete | Enforce definition of done |
| `Stop` | Claude finishes responding | **Final quality gate before response completes** |
| `StopFailure` | Turn ends due to API error | Alerting |
| `PreCompact` | Before context compaction | Block unwanted compaction |
| `PostCompact` | After compaction completes | Reload critical context |
| `InstructionsLoaded` | CLAUDE.md file loaded | Validate rules, inject dynamic context |
| `FileChanged` | Watched file changes on disk | Reactive environment management |
| `CwdChanged` | Working directory changes | direnv-style env management |
| `WorktreeCreate/Remove` | Worktree created/removed | Custom git worktree logic |
| `Elicitation` | MCP server requests user input | Auto-respond or validate |
| `SessionEnd` | Session terminates | Cleanup, summaries |

### The Five Events That Cover Most Use Cases[^1]

For most teams, these five drive 80%+ of real-world hook workflows:

1. **SessionStart** — environment initialization, dependency checks
2. **PreToolUse** — intercept and block before actions happen (secrets, destructive ops)
3. **PostToolUse** — react after actions (auto-format, auto-test)
4. **Stop** — final validation gate before response completes
5. **TaskCompleted** — enforce stricter definition of done

### Hook Types

Hooks support four handler types:[^2]
- **`command`**: Execute a shell script
- **`http`**: POST the event JSON to a URL
- **`mcp_tool`**: Call a tool on a configured MCP server
- **`prompt`**: Evaluate a prompt with an LLM
- **`agent`**: Run an agentic verifier with full tools (for complex verification)

### What Makes Great Hooks

- **Start with `warn` before `block`**. Validate the pattern catches what you expect before making it unconditional.[^7]
- **Keep handlers fast.** Hooks on `PreToolUse` add latency to every tool call; scripts should run in milliseconds.
- **Use matchers to narrow scope.** `"matcher": "Write|Edit"` ensures the hook only fires on file operations[^2].
- **Exit code semantics**: `0` = allow, `2` = block, anything else = warn/log.[^9]
- **Combine hooks with skills**: A hook on `UserPromptSubmit` can detect task type and inject relevant skill reminders into context.[^10]

### What Makes Poor Hooks

- **Over-broad matchers** that fire on every tool call and add latency
- **Non-idempotent handlers** — hooks can fire multiple times; scripts must be safe to re-run
- **Scripts that are not executable** — the #1 cause of "hook not triggering" (`chmod +x` is required)[^2]
- **Using absolute paths** instead of `${CLAUDE_PLUGIN_ROOT}` — breaks after plugin updates[^2]
- **Relying on model output parsing** inside a hook — use structured JSON input only

***

## Scripts

### What Scripts Are

Scripts are the **deterministic execution layer** within a plugin — shell scripts, Python files, Node.js utilities placed in the `scripts/` directory and called by hooks, skills, or MCP server configurations. They are the escape valve from probabilistic model behavior: anything that must always produce the same output given the same inputs belongs in a script.[^11]

Scripts live at `scripts/` in the plugin root or inside individual skill directories.[^2]

### Common Script Patterns

| Script Type | Triggered By | Use Case |
|---|---|---|
| Format/lint script | `PostToolUse` hook on Write/Edit | Auto-format after file changes |
| Secret scanner | `PreToolUse` hook on Write/Edit | Block hardcoded credentials |
| Test runner | `Stop` hook | Run tests before response completes |
| Dependency installer | `SessionStart` hook | `npm install` when `package.json` changed |
| Context loader | `SessionStart` hook | Inject git log, open tickets, branch state |
| Deploy validator | `TaskCompleted` hook | Verify build passes before marking done |

### Dependency Management Pattern

For scripts requiring external dependencies, the recommended pattern uses `${CLAUDE_PLUGIN_DATA}` (persists across updates) vs. `${CLAUDE_PLUGIN_ROOT}` (ephemeral, reset on update):[^2]

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" || (cd \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" . && npm install)"
      }]
    }]
  }
}
```

This installs dependencies on first run and re-installs only when `package.json` changes — avoiding reinstall on every session while catching dependency updates.[^2]

***

## Reference Files and Scaffolding

### The Scaffolding Hierarchy

Reference files are the **always-on memory layer** — they load into context at session start or on first reference and persist across the session. Unlike skills (lazily loaded), these are structural context.[^12][^4]

```
project-root/
├── CLAUDE.md              ← Primary project memory (always loaded)
└── .claude/
    ├── settings.json      ← Permissions, model, hooks config
    ├── settings.local.json ← Personal settings (gitignored)
    ├── rules/             ← Modular, auto-loaded rule files
    │   ├── security.md
    │   ├── code-style.md
    │   └── api-rules.md
    ├── skills/            ← Project-specific skills
    ├── agents/            ← Subagent definitions
    ├── commands/          ← Custom slash commands
    └── .mcp.json          ← MCP server definitions
```

### CLAUDE.md: The Project Brain

`CLAUDE.md` is read at the start of every session and followed as standing instructions. Think of it as version-controlled system memory — reviewed like code, maintained like documentation. Key contents:[^13][^7]

- Project structure overview
- Technology stack constraints (exact libraries, frameworks, versions)
- Code quality rules (no raw SQL, no hardcoded secrets, no JPA entities in REST responses)
- Security constraints (no PII logging, no stack traces to callers)
- Naming conventions
- Common commands
- On uncertainty (when to ask vs. proceed)

The `.claude/rules/` directory contains modular files that are **automatically loaded** alongside `CLAUDE.md`. This enables team ownership of different rule sets without merge conflicts in one giant file.[^12]

### Effective Reference File Design

- **Treat as a non-negotiable policy**, not a preference list — but know it is still probabilistic (hooks enforce; CLAUDE.md guides)[^1]
- **Keep it short.** Every token in CLAUDE.md is always consumed. Verbose guidelines become context noise[^3]
- **Route from rules into skills**: "When touching billing code, load the `billing-ops` skill" — keeps rules small and dynamic[^3]
- **Import don't repeat.** Use `@filename` imports for referenced docs; don't paste docs inline[^12]
- **Hierarchical rules**: Tools like Claude Code support hierarchical CLAUDE.md files per directory, letting sub-project rules layer on top of root rules[^3]

### Plugin Manifest: plugin.json

The manifest lives at `.claude-plugin/plugin.json` and is **optional but strongly recommended** for distributed plugins. It drives auto-discovery and determines what gets loaded where.[^2]

```json
{
  "name": "my-plugin",
  "version": "1.2.0",
  "description": "Brief plugin description",
  "skills": "./custom/skills/",
  "agents": ["./custom/agents/reviewer.md"],
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "dependencies": [
    { "name": "helper-lib", "version": "~2.1.0" }
  ],
  "userConfig": {
    "api_token": {
      "type": "string",
      "title": "API token",
      "sensitive": true
    }
  }
}
```

Key manifest rules:[^2]
- `name` is the only required field if a manifest is included
- All component directories (skills, agents, hooks) must be at the plugin root — **not** inside `.claude-plugin/`
- Only `plugin.json` belongs in `.claude-plugin/`
- Use `${CLAUDE_PLUGIN_ROOT}` for all plugin-internal path references
- Use `${CLAUDE_PLUGIN_DATA}` for persistent state (survives plugin updates)

***

## MCP Servers

### The Three Primitives

MCP servers expose three primitives to AI clients:[^14][^15]

| Primitive | Direction | Method | Purpose |
|-----------|-----------|--------|---------|
| **Tools** | Server → Client | `tools/list`, `tools/call` | Execute actions, fetch live data, interact with external systems |
| **Resources** | Server → Client | `resources/list`, `resources/read` | Inject read-only context (files, DB records, API docs) |
| **Prompts** | Server → Client | `prompts/list`, `prompts/get` | Reusable parameterized prompt templates and workflows |

Most MCP servers today only expose tools, leaving resources and prompts underutilized. This is a significant missed opportunity: resources reduce context overhead for frequently needed data, and prompts enable centralized distribution of high-quality templates across teams.[^6]

### The Critical Insight: MCP Responses Are Prompts

Every tool response is an opportunity to guide the model's next action. Unlike a REST API where documentation is read once and remembered, the model **starts fresh on each call**. This means:[^16]

- **Tool descriptions must be self-contained routing guides**, not just signatures
- **Tool responses should include next-step guidance** ("To get order history, call `list_order_items` next")
- **Negative constraints belong in descriptions**: "Do NOT use to modify, cancel, or delete orders"

This is the most common MCP design failure: building for a developer who reads docs once rather than for a model that needs context on every call.[^16]

### MCP Architecture Patterns[^17]

| Pattern | When to Use | Anti-Pattern to Avoid |
|---|---|---|
| **Direct API Wrapper** | Quick integrations, single backend | Chatty interfaces with excessive sequential calls; use batching |
| **Composite Service** | Multi-API coordination workflows | Tight coupling between APIs — keep integrations modular |
| **MCP-to-Agent** | Specialized reasoning or domain expertise | Over-delegation; limit agent hops to reduce latency |
| **Event-Driven Integration** | Real-time, non-blocking workflows | Blocking on heavy async operations |
| **Hierarchical MCP** | Large-scale enterprise setups | Single point of failure; layer servers for resilience |

### What Makes a Great MCP Server

**Tool design:**
- Single responsibility per tool — one tool does one thing[^18]
- Input validation before any DB, file system, or external API call[^7]
- Explicit scoped permissions: `mcp:orders:read` not `mcp:orders:*`[^7]
- Hard limits on destructive operations (max records, value thresholds, human approval gates)[^7]

**Description quality:**
```python
@mcp.tool(
    name="get_order_by_id",
    description="""
    Returns a read-only summary of a single order.
    Use for display and status checks ONLY.
    Do NOT use to modify, cancel, or delete orders.
    Requires a valid UUID v4 identifier.
    """
)
```

**Operational quality:**
- Config externalized via environment variables (12-factor)[^18]
- Structured JSON logging with request IDs, latencies, error types[^18]
- Health endpoints (`/health`, `/ready`) for orchestrator integration[^18]
- Circuit breakers and multi-level caching for reliability[^18]
- Immutable audit log for every write/delete/bulk operation[^7]

**Transport:** Streamable HTTP replaced HTTP+SSE for production remote deployments in 2025; `stdio` remains standard for local plugins.[^15]

### MCP Security: Non-Negotiables

MCP security has a documented track record of critical vulnerabilities:[^19][^7]

| CVE / Incident | Impact | Root Cause |
|---|---|---|
| CVE-2025-6514 (mcp-remote) | RCE, credential theft (CVSS 9.6) | Command injection in OAuth proxy |
| CVE-2025-49596 (MCP Inspector) | Full system access (CVSS 9.4) | No auth, bound to 0.0.0.0 |
| CVE-2025-53110 (Filesystem MCP) | Arbitrary file read (CVSS 7.3) | Directory containment bypass |
| Tool Poisoning (Invariant Labs 2025) | Model obeys hidden instructions | Hidden text in tool description field |

**Minimum security requirements:**
- Authenticate every MCP endpoint — the spec makes auth optional; production does not[^7]
- Container isolation per server: read-only filesystem, `cap_drop: ALL`, non-root user[^7]
- Pin versions in lockfiles; fail CI on unexpected changes (prevents rug-pull attacks)[^7]
- Read every tool description field in source before connecting to third-party servers[^7]
- Audit all outbound network calls — any call to an external domain not matching the stated integration is a red flag[^7]

***

## Agents and Subagents

### Agents vs. Skills: The Key Trade-off

> **Skills change what the agent knows. Agents change who is doing the work and what they can access.**[^3]

Use a separate agent when you need:
- A different LLM (different model, temperature, or cost tier)
- Permission scoping — the agent should only have read access, not write
- Context isolation — a misbehaving subagent cannot affect siblings' state
- Parallel execution — multiple subagents run simultaneously for independent tasks[^3]

Prefer a skill when:
- The same agent can handle the task with better procedure
- Context isolation is not required
- You want to avoid the complexity of agent orchestration

### Agent Structure

```yaml
---
name: code-reviewer
description: Reviews code diffs for correctness, security, and style. Invoke when
             reviewing PRs, after significant changes, or when quality check requested.
model: sonnet
effort: medium
maxTurns: 20
disallowedTools: Write, Edit    # read-only agent
---

Detailed system prompt here...
```

Key frontmatter fields: `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`. Note: plugin-shipped agents cannot have `hooks`, `mcpServers`, or `permissionMode` for security reasons.[^2]

### Multi-Agent Architecture: Best Practices[^7]

| Practice | Rationale |
|---|---|
| One subagent, one concern | Monolithic subagents with multiple jobs are untestable and unreliable |
| Constrain `allowed-tools` explicitly | System prompts can be ignored; tool scoping cannot |
| Only parallelize truly independent tasks | Parallel subagents can't communicate; dependent tasks must be sequential |
| Scope file access per subagent | Broad file access + prompt injection = entire codebase at risk |
| Return structured summaries, not raw output | Full context dumps defeat the purpose of isolation |

### Supervisor Pattern

The production-grade architecture separates:
- **Supervisor agent**: routes intent, cannot directly touch external systems
- **Domain subagents**: handle specific workflows with scoped tool access
- **MCP servers**: provide standardized, scoped access to external systems

"Scope is enforced by architecture, not just by instruction."[^7]

***

## Monitors (Experimental)

Monitors are background processes that run for the lifetime of a session, delivering each stdout line to Claude as a notification. This enables reactive workflows without requiring the agent to poll:[^2]

```json
[
  {
    "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log",
    "when": "on-skill-invoke:debug"
  }
]
```

The `when` field supports `"always"` (default) or `"on-skill-invoke:<skill-name>"` to start the monitor only when a specific skill is first invoked. Useful for: deployment status monitoring, log streaming, CI status feeds, and real-time diagnostic data.

***

## Scaffolding Quality: Great vs. Poor Design

### The Anti-Pattern Spectrum

The most common structural failures, in order of damage:

1. **Monolith anti-pattern**: One mega-skill, one mega-agent, one mega-prompt handling everything. Fails because context collapse, impossible to test, unlimited blast radius.[^7]

2. **Rules as procedures**: Putting step-by-step workflows in CLAUDE.md instead of skills. They're always in context, consuming tokens even when irrelevant.

3. **MCP tools as docs**: Treating tool descriptions as API documentation for a developer, not as routing prompts for a stateless model.[^16]

4. **Unhardened hooks**: Using CLAUDE.md to enforce "never commit secrets" instead of a `PreToolUse` hook with an exit code 2 on detection. A real incident: an agent committed an Azure OpenAI API key to a public repo; $30,000 in fraudulent charges appeared 11 days later.[^7]

5. **Unscoped permissions**: A subagent with read + write + delete access where only read is needed. A compromised agent can trigger all of them.

6. **Deeply nested skill references**: Causes partial reads where Claude `head -100`s a file instead of reading it fully.[^5]

### The Quality Checklist

**Skills:**
- [ ] Description routes (third-person, specific, keyword-rich)
- [ ] Body under 500 lines; heavy content in referenced files
- [ ] References one level deep from SKILL.md
- [ ] Explicit NOT-DO section
- [ ] Success criteria defined
- [ ] Deterministic steps use bundled scripts, not inference
- [ ] Version-controlled alongside code

**Hooks:**
- [ ] Scripts are executable (`chmod +x`)
- [ ] Paths use `${CLAUDE_PLUGIN_ROOT}`, not absolute paths
- [ ] Matchers narrow scope appropriately
- [ ] Started with `warn` before escalating to `block`
- [ ] Idempotent (safe to re-run)

**MCP Servers:**
- [ ] Each server has a single responsibility
- [ ] Tool descriptions include explicit negative constraints
- [ ] Input validated before execution
- [ ] Granular OAuth scopes (`read` ≠ `write`)
- [ ] Auth required on all endpoints
- [ ] Version pinned in lockfile
- [ ] Source reviewed before connecting (tool poisoning check)
- [ ] Audit log for all writes

**Plugin Scaffolding:**
- [ ] `plugin.json` in `.claude-plugin/` (only file in that directory)
- [ ] Component directories at plugin root (not inside `.claude-plugin/`)
- [ ] Kebab-case naming throughout
- [ ] `${CLAUDE_PLUGIN_DATA}` for persistent state; `${CLAUDE_PLUGIN_ROOT}` for plugin files
- [ ] `userConfig` for secrets (uses system keychain, not `settings.json`)
- [ ] `claude plugin validate` passes

***

## The Composability Pattern

The most effective plugin architectures combine all components deliberately:

```
CLAUDE.md                    ← What is always true
  └── routes into Skills     ← What to do in specific situations
      └── backed by Scripts  ← How to do deterministic steps reliably
      └── backed by MCP      ← What capabilities are available
Hooks                        ← What must always happen (non-negotiable)
Agents                       ← Who handles specialized workflows
Monitors                     ← What to watch reactively
```

A concrete example (QuestDB's PR review plugin):[^7]
- A **skill** defines the review procedure
- The skill **spawns 8 parallel subagents** covering distinct concerns (correctness, concurrency, performance, resource management, tests, code quality, PR metadata, Rust safety)
- A **verification pass subagent** eliminates false positives before reporting
- **Scripts** fetch PR data via `gh` CLI (deterministic, not inferred)
- The result: a structured, reproducible, comprehensive code review that scales with parallelism and does not hallucinate review criteria

This is the template: **skills define the procedure, scripts handle deterministic execution, agents provide specialization and isolation, hooks enforce quality gates, MCP provides external capability**. Each layer does only what it is designed for.

---

## References

1. [Claude Code Hooks Explained: From Prompts to Production](https://joseparreogarcia.substack.com/p/claude-code-hooks-explained-the-missing) - Learn how Claude Code hooks work, why prompts and memory are not enough, and how to enforce reliable...

2. [plugin prune](https://code.claude.com/docs/en/plugins-reference) - Complete technical reference for Claude Code plugin system, including schemas, CLI commands, and com...

3. [Agent Skills vs. Rules vs. Commands - Builder.io](https://www.builder.io/blog/agent-skills-rules-commands) - Agent skills, rules, and commands offer different, strategic context for AI agents. Here's when to u...

4. [The Complete Guide to CLAUDE.md, SKILL.md & Every Important ...](https://sidsaladi.substack.com/p/claude-codes-secret-weapon-the-complete) - A skill is a folder with a `SKILL.md` file that teaches Claude a specialized workflow. Claude can ap...

5. [Skill authoring best practices - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) - Keep references one level deep from SKILL.md. All reference files should link directly from SKILL.md...

6. [How to effectively use prompts, resources, and tools in MCP](https://composio.dev/content/how-to-effectively-use-prompts-resources-and-tools-in-mcp) - In this deep dive blog, I explain how to effectively use MCP resources, tools, and prompts to build ...

7. [Best practices for Mastering AI Agents, Subagents, Skills & MCP](https://foojay.io/today/best-practices-for-working-with-ai-agents-subagents-skills-and-mcp/) - Master AI agents with 5 developer best practices for building scalable architecture with MCP, subage...

8. [When building agents, what is the difference between skills and ...](https://www.linkedin.com/posts/agrigorev_when-building-agents-what-is-the-difference-activity-7422186780625453056-p0rl) - When building agents, what is the difference between skills and commands? They look similar, but the...

9. [Automate workflows with hooks - Claude Code Docs](https://code.claude.com/docs/en/hooks-guide) - Hooks let you run code at key points in Claude Code's lifecycle: format files after edits, block com...

10. [Claude Code is a Beast – Tips from 6 Months of Hardcore Use - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oivs81/claude_code_is_a_beast_tips_from_6_months_of/) - Stop Event Hook (runs AFTER Claude finishes responding):. Analyzes ... Best practices for using Clau...

11. [Plugins Scaffolding - Claude Skill - Agent Skills Directory](https://www.skillsdirectory.com/skills/charlesjones-dev-plugins-scaffolding)

12. [How to Write a Good CLAUDE.md File - Builder.io](https://www.builder.io/blog/claude-md-guide) - Learn how to create, structure, and maintain CLAUDE.md files for Claude Code. Save hours by document...

13. [How I structure Claude Code projects (CLAUDE.md, Skills, MCP)](https://www.reddit.com/r/ClaudeAI/comments/1r66oo0/how_i_structure_claude_code_projects_claudemd/) - Another big improvement came from using a CLAUDE.md file properly. Treat it as a long-term project m...

14. [MCP Cheat Sheet (2026) - Model Context Protocol Quick Reference](https://www.webfuse.com/mcp-cheat-sheet) - Servers declare which primitives they support (tools, resources, prompts) and whether they support d...

15. [MCP & Tool-Use Vocabulary: 2026 Reference Guide - Digital Applied](https://www.digitalapplied.com/blog/mcp-tool-use-vocabulary-reference-guide-2026) - Distinct from primitive — primitives are top-level capabilities; sub-features are nested. Capability...

16. [Good MCP design is understanding that every tool response is an ...](https://www.reddit.com/r/mcp/comments/1lq69b3/good_mcp_design_is_understanding_that_every_tool/) - It's good to think about every response as an opportunity to prompt the model. The model has no memo...

17. [6 MCP Design Patterns for AI Agents - LinkedIn](https://www.linkedin.com/posts/rakeshgohel01_what-are-the-best-ways-to-utilize-mcp-for-activity-7435665765938360320-riC1) - The Hierarchical pattern works well for big setups. Layering servers helps manage complex systems an...

18. [MCP Best Practices: Architecture & Implementation Guide](https://modelcontextprotocol.info/docs/best-practices/) - This guide distills extensive distributed systems experience into actionable best practices for MCP ...

19. [MCP Safety Audit: LLMs with the Model Context Protocol Allow Major
  Security Exploits](https://arxiv.org/html/2504.03767v2) - To reduce development overhead and enable seamless integration between
potential components comprisi...


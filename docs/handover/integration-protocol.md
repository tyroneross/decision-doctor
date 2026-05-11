# Parallel-build integration protocol — 2026-05-11

Two work streams are in flight against the same repo:

| Stream | Worktree | Branch | Owns |
|---|---|---|---|
| **UI Guidelines** v0.1 (C7–C12) | `~/dev/git-folder/decision-doctor-cc` | `main` | `app/`, `components/`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx` |
| **Backend** corpus enrichment | `~/dev/git-folder/decision-doctor-cc-backend` | `corpus-pipeline` | `workers/`, `drizzle/migrations/`, `docs/handover/`, `scripts/check-integration.sh` |

They are **designed to be file-disjoint**, so a final merge should be straightforward. The integration checkpoint catches the cases where that assumption breaks.

---

## Checkpoint mechanism

Script: `scripts/check-integration.sh` (in this worktree; copy to main worktree if needed).

Per run it reports:
- Merge-base + how far each side is ahead
- Files touched on BOTH sides since merge-base ("shared-file edits") → soft alert
- `package.json` / `pnpm-lock.yaml` / `workers/package.json` / `tsconfig.json` drift → soft alert
- `git merge-tree` 3-way merge preview → hard alert if conflicts surface
- Recent commits on each side, for context

Writes to `docs/handover/integration-status.md` (overwrite-each-run; commit periodically for history).

Exit codes:
- `0` clean
- `1` warn (shared-file edits OR dep drift, but merge would still apply)
- `2` block (merge conflict surface — must reconcile before continuing)

## Cadence

| Trigger | Action |
|---|---|
| Every ~20–30 minutes during active dual development | Run script + scan verdict |
| After each commit on either side | Run script |
| Before either build-loop's Phase 4 Validate | Run script (`exit 2` blocks Phase 4) |
| Before any merge into main | Run script + resolve all ⚠️/❌ |

## Shared-file contract — agree these BOTH sides touch carefully

| File | Owner (this build) | Co-edit rule |
|---|---|---|
| `package.json` | UI | Backend should NOT add deps without coordinating; if needed, append after UI commits |
| `pnpm-lock.yaml` | UI | Same as above; regenerate after merge |
| `workers/package.json` | Backend | UI never touches |
| `workers/pnpm-lock.yaml` | Backend | UI never touches |
| `tsconfig.json` | UI | Path-alias additions for backend go in `workers/tsconfig.json` |
| `docs/handover/*` | shared (additive) | Both can add new dated files; never edit each other's |

## On conflict surfaced

1. STOP the side that's making the new commit
2. Re-run `scripts/check-integration.sh` to identify the offending files
3. Decide: rebase the smaller-progress side onto the larger one, OR move the conflicting work to a third commit on a shared rebase target
4. Update this file's "Shared-file contract" table if a new sharing surface emerged

## Backend side responsibilities (this worktree)

- Run `scripts/check-integration.sh` at the end of every Phase 3 chunk implementer commit
- If exit ≥1, write a `## Integration alert` block into the chunk's commit message
- If exit 2, halt Phase 4 dispatch until reconciled

## UI side responsibilities (main worktree)

- Same as backend, mirrored. The script auto-detects which side it's running from.
- If the UI side doesn't have the script yet, copy `scripts/check-integration.sh` from this worktree at the next checkpoint.

#!/usr/bin/env bash
# Periodic integration checkpoint — flags divergence between the parallel work streams.
#
# Run from EITHER worktree. Compares current branch against the other declared branch.
# Output: docs/handover/integration-status.md (overwrites each run; commit periodically).
#
# Usage:
#   ./scripts/check-integration.sh [other-branch] [other-worktree-path]
#
# Defaults assume the two-worktree setup from 2026-05-10:
#   main worktree:    ~/dev/git-folder/decision-doctor-cc      (branch=main, UI)
#   backend worktree: ~/dev/git-folder/decision-doctor-cc-backend (branch=corpus-pipeline, backend)

set -u

# ----- args + auto-detect ----------------------------------------------------
SELF_DIR="$(git rev-parse --show-toplevel)"
SELF_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [[ "$SELF_BRANCH" == "main" ]]; then
  OTHER_BRANCH="${1:-corpus-pipeline}"
  OTHER_WT="${2:-${HOME}/dev/git-folder/decision-doctor-cc-backend}"
else
  OTHER_BRANCH="${1:-main}"
  OTHER_WT="${2:-${HOME}/dev/git-folder/decision-doctor-cc}"
fi

OUT="$SELF_DIR/docs/handover/integration-status.md"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$(dirname "$OUT")"

# ----- gather state ----------------------------------------------------------
SELF_HEAD="$(git rev-parse HEAD)"
SELF_SHORT="$(git rev-parse --short HEAD)"
OTHER_HEAD="$(git -C "$OTHER_WT" rev-parse HEAD 2>/dev/null || echo "MISSING")"
OTHER_SHORT="$(git -C "$OTHER_WT" rev-parse --short HEAD 2>/dev/null || echo "—")"

if [[ "$OTHER_HEAD" == "MISSING" ]]; then
  cat > "$OUT" <<EOF
# Integration status — $NOW

⚠️ Other worktree not found at \`$OTHER_WT\`. Skipping.

- Self: \`$SELF_BRANCH\` @ \`$SELF_SHORT\` ($SELF_HEAD)
- Other: \`$OTHER_BRANCH\` — worktree missing

Re-run after the other worktree is created.
EOF
  echo "[check-integration] other worktree missing; wrote status." >&2
  exit 0
fi

# Find the merge-base
MB="$(git merge-base "$SELF_HEAD" "$OTHER_HEAD" 2>/dev/null || echo "")"
MB_SHORT="${MB:0:7}"
SELF_AHEAD="$(git rev-list --count "$MB..$SELF_HEAD" 2>/dev/null || echo "?")"
OTHER_AHEAD="$(git rev-list --count "$MB..$OTHER_HEAD" 2>/dev/null || echo "?")"

# ----- shared-file detection -------------------------------------------------
# Files touched by EITHER side since merge-base.
SELF_TOUCHED="$(git diff --name-only "$MB..$SELF_HEAD" 2>/dev/null | sort -u)"
OTHER_TOUCHED="$(git -C "$OTHER_WT" diff --name-only "$MB..$OTHER_HEAD" 2>/dev/null | sort -u)"

# Intersect — files modified on BOTH sides = potential conflict surface.
SHARED="$(comm -12 <(printf '%s\n' "$SELF_TOUCHED") <(printf '%s\n' "$OTHER_TOUCHED"))"
SHARED_COUNT="$(printf '%s\n' "$SHARED" | grep -c . || true)"

# ----- merge dry-run via git merge-tree (non-destructive) --------------------
# Same-HEAD short-circuit (both worktrees at identical commit — degenerate, no-op).
DRY_RUN_EXIT=0
MERGE_CONFLICTS=""
unset TMP_IDX
DRY_RUN_EXIT=0
MERGE_CONFLICTS=""
if [[ "$SELF_HEAD" == "$OTHER_HEAD" ]]; then
  DRY_RUN_EXIT=0
else
  # merge-tree legacy 3-arg form: <merge-base> <branch1> <branch2>
  # Output is empty if clean; contains `<<<<<<<` conflict markers if not.
  MT_OUT="$(git merge-tree "$MB" "$SELF_HEAD" "$OTHER_HEAD" 2>&1)"
  if echo "$MT_OUT" | grep -q '<<<<<<<'; then
    DRY_RUN_EXIT=1
    # Extract conflicting file paths (lines starting with `changed in both` or pathnames before <<<).
    MERGE_CONFLICTS="$(echo "$MT_OUT" | grep -E '^changed in both|^  our|^  their|<<<<<<< ' | head -30)"
  fi
fi

# Cross-check lockfiles + package.json drift
PKG_DRIFT=""
for f in package.json pnpm-lock.yaml workers/package.json tsconfig.json; do
  if [[ -f "$SELF_DIR/$f" && -f "$OTHER_WT/$f" ]]; then
    if ! diff -q "$SELF_DIR/$f" "$OTHER_WT/$f" > /dev/null 2>&1; then
      PKG_DRIFT+="- \`$f\` differs between worktrees\n"
    fi
  fi
done

# ----- verdict ---------------------------------------------------------------
VERDICT="✅ clean"
if [[ "$DRY_RUN_EXIT" != "0" ]]; then
  VERDICT="❌ merge conflict surface"
elif [[ -n "$PKG_DRIFT" ]]; then
  VERDICT="⚠️ dep/config drift"
elif [[ "$SHARED_COUNT" -gt 0 ]]; then
  VERDICT="⚠️ shared file edits — review needed"
fi

# ----- write report ----------------------------------------------------------
{
  echo "# Integration status — $NOW"
  echo
  echo "**Verdict:** $VERDICT"
  echo
  echo "| Side | Branch | HEAD | Ahead of merge-base |"
  echo "|---|---|---|---|"
  echo "| Self  | \`$SELF_BRANCH\`  | \`$SELF_SHORT\`  | $SELF_AHEAD commits |"
  echo "| Other | \`$OTHER_BRANCH\` | \`$OTHER_SHORT\` | $OTHER_AHEAD commits |"
  echo
  echo "Merge-base: \`$MB_SHORT\`"
  echo
  echo "## Shared-file edits (touched on BOTH sides since merge-base)"
  if [[ "$SHARED_COUNT" -eq 0 ]]; then
    echo
    echo "_None — streams are file-disjoint so far._"
  else
    echo
    printf '%s\n' "$SHARED" | sed 's/^/- `/' | sed 's/$/`/'
  fi
  echo
  echo "## Dep/config drift"
  if [[ -z "$PKG_DRIFT" ]]; then
    echo
    echo "_None._"
  else
    echo
    printf '%b' "$PKG_DRIFT"
  fi
  echo
  echo "## Merge dry-run"
  if [[ "$SELF_HEAD" == "$OTHER_HEAD" ]]; then
    echo
    echo "ℹ️ Both worktrees at the same HEAD — merge is a no-op (degenerate)."
  elif [[ "$DRY_RUN_EXIT" == "0" ]]; then
    echo
    echo "✅ Three-way merge would apply cleanly (\`git merge-tree\` reports no conflicts)."
  else
    echo
    echo "❌ Conflicts surfaced:"
    echo
    echo '```'
    printf '%s\n' "$MERGE_CONFLICTS"
    echo '```'
  fi
  echo
  echo "## Recent commits — Self ($SELF_BRANCH)"
  echo
  echo '```'
  git log --oneline "$MB..$SELF_HEAD" 2>/dev/null | head -10
  echo '```'
  echo
  echo "## Recent commits — Other ($OTHER_BRANCH)"
  echo
  echo '```'
  git -C "$OTHER_WT" log --oneline "$MB..$OTHER_HEAD" 2>/dev/null | head -10
  echo '```'
  echo
  echo "---"
  echo "_Generated by \`scripts/check-integration.sh\`. Re-run any time; overwrites this file._"
} > "$OUT"

echo "[check-integration] $VERDICT — wrote $OUT" >&2

# Non-zero exit if the verdict isn't clean — useful for hooks/CI.
if [[ "$VERDICT" == ❌* ]]; then
  exit 2
elif [[ "$VERDICT" == ⚠️* ]]; then
  exit 1
fi
exit 0

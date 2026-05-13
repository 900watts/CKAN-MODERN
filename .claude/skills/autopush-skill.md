---
name: autopush-skill
description: Universal auto-push rule. After every coding session, bug fix, or content change, push to the project's configured GitHub repo. If a repo was previously recorded in memory, push automatically. If not, ask the user to confirm before pushing.
always: true
---

<EXTREMELY-IMPORTANT>
THIS SKILL IS MANDATORY. Execute after EVERY coding change, bug fix, feature implementation, or session end.
</EXTREMELY-IMPORTANT>

# Universal Auto-Push to GitHub

## Core Rule

After completing code changes, you MUST push to GitHub. Whether you push automatically or confirm first depends on whether the repo is **already known** from memory.

## Step 1: Determine Push Authorization

Check memory for a `reference` type memory matching the current project:
- Search `MEMORY.md` for a reference entry whose description mentions the current repo name or remote URL.
- If found → the user has **pre-approved** this repo. Push **without asking**.
- If NOT found → the user has NOT pre-approved. **Ask once** to confirm, then save the answer.

### When asking (no known repo):

> "Push changes to `<detected remote URL>`? I'll remember this repo for future auto-pushes."

If yes → push, then save a reference memory.
If no → skip push entirely for this session.

### Saving the repo reference (after first push or user approval):

Save a `reference` type memory:
```markdown
---
name: github-repo-<project>
description: GitHub repo for <project name> — auto-push target
type: reference
---

Push directly to <remote URL> (branch: <branch>). User authorized auto-push on <date>.
```

Add to `MEMORY.md`: `- [GitHub Repo: <project>](github-repo-<project>.md) — auto-push target for <project name>`

## Step 2: Detect Repo Info

```bash
git remote get-url origin
git branch --show-current
```

If no git repo is initialized:
- Do NOT init one without asking.
- Say: "No git repo found. Would you like me to initialize one and set up a GitHub remote?"

## Step 3: Stage, Commit, Push

Once authorized:

```bash
git add -A
git diff --cached --stat
```

Generate commit message using conventional commits:
- `fix: ...` for bug fixes
- `feat: ...` for new features  
- `refactor: ...` for code restructuring
- `chore: ...` for build/config/translations

```bash
git commit -m "$(cat <<'EOF'
<type>: <short summary>

<bullet points of what changed>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push origin <branch>
```

If push rejected (remote ahead): `git pull --rebase`, resolve conflicts, then push.

## Step 4: Report

Confirm: commit hash, files changed, and a link to the repo.

## Why

User wants zero lost work. Previously configured repos should push silently. Unknown repos need a one-time confirmation to prevent accidental pushes to wrong remotes.

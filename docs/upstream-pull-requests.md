# Upstream Pull Requests

Procedure for proposing changes from this fork to Splinterlands (`TheSPSDAO/SPS-Validator`).

Remotes:

- `origin`: `finlaysonstudio/spsdao-firehorse-validator` (this fork)
- `upstream`: `TheSPSDAO/SPS-Validator`

## 1. Branch from master

Sync `master` with upstream, then branch as `feat/{feature-description}-{hash}`, where `{hash}` is the first 8 characters of the upstream master commit the branch starts from.

```bash
git fetch upstream
git checkout master
git merge --ff-only upstream/master
git push origin master
HASH=$(git rev-parse --short=8 upstream/master)
git checkout -b "feat/snapshot-auto-option-$HASH"
```

## 2. Cherry-pick a single commit

Bring the change over from `sandbox` (or wherever it was developed) as one commit. Reduce it to a simplified semantic subject with no description body.

```bash
git cherry-pick --no-commit <sha> [<sha>...]
git commit -m "chore: config: skip snapshot prompt for automation"
git push -u origin HEAD
```

## 3. Propose a draft PR

```bash
gh pr create --draft \
  --repo TheSPSDAO/SPS-Validator \
  --base master \
  --head "finlaysonstudio:$(git branch --show-current)" \
  --title "{short declarative}" \
  --body-file body.md
```

Subject: `{short declarative}`

Body:

```
{one sentence pain point}. {one sentence cure}.

{one sentence change}. {one sentence how it fixes it}.
```

Example:

```
Currently you must answer an interactive prompt to create a snapshot. This prevents the process from being subject to automation.

This commit adds the `snapshot_auto` flag which creates a full snapshot without needing to answer a prompt. This allows the automation of snapshots.
```

## 4. Prune after merge

Once upstream merges the PR and `master` is synced, delete the feature branch. Upstream may rewrite the commit, so confirm the change is in `master` (`git cherry master <branch>`, or compare `git show` output) before deleting.

```bash
git push origin --delete "feat/snapshot-auto-option-$HASH"
```

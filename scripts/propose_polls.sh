#!/usr/bin/env bash
# Run only after validation and the full suite have passed against the candidate.
set -euo pipefail

candidate=${1:?Pass the validated candidate path}
body=${2:?Pass the pull request body path}
base=${3:?Pass the tested main commit}
branch=automation/polls-data
ref="refs/remotes/origin/$branch"
data_file=data/polls.json
bot_email='41898282+github-actions[bot]@users.noreply.github.com'

git fetch --no-tags origin main
test "$(git rev-parse origin/main)" = "$base" || {
  echo 'main advanced since validation; rerun to test against the new base.' >&2
  exit 1
}
git diff --quiet HEAD
pr=$(gh pr list --base main --head "$branch" --state open --limit 3 \
  --json url,author,isCrossRepository,headRefOid)
remote=$(git ls-remote --heads origin "refs/heads/$branch")
if [[ -n $remote ]]; then
  git fetch --no-tags origin "refs/heads/$branch:$ref"
  head=$(git rev-parse "$ref")
  fork=$(git merge-base "$base" "$head")
  # A human commit, other changed file, or foreign PR ends the run before edits.
  if ! git log --format='%ae%n%ce' "$base..$head" | awk -v bot="$bot_email" '$0 != bot { exit 1 }' ||
     [[ $(git diff --name-only "$fork" "$head" -- . ":(exclude)$data_file") ]] ||
     ! jq -e --arg head "$head" '
        length == 0 or (length == 1 and .[0].author.login == "app/github-actions" and .[0].author.is_bot
        and (.[0].isCrossRepository | not) and .[0].headRefOid == $head)
        ' <<< "$pr" >/dev/null; then
    echo 'The polling branch or PR has unexpected edits or ownership. Review it manually.' >&2
    exit 1
  fi
  if [[ $(jq 'length' <<< "$pr") == 1 ]]; then
    git show "$head:$data_file" > "$RUNNER_TEMP/pending-polls.json"
    changed=$(python3 - "$candidate" "$RUNNER_TEMP/pending-polls.json" <<'PYCODE'
import sys
sys.path.insert(0, "scripts")
from validate_polls import compare, read_json, validate

candidate, pending = [validate(read_json(path)) for path in sys.argv[1:]]
print(compare(candidate, pending)["changed"])
PYCODE
)
    # Keep the pending acquisition timestamp when the normalized contents match.
    if [[ $changed == False ]]; then
      jq -r '.[0].url' <<< "$pr"
      exit 0
    fi
  fi
else
  test "$(jq 'length' <<< "$pr")" = 0
fi

git config user.name 'github-actions[bot]'
git config user.email "$bot_email"
git switch --detach "$base"
if [[ -n $remote ]]; then
  # Start with the tested main tree and keep the previous bot head as an ancestor.
  git merge --no-ff -s ours -m 'Bring polling data branch up to date with main' "$head" >&2
fi
cp "$candidate" "$data_file"
git add -- "$data_file"

git commit -m 'Update national polling data' >&2
test "$(git diff --name-only "$base" HEAD)" = "$data_file"
# A standard fast-forward push is also a guard against concurrent human edits.
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' \
  push origin "HEAD:refs/heads/$branch" >&2
if [[ $(jq 'length' <<< "$pr") == 1 ]]; then
  url=$(jq -r '.[0].url' <<< "$pr")
  gh pr edit "$url" --body-file "$body" >&2
  echo "$url"
else
  gh pr create --base main --head "$branch" --title 'Update national polling data' --body-file "$body"
fi

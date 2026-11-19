#!/usr/bin/env bash
set -euo pipefail

# Host-agnostic updater for isabelle.ts.
#
# Optional environment variables:
#   ISABELLE_REMOTE       Git remote to pull from (default: origin)
#   ISABELLE_BRANCH       Git branch to track (default: master)
#   ISABELLE_RESTART_CMD  Shell command to restart the service after a successful update
#   ISABELLE_BACKUP_DIR   Directory where .env.json backups are written before updating

main() {
  local force="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force)
        force="true"
        shift
        ;;
      -h|--help)
        echo "Usage: $(basename "$0") [--force]"
        exit 0
        ;;
      *)
        echo "Usage: $(basename "$0") [--force]" >&2
        exit 2
        ;;
    esac
  done

  local script_dir repo_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_dir="$(cd "${script_dir}/.." && pwd)"
  cd "$repo_dir"

  local remote branch restart_cmd backup_dir
  remote="${ISABELLE_REMOTE:-origin}"
  branch="${ISABELLE_BRANCH:-master}"
  restart_cmd="${ISABELLE_RESTART_CMD:-}"
  backup_dir="${ISABELLE_BACKUP_DIR:-}"

  # Prevent concurrent runs (e.g., timer firing during a manual update).
  if command -v flock >/dev/null 2>&1; then
    local lock_file="${TMPDIR:-/tmp}/isabelle-update.lock"
    exec 9>"$lock_file"
    if ! flock -n 9; then
      echo "[update] Another update is already running; exiting."
      exit 0
    fi
  fi

  git fetch --quiet "$remote" "$branch"

  local old_sha new_sha
  old_sha="$(git rev-parse HEAD)"
  new_sha="$(git rev-parse "${remote}/${branch}")"

  if [[ "$old_sha" == "$new_sha" && "$force" != "true" ]]; then
    echo "[update] Already up to date at ${old_sha:0:7}."
    exit 0
  fi

  local lock_changed="false"
  local commands_changed="false"
  local changed_files=""

  if [[ "$old_sha" != "$new_sha" ]]; then
    changed_files="$(git diff --name-only "$old_sha" "$new_sha")"
  fi

  if [[ ! -d node_modules ]] || grep -qx 'package-lock.json' <<<"$changed_files"; then
    lock_changed="true"
  fi

  if [[ "$force" == "true" ]] || grep -q '^src/commands/' <<<"$changed_files"; then
    commands_changed="true"
  fi

  # Backup .env.json before pulling/building so runtime state is preserved.
  if [[ -n "$backup_dir" && -f .env.json ]]; then
    mkdir -p "$backup_dir"
    chmod 700 "$backup_dir"
    local backup_file
    backup_file="${backup_dir}/env.json.$(date +%Y%m%d-%H%M%S).bak"
    cp .env.json "$backup_file"
    chmod 600 "$backup_file"

    shopt -s nullglob
    local backups=("${backup_dir}"/env.json.*.bak)
    shopt -u nullglob
    local count="${#backups[@]}"
    if [[ "$count" -gt 10 ]]; then
      rm -f -- "${backups[@]:0:count-10}"
    fi
  fi

  rollback() {
    # Never run `git clean` here so git-ignored .env.json is never deleted.
    echo "[update] Update failed; rolling back to ${old_sha:0:7}..." >&2
    git reset --hard --quiet "$old_sha"
    if [[ "$lock_changed" == "true" ]]; then
      npm ci --no-audit --no-fund >/dev/null 2>&1 || true
    fi
    npm run clean >/dev/null 2>&1 || true
    npm run build >/dev/null 2>&1 || true
  }

  git pull --ff-only --quiet "$remote" "$branch"

  if [[ "$lock_changed" == "true" ]]; then
    if ! npm ci --no-audit --no-fund; then
      rollback
      exit 1
    fi
  fi

  if ! npm run clean; then
    rollback
    exit 1
  fi

  if ! npm test; then
    rollback
    exit 1
  fi

  if [[ "$commands_changed" == "true" ]]; then
    if [[ -f .env.json ]]; then
      if ! node dist/deploy-commands.js; then
        rollback
        exit 1
      fi
    else
      echo "[update] Skipping slash command deploy (.env.json not found)."
    fi
  fi

  if [[ -n "$restart_cmd" ]]; then
    echo "[update] Restarting service..."
    bash -c "$restart_cmd"
  fi

  echo "[update] Updated ${old_sha:0:7} -> ${new_sha:0:7}."
}

# Wrap execution in a block so bash buffers the script even if git pull modifies it.
{
  main "$@"
  exit
}

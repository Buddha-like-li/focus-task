#!/usr/bin/env bash
# bump-version.sh - synchronise the version field across the three files
# that ship a release version: tauri.conf.json (frontend build metadata),
# src-tauri/Cargo.toml (Rust crate version), and frontend/package.json
# (npm package version). Run before tagging a release.
#
# Usage:
#   bash scripts/bump-version.sh 2.1.0        # explicit version
#   bash scripts/bump-version.sh minor        # +0.1  (新需求/功能)
#   bash scripts/bump-version.sh patch        # +0.0.1 (bug 修复)
#   bash scripts/bump-version.sh major        # +1.0.0 (重大不兼容)
#
# Versioning convention (docs/releasing.md):
#   - 新需求 / 新功能  -> minor  递增   (2.0.5 -> 2.1.0)
#   - bug 修复         -> patch  递增   (2.1.0 -> 2.1.1)
#   - 重大不兼容变更    -> major  递增   (2.1.0 -> 3.0.0)
#
# Notes:
#   - Refuses to run on a dirty tree so we never silently rewrite staged
#     changes (the version edits would be hidden in a larger diff).
#   - Does NOT push or commit. The release script handles that.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <new-version | patch | minor | major>" >&2
  echo "  e.g. $0 2.1.0    $0 minor    $0 patch" >&2
  exit 64
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAURI_CONF="$ROOT/frontend/src-tauri/tauri.conf.json"
CARGO_TOML="$ROOT/frontend/src-tauri/Cargo.toml"
PKG_JSON="$ROOT/frontend/package.json"

# Read the current version from tauri.conf.json (the canonical source).
current_version=$(grep -oE '"version"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?"' "$TAURI_CONF" | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?')
if [ -z "$current_version" ]; then
  echo "error: could not read current version from $TAURI_CONF" >&2
  exit 67
fi

arg="$1"
case "$arg" in
  patch|minor|major)
    IFS='.' read -r major minor patch <<<"${current_version%-*}"
    case "$arg" in
      major) major=$((major + 1)); minor=0; patch=0 ;;
      minor) minor=$((minor + 1)); patch=0 ;;
      patch) patch=$((patch + 1)) ;;
    esac
    NEW_VERSION="${major}.${minor}.${patch}"
    ;;
  *)
    NEW_VERSION="$arg"
    if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.]+)?$ ]]; then
      echo "error: '$NEW_VERSION' is not a semver-looking version (e.g. 2.1.0) or a keyword (patch|minor|major)" >&2
      exit 65
    fi
    ;;
esac

# Refuse to operate on a dirty working tree so the version bump is
# reviewable on its own. CI typically tags from a clean checkout, so this
# is purely a developer-experience guardrail.
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "error: working tree is dirty; commit or stash changes first." >&2
  exit 66
fi

echo "-> Bumping version: $current_version -> $NEW_VERSION"
echo "    - $TAURI_CONF"
echo "    - $CARGO_TOML"
echo "    - $PKG_JSON"

# tauri.conf.json: "version": "x.y.z"
sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[0-9]+\.[0-9]+\.[0-9]+([^\"]*\")/\1$NEW_VERSION\2/" "$TAURI_CONF"
# Cargo.toml: version = "x.y.z" (top-level [package] block)
sed -i.bak -E "s/^(version[[:space:]]*=[[:space:]]*\")[0-9]+\.[0-9]+\.[0-9]+([^\"]*\")/\1$NEW_VERSION\2/" "$CARGO_TOML"
# package.json: "version": "x.y.z"
sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[0-9]+\.[0-9]+\.[0-9]+([^\"]*\")/\1$NEW_VERSION\2/" "$PKG_JSON"

rm -f "$TAURI_CONF.bak" "$CARGO_TOML.bak" "$PKG_JSON.bak"

echo
echo "Done. Verify with:"
echo "  grep '\"version\"' $TAURI_CONF | head -1"
echo "  grep '^version' $CARGO_TOML | head -1"
echo "  grep '\"version\"' $PKG_JSON | head -1"
echo
echo "Next steps:"
echo "  git commit -am \"release v$NEW_VERSION\""
echo "  git tag v$NEW_VERSION && git push origin v$NEW_VERSION"
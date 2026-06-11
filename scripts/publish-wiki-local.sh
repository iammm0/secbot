#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${GITHUB_REPOSITORY:-iammm0/secbot}"
TOKEN="$(gh auth token 2>/dev/null || true)"

if [[ -z "$TOKEN" ]]; then
  echo "请先 gh auth login" >&2
  exit 1
fi

WIKI_URL="https://x-access-token:${TOKEN}@github.com/${REPO}.wiki.git"

if ! git ls-remote "$WIKI_URL" HEAD >/dev/null 2>&1; then
  cat >&2 <<EOF
GitHub Wiki 尚未初始化。

请先在浏览器打开并保存第一页：
  https://github.com/${REPO}/wiki/_new

标题建议：Home
保存后重新运行：./scripts/publish-wiki-local.sh
EOF
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

git -C "$workdir" init -q
git -C "$workdir" config user.name "${GIT_AUTHOR_NAME:-Mingjun Zhao}"
git -C "$workdir" config user.email "${GIT_AUTHOR_EMAIL:-145631324+iammm0@users.noreply.github.com}"
cp -R "$ROOT/docs/wiki/." "$workdir/"
# 不同步 wiki 维护说明到 GitHub Wiki 正文
rm -f "$workdir/README.md"
git -C "$workdir" add -A
git -C "$workdir" commit -q -m "docs: sync wiki from docs/wiki"
git -C "$workdir" push -f "$WIKI_URL" HEAD:master

echo "Wiki published: https://github.com/${REPO}/wiki"

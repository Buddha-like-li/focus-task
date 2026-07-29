#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "用法：$0 <发布说明文件>" >&2
  exit 2
fi

notes_file="$1"

if [ ! -f "$notes_file" ]; then
  echo "::error::发布说明文件不存在：$notes_file" >&2
  exit 1
fi

if ! grep -q '[^[:space:]]' "$notes_file"; then
  echo "::error::发布说明不能为空：$notes_file" >&2
  exit 1
fi

if LC_ALL=C grep -n '[A-Za-z]' "$notes_file"; then
  echo "::error::发布说明必须使用中文用户文案，不能包含英文字母：$notes_file" >&2
  exit 1
fi

echo "已通过中文发布说明校验：$notes_file"

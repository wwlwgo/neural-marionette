#!/bin/zsh
set -eu
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo '需要 Node.js 22.12 或更高版本。安装后重新运行。'
  read '?按回车关闭…'
  exit 1
fi
if [[ ! -d node_modules || ! -f public/models/hand_landmarker.task ]]; then
  echo '缺少依赖或模型。请根据 docs/setup.md 运行 npm ci 与 npm run assets。'
  read '?按回车关闭…'
  exit 1
fi
node scripts/launch.mjs

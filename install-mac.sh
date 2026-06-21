#!/usr/bin/env bash
# MARCY — macOS 開發安裝（符號連結 + PlayerDebugMode）
set -e

SRC="$(cd "$(dirname "$0")" && pwd)"
EXT_ID="com.marcy.aetools"
DEST_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$DEST_DIR/$EXT_ID"

echo "==> 開啟 PlayerDebugMode (CSXS 9~12)"
for v in 9 10 11 12; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 || true
done

echo "==> 建立擴充功能連結"
mkdir -p "$DEST_DIR"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
  echo "    已存在，先移除：$DEST"
  rm -rf "$DEST"
fi
ln -s "$SRC" "$DEST"

echo ""
echo "完成！"
echo "  來源：$SRC"
echo "  連結：$DEST"
echo ""
echo "請重新啟動 After Effects，然後開啟："
echo "  Window ▸ Extensions ▸ MARCY"

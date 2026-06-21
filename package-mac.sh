#!/usr/bin/env bash
# MARCY — 打包成自簽章 .zxp (macOS)
# 需求：上層專案的 tools/ZXPSignCmd (Adobe 官方簽章工具) 與憑證
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SIGN="$ROOT/tools/ZXPSignCmd"
CERT="$ROOT/tools/bencode-cert.p12"
PASS="bencode"
STAGE="$HERE/dist/staging"
OUT="$HERE/dist/MARCY.zxp"

if [ ! -x "$SIGN" ]; then
  echo "找不到 $SIGN，請先下載 ZXPSignCmd。"; exit 1
fi

echo "==> 準備乾淨的打包內容 (僅 CSXS/client/host)"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$HERE/CSXS" "$STAGE/"
cp -R "$HERE/client" "$STAGE/"
cp -R "$HERE/host" "$STAGE/"
find "$STAGE" -name '.DS_Store' -delete 2>/dev/null || true

echo "==> 產生自簽章憑證 (如不存在)"
if [ ! -f "$CERT" ]; then
  "$SIGN" -selfSignedCert TW Taiwan "MARCY" "MARCY Dev" "$PASS" "$CERT"
fi

echo "==> 簽章打包"
rm -f "$OUT"
"$SIGN" -sign "$STAGE" "$OUT" "$CERT" "$PASS"

echo ""
echo "完成：$OUT"
ls -la "$OUT"

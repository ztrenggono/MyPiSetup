#!/usr/bin/env bash
set -euo pipefail

PI_EXT_DIR="${HOME}/.pi/agent/extensions"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=============================="
echo " Senior Engineer Pi Setup"
echo " by ztrenggono"
echo "=============================="
echo ""

mkdir -p "$PI_EXT_DIR"

echo "[1/5] Backing up existing extensions..."
if ls "$PI_EXT_DIR"/*.ts >/dev/null 2>&1; then
  BAK_DIR="${PI_EXT_DIR}/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BAK_DIR"
  cp "$PI_EXT_DIR"/*.ts "$BAK_DIR/"
  echo "      Backup saved to: $BAK_DIR"
else
  echo "      No existing extensions to backup."
fi

echo "[2/5] Copying extensions to ${PI_EXT_DIR}..."
cp "$SRC_DIR"/extensions/*.ts "$PI_EXT_DIR/"
echo "      Copied $(ls "$SRC_DIR"/extensions/*.ts | wc -l | tr -d ' ') extension files."

echo "[3/5] Verifying extensions..."
MISSING=0
for f in "$SRC_DIR"/extensions/*.ts; do
  base=$(basename "$f")
  if [ ! -f "$PI_EXT_DIR/$base" ]; then
    echo "      MISSING: $base" >&2
    MISSING=$((MISSING + 1))
  fi
done
if [ "$MISSING" -eq 0 ]; then
  echo "      All extensions verified."
fi

echo "[4/5] Setting permissions..."
chmod 644 "$PI_EXT_DIR"/*.ts

echo "[5/5] Done!"
echo ""
echo "=============================="
echo " Next Steps"
echo "=============================="
echo ""
echo "  1. Restart Pi AI agent (if running)."
echo ""
echo "  2. Open Pi in your project directory and run:"
echo "       /init"
echo "     This generates AGENTS.md with senior engineering rules."
echo ""
echo "  3. Start a workflow:"
echo "       /workflow teach"
echo ""
echo "=============================="
echo " Installed Extensions"
echo "=============================="
for f in "$SRC_DIR"/extensions/*.ts; do
  base=$(basename "$f" .ts)
  echo "  • $base"
done
echo ""
echo "Need guides? Open: $SRC_DIR/guides/"
echo ""

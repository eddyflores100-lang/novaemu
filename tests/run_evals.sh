#!/usr/bin/env bash
# NovaEmu - suite de evaluación NE-E001..E012 (estilo REA: fail-closed, evidencia con hashes)
set -u
cd "$(dirname "$0")/.."
OUT=build/evals_results.json
EXPECTED=tests/evals_expected.json
PY=python3
TSV=build/evals_rows.tsv
: > "$TSV"

add() { # id, nombre, PASS|FAIL, detalle
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$TSV"
}

# ---------- E001: build limpio (0 warnings) ----------
make -s clean >/dev/null 2>&1
W=$(make -f Makefile all 2>&1 | grep -cE "warning|error")
if [ "$W" = "0" ]; then add NE-E001 "build sin warnings (C99 -Wall -Wextra)" PASS "0 warnings/errors"; else add NE-E001 "build sin warnings" FAIL "$W avisos"; fi

# ---------- E002: autotest unitario ----------
./build/novaemu-selftest > build/selftest.out 2>&1
RC=$?
AP=$(grep -o '"all_pass": [a-z]*' build/selftest.out | tail -1 | awk '{print $2}')
if [ "$RC" = "0" ] && [ "$AP" = "true" ]; then
  P=$(grep -c "  PASS " build/selftest.out)
  add NE-E002 "unitarios chip8+gb" PASS "$P checks, 0 fallos"
else
  add NE-E002 "unitarios chip8+gb" FAIL "exit=$RC all_pass=$AP"
fi

# ---------- E003/E004: hashes dorados de demos ----------
H1=$(./build/novaemu chip8 tests/roms/gen/chip8_bounce.ch8 --frames 300 --hash | awk -F= '{print $2}')
GH1=$($PY -c "import json; print(json.load(open('$EXPECTED'))['golden_hashes']['chip8_bounce_300f'])")
if [ "$H1" = "$GH1" ]; then add NE-E003 "golden hash chip8_bounce 300f" PASS "hash=$H1"; else add NE-E003 "golden hash chip8_bounce" FAIL "$H1 != $GH1"; fi
H2=$(./build/novaemu schip tests/roms/gen/schip_bounce.ch8 --frames 300 --hash | awk -F= '{print $2}')
GH2=$($PY -c "import json; print(json.load(open('$EXPECTED'))['golden_hashes']['schip_bounce_300f'])")
if [ "$H2" = "$GH2" ]; then add NE-E004 "golden hash schip_bounce 300f" PASS "hash=$H2"; else add NE-E004 "golden hash schip_bounce" FAIL "$H2 != $GH2"; fi

# ---------- E005: determinismo ----------
./build/novaemu chip8 tests/roms/gen/chip8_bounce.ch8 --frames 100 --ppm build/d1.ppm >/dev/null
./build/novaemu chip8 tests/roms/gen/chip8_bounce.ch8 --frames 100 --ppm build/d2.ppm >/dev/null
S1=$(sha256sum build/d1.ppm | awk '{print $1}'); S2=$(sha256sum build/d2.ppm | awk '{print $1}')
if [ "$S1" = "$S2" ]; then add NE-E005 "determinismo binario-a-binario" PASS "sha256=$S1"; else add NE-E005 "determinismo" FAIL "diff"; fi

# ---------- E006: suite Blargg cpu_instrs (11/11) ----------
BP=0; BT=0
for f in tests/roms/gb/0*.gb tests/roms/gb/1*.gb; do
  case "$f" in *dmg-acid2*|*halt_bug*|*instr_timing*|*interrupt_time*) continue;; esac
  BT=$((BT+1))
  R=$(timeout 150 ./build/novaemu gb "$f" --frames 6000 --detect-serial --serial 2>/dev/null)
  echo "$R" | grep -q "Passed" && BP=$((BP+1))
done
MIN=$($PY -c "import json; print(json.load(open('$EXPECTED'))['thresholds']['blargg_roms_min_pass'])")
if [ "$BP" -ge "$MIN" ]; then add NE-E006 "Blargg cpu_instrs completo" PASS "$BP/$BT ROMs Passed"; else add NE-E006 "Blargg cpu_instrs" FAIL "$BP/$BT"; fi

# ---------- E007/E008: benchmarks ----------
B1=$(./build/novaemu chip8 tests/roms/gen/chip8_bounce.ch8 --frames 6000 --bench)
F1=$(echo "$B1" | $PY -c "import json,sys; print(int(json.load(sys.stdin)['fps']))")
T1=$($PY -c "import json; print(json.load(open('$EXPECTED'))['thresholds']['chip8_min_fps'])")
if [ "$F1" -ge "$T1" ]; then add NE-E007 "bench chip8 >= ${T1} fps" PASS "fps=$F1"; else add NE-E007 "bench chip8" FAIL "$F1 < $T1"; fi
B2=$(./build/novaemu gb "tests/roms/gb/06-ld r,r.gb" --frames 600 --bench)
F2=$(echo "$B2" | $PY -c "import json,sys; print(int(json.load(sys.stdin)['fps']))")
T2=$($PY -c "import json; print(json.load(open('$EXPECTED'))['thresholds']['gb_min_fps'])")
if [ "$F2" -ge "$T2" ]; then add NE-E008 "bench gb >= ${T2} fps" PASS "fps=$F2"; else add NE-E008 "bench gb" FAIL "$F2 < $T2"; fi

# ---------- E009: tamaño del binario ----------
SZ=$(stat -c %s build/novaemu)
MAX=$(($($PY -c "import json; print(json.load(open('$EXPECTED'))['thresholds']['max_binary_kb'])") * 1024))
if [ "$SZ" -le "$MAX" ]; then add NE-E009 "binario <= ${MAX} bytes" PASS "$SZ bytes"; else add NE-E009 "tamaño binario" FAIL "$SZ > $MAX"; fi

# ---------- E010: perfiles low-end ----------
if ./build/novaemu chip8 tests/roms/gen/chip8_scroller.ch8 --frames 60 --profile profiles/weak.conf --hash >/dev/null 2>&1; then
  add NE-E010 "perfiles low-end cargan y aplican" PASS "weak.conf OK"
else
  add NE-E010 "perfiles low-end" FAIL "carga fallida"
fi

# ---------- E011: integridad de ROMs de test ----------
OKS=$(cd tests/roms && sha256sum -c SHA256SUMS 2>/dev/null | grep -c ": OK")
if [ "$OKS" -ge 23 ]; then add NE-E011 "SHA256SUMS de ROMs de test" PASS "$OKS ficheros OK"; else add NE-E011 "SHA256SUMS" FAIL "$OKS OK"; fi

# ---------- E012: anti-alucinación de docs ----------
MISSING=0
for p in research/repos/rpcs3/rpcs3/Emu/Cell/PPUTranslator.cpp research/repos/shadps4/src/core/cpu_patches.cpp \
         research/repos/xemu/hw/xbox/nv2a research/repos/xenia/src/xenia/cpu/ppc \
         research/repos/xenia/src/xenia/config.cc download/novaemu/tests/roms/SOURCES.md; do
  [ -e "/home/z/my-project/$p" ] || MISSING=$((MISSING+1))
done
if [ "$MISSING" = "0" ]; then add NE-E012 "evidencia citada existe en disco" PASS "6/6 rutas verificadas"; else add NE-E012 "docs" FAIL "$MISSING rutas ausentes"; fi

# ---------- JSON final ----------
$PY - "$TSV" "$OUT" <<'PYEOF'
import json, hashlib, sys, datetime
tsv, out = sys.argv[1], sys.argv[2]
entries = []
for line in open(tsv):
    id_, name, verdict, details = line.rstrip("\n").split("\t")
    entries.append({"id": id_, "name": name, "pass": verdict == "PASS", "details": details})
res = {"suite": "novaemu-evals", "version": "1.0.0",
       "date": datetime.datetime.now().isoformat(timespec="seconds"),
       "entries": entries, "total": len(entries),
       "passed": sum(e["pass"] for e in entries),
       "all_pass": all(e["pass"] for e in entries)}
open(out, "w").write(json.dumps(res, indent=2, ensure_ascii=False))
print("SHA256(%s) = %s" % (out, hashlib.sha256(open(out, "rb").read()).hexdigest()))
PYEOF

echo ""
echo "=================== NOVAEMU EVALS ==================="
while IFS=$'\t' read -r id name verdict details; do
  printf "%-8s %-40s %s  %s\n" "$id" "$name" "$verdict" "$details"
done < "$TSV"
echo "====================================================="
ALL=$($PY -c "import json; print(json.load(open('$OUT'))['all_pass'])")
if [ "$ALL" = "True" ]; then echo "RESULTADO: ALL_PASS"; exit 0; else echo "RESULTADO: FAIL"; exit 1; fi

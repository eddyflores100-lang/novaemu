#!/usr/bin/env python3
"""c8asm — ensamblador CHIP-8 de 2 pasadas para los juegos de NovaEmu.

Sintaxis soportada:
  ; comentario
  .org 0x200            (solo al inicio; fijo 0x200)
  .equ NAME, expr       constante
  label:                etiqueta
  .db 0x80, 'A', %1010  bytes literales
  .dw 0x1234            words big-endian
  Instrucciones: CLS RET DRW JP CALL SE SNE LD ADD SUB SUBN AND OR XOR
                 RND SKP SKNP SHR SHL (evitados por diseño), HIGH/LOW no.

  Registros V0..VF. Números hex 0x.., dec, '%1010' binario, 'c' carácter.
  Expresiones simples: label, label+1, label-1, número.

Uso: python3 c8asm.py entrada.s8 -o salida.ch8 [--listing list.txt]
"""
import re
import sys

class AsmError(Exception):
    pass

NUM = re.compile(r"^0[xX][0-9a-fA-F]+$|^[0-9]+$|^%[01]+$|^'[0-9a-zA-Z]'$")
LABEL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]*$")

class Asm:
    def __init__(self):
        self.labels = {}
        self.equs = {}
        self.items = []   # (lineno, addr, kind, payload, raw)
        self.addr = 0x200
        self.errors = []

    # ---------------- helpers ----------------
    def eval(self, expr, lineno, raw):
        expr = expr.strip()
        # label+N / label-N
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_.]*)\s*([+-])\s*(\d+|0[xX][0-9a-fA-F]+)$", expr)
        if m and m.group(1) in self.labels:
            base = self.labels[m.group(1)]
            off = int(m.group(3), 0)
            return base + off if m.group(2) == "+" else base - off
        if expr in self.labels:
            return self.labels[expr]
        if expr in self.equs:
            if self.equs[expr] is None:
                raise AsmError(f"línea {lineno}: .equ '{expr}' sin resolver")
            return self.equs[expr]
        if NUM.match(expr):
            if expr.startswith("%"):
                return int(expr[1:], 2)
            if expr.startswith("'"):
                return ord(expr[1])
            return int(expr, 0)
        raise AsmError(f"línea {lineno}: símbolo no definido '{expr}'  ({raw})")

    def reg(self, tok, lineno, raw):
        tok = tok.strip().upper()
        m = re.match(r"^V([0-9A-F])$", tok)
        if not m:
            raise AsmError(f"línea {lineno}: registro inválido '{tok}'  ({raw})")
        return int(m.group(1), 16)

    def val8(self, tok, lineno, raw):
        v = self.eval(tok, lineno, raw)
        if not (0 <= v <= 0xFF):
            raise AsmError(f"línea {lineno}: byte fuera de rango {v}  ({raw})")
        return v

    def val12(self, tok, lineno, raw):
        v = self.eval(tok, lineno, raw)
        if not (0 <= v <= 0xFFF):
            raise AsmError(f"línea {lineno}: dirección fuera de rango {hex(v)}  ({raw})")
        return v

    def nib(self, tok, lineno, raw):
        v = self.eval(tok, lineno, raw)
        if not (0 <= v <= 0xF):
            raise AsmError(f"línea {lineno}: nibble fuera de rango {v}  ({raw})")
        return v

    # ---------------- pasada 1: parse ----------------
    def parse(self, src):
        for lineno, rawline in enumerate(src.splitlines(), 1):
            line = rawline
            for cch in (";", "#"):
                idx = self._find_comment(line, cch)
                if idx is not None:
                    line = line[:idx]
            line = line.strip()
            if not line:
                continue
            # etiquetas (posibles varias: a: b: inst)
            while True:
                m = re.match(r"^([A-Za-z_][A-Za-z0-9_.]*):\s*(.*)$", line)
                if not m:
                    break
                self._deflabel(m.group(1), lineno, rawline)
                line = m.group(2).strip()
            if not line:
                continue
            # directivas
            if line.lower().startswith(".equ"):
                mm = re.match(r"^\.equ\s+([A-Za-z_][A-Za-z0-9_.]*)\s*,\s*(.+)$", line, re.I)
                if not mm:
                    raise AsmError(f"línea {lineno}: .equ mal formado  ({rawline})")
                # primera pasada: si es numérico puro se fija ya
                try:
                    self.equs[mm.group(1)] = self.eval(mm.group(2), lineno, rawline)
                except AsmError:
                    self.equs[mm.group(1)] = None  # resolver en pasada 2
                self.items.append((lineno, None, "equ", (mm.group(1), mm.group(2)), rawline))
                continue
            low = line.lower()
            if low.startswith(".org"):
                continue  # fijo 0x200
            if low.startswith(".db"):
                args = self._splitargs(line[3:])
                self.items.append((lineno, self.addr, "db", args, rawline))
                self.addr += len(args)
                continue
            if low.startswith(".dw"):
                args = self._splitargs(line[3:])
                if len(args) % 2 != 0:
                    raise AsmError(f"línea {lineno}: .dw necesita pares de bytes  ({rawline})")
                self.items.append((lineno, self.addr, "dw", args, rawline))
                self.addr += len(args)
                continue
            if low.startswith(".align"):
                args = self._splitargs(line[6:])
                a = int(args[0], 0)
                while self.addr % a:
                    self.addr += 1
                continue
            # instrucción
            m = re.match(r"^([A-Za-z]+)\s*(.*)$", line)
            if not m:
                raise AsmError(f"línea {lineno}: no se entiende  ({rawline})")
            mnem = m.group(1).upper()
            args = self._splitargs(m.group(2)) if m.group(2).strip() else []
            size = self._inst_size(mnem, args, lineno, rawline)
            self.items.append((lineno, self.addr, "inst", (mnem, args), rawline))
            self.addr += size
        if self.addr - 0x200 > 0xE00:
            raise AsmError(f"ROM demasiado grande: {self.addr-0x200} bytes (máx 3584)")

    @staticmethod
    def _find_comment(line, ch):
        in_q = False
        for i, c in enumerate(line):
            if c == "'" :
                in_q = not in_q
            elif c == ch and not in_q:
                return i
        return None

    @staticmethod
    def _splitargs(s):
        out, cur, in_q = [], "", False
        for c in s:
            if c == "'":
                in_q = not in_q
                cur += c
            elif c == "," and not in_q:
                out.append(cur.strip()); cur = ""
            else:
                cur += c
        if cur.strip():
            out.append(cur.strip())
        return out

    def _deflabel(self, name, lineno, raw):
        if name in self.labels:
            raise AsmError(f"línea {lineno}: etiqueta duplicada '{name}'  ({raw})")
        self.labels[name] = self.addr

    def _inst_size(self, mn, args, lineno, raw):
        n = len(args)
        if mn in ("CLS", "RET") and n == 0: return 2
        if mn in ("JP", "CALL") and n == 1: return 2
        if mn == "JP" and n == 2: return 2
        if mn == "SE" or mn == "SNE":
            if n == 2: return 2
        if mn == "LD":
            if n == 2: return 2
        if mn in ("ADD", "SUB", "SUBN", "AND", "OR", "XOR", "RND") and n == 2: return 2
        if mn in ("SHR", "SHL") and n in (1, 2): return 2
        if mn in ("SKP", "SKNP") and n == 1: return 2
        if mn == "DRW" and n == 3: return 2
        if mn in ("SCU", "SCD") and n == 1: return 2
        if mn in ("HIGH", "LOW") and n == 0: return 2
        raise AsmError(f"línea {lineno}: {mn} con {n} operandos no soportado  ({raw})")

    # ---------------- pasada 2: encode ----------------
    def encode(self):
        # resolver .equ diferidos
        for (lineno, _a, kind, payload, raw) in self.items:
            if kind == "equ":
                name, expr = payload
                if self.equs.get(name) is None:
                    self.equs[name] = self.eval(expr, lineno, raw)
        out = bytearray()
        for (lineno, addr, kind, payload, raw) in self.items:
            if kind in ("equ",):
                continue
            if kind == "db":
                for a in payload:
                    out.append(self.val8(a, lineno, raw))
                continue
            if kind == "dw":
                for i in range(0, len(payload), 2):
                    hi = self.val8(payload[i], lineno, raw)
                    lo = self.val8(payload[i + 1], lineno, raw)
                    out += bytes((hi, lo))
                continue
            mn, args = payload
            op = self._enc(mn, args, lineno, raw)
            out += bytes(((op >> 8) & 0xFF, op & 0xFF))
        return bytes(out)

    def _enc(self, mn, args, lineno, raw):
        n = len(args)
        if mn == "CLS" and n == 0: return 0x00E0
        if mn == "RET" and n == 0: return 0x00EE
        if mn == "JP":
            if n == 1: return 0x1000 | self.val12(args[0], lineno, raw)
            if n == 2 and args[0].upper() == "V0":
                return 0xB000 | self.val12(args[1], lineno, raw)
        if mn == "CALL" and n == 1: return 0x2000 | self.val12(args[0], lineno, raw)
        if mn in ("SE", "SNE"):
            x = self.reg(args[0], lineno, raw)
            try:
                y = self.reg(args[1], lineno, raw)
            except AsmError:
                kk = self.val8(args[1], lineno, raw)
                base = 0x3000 if mn == "SE" else 0x4000
                return base | (x << 8) | kk
            return (0x5000 if mn == "SE" else 0x9000) | (x << 8) | (y << 4)
        if mn == "LD":
            dst, src = args[0], args[1]
            du, su = dst.upper(), src.upper()
            # --- destino Vx ---
            if du.startswith("V") and len(du) == 2:
                if su.startswith("[I]"):
                    return 0xF000 | (self.reg(dst, lineno, raw) << 8) | 0x65
                if su == "K":
                    return 0xF000 | (self.reg(dst, lineno, raw) << 8) | 0x0A
                if su == "DT":
                    return 0xF000 | (self.reg(dst, lineno, raw) << 8) | 0x07
                if su.startswith("V") and len(su) == 2:
                    return 0x8000 | (self.reg(dst, lineno, raw) << 8) | (self.reg(src, lineno, raw) << 4)
                return 0x6000 | (self.reg(dst, lineno, raw) << 8) | self.val8(src, lineno, raw)
            # --- destinos especiales ---
            if du == "I" and not su.startswith("V"):
                return 0xA000 | self.val12(src, lineno, raw)
            if du == "DT" and su.startswith("V"):
                return 0xF000 | (self.reg(src, lineno, raw) << 8) | 0x15
            if du == "ST" and su.startswith("V"):
                return 0xF000 | (self.reg(src, lineno, raw) << 8) | 0x18
            if du == "F" and su.startswith("V"):
                return 0xF000 | (self.reg(src, lineno, raw) << 8) | 0x29
            if du == "B" and su.startswith("V"):
                return 0xF000 | (self.reg(src, lineno, raw) << 8) | 0x33
            if du.startswith("[I]") and su.startswith("V"):
                return 0xF000 | (self.reg(src, lineno, raw) << 8) | 0x55
        if mn in ("ADD", "SUB", "SUBN", "AND", "OR", "XOR"):
            if mn == "ADD" and args[0].upper() == "I" and args[1].upper().startswith("V"):
                return 0xF000 | (self.reg(args[1], lineno, raw) << 8) | 0x1E
            x = self.reg(args[0], lineno, raw)
            try:
                y = self.reg(args[1], lineno, raw)
            except AsmError:
                if mn == "ADD":
                    return 0x7000 | (x << 8) | self.val8(args[1], lineno, raw)
                raise
            sub = {"ADD": 0x4, "SUB": 0x5, "SUBN": 0x7, "AND": 0x2, "OR": 0x1, "XOR": 0x3}[mn]
            return 0x8000 | (x << 8) | (y << 4) | sub
        if mn == "RND":
            return 0xC000 | (self.reg(args[0], lineno, raw) << 8) | self.val8(args[1], lineno, raw)
        if mn in ("SKP", "SKNP"):
            x = self.reg(args[0], lineno, raw)
            return (0xE000 | (x << 8)) | (0x9E if mn == "SKP" else 0xA1)
        if mn == "DRW":
            x = self.reg(args[0], lineno, raw)
            y = self.reg(args[1], lineno, raw)
            return 0xD000 | (x << 8) | (y << 4) | self.nib(args[2], lineno, raw)
        raise AsmError(f"línea {lineno}: no se puede codificar {mn}  ({raw})")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    inp = args[0]
    outp, listing = None, None
    i = 1
    while i < len(args):
        if args[i] == "-o":
            outp = args[i + 1]; i += 2
        elif args[i] == "--listing":
            listing = args[i + 1]; i += 2
        else:
            i += 1
    src = open(inp, encoding="utf-8").read()
    a = Asm()
    try:
        a.parse(src)
        rom = a.encode()
    except AsmError as e:
        print(f"c8asm: ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    if outp:
        with open(outp, "wb") as f:
            f.write(rom)
        print(f"c8asm: {inp} -> {outp} ({len(rom)} bytes, {len(a.labels)} etiquetas)")
    if listing:
        with open(listing, "w", encoding="utf-8") as f:
            for name, v in sorted(a.labels.items()):
                f.write(f"{name:24s} = 0x{v:03X}\n")
    if not outp:
        sys.stdout.buffer.write(rom)

if __name__ == "__main__":
    main()

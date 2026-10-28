# NovaEmu v1.0 — build portable (C99, sin dependencias)
CC      ?= cc
BASE    = -std=c99 -Wall -Wextra -Wno-unused-parameter
OPT     ?= -O2
CFLAGS  ?= $(BASE) $(OPT)

SRC_COMMON = src/common/nova.c
SRC_CHIP8  = src/chip8/chip8.c
SRC_GB     = src/gb/gb_bus.c src/gb/gb_ppu.c src/gb/gb_cpu.c
SRC_HOST   = src/host/main.c
SRC_TESTS  = src/tests/selftest_main.c src/tests/test_chip8.c src/tests/test_gb.c

all: build/novaemu build/novaemu-selftest build/genrom

build/novaemu: $(SRC_COMMON) $(SRC_CHIP8) $(SRC_GB) $(SRC_HOST) src/common/nova.h src/chip8/chip8.h src/gb/gb.h
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $(SRC_COMMON) $(SRC_CHIP8) $(SRC_GB) $(SRC_HOST)

build/novaemu-selftest: $(SRC_COMMON) $(SRC_CHIP8) $(SRC_GB) $(SRC_TESTS)
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $(SRC_COMMON) $(SRC_CHIP8) $(SRC_GB) $(SRC_TESTS)

build/genrom: tools/genrom.c
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ tools/genrom.c

# variante ultra-comprimida para PCs viejas (-Os + LTO + strip)
small: CFLAGS = $(BASE) -Os -flto
small: all
	@mv build/novaemu build/novaemu-os
	@mv build/novaemu-selftest build/novaemu-selftest-os
	@mv build/novaemu-os build/novaemu-os || true
	strip build/novaemu-os build/genrom 2>/dev/null || true

demos: build/genrom
	@mkdir -p tests/roms/gen
	./build/genrom tests/roms/gen

test: all demos
	bash tests/run_evals.sh

# Juegos NOVA: ensamblar (requiere python3) + certificar input nativo
games:
	python3 ../scripts/c8asm.py ../scripts/games/nova_pong.s8 -o tests/roms/gen/nova_pong.ch8
	python3 ../scripts/c8asm.py ../scripts/games/nova_snake.s8 -o tests/roms/gen/nova_snake.ch8
	python3 ../scripts/c8asm.py ../scripts/games/nova_catch.s8 -o tests/roms/gen/nova_catch.ch8
	cp tests/roms/gen/nova_pong.ch8 tests/roms/gen/nova_snake.ch8 tests/roms/gen/nova_catch.ch8 docs/assets/roms/

games-test: build/games-test
	./build/games-test

build/games-test: tests/test_games_input.c src/common/nova.c src/chip8/chip8.c src/gb/gb_bus.c src/gb/gb_ppu.c src/gb/gb_cpu.c
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ tests/test_games_input.c src/common/nova.c src/chip8/chip8.c src/gb/gb_bus.c src/gb/gb_ppu.c src/gb/gb_cpu.c

# test de entrada del juego jugable nova_paddle (6 checks de teclado y límites)
paddle-test: build/genrom
	$(CC) $(CFLAGS) -o build/paddle-test tests/test_paddle_input.c $(SRC_COMMON) $(SRC_CHIP8)
	./build/genrom tests/roms/gen
	./build/paddle-test

clean:
	rm -rf build

.PHONY: all small demos test paddle-test clean

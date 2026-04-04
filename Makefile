.PHONY: help install build clean test dev pack

help:
	@echo "Secbot TypeScript commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make install  - install npm dependencies"
	@echo "  make build    - compile TypeScript backend"
	@echo "  make clean    - remove build output"
	@echo "  make dev      - run backend in watch mode"
	@echo "  make test     - reserved for future TS tests"
	@echo "  make pack     - build and create npm tarball"

install:
	npm install

build:
	npm run build

clean:
	npm run clean

dev:
	npm run dev

test:
	@echo "No automated TS tests configured yet."

pack:
	npm run release:pack

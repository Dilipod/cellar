.PHONY: build build-rust build-ts test test-rust test-ts lint lint-rust lint-ts clean

build: build-rust build-ts

build-rust:
	cargo build --workspace

build-ts:
	pnpm install
	pnpm build

test: test-rust test-ts

test-rust:
	cargo test --workspace

test-ts:
	pnpm test

lint: lint-rust lint-ts

lint-rust:
	cargo clippy --workspace -- -D warnings
	cargo fmt --all -- --check

lint-ts:
	pnpm lint

clean:
	cargo clean
	pnpm -r exec rm -rf dist
	rm -rf node_modules

.PHONY: build build-rust build-ts test test-rust test-ts test-e2e lint lint-rust lint-ts clean

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

test-e2e:
	cd e2e && npx playwright test --project=agent-engine --project=recorder --project=context-pipeline --project=adversarial

test-e2e-ui:
	cd e2e && npx playwright install chromium && npx playwright test

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

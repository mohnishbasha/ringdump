SHELL := /bin/bash
.PHONY: help install build clean rebuild dev auth auth-browser set-token cameras download download-all \
        download-persons download-persons-all check lint audit

TODAY := $(shell date +%Y-%m-%d)

# ── default ───────────────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "ring-backup — Makefile targets"
	@echo ""
	@echo "  Setup"
	@echo "    make install              Install npm dependencies"
	@echo "    make build                Compile TypeScript → dist/"
	@echo "    make rebuild              Clean + install + build"
	@echo "    make clean                Remove dist/"
	@echo "    make auth-browser         Get refresh token via browser (recommended)"
	@echo "    make auth                 Get refresh token via CLI (legacy — may hit 406)"
	@echo "    make set-token TOKEN=xxx  Save a token directly to .env"
	@echo ""
	@echo "  Run"
	@echo "    make cameras              List all Ring cameras"
	@echo "    make download-all         Download every available video from all cameras"
	@echo "    make download             Download videos (set FROM=, TO=, CAMERA=, KIND=, OUTPUT=)"
	@echo "    make download-persons-all Download all person-detected events from all cameras"
	@echo "    make download-persons     Download person-detected events (set FROM=, TO=)"
	@echo "    make dev                  Run without building (ts-node)"
	@echo ""
	@echo "  Verify"
	@echo "    make check                Type-check without emitting files"
	@echo "    make lint                 Alias for check"
	@echo "    make audit                Show security audit (fails only on critical)"
	@echo ""
	@echo "  Examples:"
	@echo "    make download FROM=2024-06-01 TO=2024-06-30"
	@echo "    make download FROM='2024-06-15 08:00' TO='2024-06-15 20:00' CAMERA='Front Door'"
	@echo "    make download FROM=2024-06-01 TO=2024-06-07 KIND=motion OUTPUT=~/Desktop/clips"
	@echo "    make download-persons FROM=2024-06-01 TO=2024-06-30"
	@echo "    make download-persons FROM=2024-06-01 TO=2024-06-30 CAMERA='Front Door'"
	@echo ""

# ── config (override on command line) ─────────────────────────────────────────
FROM        ?= $(error Set FROM= e.g. FROM=2024-06-01)
TO          ?= $(error Set TO= e.g. TO=2024-06-30)
CAMERA      ?=
KIND        ?= all
OUTPUT      ?= ./ring-videos
LIMIT       ?=
CONCURRENCY ?= 3

# build optional flags dynamically
_CAMERA_FLAG := $(if $(filter-out ,$(CAMERA)),--camera "$(CAMERA)",)
_LIMIT_FLAG  := $(if $(filter-out ,$(LIMIT)),--limit $(LIMIT),)

# ── helpers ───────────────────────────────────────────────────────────────────
define check_token
	@if [ -z "$$RING_REFRESH_TOKEN" ]; then \
		echo "Error: RING_REFRESH_TOKEN is not set"; \
		echo "  Run: export RING_REFRESH_TOKEN=your_token"; \
		exit 1; \
	fi
endef

# ── setup ─────────────────────────────────────────────────────────────────────
install:
	@npm install 2>&1 | grep -v 'EBADENGINE'; exit $${PIPESTATUS[0]}

build: install
	npm run build

clean:
	rm -rf dist/

rebuild: clean build

auth-browser:
	@echo ""
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo "  Ring Browser Authentication"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@echo "  Step 1: A browser window will open to https://account.ring.com"
	@echo ""
	@echo "  Step 2: Open DevTools  (Mac: Cmd+Option+I  |  Win: F12)"
	@echo ""
	@echo "  Step 3: Click the Network tab, tick 'Preserve log'"
	@echo ""
	@echo "  Step 4: Log in to your Ring account (including 2FA if prompted)"
	@echo ""
	@echo "  Step 5: In the Network filter box type:  oauth/token"
	@echo "          Click the matching request -> Response tab"
	@echo "          Copy the value of \"refresh_token\" from the JSON"
	@echo ""
	@echo "  Step 6: Come back here and paste it below"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@echo ""
	@open "https://account.ring.com" 2>/dev/null || true
	@echo ""
	@read -p "Paste your refresh_token here: " TOKEN; \
	if [ -z "$$TOKEN" ]; then \
		echo "No token entered — run 'make auth-browser' again when ready."; \
		exit 1; \
	fi; \
	printf "RING_REFRESH_TOKEN=$$TOKEN\n" > .env; \
	echo ""; \
	echo "Saved to .env — run: source .env && make cameras"

auth:
	@echo ""
	@echo "Opening Ring authentication (handles email, password, and 2FA)..."
	@echo "Note: Ring has deprecated CLI auth — use 'make auth-browser' if this fails with 406."
	@echo ""
	@./node_modules/.bin/ring-auth-cli; \
	echo ""; \
	read -p "Paste your refresh token to save it to .env (Enter to skip): " TOKEN; \
	if [ -n "$$TOKEN" ]; then \
		printf "RING_REFRESH_TOKEN=$$TOKEN\n" > .env; \
		echo "Saved to .env — activate with: source .env"; \
	fi

set-token:
	@if [ -z "$(TOKEN)" ]; then \
		echo "Usage: make set-token TOKEN=your_refresh_token_here"; \
		exit 1; \
	fi
	@printf "RING_REFRESH_TOKEN=$(TOKEN)\n" > .env
	@echo "Token saved to .env — run: source .env && make cameras"

# ── run ───────────────────────────────────────────────────────────────────────
cameras: build
	$(call check_token)
	node dist/index.js cameras

download: build
	$(call check_token)
	node dist/index.js download \
		--from "$(FROM)" \
		--to "$(TO)" \
		$(_CAMERA_FLAG) \
		--kind $(KIND) \
		--output $(OUTPUT) \
		$(_LIMIT_FLAG) \
		--concurrency $(CONCURRENCY)

download-all: build
	$(call check_token)
	@echo "Downloading all available videos (2014-01-01 → $(TODAY))..."
	node dist/index.js download \
		--from 2014-01-01 \
		--to $(TODAY) \
		--kind all \
		--output $(OUTPUT) \
		--concurrency $(CONCURRENCY)

download-persons-all: build
	$(call check_token)
	@echo "Downloading all person-detected events (2014-01-01 → $(TODAY))..."
	node dist/index.js download \
		--from 2014-01-01 \
		--to $(TODAY) \
		--person \
		--output $(OUTPUT) \
		--concurrency $(CONCURRENCY)

download-persons: build
	$(call check_token)
	node dist/index.js download \
		--from "$(FROM)" \
		--to "$(TO)" \
		$(_CAMERA_FLAG) \
		--person \
		--output $(OUTPUT) \
		$(_LIMIT_FLAG) \
		--concurrency $(CONCURRENCY)

dev:
	npm run dev -- $(ARGS)

# ── verify ────────────────────────────────────────────────────────────────────
check:
	npx tsc --noEmit

lint: check

audit:
	@echo "Security audit (failing only on critical severity):"
	@npm audit --audit-level=critical; code=$$?; \
	if [ $$code -ne 0 ]; then \
		echo ""; \
		echo "CRITICAL vulnerabilities found — address before shipping."; \
		exit 1; \
	else \
		echo "No critical vulnerabilities. (Known moderate/high are in ring-client-api's"; \
		echo "WebRTC stack — werift/socket.io — which this tool does not invoke.)"; \
	fi

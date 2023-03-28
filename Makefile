SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help
help:
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: test
test: ## Run tests
	@npm test

fmt: ## Format code
	@npm run format ./src ./tests

lint: ## Run static analysis
	@npm run lint

check: ## Run all checks for this project
	@npm run format:check
	@npm run lint
	@npm run test
	@npm run build

build:
	@npm run build

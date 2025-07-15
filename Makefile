# Makefile for Docker operations

# Variables
IMAGE_NAME = kajidog/mcp-tts-voicevox
VERSION = latest

# Default target
.PHONY: help
help:
	@echo "Available targets:"
	@echo "  build       - Build Docker image"
	@echo "  run         - Run container with basic setup"
	@echo "  dev         - Start development environment"
	@echo "  prod        - Start production environment"
	@echo "  test        - Run Docker configuration tests"
	@echo "  clean       - Clean up Docker resources"
	@echo "  logs        - Show container logs"
	@echo "  push        - Push image to Docker Hub"
	@echo "  pull        - Pull image from Docker Hub"

# Build Docker image
.PHONY: build
build:
	docker build -t $(IMAGE_NAME):$(VERSION) .

# Run container with basic setup
.PHONY: run
run:
	docker-compose up -d

# Start development environment
.PHONY: dev
dev:
	docker-compose -f docker-compose.dev.yml up -d

# Start production environment
.PHONY: prod
prod:
	docker-compose -f docker-compose.prod.yml up -d

# Run tests
.PHONY: test
test:
	chmod +x test-docker.sh
	./test-docker.sh

# Clean up Docker resources
.PHONY: clean
clean:
	docker-compose down --volumes --remove-orphans || true
	docker-compose -f docker-compose.dev.yml down --volumes --remove-orphans || true
	docker-compose -f docker-compose.prod.yml down --volumes --remove-orphans || true
	docker image prune -f

# Show container logs
.PHONY: logs
logs:
	docker-compose logs -f

# Push image to Docker Hub
.PHONY: push
push:
	docker push $(IMAGE_NAME):$(VERSION)

# Pull image from Docker Hub
.PHONY: pull
pull:
	docker pull $(IMAGE_NAME):$(VERSION)

# Stop all containers
.PHONY: stop
stop:
	docker-compose down || true
	docker-compose -f docker-compose.dev.yml down || true
	docker-compose -f docker-compose.prod.yml down || true

# Health check
.PHONY: health
health:
	@echo "Checking MCP server health..."
	@curl -s http://localhost:3000/health | jq . || echo "Server not responding"
	@echo "Checking VOICEVOX engine health..."
	@curl -s http://localhost:50021/speakers | jq . || echo "VOICEVOX engine not responding"
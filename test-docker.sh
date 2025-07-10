#!/bin/bash

# Test script for Docker configuration
echo "Testing Docker configuration..."

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed or not in PATH"
    exit 1
fi

# Test Docker build
echo "Testing Docker build..."
docker build -t mcp-tts-voicevox-test . || {
    echo "Error: Docker build failed"
    exit 1
}

echo "Docker build successful!"

# Test docker-compose.yml syntax
echo "Testing docker-compose.yml syntax..."
docker-compose config > /dev/null || {
    echo "Error: docker-compose.yml syntax is invalid"
    exit 1
}

echo "docker-compose.yml syntax is valid!"

# Test docker-compose.dev.yml syntax
echo "Testing docker-compose.dev.yml syntax..."
docker-compose -f docker-compose.dev.yml config > /dev/null || {
    echo "Error: docker-compose.dev.yml syntax is invalid"
    exit 1
}

echo "docker-compose.dev.yml syntax is valid!"

# Test docker-compose.prod.yml syntax
echo "Testing docker-compose.prod.yml syntax..."
docker-compose -f docker-compose.prod.yml config > /dev/null || {
    echo "Error: docker-compose.prod.yml syntax is invalid"
    exit 1
}

echo "docker-compose.prod.yml syntax is valid!"

# Clean up test image
docker rmi mcp-tts-voicevox-test || true

echo "All Docker configuration tests passed!"
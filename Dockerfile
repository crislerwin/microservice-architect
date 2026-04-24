# Microservice Architect MCP Server - Docker Image
# Multi-stage build for optimized production image

# Stage 1: Build
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Install dependencies needed for build
RUN apk add --no-cache curl

# Copy package files
COPY package.json biome.json tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src

# Build the project
RUN bun run build

# Stage 2: Production
FROM oven/bun:1-alpine AS production

WORKDIR /app

# Install runtime dependencies (curl for healthcheck)
RUN apk add --no-cache curl

# Copy package files and install production dependencies
COPY package.json ./
RUN bun install --production --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcp -u 1001

# Create directories for volumes
RUN mkdir -p /projects /output && \
    chown -R mcp:nodejs /projects /output /app

# Set environment variables
ENV NODE_ENV=production
ENV MCP_SERVER_NAME=microservice-architect
ENV MCP_SERVER_VERSION=1.0.0

# Switch to non-root user
USER mcp

# Volumes for projects and output
VOLUME ["/projects", "/output"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | bun run /app/dist/mcp/index.js || exit 1

# Entrypoint for environment setup
ENTRYPOINT ["/entrypoint.sh"]

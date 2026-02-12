FROM node:22-slim AS base

RUN npm install -g pnpm@10

WORKDIR /app

# 依存関係のインストール用にワークスペース定義とpackage.jsonをコピー
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/voicevox-client/package.json packages/voicevox-client/
COPY packages/mcp-core/package.json packages/mcp-core/
COPY packages/player-ui/package.json packages/player-ui/
COPY apps/mcp-tts/package.json apps/mcp-tts/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ソースコードをコピーしてビルド
COPY . .

RUN pnpm --filter @kajidog/voicevox-client build:tsc && \
    pnpm --filter @kajidog/mcp-core build:tsc && \
    pnpm --filter @kajidog/player-ui build && \
    pnpm --filter @kajidog/mcp-tts-voicevox build

# --- 本番用イメージ ---
FROM node:22-slim AS production

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/voicevox-client/package.json packages/voicevox-client/
COPY packages/mcp-core/package.json packages/mcp-core/
COPY packages/player-ui/package.json packages/player-ui/
COPY apps/mcp-tts/package.json apps/mcp-tts/

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# ビルド成果物をコピー
COPY --from=base /app/packages/voicevox-client/dist packages/voicevox-client/dist
COPY --from=base /app/apps/mcp-tts/dist apps/mcp-tts/dist

ENV NODE_ENV=production
ENV MCP_HTTP_MODE=true

EXPOSE 3000

CMD ["node", "apps/mcp-tts/dist/index.js"]

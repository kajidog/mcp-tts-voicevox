FROM node:22-slim AS base

RUN npm install -g pnpm@10

WORKDIR /app

# 依存関係のインストール用にワークスペース定義とpackage.jsonをコピー
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/voicevox-client/package.json packages/voicevox-client/
COPY packages/mcp-core/package.json packages/mcp-core/
COPY packages/player-ui/package.json packages/player-ui/
COPY apps/mcp-tts/package.json apps/mcp-tts/
COPY examples/package.json examples/

RUN pnpm install --frozen-lockfile --ignore-scripts

# ソースコードをコピーしてビルド
COPY . .

RUN pnpm --filter @kajidog/voicevox-client build:tsc && \
    pnpm --filter @kajidog/mcp-core build:tsc && \
    pnpm --filter @kajidog/player-ui build && \
    pnpm --filter @kajidog/mcp-tts-voicevox build

# 本番用の依存関係だけを抜き出した自己完結ディレクトリを作る。
# player-ui の React などビルド専用の依存は含まれない。
RUN pnpm deploy --filter @kajidog/mcp-tts-voicevox --prod --legacy /app/deploy

# --- 本番用イメージ ---
FROM node:22-slim AS production

WORKDIR /app

# pnpm deploy の成果物は node_modules を同梱しているため、
# 本番イメージでは pnpm 自体も install も不要。
COPY --from=base /app/deploy ./

ENV NODE_ENV=production
ENV MCP_HTTP_MODE=true

EXPOSE 3000

CMD ["node", "dist/index.js"]

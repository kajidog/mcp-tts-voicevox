# Docker Setup Guide

このドキュメントは、VOICEVOX MCP サーバーをDockerで実行するための詳細な設定方法を説明します。

## 目次

1. [必要な環境](#必要な環境)
2. [クイックスタート](#クイックスタート)
3. [環境別設定](#環境別設定)
4. [Docker Hub の利用](#docker-hub-の利用)
5. [トラブルシューティング](#トラブルシューティング)

## 必要な環境

- Docker 20.10.0 以上
- Docker Compose 2.0.0 以上
- 2GB以上のメモリ（VOICEVOX エンジン用）

## クイックスタート

### 1. 基本的な起動

```bash
# リポジトリをクローン
git clone https://github.com/kajidog/mcp-tts-voicevox.git
cd mcp-tts-voicevox

# Docker Compose で起動
docker-compose up -d
```

### 2. 動作確認

```bash
# サーバーの起動確認
curl http://localhost:3000

# VOICEVOX エンジンの確認
curl http://localhost:50021/speakers
```

## 環境別設定

### 開発環境

開発環境では、ソースコードの変更をリアルタイムで反映させることができます。

```bash
# 開発環境用の設定で起動
docker-compose -f docker-compose.dev.yml up -d
```

**特徴:**
- ソースコードがマウントされ、変更が即座に反映
- Node.js の開発モードで実行
- ホットリロード対応

### 本番環境

本番環境では、パフォーマンスとセキュリティを重視した設定を使用します。

```bash
# 本番環境用の設定で起動
docker-compose -f docker-compose.prod.yml up -d
```

**特徴:**
- 最適化されたイメージを使用
- リソース制限が設定済み
- 自動再起動が有効

## Docker Hub の利用

Docker Hub から直接イメージを取得して利用することもできます。

### 最新版の利用

```bash
# 最新版のイメージを取得
docker pull kajidog/mcp-tts-voicevox:latest

# 単体で起動（VOICEVOX エンジンは別途起動が必要）
docker run -d \
  --name mcp-tts-voicevox \
  -p 3000:3000 \
  -e MCP_HTTP_MODE=true \
  -e VOICEVOX_URL=http://host.docker.internal:50021 \
  kajidog/mcp-tts-voicevox:latest
```

### 特定バージョンの利用

```bash
# 特定のバージョンを指定
docker pull kajidog/mcp-tts-voicevox:v0.2.2
```

## 環境変数の設定

### 基本設定

| 環境変数 | デフォルト値 | 説明 |
|----------|--------------|------|
| `MCP_HTTP_MODE` | `false` | HTTP モードの有効化 |
| `MCP_HTTP_PORT` | `3000` | HTTPサーバーのポート |
| `MCP_HTTP_HOST` | `0.0.0.0` | HTTPサーバーのホスト |
| `VOICEVOX_URL` | `http://localhost:50021` | VOICEVOXエンジンのURL |
| `VOICEVOX_DEFAULT_SPEAKER` | `1` | デフォルトの話者ID |
| `VOICEVOX_DEFAULT_SPEED_SCALE` | `1.0` | デフォルトの再生速度 |

### 高度な設定

| 環境変数 | デフォルト値 | 説明 |
|----------|--------------|------|
| `VOICEVOX_DEFAULT_IMMEDIATE` | `true` | 即座に再生開始するか |
| `VOICEVOX_DEFAULT_WAIT_FOR_START` | `false` | 再生開始まで待機するか |
| `VOICEVOX_DEFAULT_WAIT_FOR_END` | `false` | 再生終了まで待機するか |
| `NODE_ENV` | `production` | Node.jsの実行環境 |

## カスタム設定の例

### 異なる話者IDを使用する場合

```yaml
version: '3.8'
services:
  mcp-server:
    image: kajidog/mcp-tts-voicevox:latest
    environment:
      - MCP_HTTP_MODE=true
      - VOICEVOX_DEFAULT_SPEAKER=3  # 春日部つむぎ
      - VOICEVOX_DEFAULT_SPEED_SCALE=0.8
```

### 外部のVOICEVOXエンジンを使用する場合

```yaml
version: '3.8'
services:
  mcp-server:
    image: kajidog/mcp-tts-voicevox:latest
    environment:
      - MCP_HTTP_MODE=true
      - VOICEVOX_URL=http://192.168.1.100:50021
```

## トラブルシューティング

### よくある問題

#### 1. コンテナが起動しない

**症状**: `docker-compose up` でエラーが発生する

**解決方法**:
```bash
# ログを確認
docker-compose logs

# 個別のサービスログを確認
docker-compose logs mcp-server
docker-compose logs voicevox
```

#### 2. VOICEVOX エンジンに接続できない

**症状**: "VOICEVOX エンジンに接続できません" のエラー

**解決方法**:
```bash
# VOICEVOX エンジンの起動確認
curl http://localhost:50021/speakers

# ネットワークの確認
docker network ls
docker network inspect mcp-tts-voicevox_mcp-network
```

#### 3. メモリ不足

**症状**: VOICEVOX エンジンの起動が遅い、または失敗する

**解決方法**:
```bash
# Docker のリソース制限を確認
docker system df
docker system prune  # 不要なイメージを削除

# メモリ制限を調整（docker-compose.yml で設定）
deploy:
  resources:
    limits:
      memory: 4G  # メモリ制限を増加
```

#### 4. 音声が再生されない

**症状**: 音声ファイルは生成されるが、再生されない

**解決方法**:
```bash
# コンテナ内で音声デバイスを確認
docker exec -it mcp-tts-voicevox-dev sh
aplay -l  # 利用可能な音声デバイス一覧

# 音声デバイスをマウント（必要に応じて）
docker run -d \
  --device /dev/snd \
  -v /tmp/.X11-unix:/tmp/.X11-unix \
  kajidog/mcp-tts-voicevox:latest
```

### ログの確認方法

```bash
# 全体のログを確認
docker-compose logs -f

# 特定のサービスのログを確認
docker-compose logs -f mcp-server
docker-compose logs -f voicevox

# エラーログのみを確認
docker-compose logs --tail=50 mcp-server | grep -i error
```

### デバッグモード

開発時には、デバッグモードを有効にすることができます。

```bash
# デバッグモードで起動
docker-compose -f docker-compose.dev.yml up

# コンテナに接続してデバッグ
docker exec -it mcp-tts-voicevox-dev sh
```

## パフォーマンス最適化

### CPU とメモリの調整

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '1.0'
      memory: 1G
```

### キャッシュの利用

```bash
# Docker Build Cache を活用
docker-compose build --no-cache  # キャッシュを無効化してビルド
```

## セキュリティ考慮事項

### 非rootユーザーでの実行

Dockerfileでは、セキュリティのため非rootユーザーでアプリケーションを実行しています。

```dockerfile
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001
USER mcp
```

### ネットワークの分離

```yaml
networks:
  mcp-network:
    driver: bridge
    internal: true  # 外部ネットワークへのアクセスを制限
```

## 本番環境への展開

### Docker Swarm での展開

```bash
# Swarm モードを初期化
docker swarm init

# サービスを展開
docker stack deploy -c docker-compose.prod.yml mcp-stack
```

### Kubernetes での展開

Kubernetes用のマニフェストファイルは、別途 `k8s/` ディレクトリにて提供予定です。

## 追加のリソース

- [Docker公式ドキュメント](https://docs.docker.com/)
- [Docker Compose公式ドキュメント](https://docs.docker.com/compose/)
- [VOICEVOX公式サイト](https://voicevox.hiroshiba.jp/)
- [プロジェクトのGitHub](https://github.com/kajidog/mcp-tts-voicevox)

---

このドキュメントに関する質問や問題がある場合は、[GitHub Issues](https://github.com/kajidog/mcp-tts-voicevox/issues)にてお知らせください。
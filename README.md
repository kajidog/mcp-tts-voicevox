# Dockerでの音声再生 (Windows & WSL)

このリポジトリには、Dockerコンテナ内で音声を再生し、ホストOS（WindowsまたはWSL）のスピーカーから出力するための設定ファイル群が含まれています。
`Dockerfile` を使用して、音声再生に必要な共通の依存関係を持つカスタムDockerイメージをビルドし、各環境（WSL、Windowsネイティブ）に最適化された `docker-compose.*.yml` ファイルでそのイメージを利用します。

## 前提条件

- Docker Desktopがインストールされていること。
- WSL環境で試す場合は、WSL2が有効になっていること。

## Dockerfileによるイメージのカスタマイズ

このプロジェクトには `Dockerfile` が含まれており、音声再生に必要なパッケージ (PulseAudio, ALSA utilities, iproute2) を `ubuntu:latest` イメージにインストールします。
各 `docker-compose.*.yml` ファイルは、この `Dockerfile` を参照してカスタムイメージ (例: `audio-player-wsl`, `audio-player-windows`) をビルドします。

**`Dockerfile` の概要:**
```dockerfile
# ベースイメージ
FROM ubuntu:latest

# 必要なパッケージのインストール
RUN apt-get update && \
    apt-get install -y pulseaudio libasound2-plugins alsa-utils iproute2 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# コンテナ起動時のデフォルトコマンド
CMD ["bash", "-c", "echo 'Audio player container started. Run exec to test audio.' && sleep infinity"]
```
これにより、各 `docker-compose` ファイル内の `command` でパッケージのインストールを行う必要がなくなり、セットアップが簡素化されます。

## 各環境でのセットアップと実行方法

### 1. WSL (Windows Subsystem for Linux) 環境

WSL環境では、ホストOS (Windows) とコンテナ間でPulseAudioソケットを共有することで音声再生を実現します。

**`docker-compose.wsl.yml` の概要:**
```yaml
version: '3.8'
services:
  audio_player_wsl: # イメージ名は audio-player-wsl:latest のようになる
    build:
      context: .
      dockerfile: Dockerfile
    command: >
      bash -c "
      pactl load-module module-native-protocol-unix socket=/tmp/pulse-socket && \
      echo 'WSL Audio player container ready. Execute aplay or speaker-test inside the container.' && \
      sleep infinity
      "
    volumes:
      - /mnt/wslg/runtime-dir/pulse/native:/tmp/pulse-socket # WSLgの場合
      # - /path/to/host/pulse-socket:/tmp/pulse-socket # WSLg以外の場合
      - /dev/snd:/dev/snd
    environment:
      - PULSE_SERVER=unix:/tmp/pulse-socket
    # privileged: true
# ...
```

**セットアップと実行:**

1.  **イメージのビルドとコンテナの起動:**
    `docker-compose up` コマンドを実行すると、イメージがまだ存在しない場合や `Dockerfile` が変更されている場合に自動的にビルドされ、コンテナが起動します。
    ```bash
    docker-compose -f docker-compose.wsl.yml up -d
    ```
    手動でビルドのみを行う場合は `docker-compose -f docker-compose.wsl.yml build` を実行します。

1.  **WSLg (GUIアプリ対応WSL) を使用している場合:**
    *   WSLgはデフォルトでPulseAudioサーバーを実行しており、ボリュームマウントで指定されたソケット (`/mnt/wslg/runtime-dir/pulse/native`) が使用されます。
    *   ターミナルで以下のコマンドを実行します:
        ```bash
        docker-compose -f docker-compose.wsl.yml up -d
        ```

2.  **WSLgを使用していない、または手動でPulseAudioサーバーをWSLで実行している場合:**
    *   WSL側でPulseAudioサーバーが実行されており、そのソケットファイルへのパスがわかっている必要があります。
    *   `docker-compose.wsl.yml` の `volumes` セクションにある以下の行のコメントを解除し、実際のソケットパスに置き換えてください:
        ```yaml
        # - /path/to/host/pulse-socket:/tmp/pulse-socket
        ```
    *   ターミナルで以下のコマンドを実行します:
        ```bash
        docker-compose -f docker-compose.wsl.yml up -d
        ```

**コンテナ内での音声再生テスト:**

```bash
docker-compose -f docker-compose.wsl.yml exec audio_player_wsl bash
# コンテナ内で以下を実行 (alsa-utilsはDockerfileでインストール済み)
aplay /usr/share/sounds/alsa/Front_Center.wav # テストサウンドの再生 (ファイルが存在する場合)
# またはスピーカーテストコマンド
speaker-test -t wav -c 2 -l 1
exit
```

### 2. Windows ネイティブ (Docker Desktop) 環境

Windowsネイティブ環境では、コンテナ内でPulseAudioサーバーを起動し、TCP経由でホストOSのサウンドシステムと連携します。ホスト側でPulseAudioクライアントソフトウェアの準備が必要になる場合があります。

**`docker-compose.windows.yml` の概要:**
```yaml
version: '3.8'
services:
  audio_player_windows: # イメージ名は audio-player-windows:latest のようになる
    build:
      context: .
      dockerfile: Dockerfile
    command: >
      bash -c "
      echo 'PULSE_SERVER=tcp:host.docker.internal:4713' >> /etc/environment && \
      echo 'Windows Audio player container ready. Starting PulseAudio server...' && \
      pulseaudio --start --log-target=stderr --disallow-exit --exit-idle-time=-1 --load='module-native-protocol-tcp auth-ip-acl=127.0.0.1;172.0.0.0/8;192.168.0.0/16;host.docker.internal' --load='module-zeroconf-publish' && \
      echo 'PulseAudio server started. Execute aplay or speaker-test inside the container once host is ready.' && \
      sleep infinity
      "
    ports:
      - "4713:4713" # PulseAudioのTCPポート
    # privileged: true
# ...
```

**セットアップと実行:**

1.  **イメージのビルドとコンテナの起動:**
    ```bash
    docker-compose -f docker-compose.windows.yml up -d
    ```
    手動でビルドのみを行う場合は `docker-compose -f docker-compose.windows.yml build` を実行します。

1.  **ホスト (Windows) 側の設定:**
    *   WindowsでPulseAudioサーバー（またはクライアントとして機能するもの）をTCPでリッスンするように設定する必要があります。
        *   **方法A: Windows用のPulseAudioをインストール・設定する:**
            *   [PulseAudio for Windows](https://www.freedesktop.org/wiki/Software/PulseAudio/Ports/Windows/Support/) からダウンロードし、インストールします。
            *   設定ファイル (`default.pa` や `system.pa`) でTCPモジュールがロードされるようにし、適切なIPからの接続を許可するように設定します。
                例: `load-module module-native-protocol-tcp auth-ip-acl=127.0.0.1;host.docker.internal`
        *   **方法B: WSL上のPulseAudioを利用する:**
            *   WSL側でPulseAudioサーバーを起動し、TCPでリッスンするように設定します。
                ```bash
                # WSLのターミナルで
                # /etc/pulse/default.pa または ~/.config/pulse/default.pa に以下を追記または編集
                # load-module module-native-protocol-tcp auth-ip-acl=127.0.0.1;<DockerのネットワークIP範囲>
                # pulseaudio --start
                ```
            *   この場合、コンテナからはWSLのIPアドレスに対して接続することになります。`host.docker.internal` がWSLのIPを指すようにDocker Desktopのネットワーク設定がされているか確認が必要です。
    *   **ファイアウォールの設定:** WindowsファイアウォールでTCPポート `4713` の受信を許可します。

2.  **Dockerコンテナの起動:**
    *   PowerShellまたはコマンドプロンプトで上記の `docker-compose -f docker-compose.windows.yml up -d` コマンドを実行してコンテナを起動します。

**コンテナ内での音声再生テスト:**

```bash
docker-compose -f docker-compose.windows.yml exec audio_player_windows bash
# コンテナ内で以下を実行 (alsa-utilsはDockerfileでインストール済み)
aplay /usr/share/sounds/alsa/Front_Center.wav # テストサウンドの再生 (ファイルが存在する場合)
# またはスピーカーテストコマンド
speaker-test -t wav -c 2 -l 1
exit
```

## 注意点

-   **イメージのビルド:** `docker-compose up` 時に自動でイメージがビルドされますが、`Dockerfile` やビルドコンテキスト内のファイルが変更された場合、`--build` オプションをつけて `docker-compose up --build` を実行するか、事前に `docker-compose build` を実行すると、確実にイメージが再ビルドされます。
-   **テスト用サウンドファイル:** `aplay /usr/share/sounds/alsa/Front_Center.wav` は、テスト用サウンドファイルがそのパスに存在することを前提としています。`alsa-ucm-conf` パッケージなどがインストールされていれば含まれることが多いですが、なければ `speaker-test` を使用するか、任意のWAVファイルをコンテナにコピーして再生してください。
-   **セキュリティ:** `privileged: true` の使用はセキュリティリスクを伴うため、必要な場合に限定してください。PulseAudioのTCP接続も、信頼できるネットワーク内での使用に留めるなど、セキュリティに配慮してください。
-   **PulseAudioの設定:** PulseAudioの設定は環境によって複雑になることがあります。上記の手順でうまくいかない場合は、PulseAudioのログを確認したり、設定ファイルを調整したりする必要があります。
-   **`host.docker.internal`:** Docker Desktop for Windowsでは、`host.docker.internal` がホストマシンのIPアドレスを指しますが、環境によっては正しく解決されない場合もあります。その場合は、ホストの具体的なIPアドレスを指定する必要があるかもしれません。

## トラブルシューティング

-   **音声が再生されない (WSL):**
    *   PulseAudioソケットのパスが正しいか確認してください。
    *   WSL側でPulseAudioサーバーが実行されているか確認してください。
    *   コンテナ内の `PULSE_SERVER` 環境変数が正しく設定されているか確認してください (`echo $PULSE_SERVER`)。
    *   `/dev/snd` のパーミッションを確認してください。必要であれば `privileged: true` を試してください。
-   **音声が再生されない (Windowsネイティブ):**
    *   ホスト側でPulseAudioサーバー (またはクライアントとして機能するもの) がTCPポート `4713` でリッスンしているか確認してください (例: `netstat -ano | findstr "4713"`)。
    *   Windowsファイアウォールでポート `4713` がブロックされていないか確認してください。
    *   コンテナ内の `PULSE_SERVER` 環境変数 (または `/etc/environment`) が正しく設定されているか確認してください。
    *   コンテナから `host.docker.internal` にpingが通るか確認してください (`ping host.docker.internal`)。

このドキュメントが、Docker環境での音声再生設定の一助となれば幸いです。

# Dockerでの音声再生 (Windows & WSL)

このリポジトリには、Dockerコンテナ内で音声を再生し、ホストOS（WindowsまたはWSL）のスピーカーから出力するための `docker-compose.yml` ファイルが含まれています。

## 前提条件

- Docker Desktopがインストールされていること。
- WSL環境で試す場合は、WSL2が有効になっていること。

## 各環境でのセットアップと実行方法

### 1. WSL (Windows Subsystem for Linux) 環境

WSL環境では、ホストOS (Windows) とコンテナ間でPulseAudioソケットを共有することで音声再生を実現します。

**`docker-compose.wsl.yml` の内容:**

```yaml
version: '3.8'
services:
  audio_player_wsl:
    image: ubuntu:latest
    command: >
      bash -c "
      apt-get update && \
      apt-get install -y pulseaudio libasound2-plugins alsa-utils && \
      pactl load-module module-native-protocol-unix socket=/tmp/pulse-socket && \
      echo ' अब आप कंटेनर के अंदर ध्वनि चला सकते हैं' && \
      sleep infinity
      "
    volumes:
      - /mnt/wslg/runtime-dir/pulse/native:/tmp/pulse-socket # WSLgの場合
      # WSLでPulseAudioサーバーを別途実行している場合は、以下のようにホストのソケットパスを指定
      # - /path/to/host/pulse-socket:/tmp/pulse-socket
      - /dev/snd:/dev/snd
    environment:
      - PULSE_SERVER=unix:/tmp/pulse-socket
    # privileged: true # パーミッションの問題が発生する場合
networks:
  default:
    driver: bridge
```

**セットアップと実行:**

1.  **WSLg (GUIアプリ対応WSL) を使用している場合:**
    *   WSLgはデフォルトでPulseAudioサーバーを実行しており、ソケットは通常 `/mnt/wslg/runtime-dir/pulse/native` にあります。
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
# コンテナ内で以下を実行
# apt-get install -y alsa-utils (初回のみ、またはDockerfileに記述)
aplay /usr/share/sounds/alsa/Front_Center.wav # テストサウンドの再生
# またはスピーカーテストコマンド
# speaker-test -t wav -c 2 -l 1
exit
```

### 2. Windows ネイティブ (Docker Desktop) 環境

Windowsネイティブ環境では、コンテナ内でPulseAudioサーバーを起動し、TCP経由でホストOSのサウンドシステムと連携します。ホスト側でPulseAudioクライアントソフトウェアの準備が必要になる場合があります。

**`docker-compose.windows.yml` の内容:**

```yaml
version: '3.8'
services:
  audio_player_windows:
    image: ubuntu:latest
    command: >
      bash -c "
      apt-get update && \
      apt-get install -y pulseaudio libasound2-plugins alsa-utils iproute2 && \
      echo 'PULSE_SERVER=tcp:host.docker.internal:4713' >> /etc/environment && \
      echo ' अब आप कंटेनर के अंदर ध्वनि चला सकते हैं' && \
      pulseaudio --start --log-target=stderr --disallow-exit --exit-idle-time=-1 --load='module-native-protocol-tcp auth-ip-acl=127.0.0.1;172.0.0.0/8;192.168.0.0/16' --load='module-zeroconf-publish' && \
      sleep infinity
      "
    ports:
      - "4713:4713" # PulseAudioのTCPポート
    # environment:
    #   - PULSE_SERVER=tcp:host.docker.internal:4713 # command内で設定するためコメントアウト
    # privileged: true # パーミッションの問題が発生する場合
networks:
  default:
    driver: bridge
```

**セットアップと実行:**

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
    *   PowerShellまたはコマンドプロンプトで以下のコマンドを実行します:
        ```bash
        docker-compose -f docker-compose.windows.yml up -d
        ```

**コンテナ内での音声再生テスト:**

```bash
docker-compose -f docker-compose.windows.yml exec audio_player_windows bash
# コンテナ内で以下を実行
# apt-get install -y alsa-utils (初回のみ、またはDockerfileに記述)
aplay /usr/share/sounds/alsa/Front_Center.wav # テストサウンドの再生
# またはスピーカーテストコマンド
# speaker-test -t wav -c 2 -l 1
exit
```

## 注意点

-   **イメージのカスタマイズ:** `ubuntu:latest` は基本的なイメージです。実際に使用するアプリケーションが含まれるイメージや、必要なライブラリがプリインストールされたカスタムイメージを使用することを推奨します。その場合、`command` 内の `apt-get install` はDockerfileに記述すると良いでしょう。
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

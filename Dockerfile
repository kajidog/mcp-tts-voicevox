# ベースイメージ
FROM ubuntu:latest

# 環境変数の設定（デバッグ用、任意）
ENV DEBIAN_FRONTEND=noninteractive

# 必要なパッケージのインストール
RUN apt-get update && \
    apt-get install -y \
    pulseaudio \
    libasound2-plugins \
    alsa-utils \
    iproute2 \
    # テスト用のサウンドファイルが含まれるパッケージ (もしあれば)
    # alsa-ucm-conf # これにFront_Center.wavが含まれることが多い
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# テスト用サウンドファイルの確認と配置 (alsa-ucm-conf に含まれていない場合の手動配置例)
# RUN if [ ! -f /usr/share/sounds/alsa/Front_Center.wav ]; then \
#     mkdir -p /usr/share/sounds/alsa && \
#     # ここでテスト用のWAVファイルをダウンロードまたはコピーするコマンドを記述 \
#     # 例: curl -o /usr/share/sounds/alsa/Front_Center.wav http://example.com/test.wav \
#     echo "Test sound file may need to be added manually if not present in alsa-ucm-conf."; \
#     fi

# PulseAudioの設定 (主にWindows TCP接続用)
# Docker実行時のコマンドで設定する方が柔軟性が高い場合もあるため、ここではコメントアウト
# RUN echo "load-module module-native-protocol-tcp auth-ip-acl=127.0.0.1;172.0.0.0/8;192.168.0.0/16" >> /etc/pulse/default.pa
# RUN echo "load-module module-zeroconf-publish" >> /etc/pulse/default.pa

# デフォルトユーザーの設定 (任意)
# USER appuser

# 作業ディレクトリの設定 (任意)
# WORKDIR /app

# コンテナ起動時のデフォルトコマンド
# docker-composeファイルで上書きされることが多い
CMD ["bash", "-c", "echo 'Audio player container started. Run exec to test audio.' && sleep infinity"]

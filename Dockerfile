# Based on NapCat-Docker dc3ca1a: base and application layers combined.
FROM ubuntu:22.04

# 设置环境变量
ENV DEBIAN_FRONTEND=noninteractive \
    TZ=Asia/Shanghai

# 安装必要的软件包
RUN apt-get update && apt-get install -y \
    libnss3 \
    libnotify4 \
    libsecret-1-0 \
    libgbm1 \
    xvfb \
    libasound2 \
    fonts-wqy-zenhei \
    gnutls-bin \
    libglib2.0-dev \
    libdbus-1-3 \
    libgtk-3-0 \
    libxss1 \
    libxtst6 \
    libatspi2.0-0 \
    libx11-xcb1 \
    unzip \
    dbus-user-session \
    curl \
    jq \
    gosu \
    tzdata && \
    echo "${TZ}" > /etc/timezone && \
    ln -sf /usr/share/zoneinfo/${TZ} /etc/localtime && \
    apt autoremove -y && \
    apt clean && \
    rm -rf \
    /var/lib/apt/lists/* \
    /tmp/* \
    /var/tmp/*

RUN useradd --no-log-init -d /app napcat

WORKDIR /app

COPY NapCat.Shell.zip entrypoint.sh /app/

# QQ's official download page signs release URLs before downloading them.
# Resolve a fresh signature at build time rather than storing an expiring URL.
RUN arch=$(arch | sed s/aarch64/arm64/ | sed s/x86_64/amd64/) && \
    qq_url="https://qqdl.gtimg.cn/qqfile/QQNTV2/9.9.37/release/816b3c79/QQ_3.2.35_261103_${arch}_01.deb" && \
    signed_url=$(curl --retry 3 --connect-timeout 30 --max-time 60 -fsS \
        -H 'Content-Type: application/json' \
        -H 'x-oidb: {"uint32_command":"0x9b8e","uint32_service_type":1}' \
        --data "$(jq -nc --arg url "$qq_url" '{url: $url}')" \
        https://im.qq.com/http2rpc/gotrpc/noauth/trpc.qqntv2.urlsign.UrlSign/GetSign | \
        jq -er 'select(.retcode == 0) | .data.url | select(type == "string" and startswith("https://"))') && \
    curl --retry 3 --connect-timeout 30 --max-time 600 -fL -o linuxqq.deb "$signed_url" && \
    test "$(dpkg-deb -f linuxqq.deb Version)" = '3.2.35-54395' && \
    test "$(dpkg-deb -f linuxqq.deb Architecture)" = "$arch" && \
    dpkg -i --force-depends linuxqq.deb && rm linuxqq.deb

RUN chmod +x entrypoint.sh && \
    echo "(async () => {await import('file:///app/napcat/napcat.mjs');})();" > /opt/QQ/resources/app/loadNapCat.js && \
    sed -i 's|"main": "[^"]*"|"main": "./loadNapCat.js"|' /opt/QQ/resources/app/package.json

VOLUME /app/napcat/config
VOLUME /app/.config/QQ

ENTRYPOINT ["bash", "entrypoint.sh"]

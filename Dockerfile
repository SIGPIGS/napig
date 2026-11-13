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

RUN arch=$(arch | sed s/aarch64/arm64/ | sed s/x86_64/amd64/) && \
    curl --retry 3 --connect-timeout 30 --max-time 600 -fL -o linuxqq.deb \
        "https://qqdl.gtimg.cn/qqfile/QQNT/9.9.36/beta/9ee04bef/linuxqq_3.2.34-53644_${arch}.deb" && \
    dpkg -i --force-depends linuxqq.deb && rm linuxqq.deb

RUN chmod +x entrypoint.sh && \
    echo "(async () => {await import('file:///app/napcat/napcat.mjs');})();" > /opt/QQ/resources/app/loadNapCat.js && \
    sed -i 's|"main": "[^"]*"|"main": "./loadNapCat.js"|' /opt/QQ/resources/app/package.json

VOLUME /app/napcat/config
VOLUME /app/.config/QQ

ENTRYPOINT ["bash", "entrypoint.sh"]

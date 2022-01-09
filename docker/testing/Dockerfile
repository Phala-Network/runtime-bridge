FROM node:16-buster-slim

ENV PYTHONUNBUFFERED=1
RUN apt-get install apt-transport-https
RUN apt-get update
RUN apt-get install -y \
    bash \
    build-essential \
    redis-tools \
    tzdata \
    zlib1g-dev liblzma-dev libgmp-dev patch \
    protobuf-compiler \
    curl \
    python \
    git-core

WORKDIR /opt/app

COPY package.json .
COPY yarn.lock .

RUN yarn install

COPY . .

RUN yarn install
RUN yarn proto:build_prpc
RUN yarn tsc

ENTRYPOINT [ "yarn", "start_module" ]

FROM node:current-alpine

WORKDIR /opt/app

COPY package.json .

RUN yarn install

COPY . .

RUN yarn link
ENTRYPOINT prb

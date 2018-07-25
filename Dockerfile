FROM node:alpine

RUN apk add p7zip

COPY . /app
WORKDIR /app 
RUN npm install

ENTRYPOINT node app.js

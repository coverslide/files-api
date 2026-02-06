FROM node:18-alpine

RUN apk add --no-cache p7zip

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8087

USER node

ENTRYPOINT ["node", "app.js"]

FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npm", "start"]

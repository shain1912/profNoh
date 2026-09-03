FROM node:22-slim

WORKDIR /app

# 서버측 PDF → webp 사전 렌더(pdfjs-dist + @napi-rs/canvas, linux-x64-gnu prebuilt — 네이티브 빌드 불필요)에서
# 임베드되지 않은 한글 폰트를 대체할 CJK 폰트. 없으면 해당 글자가 빈 칸으로 렌더된다.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8787

CMD ["npm", "start"]

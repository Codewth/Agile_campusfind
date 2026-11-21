FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 DATABASE_PATH=/data/campusfind.sqlite UPLOAD_DIR=/data/uploads DIST_DIR=dist
VOLUME ["/data"]
EXPOSE 3001
CMD ["node", "server/index.js"]

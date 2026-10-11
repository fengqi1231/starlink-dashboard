# 星链智运 · 智慧物流 AI 决策大屏
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

# 仅拷贝依赖清单，利用镜像层缓存
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.js"]

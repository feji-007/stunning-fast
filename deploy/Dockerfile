# ============================================================
# 绝色后端 + 管理后台 镜像
# ------------------------------------------------------------
# 多阶段构建：
#   1. builder 阶段：装全量依赖、构建 server/dist 与 admin/dist
#   2. runtime 阶段：只装生产依赖 + 拷贝产物，镜像更小
# 暴露端口：4178
# 数据卷：无（数据存 MySQL，由 compose 另起容器）
# ============================================================
FROM node:18-bookworm-slim AS builder

WORKDIR /app

# 1. 先拷 package.json（利用 docker 层缓存）
COPY server/package.json server/package-lock.json* ./server/
COPY server/admin/package.json server/admin/package-lock.json* ./server/admin/

# 2. 装依赖（构建期需要 devDependencies）
RUN cd server && npm ci --no-audit --no-fund || npm install --no-audit --no-fund
RUN cd server/admin && npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# 3. 拷源码
COPY server/tsconfig.json ./server/
COPY server/src ./server/src
COPY server/admin ./server/admin

# 4. 构建：后端 TS -> JS，管理后台 SPA -> admin/dist
RUN cd server && npm run build
RUN cd server/admin && npm run build

# ============================================================
# runtime 阶段
# ============================================================
FROM node:18-bookworm-slim AS runtime

WORKDIR /app

# 时区（日志/数据库时间戳友好）
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 拷 package.json 并只装生产依赖
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

# 拷构建产物
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/admin/dist ./server/admin/dist

WORKDIR /app/server

ENV NODE_ENV=production
EXPOSE 4178

# 健康检查：每 30s 探一次 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4178/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

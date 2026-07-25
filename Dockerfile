# ---- Stage 1: install dependencies ----
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: final runtime image ----
FROM node:18-alpine AS runtime
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

USER appuser

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
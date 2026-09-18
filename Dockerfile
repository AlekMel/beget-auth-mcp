FROM node:20-alpine AS builder

WORKDIR /app

# Coolify may inject NODE_ENV=production as ARG; force a full install for tsc
ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build \
 && npm prune --omit=dev

FROM node:20-alpine

RUN apk add --no-cache dumb-init wget \
 && addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

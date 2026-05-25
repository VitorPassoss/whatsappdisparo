# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────────────────
# Builder: instala dependencies (com dev) e roda o build
# (vite gera client em dist/public, esbuild gera server em dist/index.js)
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Habilita pnpm via corepack na versão fixa do packageManager
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

# Copia lockfile + manifesto + patches ANTES do install pra aproveitar cache
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copia o resto do código e builda
COPY . .
RUN pnpm build

# ──────────────────────────────────────────────────────────────────────────────
# Runner: imagem final enxuta com apenas o necessário pra rodar
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate \
    && apk add --no-cache tini

# Pacotes e configs
COPY package.json pnpm-lock.yaml drizzle.config.ts ./
COPY patches ./patches
# Migrations + schema do drizzle-kit (necessário pra `drizzle-kit migrate`)
COPY drizzle ./drizzle

# Reinstala só prod deps no runner — imagem fica menor
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod \
 && pnpm add --save-dev drizzle-kit@^0.31.4 tsx@^4.19.1 \
 && pnpm store prune

# Build outputs do estágio anterior
COPY --from=builder /app/dist ./dist

EXPOSE 3000

# tini evita zombie processes e propaga SIGTERM corretamente
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]

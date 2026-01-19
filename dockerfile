
FROM oven/bun:alpine AS base

WORKDIR /app


FROM base AS builder

COPY package.json bun.lock ./

RUN bun install

COPY . .

RUN bun run build


FROM base AS runner

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["bun", "run", "server.js"]
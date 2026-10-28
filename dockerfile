FROM node:22-alpine AS patch-tools
RUN apk add --no-cache build-base bzip2-dev
COPY vendor/bsdiff /src
RUN cc -O2 /src/bsdiff.c -lbz2 -o /usr/local/bin/bsdiff \
 && cc -O2 -Dbspatch_main=main /src/bspatch.c -lbz2 -o /usr/local/bin/bspatch


FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

RUN npm run build


FROM node:22-alpine AS runner

RUN apk add --no-cache bzip2-libs
COPY --from=patch-tools /usr/local/bin/bsdiff /usr/local/bin/bspatch /usr/local/bin/

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]

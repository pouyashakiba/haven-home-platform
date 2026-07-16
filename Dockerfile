FROM node:22-bookworm-slim AS build

COPY --from=oven/bun:1.3.14 /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
ARG NEXT_PUBLIC_AUTOMATION_SOURCE=gateway
ENV NEXT_PUBLIC_AUTOMATION_SOURCE=$NEXT_PUBLIC_AUTOMATION_SOURCE
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "node_modules/vinext/dist/cli.js", "start"]

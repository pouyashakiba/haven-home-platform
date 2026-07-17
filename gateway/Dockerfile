FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./server.mjs
COPY request-trust.mjs ./request-trust.mjs
COPY scan-store.mjs ./scan-store.mjs

RUN mkdir -p /data/scans && chown -R node:node /data

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

USER node
CMD ["node", "server.mjs"]

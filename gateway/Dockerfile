FROM node:22-alpine

WORKDIR /app
COPY server.mjs ./server.mjs

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

USER node
CMD ["node", "server.mjs"]

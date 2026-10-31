FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY docs ./docs
COPY lib ./lib
COPY server ./server

USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]

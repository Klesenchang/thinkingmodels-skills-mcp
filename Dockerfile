FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node mcp/src ./mcp/src
USER node
ENV THINKINGMODELS_HTTP_HOST=0.0.0.0 THINKINGMODELS_HTTP_PORT=3000
EXPOSE 3000
CMD ["node", "mcp/src/cli.mjs", "--transport", "http"]

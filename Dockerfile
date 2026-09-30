FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 TRUST_PROXY=true
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "src/server.ts"]

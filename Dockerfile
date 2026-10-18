FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit

FROM deps AS build
COPY . .
RUN npm run build

# The bundle needs node_modules only for the packages esbuild leaves outside (Sentry, node-cron) and native
# binaries, all of them runtime dependencies: development tools never reach the running image.
FROM base AS runtime-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --prefer-offline --no-audit

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3000
# Not `npm start`: it runs through cross-env, a development tool the image does not contain.
CMD ["node", "dist/boot.js"]

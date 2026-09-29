# Build: compila o TypeScript e gera o client do Prisma.
FROM node:22-slim AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Runtime: só dependências de produção e o `dist`.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HUSKY=0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
EXPOSE 8080
# As migrations rodam fora da imagem (CI/CD): `npx prisma migrate deploy`.
CMD ["node", "dist/server.js"]

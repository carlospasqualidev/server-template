# Build: compila o TypeScript e gera o client do Prisma.
FROM node:22-slim AS build
WORKDIR /app
ENV HUSKY=0
# Só o que o `npm ci` precisa: manifesto, lock e o que o `prisma generate` do `postinstall` lê
# (`prisma.config.ts` e o schema). O tsconfig fica de fora de propósito: a extensão dos imports e o
# formato de módulo do client estão fixos no generator do schema, então o generate não depende dele,
# e mudar tsconfig ou código não invalida o cache desta camada.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# O generate carrega o `prisma.config.ts`, cujo `env("DATABASE_URL")` lança erro se a variável faltar,
# mas não conecta no banco: um endereço fictício basta. Vai inline porque só o `postinstall` precisa
# dela; não fica no ambiente dos passos seguintes, e o estágio de runtime não herda nada daqui. O banco
# real chega em execução, por `-e DATABASE_URL` no `docker run`.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci
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

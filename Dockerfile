# Build: compila o TypeScript e gera o client do Prisma.
FROM node:22-slim AS build
WORKDIR /app
ENV HUSKY=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
# Só o que o `pnpm install` precisa: manifesto, lock, a lista de builds aprovados
# (`pnpm-workspace.yaml`) e o que o `prisma generate` do `postinstall` lê (`prisma.config.ts` e o
# schema). O tsconfig fica de fora de propósito: a extensão dos imports e o formato de módulo do
# client estão fixos no generator do schema, então o generate não depende dele, e mudar tsconfig ou
# código não invalida o cache desta camada.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# O generate carrega o `prisma.config.ts`, cujo `env("DATABASE_URL")` lança erro se a variável faltar,
# mas não conecta no banco: um endereço fictício basta. Vai inline porque só o `postinstall` precisa
# dela; não fica no ambiente dos passos seguintes, e o estágio de runtime não herda nada daqui. O banco
# real chega em execução, por `-e DATABASE_URL` no `docker run`.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

# Migração: o estágio de build tem o CLI do Prisma, o `prisma.config.ts`, o schema e as migrations. O
# pipeline gera esta imagem do mesmo commit (`docker build --target migrate`) e a roda antes de subir
# a versão nova, com `-e DATABASE_URL`. Fica antes do runtime para o `docker build` sem `--target`
# continuar gerando a imagem de runtime, que não depende deste estágio.
FROM build AS migrate
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# Runtime: só dependências de produção e o `dist`.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HUSKY=0 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `--no-optional` junto do `--prod`: o `@prisma/client` declara o CLI do Prisma e o TypeScript como
# peers opcionais, e a única dependência opcional de produção hoje é o `pg-cloudflare`, que o `pg` só
# carrega no Cloudflare Workers. Dependência nova que traga o binário nativo como opcional (o `sharp`,
# por exemplo) ficaria sem ele na imagem: confira a subida.
RUN pnpm install --prod --no-optional --ignore-scripts --frozen-lockfile
COPY --from=build /app/dist ./dist
EXPOSE 8080
# As migrations rodam antes, pela imagem do estágio `migrate` (ou `pnpm exec prisma migrate deploy` no CI).
CMD ["node", "dist/server.js"]

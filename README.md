# Fastify Prisma Server

API em `Fastify` com `Prisma`, autenticação por cookie com JWT, upload para S3 e documentação automática com Swagger.

## Stack

- Node.js 22+ recomendado
- Fastify
- Prisma com adapter PostgreSQL
- Swagger / OpenAPI
- JWT em cookie HTTP-only
- AWS S3 para uploads

## Requisitos

- Node.js instalado
- Banco PostgreSQL acessível pela `DATABASE_URL`
- Bucket S3 e credenciais AWS válidas

## Variáveis de ambiente

O projeto valida as variáveis abaixo na inicialização. Se alguma estiver ausente, a API não sobe.

Exemplo de `.env`:

```env
PORT=8080
PROJECT_NAME=Server
ENVIRONMENT=Local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/new_prisma_server"
JWT_SECRET="change-me"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_S3_BUCKET="your-bucket-name"
AWS_BUCKET_REGION="region"
```

Notas:

- `PORT` é opcional. Se não for informado, a API sobe na porta `8080`.
- As variáveis `AWS_*` são obrigatórias no estado atual do projeto, mesmo que você não vá testar upload logo de início.
- Em produção, vale definir `NODE_ENV=production` para que o cookie de autenticação seja enviado como `secure`.

## Como rodar

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar o `.env`

Crie ou ajuste o arquivo `.env` na raiz com valores equivalentes ao exemplo acima.

### 3. Gerar o client do Prisma

```bash
npx prisma generate
```

### 4. Aplicar as migrations

```bash
npx prisma migrate dev
```

### 5. Popular dados iniciais

```bash
npx prisma db seed
```

O seed cria um usuário padrão:

- Email: `default@example.com`
- Senha: `123123123`

### 6. Subir a API

Ambiente de desenvolvimento com watch e verificação de tipos:

```bash
npm run dev
```

Ambiente de desenvolvimento com watch, sem `tsc --noEmit` antes de iniciar:

```bash
npm run dev1
```

Executar sem watch:

```bash
npm start
```

Compilar TypeScript:

```bash
npm run build
```

Quando a API subir, ela ficará disponível em:

- API: `http://localhost:8080/api`
- Documentação: `http://localhost:8080/docs`

## Estrutura do projeto

O projeto está organizado principalmente dentro de `src/api`, com separação por domínio de rota, camadas compartilhadas e configurações globais.

```text
src/
  app.ts
  server.ts
  config/
    constants.ts
    corsOptions.ts
    envVariables.ts
    swagger.ts
  types/
    authenticatedUser.d.ts
    fastify.d.ts
    token.d.ts
  api/
    routes.ts
    domains/
      client/
        client.routes.ts
        session/
          controllers/
          schemas/
          session.routes.ts
        user/
          controllers/
          schemas/
          user.routes.ts
        upload/
          controllers/
          schemas/
          upload.routes.ts
          utils/
    middlewares/
      auth/
      session/
        sessionMiddleware.ts
    services/
      session/
      user/
    utils/
      dataHandler/
      error/
      misc/
      sharedSchemas/
      token/
      validator/
lib/
  prisma.ts
prisma/
  schema.prisma
  migrations/
  seed.ts
  seeds/
generated/
  prisma/
```

### Convenções principais

- `src/app.ts`: monta a aplicação Fastify, registra plugins, Swagger, CORS, cookies, multipart e o error handler.
- `src/server.ts`: sobe o servidor HTTP.
- `src/config/`: centraliza CORS, Swagger, constantes e variáveis de ambiente.
- `src/types/`: tipos globais e extensões de tipagem do Fastify, como `req.user`.
- `src/api/routes.ts`: ponto de entrada dos agrupadores de rota da API.
- `src/api/domains/`: organiza as rotas por contexto de negócio ou consumidor.
- `*.routes.ts`: registra endpoints e hooks do módulo.
- `schemas/`: define os schemas OpenAPI de cada endpoint.
- `controllers/`: recebe a requisição HTTP e delega a regra de negócio.
- `src/api/services/`: concentra regra de negócio e acesso a dados.
- `src/api/middlewares/`: hooks e comportamentos compartilhados entre rotas protegidas ou grupos de rotas.
- `src/api/utils/`: utilitários compartilhados da API, como token, tratamento de erro, validações e helpers de dados.
- `src/api/utils/sharedSchemas/`: schemas reutilizáveis entre endpoints.
- `lib/prisma.ts`: instancia o client Prisma.

### Fluxo usado nas features

O fluxo mais comum é:

`route -> middleware/hook -> controller -> service -> prisma`

Na prática:

- o agrupador principal registra as rotas em `src/api/routes.ts`
- o domínio `client` organiza o acesso por módulos como `session`, `user` e `upload`
- middlewares podem ser aplicados em grupos inteiros de rotas
- o controller lê a request e coordena a chamada de serviços
- o service executa a regra de negócio
- o Prisma acessa o banco

## Prefixos de rota

As rotas da API ficam sob o prefixo base:

```text
/api/client
```

Hoje a divisão principal é:

- `POST /api/client/session/login`
- `POST /api/client/session/logout`
- `GET /api/client/users/me`
- `GET /api/client/users/:userId`
- `POST /api/client/upload/files`

Regras atuais:

- `session` é público
- `users` e `upload` exigem autenticação por cookie

## Como usar a documentação

A documentação Swagger fica em:

```text
http://localhost:8080/docs
```

Ela é gerada a partir dos schemas definidos em cada módulo, principalmente nos arquivos:

- `src/api/domains/client/session/schemas/login.schema.ts`
- `src/api/domains/client/session/schemas/logout.schema.ts`
- `src/api/domains/client/user/schemas/findCurrentUser.schema.ts`
- `src/api/domains/client/user/schemas/findUserById.schema.ts`
- `src/api/domains/client/upload/schemas/uploadMany.schema.ts`

### Fluxo recomendado no Swagger

1. Abra `http://localhost:8080/docs`.
2. Vá na seção `Session`.
3. Execute `POST /api/client/session/login`.
4. Use o usuário padrão do seed ou outro usuário válido.
5. Depois do login, teste as rotas protegidas em `Users` e `Upload`.

Como a autenticação é feita por cookie HTTP-only (`token`), o fluxo mais prático é fazer login pelo próprio Swagger UI no mesmo navegador e, em seguida, chamar as rotas protegidas.

### Observações sobre autenticação

- O cookie é gravado no login e limpo no logout.
- As rotas protegidas passam por um `preHandler` compartilhado registrado no agrupador de rotas do domínio `client`.
- O esquema de segurança documentado no OpenAPI usa cookie (`cookieAuth`), não Bearer Token.

## Uploads

O módulo de upload usa multipart e envia arquivos para o S3.

Limites atuais:

- até `10` arquivos por requisição
- até `15 MB` por arquivo

## CORS local

O projeto está configurado para aceitar requests com credenciais dos seguintes frontends locais:

- `http://localhost:5173`
- `http://localhost:4173`

## Banco e Prisma

- Schema Prisma: `prisma/schema.prisma`
- Migrations: `prisma/migrations`
- Seed: `prisma/seed.ts`
- Client gerado: `generated/prisma`

Comandos úteis:

```bash
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

## Observações para manutenção

- Para criar um módulo novo, siga o padrão `routes -> schemas -> controllers -> services`.
- Se no futuro a API atender mais de um frontend, a pasta `src/api/domains/` já é o lugar natural para separar consumidores ou contextos de rota.
- Middlewares compartilhados devem continuar centralizados em `src/api/middlewares/`, evitando duplicação dentro de cada domínio.
- Schemas compartilhados entre endpoints podem ficar em `src/api/utils/sharedSchemas/`.
- A configuração global do Swagger fica em `src/config/swagger.ts`.

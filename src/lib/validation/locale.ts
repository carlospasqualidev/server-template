import { z } from "zod";

// Mensagens padrão do Zod em português (ex.: "Entrada inválida: esperado string").
// Importado uma vez em `app.ts`. Mensagens específicas de campo continuam sendo escritas no schema.
z.config(z.locales.pt());

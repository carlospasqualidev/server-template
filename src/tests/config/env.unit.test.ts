import { describe, expect, it } from "vitest";

import { loadEnv } from "@/config/env";

/** O mínimo que a validação exige, fora do ambiente da suíte. */
const BASE_ENV = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://localhost:5432/env-test",
  JWT_SECRET: "env-test-secret-with-16-chars",
};

describe("loadEnv", () => {
  describe("CORS_ORIGINS", () => {
    it("separa a lista por vírgula, sem espaços nem itens vazios", () => {
      const env = loadEnv({ ...BASE_ENV, CORS_ORIGINS: " http://a.example.com , https://b.example.com ," });

      expect(env.corsOrigins).toEqual(["http://a.example.com", "https://b.example.com"]);
    });

    it.each(["*", "http://a.example.com, *"])("recusa `*` (%s): a sessão usa cookie", (origins) => {
      expect(() => loadEnv({ ...BASE_ENV, CORS_ORIGINS: origins })).toThrow(
        "CORS_ORIGINS não aceita `*`: a sessão usa cookie (credenciais); liste as origens permitidas.",
      );
    });
  });

  describe("AUDIT_RETENTION_ENABLED", () => {
    it("ligada por padrão fora de teste (ausente ou vazia)", () => {
      expect(loadEnv(BASE_ENV).auditRetentionEnabled).toBe(true);
      expect(loadEnv({ ...BASE_ENV, AUDIT_RETENTION_ENABLED: "" }).auditRetentionEnabled).toBe(true);
      expect(loadEnv({ ...BASE_ENV, NODE_ENV: "production" }).auditRetentionEnabled).toBe(true);
    });

    it("desligada com `false`", () => {
      expect(loadEnv({ ...BASE_ENV, AUDIT_RETENTION_ENABLED: "false" }).auditRetentionEnabled).toBe(false);
    });

    it("sempre desligada em teste", () => {
      expect(loadEnv({ ...BASE_ENV, NODE_ENV: "test", AUDIT_RETENTION_ENABLED: "true" }).auditRetentionEnabled).toBe(
        false,
      );
    });

    it("recusa valor que não seja true ou false", () => {
      expect(() => loadEnv({ ...BASE_ENV, AUDIT_RETENTION_ENABLED: "sim" })).toThrow("AUDIT_RETENTION_ENABLED");
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import { type Env } from "@/config/env";
import { reportError } from "@/lib/errors/reportError";

const { ERROR_LOG_URL } = vi.hoisted(() => ({ ERROR_LOG_URL: "https://logs.example.com/errors" }));

// O reporte só sai em produção e com `ERROR_LOG_URL`: este arquivo liga os dois, e o `fetch` é interceptado.
vi.mock("@/config/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: Env }>();

  return { ...actual, env: { ...actual.env, isProduction: true, ERROR_LOG_URL } };
});

function stubFetch() {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
}

function sentBody(fetchSpy: ReturnType<typeof stubFetch>) {
  const [url, init] = fetchSpy.mock.calls[0] ?? [];

  return { url, body: typeof init?.body === "string" ? init.body : "" };
}

describe("reportError", () => {
  it("envia a URL com a busca mascarada, como no log de requisição, e o resto do contexto como veio", async () => {
    const fetchSpy = stubFetch();

    await reportError(new Error("falha interna"), {
      requestId: "req-1",
      method: "GET",
      url: "/api/client/users?page=0&search=maria%40example.com&orderBy=name",
      userId: "0199a1b2-0000-7000-8000-000000000000",
    });

    const { url, body } = sentBody(fetchSpy);
    expect(url).toBe(ERROR_LOG_URL);
    expect(JSON.parse(body)).toMatchObject({
      side: "Server",
      extraInfo: {
        requestId: "req-1",
        method: "GET",
        url: "/api/client/users?page=0&search=[omitido]&orderBy=name",
        userId: "0199a1b2-0000-7000-8000-000000000000",
      },
    });
    expect(body).not.toContain("maria");
  });

  it("busca depois de `#` também sai mascarada (o roteador lê a query a partir dele)", async () => {
    const fetchSpy = stubFetch();

    await reportError(new Error("falha interna"), {
      requestId: "req-2",
      method: "GET",
      url: "/api/client/users#search=maria",
    });

    const { body } = sentBody(fetchSpy);
    expect(JSON.parse(body)).toMatchObject({ extraInfo: { url: "/api/client/users#search=[omitido]" } });
    expect(body).not.toContain("maria");
  });

  it("URL sem busca vai como chegou", async () => {
    const fetchSpy = stubFetch();
    const url = "/api/client/roles?page=1&orderBy=name";

    await reportError(new Error("falha interna"), { requestId: "req-3", method: "GET", url });

    expect(JSON.parse(sentBody(fetchSpy).body)).toMatchObject({ extraInfo: { url } });
  });
});

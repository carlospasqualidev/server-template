import { type AddressInfo, createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app";
import { nextDailyRunAt, scheduleDaily, scheduleDailyJob } from "@/lib/jobs/dailySchedule";
import { prisma } from "@/lib/prisma";
import { withFrozenDate } from "@/tests/helpers/clock";

const AT_THREE = { hour: 3, minute: 0 };

describe("nextDailyRunAt", () => {
  it("hoje, quando o horário ainda não passou", () => {
    expect(nextDailyRunAt(new Date("2026-09-29T02:59:59.999Z"), AT_THREE)).toEqual(new Date("2026-09-29T03:00:00Z"));
  });

  it("amanhã, quando o horário é agora ou já passou", () => {
    expect(nextDailyRunAt(new Date("2026-09-29T03:00:00.000Z"), AT_THREE)).toEqual(new Date("2026-09-30T03:00:00Z"));
    expect(nextDailyRunAt(new Date("2026-09-29T23:10:00.000Z"), AT_THREE)).toEqual(new Date("2026-09-30T03:00:00Z"));
  });

  it("vira o mês e o ano", () => {
    expect(nextDailyRunAt(new Date("2026-12-31T04:00:00.000Z"), AT_THREE)).toEqual(new Date("2027-01-01T03:00:00Z"));
  });
});

describe("scheduleDaily", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("roda no horário, reagenda para o dia seguinte e para quando cancelado", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T02:59:00.000Z") });
    const run = vi.fn(async (_signal: AbortSignal) => undefined);
    const onScheduled = vi.fn();

    const schedule = scheduleDaily({ time: AT_THREE, run, onScheduled });

    expect(onScheduled).toHaveBeenLastCalledWith(new Date("2026-09-29T03:00:00Z"));
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onScheduled).toHaveBeenLastCalledWith(new Date("2026-09-30T03:00:00Z"));

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);

    // Sem execução em curso, não há o que esperar.
    expect(await schedule.stop(5_000)).toBe(true);
    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("só agenda a próxima quando a execução atual termina", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T02:59:00.000Z") });
    let finish: () => void = () => undefined;
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onScheduled = vi.fn();

    const schedule = scheduleDaily({ time: AT_THREE, run, onScheduled });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);

    // A execução passa de um dia: nenhuma outra começa enquanto ela não termina.
    await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(onScheduled).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(onScheduled).toHaveBeenLastCalledWith(new Date("2026-10-01T03:00:00Z"));

    await schedule.stop(0);
  });

  it("cancelado durante uma execução: aciona o sinal dela, espera ela terminar e não reagenda", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T02:59:00.000Z") });
    let finish: () => void = () => undefined;
    const run = vi.fn(
      (_signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const schedule = scheduleDaily({ time: AT_THREE, run, onScheduled: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    const [signal] = run.mock.calls[0] ?? [];
    expect(signal?.aborted).toBe(false);

    const stopped = vi.fn();
    const stopping = schedule.stop(5_000).then(stopped);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(signal?.aborted).toBe(true);
    expect(stopped).not.toHaveBeenCalled();

    finish();
    await stopping;

    expect(stopped).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancelado durante uma execução que não termina: desiste de esperar no teto", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T02:59:00.000Z") });
    const run = vi.fn((_signal: AbortSignal) => new Promise<void>(() => undefined));
    const schedule = scheduleDaily({ time: AT_THREE, run, onScheduled: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);

    const stopped = vi.fn();
    const stopping = schedule.stop(5_000).then(stopped);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(stopped).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await stopping;
    expect(stopped).toHaveBeenCalledWith(false);
  });
});

describe("scheduleDailyJob", () => {
  it("só agenda quando o servidor escuta: nada no registro, nada no `ready`, nada com o `listen` falhando", async () => {
    const onScheduled = vi.fn();
    const app = buildApp();
    scheduleDailyJob(app, {
      name: "tarefa de teste",
      time: AT_THREE,
      run: async () => undefined,
      onScheduled,
      stopWaitMs: 5_000,
    });
    expect(onScheduled).not.toHaveBeenCalled();

    await app.ready();
    expect(onScheduled).not.toHaveBeenCalled();

    // A porta já está tomada: o `listen` falha e nenhum timer fica armado.
    const occupant = createServer();
    await new Promise<void>((resolve) => occupant.listen(0, "127.0.0.1", resolve));
    const { port } = occupant.address() as AddressInfo;

    try {
      await expect(app.listen({ port, host: "127.0.0.1" })).rejects.toMatchObject({ code: "EADDRINUSE" });
      expect(onScheduled).not.toHaveBeenCalled();
    } finally {
      await app.close();
      await new Promise<void>((resolve) => occupant.close(() => resolve()));
    }
  });

  it("o encerramento do app para a execução em curso e espera ela terminar o lote antes de desconectar o banco", async () => {
    const events: string[] = [];
    const disconnect = prisma.$disconnect.bind(prisma);
    vi.spyOn(prisma, "$disconnect").mockImplementation(async () => {
      events.push("banco desconectado");
      await disconnect();
    });
    let runStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      runStarted = resolve;
    });

    // Como o `server.ts`: o app do `buildApp` (com o `$disconnect` no `onClose`), a tarefa registrada depois dele e
    // antes do `listen`, que é quem arma o timer.
    const app = buildApp();
    scheduleDailyJob(app, {
      name: "tarefa de teste",
      time: AT_THREE,
      run: async (signal) => {
        runStarted();
        // O lote em curso quando o encerramento começa: termina depois do pedido de parada, ainda usando o banco
        // por um tempo que se mede (200 ms).
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        events.push("parada pedida");
        await prisma.$executeRaw`SELECT pg_sleep(0.2)`;
        events.push("lote terminado");
      },
      onScheduled: () => undefined,
      stopWaitMs: 5_000,
    });
    // Só o `Date` parado, a 50 ms do horário, no momento em que o servidor passa a escutar: o timer (real) dispara logo.
    await withFrozenDate(new Date("2026-09-29T02:59:59.950Z"), async () => {
      await app.listen({ port: 0, host: "127.0.0.1" });
    });
    await started;

    await app.close();

    expect(events).toEqual(["parada pedida", "lote terminado", "banco desconectado"]);
  });
});

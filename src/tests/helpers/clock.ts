import { vi } from "vitest";

/**
 * Roda `run` com o relógio da aplicação (`Date`) parado em `now`. Só o `Date` é falso: timers, banco e rede seguem
 * reais. Serve para provar que um valor gravado é o `Date` do processo, e não o `now()` do banco.
 */
export async function withFrozenDate<T>(now: Date, run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);

  try {
    return await run();
  } finally {
    vi.useRealTimers();
  }
}

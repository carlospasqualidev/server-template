import { type FastifyInstance } from "fastify";

/** Horário do dia, em UTC. */
export interface DailyTimeUtc {
  hour: number;
  minute: number;
}

/** Próxima ocorrência de `time` (UTC) estritamente depois de `now`: hoje, se ainda não passou; senão amanhã. */
export function nextDailyRunAt(now: Date, time: DailyTimeUtc): Date {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), time.hour, time.minute));

  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

interface ScheduleDailyInput {
  time: DailyTimeUtc;
  /**
   * A tarefa. Recebe o sinal que o cancelamento aciona: com ele acionado, pare no próximo ponto seguro (entre dois
   * lotes) e termine. Não lança: trata e registra o próprio erro (uma rejeição aqui derrubaria o processo).
   */
  run: (signal: AbortSignal) => Promise<void>;
  /** Chamado a cada agendamento com a data da próxima execução (para o log). */
  onScheduled: (nextRunAt: Date) => void;
}

export interface DailySchedule {
  /**
   * Cancela o agendamento e, com uma execução em curso, aciona o sinal dela e espera ela terminar, até `waitMs`.
   * Resolve `true` quando não sobra execução em curso, `false` quando desiste de esperar.
   */
  stop: (waitMs: number) => Promise<boolean>;
}

/** Espera `promise` por até `waitMs`: `true` se ela terminou a tempo, `false` se o tempo acabou antes. */
async function settlesWithin(promise: Promise<void>, waitMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), waitMs);
  });

  try {
    return await Promise.race([promise.then(() => true), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Roda `run` todo dia no horário `time` (UTC), neste processo. Uma execução por vez: a próxima só é agendada quando a
 * atual termina, recalculada pelo relógio (sem `setInterval`, que acumularia atraso). O timer não segura o processo
 * vivo (`unref`). No encerramento, `stop` (ou `scheduleDailyJob`, que o liga ao `onClose` do app).
 *
 * Várias instâncias agendam cada uma a sua: quem roda a tarefa garante que só uma trabalha por vez (trava no banco).
 */
export function scheduleDaily({ time, run, onScheduled }: ScheduleDailyInput): DailySchedule {
  const cancellation = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;

  function scheduleNext(): void {
    const nextRunAt = nextDailyRunAt(new Date(), time);

    timer = setTimeout(async () => {
      running = run(cancellation.signal);
      await running;
      running = undefined;

      if (!cancellation.signal.aborted) {
        scheduleNext();
      }
    }, nextRunAt.getTime() - Date.now());
    timer.unref();
    onScheduled(nextRunAt);
  }

  scheduleNext();

  return {
    stop: async (waitMs) => {
      clearTimeout(timer);
      cancellation.abort();

      return running ? settlesWithin(running, waitMs) : true;
    },
  };
}

interface ScheduleDailyJobInput extends ScheduleDailyInput {
  /** Nome da tarefa, para o log. */
  name: string;
  /** Teto da espera, no encerramento do app, pela execução em curso (ms). */
  stopWaitMs: number;
}

/**
 * `scheduleDaily` preso ao ciclo de vida do app. Registra dois hooks: o `onListen` agenda quando o servidor passa a
 * escutar (o `listen` que falha não deixa timer armado; o `ready` sozinho, como nos testes com `inject`, também não); o
 * `onClose` cancela o agendamento e espera a execução em curso parar (até `stopWaitMs`, com aviso no log quando
 * desiste). Chame depois do `buildApp` e antes do `listen` (o Fastify não aceita hook depois dele): o Fastify roda os
 * `onClose` do último registrado para o primeiro, então este roda antes do `$disconnect` do Prisma registrado no
 * `buildApp`, e a execução termina o lote em curso com o banco conectado.
 */
export function scheduleDailyJob(app: FastifyInstance, { name, stopWaitMs, ...input }: ScheduleDailyJobInput): void {
  let schedule: DailySchedule | undefined;

  app.addHook("onListen", async () => {
    schedule = scheduleDaily(input);
  });

  app.addHook("onClose", async () => {
    if (schedule && !(await schedule.stop(stopWaitMs))) {
      app.log.warn({ job: name, waitMs: stopWaitMs }, "Encerramento sem esperar o fim da tarefa agendada");
    }
  });
}

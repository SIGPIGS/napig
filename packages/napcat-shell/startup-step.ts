interface StartupLogger {
  log: (...args: any[]) => void;
  logError: (...args: any[]) => void;
}

/** Bound native promises so a missing callback cannot leave startup silent forever. */
export async function runStartupStep<T> (
  logger: StartupLogger,
  name: string,
  action: () => T | PromiseLike<T>,
  timeoutMs = 30_000
): Promise<T> {
  const startedAt = Date.now();
  logger.log(`[Core] [Startup] ${name}: starting`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    logger.log(`[Core] [Startup] ${name}: completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    logger.logError(`[Core] [Startup] ${name}: failed after ${Date.now() - startedAt}ms`, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

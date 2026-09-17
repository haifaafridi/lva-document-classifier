function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableMilvusReadError(error) {
  const code = Number(error?.code);
  if (code === 4 || code === 14) return true;

  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toUpperCase();
  return message.includes('DEADLINE_EXCEEDED') || message.includes('UNAVAILABLE');
}

export async function withMilvusReadRetry(
  label,
  operation,
  {
    maxAttempts = 2,
    baseDelayMs = 300,
    logger = console,
    sleepFn = sleep,
  } = {}
) {
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  const delayBase = Math.max(0, Number(baseDelayMs) || 0);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      const retryable = isRetryableMilvusReadError(error);
      const isLastAttempt = attempt >= attempts;

      if (!retryable || isLastAttempt) throw error;

      const delayMs = delayBase * (2 ** (attempt - 1));
      const code = error?.code ?? 'unknown';
      logger?.warn?.(
        `[Milvus] ${label} attempt=${attempt}/${attempts} failed code=${code}; ` +
        `retrying in ${delayMs}ms (${error?.message || error?.details || 'transient read error'})`
      );

      await sleepFn(delayMs);
    }
  }

  throw new Error(`Milvus ${label} retry loop exited unexpectedly`);
}

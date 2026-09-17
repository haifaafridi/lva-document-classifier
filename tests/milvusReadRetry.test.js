import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableMilvusReadError, withMilvusReadRetry } from '../src/services/milvusReadRetry.js';

test('Milvus read retry recognizes transient gRPC status codes', () => {
  assert.equal(isRetryableMilvusReadError({ code: 4, message: 'Deadline exceeded' }), true);
  assert.equal(isRetryableMilvusReadError({ code: 14, message: 'Unavailable' }), true);
  assert.equal(isRetryableMilvusReadError({ code: 3, message: 'Invalid argument' }), false);
});

test('Milvus read retry retries DEADLINE_EXCEEDED once and succeeds', async () => {
  let calls = 0;
  const delays = [];

  const value = await withMilvusReadRetry(
    'test search',
    async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('4 DEADLINE_EXCEEDED: Deadline exceeded');
        error.code = 4;
        throw error;
      }
      return 'ok';
    },
    {
      maxAttempts: 2,
      baseDelayMs: 300,
      logger: { warn() {} },
      sleepFn: async (ms) => { delays.push(ms); },
    }
  );

  assert.equal(value, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(delays, [300]);
});

test('Milvus read retry does not retry non-transient errors', async () => {
  let calls = 0;

  await assert.rejects(
    () => withMilvusReadRetry(
      'test query',
      async () => {
        calls += 1;
        const error = new Error('Invalid argument');
        error.code = 3;
        throw error;
      },
      {
        maxAttempts: 2,
        logger: { warn() {} },
        sleepFn: async () => {},
      }
    ),
    /Invalid argument/
  );

  assert.equal(calls, 1);
});

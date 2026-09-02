'use strict';

async function mapConcurrent(items, limit, mapper) {
  const values = Array.from(items || []);
  if (!values.length) return [];
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, values.length));
  const results = new Array(values.length);
  let cursor = 0;

  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }

  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, () => run()),
  );
  const failed = settled.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

module.exports = { mapConcurrent };

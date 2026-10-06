'use strict';

// Claims remain serial/CAS-protected. Only independent invoice requests may
// overlap; all other operations retain their existing exclusive execution.
async function drainOperations({claim, process, concurrency = 2}) {
  const limit = String(concurrency) === '1' ? 1 : 2;
  const active = new Map();
  let processed = 0, failure;
  async function join() { await Promise.all([...active.values()].map(v => v.done)); }
  try {
    while (!failure) {
      if (active.size >= limit) {
        await Promise.race([...active.values()].map(v => v.done));
        if (failure) break;
      }
      const request = await claim();
      if (!request) break;
      const key = request.target_type + ':' + request.target_id;
      const parallel = request.operation_type === 'EPOST_LIVE_ISSUE'
        && request.target_type === 'HUB_ORDER' && Boolean(request.target_id);
      if (!parallel) {
        await join();
        // A claimed request must always be handed to its processor, even when
        // another processor failed unexpectedly while this claim was pending.
        await process(request);
        processed++;
        continue;
      }
      const previous = [...active.values()].find(v => v.key === key);
      if (previous) await previous.done;
      const entry = {key};
      entry.done = Promise.resolve().then(() => process(request))
        .then(() => { processed++; }, error => { failure ||= error; })
        .finally(() => active.delete(request.id));
      active.set(request.id, entry);
    }
  } catch (error) { failure ||= error; }
  finally { await join(); }
  if (failure) throw failure;
  return processed;
}

module.exports = {drainOperations};

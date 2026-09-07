'use strict';

function createBoundedAuthRpc({rpcClient, timeoutMs, errorFactory} = {}) {
  if (typeof window !== 'undefined' || typeof document !== 'undefined'
    || !rpcClient || typeof rpcClient.rpc !== 'function'
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
    || typeof errorFactory !== 'function') {
    throw new TypeError('Explicit server RPC dependencies and a bounded timeout are required.');
  }
  const rpc = rpcClient.rpc.bind(rpcClient);
  function unavailable() {
    const error = errorFactory();
    return error instanceof Error ? error : new Error('Authentication RPC is unavailable.');
  }
  return Object.freeze({
    async call(name, args) {
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => rpc(name, args)),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(unavailable()), timeoutMs);
            timer.unref?.();
          }),
        ]);
        if (!result || typeof result !== 'object' || Array.isArray(result)
          || !Object.hasOwn(result, 'data') || result.error !== null) {
          throw unavailable();
        }
        return result.data;
      } catch (_error) {
        throw unavailable();
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

module.exports = {createBoundedAuthRpc};

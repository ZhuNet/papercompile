export function createOperationQueue() {
  let tail = Promise.resolve();

  return function enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const next = tail.then(operation);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
}

export function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next() {
    active--;
    const run = queue.shift();
    if (run) run();
  }

  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(
          (value) => {
            resolve(value);
            next();
          },
          (error) => {
            reject(error);
            next();
          }
        );
      };
      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

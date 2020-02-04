export class Mutex {
  private mutex = Promise.resolve();

  lock(): PromiseLike<() => void> {
    let begin: (unlock: () => void) => void = (unlock) => undefined;


    this.mutex = this.mutex.then(() => new Promise(begin));

    return new Promise((res) => {
      begin = res;
    });
  }
}

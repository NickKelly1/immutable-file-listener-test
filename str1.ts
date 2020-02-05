import { LOG_FILE_NAME } from './log-file-name';
import stream, { Readable } from 'stream';
import readline from 'readline';
import fs from 'fs';
import { Mutex } from './mutex.helper';
import { EventEmitter } from 'events';

// fs.watch(LOG_FILE_NAME, (event, filename) => {})


// fs.stat(LOG_FILE_NAME, (err, stats) => {
//   console.log(stats.size);
// });

const FS_WATCH_EVENTS = {
  // change contents
  change: 'change',

  // delete
  rename: 'rename',
} as const;


interface NewLineListener{ (newLine: string): any }
interface ResetListener{ (contents: string): any }

interface Watcher {
  addListener(event: 'new_line', listener: NewLineListener): this;
  on(event: 'new_line', listener: NewLineListener): this;
  once(event: 'new_line', listener: NewLineListener): this;
  prependListener(event: 'new_line', listener: NewLineListener): this;
  prependOnceListener(event: 'new_line', listener: NewLineListener): this;

  emit(event: 'new_line', newLine: string): boolean;


  addListener(event: 'reset', listener: ResetListener): this;
  on(event: 'reset', listener: ResetListener): this;
  once(event: 'reset', listener: ResetListener): this;
  prependListener(event: 'reset', listener: ResetListener): this;
  prependOnceListener(event: 'reset', listener: ResetListener): this;

  emit(event: 'reset', contents: string): boolean;

  newLine$(aborter?: AbortController): AsyncIterableIterator<string>;
  reset$(aborter?: AbortController): AsyncIterableIterator<string>;
}


class Watcher extends EventEmitter {
  private _prevSize = 0;
  private _watcher: null | fs.FSWatcher = null
  private _watcherMutex = new Mutex();

  /** @description Next new line */
  nextNewLine(): Promise<string> { return new Promise((res) => this.once('new_line', res)) }

  /** @description Next reset */
  nextReset(): Promise<string> { return new Promise((res) => this.once('reset', res)) }

  /** @description Stream of new lines */
  async * newLine$(aborter?: AbortController): AsyncGenerator<string, void, undefined> {
    let cached: string[] = [];
    const push = cached.push.bind(cached);
    this.on('new_line', push);
    while (aborter?.signal.aborted !== true) {
      if (cached.length === 0) await this.nextNewLine();
      yield cached.shift()!;
    }
    this.off('new_line', push)
  }

  /** @description Stream of resets */
  async * reset$(aborter?: AbortController): AsyncGenerator<string, void, undefined> {
    let cached: string[] = [];
    const push = cached.push.bind(cached);
    this.on('reset', push);
    while (aborter?.signal.aborted !== true) {
      if (cached.length === 0) await this.nextReset();
      yield cached.shift()!;
    }
    this.off('reset', push)
  }

  constructor(private readonly _filePath: string) { super(); };

  /**
   * @description
   * Fired when file size changes and is greater than previously observed
   * 
   * @param stats 
   */
  private async handleSizeGt(stats: fs.Stats) {
    // assume the file has been only appended to... i.e. our last location is REALLY our last location
    const fileReadStream = fs.createReadStream(this._filePath, { start: this._prevSize, end: stats.size, highWaterMark: 512 });
    const lineReader = readline.createInterface(fileReadStream);
    for await (const line of lineReader) { this.emit('new_line', line) }
  }

  /**
   * @description
   * Fired when file size changes and is lte previously observed
   * 
   * @param stats 
   */
  private async handleSizeLte(stats: fs.Stats) {
    // re-read whole file - something unexpected may have happened and consumers may want to re-sync
    // WARNING: may cause memory explosions....
    const fileReadStream = fs.createReadStream(this._filePath, { start: 0, end: stats.size, highWaterMark: 512 });
    const contents = fs.readFileSync(this._filePath, { encoding: 'utf-8' });
    this.emit('reset', contents);
  }


  /**
   * @description
   * Try to read the file from the previous to the next cursor
   */
  private async onChange() {
    const stats = await new Promise<fs.Stats>((res, rej) => fs.stat(this._filePath, (err, stats) => err ? rej(err) : res(stats)));
    // size decrease? unexpected
    if (stats.size < this._prevSize) await this.handleSizeLte(stats);
    // size increase - expected
    else this.handleSizeGt(stats);
    this._prevSize = stats.size;
  }

  private async onRename() {
    console.warn('TODO: onRename');
  }

  start() {
    if (!this._watcher) {
      this._watcher = fs.watch(this._filePath, async (event, filename) => {
        const unlock = await this._watcherMutex.lock();
        try {
          console.log('[Watcher] EVENT:', event, filename);
          if (event === FS_WATCH_EVENTS.rename) await this.onRename();
          else if (event === FS_WATCH_EVENTS.change) await this.onChange();
          else console.log(`Unhandled fs event "${event}"`);
        } catch (err) { console.error('[Watcher] ERROR', err); }
        finally { if (unlock) unlock(); }
      })
    }
  }
}

const watcher = new Watcher(LOG_FILE_NAME);

(async () => {
  for await (const newLine of watcher.newLine$()) {
    console.log('[newLine]', newLine);
  }
})();

(async () => {
  for await (const contents of watcher.reset$()) {
    console.log('[reset]', contents);
  }
})();

console.log('bootin');

watcher.start();


// fs.createReadStream(logFileName, { start: '', end: '' }).pipe(process.stdout)

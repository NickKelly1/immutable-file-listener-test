import { LOG_FILE_NAME } from './log-file-name';
import stream from 'stream';
import readline from 'readline';
import fs from 'fs';
import { Mutex } from './mutex.helper';

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

class Watcher {
  private _location = 0;
  private _isWatching = false;
  private _watcher: null | fs.FSWatcher = null
  private _watcherMutex = new Mutex();
  private _handler?: (data: string) => any;

  constructor(private readonly _filePath: string) {};

  /**
   * @description
   * Try to read the file from the previous to the next cursor
   */
  private async next() {
    const unlock = await this._watcherMutex.lock();
    try {
      // error if can't access stats
      const stats = await new Promise<fs.Stats>((res, rej) => fs.stat(this._filePath, (err, stats) => err ? rej(err) : res(stats)));
      if (stats.size < this._location) throw new Error(`Unhandled fs scenario - stats.size (${stats.size}) < this._location (${this._location})`);

      // process
      const fileReadStream = fs.createReadStream(this._filePath, { start: this._location, end: stats.size, highWaterMark: 512 });
      const lineReader = readline.createInterface(fileReadStream);
      for await (const line of lineReader) { if (line !== '') { this._handler?.(line); } }
      this._location = stats.size;
    } catch (err) {
      console.error('[Watcher] errored');
      throw err;
    } finally {
      if (unlock) unlock();
    }
  }

  start() {
    if (!this._watcher) {
      // apply watcher
      this._watcher = fs.watch(this._filePath, async (event, filename) => {
        console.log('[Watcher] EVENT:', event, filename);
        if (event !== FS_WATCH_EVENTS.change) throw new Error(`Unhandled fs event: ${event}`);
        await this.next();
      })

      // fire initial read
      this.next();
    }
  }

  // stop() {
  //   if (this._watcher) {
  //     this._watcher.close();
  //     this._watcher = null;
  //   }
  // }

  onChange(handler: (data: string) => any) {
    this._handler = handler;
  }
}

const watcher = new Watcher(LOG_FILE_NAME);
watcher.onChange((data) => console.log('[DATA]', data));
watcher.start();

// fs.createReadStream(logFileName, { start: '', end: '' }).pipe(process.stdout)

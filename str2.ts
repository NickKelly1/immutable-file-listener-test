import { LOG_FILE_NAME } from './log-file-name';
import stream from 'stream';
import fs from 'fs';
import readline from 'readline';

// console.log('hello world');

const rl = readline.createInterface({
  input: process.stdin,
  output: fs.createWriteStream(LOG_FILE_NAME),
  // terminal: true,
});

rl.on('line', (str) => console.log('[line]', str));



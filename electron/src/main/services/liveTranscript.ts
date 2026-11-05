import { prepareLiveText } from './liveText';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CleanupEvent } from '../../types/easy-whisper';

export class LiveTranscript {
  private raw = '';
  private event: CleanupEvent;
  private writes: Promise<void>;
  private writeError?: Error;
  constructor(root: string, private emit: (event: CleanupEvent) => void) {
    const id = randomUUID();
    const outputBase = path.join(root, `Live-${new Date().toISOString().replace(/[:.]/g, '-')}-${id.slice(0, 8)}`);
    this.event = { id, source: 'Live transcript', outputBase, original: '', markdown: '', live: true,
      status: 'working', completed: 0, total: 0, startedAt: Date.now(), preserved: 0, message: 'Listening…' };
    this.writes = fs.mkdir(root, { recursive: true }).then(() => fs.writeFile(outputBase + '.raw.txt', '', { flag: 'wx' })).catch(error => { this.writeError = error; });
    this.publish();
  }
  private publish() { this.emit({ ...this.event }); }
  append(text: string) {
    if (!text) return;
    this.raw += text;
    this.event.original = prepareLiveText(this.raw);
    this.event.message = 'Live transcription · listening';
    this.writes = this.writes.then(async () => {
      if (!this.writeError) await fs.appendFile(this.event.outputBase + '.raw.txt', text);
    }).catch(error => { this.writeError = error; });
    this.publish();
  }
  async finish() {
    await this.writes;
    if (!this.writeError) {
      try { await fs.writeFile(this.event.outputBase + '.txt', this.event.original, { flag: 'wx' }); }
      catch (error) { this.writeError = error as Error; }
    }
    this.event.status = this.writeError ? 'error' : 'complete';
    this.event.message = this.writeError ? 'Could not save live transcript. Copy the text from this reader.' : 'Live transcript saved';
    if (!this.writeError) this.event.outputPath = this.event.outputBase + '.txt';
    this.publish();
    return { ...this.event };
  }
}

import { StringDecoder } from 'node:string_decoder';

export class TranscriptStream {
  private decoder = new StringDecoder('utf8');
  private pending = '';
  constructor(private segment: (key: string, text: string) => void) {}
  push(data: Buffer) { this.pending += this.decoder.write(data); this.flush(false); }
  finish() { this.pending += this.decoder.end(); this.flush(true); }
  private flush(final: boolean) {
    const lines = this.pending.split(/\r\n|[\r\n]/);
    this.pending = final ? '' : lines.pop() ?? '';
    for (const line of lines) {
      const match = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').match(/^\s*\[(\d+:\d+:\d+[.,]\d+)\s*-->\s*(\d+:\d+:\d+[.,]\d+)\]\s*(.*)$/);
      if (match && match[3].trim()) this.segment(match[1] + '-->' + match[2], match[3].trim());
    }
  }
}

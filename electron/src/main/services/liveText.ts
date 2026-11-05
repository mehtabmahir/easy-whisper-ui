// Whisper stream prints overlapping hypotheses. Reconcile adjacent hypotheses before
// sending the finished session to the LLM; keep the raw capture on disk separately.
export function prepareLiveText(raw: string): string {
  const lines = raw.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').split(/[\r\n]+/);
  const result: string[] = [];
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const line of lines) {
    const text = line.replace(/\[(?:BLANK_AUDIO|Start speaking|End speaking)\]/gi, '')
      .replace(/^\s*\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, '').trim();
    if (!text) continue;
    const previous = result.at(-1);
    if (!previous) { result.push(text); continue; }
    const a = words(previous), b = words(text);
    const left = a.join(' '), right = b.join(' ');
    if (left === right || left.startsWith(right + ' ')) continue;
    // The last word may itself still be incomplete ("test" -> "testing").
    if (right.startsWith(left + ' ') || (right.startsWith(left) && left.length >= 3)) { result[result.length - 1] = text; continue; }
    // Revisions can change the unfinished ending while retaining the beginning.
    // Keep one growing line instead of printing every hypothesis as a new line.
    let prefix = 0;
    while (prefix < Math.min(left.length, right.length) && left[prefix] === right[prefix]) prefix++;
    const requiredPrefix = Math.min(12, Math.min(left.length, right.length));
    if (requiredPrefix >= 3 && prefix >= requiredPrefix) {
      if (right.length >= left.length) result[result.length - 1] = text;
      continue;
    }
    let overlap = Math.min(a.length, b.length);
    while (overlap >= 2 && a.slice(-overlap).join(' ') !== b.slice(0, overlap).join(' ')) overlap--;
    if (overlap >= 2) {
      const tokens = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
      const end = tokens[overlap - 1].index! + tokens[overlap - 1][0].length;
      const tail = text.slice(end).replace(/^[\s.,;:!?]+/, '');
      if (tail) result[result.length - 1] = previous.replace(/[.!?]+$/, '') + ' ' + tail;
    } else result.push(text);
  }
  return result.join('\n\n');
}

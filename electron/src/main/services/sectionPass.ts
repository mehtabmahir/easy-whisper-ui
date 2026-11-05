import { IncompleteCleanupError, splitTranscript } from './cleanupText';

// Retry bounded pieces instead of throwing away a document when a model hits its output limit.
export async function sectionPass(text: string, generate: (text: string) => Promise<string>, signal: AbortSignal,
  retained: () => void, depth = 0): Promise<string> {
  signal.throwIfAborted();
  try {
    const result = await generate(text);
    signal.throwIfAborted();
    if (!result.trim()) throw new IncompleteCleanupError('Empty model output');
    return result;
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof IncompleteCleanupError)) throw error;
    if (depth >= 2 || text.length <= 500) { retained(); return text; }
    const parts = splitTranscript(text, Math.ceil(text.length / 2));
    const results: string[] = [];
    for (const part of parts) results.push(await sectionPass(part, generate, signal, retained, depth + 1));
    return results.join('\n\n');
  }
}

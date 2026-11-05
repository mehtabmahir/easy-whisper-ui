import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CleanupEvent, CleanupPreferences } from '../../types/easy-whisper';
import { ensureCleanupModel } from './cleanupModel';
import { CLEANUP_PROMPT, splitTranscript, reviewedText, markdownDocument, IncompleteCleanupError, hasRepetitionLoop, readableSection } from './cleanupText';

// Keep native ESM import intact when the surrounding Electron main code compiles to CommonJS.
const loadRuntime = new Function("return import('node-llama-cpp')") as () => Promise<typeof import('node-llama-cpp')>;
let apiKey = '';
export function setCleanupApiKey(key: string): void {
  if (typeof key !== 'string' || key.length > 4096 || /[\r\n]/.test(key)) throw new Error('Invalid API key.');
  apiKey = key.trim(); // Session only: never stored in localStorage, settings, queue payloads, or logs.
}
export function hasCleanupApiKey(): boolean { return !!apiKey; }

export async function cleanWithApi(text: string, model: string, key: string, signal: AbortSignal): Promise<string> {
  if (!key) throw new Error('Add an OpenAI API key in Cleanup settings. Your original transcript is saved.');
  if (!model.trim() || model.length > 200) throw new Error('Enter an OpenAI text model ID in Cleanup settings.');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, store: false, max_completion_tokens: 4096,
      messages: [{ role: 'system', content: CLEANUP_PROMPT }, { role: 'user', content: text }] })
  });
  // Never echo an API response body: it could contain transcript content or credentials.
  if (!response.ok) throw new Error(`OpenAI cleanup failed (HTTP ${response.status}). Check your key, model access, and billing. Original transcript saved.`);
  const data = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new IncompleteCleanupError('API cleanup returned incomplete output (text limit)');
  if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') throw new Error('API cleanup returned an incomplete response. Original transcript saved.');
  return choice.message.content;
}

export async function cleanupTranscript(input: {
  source: string; outputBase: string; original: string; preferences: CleanupPreferences;
  signal: AbortSignal; emit: (event: CleanupEvent) => void;
}): Promise<void> {
  const { source, outputBase, original, preferences, signal, emit } = input;
  const title = path.basename(source);
  const event: CleanupEvent = { id: randomUUID(), source, original, markdown: '', status: 'working',
    completed: 0, total: 0, message: 'Preparing cleanup…', startedAt: Date.now(), preserved: 0 };
  const update = (patch: Partial<CleanupEvent>) => { Object.assign(event, patch); emit({ ...event }); };
  update({});
  let model: import('node-llama-cpp').LlamaModel | undefined;
  let context: import('node-llama-cpp').LlamaContext | undefined;
  let generate: (text: string, onText: (text: string) => void) => Promise<string>;
  try {
    const chunks = splitTranscript(original);
    if (!chunks.length) throw new Error('No speech text was found to clean up.');
    update({ total: chunks.length });
    // Snapshot the key for this job; changing settings cannot redirect an active request.
    const key = apiKey;
    if (preferences.provider === 'openai') {
      generate = text => cleanWithApi(text, preferences.apiModel, key, signal);
    } else {
      const modelPath = await ensureCleanupModel(path.join(app.getPath('userData'), 'whisper-workspace', 'cleanup-models'), signal,
        message => update({ message }));
      signal.throwIfAborted();
      update({ message: 'Loading tiny model…' });
      const runtime = await loadRuntime();
      const llama = await runtime.getLlama({ build: 'never' });
      signal.throwIfAborted();
      model = await llama.loadModel({ modelPath, loadSignal: signal });
      context = await model.createContext({ contextSize: 8192 });
      generate = async (text, onText) => {
        signal.throwIfAborted();
        const session = new runtime.LlamaChatSession({ contextSequence: context!.getSequence(), systemPrompt: CLEANUP_PROMPT });
        try {
          const sectionAbort = new AbortController();
          let generated = '';
          const result = await session.promptWithMeta(text, {
            signal: AbortSignal.any([signal, sectionAbort.signal]), temperature: 0, maxTokens: 3072, repeatPenalty: { penalty: 1.1 },
            onTextChunk: part => {
              generated += part;
              if (hasRepetitionLoop(generated)) {
                sectionAbort.abort(new IncompleteCleanupError('Repeated model output'));
                return;
              }
              onText(part);
            }
          });
          if (result.stopReason === 'maxTokens' || sectionAbort.signal.aborted) throw new IncompleteCleanupError('Incomplete local output');
          return result.responseText;
        } finally { session.dispose({ disposeSequence: true }); }
      };
    }
    const paragraphs: string[] = [];
    let preserved = 0;
    for (const [index, chunk] of chunks.entries()) {
      signal.throwIfAborted();
      update({ message: `Cleaning section ${index + 1} of ${chunks.length}…` });
      let draft = '', lastUpdate = 0;
      let result = "";
      try { result = await generate(chunk, text => {
        draft += text;
        if (Date.now() - lastUpdate > 200) {
          update({ markdown: markdownDocument(title, [...paragraphs, draft], preserved) });
          lastUpdate = Date.now();
        }
      }); } catch (error) {
        signal.throwIfAborted();
        if (!(error instanceof IncompleteCleanupError)) throw error;
        // Discard the unverified draft and retain this section; later sections still run.
      }
      signal.throwIfAborted();
      const reviewed = reviewedText(chunk, result);
      if (reviewed.keptOriginal) preserved++;
      paragraphs.push(readableSection(reviewed.text, index));
      update({ completed: index + 1, preserved, markdown: markdownDocument(title, paragraphs, preserved) });
    }
    signal.throwIfAborted();
    // Exclusive write: repeated cleanups never overwrite an existing document.
    let destination = outputBase + '.cleaned.md';
    for (let n = 1; ; n++) {
      try { await fs.writeFile(destination, event.markdown, { encoding: 'utf8', flag: 'wx' }); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        destination = `${outputBase}.cleaned-${n}.md`;
      }
    }
    update({ status: 'complete', outputPath: destination, message: preserved ? `Saved · ${preserved} section(s) kept unchanged` : 'Markdown saved' });
  } catch (error) {
    update({ status: signal.aborted ? 'stopped' : 'error', message: signal.aborted
      ? 'Cleanup stopped. Original transcript saved; draft below is incomplete.'
      : `Cleanup could not finish. Original transcript saved. ${(error as Error).message}` });
    // Optional cleanup failure does not mark a successful Whisper transcript as failed.
  } finally {
    await context?.dispose();
    await model?.dispose();
  }
}

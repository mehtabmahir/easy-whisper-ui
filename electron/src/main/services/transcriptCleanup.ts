import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CleanupEvent, CleanupPreferences } from '../../types/easy-whisper';
import { ensureCleanupModel } from './cleanupModel';
import { CLEANUP_PROMPT, splitTranscript, reviewedText, markdownDocument, IncompleteCleanupError, hasRepetitionLoop, readableSection, OUTLINE_PROMPT, outlinePassages, structuredOriginal } from './cleanupText';

// Keep native ESM import intact when the surrounding Electron main code compiles to CommonJS.
const loadRuntime = new Function("return import('node-llama-cpp')") as () => Promise<typeof import('node-llama-cpp')>;
let apiKey = '';
export function setCleanupApiKey(key: string): void {
  if (typeof key !== 'string' || key.length > 4096 || /[\r\n]/.test(key)) throw new Error('Invalid API key.');
  apiKey = key.trim(); // Session only: never stored in localStorage, settings, queue payloads, or logs.
}
export function hasCleanupApiKey(): boolean { return !!apiKey; }

export async function cleanWithApi(text: string, model: string, key: string, signal: AbortSignal, prompt = CLEANUP_PROMPT, endpoint = 'https://api.openai.com/v1/chat/completions'): Promise<string> {
  if (!key) throw new Error('Add an API key in Cleanup settings. Your original transcript is saved.');
  if (!model.trim() || model.length > 200) throw new Error('Enter a text model ID in Cleanup settings.');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTPS chat completions endpoint without credentials or query parameters.');
  const isOpenAI = url.origin === 'https://api.openai.com';
  const response = await fetch(endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, ...(isOpenAI ? { store: false, max_completion_tokens: 4096 } : { max_tokens: 4096 }),
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }] })
  });
  // Never echo an API response body: it could contain transcript content or credentials.
  if (!response.ok) throw new Error(`API cleanup failed (HTTP ${response.status}). Check your key, model access, and billing. Original transcript saved.`);
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
  let outline: (text: string) => Promise<string>;
  let generate: (text: string, onText: (text: string) => void) => Promise<string>;
  try {
    const chunks = splitTranscript(original);
    if (!chunks.length) throw new Error('No speech text was found to clean up.');
    update({ total: chunks.length });
    // Snapshot the key for this job; changing settings cannot redirect an active request.
    const key = apiKey;
    if (preferences.provider === 'openai' || preferences.provider === 'compatible') {
      const endpoint = preferences.provider === 'compatible' ? preferences.apiEndpoint?.trim() : undefined;
      if (preferences.provider === 'compatible' && !endpoint) throw new Error('Enter your provider’s chat completions endpoint.');
      generate = text => cleanWithApi(text, preferences.apiModel, key, signal, CLEANUP_PROMPT, endpoint);
      outline = text => cleanWithApi(text, preferences.apiModel, key, signal, OUTLINE_PROMPT, endpoint);
    } else {
      const modelPath = preferences.provider === 'custom' ? await validateCustomModel(preferences.customModelPath) : await ensureCleanupModel(path.join(app.getPath('userData'), 'whisper-workspace', 'cleanup-models'), signal,
        message => update({ message }));
      signal.throwIfAborted();
      update({ message: 'Loading model…' });
      const runtime = await loadRuntime();
      const llama = await runtime.getLlama({ build: 'never' });
      signal.throwIfAborted();
      model = await llama.loadModel({ modelPath, loadSignal: signal });
      context = await model.createContext({ contextSize: 8192 });
      outline = async text => {
        const grammar = await llama.createGrammarForJsonSchema({ type: 'object', properties: {
          title: { type: 'string' }
        }, required: ['title'] });
        const headings: string[] = [];
        for (const passage of text.split(/\n\nPassage \d+: /)) {
          signal.throwIfAborted();
          const session = new runtime.LlamaChatSession({ contextSequence: context!.getSequence(),
            systemPrompt: 'Write a specific 3 to 8 word topic heading for the transcript passage. Name the actual concept being discussed using its terminology. Do not use generic labels or answer questions. Return JSON with one title field. Example: {"title":"Producer and Consumer Lock Ownership"}.' });
          try {
            const response = await session.prompt(passage.replace(/^Passage \d+: /, ''), { signal, grammar, temperature: 0, maxTokens: 64 });
            headings.push(JSON.parse(response).title);
          } finally { session.dispose({ disposeSequence: true }); }
        }
        return JSON.stringify({ title: headings[0], headings });
      };
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
      if (reviewed.keptOriginal) {
        update({ message: `Organizing topics in section ${index + 1} of ${chunks.length}…`, markdown: markdownDocument(title, paragraphs, preserved) });
        let plan = '';
        try { plan = await outline(outlinePassages(chunk).map((part, i) => `Passage ${i + 1}: ${part}`).join('\n\n')); }
        catch { signal.throwIfAborted(); }
        signal.throwIfAborted();
        paragraphs.push(structuredOriginal(chunk, plan));
      } else paragraphs.push(readableSection(reviewed.text, index));
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
    update({ status: 'complete', outputPath: destination, message: preserved ? `Saved · ${preserved} section(s) kept their original wording` : 'Markdown saved' });
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

export async function validateCustomModel(file?: string): Promise<string> {
  if (!file || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== '.gguf') throw new Error('Choose a GGUF language model file in Cleanup settings.');
  const handle = await fs.open(file, 'r');
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Choose a GGUF model file.');
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    if (header.toString('ascii') !== 'GGUF') throw new Error('This file is not a GGUF language model.');
  } finally { await handle.close(); }
  return file;
}

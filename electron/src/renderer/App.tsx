import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles/App.module.css";
import type { CompileProgressEvent, LiveState, QueueState } from "../types/easy-whisper";

const MODEL_OPTIONS = [
  "large-v3",
  "large-v3-turbo",
  "medium",
  "medium.en",
  "small",
  "small.en",
  "tiny",
  "tiny.en",
  "base",
  "base.en"
];

const LANGUAGE_OPTIONS = [
  "en",
  "af",
  "am",
  "ar",
  "as",
  "az",
  "ba",
  "be",
  "bg",
  "bn",
  "bo",
  "br",
  "bs",
  "ca",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fo",
  "fr",
  "gl",
  "gu",
  "ha",
  "haw",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jw",
  "ka",
  "kk",
  "km",
  "kn",
  "ko",
  "la",
  "lb",
  "ln",
  "lo",
  "lt",
  "lv",
  "mg",
  "mi",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "nn",
  "no",
  "oc",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sa",
  "sd",
  "si",
  "sk",
  "sl",
  "sn",
  "so",
  "sq",
  "sr",
  "su",
  "sv",
  "sw",
  "ta",
  "te",
  "tg",
  "th",
  "tk",
  "tl",
  "tr",
  "tt",
  "uk",
  "ur",
  "uz",
  "vi",
  "yi",
  "yo",
  "yue",
  "zh"
];

const DEFAULT_ARGS = "-tp 0.0 -mc 64 -et 3.0";

function getFileName(filePath: string | undefined): string {
  if (!filePath) {
    return "Idle";
  }
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? filePath;
}

function App(): JSX.Element {
  const api = window.easyWhisper;
  const apiAvailable = Boolean(api);

  const [model, setModel] = useState<string>("medium.en");
  const [language, setLanguage] = useState<string>("en");
  const [cpuOnly, setCpuOnly] = useState<boolean>(false);
  const [outputTxt, setOutputTxt] = useState<boolean>(true);
  const [outputSrt, setOutputSrt] = useState<boolean>(false);
  const [openAfterComplete, setOpenAfterComplete] = useState<boolean>(true);
  const [extraArgs, setExtraArgs] = useState<string>(DEFAULT_ARGS);

  const [platform, setPlatform] = useState<string>("...");
  const [arch, setArch] = useState<string>("...");
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [queueState, setQueueState] = useState<QueueState>({ awaiting: [], isProcessing: false });
  const [compileInfo, setCompileInfo] = useState<CompileProgressEvent>(() => ({
    step: "idle",
    message: "Whisper binaries not compiled",
    progress: 0,
    state: "pending"
  }));
  const [liveActive, setLiveActive] = useState<boolean>(false);

  useEffect(() => {
    if (!api) {
      setPlatform("preload-missing");
      setArch("-");
      return;
    }
    try {
      setPlatform(api.platform());
      setArch(api.arch());
    } catch {
      setPlatform("unknown");
      setArch("unknown");
    }
  }, [api]);

  const appendConsole = useCallback((line: string) => {
    if (!line) {
      return;
    }
    setConsoleLines((prev) => {
      const next = [...prev, line];
      if (next.length > 800) {
        next.splice(0, next.length - 800);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!api) {
      appendConsole("[system] Preload bridge unavailable. Rebuild and reload.");
      return;
    }

    const removeConsole = api.onConsoleEvent((event) => {
      appendConsole(`[${event.source}] ${event.message}`);
    });

    const removeQueue = api.onQueueState((state) => {
      setQueueState(state);
    });

    const removeCompile = api.onCompileProgress((event) => {
      setCompileInfo(event);
    });

    const removeLiveText = api.onLiveText((text) => {
      appendConsole(`[live] ${text}`);
    });

    const removeLiveState = api.onLiveState((state: LiveState) => {
      setLiveActive(state === "started");
    });

    return () => {
      removeConsole();
      removeQueue();
      removeCompile();
      removeLiveText();
      removeLiveState();
    };
  }, [api, appendConsole]);

  useEffect(() => {
    if (!api || !api.checkInstall) {
      return;
    }

    let cancelled = false;
    api.checkInstall().then((result) => {
      if (!cancelled && result.installed) {
        setCompileInfo((prev) => {
          if (prev.state === "success") {
            return prev;
          }
          return {
            step: "completed",
            message: "Whisper binaries ready.",
            progress: 100,
            state: "success"
          };
        });
      }
    }).catch(() => {
      // Ignore errors; install status will update on demand.
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  const consoleText = useMemo(() => consoleLines.join("\n"), [consoleLines]);
  const consoleRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = consoleRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [consoleText]);

  const buildSettings = useCallback(() => ({
    model,
    language,
    cpuOnly,
    outputTxt,
    outputSrt,
    openAfterComplete,
    extraArgs
  }), [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs]);

  const handleCompile = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Cannot compile without preload bridge.");
      return;
    }
    try {
      const result = await bridge.compileWhisper();
      if (!result.success && result.error) {
        appendConsole(`[compile] ${result.error}`);
      }
    } catch (error) {
      const err = error as Error;
      appendConsole(`[compile] ${err.message}`);
    }
  }, [appendConsole]);

  const handleOpen = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    try {
      const files = await bridge.openAudioFiles();
      if (files.length === 0) {
        return;
      }
      bridge.enqueueTranscriptions({ files, settings: buildSettings() });
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole, buildSettings]);

  const handleStop = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    await bridge.cancelAll();
  }, [appendConsole]);

  const handleClear = useCallback(() => {
    setConsoleLines([]);
  }, []);

  const handleCloseWindow = useCallback(() => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      return;
    }
    void bridge.closeWindow();
  }, []);

  const handleMinimizeWindow = useCallback(() => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      return;
    }
    void bridge.minimizeWindow();
  }, []);

  const handleLiveToggle = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    try {
      if (liveActive) {
        await bridge.stopLiveTranscription();
      } else {
        await bridge.startLiveTranscription({
          settings: buildSettings(),
          stepMs: 500,
          lengthMs: 5000
        });
      }
    } catch (error) {
      const err = error as Error;
      appendConsole(`[live] ${err.message}`);
    }
  }, [appendConsole, buildSettings, liveActive]);

  const compileStateLabel = useMemo(() => {
    if (compileInfo.state === "error" && compileInfo.error) {
      return `${compileInfo.message} (${compileInfo.error})`;
    }
    return compileInfo.message;
  }, [compileInfo]);

  const statusText = useMemo(() => {
    if (!apiAvailable) {
      return "Preload bridge unavailable; check build output.";
    }
    const compileSummary = compileInfo.state === "success"
      ? "Binaries ready"
      : compileInfo.state === "running"
        ? "Compiling..."
        : compileInfo.message;
    return `Platform: ${platform} • Arch: ${arch} • Compile: ${compileSummary}`;
  }, [apiAvailable, arch, compileInfo, platform]);

  const queuedCount = queueState.awaiting.length;
  const isCompiling = compileInfo.state === "running";
  const isProcessing = queueState.isProcessing;
  const isInstalled = compileInfo.state === "success";

  return (
    <div className={styles.windowContainer}>
      <div className={styles.titlebar}>
        <div className={styles.titleDragRegion}>
          <span className={styles.titleText}>EasyWhisper UI</span>
        </div>
      </div>

      <div className={styles.appShell}>
        <header className={styles.header}>
          <div>
            <h1>EasyWhisper UI</h1>
            <p className={styles.subtitle}>Recreating the original workflow in Electron.</p>
          </div>
          <span className={styles.status}>{statusText}</span>
        </header>

        <section className={styles.workspace}>
          <aside className={styles.leftPanel}>
            <div className={styles.buttonStack}>
              <button
                type="button"
                className={`${styles.controlButton} ${styles.primaryButton}`}
                onClick={handleOpen}
                disabled={!apiAvailable}
              >
                Open
              </button>
              <button
                type="button"
                className={`${styles.controlButton} ${styles.liveButton}`}
                onClick={handleLiveToggle}
                aria-pressed={liveActive}
                disabled={!apiAvailable}
              >
                {liveActive ? "Stop Live" : "Live"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCompile}
                disabled={!apiAvailable || isCompiling}
              >
                {isInstalled ? "Installed" : "Install"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleStop}
                disabled={!apiAvailable || (!isProcessing && queuedCount === 0)}
              >
                Stop
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleClear}>
                Clear
              </button>
              <div className={styles.windowControlRow}>
                <button
                  type="button"
                  className={`${styles.controlButton} ${styles.minimizeButton}`}
                  onClick={handleMinimizeWindow}
                >
                  Minimize
                </button>
                <button
                  type="button"
                  className={`${styles.controlButton} ${styles.closeButton}`}
                  onClick={handleCloseWindow}
                >
                  Close
                </button>
              </div>
            </div>
            <div className={styles.compileStatus}>
              <span>{compileStateLabel}</span>
              {isCompiling && <progress value={compileInfo.progress} max={100} />}
            </div>

            <div className={styles.selectorGroup}>
              <label className={styles.selectorLabel}>
                <span>Model</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.selectorLabel}>
                <span>Language</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </aside>

          <main className={styles.rightPanel}>
            <div className={styles.argumentsBlock}>
              <label htmlFor="arguments">Arguments</label>
              <textarea
                id="arguments"
                placeholder="Example: --temperature 0.6 --max-context 1"
                rows={4}
                value={extraArgs}
                onChange={(event) => setExtraArgs(event.target.value)}
              />
            </div>

            <div className={styles.optionsRow}>
              <label className={styles.checkbox}>
                <input type="checkbox" checked={cpuOnly} onChange={(event) => setCpuOnly(event.target.checked)} />
                <span>CPU Only</span>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={outputTxt}
                  onChange={(event) => setOutputTxt(event.target.checked)}
                />
                <span>Output .txt File</span>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={outputSrt}
                  onChange={(event) => setOutputSrt(event.target.checked)}
                />
                <span>Output File with Timestamps (.srt)</span>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={openAfterComplete}
                  onChange={(event) => setOpenAfterComplete(event.target.checked)}
                />
                <span>Open Transcription</span>
              </label>
            </div>

            <div className={styles.queueStatus}>
              <span>Processing: {getFileName(queueState.processing)}</span>
              <span>Queued: {queuedCount}</span>
            </div>

            <div className={styles.consoleBlock}>
              <label htmlFor="console">Output</label>
              <textarea
                ref={consoleRef}
                id="console"
                className={styles.consoleArea}
                placeholder="FFmpeg and whisper output will appear here."
                rows={14}
                readOnly
                value={consoleText}
              />
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}

export default App;

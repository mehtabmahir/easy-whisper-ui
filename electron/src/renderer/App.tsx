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
const SETTINGS_KEY = "easy-whisper-ui.settings";
const LOGO_URL = "./icon.png";
const GITHUB_URL = "https://github.com/mehtabmahir/easy-whisper-ui";
const WEBSITE_URL = "https://mehtabmahir.me";

type PersistedSettings = {
  model?: string;
  language?: string;
  cpuOnly?: boolean;
  outputTxt?: boolean;
  outputSrt?: boolean;
  openAfterComplete?: boolean;
  extraArgs?: string;
};

function loadPersistedSettings(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedSettings(settings: PersistedSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures.
  }
}

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

  const persisted = useMemo(loadPersistedSettings, []);

  const [model, setModel] = useState<string>(persisted.model ?? "medium.en");
  const [language, setLanguage] = useState<string>(persisted.language ?? "en");
  const [cpuOnly, setCpuOnly] = useState<boolean>(persisted.cpuOnly ?? false);
  const [outputTxt, setOutputTxt] = useState<boolean>(persisted.outputTxt ?? true);
  const [outputSrt, setOutputSrt] = useState<boolean>(persisted.outputSrt ?? false);
  const [openAfterComplete, setOpenAfterComplete] = useState<boolean>(persisted.openAfterComplete ?? true);
  const [extraArgs, setExtraArgs] = useState<string>(persisted.extraArgs ?? DEFAULT_ARGS);

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
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

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

  useEffect(() => {
    if (!api) {
      return;
    }

    let cancelled = false;
    api.getWindowState().then((state) => {
      if (!cancelled) {
        setIsMaximized(state.maximized);
      }
    }).catch(() => {
      // Ignore errors fetching initial window state.
    });

    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!api) {
      return;
    }
    return api.onWindowState((state) => {
      setIsMaximized(state.maximized);
    });
  }, [api]);

  const buildSettings = useCallback(() => ({
    model,
    language,
    cpuOnly,
    outputTxt,
    outputSrt,
    openAfterComplete,
    extraArgs
  }), [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs]);

  useEffect(() => {
    savePersistedSettings({
      model,
      language,
      cpuOnly,
      outputTxt,
      outputSrt,
      openAfterComplete,
      extraArgs
    });
  }, [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs]);

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

  const handleToggleMaximizeWindow = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    try {
      const maximized = await bridge.toggleMaximizeWindow();
      setIsMaximized(maximized);
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole]);

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
          <img src={LOGO_URL} alt="EasyWhisperUI logo" className={styles.titleLogo} />
          <span className={styles.titleText}>EasyWhisperUI</span>
        </div>
        <div className={styles.titleControls}>
          <button
            type="button"
            className={`${styles.titleControlButton} ${styles.titleControlMinimize}`}
            onClick={handleMinimizeWindow}
            aria-label="Minimize window"
          />
          <button
            type="button"
            className={`${styles.titleControlButton} ${styles.titleControlMaximize}`}
            onClick={handleToggleMaximizeWindow}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            aria-pressed={isMaximized}
          />
          <button
            type="button"
            className={`${styles.titleControlButton} ${styles.titleControlClose}`}
            onClick={handleCloseWindow}
            aria-label="Close window"
          />
        </div>
      </div>

      <div className={styles.appShell}>
        <header className={styles.header}>
          <div className={styles.branding}>
            <img src={LOGO_URL} alt="EasyWhisperUI logo" className={styles.headerLogo} />
            <div>
              <h1>EasyWhisperUI</h1>
              <p className={styles.subtitle}>Accurate, local GPU-accelerated speech-to-text powered by Whisper</p>
            </div>
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
              <button type="button" className={`${styles.secondaryButton} ${styles.fullWidthButton}`} onClick={handleClear}>
                Clear
              </button>
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

              <div className={styles.linkCluster}>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.socialButton}
                  title="View EasyWhisperUI on GitHub"
                >
                  <svg className={styles.socialIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.17-1.11-1.48-1.11-1.48-.91-.62.07-.61.07-.61 1 .07 1.52 1.04 1.52 1.04.9 1.52 2.36 1.08 2.94.83.09-.65.35-1.08.64-1.33-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.99 1.03-2.69-.1-.26-.45-1.29.1-2.68 0 0 .85-.27 2.78 1.03a9.63 9.63 0 0 1 5.06 0c1.93-1.3 2.78-1.03 2.78-1.03.55 1.39.2 2.42.1 2.68.64.7 1.03 1.6 1.03 2.69 0 3.85-2.33 4.69-4.56 4.94.36.31.68.92.68 1.86 0 1.34-.01 2.42-.01 2.75 0 .26.18.58.69.48A10 10 0 0 0 12 2Z"
                    />
                  </svg>
                  <span>GitHub</span>
                </a>
                <a
                  href={WEBSITE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.socialButton}
                  title="Visit mehtabmahir.me"
                >
                  <svg className={styles.socialIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path
                      fill="currentColor"
                      d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.93 9h-2.61a15.25 15.25 0 0 0-1.17-5 8.06 8.06 0 0 1 3.78 5Zm-5.93 9.95a13.4 13.4 0 0 1-3.16-6.95h6.32a13.4 13.4 0 0 1-3.16 6.95ZM9.84 11a13.4 13.4 0 0 1 3.16-6.95A13.4 13.4 0 0 1 16.16 11Zm-1.02-5a15.25 15.25 0 0 0-1.17 5H5.04a8.06 8.06 0 0 1 3.78-5Zm-3.78 7h2.61a15.25 15.25 0 0 0 1.17 5 8.06 8.06 0 0 1-3.78-5Zm11.92 5a15.25 15.25 0 0 0 1.17-5h2.61a8.06 8.06 0 0 1-3.78 5Z"
                    />
                  </svg>
                  <span>Website</span>
                </a>
              </div>
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

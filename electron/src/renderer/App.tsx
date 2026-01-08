import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles/App.module.css";
import FirstLaunchLoader from "./FirstLaunchLoader";
const FIRST_LAUNCH_KEY = "easy-whisper-ui.first-launch";

function isFirstLaunch(): boolean {
  try {
    return window.localStorage.getItem(FIRST_LAUNCH_KEY) !== "false";
  } catch {
    return true;
  }
}

function setFirstLaunchDone(): void {
  try {
    window.localStorage.setItem(FIRST_LAUNCH_KEY, "false");
  } catch {
    // Ignore
  }
}
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
  "base.en",
  "custom"
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
  customModelPath?: string;
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

function computeCompileProgressPercent(info: CompileProgressEvent): number {
  if (info.state === "success") {
    return 100;
  }
  if (info.state !== "running") {
    return 0;
  }

  const percent = (() => {
    switch (info.step) {
      case "prepare":
        return 45;
      case "git":
        return 50;
      case "vulkan":
        return 55;
      case "vulkan-env":
        return 58;
      case "ffmpeg":
        return 60;
      case "msys":
        return 65;
      case "packages":
        return 70;
      case "source":
        return 78;
      case "configure":
        return 85;
      case "build":
        return 92;
      case "copy":
        return 96;
      default:
        return 80 + Math.round((info.progress || 0) * 0.2);
    }
  })();

  return Math.max(0, Math.min(99, percent));
}


function App(): JSX.Element {
  // All state hooks must be declared first
  const [showLoader, setShowLoader] = useState<boolean>(true);
  const [loaderProgress, setLoaderProgress] = useState<number>(0);
  const [loaderMessage, setLoaderMessage] = useState<string>("Preparing EasyWhisperUI for first use...");
  const [canContinue, setCanContinue] = useState<boolean>(false);

  const persisted = useMemo(loadPersistedSettings, []);
  const [model, setModel] = useState<string>(persisted.model ?? "medium.en");
  const [language, setLanguage] = useState<string>(persisted.language ?? "en");
  const [cpuOnly, setCpuOnly] = useState<boolean>(persisted.cpuOnly ?? false);
  const [outputTxt, setOutputTxt] = useState<boolean>(persisted.outputTxt ?? true);
  const [outputSrt, setOutputSrt] = useState<boolean>(persisted.outputSrt ?? false);
  const [customModelPath, setCustomModelPath] = useState<string>(persisted.customModelPath ?? "");
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
  const loaderStartedRef = useRef<boolean>(false);
  const depsEnsuredRef = useRef<boolean>(false);
  const depsInProgressRef = useRef<boolean>(false);
  const ensureDepsPromiseRef = useRef<Promise<{ success: boolean; error?: string }> | null>(null);
  const compileRanRef = useRef<boolean>(false);
  const closeLoader = useCallback((reason?: string) => {
    console.debug("closeLoader called", reason);
    console.trace();
    if (!showLoader) return;
    // reset started ref so loader can run again if needed
    loaderStartedRef.current = false;
    depsEnsuredRef.current = false;
    depsInProgressRef.current = false;
    ensureDepsPromiseRef.current = null;
    compileRanRef.current = false;
    // clear any install poll timers
    if (installPollRef.current) {
      clearTimeout(installPollRef.current);
      installPollRef.current = null;
    }
    setShowLoader(false);
  }, [showLoader]);
  const installPollRef = useRef<number | null>(null);

  // API reference must be declared before any useEffect or logic that uses it
  const api = window.easyWhisper;
  const apiAvailable = Boolean(api);
  const isMac = (typeof process !== 'undefined' && (process as any).platform === 'darwin')
    || (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|MacIntel/.test(navigator.platform || navigator.userAgent));
  // Loader logic must come after all state hooks
  useEffect(() => {
    if (!showLoader) return;
    if (loaderStartedRef.current) return;
    loaderStartedRef.current = true;
    setLoaderProgress(0);
    setLoaderMessage("Checking for updates and requirements...");
    setCanContinue(false);

    // Wait for preload bridge
    if (!window.easyWhisper) {
      setLoaderMessage("Preload bridge unavailable. Please rebuild and reload the app.");
      setCanContinue(false);
      return;
    }

    // Simulate async checks for each step, only if needed
    (async () => {
      // 1. Check system requirements (simulate always OK)
      setLoaderProgress(20);
      setLoaderMessage("Checking system requirements...");
      await new Promise(r => setTimeout(r, 600));

      // 2. Check for updates (simulate always up-to-date)
      setLoaderProgress(40);
      setLoaderMessage("Checking for updates...");
      await new Promise(r => setTimeout(r, 600));

      // 3. Setup desktop shortcut (simulate only if not present)
      let shortcutNeeded = false; // TODO: real check
      if (shortcutNeeded) {
        setLoaderProgress(60);
        setLoaderMessage("Setting up desktop shortcut...");
        await new Promise(r => setTimeout(r, 600));
      }

      // 4. Register uninstall entry (simulate only if not present)
      let uninstallNeeded = false; // TODO: real check
      if (uninstallNeeded) {
        setLoaderProgress(80);
        setLoaderMessage("Registering uninstall entry...");
        await new Promise(r => setTimeout(r, 600));
      }

      // 5. Install Whisper binaries if not installed
      let whisperNeedsInstall = compileInfo.state !== "success";
      if (isMac) {
        // macOS: local compile not required/supported in this build — skip
        whisperNeedsInstall = false;
        setLoaderProgress(100);
        setLoaderMessage("macOS detected — skipping local Whisper compile (not supported).");
        setCanContinue(true);
      }
      if (whisperNeedsInstall) {
        if (!depsEnsuredRef.current && !compileRanRef.current && !depsInProgressRef.current) {
          setLoaderProgress(60);
          setLoaderMessage("Installing prerequisite dependencies...");
          setCanContinue(false);
          depsInProgressRef.current = true;
          if (api && api.ensureDependencies) {
            try {
              const pending = ensureDepsPromiseRef.current ?? api.ensureDependencies({ force: false });
              ensureDepsPromiseRef.current = pending;
              const result = await pending;
              ensureDepsPromiseRef.current = null;
              depsInProgressRef.current = false;
              if (!result.success) {
                setLoaderMessage(result.error ? `Dependency installation failed: ${result.error}` : "Dependency installation failed.");
                setCanContinue(true);
                return;
              }
            } catch (error) {
              ensureDepsPromiseRef.current = null;
              const err = error as Error;
              depsInProgressRef.current = false;
              setLoaderMessage(`Dependency installation failed: ${err.message}`);
              setCanContinue(true);
              return;
            }
          }
          depsEnsuredRef.current = true;
          depsInProgressRef.current = false;
        }

        setLoaderProgress(80);
        setLoaderMessage("Installing Whisper binaries...");
        if (compileInfo.state !== "running" && !depsInProgressRef.current) {
          // start compile via preload bridge (if available)
          if (!isMac) {
            if (api && api.compileWhisper) {
              void api.compileWhisper();
            } else if (window.easyWhisper) {
              void window.easyWhisper.compileWhisper();
            }
          }
        }
        // Allow user to Continue while compile is running, but DO NOT auto-close.
        setCanContinue(true);

        // Poll api.checkInstall() (same check used by Install button) to decide when install is complete
        if (api && api.checkInstall) {
          let cancelled = false;
          const poll = async () => {
            try {
              const res = await api.checkInstall();
              if (cancelled) return;
              if (res.installed) {
                // Installation verified by checkInstall — update loader.
                setLoaderProgress(100);
                setLoaderMessage("All requirements satisfied!");
                setCanContinue(true);
                // Do NOT auto-close here; rely on compileInfo success event to close
                return;
              }
            } catch {
              // ignore transient errors
            }
            if (!cancelled) setTimeout(poll, 1200);
          };
          poll();
          // ensure we don't leak if component unmounts
          // store cancel flag in closure
        }
      } else {
        setLoaderProgress(100);
        setLoaderMessage("All requirements satisfied!");
        setCanContinue(true);
      }
    })();
  }, [showLoader]);

  const handleLoaderContinue = useCallback(() => {
    console.debug("Loader: user pressed Continue");
    closeLoader("user-continue");
  }, []);

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

  // Reflect compile progress in loader and auto-close only when compile finishes
  useEffect(() => {
    if (!showLoader) return;
    if (compileInfo.state === "running") {
      compileRanRef.current = true;
      const stepProgress = computeCompileProgressPercent(compileInfo);
      setLoaderProgress(stepProgress);
      setLoaderMessage(compileInfo.message || "Installing Whisper components...");
      setCanContinue(true); // allow user to continue while compile runs
    } else if (compileInfo.state === "success") {
      setLoaderProgress(100);
      setLoaderMessage("All requirements satisfied!");
      setCanContinue(true);
      if (!compileRanRef.current && !depsEnsuredRef.current) {
        // Avoid auto-closing if nothing actually ran; wait for user input.
        return;
      }
      // Confirm installation via api.checkInstall(), then close.
      console.debug("Loader: compileInfo indicates success — verifying install via checkInstall");
      if (installPollRef.current) {
        clearTimeout(installPollRef.current);
        installPollRef.current = null;
      }
      if (api && api.checkInstall) {
        let cancelled = false;
        const pollInstall = async () => {
          try {
            const res = await api.checkInstall();
            if (cancelled) return;
            if (res.installed) {
              console.debug("Loader: checkInstall confirmed installed — closing");
              closeLoader("compile-success-confirmed");
              return;
            }
          } catch (e) {
            // ignore transient errors
          }
          installPollRef.current = window.setTimeout(pollInstall, 1200) as unknown as number;
        };
        pollInstall();
        // clear poll on cleanup or subsequent runs
        return () => { cancelled = true; if (installPollRef.current) { clearTimeout(installPollRef.current); installPollRef.current = null; } };
      } else {
        // If no API to confirm, close immediately
        closeLoader("compile-success-no-check");
      }
    } else if (compileInfo.state === "error") {
      setLoaderMessage(compileInfo.message || "Compile failed");
      setCanContinue(true);
    }
  }, [compileInfo, showLoader]);

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
        if (showLoader) {
          closeLoader("already-installed");
        }
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
    extraArgs,
    customModelPath
  }), [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs, customModelPath]);

  useEffect(() => {
    savePersistedSettings({
      model,
      language,
      cpuOnly,
      outputTxt,
      outputSrt,
      openAfterComplete,
      extraArgs,
      customModelPath
    });
  }, [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs, customModelPath]);

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

  const handleSelectModelFile = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    try {
      const filePath = await bridge.openModelFile();
      if (filePath) {
        setCustomModelPath(filePath);
      }
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole]);

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

  const compileProgressPercent = useMemo(() => computeCompileProgressPercent(compileInfo), [compileInfo]);

  const statusText = useMemo(() => {
    if (!apiAvailable) {
      return "Preload bridge unavailable; check build output.";
    }
    const compileSummary = compileInfo.state === "success"
      ? "Binaries ready"
      : compileInfo.state === "running"
        ? "Compiling..."
        : compileInfo.message;
    return `Platform: ${platform} • Arch: ${arch} • Whisper: ${compileSummary}`;
  }, [apiAvailable, arch, compileInfo, platform]);

  const queuedCount = queueState.awaiting.length;
  const isCompiling = compileInfo.state === "running";
  const isProcessing = queueState.isProcessing;

  return (
    <>
      {showLoader && (
        <FirstLaunchLoader
          progress={loaderProgress}
          message={loaderMessage}
          canContinue={canContinue}
          onContinue={handleLoaderContinue}
        />
      )}
      <div className={styles.windowContainer} style={showLoader ? { filter: 'blur(2.5px)', pointerEvents: 'none', userSelect: 'none' } : {}}>
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
                onClick={handleStop}
                disabled={!apiAvailable || (!isProcessing && queuedCount === 0)}
              >
                Stop
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleClear}
              >
                Clear
              </button>
            </div>
            <div className={styles.compileStatus}>
              <span>{compileStateLabel}</span>
              {isCompiling && <progress value={compileProgressPercent} max={100} />}
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

              {model === "custom" && (
                <div className={styles.customModelSection}>
                  <label className={styles.selectorLabel}>
                    <span>Custom Model</span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleSelectModelFile}
                      disabled={!apiAvailable}
                    >
                      Select Model File
                    </button>
                  </label>
                  {customModelPath && (
                    <div className={styles.selectedModelPath}>
                      <span className={styles.selectedModelLabel}>Selected:</span>
                      <span className={styles.selectedModelValue}>{customModelPath}</span>
                    </div>
                  )}
                </div>
              )}

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
                      d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm6.93 9h-2.61a15.25 15.25 0 0 0-1.17-5 8.06 8.06 0 0 1 3.78 5Zm-5.93 9.95a13.4 13.4 0 0 1-3.16-6.95h6.32a13.4 13.4 0 0 1-3.16 6.95ZM9.84 11a13.4 13.4 0 0 1 3.16-6.95A13.4 13.4 0 0 1 16.16 11Zm-1.02-5a15.25 15.25 0 0 0-1.17 5H5.04a8.06 8.06 0 0 1 3.78-5Zm-3.78 7h2.61a15.25 15.25 0 0 0-1.17 5 8.06 8.06 0 0 1-3.78-5Zm11.92 5a15.25 15.25 0 0 0 1.17-5h2.61a8.06 8.06 0 0 1-3.78 5Z"
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
                placeholder="Output will appear here."
                rows={14}
                readOnly
                value={consoleText}
              />
            </div>
          </main>
        </section>
      </div>
    </div>
  </>);
}

export default App;

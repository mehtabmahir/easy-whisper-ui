import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./styles/App.module.css";
import FirstLaunchLoader from "./FirstLaunchLoader";
import SettingsPanel from "./SettingsPanel";
import FaqPanel from "./FaqPanel";
import CreditsPanel from "./CreditsPanel";
import { LANGUAGE_CODES } from "./languages";
import ActionIcon from "./ActionIcon";
import LoadingBar from "./LoadingBar";
import { setupProgress } from "./setupProgress";
import ModelDownloadBar from "./ModelDownloadBar";
import type { GpuReadiness, HardwareInfo, ModelDownloadProgress } from "../types/easy-whisper";
import { DOWNLOADABLE_MODELS, modelMemoryStatus } from "../main/services/modelCatalog";
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

const MODEL_OPTIONS = [...DOWNLOADABLE_MODELS, "custom"];



const SUPPORTED_FILE_EXTENSIONS = new Set([
  "mp3",
  "mp4",
  "m4a",
  "mkv",
  "m4v",
  "wav",
  "mov",
  "avi",
  "ogg",
  "flac",
  "aac",
  "wma",
  "opus"
]);

const DEFAULT_ARGS = "-tp 0.0 -mc 64 -et 3.0";
const SETTINGS_KEY = "easy-whisper-ui.settings";
const LOGO_URL = "./icon.png";
const GITHUB_URL = "https://github.com/mehtabmahir/easy-whisper-ui/releases";
const WEBSITE_URL = "https://mehtab.work";
const DONATE_URL = "https://www.paypal.com/donate/?business=5FM6Y27A3CK58&no_recurring=0&currency_code=USD";

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

const THEME_KEY = "easy-whisper-ui.theme";
type Theme = "auto" | "light" | "dark";
function loadTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "auto";
  } catch {
    return "auto";
  }
}
document.documentElement.dataset.theme = loadTheme();
document.documentElement.dataset.platform = window.easyWhisper?.platform() ?? "unknown";

function App(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // The current session can still switch themes without storage.
    }
    void window.easyWhisper?.setTheme(theme).catch((error) => {
      console.error("Could not update native window appearance", error);
    });
  }, [theme]);
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
  const [openAfterComplete, setOpenAfterComplete] = useState<boolean>(persisted.openAfterComplete ?? true);
  const [extraArgs, setExtraArgs] = useState<string>(persisted.extraArgs ?? DEFAULT_ARGS);
  const cpuRequested = cpuOnly || /(?:^|\s)(?:--no-gpu|-ng)(?=\s|$)/.test(extraArgs);
  const [customModelPath, setCustomModelPath] = useState<string | undefined>(persisted.customModelPath);
  const [platform, setPlatform] = useState<string>("...");
  const [arch, setArch] = useState<string>("...");
  const [hardware, setHardware] = useState<HardwareInfo>();
  const [hardwareFailed, setHardwareFailed] = useState(false);
  const [gpuReadiness, setGpuReadiness] = useState<GpuReadiness>();
  const [lastBackend, setLastBackend] = useState<string>();
  const [consoleLines, setConsoleLines] = useState<string[]>([]);
  const [helpText, setHelpText] = useState<string | null>(null);
  const [queueState, setQueueState] = useState<QueueState>({ awaiting: [], isProcessing: false });
  const [compileInfo, setCompileInfo] = useState<CompileProgressEvent>(() => ({
    step: "idle",
    message: "Whisper binaries not compiled",
    progress: 0,
    state: "pending"
  }));
  const [liveActive, setLiveActive] = useState<boolean>(false);
  const [liveChanging, setLiveChanging] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgress>();
  useEffect(() => window.easyWhisper?.onModelDownloadProgress((event) => {
    setModelDownloadProgress(event.state === "downloading" ? event : undefined);
  }), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [retryingSetup, setRetryingSetup] = useState(false);
  const [retryError, setRetryError] = useState<string>();
  const [helpRunning, setHelpRunning] = useState(false);
  const [skipRunning, setSkipRunning] = useState(false);
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
      setLoaderProgress(1);
      setLoaderMessage("Checking system requirements...");
      await new Promise(r => setTimeout(r, 600));

      // 2. Check for updates (simulate always up-to-date)
      setLoaderProgress(2);
      setLoaderMessage("Checking for updates...");
      await new Promise(r => setTimeout(r, 600));

      // 3. Setup desktop shortcut (simulate only if not present)
      let shortcutNeeded = false; // TODO: real check
      if (shortcutNeeded) {
        setLoaderProgress(3);
        setLoaderMessage("Setting up desktop shortcut...");
        await new Promise(r => setTimeout(r, 600));
      }

      // 4. Register uninstall entry (simulate only if not present)
      let uninstallNeeded = false; // TODO: real check
      if (uninstallNeeded) {
        setLoaderProgress(50);
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
          setLoaderProgress(3);
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

        setLoaderProgress(50);
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

  useEffect(() => {
    let cancelled = false;
    if (api) void api.getHardwareInfo().then((info) => {
      if (!cancelled) setHardware(info);
    }).catch(() => { if (!cancelled) setHardwareFailed(true); });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    if (api && !cpuRequested && compileInfo.state === "success" && !queueState.isProcessing) void api.checkGpuReadiness().then((result) => {
      if (!cancelled) setGpuReadiness(result);
    }).catch(() => {
      if (!cancelled) setGpuReadiness({ state: "unverified", message: "GPU readiness could not be checked." });
    });
    return () => { cancelled = true; };
  }, [api, cpuRequested, compileInfo.state, queueState.isProcessing]);

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
      if (event.source === "transcription" || event.source === "live") {
        if (/use gpu\s*=/.test(event.message)) setLastBackend(undefined);
        const backend = event.message.match(/whisper_backend_init_gpu:\s+using (.+?) backend/);
        if (backend) setLastBackend(`GPU (${backend[1]})`);
        if (/whisper_backend_init_gpu:\s+(?:no GPU found|failed to initialize)/.test(event.message)) setLastBackend("CPU");
      }
      setHelpText(null);
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
    if (compileInfo.state === "error") {
      setSettingsOpen(false);
      setFaqOpen(false);
      setCreditsOpen(false);
      setRecoveryOpen(true);
    } else if (compileInfo.state === "success") {
      setRecoveryOpen(false);
    }
  }, [compileInfo]);

  async function retrySetup() {
    if (!api || retryingSetup) return;
    setRetryingSetup(true);
    setRetryError(undefined);
    try {
      const result = await api.cleanReinstall();
      if (!result.success && !result.canceled) setRetryError(result.error ?? "Reinstall failed. Try again.");
    } catch (error) { setRetryError((error as Error).message); }
    finally { setRetryingSetup(false); }
  }

  useEffect(() => {
    if (!showLoader) return;
    if (compileInfo.state === "running") {
      compileRanRef.current = true;
      const stepProgress = setupProgress(compileInfo).progress;
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
      node.scrollTop = helpText !== null ? 0 : node.scrollHeight;
      node.scrollLeft = 0;
    }
  }, [consoleText, helpText]);

  const ensureCustomModelReady = useCallback(() => {
    if (model !== "custom") {
      return true;
    }
    if (!customModelPath) {
      appendConsole("[system] Select a custom model file before starting.");
      return false;
    }
    return true;
  }, [appendConsole, customModelPath, model]);

  const handleSelectModelFile = useCallback(async () => {
    const bridge = window.easyWhisper;
    if (!bridge || !bridge.openModelFile) {
      appendConsole("[system] Custom model picker unavailable.");
      return;
    }

    try {
      const selected = await bridge.openModelFile();
      if (!selected) {
        return;
      }
      setCustomModelPath(selected);
      setModel("custom");
      appendConsole(`[system] Custom model selected: ${selected}`);
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole]);

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

  useEffect(() => {
    const bridge = window.easyWhisper;
    if (!bridge?.rendererReady) {
      return;
    }
    void bridge.rendererReady().catch(() => {
      // Swallow renderer-ready handshake failures; main will retry via events.
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
    customModelPath: model === "custom" ? customModelPath : undefined
  }), [model, language, cpuOnly, outputTxt, outputSrt, openAfterComplete, extraArgs, customModelPath]);

  const enqueueFiles = useCallback((files: string[]) => {
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    if (!ensureCustomModelReady()) {
      return;
    }
    try {
      bridge.enqueueTranscriptions({ files, settings: buildSettings() });
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole, buildSettings, ensureCustomModelReady]);

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
      enqueueFiles(files);
    } catch (error) {
      const err = error as Error;
      appendConsole(`[system] ${err.message}`);
    }
  }, [appendConsole, enqueueFiles]);

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files ?? [])
        .map((file) => (file as File & { path?: string }).path)
        .filter((filePath): filePath is string => Boolean(filePath))
        .filter((filePath) => {
          const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
          return SUPPORTED_FILE_EXTENSIONS.has(ext);
        });

      if (files.length === 0) {
        return;
      }

      const unique = Array.from(new Set(files));
      enqueueFiles(unique);
      appendConsole(`[system] Added ${unique.length} file(s) from drag and drop.`);
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [appendConsole, enqueueFiles]);

  useEffect(() => {
    const bridge = window.easyWhisper;
    if (!bridge?.onExternalFiles) {
      return;
    }

    const remove = bridge.onExternalFiles((files) => {
      if (!files || files.length === 0) {
        return;
      }
      enqueueFiles(files);
      appendConsole(`[system] Added ${files.length} file(s) from Open With.`);
    });

    return remove;
  }, [appendConsole, enqueueFiles]);

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
    setHelpText(null);
  }, []);

  const handleHelp = async () => {
    if (!api || helpRunning) return;
    setHelpText(null);
    setHelpRunning(true);
    try {
      const result = await api.showHelp();
      if (result.success) setHelpText(result.output ?? "No help output returned.");
      else { setHelpText(null); appendConsole(`[system] ${result.error}`); }
    } catch (error) { appendConsole(`[system] ${(error as Error).message}`); }
    finally { setHelpRunning(false); }
  };

  const handleSkip = async () => {
    if (!api || skipRunning) return;
    setSkipRunning(true);
    try { await api.skipCurrent(); }
    catch (error) { appendConsole(`[system] ${(error as Error).message}`); }
    finally { setSkipRunning(false); }
  };

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
    if (liveChanging) return;
    const bridge = window.easyWhisper;
    if (!bridge) {
      appendConsole("[system] Preload bridge unavailable.");
      return;
    }
    if (!ensureCustomModelReady()) {
      return;
    }
    setLiveChanging(true);
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
    } finally {
      setLiveChanging(false);
    }
  }, [appendConsole, buildSettings, ensureCustomModelReady, liveActive, liveChanging]);

  const compileStateLabel = useMemo(() => {
    if (compileInfo.state === "success") return "Ready";
    if (compileInfo.state === "error" && compileInfo.error) {
      return `${compileInfo.message} (${compileInfo.error})`;
    }
    return compileInfo.message;
  }, [compileInfo]);

  const compileProgressPercent = useMemo(() => setupProgress(compileInfo).progress, [compileInfo]);

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
  const modelMemory = model.startsWith("tiny") ? { label: "273 MB", gib: 273 / 1024 }
    : model.startsWith("base") ? { label: "388 MB", gib: 388 / 1024 }
    : model.startsWith("small") ? { label: "852 MB", gib: 852 / 1024 }
    : model.startsWith("medium") ? { label: "2.1 GB", gib: 2.1 }
    : model === "large-v3" ? { label: "3.9 GB", gib: 3.9 } : undefined;
  const memoryStatus = modelMemoryStatus(modelMemory?.gib, hardware);
  const canReopenSetup = isCompiling || compileInfo.state === "error";
  const reopenSetup = () => { setRetryError(undefined); setRecoveryOpen(true); };
  const showOperationStatus = isCompiling || compileInfo.state === "error" || isProcessing || helpRunning || liveChanging || skipRunning || Boolean(modelDownloadProgress && !settingsOpen);
  const operationStatus = (
    <div className={`${styles.compileStatus} ${canReopenSetup ? styles.clickableProgress : ""}`}
      role={canReopenSetup ? "button" : undefined}
      tabIndex={canReopenSetup ? 0 : undefined}
      aria-label={canReopenSetup ? "Show Whisper setup" : undefined}
      aria-haspopup={canReopenSetup ? "dialog" : undefined}
      title={canReopenSetup ? "Show Whisper setup" : undefined}
      onClick={canReopenSetup ? reopenSetup : undefined}
      onKeyDown={canReopenSetup ? event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reopenSetup(); }
      } : undefined}>
      {compileInfo.state === "error" && <span role="alert" title={compileStateLabel}>{compileInfo.message || "Setup failed. See console for details."}</span>}
      {isCompiling && <LoadingBar label="Whisper setup" {...setupProgress(compileInfo)} />}
      {modelDownloadProgress && !settingsOpen && <ModelDownloadBar progress={modelDownloadProgress} />}
      {isProcessing && !modelDownloadProgress && <LoadingBar key={queueState.processing} label="Transcription" paceSeconds={180} />}
      {helpRunning && <LoadingBar label="Loading help" paceSeconds={4} />}
      {liveChanging && <LoadingBar label="Preparing live transcription" paceSeconds={60} />}
      {skipRunning && <LoadingBar label="Skipping file" paceSeconds={4} />}
    </div>
  );


  return (
    <>
      {(showLoader || recoveryOpen) && (
        <FirstLaunchLoader
          progress={recoveryOpen ? setupProgress(compileInfo).progress : loaderProgress}
          estimateLimit={setupProgress(compileInfo).estimateLimit}
          paceSeconds={setupProgress(compileInfo).paceSeconds}
          failed={compileInfo.state === "error"}
          message={retryError ?? (recoveryOpen ? compileInfo.message : loaderMessage)}
          canContinue={recoveryOpen || canContinue}
          onContinue={() => { setRecoveryOpen(false); handleLoaderContinue(); }}
          onReinstall={!isMac ? () => void retrySetup() : undefined}
          reinstalling={retryingSetup}
        />
      )}
      {settingsOpen && <SettingsPanel busy={isCompiling || isProcessing || liveActive || queuedCount > 0}
        progress={compileInfo} onClose={() => setSettingsOpen(false)} />}
      {faqOpen && <FaqPanel onClose={() => setFaqOpen(false)} />}
      {creditsOpen && <CreditsPanel onClose={() => setCreditsOpen(false)} />}
      <div className={`${styles.windowContainer} ${showLoader || recoveryOpen || settingsOpen || faqOpen || creditsOpen ? styles.modalBackground : ""}`} style={showLoader || recoveryOpen ? { pointerEvents: 'none', userSelect: 'none' } : {}}>
        <div className={`${styles.titlebar} ${isMac ? styles.macTitlebar : ""}`}>
        <div className={styles.titleDragRegion}>
          <img src={LOGO_URL} alt="EasyWhisperUI logo" className={styles.titleLogo} />
          <span className={styles.titleText}>EasyWhisperUI</span>
        </div>
        <div className={styles.titleControls}>
          <button
            type="button"
            className={styles.themeToggle}
            aria-label={`Theme: ${theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}`}
            title={theme === "auto" ? "Following system appearance. Switch to light mode" : theme === "light" ? "Switch to dark mode" : "Switch to automatic appearance"}
            onClick={() => setTheme((current) => current === "auto" ? "light" : current === "light" ? "dark" : "auto")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              {theme === "auto" ? <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" /></> : theme === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />}
            </svg>
            <span>{theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}</span>
          </button>
          {!isMac && (
            <>
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
            </>
          )}
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
          <div className={styles.hardwareStatus}>
            <span className={styles.status}>{statusText}</span>
            <details className={styles.hardwareDetails}>
              <summary>
                {hardware?.gpus.length ? hardware.gpus.map(gpu => `${gpu.name}${gpu.memoryGiB !== undefined ? ` · ${Number(gpu.memoryGiB.toFixed(1))} GB ${gpu.memoryKind === "unified" ? "unified memory" : gpu.memoryKind === "shared" ? "shared memory" : "VRAM"}` : " · VRAM unknown"}`).join(" / ")
                  : hardware || hardwareFailed ? "GPU information unavailable" : "Detecting GPU…"}
              </summary>
              <div className={styles.hardwarePopover}>
                {hardware && <p>{hardware.cpu} · {Number(hardware.ramGiB.toFixed(1))} GB system RAM</p>}
                <p>{cpuRequested ? "CPU only" : lastBackend ? `Backend: ${lastBackend}` : gpuReadiness?.message || "Checking GPU…"}</p>
              </div>
            </details>
            <span className={styles.processingMode} title={gpuReadiness?.message}>
              GPU Acceleration: <span className={!cpuRequested && gpuReadiness?.state === "ready" ? styles.gpuReady : undefined}>
                {cpuRequested ? "Disabled (CPU only)" : gpuReadiness?.state === "unavailable" ? "Unavailable (CPU)" : !gpuReadiness ? "Checking…" : gpuReadiness.state === "ready" ? "Ready" : "Not verified"}
              </span>
              {lastBackend ? ` · Last run: ${lastBackend}` : ""}
            </span>
          </div>
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
                <ActionIcon name="open" /> Open
              </button>
              <button
                type="button"
                className={`${styles.controlButton} ${styles.liveButton}`}
                onClick={handleLiveToggle}
                aria-pressed={liveActive}
                disabled={!apiAvailable || liveChanging}
              >
                <ActionIcon name={liveActive ? "stop" : "live"} />
                {liveActive ? "Stop Live" : "Live"}
                <span className={styles.betaLabel}>BETA</span>
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleHelp}
                disabled={!apiAvailable || isCompiling || helpRunning}
              >
                <ActionIcon name="help" />
                {helpRunning ? "Loading…" : "Help"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleClear}
              >
                <ActionIcon name="clear" /> Clear
              </button>
              <button type="button" className={styles.secondaryButton} onClick={handleStop}
                title="Stop processing and clear the queue"
                disabled={!apiAvailable || (!isProcessing && queuedCount === 0)}><ActionIcon name="stop" /> Stop</button>
              <button type="button" className={styles.secondaryButton} onClick={handleSkip}
                title="Skip the current file and continue the queue"
                disabled={!apiAvailable || !isProcessing || skipRunning}><ActionIcon name="skip" /> Skip</button>
              <button type="button" className={`${styles.secondaryButton} ${styles.settingsButton}`}
                onClick={() => setSettingsOpen(true)} aria-haspopup="dialog" aria-expanded={settingsOpen}>
                <ActionIcon name="settings" /> Settings
              </button>
            </div>
            {!showOperationStatus && compileInfo.state === "success" && <div className={styles.compileStatus}><span className={styles.gpuReady}>Ready</span></div>}

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

              <p className={`${styles.modelMemoryHint} ${memoryStatus === "red" ? styles.vramWarning : memoryStatus === "yellow" ? styles.vramCaution : memoryStatus === "green" ? styles.vramFits : ""}`}
                title="Estimated requirement; actual use varies. Red: exceeds GPU memory. Yellow: less than 1 GB spare. Green: at least 1 GB spare. Integrated GPUs use a budget of 70% of system RAM; unknown memory stays neutral.">
                Required VRAM: {modelMemory?.label ?? "Unknown"}
              </p>

              <div>
              <div className={styles.selectorLabel}>
                <div className={styles.selectorHeading}>
                  <label htmlFor="input-language">Input language</label>
                  <details className={styles.languageInfo}>
                    <summary aria-label="About input language" title="About input language">i</summary>
                    <p id="input-language-help">
                      Language spoken in your audio or video. Non-English audio needs a multilingual model; .en models are English-only.
                    </p>
                  </details>
                </div>
                <select id="input-language" value={language} aria-describedby="input-language-help input-language-warning"
                  onChange={(event) => setLanguage(event.target.value)}>
                  {Object.entries(LANGUAGE_CODES).map(([name, code]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <p id="input-language-warning" className={styles.languageWarning} role="status">
                {language !== "en" && model.endsWith(".en")
                  ? `Choose a multilingual model such as ${model.slice(0, -3)} for this language.` : ""}
              </p>
              </div>
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
            </div>
            <div className={styles.infoButtons}>
            <button type="button" className={styles.faqButton} onClick={() => setCreditsOpen(true)}
              aria-haspopup="dialog" aria-expanded={creditsOpen}>Credits</button>
            <button type="button" className={styles.faqButton} onClick={() => setFaqOpen(true)}
              aria-label="Frequently asked questions" aria-haspopup="dialog" aria-expanded={faqOpen}
              title="How to use your transcript">
              <ActionIcon name="help" /><span>FAQ</span>
            </button>
            </div>
            <div className={styles.linkCluster}>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className={styles.socialButton}
                title="Download the latest EasyWhisperUI release"
              >
                <svg className={styles.socialIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.17-1.11-1.48-1.11-1.48-.91-.62.07-.61.07-.61 1 .07 1.52 1.04 1.52 1.04.9 1.52 2.36 1.08 2.94.83.09-.65.35-1.08.64-1.33-2.22-.25-4.55-1.11-4.55-4.95 0-1.09.39-1.99 1.03-2.69-.1-.26-.45-1.29.1-2.68 0 0 .85-.27 2.78 1.03a9.63 9.63 0 0 1 5.06 0c1.93-1.3 2.78-1.03 2.78-1.03.55 1.39.2 2.42.1 2.68.64.7 1.03 1.6 1.03 2.69 0 3.85-2.33 4.69-4.56 4.94.36.31.68.92.68 1.86 0 1.34-.01 2.42-.01 2.75 0 .26.18.58.69.48A10 10 0 0 0 12 2Z"
                  />
                </svg>
                <span>Update</span>
              </a>
              <a
                href={DONATE_URL}
                target="_blank"
                rel="noreferrer"
                className={styles.socialButton}
                title="Support development via PayPal"
              >
                <svg className={styles.socialIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
                  />
                </svg>
                <span>Donate</span>
              </a>
              <a
                href={WEBSITE_URL}
                target="_blank"
                rel="noreferrer"
                className={styles.socialButton}
                title="Visit mehtab.work"
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
          </aside>

          <main className={`${styles.rightPanel} ${showOperationStatus ? styles.operationActive : ""}`}>
            <div className={styles.argumentsBlock}>
              <label htmlFor="arguments">Arguments</label>
              <textarea
                id="arguments"
                placeholder="Example: --temperature 0.6 --max-context 1"
                rows={1}
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

            {showOperationStatus && operationStatus}
            <div className={styles.consoleBlock}>
              <label htmlFor="console">Output</label>
              <div className={styles.consoleSurface}>
              <textarea
                ref={consoleRef}
                id="console"
                className={styles.consoleArea}
                placeholder="Output will appear here."
                rows={14}
                wrap={helpText !== null ? "off" : "soft"}
                readOnly
                value={helpText ?? consoleText}
              />
              </div>
            </div>
          </main>
        </section>
      </div>
    </div>
  </>);
}

export default App;

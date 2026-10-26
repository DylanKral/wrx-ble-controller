import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useBluetooth } from "./BluetoothContext";
import { Scheduler } from "../animations/scheduler";
import { CalibrationEngine } from "../calibration/CalibrationEngine";
import {
  fixedProfiles,
  loadStudio,
  saveStudio,
  type Studio,
} from "../storage/migrations";
import { loadLegacy, type LegacyState } from "../storage/legacy";
import { colorBytes, modeBytes } from "../bluetooth/commands";
import { Simulator } from "../simulation/Simulator";
import {
  PlaybackOutput,
  isOutputMode,
  type OutputMode,
} from "../simulation/PlaybackOutput";
import {
  getBrowserStorage,
  keys,
  readText,
  writeJSON,
} from "../storage/persistence";
import type { Profile, Step } from "../animations/types";
import { durationFactor, resolveStepTiming } from "../animations/timing";
import { validMode } from "../animations/types";
import { validNativeSpeed } from "../animations/nativeSpeed";
import {
  loadNativeSpeedPreferences,
  nativeSpeedFor,
  type NativeSpeedPreferences,
} from "../storage/nativeSpeedPreferences";

function useApplication() {
  const { manager } = useBluetooth();
  const [storageInfo] = useState(getBrowserStorage);
  const { storage } = storageInfo;
  const [loaded] = useState(() => loadStudio(storage));
  const [loadedLegacy] = useState(() => loadLegacy(storage));
  const [studio, setStudio] = useState(loaded.studio),
    [dataWarning, setWarning] = useState(
      [loaded.warning, loadedLegacy.warning].filter(Boolean).join("\n"),
    );
  const [legacy, setLegacy] = useState(loadedLegacy.state);
  const [colorRevision, setColorRevision] = useState(0);
  const [autoRestore, setAutoState] = useState(
    () => readText(storage, keys.autoRestore) !== "off",
  );
  const [staticColor, setStaticState] = useState(() => {
    const c = readText(storage, keys.staticColor);
    return /^#[0-9a-f]{6}$/i.test(c) ? c : "#ff0000";
  });
  const [tab, setTabState] = useState<"basic" | "custom">(() =>
    readText(storage, keys.tab) === "basic" ? "basic" : "custom",
  );
  const [outputMode, setOutputState] = useState<OutputMode>(() => {
    const saved = readText(storage, keys.outputMode);
    return isOutputMode(saved) ? saved : "combined";
  });
  const [nativeSpeedPreferences, setSpeedPreferences] = useState(() =>
    loadNativeSpeedPreferences(storage),
  );
  const speedPreferencesRef = useRef(nativeSpeedPreferences);
  function getNativeSpeed(mode: number) {
    return nativeSpeedFor(speedPreferencesRef.current, mode);
  }
  function getSpeedTimeFactor(mode: number, speed: number) {
    return durationFactor(mode, speed, speedPreferencesRef.current.corrections);
  }
  function getStepTiming(step: Step, profile: Profile) {
    return resolveStepTiming(
      step,
      profile,
      getNativeSpeed,
      getSpeedTimeFactor,
      speedPreferencesRef.current.bundledFollow,
    );
  }
  const [simulator] = useState(() => {
    const saved =
      [
        readText(storage, keys.selectedColor),
        readText(storage, keys.staticColor),
        readText(storage, "wrx-visual-demo-selected-color"),
      ].find((color) => /^#[0-9a-f]{6}$/i.test(color)) ?? "#ff0000";
    return new Simulator(
      saved,
      (color) => preference(keys.selectedColor, color),
      undefined,
      getSpeedTimeFactor,
    );
  });
  const [output] = useState(
    () => new PlaybackOutput(manager, simulator, outputMode),
  );
  const [scheduler] = useState(
    () =>
      new Scheduler(
        (bytes, valid, options) => output.send(bytes, valid, options),
        undefined,
        getNativeSpeed,
        getStepTiming,
      ),
  );
  const [calibration] = useState(
    () =>
      new CalibrationEngine(
        output,
        storage,
        undefined,
        output.observe,
        getNativeSpeed,
      ),
  );
  const playback = useSyncExternalStore(
    scheduler.subscribe,
    scheduler.getSnapshot,
  );
  const delivery = useSyncExternalStore(output.subscribe, output.getSnapshot);
  const calibrationState = useSyncExternalStore(
    calibration.subscribe,
    calibration.getSnapshot,
  );
  const [message, setMessage] = useState(
    "v9 ready: Basic/Custom tabs, saved custom presets, solid RGB, and compact Bluetooth connections.",
  );
  const [activity, setActivity] = useState<string[]>(["Ready."]);
  function notify(msg: string) {
    setMessage(msg);
    setActivity((a) =>
      [new Date().toLocaleTimeString() + " · " + msg, ...a].slice(0, 80),
    );
  }
  function updateStudio(value: Studio, imported = false) {
    if (dataWarning && !imported) {
      notify(
        "Saved data needs attention. Export a backup before making changes.",
      );
      return;
    }
    try {
      saveStudio(storage, value);
      setStudio(value);
      if (imported) setWarning("");
    } catch (e) {
      notify("Could not save changes; export a backup. " + String(e));
    }
  }
  function updateLegacy(value: LegacyState) {
    if (loadedLegacy.warning) {
      notify(loadedLegacy.warning);
      return;
    }
    try {
      writeJSON(storage, keys.favorites, {
        presets: value.presets,
        selected: value.selected,
      });
      writeJSON(storage, keys.playlists, {
        items: value.items,
        active: value.active,
        steps: value.steps,
      });
      setLegacy(value);
    } catch (e) {
      notify("Could not save favorites/playlists: " + String(e));
    }
  }
  function preference(key: string, value: string) {
    try {
      storage.setItem(key, value);
    } catch {
      notify("Browser storage unavailable; preference may not persist.");
    }
  }
  function saveSpeedPreferences(next: NativeSpeedPreferences) {
    speedPreferencesRef.current = next;
    setSpeedPreferences(next);
    try {
      writeJSON(storage, keys.nativeSpeed, next);
    } catch {
      notify(
        "Native speed settings could not be saved; export a backup before closing.",
      );
    }
  }
  function setNativeSpeed(mode: number, speed: number) {
    if (!validMode(mode) || !validNativeSpeed(speed)) return;
    const current = speedPreferencesRef.current;
    saveSpeedPreferences({
      ...current,
      ...(current.scope === "global"
        ? { globalSpeed: speed }
        : { speeds: { ...current.speeds, [mode]: speed } }),
    });
  }
  function setSpeedScope(scope: NativeSpeedPreferences["scope"]) {
    saveSpeedPreferences({ ...speedPreferencesRef.current, scope });
  }
  function setBundledFollow(bundledFollow: boolean) {
    saveSpeedPreferences({ ...speedPreferencesRef.current, bundledFollow });
  }
  function setTimingCorrection(mode: number, correction: number) {
    if (
      !validMode(mode) ||
      !Number.isFinite(correction) ||
      correction < 0.25 ||
      correction > 4
    )
      return;
    saveSpeedPreferences({
      ...speedPreferencesRef.current,
      corrections: {
        ...speedPreferencesRef.current.corrections,
        [mode]: correction,
      },
    });
  }
  function setRainbow(color: string) {
    preference(keys.rainbow, color);
    setColorRevision((r) => r + 1);
  }
  function setStaticColor(color: string) {
    setStaticState(color);
    simulator.setSelectedColor(color);
    preference(keys.staticColor, color);
  }
  function setTab(value: "basic" | "custom") {
    setTabState(value);
    preference(keys.tab, value);
  }
  function setAutoRestore(value: boolean) {
    setAutoState(value);
    manager.setRestoreEnabled(value);
    preference(keys.autoRestore, value ? "on" : "off");
  }
  function stop(reason?: string) {
    scheduler.stop(reason);
    output.cancelPending();
    calibration.abort(reason);
    simulator.pause();
  }
  function setOutputMode(mode: OutputMode) {
    stop("Playback output changed; active experiments stopped.");
    output.setMode(mode);
    setOutputState(mode);
    preference(keys.outputMode, mode);
    simulator.color(simulator.state.selectedColor);
  }
  const canPlay =
    outputMode !== "hardware" || manager.isUp("left") || manager.isUp("right");
  async function applyColor(color: string) {
    stop("Applying static color.");
    if (!canPlay) {
      notify("Connect at least one tail light first.");
      return;
    }
    await output.send(colorBytes(color));
    notify("Static RGB " + color.toUpperCase() + " · " + output.statusText());
  }
  function play(profile: Profile, repeats?: number) {
    if (!canPlay) {
      notify("Connect at least one tail light first.");
      return;
    }
    calibration.abort("Profile playback started.");
    output.cancelPending();
    notify(
      (profile.experimental ? "TEST: " : "") +
        profile.name +
        " · " +
        (profile.repeat ? "repeating" : "once"),
    );
    void scheduler.start(profile, repeats).then(() => {
      if (!scheduler.state) notify(scheduler.message);
    });
  }
  function startCalibration(...args: Parameters<CalibrationEngine["start"]>) {
    if (!output.hardwareEnabled) {
      notify(
        "Calibration timing tests require Hardware Only or Combined output.",
      );
      return;
    }
    scheduler.stop("Calibration started.");
    output.cancelPending();
    void calibration.start(...args);
  }
  useEffect(() => {
    output.syncConnections();
  }, [output, manager.state.revision]);
  useEffect(() => {
    const off = manager.onDisconnect((side) => {
      if (output.mode === "hardware")
        scheduler.stop("Bluetooth " + side + " disconnected.");
      calibration.abort("Bluetooth " + side + " disconnected during test.");
    });
    const visibility = () => {
      if (document.hidden) {
        output.cancelPending();
        simulator.pause();
        scheduler.stop(
          "Browser hidden; timer stopped. Last factory effect may continue internally.",
        );
        calibration.abort(
          "Page hidden; test stopped to avoid inaccurate timing.",
        );
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      off();
      document.removeEventListener("visibilitychange", visibility);
      scheduler.stop();
      calibration.dispose();
      manager.dispose();
    };
  }, [manager, scheduler, calibration, simulator, output]);
  useEffect(() => {
    manager.setRestoreEnabled(autoRestore);
    if (!autoRestore) return;
    const timer = setTimeout(
      () =>
        void manager.restoreDevices(true).then((found) => {
          notify(
            found
              ? "Attempted saved-device reconnection."
              : "Automatic lookup unavailable or no saved devices. Use Connect.",
          );
        }),
      400,
    );
    return () => clearTimeout(timer);
  }, [manager, autoRestore]);
  useEffect(() => {
    if (manager.state.message !== "Ready.") notify(manager.state.message);
  }, [manager.state.message]);
  async function playModeOnce(mode: number) {
    stop();
    if (!canPlay) {
      notify("Connect at least one tail light first.");
      return;
    }
    await output.send(modeBytes(mode, getNativeSpeed(mode)), undefined, {
      restart: true,
    });
    notify(`Mode ${mode} requested once · ${output.statusText()}`);
  }
  async function applyNativeSpeed(mode: number) {
    if (calibrationState.running) {
      notify("Stop the calibration test before reissuing a mode.");
      return;
    }
    if (!canPlay) {
      notify("Connect at least one tail light first.");
      return;
    }
    const current = scheduler.state?.current;
    if (scheduler.state) {
      if (current?.type !== "mode" || current.mode !== mode) {
        notify(
          "Saved for future steps. To apply now, select the currently running Mode step.",
        );
        return;
      }
      scheduler.restartCurrentMode();
      notify(
        `Mode ${mode} speed apply queued through playback; its transition restarts from dispatch.`,
      );
      return;
    }
    output.cancelPending();
    await output.send(modeBytes(mode, getNativeSpeed(mode)), undefined, {
      restart: true,
    });
    notify(`Mode ${mode} speed request · ${output.statusText()}`);
  }
  const profiles = [...fixedProfiles(storage), ...studio.profiles];
  const warning = [dataWarning, storageInfo.warning].filter(Boolean).join("\n");
  void colorRevision;
  return {
    nativeSpeedPreferences,
    getNativeSpeed,
    setNativeSpeed,
    setSpeedScope,
    setBundledFollow,
    setTimingCorrection,
    getSpeedTimeFactor,
    getStepTiming,
    delivery,
    output,
    applyNativeSpeed,
    simulator,
    outputMode,
    setOutputMode,
    canPlay,
    playModeOnce,
    storage,
    studio,
    updateStudio,
    profiles,
    warning,
    legacy,
    updateLegacy,
    autoRestore,
    setAutoRestore,
    staticColor,
    setStaticColor,
    tab,
    setTab,
    setRainbow,
    scheduler,
    playback,
    calibration,
    calibrationState,
    startCalibration,
    message,
    notify,
    activity,
    setActivity,
    stop,
    applyColor,
    play,
  };
}
const AppContext = createContext<ReturnType<typeof useApplication> | null>(
  null,
);
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const value = useApplication();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error("Missing application provider");
  return app;
}

import {
  createContext,
  useContext,
  useEffect,
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
import { colorBytes } from "../bluetooth/commands";
import {
  getBrowserStorage,
  keys,
  readText,
  writeJSON,
} from "../storage/persistence";
import type { Profile } from "../animations/types";

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
  const [scheduler] = useState(
    () => new Scheduler((bytes, valid) => manager.send(bytes, valid)),
  );
  const [calibration] = useState(() => new CalibrationEngine(manager, storage));
  const playback = useSyncExternalStore(
    scheduler.subscribe,
    scheduler.getSnapshot,
  );
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
  function setRainbow(color: string) {
    preference(keys.rainbow, color);
    setColorRevision((r) => r + 1);
  }
  function setStaticColor(color: string) {
    setStaticState(color);
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
    calibration.abort(reason);
  }
  async function applyColor(color: string) {
    stop("Applying static color.");
    if (!manager.isUp("left") && !manager.isUp("right")) {
      notify("Connect at least one tail light first.");
      return;
    }
    const ok = await manager.send(colorBytes(color));
    notify(
      ok
        ? "Static RGB " + color.toUpperCase() + " requested; verify lights"
        : "Static color write failed. Verify lights.",
    );
  }
  function play(profile: Profile, repeats?: number) {
    if (!manager.isUp("left") && !manager.isUp("right")) {
      notify("Connect at least one tail light first.");
      return;
    }
    calibration.abort("Profile playback started.");
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
    scheduler.stop("Calibration started.");
    void calibration.start(...args);
  }
  useEffect(() => {
    const off = manager.onDisconnect((side) => {
      scheduler.stop("Bluetooth " + side + " disconnected.");
      calibration.abort("Bluetooth " + side + " disconnected during test.");
    });
    const visibility = () => {
      if (document.hidden) {
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
  }, [manager, scheduler, calibration]);
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
  const profiles = [...fixedProfiles(storage), ...studio.profiles];
  const warning = [dataWarning, storageInfo.warning].filter(Boolean).join("\n");
  void colorRevision;
  return {
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

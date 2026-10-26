import { useState } from "react";
import { speedObservations } from "../animations/nativeSpeed";
import { timingSource } from "../animations/timing";
import { useApp } from "../context/AppContext";
import {
  calibratedRecords,
  calibrationByMode,
} from "../simulation/calibrations";

export function NativeSpeedControls() {
  const app = useApp(),
    [mode, setMode] = useState(4),
    speed = app.getNativeSpeed(mode);
  const locked = app.calibrationState.running,
    prefs = app.nativeSpeedPreferences;
  const factor = app.getSpeedTimeFactor(mode, speed),
    capture = calibrationByMode.get(mode)!.cycleSeconds;
  const observed = speedObservations[mode];
  return (
    <details className="sim-tools native-speed-tools">
      <summary>Native animation speed</summary>
      <label className="field">
        Speed scope
        <select
          aria-label="Speed scope"
          value={prefs.scope}
          disabled={locked}
          onChange={(e) =>
            app.setSpeedScope(e.target.value as typeof prefs.scope)
          }
        >
          <option value="global">Linked · global speed for all modes</option>
          <option value="per-mode">Independent · saved speed per mode</option>
        </select>
      </label>
      <p>
        {prefs.scope === "global"
          ? "Global speed applies to every Mode step. Independent speeds remain saved."
          : "Each Mode step uses its own saved byte. Changing one mode leaves the others at their saved speeds."}
      </p>
      <label className="field">
        Factory mode
        <select
          aria-label="Native speed mode"
          value={mode}
          disabled={locked}
          onChange={(e) => setMode(Number(e.target.value))}
        >
          {calibratedRecords.map((record) => (
            <option key={record.mode} value={record.mode}>
              Mode {record.mode} · {record.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {prefs.scope === "global" ? "Global" : `Mode ${mode}`} native speed byte
        (1–255)
        <input
          type="number"
          aria-label="Native speed byte"
          min={1}
          max={255}
          step={1}
          value={speed}
          disabled={locked}
          onChange={(e) => app.setNativeSpeed(mode, Number(e.target.value))}
        />
      </label>
      <input
        className="native-speed-range"
        type="range"
        aria-label="Native speed slider"
        min={1}
        max={255}
        step={1}
        value={speed}
        disabled={locked}
        onChange={(e) => app.setNativeSpeed(mode, Number(e.target.value))}
      />
      <p>
        Next request: {speed} · 0x
        {speed.toString(16).padStart(2, "0").toUpperCase()}. Default: 129 ·
        0x81.
      </p>
      <button
        className="primary"
        type="button"
        disabled={!app.canPlay || locked}
        onClick={() => void app.applyNativeSpeed(mode)}
      >
        Apply speed and reissue mode
      </button>
      <p>
        Editing saves speed for future steps. Apply restarts the selected mode
        now. During a sequence, select its current Mode step; playback rebases
        that step’s deadline from dispatch.
      </p>
      <label className="sim-repeat">
        <input
          type="checkbox"
          aria-label="Follow Animation Speed for bundled Custom presets"
          checked={prefs.bundledFollow}
          disabled={locked}
          onChange={(e) => app.setBundledFollow(e.target.checked)}
        />{" "}
        Follow Animation Speed · bundled Custom presets
      </label>
      <p>
        Personal profiles keep fixed times until enabled in Profile Studio. RGB
        delays and Wait steps remain fixed unless explicitly linked there.
      </p>
      <p className="native-speed-estimate" data-testid="timing-estimate">
        {timingSource(mode)} · duration factor {factor.toFixed(3)}×.
        <br />
        Reference capture: {capture.toFixed(2)}s · effective capture:{" "}
        {(capture * factor).toFixed(3)}s.
        {observed && (
          <>
            {" "}
            Estimated {observed.metric}:{" "}
            {(observed.reference * factor).toFixed(3)}s.
          </>
        )}
      </p>
      {app.playback?.timing && (
        <p>
          Current step
          {app.playback.current?.type === "mode"
            ? ` · Mode ${app.playback.current.mode}`
            : ""}
          : reference {(app.playback.timing.referenceMs / 1000).toFixed(2)}s ·
          effective {(app.playback.timing.effectiveMs / 1000).toFixed(3)}s.
          Saved changes affect future steps until Apply.
        </p>
      )}
      {mode === 10 && (
        <p>
          Mode 10 remains a 2.50s captured window, not a whole breathing cycle
          (~3.54s at reference). Basic Breathe sends once; preview holds after
          the window.
        </p>
      )}
      <details>
        <summary>Timing model correction</summary>
        <label className="field">
          Mode {mode} response correction (0.25–4, default 1)
          <input
            aria-label="Timing response correction"
            type="number"
            min={0.25}
            max={4}
            step={0.05}
            value={prefs.corrections[mode] ?? 1}
            disabled={locked}
            onChange={(e) =>
              app.setTimingCorrection(mode, Number(e.target.value))
            }
          />
        </label>
        <p>
          Adjusts curve strength, preserving exactly 1× at byte 129. Saves for
          future requests. Unmeasured modes estimate the geometric mean of the
          observed Mode 4/10 relative responses.
        </p>
      </details>
      <p className="hint">
        All byte anchors are tentative: the recordings were not synchronized to
        BLE logs. Dispatch is a browser request timestamp; physical startup
        latency, restart behavior and phase alignment still need testing.
      </p>
    </details>
  );
}

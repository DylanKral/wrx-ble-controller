import { useId, useState } from "react";
import { speedObservations } from "../animations/nativeSpeed";
import { timingSource } from "../animations/timing";
import { useApp } from "../context/AppContext";
import {
  calibratedRecords,
  calibrationByMode,
} from "../simulation/calibrations";
import "../styles/native-speed.css";

export function NativeSpeedControls({ main = false }: { main?: boolean }) {
  const app = useApp(),
    id = useId();
  const [mode, setMode] = useState(4),
    [draft, setDraft] = useState<number | null>(null);
  const locked = app.calibrationState.running,
    prefs = app.nativeSpeedPreferences;
  const current = app.playback?.current;
  const playingMode = current?.type === "mode" ? current.mode : null;
  const targetMode = playingMode ?? mode;
  const speed = draft ?? app.getNativeSpeed(targetMode);
  const advancedSpeed = app.getNativeSpeed(mode);
  const factor = app.getSpeedTimeFactor(mode, advancedSpeed),
    capture = calibrationByMode.get(mode)!.cycleSeconds;
  const observed = speedObservations[mode];

  function applySpeed() {
    // Read the runner at the deliberate action, not at the start of a drag:
    // a short Custom cut may have changed modes while the slider was moving.
    const step = app.scheduler.state?.current;
    const activeMode = step?.type === "mode" ? step.mode : null;
    const target = activeMode ?? mode;
    const value = draft ?? app.getNativeSpeed(target);
    app.setNativeSpeed(target, value);
    setDraft(null);
    if (activeMode !== null) void app.applyNativeSpeed(activeMode);
    else app.notify("Animation speed saved for future Mode steps.");
  }

  const cutTiming = (
    <label className="speed-cut-timing">
      <input
        type="checkbox"
        checked={prefs.bundledFollow}
        disabled={locked}
        onChange={(e) => app.setBundledFollow(e.target.checked)}
      />
      <span>Automatically adjust preset cut timing</span>
    </label>
  );
  return (
    <div
      className="native-speed-controls"
      role="group"
      aria-label="Animation speed controls"
    >
      <div className="speed-heading">
        <label htmlFor={id}>
          Animation speed
          {prefs.scope === "per-mode" ? ` · Mode ${targetMode}` : ""}
        </label>
        <span className="speed-value" data-testid="selected-speed">
          {speed}
          {speed === 129 ? " · Reference" : ""}
        </span>
      </div>
      <div className="speed-slider-row">
        <input
          id={id}
          className="native-speed-range"
          type="range"
          aria-label="Animation speed"
          min={1}
          max={255}
          step={1}
          aria-valuetext={`${speed}${speed === 129 ? ", reference setting" : ""}`}
          value={speed}
          disabled={locked}
          onChange={(e) => setDraft(Number(e.target.value))}
        />
        <button
          type="button"
          disabled={locked || (playingMode !== null && !app.canPlay)}
          onClick={applySpeed}
        >
          {playingMode !== null ? "Apply speed" : "Save speed"}
        </button>
      </div>
      <div className="speed-scale" aria-hidden="true">
        <span>Slow</span>
        <span>129 · Reference</span>
        <span>Fast</span>
      </div>
      <p className="speed-hint">
        {draft !== null ? "Not applied yet. " : ""}
        {prefs.scope === "global"
          ? "Same speed for all animations."
          : "Individual speed per animation."}
        {playingMode !== null ? " Apply updates the current animation." : ""}
      </p>
      {main && app.tab === "custom" && cutTiming}
      <details className="speed-advanced">
        <summary>Advanced Settings</summary>
        <label className="field">
          Speed scope
          <select
            aria-label="Speed scope"
            value={prefs.scope}
            disabled={locked}
            onChange={(e) => {
              setDraft(null);
              app.setSpeedScope(e.target.value as typeof prefs.scope);
            }}
          >
            <option value="global">Same speed for all animations</option>
            <option value="per-mode">Individual speed per animation</option>
          </select>
        </label>
        <p>
          {prefs.scope === "global"
            ? "The shared speed applies to every Mode step. Individual speeds remain saved."
            : "Each Mode step uses its own saved speed. The main slider applies to the current animation, or the selected animation when idle."}
        </p>
        <label className="field">
          Animation for individual settings and calibration
          <select
            aria-label="Native speed mode"
            value={mode}
            disabled={locked}
            onChange={(e) => {
              setMode(Number(e.target.value));
              setDraft(null);
            }}
          >
            {calibratedRecords.map((record) => (
              <option key={record.mode} value={record.mode}>
                Mode {record.mode} · {record.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          {prefs.scope === "global" ? "Shared" : `Mode ${mode}`} speed byte
          (1–255)
          <input
            type="number"
            aria-label="Native speed byte"
            min={1}
            max={255}
            step={1}
            value={advancedSpeed}
            disabled={locked}
            onChange={(e) => {
              setDraft(null);
              app.setNativeSpeed(mode, Number(e.target.value));
            }}
          />
        </label>
        <p>
          Saved speed: {advancedSpeed} · 0x
          {advancedSpeed.toString(16).padStart(2, "0").toUpperCase()}.
          Reference: 129 · 0x81.
        </p>
        <button
          type="button"
          disabled={!app.canPlay || locked}
          onClick={() => void app.applyNativeSpeed(mode)}
        >
          Apply speed and reissue mode
        </button>
        <p>
          Advanced edits save settings for future steps. Reissue tests the
          selected animation now; during a sequence it must match the current
          Mode step.
        </p>
        {!main && cutTiming}
        <p>
          Automatic cut timing applies to bundled presets. Personal profiles
          keep their saved timing policy in Profile Studio. RGB delays and Wait
          steps stay fixed unless explicitly linked there.
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
            Current step{playingMode !== null ? ` · Mode ${playingMode}` : ""}:
            reference {(app.playback.timing.referenceMs / 1000).toFixed(2)}s ·
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
          All byte anchors are tentative. Physical startup latency, restart
          behavior and phase alignment still need testing.
        </p>
      </details>
    </div>
  );
}

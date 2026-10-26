import { useState } from "react";
import {
  speedObservations,
  provisionalDurationFactor,
} from "../animations/nativeSpeed";
import { useApp } from "../context/AppContext";
import {
  calibratedRecords,
  calibrationByMode,
} from "../simulation/calibrations";

export function NativeSpeedControls() {
  const app = useApp(),
    [mode, setMode] = useState(4),
    speed = app.getNativeSpeed(mode);
  const locked = app.calibrationState.running;
  const observed = speedObservations[mode],
    enabled = app.nativeSpeedPreferences.previewTiming[mode] === true;
  const factor = provisionalDurationFactor(mode, speed, enabled),
    capture = calibrationByMode.get(mode)!.cycleSeconds;
  return (
    <details className="sim-tools native-speed-tools">
      <summary>Native animation speed</summary>
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
        Native speed byte (1–255)
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
        disabled={!app.canPlay || app.calibrationState.running}
        onClick={() => void app.applyNativeSpeed(mode)}
      >
        Apply speed and reissue mode
      </button>
      <p>
        Changing this setting prepares the next mode request. Apply reissues the
        selected mode now. Custom dwell and cut times stay unchanged.
      </p>
      <label className="sim-repeat">
        <input
          type="checkbox"
          aria-label={`Use provisional timing for Mode ${mode}`}
          checked={enabled}
          disabled={!observed || locked}
          onChange={(e) => app.setSpeedTimingEnabled(mode, e.target.checked)}
        />{" "}
        Use provisional speed timing for this mode
      </label>
      {observed ? (
        <>
          <p className="native-speed-estimate">
            {enabled
              ? `Provisional duration factor: ${factor.toFixed(3)}× · captured preview window: ${(capture * factor).toFixed(3)}s.`
              : `Timing model off · original ${capture.toFixed(2)}s capture is unchanged.`}
          </p>
          {enabled && (
            <p>
              Estimated {observed.metric}: ~
              {(observed.reference * factor).toFixed(2)}s. This is{" "}
              {mode === 4
                ? "a light-transition measurement, not the complete Mode 4 animation"
                : "a full-cycle estimate, separate from the 75-frame capture"}
              .
            </p>
          )}
          <p>
            Anchor bytes 01 / 81 / FF are tentative: exact bytes were not
            recorded with the videos. The curve and speed-change restart
            behavior require physical verification.
          </p>
        </>
      ) : (
        <p>
          No speed-to-time measurements are available for this mode. Its preview
          timing is unchanged.
        </p>
      )}
      {mode === 10 && (
        <p>
          Mode 10 remains a 2.50s captured window. The measured reference
          breathing cycle is ~3.54s; the capture is not treated as a complete
          cycle.
        </p>
      )}
      <p>
        Preview assumes a restart when a reissued mode changes speed. Hardware
        may behave differently; this does not provide phase-locked
        synchronization.
      </p>
    </details>
  );
}

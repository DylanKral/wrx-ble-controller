import { useEffect, useId, useRef, useState } from "react";
import {
  SPEED_POSITIONS,
  nativeSpeedToPercent,
  percentToNativeSpeed,
  snapSpeedPercent,
  nextSpeedPercent,
} from "../animations/speedPosition";
import { speedObservations } from "../animations/nativeSpeed";
import { timingSource } from "../animations/timing";
import {
  BASIC_REPEAT_DEFAULTS,
  isOverlapMode,
  validBasicRepeatMs,
} from "../animations/basicRepeatTiming";
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
  const draftRef = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointerActive = useRef(false);
  const latest = useRef({ app, mode });
  latest.current = { app, mode };
  const locked = app.calibrationState.running,
    prefs = app.nativeSpeedPreferences;
  const current = app.playback?.current;
  const playingMode = current?.type === "mode" ? current.mode : null;
  const profileModes = app.playback?.modeIds;
  const custom = app.playback && app.profiles.some((p) => p.id === app.playback!.profileId);
  const targetMode = (custom ? profileModes?.[0] : playingMode) ?? mode;
  const mixed = draft === null && custom && profileModes!.some((m) => app.getNativeSpeed(m) !== app.getNativeSpeed(targetMode));
  const percent = draft ?? nativeSpeedToPercent(app.getNativeSpeed(targetMode));
  const speed =
    draft === null
      ? app.getNativeSpeed(targetMode)
      : percentToNativeSpeed(draft);
  const advancedSpeed = app.getNativeSpeed(mode);
  const factor = app.getSpeedTimeFactor(mode, advancedSpeed),
    capture = calibrationByMode.get(mode)!.cycleSeconds;
  const observed = speedObservations[mode];

  function clearDraft() {
    clearTimeout(timer.current);
    draftRef.current = null;
    setDraft(null);
  }
  function chooseSpeed(value: number) {
    const next = snapSpeedPercent(value);
    if (draftRef.current === next) return;
    draftRef.current = next;
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(applySpeed, 180);
  }
  useEffect(() => {
    if (locked) clearDraft();
  }, [locked]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(clearDraft, [app.outputMode, prefs.scope, app.playback?.profileId]);
  function applySpeed() {
    const chosen = draftRef.current;
    if (chosen === null) return;
    clearDraft();
    const { app: currentApp, mode: currentMode } = latest.current;
    currentApp.changeNativeSpeed(currentMode, percentToNativeSpeed(chosen));
  }

  const cutTiming = (
    <label className="speed-cut-timing">
      <input
        type="checkbox"
        aria-label="Automatically adjust preset cut timing"
        checked={prefs.bundledFollow}
        disabled={locked}
        onChange={(e) => app.setBundledFollow(e.target.checked)}
      />
      <span>{main ? "Sync cut timing" : "Automatically adjust preset cut timing"}</span>
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
          {custom ? " · Preset" : prefs.scope === "per-mode" ? ` · Mode ${targetMode}` : ""}
        </label>
        <span className="speed-value" data-testid="selected-speed">
          {mixed ? "Mixed speeds" : <>{Math.round(percent)}%{speed === 129 ? " · Default" : ""}</>}
        </span>
      </div>
      <div className="speed-slider-row">
        <input
          id={id}
          className="native-speed-range"
          type="range"
          aria-label="Animation speed"
          min={0}
          max={100}
          step={1}
          list={`${id}-positions`}
          aria-valuetext={mixed ? "Mixed preset speeds; adjust to set all included modes" : `${Math.round(percent)}% slider position${speed === 129 ? ", default" : ""}`}
          value={Math.round(percent)}
          disabled={locked || (custom && !profileModes?.length) || false}
          onChange={(e) => {
            const value = Number(e.target.value);
            // Assistive technologies can adjust the native range directly,
            // without a key or pointer event. Small adjustments must reach the
            // next stop instead of snapping back indefinitely.
            const position = Math.round(percent);
            chooseSpeed(
              !pointerActive.current && value !== position &&
              snapSpeedPercent(value) === snapSpeedPercent(position)
                ? nextSpeedPercent(position, value > position ? 1 : -1)
                : value,
            );
          }}
          onPointerDown={() => { pointerActive.current = true; }}
          onPointerUp={() => { pointerActive.current = false; applySpeed(); }}
          onPointerCancel={() => { pointerActive.current = false; clearDraft(); }}
          onLostPointerCapture={() => { pointerActive.current = false; clearDraft(); }}
          onBlur={() => { pointerActive.current = false; clearDraft(); }}
          onKeyDown={(e) => {
            const right = ["ArrowRight", "ArrowUp", "PageUp"].includes(e.key),
              left = ["ArrowLeft", "ArrowDown", "PageDown"].includes(e.key);
            if (right || left || e.key === "Home" || e.key === "End") {
              e.preventDefault();
              const current =
                draftRef.current ??
                Math.round(nativeSpeedToPercent(
                  app.getNativeSpeed(targetMode),
                ));
              chooseSpeed(
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? 100
                    : nextSpeedPercent(current, right ? 1 : -1),
              );
            } else if (e.key === "Escape") clearDraft();
          }}
          onKeyUp={(e) => {
            if (
              [
                "ArrowRight",
                "ArrowUp",
                "PageUp",
                "ArrowLeft",
                "ArrowDown",
                "PageDown",
                "Home",
                "End",
              ].includes(e.key)
            )
              applySpeed();
          }}
        />
        <datalist id={`${id}-positions`}>
          {SPEED_POSITIONS.map((stop) => (
            <option key={stop} value={stop} label={`${stop}%`} />
          ))}
        </datalist>
      </div>
      <div className="speed-scale" aria-hidden="true">
        <span>Slow</span>
        <span>Default</span>
        <span>Fast</span>
      </div>
      {custom && prefs.scope === "per-mode" && <p className="speed-hint">
        {profileModes?.length ? `Applies to preset modes ${profileModes.join(", ")}.` : "This preset has no factory modes."}
        {mixed && " Saved speeds differ; adjust to synchronize."}
      </p>}
      {!main && <p className="speed-hint">
        Slider position. {draft !== null ? "Applying automatically. " : ""}
        {prefs.scope === "global"
          ? "Same speed for all animations."
          : "Individual speed per animation."}
      </p>}
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
              clearDraft();
              app.setSpeedScope(e.target.value as typeof prefs.scope);
            }}
          >
            <option value="global">Same speed for all animations</option>
            <option value="per-mode">Individual speed per animation</option>
          </select>
        </label>
        {!main && <p>
          {prefs.scope === "global"
            ? "The shared speed applies to every Mode step. Individual speeds remain saved."
            : "The slider updates every mode in the running preset, or the selected animation when idle."}
        </p>}
        <label className="field">
          Animation for individual settings and calibration
          <select
            aria-label="Native speed mode"
            value={mode}
            disabled={locked}
            onChange={(e) => {
              setMode(Number(e.target.value));
              clearDraft();
            }}
          >
            {calibratedRecords.map((record) => (
              <option key={record.mode} value={record.mode}>
                Mode {record.mode} · {record.name}
              </option>
            ))}
          </select>
        </label>
        {!main && <>
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
              clearDraft();
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
        {isOverlapMode(mode) && (
          <details className="basic-repeat-tools">
            <summary>Basic repeat calibration</summary>
            <label className="field">
              Basic Mode {mode} retrigger interval at speed 129 (seconds)
              <input
                key={`${mode}-${app.getBasicRepeatMs(mode)}`}
                type="number"
                aria-label="Basic repeat reference interval"
                min={0.5}
                max={10}
                step={0.05}
                disabled={locked}
                defaultValue={(app.getBasicRepeatMs(mode) / 1000).toFixed(2)}
                onBlur={(e) => {
                  const value = Number(e.target.value) * 1000,
                    ms = Math.round(value);
                  if (Math.abs(ms - value) < 0.0001 && validBasicRepeatMs(ms))
                    app.setBasicRepeatMs(mode, ms);
                  else {
                    e.target.value = (
                      app.getBasicRepeatMs(mode) / 1000
                    ).toFixed(2);
                    app.notify(
                      "Use 0.50–10.00 seconds in 0.05-second increments for Basic repeat timing.",
                    );
                  }
                }}
              />
            </label>
            <p data-testid="basic-repeat-timing">
              Basic retrigger reference:{" "}
              {(app.getBasicRepeatMs(mode) / 1000).toFixed(2)}s · effective:{" "}
              {((app.getBasicRepeatMs(mode) * factor) / 1000).toFixed(3)}s.
              Approved capture: {capture.toFixed(2)}s.
            </p>
            <button
              type="button"
              disabled={locked}
              onClick={() =>
                app.setBasicRepeatMs(mode, BASIC_REPEAT_DEFAULTS[mode])
              }
            >
              Restore Basic repeat default
            </button>
            <p>
              Basic playback only. Saved for future intervals; use Reissue above
              to restart the current Mode step now. Custom cuts and native
              animation data are unchanged.
            </p>
            <p className="hint">
              The new recordings were confirmed at speed 129, but visible color
              returns do not establish command times. The existing 3.50s
              defaults are retained until synchronized dispatch evidence
              supports a change. Shorter intervals intentionally restart the
              effect early.
            </p>
          </details>
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
        </>}
        {main && <p className="hint">Exact speed and timing calibration are available in Development.</p>}
      </details>
    </div>
  );
}

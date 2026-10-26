import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import approvedSvg from "../../Animations/wrx-taillights-19zone.svg?raw";
import { useApp } from "../context/AppContext";
import { calibratedRecords } from "../simulation/calibrations";
import { applyLedColors, mapLedColors } from "../simulation/ledMapping";
import type { OutputMode } from "../simulation/PlaybackOutput";
import "../styles/simulator.css";

export function SimulatorPanel() {
  const app = useApp(),
    sim = app.simulator;
  const state = useSyncExternalStore(sim.subscribe, sim.getSnapshot);
  const [now, setNow] = useState(() => performance.now());
  const art = useRef<HTMLDivElement>(null);
  const enabled = app.outputMode !== "hardware",
    sample = sim.sample(now);
  useEffect(() => {
    if (!enabled) return;
    let frame: number;
    const tick = (at: number) => {
      setNow(at);
      if (sim.sample(at).running) frame = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [enabled, sim, state]);
  useLayoutEffect(() => {
    if (art.current) applyLedColors(art.current, sample.colors);
  }, [enabled, sample.colors]);
  return (
    <section className="panel simulator-panel" aria-label="Animation preview">
      <div className="sectionhead">
        <h2>Animation preview</h2>
        <span className="pill">Calibrated · 19 LEDs</span>
      </div>
      <label className="field">
        Playback output
        <select
          aria-label="Playback output"
          value={app.outputMode}
          onChange={(e) => app.setOutputMode(e.target.value as OutputMode)}
        >
          <option value="simulation">Simulation Only</option>
          <option value="hardware">Hardware Only</option>
          <option value="combined">Combined</option>
        </select>
      </label>
      <p
        className="delivery-status"
        aria-label="Playback delivery"
        aria-live="polite"
      >
        {app.output.statusText()}
      </p>
      {!enabled ? (
        <p>
          Choose Simulation Only to preview without lights, or Combined to
          preview while controlling connected lights.
        </p>
      ) : (
        <>
          <p>
            {app.outputMode === "simulation"
              ? "Simulation Only · Bluetooth commands are disabled."
              : "Combined · Preview plus Bluetooth commands to connected lights."}
          </p>
          <div
            className="sim-art"
            ref={art}
            dangerouslySetInnerHTML={{ __html: approvedSvg }}
          />
          <div
            className="sim-readout"
            data-mode={state.mode ?? "static"}
            data-frame={sample.frame?.frame ?? ""}
          >
            <strong>
              {sample.record
                ? `Mode ${sample.record.mode} · ${sample.record.name}`
                : state.mode === null
                  ? "Static RGB"
                  : `Mode ${state.mode} · no calibrated track supplied`}
            </strong>
            <span>
              {sample.record
                ? `${sample.elapsed.toFixed(3)} / ${sample.duration.toFixed(3)}s · frame ${sample.frame?.frame} · ${sample.record.frames.length} captured frames`
                : state.selectedColor.toUpperCase()}
            </span>
            {sample.record && (
              <span>
                Active native byte: 0x
                {state.nativeSpeed
                  .toString(16)
                  .padStart(2, "0")
                  .toUpperCase()}{" "}
                · preview timing {state.timeFactor.toFixed(3)}×
                {state.timeFactor !== 1
                  ? ` · estimated window ${sample.wallDuration.toFixed(3)}s`
                  : ""}
              </span>
            )}
          </div>
          <details className="sim-tools">
            <summary>Preview controls and numbered LEDs</summary>
            <label className="field">
              Preview factory mode
              <select
                aria-label="Preview factory mode"
                value={state.mode ?? ""}
                onChange={(e) => {
                  const mode = Number(e.target.value);
                  sim.inspectMode(mode, app.getNativeSpeed(mode));
                }}
              >
                <option value="" disabled>
                  Static RGB
                </option>
                {state.mode !== null && !sample.record && (
                  <option value={state.mode} disabled>
                    No calibrated track for Mode {state.mode}
                  </option>
                )}
                {calibratedRecords.map((r) => (
                  <option value={r.mode} key={r.mode}>
                    Mode {r.mode} · {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sim-color">
              Remembered RGB
              <input
                type="color"
                aria-label="Preview RGB color"
                value={state.selectedColor}
                onChange={(e) => sim.setSelectedColor(e.target.value)}
              />
              <span>{state.selectedColor.toUpperCase()}</span>
            </label>
            <p>
              Modes 4 and 10 use this color; the other six modes use recorded
              RGB. Preview controls affect the visualization only.
            </p>
            {state.mode === 10 && (
              <p className="sim-approved">
                Approved enhanced Breathe fade · on · 100%
              </p>
            )}
            <div className="sim-controls">
              <button
                type="button"
                disabled={!sample.record}
                onClick={() => (sample.running ? sim.pause() : sim.play())}
              >
                {sample.running ? "Pause preview" : "Play preview"}
              </button>
              <button
                type="button"
                disabled={!sample.record}
                onClick={() => sim.step(-1)}
              >
                Previous frame
              </button>
              <button
                type="button"
                disabled={!sample.record}
                onClick={() => sim.step(1)}
              >
                Next frame
              </button>
            </div>
            <label className="field">
              Preview time
              <input
                type="range"
                aria-label="Preview time"
                min={0}
                max={sample.duration || 1}
                step="0.001"
                value={sample.elapsed}
                disabled={!sample.record}
                onChange={(e) => sim.seek(Number(e.target.value))}
              />
            </label>
            <label className="sim-repeat">
              <input
                type="checkbox"
                checked={state.repeat}
                disabled={!sample.record || state.mode === 10}
                onChange={(e) => sim.setRepeat(e.target.checked)}
              />{" "}
              Repeat captured preview window
            </label>
            <ol className="sim-led-grid" aria-label="Numbered LED colors">
              {mapLedColors(sample.colors).map((led) => (
                <li key={led.number} data-led-number={led.number}>
                  <span>{led.number}</span>
                  <i style={{ backgroundColor: led.color }} />
                  <small>{led.color.toUpperCase()}</small>
                </li>
              ))}
            </ol>
          </details>
          {state.mode === 10 && (
            <p className="hint">
              This 75-frame preview covers a 2.50s capture, not a verified full
              breathing cycle (~3.54s at the new reference setting). It holds
              its final frame after the window. Hardware Breathe uses a native
              loop; check delivery status. The missing waveform is not
              reconstructed.
            </p>
          )}
          <p className="hint">
            Video-derived preview. Mode 4 and Mode 10 match the approved
            reference. Browser timing does not confirm physical LED response.
          </p>
        </>
      )}
    </section>
  );
}

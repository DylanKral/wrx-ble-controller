import { useEffect, useState } from "react";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { useApp } from "../context/AppContext";
import { useBluetooth } from "../context/BluetoothContext";
import {
  compareSpecs,
  modeSpecs,
  timingSpecs,
  type TestSpec,
} from "../calibration/specs";
import { csv, formatClock, json } from "../calibration/exports";
import { download } from "../storage/persistence";
export function CalibrationPage({
  hidden,
  navigate,
}: {
  hidden: boolean;
  navigate: () => void;
}) {
  const app = useApp(),
    { calibration: c, calibrationState: s } = app,
    { connected } = useBluetooth();
  const [elapsed, setElapsed] = useState(0),
    [observation, setObservation] = useState(c.observation),
    [target, setTarget] = useState(c.target);
  useEffect(() => {
    if (!s.running) return;
    let frame: number;
    const tick = () => {
      setElapsed(s.t0 === null ? 0 : performance.now() - s.t0);
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [s.running, s.t0]);
  const disabled = s.running || (!connected.left && !connected.right);
  const start = (specs: TestSpec[], kind: "modes" | "timing") => {
    app.startCalibration(specs, kind);
    document
      .getElementById("cal-instrument")
      ?.scrollIntoView({ block: "start" });
  };
  const testButton = (spec: TestSpec) => (
    <button
      type="button"
      className="test-btn"
      key={spec.id}
      disabled={disabled}
      onClick={() =>
        start([spec], spec.id.startsWith("M") ? "modes" : "timing")
      }
    >
      <strong>
        {spec.id} ·{" "}
        {spec.id.startsWith("M")
          ? "Mode " + Number(spec.id.slice(1))
          : spec.label}
      </strong>
      <small>{spec.desc || "One command; watch natural completion"}</small>
    </button>
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(csv(s.events));
      app.notify("CSV copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = csv(s.events);
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      app.notify(
        ok ? "CSV copied." : "Clipboard unavailable; use Download CSV.",
      );
    }
  }
  const filename = (ext: string) =>
    "wrx_calibration_" +
    new Date().toISOString().replace(/[:.]/g, "-") +
    "." +
    ext;
  return (
    <main id="calibration-view" hidden={hidden}>
      <div className="topline">
        <span className="eyebrow">WRX · Dream BLE Lab</span>
        <button className="return-nav" type="button" onClick={navigate}>
          Custom Testing
        </button>
      </div>
      <h1>
        Calibration Mode <span className="small">v1</span>
      </h1>
      <p>
        Record the display and both tail lights in a single fixed camera shot.
        The screen's white cue marks when each command is requested. Logs
        distinguish command scheduling and write completion; video measures
        actual LED response.
      </p>
      <div className="note">
        <strong>Parked testing only.</strong> These diagnostic commands control
        aftermarket RGB effects. They do not measure brake response or replace
        factory wiring. Keep the browser foregrounded, screen awake, and restore
        normal lighting before driving.
      </div>
      <ConnectionPanel disabled={s.running} />
      <section className="panel">
        <h2>Recording settings</h2>
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}
        >
          <label className="field">
            Single-mode observation
            <select
              aria-label="Single-mode observation"
              value={observation}
              disabled={s.running}
              onChange={(e) => {
                const n = Number(e.target.value);
                c.observation = n;
                setObservation(n);
              }}
            >
              {[6000, 8000, 10000, 15000].map((n) => (
                <option key={n} value={n}>
                  {n / 1000} seconds
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Send commands to
            <select
              aria-label="Send commands to"
              value={target}
              disabled={s.running}
              onChange={(e) => {
                const t = e.target.value as typeof target;
                c.target = t;
                setTarget(t);
              }}
            >
              <option value="both">Both connected lights</option>
              <option value="left">Left only</option>
              <option value="right">Right only</option>
            </select>
          </label>
        </div>
        <p>
          Tests set a static blue baseline, wait for a short countdown, and then
          send programmed commands. No further commands are sent during
          observation unless a test explicitly specifies them.
        </p>
      </section>
      <section className="panel" id="cal-instrument">
        <div className="sectionhead">
          <h2>Video synchronization</h2>
          <span className="pill">{s.running ? "Recording" : "Idle"}</span>
        </div>
        <div className="metric-card">
          <div className="eyebrow" style={{ textAlign: "center" }}>
            {s.label}
          </div>
          <div className="clock" aria-label="Test elapsed time">
            {formatClock(elapsed)}
          </div>
          <div className="cue">{s.cue}</div>
          <div
            aria-hidden="true"
            className={"cue-banner" + (s.pulse ? " pulse" : "")}
          />
          <div className="flashlabel">
            SCREEN CUE = COMMAND REQUEST · NOT LED RESPONSE
          </div>
          <div className="metrics">
            {[
              [s.requested, "Requested"],
              [s.completed, "Writes OK"],
              [s.skipped, "Skipped/failed"],
            ].map(([n, label]) => (
              <div className="metric" key={label}>
                <strong>{n}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="buttonbar quick">
          <button
            type="button"
            className="danger"
            disabled={!s.running}
            onClick={() => c.abort()}
          >
            Stop test
          </button>
          <button
            type="button"
            disabled={s.running}
            onClick={() => {
              app.scheduler.stop();
              c.baseline("#0000ff", "BLUE");
            }}
          >
            Reset static blue
          </button>
          <button
            type="button"
            disabled={s.running}
            onClick={() => {
              app.scheduler.stop();
              c.baseline("#ff0000", "RED");
            }}
          >
            Restore static red
          </button>
        </div>
        <p className="small">{s.activity[0] || "Commands not sent yet."}</p>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>A · Animation duration tests</h2>
          <span className="pill">8 tests</span>
        </div>
        <p>
          Each test selects one factory animation (Modes 2–9) exactly once, then
          watches without resending. Estimate each natural animation duration
          and compare patterns.
        </p>
        <div className="grid" style={{ marginTop: 13 }}>
          {modeSpecs.map(testButton)}
        </div>
        <button
          type="button"
          className="primary btn-full"
          disabled={disabled}
          onClick={() => start(modeSpecs, "modes")}
        >
          Run all 8 tests consecutively
        </button>
        <p>
          For separate recordings, use filenames such as{" "}
          <span className="mini">CAL-M04.mp4</span>. For the combined run,
          record continuously and use the screen's mode label to distinguish
          clips.
        </p>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>B · Bluetooth timing tests</h2>
          <span className="pill">7 tests</span>
        </div>
        <p>
          Compare repeated selections of the same mode with switching between
          Modes 4 and 7. Commands use fixed planned offsets; actual send and
          completion timestamps are logged.
        </p>
        <div className="grid" style={{ marginTop: 13 }}>
          {timingSpecs.map(testButton)}
        </div>
        <p className="small">
          The final test requests 12 alternating commands at 50 ms intervals. It
          is a bounded stress test, not a measurement of the radio's theoretical
          maximum throughput. Pending writes are skipped rather than queued.
        </p>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>C · Mode numbering check</h2>
          <span className="pill">Optional</span>
        </div>
        <p>
          Tests the hypothesis that modes above 9 repeat earlier effects. Sends
          Mode 2, then Mode 10, with separate observation windows. Compare
          visual patterns in the recording.
        </p>
        <button
          type="button"
          className="btn-full"
          disabled={disabled}
          onClick={() => start(compareSpecs, "modes")}
        >
          Compare Mode 2 vs Mode 10
        </button>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>Calibration records</h2>
          <span className="pill">{s.events.length} events</span>
        </div>
        <div className="buttonbar">
          <button
            type="button"
            onClick={() =>
              download(filename("csv"), csv(s.events), "text/csv;charset=utf-8")
            }
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => download(filename("json"), json(s.events))}
          >
            Download JSON
          </button>
          <button type="button" onClick={() => void copy()}>
            Copy CSV
          </button>
        </div>
        <div className="buttonbar" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (s.running) {
                app.notify("Stop active test first.");
                return;
              }
              if (
                confirm(
                  "Delete all locally saved calibration events? Download logs first.",
                )
              )
                c.clear();
            }}
          >
            Clear recorded logs
          </button>
        </div>
        <p>
          Exports include test label, command mode/hex, requested time, actual
          dispatch time, per-controller write completion, skipped commands, and
          failure details. Browser times do not measure physical LED response.
        </p>
        <div className="divider" />
        <h3>Recent activity</h3>
        <div className="activity">{s.activity.join("\n")}</div>
      </section>
      <div className="footer">
        Service FFD5 · Write characteristic FFD9 · Mode command 9E 00 [mode−1]
        81 98 00 E9. Mode 4 is verified on both lights. Other mode behavior is
        inferred. No personal data is uploaded; records remain in this browser
        until exported or cleared.
      </div>
    </main>
  );
}

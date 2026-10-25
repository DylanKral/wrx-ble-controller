import { BLEManager } from "../bluetooth/BLEManager";
import { colorBytes, hex, modeBytes } from "../bluetooth/commands";
import { sides, type Side } from "../bluetooth/types";
import {
  keys,
  readJSON,
  writeJSON,
  type StorageLike,
} from "../storage/persistence";
import type { CalibrationEvent } from "./exports";
import type { TestSpec } from "./specs";
interface Run {
  runId: string;
  testId: string;
  testLabel: string;
  t0: number | null;
  signal: AbortController;
}
export interface CalibrationState {
  running: boolean;
  label: string;
  cue: string;
  pulse: boolean;
  t0: number | null;
  requested: number;
  completed: number;
  skipped: number;
  events: CalibrationEvent[];
  activity: string[];
}
export class CalibrationEngine {
  state: CalibrationState = {
    running: false,
    label: "Select a test",
    cue: "Ready",
    pulse: false,
    t0: null,
    requested: 0,
    completed: 0,
    skipped: 0,
    events: [],
    activity: [
      "Calibration Mode ready. Capture both phone display and tail lights in one video.",
    ],
  };
  private run: Run | null = null;
  private listeners = new Set<() => void>();
  private flashTimer: ReturnType<typeof setTimeout> | undefined;
  target: "both" | Side = "both";
  observation = 10000;
  constructor(
    private ble: BLEManager,
    private storage: StorageLike,
    private now = () => performance.now(),
  ) {
    try {
      const saved = readJSON(storage, keys.calibration);
      if (Array.isArray(saved)) this.state.events = saved.slice(-1600);
    } catch {
      this.log(
        "Calibration history could not be loaded; original storage retained.",
      );
    }
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<CalibrationState> = {}) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  private log(msg: string) {
    this.update({
      activity: [
        new Date().toLocaleTimeString() + " · " + msg,
        ...this.state.activity,
      ].slice(0, 60),
    });
  }
  private record(
    type: string,
    data: CalibrationEvent = {},
    context: Run | null = this.run,
  ) {
    const event: CalibrationEvent = {
      date_utc: new Date().toISOString(),
      run_id: context?.runId || "",
      test_id: context?.testId || "",
      test_label: context?.testLabel || "",
      event: type,
      elapsed_ms:
        context?.t0 != null ? +(this.now() - context.t0).toFixed(3) : null,
      ...data,
    };
    const events = [...this.state.events, event].slice(-1800);
    this.update({ events });
    try {
      writeJSON(this.storage, keys.calibration, events.slice(-1600));
    } catch {
      this.log(
        "Browser storage unavailable; export logs before closing this page.",
      );
    }
  }
  targetSides() {
    return (this.target === "both" ? sides : [this.target]).filter(
      this.ble.isUp,
    );
  }
  dispatch(
    bytes: Uint8Array<ArrayBuffer>,
    meta: { mode?: number; atMs?: number; label?: string } = {},
  ) {
    const targets = this.targetSides(),
      context = this.run ? { ...this.run } : null,
      tReq = this.now();
    this.update({ requested: this.state.requested + 1 });
    this.record(
      "command_request",
      {
        mode: meta.mode ?? "",
        hex: hex(bytes),
        planned_ms: meta.atMs ?? "",
        label: meta.label ?? "",
        requested_at_ms:
          context?.t0 != null ? +(tReq - context.t0).toFixed(3) : "",
      },
      context,
    );
    if (!targets.length) {
      this.update({ skipped: this.state.skipped + 1 });
      this.record("no_connected_target", {}, context);
      return;
    }
    for (const side of targets) {
      if (this.ble.isWriting(side)) {
        this.update({ skipped: this.state.skipped + 1 });
        this.record(
          "write_skipped_pending",
          { side, mode: meta.mode ?? "", planned_ms: meta.atMs ?? "" },
          context,
        );
        continue;
      }
      const t = this.now();
      this.record(
        "write_started",
        {
          side,
          mode: meta.mode ?? "",
          hex: hex(bytes),
          planned_ms: meta.atMs ?? "",
          dispatch_lateness_ms:
            meta.atMs != null && context?.t0 != null
              ? +(t - context.t0 - meta.atMs).toFixed(3)
              : "",
        },
        context,
      );
      void this.ble
        .writeSide(side, bytes)
        .then(() => {
          if (!this.run || context?.runId === this.run.runId)
            this.update({ completed: this.state.completed + 1 });
          this.record(
            "write_completed",
            {
              side,
              mode: meta.mode ?? "",
              ble_write_promise_ms: +(this.now() - t).toFixed(3),
            },
            context,
          );
        })
        .catch((e) => {
          if (!this.run || context?.runId === this.run.runId)
            this.update({ skipped: this.state.skipped + 1 });
          const pending = String(e).includes("write_skipped_pending");
          this.record(
            pending ? "write_skipped_pending" : "write_error",
            {
              side,
              mode: meta.mode ?? "",
              planned_ms: meta.atMs ?? "",
              error: String(e),
            },
            context,
          );
          if (!pending) this.log(side + " BLE write failed: " + String(e));
        });
    }
  }
  flash(text: string) {
    clearTimeout(this.flashTimer);
    this.update({ cue: text, pulse: true });
    this.flashTimer = setTimeout(() => this.update({ pulse: false }), 175);
  }
  private until(at: number, run: Run): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const end = (ok: boolean) => {
        clearTimeout(timer);
        run.signal.signal.removeEventListener("abort", abort);
        resolve(ok);
      };
      const abort = () => end(false);
      const tick = () => {
        if (this.run !== run || run.signal.signal.aborted) return end(false);
        const remain = at - this.now();
        if (remain <= 0) return end(true);
        timer = setTimeout(tick, Math.min(150, Math.max(1, remain)));
      };
      run.signal.signal.addEventListener("abort", abort, { once: true });
      tick();
    });
  }
  private wait(ms: number, run: Run) {
    return this.until(this.now() + ms, run);
  }
  abort(reason = "User stopped test; pending BLE writes may complete.") {
    if (!this.run) return;
    this.record("abort", { reason });
    this.run.signal.abort();
    this.run = null;
    clearTimeout(this.flashTimer);
    this.update({ running: false, cue: "STOPPED", pulse: false });
    this.log(reason);
  }
  async start(specs: TestSpec[], kind: "modes" | "timing") {
    if (this.run) return;
    if (!this.targetSides().length) {
      this.log("Connect the selected tail light(s) first.");
      return;
    }
    const run: Run = {
      runId: "CAL-" + Date.now().toString(36),
      testId: "",
      testLabel: "",
      t0: null,
      signal: new AbortController(),
    };
    this.run = run;
    this.update({ running: true, requested: 0, completed: 0, skipped: 0 });
    this.record("run_begin", {
      tests: specs.map((s) => s.id).join(","),
      targets: this.targetSides().join(","),
    });
    try {
      for (const spec of specs) {
        if (this.run !== run) return;
        run.testId = spec.id;
        run.testLabel = spec.label;
        run.t0 = null;
        const observation =
          kind === "modes" ? this.observation : spec.observationMs || 3500;
        this.update({
          label: spec.id + " · " + spec.label,
          t0: null,
          cue: "Setting baseline…",
        });
        this.record("test_begin", { observation_ms: observation });
        this.log("Start " + spec.id + " — " + spec.label);
        this.record("baseline_begin", { color: "blue" });
        this.dispatch(colorBytes("#0000ff"), { label: "static blue baseline" });
        if (!(await this.wait(450, run))) return;
        for (const n of [3, 2, 1]) {
          this.update({ cue: "Ready · " + n });
          if (!(await this.wait(700, run))) return;
        }
        run.t0 = this.now() + 200;
        this.update({ t0: run.t0 });
        const planned = spec.commands();
        for (const e of planned) {
          if (!(await this.until(run.t0 + e.atMs, run))) return;
          this.flash(e.label);
          this.record("visual_marker", {
            mode: e.mode,
            planned_ms: e.atMs,
            marker_lateness_ms: +(this.now() - run.t0 - e.atMs).toFixed(3),
          });
          this.dispatch(modeBytes(e.mode), {
            mode: e.mode,
            atMs: e.atMs,
            label: e.label,
          });
        }
        this.update({ cue: "OBSERVE · no further commands" });
        if (
          !(await this.until(
            run.t0 + (planned.at(-1)?.atMs || 0) + observation,
            run,
          ))
        )
          return;
        this.record("test_end", { observation_ms: observation });
        this.update({ cue: "TEST COMPLETE" });
        this.log(
          "Finished " + spec.id + ". No automatic light change after the test.",
        );
        if (!(await this.wait(850, run))) return;
      }
      if (this.run === run) {
        this.record("run_end", { tests_finished: specs.length });
        this.log(
          "Calibration run finished; export CSV and video of screen plus tail lights.",
        );
        this.update({ cue: "RUN COMPLETE" });
      }
    } catch (e) {
      if (this.run === run) {
        this.record("unexpected_error", { error: String(e) });
        this.log("Test error: " + String(e));
        this.update({ cue: "ERROR" });
      }
    } finally {
      if (this.run === run) {
        this.run = null;
        this.update({ running: false });
      }
    }
  }
  baseline(color: string, name: string) {
    if (this.run) {
      this.log("Stop the active test first.");
      return;
    }
    if (!this.targetSides().length) {
      this.log("No selected controller connected.");
      return;
    }
    this.flash("STATIC " + name);
    this.record("manual_color", { color: name });
    this.dispatch(colorBytes(color), { label: "Manual " + name });
    this.log("Requested static " + name + ".");
  }
  clear() {
    if (this.run) return;
    this.update({ events: [], activity: [] });
    writeJSON(this.storage, keys.calibration, []);
    this.log("Saved records cleared.");
  }
  dispose() {
    this.abort();
    clearTimeout(this.flashTimer);
  }
}

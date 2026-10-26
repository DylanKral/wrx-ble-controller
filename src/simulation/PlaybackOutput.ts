import type { BLEManager } from "../bluetooth/BLEManager";
import { sides, type Side } from "../bluetooth/types";
import type { DispatchOptions } from "../animations/dispatch";
import type { Simulator } from "./Simulator";
export type OutputMode = "simulation" | "hardware" | "combined";
export function isOutputMode(value: string): value is OutputMode {
  return ["simulation", "hardware", "combined"].includes(value);
}
type Delivery = {
  status:
    | "idle"
    | "disabled"
    | "disconnected"
    | "queued"
    | "writing"
    | "sent"
    | "error";
  error?: string;
};
export interface OutputStatus {
  simulator: "idle" | "updated" | "disabled";
  left: Delivery;
  right: Delivery;
}
// Boolean send result means "continue playback". Physical delivery is reported
// independently per controller and must never be inferred from that boolean.
export class PlaybackOutput {
  private epoch = 0;
  private request = 0;
  private listeners = new Set<() => void>();
  state: OutputStatus;
  constructor(
    private ble: BLEManager,
    readonly simulator: Simulator,
    public mode: OutputMode = "hardware",
    private now = () => performance.now(),
  ) {
    this.state = {
      simulator: mode === "hardware" ? "disabled" : "idle",
      left: { status: "idle" },
      right: { status: "idle" },
    };
    this.syncConnections();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<OutputStatus>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  cancelPending() {
    this.epoch++;
  }
  setMode(mode: OutputMode) {
    this.cancelPending();
    this.mode = mode;
    this.update({
      simulator: mode === "hardware" ? "disabled" : "idle",
      left: { status: "idle" },
      right: { status: "idle" },
    });
    this.syncConnections();
  }
  syncConnections() {
    const patch: Partial<OutputStatus> = {};
    for (const side of sides) {
      const status = !this.hardwareEnabled
        ? "disabled"
        : !this.ble.isUp(side)
          ? "disconnected"
          : ["disabled", "disconnected"].includes(this.state[side].status)
            ? "idle"
            : this.state[side].status;
      if (status !== this.state[side].status) patch[side] = { status };
    }
    if (Object.keys(patch).length) this.update(patch);
  }
  get hardwareEnabled() {
    return this.mode !== "simulation";
  }
  get simulationEnabled() {
    return this.mode !== "hardware";
  }
  isUp = (side: Side) => this.hardwareEnabled && this.ble.isUp(side);
  isWriting = (side: Side) => this.ble.isWriting(side);
  observe = (
    bytes: Uint8Array<ArrayBuffer>,
    options: DispatchOptions = {},
    at = this.now(),
  ) => {
    if (bytes.length !== 7) return;
    if (bytes[0] === 0x56 && bytes[6] === 0xaa) {
      const color =
        "#" +
        Array.from(bytes.slice(1, 4), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
      if (this.simulationEnabled) this.simulator.color(color);
      else this.simulator.setSelectedColor(color);
    } else if (this.simulationEnabled && bytes[0] === 0x9e && bytes[6] === 0xe9)
      this.simulator.mode(
        bytes[2] + 1,
        bytes[3],
        options.restart,
        at,
        options.timeFactor,
      );
    this.update({ simulator: this.simulationEnabled ? "updated" : "disabled" });
  };
  statusText() {
    return `Simulator: ${this.state.simulator} · Left: ${this.state.left.status}${this.state.left.error ? " (" + this.state.left.error + ")" : ""} · Right: ${this.state.right.status}${this.state.right.error ? " (" + this.state.right.error + ")" : ""}`;
  }
  async send(
    bytes: Uint8Array<ArrayBuffer>,
    valid: () => boolean = () => true,
    options: DispatchOptions = {},
  ): Promise<boolean> {
    if (!valid()) return false;
    const epoch = this.epoch,
      request = ++this.request,
      mode = this.mode;
    const resolvedOptions =
      bytes[0] === 0x9e
        ? {
            ...options,
            timeFactor:
              options.timeFactor ??
              this.simulator.resolveTimeFactor(bytes[2] + 1, bytes[3]),
          }
        : options;
    const current = () => valid() && this.epoch === epoch;
    const reportable = () => current() && request === this.request;
    let dispatched = false;
    const dispatch = (at: number) => {
      if (dispatched || !current()) return;
      dispatched = true;
      this.observe(bytes, resolvedOptions, at);
      options.onDispatch?.(at);
    };
    this.update({
      left: {
        status:
          mode === "simulation"
            ? "disabled"
            : this.ble.isUp("left")
              ? "queued"
              : "disconnected",
      },
      right: {
        status:
          mode === "simulation"
            ? "disabled"
            : this.ble.isUp("right")
              ? "queued"
              : "disconnected",
      },
    });
    if (mode === "simulation") {
      dispatch(this.now());
      return true;
    }
    if (
      mode === "combined" &&
      !this.ble.isUp("left") &&
      !this.ble.isUp("right")
    ) {
      dispatch(this.now());
      this.ble.report(
        "Preview running; no connected lights to receive Bluetooth commands.",
      );
      return true;
    }
    const ok = await this.ble.send(bytes, current, {
      dispatch: (side, at) => {
        if (!current()) return;
        if (reportable()) this.update({ [side]: { status: "writing" } });
        dispatch(at);
      },
      result: (side, error) => {
        if (reportable())
          this.update({
            [side]: {
              status: error ? "error" : "sent",
              ...(error ? { error } : {}),
            },
          });
      },
    });
    if (!current()) return false;
    // Hardware can fail before dispatch. Combined still previews, explicitly
    // without claiming that a physical request was sent.
    if (!dispatched && mode === "combined") dispatch(this.now());
    if (reportable())
      for (const side of sides) {
        if (["queued", "writing"].includes(this.state[side].status))
          this.update({
            [side]: {
              status: ok ? "sent" : "error",
              ...(!ok ? { error: "Bluetooth delivery failed" } : {}),
            },
          });
      }
    return mode === "combined" || ok;
  }
  writeSide = async (side: Side, bytes: Uint8Array<ArrayBuffer>) => {
    if (!this.hardwareEnabled)
      throw new Error("Simulation Only does not transmit Bluetooth commands.");
    const epoch = this.epoch;
    this.update({ [side]: { status: "writing" } });
    try {
      const transport = await this.ble.writeSide(side, bytes);
      if (epoch === this.epoch)
        this.update({
          [side]: { status: this.ble.isUp(side) ? "sent" : "disconnected" },
        });
      return transport;
    } catch (error) {
      if (epoch === this.epoch)
        this.update({
          [side]: {
            status: this.ble.isUp(side) ? "error" : "disconnected",
            error: String(error),
          },
        });
      throw error;
    }
  };
}

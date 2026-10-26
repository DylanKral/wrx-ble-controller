import type { BLEManager } from "../bluetooth/BLEManager";
import type { Side } from "../bluetooth/types";
import type { Simulator } from "./Simulator";
export type OutputMode = "simulation" | "hardware" | "combined";
export function isOutputMode(value: string): value is OutputMode {
  return ["simulation", "hardware", "combined"].includes(value);
}
// Routing is separate from sampling/rendering. Existing command bytes pass through untouched.
export class PlaybackOutput {
  private epoch = 0;
  constructor(
    private ble: BLEManager,
    readonly simulator: Simulator,
    public mode: OutputMode = "hardware",
  ) {}
  setMode(mode: OutputMode) {
    this.epoch++;
    this.mode = mode;
  }
  get hardwareEnabled() {
    return this.mode !== "simulation";
  }
  get simulationEnabled() {
    return this.mode !== "hardware";
  }
  isUp = (side: Side) => this.hardwareEnabled && this.ble.isUp(side);
  isWriting = (side: Side) => this.ble.isWriting(side);
  observe = (bytes: Uint8Array<ArrayBuffer>) => {
    if (bytes.length !== 7) return;
    if (bytes[0] === 0x56 && bytes[6] === 0xaa) {
      const color =
        "#" +
        Array.from(bytes.slice(1, 4), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
      // Remember issued RGB even when the live visualization is disabled.
      if (this.simulationEnabled) this.simulator.color(color);
      else this.simulator.setSelectedColor(color);
    } else if (this.simulationEnabled && bytes[0] === 0x9e && bytes[6] === 0xe9)
      this.simulator.mode(bytes[2] + 1, bytes[3]);
  };
  async send(
    bytes: Uint8Array<ArrayBuffer>,
    valid: () => boolean = () => true,
  ): Promise<boolean> {
    if (!valid()) return false;
    const epoch = this.epoch,
      mode = this.mode;
    this.observe(bytes);
    if (mode === "simulation") return true;
    if (
      mode === "combined" &&
      !this.ble.isUp("left") &&
      !this.ble.isUp("right")
    ) {
      this.ble.report(
        "Preview running; no connected lights to receive Bluetooth commands.",
      );
      return true;
    }
    const ok = await this.ble.send(
      bytes,
      () => valid() && this.epoch === epoch && this.hardwareEnabled,
    );
    return mode === "combined" || ok;
  }
  writeSide = (side: Side, bytes: Uint8Array<ArrayBuffer>) => {
    if (!this.hardwareEnabled)
      return Promise.reject(
        new Error("Simulation Only does not transmit Bluetooth commands."),
      );
    return this.ble.writeSide(side, bytes);
  };
}

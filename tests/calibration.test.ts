import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CalibrationEngine } from "../src/calibration/CalibrationEngine";
import { BLEManager } from "../src/bluetooth/BLEManager";
import { csv, json } from "../src/calibration/exports";
import { MemoryStorage } from "./helpers";
import { timingSpecs, modeSpecs } from "../src/calibration/specs";
import { keys } from "../src/storage/persistence";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
async function setup(delay = 0) {
  const ble = new BLEManager(() => undefined),
    storage = new MemoryStorage();
  for (const side of ["left", "right"] as const) {
    const name = side === "left" ? "Dream-CF4B" : "Dream-A90F";
    const gatt = {
      connected: true,
      connect: async () => ({
        getPrimaryService: async () => ({
          getCharacteristic: async () => ({
            properties: { writeWithoutResponse: true },
            writeValueWithoutResponse: async () => {
              if (delay) await new Promise((r) => setTimeout(r, delay));
            },
          }),
        }),
      }),
      disconnect: () => {},
    };
    await ble.linkDevice(
      side,
      Object.assign(new EventTarget(), {
        id: name,
        name,
        gatt,
      }) as unknown as BluetoothDevice,
    );
  }
  return { ble, storage, engine: new CalibrationEngine(ble, storage) };
}
it("records a blue baseline, visible cue, planned offsets and both BLE write durations", async () => {
  const { engine, storage } = await setup(5);
  engine.observation = 100;
  const run = engine.start([modeSpecs[2]], "modes");
  await vi.advanceTimersByTimeAsync(4000);
  await run;
  const events = engine.state.events;
  expect(events.find((e) => e.event === "command_request")?.hex).toBe(
    "560000FF00F0AA",
  );
  expect(events.find((e) => e.event === "visual_marker")?.mode).toBe(4);
  const writes = events.filter(
    (e) => e.event === "write_completed" && e.mode === 4,
  );
  expect(writes.map((e) => e.side)).toEqual(["left", "right"]);
  expect(writes.every((e) => Number(e.ble_write_promise_ms) >= 5)).toBe(true);
  expect(events.some((e) => e.event === "run_end")).toBe(true);
  expect(JSON.parse(storage.getItem(keys.calibration)!)).toEqual(events);
  expect(csv(events)).toContain("dispatch_lateness_ms");
  expect(JSON.parse(json(events)).note).toContain("NOT physical LED response");
});
it("skips pending per-controller writes during bounded stress tests", async () => {
  const { engine } = await setup(125);
  const run = engine.start([timingSpecs[6]], "timing");
  await vi.advanceTimersByTimeAsync(8000);
  await run;
  expect(engine.state.skipped).toBeGreaterThan(0);
  expect(
    engine.state.events.some((e) => e.event === "write_skipped_pending"),
  ).toBe(true);
  expect(engine.state.requested).toBe(13);
});
it("cancels the countdown and retains saved history across engine recreation", async () => {
  const { engine, storage, ble } = await setup();
  const run = engine.start([modeSpecs[0]], "modes");
  await vi.advanceTimersByTimeAsync(500);
  engine.abort("Left Calibration Mode; active test stopped.");
  await run;
  await vi.advanceTimersByTimeAsync(20000);
  expect(
    engine.state.events.filter((e) => e.event === "command_request"),
  ).toHaveLength(1);
  expect(engine.state.running).toBe(false);
  expect(new CalibrationEngine(ble, storage).state.events).toEqual(
    engine.state.events,
  );
});
it("exports quoted multiline event data without corrupting CSV", () => {
  expect(csv([{ event: 'a,"b"\nc' }])).toContain('"a,""b""\nc"');
});

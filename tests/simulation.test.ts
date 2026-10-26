import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  calibratedRecords,
  calibrationByMode,
  getFrameAtTime,
  ledSvgId,
  renderCalibratedFrame,
} from "../src/simulation/calibrations";
import { Simulator } from "../src/simulation/Simulator";
import { PlaybackOutput } from "../src/simulation/PlaybackOutput";
import { mapLedColors } from "../src/simulation/ledMapping";
import { BLEManager } from "../src/bluetooth/BLEManager";
import { colorBytes, modeBytes } from "../src/bluetooth/commands";
import { Scheduler } from "../src/animations/scheduler";
import { initialProfiles } from "../src/animations/customPresets";
afterEach(() => vi.useRealTimers());
describe("authoritative calibration data", () => {
  it("loads all eight tracks with original timestamps and 19 valid colors per frame", () => {
    expect(calibratedRecords.map((r) => r.mode)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(calibratedRecords.map((r) => r.frames.length)).toEqual([
      67, 66, 123, 106, 105, 105, 15, 75,
    ]);
    expect(calibratedRecords.map((r) => r.cycleSeconds)).toEqual([
      2.25, 2.2, 4.1, 4, 3.5, 3.5, 0.5, 2.5,
    ]);
    for (const record of calibratedRecords)
      record.frames.forEach((frame, i) => {
        expect(frame.colors).toHaveLength(19);
        expect(frame.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
        expect(frame.timeSeconds).toBeGreaterThanOrEqual(
          i ? record.frames[i - 1].timeSeconds : 0,
        );
      });
    const preview = readFileSync(
      "Animations/approved-mode-4-10-preview.html",
      "utf8",
    );
    const embedded = preview.match(
      /<script[^>]*id=["']calibration["'][^>]*>([\s\S]*?)<\/script>/,
    )![1];
    const approved = JSON.parse(embedded).records;
    for (const mode of [4, 10]) {
      const reference = approved.find((r: { mode: number }) => r.mode === mode),
        track = calibrationByMode.get(mode)!;
      expect(track.frames).toEqual(reference.frames);
      expect(track.cycleSeconds).toBe(reference.cycleSeconds);
    }
  });
  it("samples supplied timestamps using binary search, one-shot clamping and native wrapping", () => {
    for (const record of calibratedRecords) {
      for (const frame of record.frames.filter(
        (f) => f.timeSeconds <= record.cycleSeconds,
      ))
        expect(getFrameAtTime(record, frame.timeSeconds)).toBe(frame);
      expect(getFrameAtTime(record, -1)).toBe(record.frames[0]);
      // Use an inter-frame time; preserve the supplied sampler's floating-point boundary behavior.
      expect(getFrameAtTime(record, record.cycleSeconds + 0.215, true)).toBe(
        getFrameAtTime(record, 0.215),
      );
      expect(getFrameAtTime(record, 100)).toBe(
        getFrameAtTime(record, record.cycleSeconds),
      );
    }
    expect(
      calibrationByMode.get(5)!.frames.at(-1)!.timeSeconds,
    ).toBeGreaterThan(4.1);
  });
  it("preserves recorded RGB for all six non-tinted modes and uses selected hue only for Modes 4/10", () => {
    for (const record of calibratedRecords)
      for (const frame of record.frames) {
        const red = renderCalibratedFrame(record, frame, "#ff0000"),
          green = renderCalibratedFrame(record, frame, "#00ff00");
        if (![4, 10].includes(record.mode)) {
          expect(red).toEqual(frame.colors);
          expect(green).toEqual(frame.colors);
        } else {
          expect(red.every((c) => c.slice(3) === "0000")).toBe(true);
          expect(
            green.every((c) => c.slice(1, 3) === "00" && c.slice(5) === "00"),
          ).toBe(true);
        }
      }
    const breathe = calibrationByMode.get(10)!;
    expect(
      renderCalibratedFrame(breathe, breathe.frames[20], "#00ff00"),
    ).toEqual(
      renderCalibratedFrame(breathe, breathe.frames[20], "#00ff00", {
        mode10EnhanceFade: true,
        mode10FadeIntensity: 100,
      }),
    );
  });
  it("maps every logical pixel to the exact approved left/right IDs and preserves the mirrored SVG", () => {
    const svg = readFileSync("Animations/wrx-taillights-19zone.svg", "utf8");
    const mapping = mapLedColors(
      Array.from(
        { length: 19 },
        (_, i) => `#${i.toString(16).padStart(6, "0")}`,
      ),
    );
    for (const led of mapping)
      for (const side of ["left", "right"] as const) {
        const id = ledSvgId(side, led.number);
        expect(svg).toContain(`id="${id}"`);
        const tag = svg.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))![0];
        expect(tag).toContain(`data-index="${led.number - 1}"`);
        expect(tag).toContain(`data-led-number="${led.number}"`);
      }
    expect(new Set(mapping.flatMap((p) => [p.leftId, p.rightId])).size).toBe(
      38,
    );
    expect(svg).toContain('viewBox="0 0 1480 485"');
    expect(svg).toContain('transform="translate(1591 0) scale(-1 1)"');
    expect(() => mapLedColors([])).toThrow();
  });
});
describe("simulation playback and output isolation", () => {
  it("lets a paused native-loop track scrub to its end without wrapping to frame zero", () => {
    const sim = new Simulator();
    sim.inspectMode(9);
    sim.seek(0.5);
    expect(sim.sample().elapsed).toBe(0.5);
    expect(sim.sample().frame).toBe(calibrationByMode.get(9)!.frames.at(-1));
    sim.play();
    expect(sim.sample().elapsed).toBeLessThan(0.05);
  });
  it("keeps factory playback moving through Wait steps and applies later Custom RGB to Mode 10", async () => {
    vi.useFakeTimers();
    const sim = new Simulator(),
      ble = new BLEManager(() => undefined),
      output = new PlaybackOutput(ble, sim, "simulation"),
      scheduler = new Scheduler((bytes, valid) => output.send(bytes, valid));
    const run = scheduler.start({
      id: "personal-sequence",
      name: "Saved user sequence",
      repeat: false,
      experimental: false,
      steps: [
        { type: "color", color: "#ff0000", ms: 100 },
        { type: "mode", mode: 4, ms: 300 },
        { type: "wait", ms: 200 },
        { type: "color", color: "#00ff00", ms: 100 },
        { type: "mode", mode: 10, ms: 1800 },
      ],
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(sim.state.mode).toBe(4);
    expect(sim.sample().elapsed).toBeCloseTo(0.4);
    await vi.advanceTimersByTimeAsync(100);
    expect(sim.state.mode).toBeNull();
    expect(sim.state.selectedColor).toBe("#00ff00");
    await vi.advanceTimersByTimeAsync(100);
    expect(sim.state.mode).toBe(10);
    expect(sim.state.selectedColor).toBe("#00ff00");
    await vi.advanceTimersByTimeAsync(1800);
    await run;
  });
  function setup() {
    let time = 0;
    const remember = vi.fn(),
      sim = new Simulator("#ff0000", remember, () => time),
      ble = new BLEManager(() => undefined),
      send = vi.spyOn(ble, "send").mockResolvedValue(true),
      write = vi.spyOn(ble, "writeSide").mockResolvedValue("test");
    return {
      sim,
      ble,
      send,
      write,
      remember,
      setTime: (t: number) => (time = t),
    };
  }
  it("uses a monotonic clock, interrupts on a new mode/color, and keeps native loops distinct", () => {
    const { sim, setTime } = setup();
    sim.mode(4);
    setTime(700);
    expect(sim.sample().frame).toBe(
      getFrameAtTime(calibrationByMode.get(4)!, 0.7),
    );
    sim.mode(7);
    expect(sim.sample().elapsed).toBe(0);
    setTime(2000);
    expect(sim.sample().elapsed).toBe(1.3);
    sim.color("#0000ff");
    expect(sim.sample().colors).toEqual(Array(19).fill("#0000ff"));
    sim.mode(10);
    setTime(5000);
    expect(sim.sample().running).toBe(false);
    expect(sim.sample().elapsed).toBe(2.5);
    sim.mode(5);
    setTime(9500);
    expect(sim.sample().running).toBe(true);
    expect(sim.sample().elapsed).toBeCloseTo(0.4);
  });
  it("remembers picker and sequence colors for Modes 4/10 without recoloring other tracks", () => {
    const { sim, setTime, remember } = setup();
    sim.setSelectedColor("#00ff00");
    sim.mode(4);
    setTime(600);
    const before = sim.sample();
    expect(before.colors).toEqual(
      renderCalibratedFrame(before.record!, before.frame!, "#00ff00"),
    );
    sim.color("#0000ff");
    sim.mode(10);
    setTime(1500);
    const next = sim.sample();
    expect(next.colors).toEqual(
      renderCalibratedFrame(next.record!, next.frame!, "#0000ff"),
    );
    expect(remember).toHaveBeenLastCalledWith("#0000ff");
    sim.mode(7);
    expect(sim.sample().colors).toEqual(sim.sample().frame!.colors);
  });
  it("pauses, scrubs and frame-steps solely in the preview", () => {
    const { sim, setTime, send, write } = setup();
    sim.inspectMode(4);
    sim.play();
    setTime(600);
    sim.pause();
    setTime(2000);
    expect(sim.sample().elapsed).toBe(0.6);
    sim.seek(0.4);
    const frame = sim.sample().frame!;
    sim.step(1);
    expect(sim.sample().frame!.frame).toBe(frame.frame + 1);
    sim.step(-1);
    expect(sim.sample().frame).toBe(frame);
    expect(send).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("never calls BLE in Simulation Only, including direct per-side requests", async () => {
    const { sim, ble, send, write } = setup(),
      output = new PlaybackOutput(ble, sim, "simulation");
    expect(await output.send(colorBytes("#0000ff"))).toBe(true);
    expect(await output.send(modeBytes(4))).toBe(true);
    await expect(output.writeSide("left", modeBytes(4))).rejects.toThrow(
      "Simulation Only",
    );
    expect(send).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(sim.state.mode).toBe(4);
    expect(sim.state.selectedColor).toBe("#0000ff");
  });
  it("keeps Hardware Only packets unchanged and previews Combined independently of connection failures", async () => {
    const { sim, ble, send } = setup(),
      output = new PlaybackOutput(ble, sim, "hardware");
    await output.send(modeBytes(4));
    expect(send.mock.calls[0][0]).toEqual(modeBytes(4));
    expect(sim.state.mode).toBeNull();
    output.setMode("combined");
    await output.send(modeBytes(7));
    expect(sim.state.mode).toBe(7);
    expect(send).toHaveBeenCalledTimes(1);
    vi.spyOn(ble, "isUp").mockReturnValue(true);
    send.mockResolvedValue(false);
    expect(await output.send(modeBytes(8))).toBe(true);
    expect(sim.state.mode).toBe(8);
  });
  it("invalidates queued hardware commands when switching outputs", async () => {
    const { sim, ble, send } = setup(),
      output = new PlaybackOutput(ble, sim);
    await output.send(modeBytes(4));
    const valid = send.mock.calls[0][1]!;
    expect(valid()).toBe(true);
    output.setMode("simulation");
    expect(valid()).toBe(false);
    await output.send(modeBytes(8));
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("uses the existing Custom scheduler for calibrated cuts, waits, color changes and repeats", async () => {
    vi.useFakeTimers();
    const sim = new Simulator(),
      ble = new BLEManager(() => undefined),
      send = vi.spyOn(ble, "send"),
      output = new PlaybackOutput(ble, sim, "simulation"),
      scheduler = new Scheduler((b, valid) => output.send(b, valid));
    const run = scheduler.start(
      initialProfiles.find((p) => p.id === "overlap-double")!,
      2,
    );
    await vi.advanceTimersByTimeAsync(99);
    expect(sim.state.mode).toBeNull();
    expect(sim.state.selectedColor).toBe("#0000ff");
    await vi.advanceTimersByTimeAsync(1);
    expect(sim.state.mode).toBe(7);
    await vi.advanceTimersByTimeAsync(3200);
    expect(sim.state.mode).toBeNull();
    await vi.advanceTimersByTimeAsync(100);
    expect(sim.state.mode).toBe(7);
    await vi.advanceTimersByTimeAsync(3200);
    await run;
    expect(send).not.toHaveBeenCalled();
    const cut = scheduler.start(
      initialProfiles.find((p) => p.id === "overlap-cut")!,
      1,
    );
    await vi.advanceTimersByTimeAsync(1300);
    expect(sim.state.mode).toBe(8);
    expect(sim.sample().elapsed).toBe(0);
    await vi.advanceTimersByTimeAsync(1300);
    await cut;
  });
});

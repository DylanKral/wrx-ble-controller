import { CAL } from "../animations/factoryModes";
import {
  DEFAULT_NATIVE_SPEED,
  validNativeSpeed,
} from "../animations/nativeSpeed";
import {
  calibrationByMode,
  canonicalHex,
  getFrameAtTime,
  renderCalibratedFrame,
} from "./calibrations";
export interface SimulationState {
  mode: number | null;
  selectedColor: string;
  playing: boolean;
  repeat: boolean;
  startedAt: number;
  offset: number;
  nativeSpeed: number;
  timeFactor: number;
}
export class Simulator {
  private listeners = new Set<() => void>();
  state: SimulationState;
  constructor(
    color = "#ff0000",
    private rememberColor: (color: string) => void = () => {},
    private now = () => performance.now(),
    private durationFactor: (mode: number, speed: number) => number = () => 1,
  ) {
    this.state = {
      mode: null,
      selectedColor: canonicalHex(color),
      playing: false,
      repeat: false,
      startedAt: this.now(),
      offset: 0,
      nativeSpeed: DEFAULT_NATIVE_SPEED,
      timeFactor: 1,
    };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<SimulationState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((f) => f());
  }
  setSelectedColor(color: string) {
    const selectedColor = canonicalHex(color);
    this.rememberColor(selectedColor);
    this.update({ selectedColor });
  }
  color(color: string) {
    this.setSelectedColor(color);
    this.update({ mode: null, playing: false, offset: 0 });
  }
  mode(mode: number, nativeSpeed = DEFAULT_NATIVE_SPEED) {
    if (!validNativeSpeed(nativeSpeed)) throw new Error("Invalid native speed");
    const sample = this.sample();
    // Repeated selections cannot force a running factory effect to restart.
    if (
      this.state.mode === mode &&
      this.state.nativeSpeed === nativeSpeed &&
      sample.running
    )
      return;
    this.update({
      mode,
      playing: true,
      repeat: CAL[mode]?.kind === "continuous",
      startedAt: this.now(),
      offset: 0,
      nativeSpeed,
      timeFactor: this.durationFactor(mode, nativeSpeed),
    });
  }
  inspectMode(mode: number, nativeSpeed = DEFAULT_NATIVE_SPEED) {
    this.update({
      mode,
      playing: false,
      repeat: CAL[mode]?.kind === "continuous",
      startedAt: this.now(),
      offset: 0,
      nativeSpeed,
      timeFactor: this.durationFactor(mode, nativeSpeed),
    });
  }
  private elapsed(at = this.now()) {
    return (
      this.state.offset +
      (this.state.playing
        ? Math.max(0, at - this.state.startedAt) /
          (1000 * this.state.timeFactor)
        : 0)
    );
  }
  sample(at = this.now()) {
    const record =
      this.state.mode === null
        ? undefined
        : calibrationByMode.get(this.state.mode);
    const duration = record?.cycleSeconds ?? 0,
      rawElapsed = this.elapsed(at);
    const repeating = this.state.playing && this.state.repeat;
    const elapsed =
      repeating && duration > 0
        ? rawElapsed % duration
        : Math.min(rawElapsed, duration);
    const frame = record ? getFrameAtTime(record, rawElapsed, repeating) : null;
    const colors =
      record && frame
        ? renderCalibratedFrame(record, frame, this.state.selectedColor)
        : Array<string>(19).fill(
            this.state.mode === null ? this.state.selectedColor : "#000000",
          );
    return {
      record,
      frame,
      colors,
      elapsed,
      duration,
      wallDuration: duration * this.state.timeFactor,
      running:
        this.state.playing &&
        !!record &&
        (this.state.repeat || rawElapsed < duration),
    };
  }
  pause() {
    const elapsed = this.sample().elapsed;
    this.update({ playing: false, offset: elapsed });
  }
  play() {
    const sample = this.sample();
    this.update({
      playing: true,
      offset: sample.elapsed >= sample.duration ? 0 : sample.elapsed,
      startedAt: this.now(),
    });
  }
  seek(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    const duration = this.sample().duration;
    this.update({
      playing: false,
      offset: Math.max(0, Math.min(duration, seconds)),
      startedAt: this.now(),
    });
  }
  step(direction: -1 | 1) {
    const sample = this.sample();
    if (!sample.record || !sample.frame) return;
    const frames = sample.record.frames,
      index = frames.indexOf(sample.frame);
    const next =
      frames[Math.max(0, Math.min(frames.length - 1, index + direction))];
    this.seek(next.timeSeconds);
  }
  setRepeat(repeat: boolean) {
    const offset = this.sample().elapsed;
    this.update({ repeat, offset, startedAt: this.now() });
  }
  refreshSpeedMapping() {
    if (this.state.mode === null) return;
    // Mapping toggles preserve the current captured-frame position; no command is sent.
    const offset = this.sample().elapsed;
    this.update({
      offset,
      startedAt: this.now(),
      timeFactor: this.durationFactor(this.state.mode, this.state.nativeSpeed),
    });
  }
}

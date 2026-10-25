import { colorBytes, modeBytes } from "../bluetooth/commands";
import type { Profile, Step } from "./types";
export interface Playback {
  profileId: string;
  name: string;
  step: number;
  total: number;
  current: Step | null;
  cycles: number;
  sends: number;
  late: number;
  internal: boolean;
}
export class Scheduler {
  private token: AbortController | null = null;
  private listeners = new Set<() => void>();
  state: Playback | null = null;
  message = "No profile running";
  constructor(
    private send: (
      b: Uint8Array<ArrayBuffer>,
      valid: () => boolean,
    ) => Promise<boolean>,
    private now = () => performance.now(),
  ) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.state;
  private emit() {
    this.listeners.forEach((f) => f());
  }
  stop(reason = "Playback stopped; last factory effect may remain active.") {
    this.token?.abort();
    this.token = null;
    this.state = null;
    this.message = reason;
    this.emit();
  }
  private until(deadline: number, signal: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        resolve(ok);
      };
      const abort = () => finish(false);
      const tick = () => {
        if (signal.aborted) return finish(false);
        const remain = deadline - this.now();
        if (remain <= 0) return finish(true);
        timer = setTimeout(tick, Math.min(remain, 45));
      };
      signal.addEventListener("abort", abort, { once: true });
      tick();
    });
  }
  async start(
    source: Profile,
    repeatCount = source.repeat ? Infinity : 1,
  ): Promise<void> {
    this.stop();
    const profile: Profile = JSON.parse(JSON.stringify(source));
    if (!profile.steps.length) {
      this.message = "No steps in selected profile.";
      this.emit();
      return;
    }
    if (
      repeatCount !== Infinity &&
      (!Number.isInteger(repeatCount) || repeatCount < 1)
    )
      throw new Error("Invalid repeat count");
    if (repeatCount === Infinity && profile.steps.every((s) => s.ms === 0)) {
      this.message = "A looping profile needs at least one nonzero duration.";
      this.emit();
      return;
    }
    const token = new AbortController();
    this.token = token;
    const valid = () => this.token === token && !token.signal.aborted;
    this.state = {
      profileId: profile.id,
      name: profile.name,
      step: 0,
      total: profile.steps.length,
      current: null,
      cycles: 0,
      sends: 0,
      late: 0,
      internal: !!profile.nativeLoop && repeatCount === Infinity,
    };
    this.message = (profile.experimental ? "TEST: " : "") + profile.name;
    this.emit();
    try {
      let deadline = this.now(),
        lastMode: number | null = null;
      for (let cycle = 0; cycle < repeatCount && valid(); cycle++) {
        for (let i = 0; i < profile.steps.length; i++) {
          if (!(await this.until(deadline, token.signal)) || !valid()) return;
          const step = profile.steps[i],
            issued = this.now(),
            state: Playback = this.state!;
          this.state = {
            ...state,
            step: i,
            current: step,
            cycles: cycle,
            late: state.late + (issued - deadline > 100 ? 1 : 0),
          };
          this.emit();
          const continuing =
            step.type === "mode" &&
            step.suppressRepeated &&
            lastMode === step.mode;
          if (step.type !== "wait" && !continuing) {
            const ok = await this.send(
              step.type === "mode"
                ? modeBytes(step.mode)
                : colorBytes(step.color),
              valid,
            );
            if (!valid()) return;
            if (!ok) {
              this.stop("BLE write failed; playback stopped.");
              return;
            }
            this.state = { ...this.state!, sends: this.state!.sends + 1 };
            this.emit();
            lastMode = step.type === "mode" ? step.mode : null;
          }
          if (this.state?.internal) {
            this.message =
              profile.name +
              " · controller running built-in loop. Stop + Red to finish.";
            this.emit();
            return;
          }
          // Monotonic command-start deadlines. Rebase on a late dispatch, never burst catch-up commands.
          deadline = Math.max(deadline, issued) + step.ms;
        }
        // Wait the final step's duration, including one-pass profiles, before marking completion.
        if (!(await this.until(deadline, token.signal))) return;
      }
      if (valid())
        this.stop(
          "Completed " + profile.name + "; last effect may remain active.",
        );
    } catch (e) {
      if (valid()) this.stop("Playback failed: " + String(e));
    }
  }
}

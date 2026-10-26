import { colorBytes, modeBytes } from "../bluetooth/commands";
import type { Profile, Step } from "./types";
import { DEFAULT_NATIVE_SPEED } from "./nativeSpeed";
import { resolveStepTiming, type StepTiming } from "./timing";
import type { DispatchOptions } from "./dispatch";
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
  timing?: StepTiming;
  dispatchedAt?: number;
}
interface Run {
  token: AbortController;
  generation: number;
  interrupt: AbortController;
  profile: Profile;
}
export class Scheduler {
  private run: Run | null = null;
  private listeners = new Set<() => void>();
  state: Playback | null = null;
  message = "No profile running";
  constructor(
    private send: (
      b: Uint8Array<ArrayBuffer>,
      valid: () => boolean,
      options?: DispatchOptions,
    ) => Promise<boolean>,
    private now = () => performance.now(),
    private getNativeSpeed: (mode: number) => number = () =>
      DEFAULT_NATIVE_SPEED,
    private getTiming: (step: Step, profile: Profile) => StepTiming = (
      step,
      profile,
    ) => resolveStepTiming(step, profile, this.getNativeSpeed),
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
    this.run?.token.abort();
    this.run?.interrupt.abort();
    this.run = null;
    this.state = null;
    this.message = reason;
    this.emit();
  }
  // Invalidate queued writes before waking the sole scheduling runner. A write
  // already handed to the browser cannot be recalled; BLEManager serializes it.
  restartCurrentMode(): boolean {
    const run = this.run;
    if (!run || this.state?.current?.type !== "mode") return false;
    if (this.state.internal) {
      void this.start(run.profile);
      return true;
    }
    run.generation++;
    run.interrupt.abort();
    return true;
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
        timer = setTimeout(tick, Math.max(1, Math.min(remain, 45)));
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
    if (
      !profile.steps.length ||
      (repeatCount === Infinity && profile.steps.every((s) => s.ms === 0))
    ) {
      this.message =
        "A looping profile needs at least one nonzero duration; no steps to play.";
      this.emit();
      return;
    }
    if (
      repeatCount !== Infinity &&
      (!Number.isInteger(repeatCount) || repeatCount < 1)
    )
      throw new Error("Invalid repeat count");
    const run: Run = {
      token: new AbortController(),
      interrupt: new AbortController(),
      generation: 0,
      profile,
    };
    this.run = run;
    const valid = () => this.run === run && !run.token.signal.aborted;
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
        lastMode: number | null = null,
        lastSpeed: number | null = null;
      for (let cycle = 0; cycle < repeatCount && valid(); cycle++) {
        for (let i = 0; i < profile.steps.length && valid(); i++) {
          const step = profile.steps[i];
          let restarting = false;
          do {
            run.interrupt = new AbortController();
            const signal = run.interrupt.signal,
              generation = run.generation;
            const commandValid = () => valid() && run.generation === generation;
            const timing = this.getTiming(step, profile);
            const issued = this.now();
            this.state = {
              ...this.state!,
              step: i,
              current: step,
              cycles: cycle,
              timing,
              dispatchedAt: undefined,
              late: this.state!.late + (issued - deadline > 100 ? 1 : 0),
            };
            this.emit();
            let anchor = issued;
            const continuing =
              !restarting &&
              step.type === "mode" &&
              step.suppressRepeated &&
              lastMode === step.mode &&
              lastSpeed === timing.speed;
            if (step.type !== "wait" && !continuing) {
              const sending = this.send(
                step.type === "mode"
                  ? modeBytes(step.mode, timing.speed!)
                  : colorBytes(step.color),
                commandValid,
                {
                  restart: true,
                  timeFactor: timing.animationFactor,
                  onDispatch: (at) => {
                    if (!commandValid()) return;
                    anchor = at;
                    this.state = { ...this.state!, dispatchedAt: at };
                    this.emit();
                  },
                },
              );
              // Wake on speed apply/Stop even if the old BLE request is queued.
              const interrupted = new Promise<null>((resolve) => {
                if (signal.aborted) resolve(null);
                else
                  signal.addEventListener("abort", () => resolve(null), {
                    once: true,
                  });
              });
              const ok = await Promise.race([sending, interrupted]);
              if (!valid()) return;
              if (!commandValid()) {
                restarting = true;
                continue;
              }
              if (!ok) {
                this.stop("BLE write failed; playback stopped.");
                return;
              }
              this.state = { ...this.state!, sends: this.state!.sends + 1 };
              this.emit();
              lastMode = step.type === "mode" ? step.mode : null;
              lastSpeed = timing.speed ?? null;
            }
            if (this.state?.internal) {
              run.interrupt.abort();
              this.message =
                profile.name +
                " · native loop selected; no automatic retriggers. Check delivery status. Stop + Red to finish.";
              this.emit();
              return;
            }
            deadline = anchor + timing.effectiveMs;
            const elapsed = await this.until(deadline, signal);
            if (!valid()) return;
            restarting = !elapsed || !commandValid();
            run.interrupt.abort(); // Remove the cancelled-send race listener/timer.
          } while (restarting && valid());
        }
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

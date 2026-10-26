export type Step =
  | { type: "mode"; mode: number; ms: number; suppressRepeated?: boolean }
  | { type: "color"; color: string; ms: number; timingMode?: number }
  | { type: "wait"; ms: number; timingMode?: number };
export interface Profile {
  id: string;
  name: string;
  repeat: boolean;
  experimental: boolean;
  nativeLoop?: boolean;
  followAnimationSpeed?: boolean;
  steps: Step[];
}
export interface PresetButton {
  id: string;
  label: string;
  profileId: string;
}
export type Behavior = "oneshot" | "continuous" | "unknown";
export interface Calibration {
  ms: number;
  kind: Behavior;
  note: string;
}
export interface Favorite {
  name: string;
  mode: number;
  kind: Behavior;
  fullMs: number;
  cutMs: number;
  transition: "finish" | "cut";
}
export interface Playlist {
  id: string;
  name: string;
  steps: number[];
}
export const validMode = (n: number) =>
  Number.isInteger(n) && n >= 1 && n <= 256;
export const validMs = (n: number, min = 0) =>
  Number.isInteger(n) && n >= min && n <= 60000 && n % 50 === 0;
export const formatSec = (ms: number) => (ms / 1000).toFixed(2) + "s";
export const stepText = (s: Step) =>
  s.type === "mode"
    ? `Mode ${s.mode}`
    : s.type === "color"
      ? `RGB ${s.color.toUpperCase()}`
      : "Wait";

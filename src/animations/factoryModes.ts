import type { Calibration, Profile } from "./types";
import { BASIC_REPEAT_DEFAULTS } from "./basicRepeatTiming";
export const CAL: Record<number, Calibration> = {
  "3": {
    ms: 2250,
    kind: "oneshot",
    note: "~2.25s one-pass (video estimate)",
  },
  "4": {
    ms: 2200,
    kind: "oneshot",
    note: "~2.20s chase (video estimate)",
  },
  "5": {
    ms: 4100,
    kind: "continuous",
    note: "~4.10s cycle, internally looping (estimate)",
  },
  "6": {
    ms: 4000,
    kind: "continuous",
    note: "~4.00s cycle, internally looping (estimate)",
  },
  "7": {
    ms: 3500,
    kind: "oneshot",
    note: "~3.50s overlap (estimate)",
  },
  "8": {
    ms: 3500,
    kind: "oneshot",
    note: "~3.50s reverse overlap (estimate)",
  },
  "9": {
    ms: 500,
    kind: "continuous",
    note: "~0.50s flash pulse (estimate)",
  },
  "255": {
    ms: 4000,
    kind: "continuous",
    note: "Internally-looping rainbow; 4.00s illustrative dwell, not measured",
  },
  "10": {
    ms: 3540,
    kind: "continuous",
    note: "~3.54s breathing cycle in recordings; preview is only a 2.50s capture",
  },
};
export const starter = [
  {
    name: "Chase",
    mode: 4,
  },
  {
    name: "Rainbow Chase",
    mode: 3,
  },
  {
    name: "Overlap",
    mode: 7,
  },
  {
    name: "Overlap Reverse",
    mode: 8,
  },
  {
    name: "Rainbow",
    mode: 5,
  },
  {
    name: "Effect 6",
    mode: 6,
  },
  {
    name: "Flash",
    mode: 9,
  },
  {
    name: "Favorite 8",
    mode: 2,
  },
  {
    name: "Mode 255 Rainbow",
    mode: 255,
  },
  {
    name: "Favorite 10",
    mode: 1,
  },
];
export const basicProfiles: readonly Profile[] = [
  {
    id: "basic-3",
    followAnimationSpeed: true,
    name: "Mode 3 · Rainbow Chase",
    repeat: true,
    experimental: false,
    nativeLoop: false,
    steps: [
      {
        type: "mode",
        mode: 3,
        ms: 2250,
      },
    ],
  },
  {
    id: "basic-4",
    followAnimationSpeed: true,
    name: "Mode 4 · Chase",
    repeat: true,
    experimental: false,
    nativeLoop: false,
    steps: [
      {
        type: "mode",
        mode: 4,
        ms: 2200,
      },
    ],
  },
  {
    id: "basic-5",
    followAnimationSpeed: true,
    name: "Mode 5 · Rainbow",
    repeat: true,
    experimental: false,
    nativeLoop: true,
    steps: [
      {
        type: "mode",
        mode: 5,
        ms: 4100,
      },
    ],
  },
  {
    id: "basic-6",
    followAnimationSpeed: true,
    name: "Mode 6 · Factory effect",
    repeat: true,
    experimental: false,
    nativeLoop: true,
    steps: [
      {
        type: "mode",
        mode: 6,
        ms: 4000,
      },
    ],
  },
  {
    id: "basic-7",
    basicRepeatMode: 7,
    followAnimationSpeed: true,
    name: "Mode 7 · Overlap",
    repeat: true,
    experimental: false,
    nativeLoop: false,
    steps: [
      {
        type: "mode",
        mode: 7,
        ms: BASIC_REPEAT_DEFAULTS[7],
      },
    ],
  },
  {
    id: "basic-8",
    basicRepeatMode: 8,
    followAnimationSpeed: true,
    name: "Mode 8 · Reverse Overlap",
    repeat: true,
    experimental: false,
    nativeLoop: false,
    steps: [
      {
        type: "mode",
        mode: 8,
        ms: BASIC_REPEAT_DEFAULTS[8],
      },
    ],
  },
  {
    id: "basic-9",
    followAnimationSpeed: true,
    name: "Mode 9 · Flash",
    repeat: true,
    experimental: false,
    nativeLoop: true,
    steps: [
      {
        type: "mode",
        mode: 9,
        ms: 500,
      },
    ],
  },
  {
    id: "basic-10",
    followAnimationSpeed: true,
    name: "Mode 10 · Breathe",
    repeat: true,
    experimental: false,
    nativeLoop: true,
    steps: [
      {
        type: "mode",
        mode: 10,
        ms: 3540,
      },
    ],
  },
];

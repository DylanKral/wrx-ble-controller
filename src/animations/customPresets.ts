import type { Profile } from "./types";
// Verbatim values from initialProfiles at baseline 351e770. Never replace these from storage.
export const initialProfiles: readonly Profile[] = [
  {
    id: "blue-overlap",
    name: "Blue Overlap",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 7,
        ms: 3200,
      },
    ],
  },
  {
    id: "overlap-double",
    name: "Infinite Overlap",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 7,
        ms: 3200,
      },
    ],
  },
  {
    id: "reverse-double",
    name: "Reverse Infinite Overlap",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 8,
        ms: 3200,
      },
    ],
  },
  {
    id: "overlap-cut",
    name: "Overlap · 1.30s cut",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 7,
        ms: 1300,
      },
      {
        type: "mode",
        mode: 8,
        ms: 200,
      },
    ],
  },
  {
    id: "chase-breathe",
    name: "Chase → Breathe",
    repeat: true,
    experimental: true,
    steps: [
      {
        type: "mode",
        mode: 4,
        ms: 2200,
      },
      {
        type: "mode",
        mode: 10,
        ms: 1800,
      },
    ],
  },
  {
    id: "chase-rainbow",
    name: "Chase / Rainbow chase",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "mode",
        mode: 4,
        ms: 700,
      },
      {
        type: "mode",
        mode: 3,
        ms: 700,
      },
    ],
  },
  {
    id: "black-blue-chase",
    name: "Black / Blue chase test",
    repeat: true,
    experimental: true,
    steps: [
      {
        type: "mode",
        mode: 4,
        ms: 700,
      },
      {
        type: "color",
        color: "#000000",
        ms: 100,
      },
      {
        type: "mode",
        mode: 4,
        ms: 100,
      },
      {
        type: "color",
        color: "#0000ff",
        ms: 700,
      },
    ],
  },
  {
    id: "breathe-to-overlap",
    name: "Breathe fade → Overlap",
    repeat: true,
    experimental: true,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 10,
        ms: 1800,
      },
      {
        type: "color",
        color: "#0000ff",
        ms: 50,
      },
      {
        type: "mode",
        mode: 7,
        ms: 3500,
      },
    ],
  },
  {
    id: "basic-chase",
    name: "Chase",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "mode",
        mode: 4,
        ms: 2350,
      },
    ],
  },
  {
    id: "flash",
    name: "Flash",
    repeat: false,
    experimental: false,
    steps: [
      {
        type: "mode",
        mode: 9,
        ms: 1000,
      },
    ],
  },
  {
    id: "forward-backwards",
    name: "Forward / Backwards",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "mode",
        mode: 7,
        ms: 3200,
      },
      {
        type: "mode",
        mode: 8,
        ms: 3200,
      },
    ],
  },
  {
    id: "rainbow-back-forth",
    name: "Rainbow Chase Back & Forth",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#000000",
        ms: 100,
      },
      {
        type: "mode",
        mode: 3,
        ms: 1400,
      },
    ],
  },
  {
    id: "rainbow-blue",
    name: "Rainbow Chase Blue",
    repeat: true,
    experimental: false,
    steps: [
      {
        type: "color",
        color: "#0000ff",
        ms: 100,
      },
      {
        type: "mode",
        mode: 3,
        ms: 700,
      },
      {
        type: "mode",
        mode: 4,
        ms: 600,
      },
    ],
  },
];
export const curatedIds = new Set(initialProfiles.map((p) => p.id));
export const curatedButtons = initialProfiles.map((p) => ({
  id: "btn-" + p.id,
  label: p.name,
  profileId: p.id,
}));

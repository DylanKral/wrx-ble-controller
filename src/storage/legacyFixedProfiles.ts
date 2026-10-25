import { initialProfiles } from "../animations/customPresets";
import type { Profile } from "../animations/types";

// Historical definitions are used only to recognize old fixed slots and preserve
// genuine user edits. Retired fixed presets must not reappear as personal profiles
// when loading old storage or importing a pre-cleanup backup.
const originalDefinitions: readonly Profile[] = [
  {
    id: "blue-overlap",
    name: "Blue Overlap",
    repeat: true,
    experimental: false,
    steps: [
      { type: "color", color: "#0000ff", ms: 100 },
      { type: "mode", mode: 7, ms: 3200 },
    ],
  },
  {
    id: "basic-chase",
    name: "Chase",
    repeat: true,
    experimental: false,
    steps: [{ type: "mode", mode: 4, ms: 2350 }],
  },
  {
    id: "flash",
    name: "Flash",
    repeat: false,
    experimental: false,
    steps: [{ type: "mode", mode: 9, ms: 1000 }],
  },
  {
    id: "overlap-cut",
    name: "Overlap · 1.30s cut",
    repeat: true,
    experimental: false,
    steps: [
      { type: "color", color: "#0000ff", ms: 100 },
      { type: "mode", mode: 7, ms: 1300 },
      { type: "mode", mode: 8, ms: 200 },
    ],
  },
];

export const legacyFixedProfiles = new Map(
  [...initialProfiles, ...originalDefinitions].map((profile) => [
    profile.id,
    profile,
  ]),
);
export const legacyFixedButtons = [...legacyFixedProfiles.values()].map(
  (p) => ({
    id: "btn-" + p.id,
    label: p.name,
    profileId: p.id,
  }),
);

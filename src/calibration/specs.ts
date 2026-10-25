export interface PlannedCommand {
  atMs: number;
  mode: number;
  label: string;
}
export interface TestSpec {
  id: string;
  label: string;
  desc?: string;
  commands: () => PlannedCommand[];
  observationMs?: number;
}
export const modeSpecs: TestSpec[] = Array.from({ length: 8 }, (_, i) => {
  const m = i + 2;
  return {
    id: "M" + String(m).padStart(2, "0"),
    label: "Mode " + m + " · natural duration",
    commands: () => [{ atMs: 0, mode: m, label: "MODE " + m }],
  };
});
const alternating = (interval: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    atMs: i * interval,
    mode: i % 2 ? 7 : 4,
    label: "MODE " + (i % 2 ? 7 : 4),
  }));
export const timingSpecs: TestSpec[] = [
  {
    id: "T01",
    label: "Same-mode retrigger · 250ms",
    desc: "8 × Mode 4 at 250ms intervals. Does it restart mid-pass?",
    commands: () =>
      Array.from({ length: 8 }, (_, i) => ({
        atMs: i * 250,
        mode: 4,
        label: "MODE 4 AGAIN",
      })),
    observationMs: 4000,
  },
  {
    id: "T02",
    label: "Different mode · late cut",
    desc: "Mode 4 then Mode 7 at 3.0s.",
    commands: () => [
      { atMs: 0, mode: 4, label: "MODE 4" },
      { atMs: 3000, mode: 7, label: "MODE 7" },
    ],
    observationMs: 5000,
  },
  {
    id: "T03",
    label: "Different mode · early cut",
    desc: "Mode 4 then Mode 7 at 1.0s.",
    commands: () => [
      { atMs: 0, mode: 4, label: "MODE 4" },
      { atMs: 1000, mode: 7, label: "MODE 7" },
    ],
    observationMs: 5000,
  },
  {
    id: "T04",
    label: "Alternation · 500ms",
    desc: "8 switches between Modes 4 and 7.",
    commands: () => alternating(500, 8),
    observationMs: 3500,
  },
  {
    id: "T05",
    label: "Alternation · 200ms",
    desc: "12 switches between Modes 4 and 7.",
    commands: () => alternating(200, 12),
    observationMs: 3500,
  },
  {
    id: "T06",
    label: "Alternation · 100ms",
    desc: "12 switches between Modes 4 and 7.",
    commands: () => alternating(100, 12),
    observationMs: 3500,
  },
  {
    id: "T07",
    label: "Bounded load · 50ms",
    desc: "12 switches at 50ms. Busy writes are skipped.",
    commands: () => alternating(50, 12),
    observationMs: 3500,
  },
];
export const compareSpecs: TestSpec[] = [
  {
    id: "C01a",
    label: "Mode 2 comparator",
    commands: () => [{ atMs: 0, mode: 2, label: "MODE 2" }],
  },
  {
    id: "C01b",
    label: "Mode 10 comparator",
    commands: () => [{ atMs: 0, mode: 10, label: "MODE 10" }],
  },
];

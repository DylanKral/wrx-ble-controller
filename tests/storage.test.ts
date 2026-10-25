import { describe, expect, it } from "vitest";
import {
  initialProfiles,
  curatedButtons,
} from "../src/animations/customPresets";
import {
  loadStudio,
  migrateStudio,
  fixedProfiles,
  saveStudio,
} from "../src/storage/migrations";
import { loadLegacy, defaultFavorites } from "../src/storage/legacy";
import {
  keys,
  exportConfiguration,
  importConfiguration,
} from "../src/storage/persistence";
import { MemoryStorage } from "./helpers";
const custom = {
  id: "mine",
  name: "My saved chase",
  repeat: true,
  experimental: true,
  steps: [
    { type: "mode", mode: 7, ms: 1350 },
    { type: "wait", ms: 150 },
  ],
};
describe("non-destructive migrations", () => {
  it("always supplies exactly 13 fixed profiles, separately from user profiles", () => {
    const s = new MemoryStorage();
    expect(initialProfiles).toHaveLength(13);
    expect(loadStudio(s).studio.profiles).toEqual([]);
    expect(fixedProfiles(s)).toHaveLength(13);
  });
  it.each([6, 7, 8, 9])(
    "retains v%s custom timing, selected profile, assignments, ordering, and original source",
    (version) => {
      const storage = new MemoryStorage(),
        raw = JSON.stringify({
          version,
          profiles: [...initialProfiles, custom],
          buttons: [
            { id: "mine-button", label: "Saved button", profileId: "mine" },
            ...curatedButtons.slice().reverse(),
          ],
          selectedId: "mine",
        });
      storage.setItem(version === 6 ? keys.oldStudio : keys.studio, raw);
      const { studio, warning } = loadStudio(storage);
      expect(warning).toBe("");
      expect(studio.profiles).toContainEqual(custom);
      expect(studio.buttons[0].label).toBe("Saved button");
      expect(studio.buttons[1].id).toBe(curatedButtons.at(-1)!.id);
      expect(studio.selectedId).toBe("mine");
      expect(
        storage.getItem(version === 6 ? keys.oldStudio : keys.studio),
      ).toBe(raw);
      expect(storage.getItem(keys.migrationBackup)).toBe(raw);
      saveStudio(storage, studio);
      expect(
        JSON.parse(storage.getItem(keys.studio)!).profiles,
      ).not.toContainEqual(initialProfiles[0]);
    },
  );
  it("archives edited fixed slots and preserves Rainbow Blue override from v7", () => {
    const storage = new MemoryStorage(),
      profiles = structuredClone(initialProfiles);
    profiles[0].steps[1].ms = 1300;
    const color = profiles.find((p) => p.id === "rainbow-blue")!.steps[0];
    if (color.type === "color") color.color = "#123456";
    storage.setItem(
      keys.studio,
      JSON.stringify({ version: 7, profiles, buttons: curatedButtons }),
    );
    const { studio } = loadStudio(storage);
    expect(
      studio.profiles.find((p) => p.id === "saved-edit-blue-overlap")?.steps[1]
        .ms,
    ).toBe(1300);
    expect(
      studio.profiles.some((p) => p.id === "saved-edit-rainbow-blue"),
    ).toBe(false);
    expect(storage.getItem(keys.rainbow)).toBe("#123456");
    expect(
      fixedProfiles(storage).find((p) => p.id === "rainbow-blue")?.steps[0],
    ).toEqual({ type: "color", color: "#123456", ms: 100 });
  });
  it("preserves old reassigned pinned buttons as additional assignments", () => {
    const s = migrateStudio({
      version: 8,
      profiles: [custom],
      buttons: [
        {
          id: curatedButtons[0].id,
          label: "Custom assignment",
          profileId: "mine",
        },
      ],
    });
    expect(s.buttons).toHaveLength(14);
    expect(s.buttons[0].profileId).toBe("mine");
    expect(
      s.buttons.find((b) => b.id === curatedButtons[0].id)?.profileId,
    ).toBe("blue-overlap");
  });
  it("retains malformed source and does not replace it with defaults", () => {
    const s = new MemoryStorage();
    s.setItem(keys.studio, "{broken");
    expect(loadStudio(s).warning).toContain("not been erased");
    expect(s.getItem(keys.studio)).toBe("{broken");
  });
  it("continues loading valid data when a backup cannot fit in storage", () => {
    const s = new MemoryStorage();
    s.setItem(
      keys.studio,
      JSON.stringify({ version: 8, profiles: [custom], buttons: [] }),
    );
    s.setItem = () => {
      throw new Error("quota");
    };
    expect(loadStudio(s).studio.profiles).toContainEqual(custom);
  });
  it("rejects invalid steps before an import can overwrite profiles", () => {
    expect(() =>
      migrateStudio({
        profiles: [{ ...custom, steps: [{ type: "mode", mode: 257, ms: 70 }] }],
      }),
    ).toThrow();
  });
  it("migrates legacy v3 names and v4 placeholders without overriding manual timing", () => {
    const s = new MemoryStorage();
    s.setItem(
      "wrx-dream-presets-v3",
      JSON.stringify(
        defaultFavorites.map((p) => ({ ...p, name: "User name" })),
      ),
    );
    expect(loadLegacy(s).state.presets[0].name).toBe("User name");
    const presets = defaultFavorites.map((p) => ({
      ...p,
      fullMs: 3000,
      cutMs: 1250,
    }));
    presets[1].fullMs = 3450;
    s.setItem(
      "wrx-dream-presets-v4",
      JSON.stringify({
        presets: presets.map((p, i) => ({ ...p, include: i === 2 })),
        selected: 4,
      }),
    );
    const { state } = loadLegacy(s);
    expect(state.presets[0].fullMs).toBe(2200);
    expect(state.presets[1].fullMs).toBe(3450);
    expect(state.selected).toBe(4);
    expect(state.steps).toEqual([2]);
  });
  it("retains v5 playlists, favorites, sequence timing and selection", () => {
    const s = new MemoryStorage();
    s.setItem(
      keys.favorites,
      JSON.stringify({ presets: defaultFavorites, selected: 3 }),
    );
    s.setItem(
      keys.playlists,
      JSON.stringify({
        items: [{ id: "old-list", name: "Saved playlist", steps: [3, 2, 1] }],
        active: "old-list",
        steps: [0],
      }),
    );
    const { state } = loadLegacy(s);
    expect(state.selected).toBe(3);
    expect(state.steps).toEqual([3, 2, 1]);
    expect(state.active).toBe("old-list");
  });
  it("exports and restores raw settings, calibration history, migration backups and unknown future wrx keys", () => {
    const s = new MemoryStorage();
    for (const k of [
      keys.calibration,
      keys.tab,
      keys.staticColor,
      keys.rainbow,
      keys.autoRestore,
      keys.oldFixedBackup,
      "wrx-future",
    ])
      s.setItem(k, "example");
    s.setItem("unrelated", "do not export");
    const backup = exportConfiguration(s),
      restored = new MemoryStorage();
    importConfiguration(restored, backup);
    expect(restored.getItem(keys.calibration)).toBe("example");
    expect(restored.getItem("wrx-future")).toBe("example");
    expect(restored.getItem("unrelated")).toBe(null);
    expect(() =>
      importConfiguration(restored, {
        format: "WRX_Configuration_v1",
        values: { unrelated: "bad" },
      }),
    ).toThrow();
  });
});

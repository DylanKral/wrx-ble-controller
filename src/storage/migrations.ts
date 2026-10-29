import {
  curatedButtons,
  curatedIds,
  initialProfiles,
} from "../animations/customPresets";
import {
  validMode,
  validMs,
  type PresetButton,
  type Profile,
  type Step,
} from "../animations/types";
import {
  keys,
  readJSON,
  readText,
  writeJSON,
  type StorageLike,
} from "./persistence";
import { legacyFixedButtons, legacyFixedProfiles } from "./legacyFixedProfiles";
// Saved exports may contain retired bundled definitions; their user-created
// duplicates have separate IDs and remain ordinary editable profiles.
const retiredBundledIds = new Set(["rainbow-chase-spectrum"]);
export interface Studio {
  version: 9;
  profiles: Profile[];
  buttons: PresetButton[];
  selectedId: string;
}
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const shortText = (s: unknown, n = 44) =>
  String(s ?? "")
    .trim()
    .slice(0, n);
export function cleanStep(value: unknown): Step | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>,
    ms = Number(s.ms);
  if (!validMs(ms)) return null;
  if (s.type === "mode" && validMode(Number(s.mode)))
    return { type: "mode", mode: Number(s.mode), ms };
  if (
    s.type === "color" &&
    typeof s.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(s.color)
  )
    return {
      type: "color",
      color: s.color.toLowerCase(),
      ms,
      ...(validMode(Number(s.timingMode))
        ? { timingMode: Number(s.timingMode) }
        : {}),
    };
  if (s.type === "wait")
    return {
      type: "wait",
      ms,
      ...(validMode(Number(s.timingMode))
        ? { timingMode: Number(s.timingMode) }
        : {}),
    };
  return null;
}
export function cleanProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    !p.id ||
    !Array.isArray(p.steps) ||
    p.steps.length > 250
  )
    return null;
  const steps = p.steps.map(cleanStep);
  if (steps.some((s) => s === null)) return null;
  return {
    id: p.id.slice(0, 80),
    name: shortText(p.name) || "Untitled",
    repeat: !!p.repeat,
    experimental: !!p.experimental,
    ...(typeof p.followAnimationSpeed === "boolean"
      ? { followAnimationSpeed: p.followAnimationSpeed }
      : {}),
    steps: steps as Step[],
  };
}
export function fixedProfiles(storage: StorageLike) {
  const profiles = clone(initialProfiles) as Profile[],
    color = readText(storage, keys.rainbow);
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const step = profiles.find((p) => p.id === "rainbow-blue")!.steps[0];
    if (step.type === "color") step.color = color.toLowerCase();
  }
  return profiles;
}
// Pure normalization is also used by old WRX_Studio_v6 imports. Invalid data never gets saved on load.
export function migrateStudio(raw: unknown): Studio {
  const base: Studio = {
    version: 9,
    profiles: [],
    buttons: clone(curatedButtons),
    selectedId: initialProfiles[0].id,
  };
  if (raw === null) return base;
  if (
    !raw ||
    typeof raw !== "object" ||
    !("profiles" in raw) ||
    !Array.isArray(raw.profiles)
  )
    throw new Error("Invalid studio data; export a backup before editing.");
  const data = raw as Record<string, unknown>,
    prior = raw.profiles.map(cleanProfile);
  if (prior.some((p) => !p))
    throw new Error("Invalid saved profile; original storage retained.");
  const profiles = prior as Profile[],
    extras = profiles.filter((p) => !legacyFixedProfiles.has(p.id) && !retiredBundledIds.has(p.id)),
    archived: Profile[] = [];
  if (Number(data.version ?? 6) < 8)
    for (const p of profiles.filter((p) => legacyFixedProfiles.has(p.id))) {
      const fixed = cleanProfile(legacyFixedProfiles.get(p.id))!,
        copy = clone(p);
      if (
        p.id === "rainbow-blue" &&
        copy.steps[0]?.type === "color" &&
        fixed.steps[0].type === "color"
      )
        copy.steps[0].color = fixed.steps[0].color;
      if (JSON.stringify(copy) !== JSON.stringify(fixed))
        archived.push({
          ...p,
          id: "saved-edit-" + p.id,
          name: shortText("Saved edit · " + p.name),
        });
    }
  const ids = new Set(curatedIds);
  for (const p of [...extras, ...archived]) {
    if (!ids.has(p.id)) {
      base.profiles.push(p);
      ids.add(p.id);
    }
  }
  const buttons: PresetButton[] = [],
    seen = new Set<string>();
  if (Array.isArray(data.buttons))
    for (const value of data.buttons) {
      if (!value || typeof value !== "object") continue;
      const b = value as Record<string, unknown>;
      if (
        typeof b.id !== "string" ||
        typeof b.profileId !== "string" ||
        !ids.has(b.profileId)
      )
        continue;
      let id = b.id.slice(0, 80);
      const pinned = legacyFixedButtons.find((p) => p.id === id)
        ?? curatedButtons.find((p) => p.id === id);
      // Preserve old reassigned/renamed buttons as extra assignments, while fixed presets always exist.
      if (
        pinned &&
        (pinned.profileId !== b.profileId || pinned.label !== b.label)
      )
        id = "saved-assignment-" + id;
      if (!seen.has(id)) {
        buttons.push({
          id,
          label: shortText(b.label, 50) || "Preset",
          profileId: b.profileId,
        });
        seen.add(id);
      }
    }
  for (const b of curatedButtons)
    if (!seen.has(b.id)) {
      buttons.push(clone(b));
      seen.add(b.id);
    }
  for (const p of archived)
    if (!buttons.some((b) => b.profileId === p.id))
      buttons.push({ id: "btn-" + p.id, label: p.name, profileId: p.id });
  base.buttons = buttons;
  base.selectedId =
    typeof data.selectedId === "string" && ids.has(data.selectedId)
      ? data.selectedId
      : base.selectedId;
  return base;
}
export function loadStudio(storage: StorageLike): {
  studio: Studio;
  warning: string;
} {
  try {
    const raw =
      readJSON(storage, keys.studio) ?? readJSON(storage, keys.oldStudio);
    const studio = migrateStudio(raw);
    // Backing up must not hide valid saved profiles when storage is full.
    try {
      if (raw !== null && readText(storage, keys.migrationBackup) === "")
        writeJSON(storage, keys.migrationBackup, raw);
    } catch {
      /* Original source remains untouched. */
    }
    if (
      raw &&
      typeof raw === "object" &&
      "profiles" in raw &&
      Array.isArray(raw.profiles) &&
      !readText(storage, keys.rainbow)
    ) {
      const p = raw.profiles
        .map(cleanProfile)
        .find((p) => p?.id === "rainbow-blue");
      const step = p?.steps.find((s) => s.type === "color");
      try {
        if (step?.type === "color") storage.setItem(keys.rainbow, step.color);
      } catch {
        /* Original source remains untouched. */
      }
    }
    // Only an explicit user edit writes the normalized studio; initialization does not overwrite source data.
    return { studio, warning: "" };
  } catch (e) {
    return {
      studio: migrateStudio(null),
      warning:
        "Saved data could not be loaded: " +
        String(e) +
        ". Existing storage has not been erased.",
    };
  }
}
export function saveStudio(storage: StorageLike, studio: Studio) {
  writeJSON(storage, keys.studio, studio);
  storage.setItem(keys.schema, "9");
}

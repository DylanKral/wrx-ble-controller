import { useRef } from "react";
import { curatedIds, initialProfiles } from "../animations/customPresets";
import {
  type Profile,
  type Step,
  validMode,
  validMs,
} from "../animations/types";
import { useApp } from "../context/AppContext";
import { clone, migrateStudio, shortText } from "../storage/migrations";
import { followsAnimationSpeed } from "../animations/timing";
import {
  download,
  exportConfiguration,
  importConfiguration,
} from "../storage/persistence";
export const makeId = () =>
  "profile-" +
  Date.now().toString(36) +
  "-" +
  Math.random().toString(36).slice(2, 8);
export function ProfileStudio() {
  const app = useApp(),
    { studio, profiles } = app,
    p = profiles.find((p) => p.id === studio.selectedId) ?? profiles[0],
    fixed = curatedIds.has(p.id),
    file = useRef<HTMLInputElement>(null);
  const save = (profile: Profile) => {
    if (!fixed)
      app.updateStudio({
        ...studio,
        profiles: studio.profiles.map((x) => (x.id === p.id ? profile : x)),
      });
  };
  function add(profile: Profile) {
    app.updateStudio({
      ...studio,
      profiles: [...studio.profiles, profile],
      selectedId: profile.id,
    });
  }
  function changeStep(index: number, step: Step) {
    save({ ...p, steps: p.steps.map((s, i) => (i === index ? step : s)) });
  }
  function moveStep(index: number, delta: number) {
    const steps = clone(p.steps);
    [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
    save({ ...p, steps });
  }
  function addStep(step: Step) {
    if (p.steps.length >= 250) {
      app.notify("Max 250 steps per profile.");
      return;
    }
    save({ ...p, steps: [...p.steps, step] });
  }
  function moveButton(index: number, delta: number) {
    const buttons = clone(studio.buttons);
    [buttons[index], buttons[index + delta]] = [
      buttons[index + delta],
      buttons[index],
    ];
    app.updateStudio({ ...studio, buttons });
  }
  const changeButton = (
    index: number,
    change: Partial<(typeof studio.buttons)[number]>,
  ) =>
    app.updateStudio({
      ...studio,
      buttons: studio.buttons.map((b, i) =>
        i === index ? { ...b, ...change } : b,
      ),
    });
  async function importFile(input: HTMLInputElement) {
    const selected = input.files?.[0];
    if (!selected) return;
    try {
      const data = JSON.parse(await selected.text());
      if (data.format === "WRX_Configuration_v1") {
        if (
          !window.confirm(
            "Restore application configuration, including saved colors, favorites, playlists, and calibration history?",
          )
        )
          return;
        app.stop();
        download(
          "wrx_before_import.json",
          JSON.stringify(exportConfiguration(app.storage), null, 2),
        );
        importConfiguration(app.storage, data);
        window.location.reload();
        return;
      }
      if (
        data.format !== "WRX_Studio_v6" ||
        !Array.isArray(data.profiles) ||
        !Array.isArray(data.buttons)
      )
        throw new Error("Invalid backup type");
      const next = migrateStudio({ ...data, version: 8 });
      if (
        !window.confirm(
          "Import custom profiles and buttons? The fixed presets will remain unchanged.",
        )
      )
        return;
      app.stop();
      app.updateStudio(next, true);
      app.notify("Custom profiles restored; fixed presets retained.");
    } catch (e) {
      app.notify("Import rejected: " + String(e));
    } finally {
      input.value = "";
    }
  }
  return (
    <section className="panel" id="dev-editor">
      <div className="sectionhead">
        <h2>Profile studio</h2>
        <span className="pill">Main presets are assigned here</span>
      </div>
      <p>
        <strong>
          {initialProfiles.length} fixed presets are built into this app.
        </strong>{" "}
        They cannot disappear when browser data is cleared. Select a fixed
        preset to test it, or choose <strong>Duplicate profile</strong> to
        customize your own copy. Your extra profiles remain saved in this
        browser.
      </p>
      <p>
        Build sequences with <strong>Mode</strong>, <strong>Color</strong>, and{" "}
        <strong>Wait</strong> steps; intervals are measured from command start.
      </p>
      <div className="studio-row">
        <label>
          Profile to edit
          <select
            aria-label="Profile to edit"
            value={p.id}
            onChange={(e) =>
              app.updateStudio({ ...studio, selectedId: e.target.value })
            }
          >
            {profiles.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() =>
            add({
              id: makeId(),
              name: "New profile",
              repeat: true,
              experimental: false,
              steps: [{ type: "mode", mode: 4, ms: 2200 }],
            })
          }
        >
          New profile
        </button>
      </div>
      <div className="studio-row">
        <label>
          Profile name
          <input
            type="text"
            maxLength={44}
            value={p.name}
            disabled={fixed}
            onChange={(e) => save({ ...p, name: e.target.value })}
          />
        </label>
        <label>
          Default playback
          <select
            aria-label="Default playback"
            value={p.repeat ? "loop" : "once"}
            disabled={fixed}
            onChange={(e) => save({ ...p, repeat: e.target.value === "loop" })}
          >
            <option value="loop">Continuous</option>
            <option value="once">One pass</option>
          </select>
        </label>
      </div>
      <label className="check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          aria-label="Follow Animation Speed for this profile"
          disabled={fixed && p.followAnimationSpeed !== undefined}
          checked={followsAnimationSpeed(
            p,
            app.nativeSpeedPreferences.bundledFollow,
          )}
          onChange={(e) =>
            fixed
              ? app.setBundledFollow(e.target.checked)
              : save({ ...p, followAnimationSpeed: e.target.checked })
          }
        />
        <span>
          Follow Animation Speed
          {fixed && p.followAnimationSpeed !== undefined
            ? " · Duplicate profile to change"
            : fixed
            ? " · applies to bundled Custom presets"
            : " · linked step timing"}
        </span>
      </label>
      <p className="hint">
        Cuts are reference times at byte 129. Effective times use{" "}
        {app.nativeSpeedPreferences.scope === "global"
          ? "linked global speed"
          : "each mode’s saved speed"}
        ; changes do not overwrite these cuts.
      </p>
      <label className="check" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={p.experimental}
          disabled={fixed}
          onChange={(e) => save({ ...p, experimental: e.target.checked })}
        />
        <span>Experimental behavior — show warning on preset</span>
      </label>
      <div className="studio-heading" style={{ marginTop: 16 }}>
        <h3>Sequence steps</h3>
        <small>
          {p.steps.length} steps{fixed ? " · fixed preset" : ""}
        </small>
      </div>
      <div>
        {p.steps.map((step, i) => {
          const timing = app.getStepTiming(step, p);
          return (
            <div
              key={p.id + "-" + i + "-" + step.type}
              className={
                "studio-step" +
                (app.playback?.profileId === p.id && app.playback.step === i
                  ? " is-playing"
                  : "")
              }
            >
              <div className="studio-step-head">
                <strong>
                  {i + 1}.{" "}
                  {step.type === "mode"
                    ? "Factory animation"
                    : step.type === "color"
                      ? "RGB color"
                      : "Timed wait"}
                </strong>
                <div className="studio-buttons">
                  <button
                    type="button"
                    aria-label={`Move step ${i + 1} up`}
                    disabled={fixed || i === 0}
                    onClick={() => moveStep(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move step ${i + 1} down`}
                    disabled={fixed || i === p.steps.length - 1}
                    onClick={() => moveStep(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Duplicate step ${i + 1}`}
                    disabled={fixed || p.steps.length >= 250}
                    onClick={() =>
                      save({
                        ...p,
                        steps: [
                          ...p.steps.slice(0, i + 1),
                          clone(step),
                          ...p.steps.slice(i + 1),
                        ],
                      })
                    }
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove step ${i + 1}`}
                    disabled={fixed}
                    onClick={() =>
                      save({ ...p, steps: p.steps.filter((_, j) => j !== i) })
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="studio-row">
                <label>
                  Action
                  <select
                    aria-label={`Step ${i + 1} action`}
                    disabled={fixed}
                    value={step.type}
                    onChange={(e) =>
                      changeStep(
                        i,
                        e.target.value === "mode"
                          ? { type: "mode", mode: 4, ms: step.ms }
                          : e.target.value === "color"
                            ? { type: "color", color: "#0000ff", ms: step.ms }
                            : { type: "wait", ms: step.ms },
                      )
                    }
                  >
                    <option value="mode">Animation mode</option>
                    <option value="color">Set RGB color</option>
                    <option value="wait">Wait only</option>
                  </select>
                </label>
                <label>
                  {step.type === "mode"
                    ? "Mode (1–256)"
                    : step.type === "color"
                      ? "Color"
                      : "Wait step"}
                  {step.type === "mode" ? (
                    <input
                      type="number"
                      min={1}
                      max={256}
                      step={1}
                      value={step.mode}
                      disabled={fixed}
                      onChange={(e) => {
                        const mode = Number(e.target.value);
                        if (validMode(mode)) changeStep(i, { ...step, mode });
                      }}
                    />
                  ) : step.type === "color" ? (
                    <input
                      type="color"
                      style={{ width: "100%" }}
                      value={step.color}
                      disabled={fixed}
                      onChange={(e) =>
                        changeStep(i, { ...step, color: e.target.value })
                      }
                    />
                  ) : (
                    <span className="hint">No command</span>
                  )}
                </label>
              </div>
              <label className="field">
                Time until next step (seconds)
                <input
                  aria-label={`Step ${i + 1} duration`}
                  key={p.id + "-" + i + "-" + step.ms}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="60"
                  step="0.05"
                  defaultValue={(step.ms / 1000).toFixed(2)}
                  disabled={fixed}
                  onBlur={(e) => {
                    const n = Number(e.target.value) * 1000,
                      ms = Math.round(n);
                    if (validMs(ms) && Math.abs(n - ms) < 0.0001)
                      changeStep(i, { ...step, ms });
                    else {
                      e.target.value = (step.ms / 1000).toFixed(2);
                      app.notify("Use 0–60 seconds in 0.05-second increments.");
                    }
                  }}
                />
              </label>
              {step.type !== "mode" && (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      aria-label={`Step ${i + 1} follow speed`}
                      disabled={fixed}
                      checked={step.timingMode !== undefined}
                      onChange={(e) =>
                        changeStep(i, {
                          ...step,
                          timingMode: e.target.checked ? 4 : undefined,
                        })
                      }
                    />
                    <span>
                      Link to a mode’s speed when Follow Animation Speed is
                      enabled
                    </span>
                  </label>
                  {step.timingMode !== undefined && (
                    <label className="field">
                      Timing source mode
                      <input
                        type="number"
                        aria-label={`Step ${i + 1} timing mode`}
                        min={1}
                        max={256}
                        disabled={fixed}
                        value={step.timingMode}
                        onChange={(e) => {
                          const timingMode = Number(e.target.value);
                          if (validMode(timingMode))
                            changeStep(i, { ...step, timingMode });
                        }}
                      />
                    </label>
                  )}
                </>
              )}
              <p className="step-timing" data-testid={`step-${i + 1}-timing`}>
                {timing.timingMode !== undefined
                  ? `Original Cut: ${(step.ms / 1000).toFixed(2)}s · Effective Cut: ${(timing.effectiveMs / 1000).toFixed(3)}s · Mode ${timing.timingMode}, byte ${timing.speed}`
                  : `Fixed time: ${(step.ms / 1000).toFixed(2)}s · unchanged`}
              </p>
            </div>
          );
        })}
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          disabled={fixed}
          onClick={() => addStep({ type: "mode", mode: 4, ms: 2200 })}
        >
          + Mode
        </button>
        <button
          type="button"
          disabled={fixed}
          onClick={() => addStep({ type: "color", color: "#0000ff", ms: 100 })}
        >
          + Color
        </button>
        <button
          type="button"
          disabled={fixed}
          onClick={() => addStep({ type: "wait", ms: 100 })}
        >
          + Wait
        </button>
        <button
          type="button"
          className="primary"
          disabled={fixed}
          onClick={() => {
            save({ ...p, name: shortText(p.name) || "Untitled" });
            app.notify("Saved " + p.name + " to this browser");
          }}
        >
          {fixed ? "Fixed in app · Duplicate to edit" : "Save profile"}
        </button>
        <button type="button" onClick={() => app.play(p)}>
          Play test
        </button>
        <button
          type="button"
          onClick={() =>
            add({
              ...clone(p),
              followAnimationSpeed: followsAnimationSpeed(
                p,
                app.nativeSpeedPreferences.bundledFollow,
              ),
              id: makeId(),
              name: (p.name + " copy").slice(0, 44),
            })
          }
        >
          Duplicate profile
        </button>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button
          className="danger"
          type="button"
          disabled={fixed}
          onClick={() => {
            if (
              confirm(
                "Delete this profile? Assigned main buttons will be removed.",
              )
            ) {
              if (app.playback?.profileId === p.id) app.stop();
              app.updateStudio({
                ...studio,
                profiles: studio.profiles.filter((x) => x.id !== p.id),
                buttons: studio.buttons.filter((b) => b.profileId !== p.id),
                selectedId: profiles[0].id,
              });
            }
          }}
        >
          Delete profile
        </button>
        <button
          type="button"
          onClick={() =>
            app.notify(
              "Editor restored to saved profile. Changes are saved as you edit.",
            )
          }
        >
          Restore editor
        </button>
      </div>
      <p className="hint">
        Observed in testing: Mode 1 appears red, Mode 2 shows no visible effect,
        and Mode 9 flashes. Mode 10 repeats breathing internally in the
        recordings; its preview covers only a partial cycle. Sending black
        mid-animation may cancel the chase. These are test hypotheses, not
        verified firmware features. Set duration in 0.05-second increments.
      </p>
      <div className="divider" />
      <div className="sectionhead">
        <h3>Configure Main buttons</h3>
        <button
          type="button"
          className="primary"
          onClick={() =>
            app.updateStudio({
              ...studio,
              buttons: [
                ...studio.buttons,
                { id: makeId(), label: p.name, profileId: p.id },
              ],
            })
          }
        >
          + Add button
        </button>
      </div>
      <p>
        Assign any saved profile to each two-column Main button. Add, reorder,
        and rename buttons here.
      </p>
      <div>
        {studio.buttons.map((b, i) => {
          const pinned =
            b.id === "btn-" + b.profileId && curatedIds.has(b.profileId);
          return (
            <div className="studio-entry" key={b.id}>
              <div className="rowtop">
                <strong>Button {i + 1}</strong>
                <div className="studio-buttons">
                  <button
                    type="button"
                    aria-label={`Move button ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => moveButton(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move button ${i + 1} down`}
                    disabled={i === studio.buttons.length - 1}
                    onClick={() => moveButton(i, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove button ${i + 1}`}
                    disabled={pinned}
                    onClick={() =>
                      app.updateStudio({
                        ...studio,
                        buttons: studio.buttons.filter((_, j) => j !== i),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="studio-row">
                <label>
                  Main label
                  <input
                    type="text"
                    maxLength={50}
                    disabled={pinned}
                    value={b.label}
                    onChange={(e) => changeButton(i, { label: e.target.value })}
                  />
                </label>
                <label>
                  Assigned profile
                  <select
                    aria-label={`Button ${i + 1} assigned profile`}
                    disabled={pinned}
                    value={b.profileId}
                    onChange={(e) =>
                      changeButton(i, { profileId: e.target.value })
                    }
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={() =>
            download(
              "wrx_profiles_backup.json",
              JSON.stringify(
                {
                  format: "WRX_Studio_v6",
                  profiles,
                  buttons: studio.buttons,
                  selectedId: studio.selectedId,
                },
                null,
                2,
              ),
            )
          }
        >
          Backup profiles as JSON
        </button>
        <button type="button" onClick={() => file.current?.click()}>
          Restore JSON backup
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              "wrx_configuration_backup.json",
              JSON.stringify(exportConfiguration(app.storage), null, 2),
            )
          }
        >
          Export complete backup
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(e) => void importFile(e.currentTarget)}
        />
      </div>
    </section>
  );
}

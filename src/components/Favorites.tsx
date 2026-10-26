import { useEffect, useState } from "react";
import { CAL } from "../animations/factoryModes";
import {
  formatSec,
  validMode,
  validMs,
  type Favorite,
} from "../animations/types";
import { useApp } from "../context/AppContext";
import { useBluetooth } from "../context/BluetoothContext";
import { favoriteProfile, validFavoriteDuration } from "../storage/legacy";
export const kindLabel = (kind: string) =>
  kind === "continuous"
    ? "Internal loop"
    : kind === "oneshot"
      ? "One pass"
      : "Uncalibrated";
export function Favorites({ repeats }: { repeats: number }) {
  const app = useApp(),
    { transport } = useBluetooth(),
    { legacy } = app,
    p = legacy.presets[legacy.selected];
  const [draft, setDraft] = useState(p),
    [full, setFull] = useState((p.fullMs / 1000).toFixed(2)),
    [cut, setCut] = useState((p.cutMs / 1000).toFixed(2));
  useEffect(() => {
    setDraft(p);
    setFull((p.fullMs / 1000).toFixed(2));
    setCut((p.cutMs / 1000).toFixed(2));
  }, [p]);
  const available = app.canPlay;
  function save() {
    const f = Number(full) * 1000,
      c = Number(cut) * 1000,
      fullMs = Math.round(f),
      cutMs = Math.round(c);
    if (
      !draft.name.trim() ||
      !validMode(draft.mode) ||
      !validFavoriteDuration(fullMs, draft.mode) ||
      Math.abs(fullMs - f) > 0.0001 ||
      (draft.transition === "cut" &&
        (!validMs(cutMs, 50) ||
          cutMs >= fullMs ||
          Math.abs(cutMs - c) > 0.0001))
    ) {
      app.notify(
        "Invalid favorite: use mode 1–256, duration 0.05–60.00s in 0.05s increments (or the measured reference), and a cut shorter than full duration.",
      );
      return;
    }
    const saved = {
      ...draft,
      name: draft.name.trim().slice(0, 28),
      fullMs,
      cutMs:
        validMs(cutMs, 50) && cutMs < fullMs
          ? cutMs
          : Math.max(50, fullMs - 50),
    };
    app.updateLegacy({
      ...legacy,
      presets: legacy.presets.map((p, i) =>
        i === legacy.selected ? saved : p,
      ),
    });
    app.notify(
      "Saved " +
        saved.name +
        " / Mode " +
        saved.mode +
        ", " +
        formatSec(fullMs) +
        ".",
    );
  }
  return (
    <>
      <section className="panel" id="dev-presets">
        <div className="sectionhead">
          <h2>My 10 favorites</h2>
          <span className="pill">Mode {p.mode}</span>
        </div>
        <p>
          Favorites and timing settings are saved locally. Existing v3/v4 names
          and manual timings are retained when present.
        </p>
        <div className="presets">
          {legacy.presets.map((p, i) => (
            <button
              className={"preset" + (legacy.selected === i ? " selected" : "")}
              type="button"
              key={i}
              aria-pressed={legacy.selected === i}
              onClick={() => app.updateLegacy({ ...legacy, selected: i })}
            >
              <strong>
                {i + 1}. {p.name}
              </strong>
              <small>
                Mode {p.mode} · {formatSec(p.fullMs)} · {kindLabel(p.kind)}
              </small>
            </button>
          ))}
        </div>
        <div className="divider" />
        <h3>Edit selected favorite</h3>
        <div className="twocol">
          <label className="field">
            Favorite name
            <input
              type="text"
              maxLength={28}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Factory mode (1–256)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={256}
              step={1}
              value={draft.mode}
              onChange={(e) =>
                setDraft({ ...draft, mode: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <label className="field">
          Mode behavior
          <select
            aria-label="Mode behavior"
            value={draft.kind}
            onChange={(e) =>
              setDraft({ ...draft, kind: e.target.value as Favorite["kind"] })
            }
          >
            <option value="oneshot">One-pass / returns to static</option>
            <option value="continuous">Factory internally loops</option>
            <option value="unknown">Unknown / not calibrated</option>
          </select>
        </label>
        <label className="field">
          Sequence transition
          <select
            aria-label="Sequence transition"
            value={draft.transition}
            onChange={(e) =>
              setDraft({
                ...draft,
                transition: e.target.value as Favorite["transition"],
              })
            }
          >
            <option value="finish">Finish — use estimated full duration</option>
            <option value="cut">Cut — switch at specified time</option>
          </select>
        </label>
        <div className="twocol">
          <label className="field">
            Full duration / cycle (seconds)
            <input
              type="number"
              min="0.05"
              max="60"
              step="0.05"
              inputMode="decimal"
              value={full}
              onChange={(e) => setFull(e.target.value)}
            />
            <span className="hint">
              One pass or estimated loop cycle; 0.05 s steps
            </span>
          </label>
          {draft.transition === "cut" && (
            <label className="field">
              Cut at (seconds)
              <input
                type="number"
                min="0.05"
                max="60"
                step="0.05"
                inputMode="decimal"
                value={cut}
                onChange={(e) => setCut(e.target.value)}
              />
              <span className="hint">Must be shorter than full duration</span>
            </label>
          )}
        </div>
        <div className="sectionhead" style={{ marginTop: 14 }}>
          <span className="smalltext">
            {CAL[draft.mode]?.note ||
              "No verified video-derived duration for this mode"}
          </span>
          <button
            type="button"
            disabled={!CAL[draft.mode]}
            onClick={() => {
              const c = CAL[draft.mode];
              setFull((c.ms / 1000).toFixed(2));
              setCut(
                (
                  Math.max(
                    50,
                    Math.min(Math.round((c.ms * 0.65) / 50) * 50, c.ms - 50),
                  ) / 1000
                ).toFixed(2),
              );
              setDraft({ ...draft, kind: c.kind });
              app.notify(
                "Loaded estimated timing; tap Save favorite to persist.",
              );
            }}
          >
            Use measured timing
          </button>
        </div>
        <div className="actions" style={{ marginTop: 15 }}>
          <button type="button" className="primary" onClick={save}>
            Save favorite + timing
          </button>
          <button
            type="button"
            disabled={!available}
            onClick={() => {
              void app.playModeOnce(p.mode);
            }}
          >
            Play selected once
          </button>
        </div>
        <p>
          “Finish” waits your entered time; it does not detect completion.
          Changing to a different factory mode can interrupt the current
          animation. Resending the same mode may not interrupt it.
        </p>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>Playback</h2>
          <span className="pill">
            {app.playback
              ? app.playback.internal
                ? "Internal loop"
                : "Playing"
              : "Stopped"}
          </span>
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button
            className="primary"
            type="button"
            disabled={!available}
            onClick={() =>
              app.play(
                favoriteProfile([p], repeats === Infinity, true),
                repeats,
              )
            }
          >
            Loop selected
          </button>
          <button
            className="danger"
            type="button"
            onClick={() => void app.applyColor("#ff0000")}
          >
            Stop + solid red
          </button>
        </div>
        <p className="metric">
          {app.playback
            ? "Step " + (app.playback.step + 1) + " · " + app.playback.name
            : "No active animation."}
        </p>
        <p className="metric">
          Commands: {app.playback?.sends || 0} · Steps:{" "}
          {app.playback
            ? app.playback.cycles * app.playback.total + app.playback.step + 1
            : 0}{" "}
          · Late: {app.playback?.late || 0}
        </p>
        <p className="metric">BLE transport: {transport}</p>
        <p className="hint">
          For a single internally-looping mode, “Until stopped” sends it once
          and leaves it running on the controller. One-pass modes retrigger at
          your entered full duration plus the 0.10-second same-mode guard.
        </p>
      </section>
    </>
  );
}

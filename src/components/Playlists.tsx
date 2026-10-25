import { useState } from "react";
import { useApp } from "../context/AppContext";
import { useBluetooth } from "../context/BluetoothContext";
import { favoriteDuration, favoriteProfile } from "../storage/legacy";
import { formatSec } from "../animations/types";
import { kindLabel } from "./Favorites";
export function Playlists({ repeats }: { repeats: number }) {
  const app = useApp(),
    { legacy: l } = app,
    { connected } = useBluetooth(),
    [name, setName] = useState(
      l.items.find((p) => p.id === l.active)?.name || "",
    ),
    [favorite, setFavorite] = useState(0);
  const queue = l.steps.map((i) => l.presets[i]);
  const durations = queue.map((p, i) =>
    favoriteDuration(p, queue[(i + 1) % queue.length].mode),
  );
  const total = durations.reduce((a, b) => a + b, 0);
  function change(steps: number[]) {
    app.updateLegacy({ ...l, active: "", steps });
    setName("");
  }
  function move(i: number, delta: number) {
    const steps = [...l.steps];
    [steps[i], steps[i + delta]] = [steps[i + delta], steps[i]];
    change(steps);
  }
  return (
    <section className="panel" id="dev-playlists">
      <div className="sectionhead">
        <h2>Custom sequences</h2>
        <span className="pill">{l.steps.length} steps</span>
      </div>
      <p>
        Create a playlist using your favorite slots. Use the up/down buttons to
        order steps. Playlists use your current favorite timing settings.
      </p>
      <label className="field">
        Saved playlist
        <select
          aria-label="Saved playlist"
          value={l.active}
          onChange={(e) => {
            const p = l.items.find((p) => p.id === e.target.value);
            app.updateLegacy({
              ...l,
              active: e.target.value,
              steps: p?.steps.slice() ?? l.steps,
            });
            setName(p?.name || "");
          }}
        >
          <option value="">Unsaved playlist</option>
          {l.items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="sequence-tools" style={{ marginTop: 10 }}>
        <label className="field">
          Playlist name
          <input
            type="text"
            maxLength={36}
            value={name}
            placeholder="My chase sequence"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (!name.trim() || !l.steps.length) {
              app.notify("Enter a playlist name and add at least one step.");
              return;
            }
            if (!l.active && l.items.length >= 30) {
              app.notify("Maximum 30 saved playlists.");
              return;
            }
            const id = l.active || "playlist-" + Date.now(),
              p = { id, name: name.trim().slice(0, 36), steps: [...l.steps] };
            app.updateLegacy({
              ...l,
              active: id,
              items: l.active
                ? l.items.map((x) => (x.id === id ? p : x))
                : [...l.items, p],
            });
            app.notify("Saved playlist " + p.name + ".");
          }}
        >
          Save
        </button>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button type="button" onClick={() => change([])}>
          New blank playlist
        </button>
        <button
          type="button"
          disabled={!l.active}
          onClick={() => {
            app.updateLegacy({
              ...l,
              items: l.items.filter((p) => p.id !== l.active),
              active: "",
              steps: [],
            });
            setName("");
          }}
        >
          Delete saved playlist
        </button>
      </div>
      <div className="divider" />
      <div className="sequence-tools">
        <label className="field">
          Add a favorite
          <select
            aria-label="Add a favorite"
            value={favorite}
            onChange={(e) => setFavorite(Number(e.target.value))}
          >
            {l.presets.map((p, i) => (
              <option key={i} value={i}>
                {i + 1}. {p.name} (Mode {p.mode})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (l.steps.length < 50) change([...l.steps, favorite]);
            else app.notify("Maximum 50 steps.");
          }}
        >
          Add step
        </button>
      </div>
      <div style={{ marginTop: 10 }}>
        {queue.map((p, i) => (
          <div
            className={
              "seq-item" +
              (app.playback?.profileId === "legacy-playback" &&
              app.playback.step === i
                ? " is-playing"
                : "")
            }
            key={i}
          >
            <div className="seq-detail">
              <strong>
                {i + 1}. {p.name}
              </strong>
              <small>
                Mode {p.mode} · {kindLabel(p.kind)} ·{" "}
                {p.transition === "cut" ? "cut" : "finish"}
              </small>
            </div>
            <button
              type="button"
              aria-label={`Move playlist step ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move playlist step ${i + 1} down`}
              disabled={i === queue.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove playlist step ${i + 1}`}
              onClick={() => change(l.steps.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        {!queue.length && <p>No steps. Add a favorite to build a playlist.</p>}
      </div>
      <div className="divider" />
      <h3>Planned timeline</h3>
      {queue.map((p, i) => {
        const before = durations.slice(0, i).reduce((a, b) => a + b, 0);
        return (
          <div className="seqline" key={i}>
            <span>
              {i + 1}. {p.name}
            </span>
            <small>
              {formatSec(before)} → {formatSec(before + durations[i])}
              {p.transition === "cut" &&
              queue[(i + 1) % queue.length].mode === p.mode
                ? " · same-mode guard"
                : ""}
            </small>
          </div>
        );
      })}
      <p>
        Estimated cycle: {formatSec(total)}. Factory continuous modes remain
        running until another mode or color is selected.
      </p>
      <div className="timing-line" aria-label="Sequence timeline">
        {queue.map((p, i) => (
          <div
            className="timing-segment"
            key={i}
            title={p.name}
            style={{
              width: (durations[i] / total) * 100 + "%",
              background: [
                "#2b83d3",
                "#6f6bdf",
                "#2e9d9f",
                "#b581c9",
                "#3b7eaa",
              ][i % 5],
            }}
          />
        ))}
      </div>
      <div className="actions" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="primary"
          disabled={(!connected.left && !connected.right) || !queue.length}
          onClick={() =>
            app.play(favoriteProfile(queue, repeats === Infinity), repeats)
          }
        >
          Play sequence
        </button>
        <button type="button" onClick={() => change([])}>
          Clear steps
        </button>
      </div>
      <p className="hint">
        Transitions use command start times. Early cuts work when the following
        mode differs; consecutive identical modes cannot be forced to interrupt
        their current effect. Internal-looping modes are not redundantly
        retriggered.
      </p>
    </section>
  );
}

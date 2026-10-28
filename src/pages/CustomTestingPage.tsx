import { useState } from "react";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { ProfileStudio } from "../components/ProfileStudio";
import { Favorites } from "../components/Favorites";
import { Playlists } from "../components/Playlists";
import { useApp } from "../context/AppContext";
import { SimulatorPanel } from "../components/SimulatorPanel";
import { NativeSpeedControls } from "../components/NativeSpeedControls";
export function CustomTestingPage({ hidden }: { hidden: boolean }) {
  const app = useApp(),
    [repeats, setRepeats] = useState(Infinity),
    [color, setColor] = useState("#0000ff");
  return (
    <main id="controller-view" hidden={hidden}>
      <div className="kicker">Development · Custom Testing</div>
      <h1>
        Custom Testing{" "}
        <span className="smalltext">v9 · Calibrated sequencer</span>
      </h1>
      <p>
        Experiment with individual factory modes, reusable profile macros, and
        precisely timed transitions. Main-page buttons are assigned here.
      </p>
      <div className="dev-shortcuts">
        <a href="#dev-presets">Favorites</a>
        <a href="#dev-editor">Profile editor</a>
        <a href="#dev-playlists">Legacy playlists</a>
      </div>
      <div className="note">
        <strong>For parked testing only.</strong> Playback times are
        video-derived estimates, not firmware completion signals. An
        internal-looping effect may continue after the browser stops scheduling;{" "}
        <strong>Stop + solid red</strong> sends a color request. Restore and
        verify factory lights before driving.
      </div>
      <ConnectionPanel />
      {!hidden && <SimulatorPanel sticky />}
      {!hidden && <NativeSpeedControls />}
      {app.warning && (
        <div className="note" role="alert">
          {app.warning}
        </div>
      )}
      <ProfileStudio />
      <section className="panel">
        <label className="field">
          Repeat selected / playlist
          <select
            aria-label="Repeat selected / playlist"
            value={repeats === Infinity ? "forever" : repeats}
            onChange={(e) =>
              setRepeats(
                e.target.value === "forever"
                  ? Infinity
                  : Number(e.target.value),
              )
            }
          >
            <option value="forever">Until stopped</option>
            {[1, 2, 5, 10, 20, 100].map((n) => (
              <option key={n} value={n}>
                {n} time{n === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      </section>
      <Favorites repeats={repeats} />
      <Playlists repeats={repeats} />
      <section className="panel">
        <h2>Static RGB</h2>
        <div className="color-row">
          <label htmlFor="dev-color">Choose a color</label>
          <input
            id="dev-color"
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              app.simulator.setSelectedColor(e.target.value);
            }}
          />
        </div>
        <div className="actions">
          <button type="button" onClick={() => void app.applyColor(color)}>
            Apply color
          </button>
          <button type="button" onClick={() => void app.applyColor("#ff0000")}>
            Set solid red
          </button>
        </div>
        <p>
          Sending static RGB changes the supplemental effect. It does not
          replace or manage factory brake, turn, or reverse functions.
        </p>
      </section>
      <section className="panel">
        <div className="sectionhead">
          <h2>Activity</h2>
          <button type="button" onClick={() => app.setActivity(["Ready."])}>
            Clear
          </button>
        </div>
        <div className="log" role="log" aria-live="polite">
          {app.activity.join("\n")}
        </div>
      </section>
      <p style={{ margin: "18px 0" }}>
        <small>
          FFD5 / FFD9 · Verified chase command 9E0003819800E9 · Mode values use
          observed mode-minus-one encoding. Timing is approximate and browser
          foreground-only. Local storage is browser-specific.
        </small>
      </p>
    </main>
  );
}

import { basicProfiles } from "../animations/factoryModes";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { ColorPicker } from "../components/ColorPicker";
import { PresetButton } from "../components/PresetButton";
import { useApp } from "../context/AppContext";
import { useBluetooth } from "../context/BluetoothContext";
import { stepText } from "../animations/types";
export function MainPage({ hidden }: { hidden: boolean }) {
  const app = useApp(),
    { connected } = useBluetooth(),
    p = app.playback;
  return (
    <main id="home-view" hidden={hidden}>
      <div className="home-header">
        <div>
          <div className="home-kicker">WRX · Dream BLE</div>
          <h1>Lighting presets</h1>
        </div>
        <div className="home-status">
          {Number(connected.left) + Number(connected.right)} of 2 connected
        </div>
      </div>
      <p className="home-sub">
        Tap a preset to play it on both tail lights. Configure buttons and
        sequences under Development.
      </p>
      <ConnectionPanel compact />
      <section
        className="panel home-static-panel"
        aria-label="Static RGB control"
      >
        <div className="sectionhead">
          <h2>Static color</h2>
          <span className="pill">Steady RGB</span>
        </div>
        <div className="home-static-controls">
          <ColorPicker value={app.staticColor} onChange={app.setStaticColor} />
          <button
            className="primary"
            type="button"
            onClick={() => void app.applyColor(app.staticColor)}
          >
            Apply color
          </button>
          <button
            type="button"
            onClick={() => {
              app.setStaticColor("#ff0000");
              void app.applyColor("#ff0000");
            }}
          >
            Red
          </button>
        </div>
        <p className="home-footnote">
          Applying a color stops the active custom sequence. The selected color
          is saved locally.
        </p>
      </section>
      {app.warning && (
        <div role="alert" className="panel startup-warning">
          <strong>Controller initialization issue</strong>
          <div>{app.warning}</div>
          <p>
            Existing saved presets have not been erased. Use Development →
            Export backup.
          </p>
        </div>
      )}
      <section className="panel home-presets-panel">
        <div className="sectionhead">
          <h2>Presets</h2>
          <span className="pill">
            {app.tab === "basic"
              ? "8 factory modes"
              : app.studio.buttons.length + " custom"}
          </span>
        </div>
        <div
          className="home-tabs"
          role="tablist"
          aria-label="Preset categories"
        >
          {(["basic", "custom"] as const).map((tab, i) => (
            <button
              type="button"
              id={"home-tab-" + tab}
              key={tab}
              role="tab"
              aria-selected={app.tab === tab}
              aria-controls={"home-" + tab + "-panel"}
              tabIndex={app.tab === tab ? 0 : -1}
              onClick={() => app.setTab(tab)}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? "basic"
                      : e.key === "End"
                        ? "custom"
                        : i === 0
                          ? "custom"
                          : "basic";
                  app.setTab(next);
                  document.getElementById("home-tab-" + next)?.focus();
                }
              }}
            >
              {tab === "basic" ? "Basic" : "Custom"}
            </button>
          ))}
        </div>
        <div
          className={"home-active-step" + (p ? " active" : "")}
          aria-live="off"
        >
          <span className="cue-indicator" />
          <span>
            {p?.current
              ? `${p.name} · ${p.step + 1}/${p.total}: ${stepText(p.current)}`
              : "Idle · Select a preset"}
          </span>
        </div>
        <div
          id="home-basic-panel"
          role="tabpanel"
          aria-labelledby="home-tab-basic"
          hidden={app.tab !== "basic"}
        >
          <p className="home-footnote">
            Factory modes 3–10. One-pass modes are retriggered on a timed loop;
            internally looping modes continue until stopped. Mode 10 timing is
            unverified.
          </p>
          <div className="home-grid" id="home-basic-grid">
            {basicProfiles.map((p) => (
              <PresetButton key={p.id} profile={p} label={p.name} />
            ))}
          </div>
        </div>
        <div
          id="home-custom-panel"
          role="tabpanel"
          aria-labelledby="home-tab-custom"
          hidden={app.tab !== "custom"}
        >
          <div className="home-grid" id="home-custom-grid">
            {app.studio.buttons.map((b) => {
              const p = app.profiles.find((p) => p.id === b.profileId);
              return p ? (
                <PresetButton key={b.id} profile={p} label={b.label} />
              ) : null;
            })}
          </div>
          <p className="home-footnote">
            Fixed Custom presets are bundled with the app; duplicate any preset
            under Development to make an editable version. Personal profiles are
            saved locally.
          </p>
        </div>
      </section>
      <p className="safety-line">
        <strong>Parked-only show control.</strong> Bluetooth RGB commands do not
        replace factory brake or turn signals. Stop, restore red, and verify
        normal lighting before driving. A failed/disconnected controller may
        retain its last color.
      </p>
    </main>
  );
}

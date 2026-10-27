import { basicProfiles } from "../animations/factoryModes";
import { ConnectionPanel } from "../components/ConnectionPanel";
import { ColorPicker } from "../components/ColorPicker";
import { PresetButton } from "../components/PresetButton";
import { useApp } from "../context/AppContext";
import { SimulatorPanel, OutputSelector } from "../components/SimulatorPanel";
import { NativeSpeedControls } from "../components/NativeSpeedControls";

export function MainPage({ hidden }: { hidden: boolean }) {
  const app = useApp();
  return (
    <main id="home-view" hidden={hidden}>
      <div className="home-header"><h1>Lighting presets</h1></div>
      <ConnectionPanel compact />
      {!hidden && <SimulatorPanel compact />}
      {app.warning && <div role="alert" className="panel startup-warning">{app.warning}</div>}
      <section className="home-presets-panel" aria-label="Animation presets">
        <div className="home-tabs" role="tablist" aria-label="Preset categories">
          {(["basic", "custom"] as const).map((tab, i) => (
            <button type="button" id={"home-tab-" + tab} key={tab} role="tab"
              aria-selected={app.tab === tab} aria-controls={"home-" + tab + "-panel"}
              tabIndex={app.tab === tab ? 0 : -1} onClick={() => app.setTab(tab)}
              onKeyDown={(e) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                  e.preventDefault();
                  const next = e.key === "Home" ? "basic" : e.key === "End" ? "custom" : i === 0 ? "custom" : "basic";
                  app.setTab(next);
                  document.getElementById("home-tab-" + next)?.focus();
                }
              }}>
              {tab === "basic" ? "Basic" : "Custom"}
            </button>
          ))}
        </div>
        {!hidden && <NativeSpeedControls main />}
        <div id="home-basic-panel" role="tabpanel" aria-labelledby="home-tab-basic" hidden={app.tab !== "basic"}>
          <div className="home-grid" id="home-basic-grid">
            {basicProfiles.map((p) => <PresetButton key={p.id} profile={p} label={p.name} />)}
          </div>
        </div>
        <div id="home-custom-panel" role="tabpanel" aria-labelledby="home-tab-custom" hidden={app.tab !== "custom"}>
          <div className="home-grid" id="home-custom-grid">
            {app.studio.buttons.map((b) => {
              const p = app.profiles.find((p) => p.id === b.profileId);
              return p ? <PresetButton key={b.id} profile={p} label={b.label} /> : null;
            })}
          </div>
        </div>
      </section>
      <section className="panel home-static-panel" aria-label="Static RGB control">
        <div className="sectionhead"><h2>Solid color</h2></div>
        <div className="home-static-controls">
          <ColorPicker value={app.staticColor} onChange={app.setStaticColor} />
          <button type="button" onClick={() => void app.applyColor(app.staticColor)}>Apply color</button>
        </div>
      </section>
      <section className="panel home-settings" aria-label="Output settings">
        {!hidden && <OutputSelector />}
        <details className="connection-diagnostics">
          <summary>Connection status</summary>
          <p aria-label="Playback delivery">{app.output.statusText()}</p>
          <p role="status">{app.message}</p>
        </details>
      </section>
      <p className="safety-line">Parked show use only. Restore red and verify factory lighting before driving.</p>
    </main>
  );
}

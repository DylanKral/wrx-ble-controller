import { useApp } from "../context/AppContext";
import { stepText } from "../animations/types";
export function StatusBar({ development }: { development: boolean }) {
  const app = useApp(),
    p = app.playback,
    current =
      app.profiles.find((p) => p.id === app.studio.selectedId) ??
      app.profiles[0];
  return (
    <div
      className="global-playbar"
      role="region"
      aria-label="Playback controls"
    >
      <div className="playing-caption">
        <strong>
          {app.calibrationState.running
            ? "Calibration · " + app.calibrationState.label
            : p
              ? "Playing · " + p.name
              : "Idle · Ready"}
        </strong>
        <small role="status">
          {p?.current
            ? `Step ${p.step + 1}/${p.total} · ${stepText(p.current)} · ${((p.timing?.effectiveMs ?? p.current.ms) / 1000).toFixed(2)}s effective`
            : app.message}
        </small>
      </div>
      {development && (
        <button
          className="global-test"
          type="button"
          onClick={() => app.play(current)}
        >
          Play test
        </button>
      )}
      <button
        className="danger"
        type="button"
        onClick={() => void app.applyColor("#ff0000")}
      >
        Stop + Red
      </button>
    </div>
  );
}

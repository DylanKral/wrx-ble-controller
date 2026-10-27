import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context/AppContext";
import { attachPlaybackBar } from "../layout/playbackBar";
export function StatusBar({ development }: { development: boolean }) {
  const app = useApp(),
    p = app.playback,
    current =
      app.profiles.find((p) => p.id === app.studio.selectedId) ??
      app.profiles[0];
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => attachPlaybackBar(ref.current!), []);
  return createPortal(
    <div
      ref={ref}
      data-mode={p?.current?.type === "mode" ? p.current.mode : "static"}
      data-profile={p?.profileId ?? ""}
      className="global-playbar"
      role="region"
      aria-label="Playback controls"
    >
      <div className="playing-caption" aria-live="polite">
        <strong>
          {app.calibrationState.running
            ? "Calibration · " + app.calibrationState.label
            : p
              ? p.name
              : "Ready"}
        </strong>
        <small>
          {app.calibrationState.running ? "Recording" : p ? "Playing" : "Select a preset"}
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
    </div>, document.body
  );
}

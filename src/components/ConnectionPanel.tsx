import { useEffect, useState } from "react";
import { useBluetooth } from "../context/BluetoothContext";
import { useApp } from "../context/AppContext";
import { names, sides } from "../bluetooth/types";
export function ConnectionPanel({
  compact = false,
  disabled = false,
}: {
  compact?: boolean;
  disabled?: boolean;
}) {
  const { manager, connected, pending, supported } = useBluetooth();
  const { autoRestore, setAutoRestore, notify } = useApp();
  const count = sides.filter((s) => connected[s]).length;
  const [open, setOpen] = useState(count !== 2);
  useEffect(() => setOpen(count !== 2), [count]);
  const body = (
    <>
      <span className="pill">
        {supported ? "Web Bluetooth available" : "Requires BLE browser / HTTPS"}
      </span>
      {sides.map((side) => (
        <div className="device" key={side}>
          <div>
            <strong>
              {side === "left" ? "Left" : "Right"} ·{" "}
              {compact ? (side === "left" ? "CF4B" : "A90F") : names[side]}
            </strong>
            <div className="status">
              <i className={"dot" + (connected[side] ? " on" : "")} />
              {pending[side]
                ? "Connecting…"
                : connected[side]
                  ? "Connected"
                  : "Disconnected"}
            </div>
          </div>
          <button
            type="button"
            aria-label={`${connected[side] ? "Disconnect" : "Connect"} ${side}`}
            disabled={pending[side] || disabled}
            onClick={() => void manager.connect(side)}
          >
            {pending[side]
              ? "Connecting…"
              : connected[side]
                ? "Disconnect"
                : "Connect"}
          </button>
        </div>
      ))}
      {compact ? (
        <>
          <div className="reconnect-panel">
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                void manager
                  .restoreDevices()
                  .then((found) =>
                    notify(
                      found
                        ? "Saved device connection attempted."
                        : "No saved devices available. Use individual Connect buttons.",
                    ),
                  )
              }
            >
              Reconnect saved devices
            </button>
            <label className="reconnect-label">
              <input
                type="checkbox"
                checked={autoRestore}
                onChange={(e) => setAutoRestore(e.target.checked)}
              />{" "}
              Auto-connect when possible
            </label>
          </div>
          <p className="home-footnote">
            Previously approved devices may be restored in compatible browsers.
            Bluefy on iOS may require manual reconnection. Keep the browser
            foregrounded for timed playback.
          </p>
        </>
      ) : (
        <p>
          Bluetooth writes are dispatched to both devices as closely together as
          the browser permits. Connections are shared across all views.
        </p>
      )}
    </>
  );
  return compact ? (
    <details
      className="panel home-connect-panel"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="home-connect-summary">
        <strong>Bluetooth connections</strong>
        <span>
          {count === 2
            ? "2 of 2 connected · Manage"
            : count === 1
              ? "1 of 2 connected · Finish setup"
              : "Not connected · Tap to connect"}
        </span>
      </summary>
      <div className="home-connect-body">{body}</div>
    </details>
  ) : (
    <section className="panel">
      <div className="sectionhead">
        <h2>Bluetooth connections</h2>
      </div>
      {body}
    </section>
  );
}

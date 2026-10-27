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
  const { autoRestore, setAutoRestore } = useApp();
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
              {names[side]}
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
      <p>
        Bluetooth writes are dispatched to both devices as closely together as
        the browser permits. Connections are shared across all views.
      </p>
    </>
  );
  return compact ? (
    <section className="home-connections" aria-label="Bluetooth connections">
      {sides.map((side) => <button key={side} type="button"
        className="connection-action"
        aria-label={`${connected[side] ? "Disconnect" : "Connect"} ${side}`}
        disabled={pending[side] || disabled}
        onClick={() => void manager.connect(side)}>
        <i className={"dot" + (connected[side] ? " on" : "")} />
        <span>{side === "left" ? "Left" : "Right"}</span>
        <small>{pending[side] ? "Connecting…" : connected[side] ? "Disconnect" : "Connect"}</small>
      </button>)}
    </section>
  ) : (
    <section className="panel">
      <div className="sectionhead">
        <h2>Bluetooth connections</h2>
      </div>
      {body}
      <div className="reconnect-panel">
        <button type="button" disabled={disabled} onClick={() => void manager.restoreDevices()}>Reconnect saved devices</button>
        <label className="reconnect-label"><input type="checkbox" checked={autoRestore} onChange={(e) => setAutoRestore(e.target.checked)} />Auto-connect when possible</label>
      </div>
    </section>
  );
}

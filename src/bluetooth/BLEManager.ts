import {
  NOTIFICATION_SERVICE,
  WRITE_CHARACTERISTIC,
  WRITE_SERVICE,
} from "./commands";
import { writeCharacteristic } from "./connections";
import {
  names,
  sides,
  type BLEState,
  type BluetoothProvider,
  type Side,
} from "./types";

export class BLEManager {
  private connections: Partial<
    Record<
      Side,
      { device: BluetoothDevice; char: BluetoothRemoteGATTCharacteristic }
    >
  > = {};
  private remembered: Partial<Record<Side, BluetoothDevice>> = {};
  private manualOff = { left: false, right: false };
  private listeners = new Set<() => void>();
  private disconnectListeners = new Set<(side: Side) => void>();
  private attached = new WeakSet<BluetoothDevice>();
  private reconnectTimers = new Map<Side, ReturnType<typeof setTimeout>>();
  private writing = new Set<Side>();
  private idleWaiters = new Map<Side, Set<() => void>>();
  private queue: Promise<unknown> = Promise.resolve();
  restoreEnabled = true;
  state: BLEState = {
    connected: { left: false, right: false },
    pending: { left: false, right: false },
    message: "Ready.",
    transport: "Not connected",
    revision: 0,
  };
  constructor(
    private provider: () => BluetoothProvider | undefined = () =>
      navigator.bluetooth,
    private visible = () => !document.hidden,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  onDisconnect(listener: (side: Side) => void) {
    this.disconnectListeners.add(listener);
    return () => {
      this.disconnectListeners.delete(listener);
    };
  }
  private update(message = this.state.message) {
    this.state = {
      ...this.state,
      connected: { left: this.isUp("left"), right: this.isUp("right") },
      pending: { ...this.state.pending },
      message,
      revision: this.state.revision + 1,
    };
    this.listeners.forEach((f) => f());
  }
  report(message: string) {
    this.update(message);
  }
  isUp = (side: Side) =>
    Boolean(
      this.connections[side]?.device.gatt?.connected &&
        this.connections[side]?.char,
    );
  getCharacteristic(side: Side) {
    return this.isUp(side) ? this.connections[side]!.char : null;
  }
  isWriting(side: Side) {
    return this.writing.has(side);
  }
  private cancelRetry(side: Side) {
    clearTimeout(this.reconnectTimers.get(side));
    this.reconnectTimers.delete(side);
  }
  setRestoreEnabled(enabled: boolean) {
    this.restoreEnabled = enabled;
    if (!enabled) sides.forEach((s) => this.cancelRetry(s));
  }
  async linkDevice(side: Side, device: BluetoothDevice): Promise<boolean> {
    if (this.state.pending[side]) return false;
    if (this.isUp(side)) return true;
    if (device.name !== names[side]) {
      this.report(
        `Incorrect device selected for ${side}; expected ${names[side]}.`,
      );
      return false;
    }
    if (
      sides.some(
        (s) => s !== side && this.connections[s]?.device.id === device.id,
      )
    )
      return false;
    this.state.pending[side] = true;
    this.update();
    try {
      if (!device.gatt) throw new Error("Device has no GATT server");
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(WRITE_SERVICE);
      const char = await service.getCharacteristic(WRITE_CHARACTERISTIC);
      this.remembered[side] = device;
      this.connections[side] = { device, char };
      if (!this.attached.has(device)) {
        device.addEventListener("gattserverdisconnected", () => {
          if (this.connections[side]?.device !== device) return;
          delete this.connections[side];
          this.report(`${names[side]} disconnected.`);
          this.disconnectListeners.forEach((f) => f(side));
          if (this.restoreEnabled && !this.manualOff[side] && this.visible())
            this.scheduleReconnect(side, 1, 1500);
        });
        this.attached.add(device);
      }
      this.report(`${names[side]} connected.`);
      return true;
    } catch (e) {
      if (device.gatt?.connected) device.gatt.disconnect();
      this.report(`${names[side]} reconnect failed: ${String(e)}`);
      return false;
    } finally {
      this.state.pending[side] = false;
      this.update();
    }
  }
  private scheduleReconnect(side: Side, attempt: number, delay: number) {
    this.cancelRetry(side);
    this.reconnectTimers.set(
      side,
      setTimeout(() => void this.reconnect(side, attempt), delay),
    );
  }
  async reconnect(side: Side, attempt = 1): Promise<void> {
    if (
      !this.restoreEnabled ||
      this.manualOff[side] ||
      !this.visible() ||
      this.isUp(side) ||
      this.state.pending[side] ||
      !this.remembered[side]
    )
      return;
    if (await this.linkDevice(side, this.remembered[side]!)) return;
    if (attempt < 4)
      this.scheduleReconnect(
        side,
        attempt + 1,
        Math.min(15000, 2000 * 2 ** attempt),
      );
  }
  async restoreDevices(quiet = false): Promise<boolean> {
    const bt = this.provider();
    if (!bt?.getDevices) {
      if (!quiet)
        this.report(
          "Previously authorized device discovery unavailable. Use Connect.",
        );
      return false;
    }
    try {
      const devices = await bt.getDevices();
      let found = 0;
      for (const side of sides) {
        const device = devices.find((d) => d.name === names[side]);
        if (!device) continue;
        this.remembered[side] = device;
        this.manualOff[side] = false;
        found++;
        if (!this.isUp(side)) await this.linkDevice(side, device);
      }
      if (!quiet)
        this.report(`Found ${found} previously authorized Dream controllers.`);
      return found > 0;
    } catch (e) {
      if (!quiet) this.report("Saved device lookup unavailable: " + String(e));
      return false;
    }
  }
  async connect(side: Side): Promise<void> {
    if (this.isUp(side)) {
      this.disconnect(side);
      return;
    }
    if (this.state.pending[side]) return;
    const bt = this.provider();
    if (!bt) {
      this.report(
        "Bluetooth unavailable; Android Chrome or iPhone Bluefy required over HTTPS.",
      );
      return;
    }
    try {
      const device = await bt.requestDevice({
        filters: [{ namePrefix: "Dream" }],
        optionalServices: [WRITE_SERVICE, NOTIFICATION_SERVICE],
      });
      this.manualOff[side] = false;
      await this.linkDevice(side, device);
    } catch (e) {
      if (!(e instanceof Error && e.name === "NotFoundError"))
        this.report("Connection error: " + String(e));
    }
  }
  disconnect(side: Side) {
    this.manualOff[side] = true;
    this.cancelRetry(side);
    const previous = this.connections[side];
    delete this.connections[side];
    previous?.device.gatt?.disconnect();
    this.report(`${names[side]} disconnected manually.`);
    this.disconnectListeners.forEach((f) => f(side));
  }
  // All views share per-controller write exclusion. Calibration deliberately skips pending writes.
  async writeSide(side: Side, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    if (this.writing.has(side)) throw new Error("write_skipped_pending");
    const ch = this.getCharacteristic(side);
    if (!ch) throw new Error("No connected target");
    this.writing.add(side);
    try {
      const transport = await writeCharacteristic(ch, bytes);
      this.state.transport = transport;
      this.update();
      return transport;
    } finally {
      this.writing.delete(side);
      this.idleWaiters.get(side)?.forEach((resolve) => resolve());
      this.idleWaiters.delete(side);
    }
  }
  send(
    bytes: Uint8Array<ArrayBuffer>,
    valid: () => boolean = () => true,
  ): Promise<boolean> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        if (!valid()) return false;
        const active = sides.filter(this.isUp);
        if (!active.length) {
          this.report("No connected devices.");
          return false;
        }
        let timeout: ReturnType<typeof setTimeout> | undefined,
          expired = false;
        const writes = Promise.allSettled(
          active.map(async (side) => {
            // A normal control (especially Stop + Red) waits behind an in-flight calibration write.
            if (this.writing.has(side))
              await new Promise<void>((resolve) => {
                const waiters =
                  this.idleWaiters.get(side) ?? new Set<() => void>();
                waiters.add(resolve);
                this.idleWaiters.set(side, waiters);
              });
            if (expired || !valid())
              throw new Error("Cancelled queued command");
            return this.writeSide(side, bytes);
          }),
        ).then((results) => {
          const errors = results.flatMap((r, i) =>
            r.status === "rejected"
              ? [`${names[active[i]]}: ${String(r.reason)}`]
              : [],
          );
          if (errors.length && !expired && valid())
            this.report(errors.join(" | "));
          return errors.length === 0;
        });
        try {
          return await Promise.race([
            writes,
            new Promise<boolean>((resolve) => {
              timeout = setTimeout(() => {
                expired = true;
                this.report("Bluetooth write stalled beyond 6s.");
                resolve(false);
              }, 6000);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      });
    this.queue = task;
    return task;
  }
  dispose() {
    sides.forEach((s) => this.cancelRetry(s));
  }
}

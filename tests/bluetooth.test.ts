import { describe, expect, it, vi, afterEach } from "vitest";
import { BLEManager } from "../src/bluetooth/BLEManager";
import {
  colorBytes,
  modeBytes,
  hex,
  WRITE_SERVICE,
  WRITE_CHARACTERISTIC,
} from "../src/bluetooth/commands";
import { writeCharacteristic } from "../src/bluetooth/connections";
import type { BluetoothProvider } from "../src/bluetooth/types";
function device(
  name = "Dream-CF4B",
  write = vi.fn(async (_bytes: Uint8Array<ArrayBuffer>) => {}),
) {
  const events = new EventTarget();
  const char = {
    properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: write,
  };
  const service = { getCharacteristic: vi.fn(async () => char) };
  const gatt = {
    connected: false,
    connect: vi.fn(async () => {
      gatt.connected = true;
      return {
        getPrimaryService: vi.fn(async (uuid: string) => {
          expect(uuid).toBe(WRITE_SERVICE);
          return service;
        }),
      };
    }),
    disconnect: vi.fn(() => {
      gatt.connected = false;
      events.dispatchEvent(new Event("gattserverdisconnected"));
    }),
  };
  const d = Object.assign(events, {
    name,
    id: name,
    gatt,
  }) as unknown as BluetoothDevice;
  return { d, gatt, write, service, char };
}
afterEach(() => vi.useRealTimers());
describe("verified command packets", () => {
  it("preserves Mode 4 and blue exactly", () => {
    expect(hex(modeBytes(4))).toBe("9E0003819800E9");
    expect(hex(colorBytes("#0000ff"))).toBe("560000FF00F0AA");
  });
  it("encodes every mode byte without reinterpreting the command", () => {
    for (let i = 1; i <= 256; i++)
      expect([...modeBytes(i)]).toEqual([0x9e, 0, i - 1, 0x81, 0x98, 0, 0xe9]);
  });
  it("handles RGB and rejects invalid input", () => {
    expect(hex(colorBytes("#12abFF"))).toBe("5612ABFF00F0AA");
    expect(() => modeBytes(257)).toThrow();
    expect(() => colorBytes("blue")).toThrow();
  });
});
describe("connection manager", () => {
  it("requests a Dream device with service access and links either controller", async () => {
    const left = device(),
      right = device("Dream-A90F");
    const requestDevice = vi
      .fn()
      .mockResolvedValueOnce(left.d)
      .mockResolvedValueOnce(right.d);
    const manager = new BLEManager(() => ({ requestDevice }));
    await manager.connect("left");
    await manager.connect("right");
    expect(manager.state.connected).toEqual({ left: true, right: true });
    expect(left.service.getCharacteristic).toHaveBeenCalledWith(
      WRITE_CHARACTERISTIC,
    );
    expect(requestDevice.mock.calls[0][0].optionalServices).toContain(
      WRITE_SERVICE,
    );
  });
  it("dispatches the same verified packet to both devices and reports a per-device failure", async () => {
    const left = device(),
      right = device("Dream-A90F");
    const manager = new BLEManager(() => undefined);
    await manager.linkDevice("left", left.d);
    await manager.linkDevice("right", right.d);
    expect(await manager.send(modeBytes(4))).toBe(true);
    expect(hex(left.write.mock.calls[0][0] as unknown as Uint8Array)).toBe(
      "9E0003819800E9",
    );
    expect(right.write).toHaveBeenCalledTimes(1);
    right.write.mockRejectedValueOnce(new Error("radio failed"));
    expect(await manager.send(colorBytes("#ff0000"))).toBe(false);
    expect(manager.state.message).toContain("Dream-A90F");
  });
  it("recovers authorized devices and reconnects after an unexpected disconnect", async () => {
    vi.useFakeTimers();
    const left = device(),
      right = device("Dream-A90F");
    const manager = new BLEManager(
      () => ({
        requestDevice: vi.fn(),
        getDevices: async () => [left.d, right.d],
      }),
      () => true,
    );
    expect(await manager.restoreDevices()).toBe(true);
    const listener = vi.fn();
    manager.onDisconnect(listener);
    left.gatt.disconnect();
    expect(listener).toHaveBeenCalledWith("left");
    expect(manager.isUp("left")).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(manager.isUp("left")).toBe(true);
    manager.disconnect("left");
    await vi.advanceTimersByTimeAsync(20000);
    expect(manager.isUp("left")).toBe(false);
    manager.dispose();
  });
  it("bounds retry attempts and honors browser visibility and disabled restore", async () => {
    vi.useFakeTimers();
    const left = device();
    const manager = new BLEManager(
      () => undefined,
      () => true,
    );
    await manager.linkDevice("left", left.d);
    left.gatt.connect.mockRejectedValue(new Error("out of range"));
    left.gatt.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(left.gatt.connect).toHaveBeenCalledTimes(5);
    manager.dispose();
    const hidden = new BLEManager(
      () => undefined,
      () => false,
    );
    const another = device();
    await hidden.linkDevice("left", another.d);
    another.gatt.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(another.gatt.connect).toHaveBeenCalledTimes(1);
  });
  it("rejects an incorrect controller and reports missing APIs", async () => {
    const manager = new BLEManager(() => undefined);
    expect(await manager.linkDevice("left", device("Dream-A90F").d)).toBe(
      false,
    );
    await manager.connect("left");
    expect(manager.state.message).toContain("Bluetooth unavailable");
    expect(await manager.restoreDevices()).toBe(false);
    expect(manager.state.message).toContain("unavailable");
  });
  it("serializes transmission, rejects overlapping per-side calibration writes, and discards cancelled queued commands", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r));
    const left = device(
      undefined,
      vi.fn(() => pending),
    );
    const manager = new BLEManager(() => undefined);
    await manager.linkDevice("left", left.d);
    const first = manager.send(modeBytes(4));
    await new Promise((r) => setTimeout(r, 0));
    await expect(manager.writeSide("left", modeBytes(7))).rejects.toThrow(
      "write_skipped_pending",
    );
    const second = manager.send(modeBytes(7), () => false);
    release();
    await first;
    expect(await second).toBe(false);
    expect(left.write).toHaveBeenCalledTimes(1);
  });
  it("fails stalled writes after six seconds without pretending the controller is idle", async () => {
    vi.useFakeTimers();
    const left = device(
      undefined,
      vi.fn(() => new Promise<void>(() => {})),
    );
    const manager = new BLEManager(() => undefined);
    await manager.linkDevice("left", left.d);
    const send = manager.send(modeBytes(4));
    await vi.advanceTimersByTimeAsync(6000);
    expect(await send).toBe(false);
    expect(manager.state.message).toContain("stalled");
    await expect(manager.writeSide("left", modeBytes(7))).rejects.toThrow(
      "pending",
    );
  });
  it("waits for an in-flight calibration write before sending Stop + Red", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => (release = r)),
      write = vi
        .fn(async (_bytes: Uint8Array<ArrayBuffer>) => {})
        .mockImplementationOnce(() => pending),
      left = device(undefined, write),
      manager = new BLEManager(() => undefined);
    await manager.linkDevice("left", left.d);
    const calibration = manager.writeSide("left", modeBytes(4)),
      red = manager.send(colorBytes("#ff0000"));
    await new Promise((r) => setTimeout(r, 0));
    expect(write).toHaveBeenCalledTimes(1);
    release();
    await calibration;
    expect(await red).toBe(true);
    expect(hex(write.mock.calls[1][0])).toBe("56FF000000F0AA");
  });
  it("falls back to with-response and legacy writes", async () => {
    for (const method of ["writeValueWithResponse", "writeValue"]) {
      const fn = vi.fn(async () => {}),
        ch = { properties: { writeWithoutResponse: false }, [method]: fn };
      await writeCharacteristic(
        ch as unknown as BluetoothRemoteGATTCharacteristic,
        modeBytes(4),
      );
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });
});

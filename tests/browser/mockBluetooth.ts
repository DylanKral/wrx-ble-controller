import type { Page } from "@playwright/test";
export interface BrowserBLE {
  writes: { side: string; hex: string; at: number }[];
  disconnect: (side: "left" | "right") => void;
  fail: boolean;
  selection: string[];
}
declare global {
  interface Window {
    __ble: BrowserBLE;
  }
}
export async function mockBluetooth(page: Page, authorized = false) {
  await page.addInitScript(
    ({ authorized }) => {
      const writes: BrowserBLE["writes"] = [];
      const devices: Record<string, BluetoothDevice> = {};
      const state: BrowserBLE = {
        writes,
        disconnect: (side) => devices[side].gatt!.disconnect(),
        fail: false,
        selection: ["left", "right"],
      };
      for (const side of ["left", "right"]) {
        const device = new EventTarget();
        const name = side === "left" ? "Dream-CF4B" : "Dream-A90F";
        const char = {
          properties: { writeWithoutResponse: true },
          writeValueWithoutResponse: async (bytes: Uint8Array) => {
            if (state.fail) throw new Error("Mock radio failure");
            writes.push({
              side,
              hex: Array.from(bytes, (x) => x.toString(16).padStart(2, "0"))
                .join("")
                .toUpperCase(),
              at: performance.now(),
            });
          },
        };
        const gatt = {
          connected: false,
          connect: async () => {
            gatt.connected = true;
            return {
              getPrimaryService: async () => ({
                getCharacteristic: async () => char,
              }),
            };
          },
          disconnect: () => {
            gatt.connected = false;
            device.dispatchEvent(new Event("gattserverdisconnected"));
          },
        };
        devices[side] = Object.assign(device, {
          id: name,
          name,
          gatt,
        }) as unknown as BluetoothDevice;
      }
      Object.defineProperty(navigator, "bluetooth", {
        configurable: true,
        value: {
          requestDevice: async () => devices[state.selection.shift() || "left"],
          getDevices: async () => (authorized ? Object.values(devices) : []),
        },
      });
      window.__ble = state;
    },
    { authorized },
  );
}
export async function navigate(page: Page, label: string) {
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

export type Side = "left" | "right";
export const sides: Side[] = ["left", "right"];
export const names: Record<Side, string> = {
  left: "Dream-CF4B",
  right: "Dream-A90F",
};
export interface BLEState {
  connected: Record<Side, boolean>;
  pending: Record<Side, boolean>;
  message: string;
  transport: string;
  revision: number;
}
export type BluetoothProvider = Pick<Bluetooth, "requestDevice"> &
  Partial<Pick<Bluetooth, "getDevices">>;

import { validMode } from "../animations/types";
import {
  DEFAULT_NATIVE_SPEED,
  validNativeSpeed,
} from "../animations/nativeSpeed";
export const WRITE_SERVICE = "0000ffd5-0000-1000-8000-00805f9b34fb";
export const WRITE_CHARACTERISTIC = "0000ffd9-0000-1000-8000-00805f9b34fb";
export const NOTIFICATION_SERVICE = "0000ffd0-0000-1000-8000-00805f9b34fb";
export const NOTIFICATION_CHARACTERISTIC =
  "0000ffd4-0000-1000-8000-00805f9b34fb";
// Verified packets: Mode 4 = 9E0003819800E9; blue = 560000FF00F0AA.
export function modeBytes(
  mode: number,
  speed = DEFAULT_NATIVE_SPEED,
): Uint8Array<ArrayBuffer> {
  if (!validMode(mode))
    throw new Error("Mode must be an integer from 1 to 256");
  if (!validNativeSpeed(speed))
    throw new Error("Native speed must be an integer from 1 to 255");
  return Uint8Array.from([0x9e, 0x00, mode - 1, speed, 0x98, 0x00, 0xe9]);
}
export function colorBytes(color: string): Uint8Array<ArrayBuffer> {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Invalid color");
  return Uint8Array.from([
    0x56,
    ...color
      .slice(1)
      .match(/../g)!
      .map((x) => parseInt(x, 16)),
    0x00,
    0xf0,
    0xaa,
  ]);
}
export const hex = (b: Uint8Array) =>
  Array.from(b, (v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

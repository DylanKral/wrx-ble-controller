export async function writeCharacteristic(
  ch: BluetoothRemoteGATTCharacteristic,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  if (
    ch.properties?.writeWithoutResponse !== false &&
    typeof ch.writeValueWithoutResponse === "function"
  ) {
    await ch.writeValueWithoutResponse(bytes);
    return "Write without response";
  }
  if (typeof ch.writeValueWithResponse === "function") {
    await ch.writeValueWithResponse(bytes);
    return "Write with response";
  }
  if (typeof ch.writeValue === "function") {
    await ch.writeValue(bytes);
    return "Legacy writeValue";
  }
  throw new Error("No GATT write method");
}

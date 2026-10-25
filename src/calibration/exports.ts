export type CalibrationEvent = Record<string, string | number | null>;
export const fields = [
  "date_utc",
  "run_id",
  "test_id",
  "test_label",
  "event",
  "elapsed_ms",
  "mode",
  "hex",
  "side",
  "planned_ms",
  "requested_at_ms",
  "marker_lateness_ms",
  "dispatch_lateness_ms",
  "ble_write_promise_ms",
  "label",
  "error",
  "note",
];
export function csv(events: CalibrationEvent[]) {
  const q = (v: unknown) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return [
    fields.join(","),
    ...events.map((row) => fields.map((key) => q(row[key])).join(",")),
  ].join("\r\n");
}
export function json(events: CalibrationEvent[]) {
  return JSON.stringify(
    {
      format: "WRX_Calibration_v1",
      exported_at: new Date().toISOString(),
      note: "BLE write completion is NOT physical LED response",
      events,
    },
    null,
    2,
  );
}
export const formatClock = (ms: number) =>
  (ms < 0 ? "-" : "") +
  String(Math.floor(Math.abs(ms) / 60000)).padStart(2, "0") +
  ":" +
  String(Math.floor((Math.abs(ms) % 60000) / 1000)).padStart(2, "0") +
  "." +
  String(Math.floor((Math.abs(ms) % 1000) / 10)).padStart(2, "0");

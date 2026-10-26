import data from "../../Animations/wrx-basic-modes-final-calibrations.json";
import type { CalibrationRecord } from "../../Animations/renderCalibratedBasicModes";
export {
  getFrameAtTime,
  renderCalibratedFrame,
  canonicalHex,
  ledSvgId,
} from "../../Animations/renderCalibratedBasicModes";
export type {
  CalibrationRecord,
  RGBFrame,
} from "../../Animations/renderCalibratedBasicModes";

// Import the authoritative records without resampling, trimming or rewriting them.
export const calibratedRecords: readonly CalibrationRecord[] = data.records;
export const calibrationByMode = new Map(
  calibratedRecords.map((record) => [record.mode, record]),
);
export const mode10FadeDefaults = data.mode10FadeDefaults;

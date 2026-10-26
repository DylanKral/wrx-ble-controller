// Timestamp is browser dispatch, never a claim about physical LED activation.
export interface DispatchOptions {
  onDispatch?: (at: number) => void;
  restart?: boolean;
  timeFactor?: number;
}

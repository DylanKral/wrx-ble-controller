import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BLEManager } from "../bluetooth/BLEManager";
const BluetoothContext = createContext<BLEManager | null>(null);
export function BluetoothProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() => new BLEManager());
  return (
    <BluetoothContext.Provider value={manager}>
      {children}
    </BluetoothContext.Provider>
  );
}
export function useBluetooth() {
  const manager = useContext(BluetoothContext);
  if (!manager) throw new Error("Missing Bluetooth provider");
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  return {
    manager,
    ...state,
    supported: !!navigator.bluetooth && window.isSecureContext,
  };
}

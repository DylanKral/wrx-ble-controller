import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { BluetoothProvider } from "./context/BluetoothContext";
import { ApplicationProvider } from "./context/AppContext";
import "./styles/app.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    return this.state.error ? (
      <main>
        <h1>Controller initialization issue</h1>
        <p role="alert">{this.state.error}</p>
        <p>
          Existing saved presets have not been erased. Reload to retry. Export
          browser storage before clearing site data.
        </p>
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BluetoothProvider>
      <ApplicationProvider>
        <App />
      </ApplicationProvider>
    </BluetoothProvider>
  </ErrorBoundary>,
);

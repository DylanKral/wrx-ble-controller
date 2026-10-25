import { useEffect, useState } from "react";
import { Navigation, type View } from "./components/Navigation";
import { MainPage } from "./pages/MainPage";
import { CustomTestingPage } from "./pages/CustomTestingPage";
import { CalibrationPage } from "./pages/CalibrationPage";
import { StatusBar } from "./components/StatusBar";
import { useApp } from "./context/AppContext";
function hashView(): View {
  const h = location.hash;
  return h === "#calibration"
    ? "calibration"
    : h === "#development" || h === "#controller" || h.startsWith("#dev-")
      ? "controller"
      : "home";
}
export function App() {
  const [view, setView] = useState<View>(hashView);
  const app = useApp();
  function navigate(next: View) {
    if (next === view) return;
    app.stop(
      "Changed view; playback timer stopped. Last effect may remain active.",
    );
    setView(next);
    history.replaceState(
      null,
      "",
      "#" + (next === "controller" ? "development" : next),
    );
    window.scrollTo(0, 0);
  }
  useEffect(() => {
    const change = () => {
      const next = hashView();
      if (next !== view) {
        app.stop("Changed view; playback timer stopped.");
        setView(next);
      }
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [view, app.stop]);
  return (
    <>
      <Navigation view={view} navigate={navigate} />
      <MainPage hidden={view !== "home"} />
      <CustomTestingPage hidden={view !== "controller"} />
      <CalibrationPage
        hidden={view !== "calibration"}
        navigate={() => navigate("controller")}
      />
      <StatusBar development={view === "controller"} />
    </>
  );
}

import { useEffect, useRef, useState } from "react";
export type View = "home" | "controller" | "calibration";
export function Navigation({
  view,
  navigate,
}: {
  view: View;
  navigate: (view: View) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("click", close);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", close);
      window.removeEventListener("keydown", key);
    };
  }, []);
  const item = (target: View, label: string, child = false) => (
    <button
      type="button"
      className={child ? "menu-child" : ""}
      aria-current={view === target ? "page" : undefined}
      onClick={() => {
        setOpen(false);
        navigate(target);
      }}
    >
      {label}
    </button>
  );
  return (
    <header className="site-nav" ref={ref}>
      <span className="brand">
        WRX Dream BLE <span style={{ opacity: 0.6, fontWeight: 600 }}>v9</span>
      </span>
      <button
        ref={button}
        className="site-menu-btn"
        type="button"
        aria-label="Open navigation"
        aria-controls="site-menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ☰
      </button>
      <nav
        id="site-menu"
        className="site-menu"
        aria-label="Pages"
        hidden={!open}
      >
        {item("home", "Main presets")}
        <div className="menu-heading">Development</div>
        {item("controller", "Custom Testing", true)}
        {item("calibration", "Calibration Mode", true)}
      </nav>
    </header>
  );
}

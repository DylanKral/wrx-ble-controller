// Native document scrolling, with a body-level fixed bar measured against the
// visible viewport. Rect differences avoid applying the same correction twice
// in browsers that already move fixed elements with the keyboard/toolbars.
export function attachPlaybackBar(bar: HTMLElement) {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  let frame = 0;
  let correction = 0;
  const update = () => {
    frame = 0;
    const bottom = viewport ? viewport.offsetTop + viewport.height : innerHeight;
    const rect = bar.getBoundingClientRect();
    // Preserve native pinch zoom/panning instead of chasing magnification.
    correction = viewport && Math.abs(viewport.scale - 1) > 0.01
      ? 0 : Math.round(correction + bottom - rect.bottom);
    bar.style.setProperty("--playbar-shift", `${correction}px`);
    const height = bar.offsetHeight;
    root.style.setProperty("--playbar-height", `${height}px`);
    const obscured = Math.max(0, innerHeight - bottom);
    root.style.setProperty("--playbar-clearance", `${height + obscured}px`);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(bar);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("pageshow", schedule);
  document.addEventListener("visibilitychange", schedule);
  document.addEventListener("focusin", schedule);
  document.addEventListener("focusout", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  update();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("pageshow", schedule);
    document.removeEventListener("visibilitychange", schedule);
    document.removeEventListener("focusin", schedule);
    document.removeEventListener("focusout", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    root.style.removeProperty("--playbar-height");
    root.style.removeProperty("--playbar-clearance");
  };
}

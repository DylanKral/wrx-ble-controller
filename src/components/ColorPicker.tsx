import { useEffect, useRef, useState, type PointerEvent } from "react";
import { hexToHsv, hsvToHex, solidColors, wheelColor, type HSV } from "../colors/color";
import "../styles/color-picker.css";

export function ColorPicker({
  value,
  onChange,
  label = "Static RGB color",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const lastColor = useRef(value.toLowerCase());
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    if (value.toLowerCase() !== lastColor.current) {
      lastColor.current = value.toLowerCase();
      setHsv(hexToHsv(value));
    }
  }, [value]);

  function chooseColor(hex: string) {
    lastColor.current = hex.toLowerCase();
    setHsv(hexToHsv(hex));
    onChange(hex);
  }
  function chooseHsv(next: HSV) {
    const hex = hsvToHex(next);
    setHsv(next);
    lastColor.current = hex;
    onChange(hex);
  }
  function choosePoint(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    chooseHsv(wheelColor(
      (event.clientX - rect.left - rect.width / 2) / (rect.width / 2),
      (event.clientY - rect.top - rect.height / 2) / (rect.height / 2),
      hsv.v,
    ));
  }
  const selectedName = solidColors.find(color => color.hex === value.toLowerCase())?.name ?? "Custom";
  const radians = hsv.h * Math.PI / 180;
  return (
    <div className="solid-color-picker" role="group" aria-label="Solid color selection">
      <div className="solid-color-palette" role="group" aria-label="Basic colors">
        {solidColors.map(color => (
          <button key={color.name} type="button" className="solid-color-option"
            aria-label={`${color.name} solid color`} title={color.name}
            aria-pressed={value.toLowerCase() === color.hex}
            onClick={() => chooseColor(color.hex)}>
            <span style={{ background: color.hex }} />
            {color.name === "Off" && <small>Off</small>}
          </button>
        ))}
      </div>
      <details className="custom-color-tools">
        <summary>
          <span>Custom color</span>
          <span className="selected-color-name"><i style={{ background: value }} />{selectedName}</span>
        </summary>
        <div className="custom-color-body">
          <div className="color-wheel" data-testid="color-wheel" aria-hidden="true"
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              pointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              choosePoint(event);
            }}
            onPointerMove={event => { if (pointer.current === event.pointerId) choosePoint(event); }}
            onPointerUp={event => {
              if (pointer.current === event.pointerId) choosePoint(event);
              pointer.current = null;
            }}
            onPointerCancel={() => { pointer.current = null; }}
            onLostPointerCapture={() => { pointer.current = null; }}>
            <i className="color-wheel-cursor" style={{
              left: `${50 + Math.sin(radians) * hsv.s * 50}%`,
              top: `${50 - Math.cos(radians) * hsv.s * 50}%`,
              background: value,
            }} />
          </div>
          <div className="color-fine-controls">
            <label>Hue <span>{Math.round(hsv.h)}°</span>
              <input type="range" aria-label="Color hue" min={0} max={360} step={1}
                value={hsv.h} onChange={event => chooseHsv({ ...hsv, h: Number(event.target.value) })} />
            </label>
            <label>Saturation <span>{Math.round(hsv.s * 100)}%</span>
              <input type="range" aria-label="Color saturation" min={0} max={100} step={1}
                value={hsv.s * 100} onChange={event => chooseHsv({ ...hsv, s: Number(event.target.value) / 100 })} />
            </label>
            <label>Brightness <span>{Math.round(hsv.v * 100)}%</span>
              <input type="range" aria-label="Color brightness" min={0} max={100} step={1}
                value={hsv.v * 100} onChange={event => chooseHsv({ ...hsv, v: Number(event.target.value) / 100 })} />
            </label>
          </div>
        </div>
        <label className="device-color-picker">Device color picker
          <input id={label === "Static RGB color" ? "home-static-color" : undefined}
            type="color" aria-label={label} value={value}
            onChange={event => chooseColor(event.target.value)} />
        </label>
      </details>
    </div>
  );
}

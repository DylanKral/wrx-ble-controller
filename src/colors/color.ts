export interface HSV {
  h: number;
  s: number;
  v: number;
}

export const solidColors = [
  { name: "Red", hex: "#ff0000" },
  { name: "Orange", hex: "#ff8000" },
  { name: "Yellow", hex: "#ffff00" },
  { name: "Green", hex: "#00ff00" },
  { name: "Cyan", hex: "#00ffff" },
  { name: "Blue", hex: "#0000ff" },
  { name: "Purple", hex: "#8000ff" },
  { name: "Pink", hex: "#ff0080" },
  { name: "White", hex: "#ffffff" },
  { name: "Off", hex: "#000000" },
] as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function hexToHsv(hex: string): HSV {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = delta === 0 ? 0 : max === r
    ? ((g - b) / delta) % 6
    : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: HSV): string {
  h = ((h % 360) + 360) % 360;
  s = clamp(s);
  v = clamp(v);
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x] : h < 240 ? [0, x, c]
      : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + rgb.map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("");
}

// The conic gradient starts with red at the top, proceeding clockwise.
export function wheelColor(x: number, y: number, brightness: number): HSV {
  return {
    h: ((Math.atan2(y, x) * 180) / Math.PI + 450) % 360,
    s: clamp(Math.hypot(x, y)),
    v: brightness,
  };
}

import { ledSvgId } from "./calibrations";
export function mapLedColors(colors: readonly string[]) {
  if (colors.length !== 19) throw new Error("Expected 19 LED colors");
  return colors.map((color, index) => ({
    number: index + 1,
    color,
    leftId: ledSvgId("left", index + 1),
    rightId: ledSvgId("right", index + 1),
  }));
}
export function applyLedColors(root: Element, colors: readonly string[]) {
  for (const led of mapLedColors(colors))
    for (const id of [led.leftId, led.rightId]) {
      const region = root.querySelector<SVGElement>(`#${id}`);
      if (!region) throw new Error(`Missing approved LED region ${id}`);
      region.setAttribute("fill", led.color);
      region.style.fill = led.color;
      region.style.opacity = "1";
    }
}

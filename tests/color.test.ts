import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, solidColors, wheelColor } from "../src/colors/color";

describe("solid color selection", () => {
  it("preserves basic colors and existing exact RGB values through conversion", () => {
    for (const hex of [...solidColors.map(color => color.hex), "#123456", "#010203", "#fefefe", "#804a2c"])
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
  it("maps the wheel clockwise from red at the top and clamps outside its edge", () => {
    expect(hsvToHex(wheelColor(0, -1, 1))).toBe("#ff0000");
    expect(hsvToHex(wheelColor(0, 1, 1))).toBe("#00ffff");
    expect(hsvToHex(wheelColor(0, 0, 1))).toBe("#ffffff");
    expect(wheelColor(2, 0, 1).s).toBe(1);
  });
  it("retains hue when adjusting brightness and saturation, including black and white", () => {
    expect(hsvToHex({ h: 240, s: 1, v: .5 })).toBe("#000080");
    expect(hsvToHex({ h: 240, s: 0, v: 1 })).toBe("#ffffff");
    expect(hsvToHex({ h: 240, s: 1, v: 0 })).toBe("#000000");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
  });
});

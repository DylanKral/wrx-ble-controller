export function ColorPicker({
  value,
  onChange,
  label = "Static RGB color",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  return (
    <label className="home-color-swatch">
      Color
      <input
        id={label === "Static RGB color" ? "home-static-color" : undefined}
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

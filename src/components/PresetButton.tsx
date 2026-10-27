import type { Profile } from "../animations/types";
import { useApp } from "../context/AppContext";
export function PresetButton({
  profile,
  label,
}: {
  profile: Profile;
  label: string;
}) {
  const { play, playback, setRainbow } = useApp();
  const color = profile.steps.find((s) => s.type === "color");
  return (
    <div className="home-preset-wrap">
      <button
        type="button"
        data-profile-id={profile.id}
        className={
          "home-tile" +
          (profile.experimental ? " experimental" : "") +
          (playback?.profileId === profile.id ? " playing" : "")
        }
        title={"Play " + label}
        aria-pressed={playback?.profileId === profile.id}
        onClick={() => play(profile)}
      >
        <strong>{label}</strong>
      </button>
      {profile.id === "rainbow-blue" && (
        <label className="home-color-inline">
          Start color
          <input
            type="color"
            aria-label="Rainbow Chase starting color"
            value={color?.type === "color" ? color.color : "#0000ff"}
            onChange={(e) => setRainbow(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

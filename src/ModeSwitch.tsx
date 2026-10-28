type ModeSwitchProps = {
  mode: "2d" | "3d";
  onChange: (mode: "2d" | "3d") => void;
};

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div
      className="online-mode-switch"
      data-mode={mode}
      role="group"
      aria-label="Çalışma görünümü"
    >
      <span className="online-mode-indicator" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={mode === "3d"}
        onClick={() => {
          if (mode !== "3d") onChange("3d");
        }}
      >
        3D
      </button>
      <button
        type="button"
        aria-pressed={mode === "2d"}
        onClick={() => {
          if (mode !== "2d") onChange("2d");
        }}
      >
        2D
      </button>
    </div>
  );
}

export type EditorMode = "2d" | "mockup" | "3d";

type ModeSwitchProps = {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
  hasMockups?: boolean;
};

export function ModeSwitch({
  mode,
  onChange,
  hasMockups = false,
}: ModeSwitchProps) {
  const modes: { id: EditorMode; label: string; title: string }[] = hasMockups
    ? [
        { id: "mockup", label: "Mockup", title: "Hazır sahnelerde gör" },
        { id: "2d", label: "2D", title: "Bıçak izini tasarla" },
        { id: "3d", label: "3B", title: "Ürünü döndürerek incele" },
      ]
    : [
        { id: "3d", label: "3D", title: "Ürünü döndürerek incele" },
        { id: "2d", label: "2D", title: "Bıçak izi üzerinde tasarla" },
      ];
  return (
    <div
      className={`online-mode-switch${hasMockups ? " with-mockup-mode" : ""}`}
      data-mode={mode}
      role="group"
      aria-label="Çalışma görünümü"
    >
      <span className="online-mode-indicator" aria-hidden="true" />
      {modes.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.title}
          aria-pressed={mode === item.id}
          onClick={() => {
            if (mode !== item.id) onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

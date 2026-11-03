import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Check, X } from "lucide-react";

export type MobileTextSession = {
  initialText: string;
  elementId?: string;
  title?: string;
};
export type MobileTextEditorHandle = {
  open: (session: MobileTextSession) => void;
  close: () => void;
};
export type MobileTextResult = { text: string; elementId?: string };

/** A real input keeps selection, dictation, Turkish IME and paste native on phones. */
export const MobileTextEditor = forwardRef<
  MobileTextEditorHandle,
  {
    onApply: (result: MobileTextResult) => void | Promise<void>;
    onClose?: () => void;
  }
>(({ onApply, onClose }, ref) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const session = useRef<MobileTextSession | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const saving = useRef(false);
  const alive = useRef(true);
  const [current, setCurrent] = useState<MobileTextSession | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const hintId = useId();
  const errorId = useId();
  const syncViewport = () => {
    const node = dialog.current;
    const viewport = window.visualViewport;
    if (!node || !viewport || viewport.scale > 1.01) return;
    node.style.setProperty("--text-editor-height", `${viewport.height}px`);
    node.style.setProperty("--text-editor-top", `${viewport.offsetTop}px`);
    node.style.setProperty("--text-editor-left", `${viewport.offsetLeft}px`);
    node.style.setProperty("--text-editor-width", `${viewport.width}px`);
    // CSS viewport media queries can keep the pre-keyboard height on iOS.
    // Drive the compact layout from the actual visible area as well.
    node.dataset.compact = String(viewport.height < 500);
  };
  const dismiss = () => {
    if (saving.current) return;
    dialog.current?.close();
  };
  const finishClose = () => {
    session.current = null;
    setCurrent(null);
    setError("");
    onClose?.();
    const trigger = returnFocus.current;
    returnFocus.current = null;
    if (trigger?.isConnected && trigger.getClientRects().length)
      trigger.focus({ preventScroll: true });
  };
  useImperativeHandle(ref, () => ({
    open(next) {
      const node = dialog.current;
      const field = input.current;
      if (!node || !field || saving.current) return;
      const root = node.getRootNode() as Document | ShadowRoot;
      const active = root.activeElement;
      returnFocus.current = active instanceof HTMLElement ? active : null;
      session.current = {
        ...next,
        initialText: next.initialText.slice(0, 2000),
      };
      setCurrent(session.current);
      setText(session.current.initialText);
      setError("");
      // Do this in the originating tap, before any font/image work or effects.
      // iOS can refuse to summon its keyboard after an asynchronous focus call.
      field.value = session.current.initialText;
      syncViewport();
      if (!node.open) node.showModal();
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    },
    close: dismiss,
  }));
  useEffect(() => {
    alive.current = true;
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      alive.current = false;
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);
  const apply = async () => {
    const active = session.current;
    const value = input.current?.value || "";
    if (!active || saving.current || !value.trim()) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onApply({ text: value, elementId: active.elementId });
      if (alive.current) dialog.current?.close();
    } catch (reason) {
      if (alive.current) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Yazı uygulanamadı. Lütfen yeniden deneyin.",
        );
      }
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="mobile-text-editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={busy}
      onClose={finishClose}
      onCancel={(event) => {
        if (saving.current) event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          !event.nativeEvent.isComposing &&
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          void apply();
        }
      }}
    >
      <div className="mobile-text-editor-content">
        <header className="mobile-text-editor-header">
          <div>
            <h2 id={titleId}>
              {current?.title ||
                (current?.elementId ? "Yazıyı düzenle" : "Yazı ekle")}
            </h2>
            <p id={hintId}>
              Satır ekleyebilir, metin yapıştırabilir veya sesle yazabilirsiniz.
            </p>
          </div>
          <button
            type="button"
            className="mobile-text-editor-close"
            aria-label="Yazı düzenlemeyi iptal et"
            disabled={busy}
            onClick={dismiss}
          >
            <X size={22} />
          </button>
        </header>
        <label
          className="mobile-text-editor-label"
          htmlFor={`${titleId}-input`}
        >
          Yazınız
        </label>
        <textarea
          ref={input}
          id={`${titleId}-input`}
          className="mobile-text-editor-input"
          aria-label="Tasarım yazısı"
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={Boolean(error)}
          placeholder="Yazınızı buraya yazın"
          value={text}
          maxLength={2000}
          readOnly={busy}
          enterKeyHint="enter"
          autoCapitalize="sentences"
          autoComplete="off"
          spellCheck
          onChange={(event) => setText(event.target.value)}
        />
        <div className="mobile-text-editor-meta">
          <span>Yazı tipi, boyut ve renk tuvalde düzenlenir.</span>
          <output aria-label="Yazı uzunluğu">{text.length} / 2000</output>
        </div>
        {error && (
          <p className="mobile-text-editor-error" id={errorId} role="alert">
            {error}
          </p>
        )}
        <footer className="mobile-text-editor-footer">
          <button type="button" disabled={busy} onClick={dismiss}>
            Vazgeç
          </button>
          <button
            type="button"
            className="mobile-text-editor-apply"
            disabled={busy || !text.trim()}
            onClick={() => void apply()}
          >
            <Check size={19} />
            {busy
              ? "Uygulanıyor…"
              : current?.elementId
                ? "Değişiklikleri uygula"
                : "Yazıyı ekle"}
          </button>
        </footer>
      </div>
    </dialog>
  );
});

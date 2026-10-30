import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

export type QuantityDropdownOption = {
  id: string;
  label: string;
  priceLabel: string;
  disabled?: boolean;
};

type QuantityDropdownProps = {
  id?: string;
  label: string;
  options: QuantityDropdownOption[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type Placement = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  direction: "up" | "down";
};

/** A preset-only quantity picker whose overlay stays in the editor's style scope. */
export function QuantityDropdown({
  id,
  label,
  options,
  value,
  disabled = false,
  onChange,
}: QuantityDropdownProps) {
  const generatedId = useId();
  const buttonId = id || `quantity-${generatedId}`;
  const labelId = `${buttonId}-label`;
  const valueId = `${buttonId}-value`;
  const priceId = `${buttonId}-price`;
  const listId = `${buttonId}-list`;
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const selected = options.find((option) => option.id === value);
  const enabled = options.filter((option) => !option.disabled);
  const unavailable = disabled || enabled.length === 0;
  const optionStateKey = JSON.stringify(
    options.map((option) => [option.id, Boolean(option.disabled)]),
  );

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const show = (preferLast = false) => {
    if (unavailable) return;
    setActiveId(
      (selected && !selected.disabled
        ? selected
        : preferLast
          ? enabled.at(-1)
          : enabled[0]
      )?.id || "",
    );
    setOpen(true);
  };
  const choose = (option: QuantityDropdownOption) => {
    if (unavailable || option.disabled) return;
    close(true);
    onChange(option.id);
  };
  const move = (direction: 1 | -1) => {
    const index = enabled.findIndex((option) => option.id === activeId);
    const next =
      index < 0
        ? direction === 1
          ? 0
          : enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, index + direction));
    if (enabled[next]) setActiveId(enabled[next].id);
  };
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // An open menu must not pass Delete, arrow, or undo shortcuts to the canvas.
    event.stopPropagation();
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        move(event.key === "ArrowDown" ? 1 : -1);
        break;
      case "Home":
      case "End":
        event.preventDefault();
        event.stopPropagation();
        setActiveId(
          (event.key === "Home" ? enabled[0] : enabled.at(-1))?.id || "",
        );
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        event.stopPropagation();
        const option = options.find((item) => item.id === activeId);
        if (option) choose(option);
        break;
      }
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Resume the normal form tab order from the original trigger.
        close(true);
        break;
    }
  };

  useEffect(() => {
    if (unavailable) setOpen(false);
  }, [unavailable]);
  useEffect(() => {
    if (!open) return;
    if (!options.some((option) => option.id === activeId && !option.disabled))
      setActiveId(
        (selected && !selected.disabled ? selected : enabled[0])?.id || "",
      );
  }, [open, activeId, optionStateKey, value]);

  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const anchor = trigger.current;
    const document = anchor.ownerDocument;
    const root = anchor.getRootNode();
    const host = document.createElement("div");
    host.className = "quantity-dropdown-portal";
    const font = window.getComputedStyle(anchor);
    Object.assign(host.style, {
      position: "fixed",
      inset: "0",
      zIndex: "4000",
      pointerEvents: "none",
      font: font.font,
      color: font.color,
    });
    // Shadow-root siblings retain the editor CSS without importing theme styles.
    if (root instanceof ShadowRoot) root.append(host);
    else document.body.append(host);
    setPortalHost(host);
    const ancestors: Element[] = [];
    for (let element: Element | null = anchor.parentElement; element;) {
      ancestors.push(element);
      const parent: Element | null = element.parentElement;
      const owner = element.getRootNode();
      element = parent || (owner instanceof ShadowRoot ? owner.host : null);
    }
    const sidebar = anchor.closest(".online-config");
    const reposition = () => {
      if (!anchor.isConnected) {
        setOpen(false);
        return;
      }
      const viewport = window.visualViewport;
      const padding = 8;
      let leftBound = (viewport?.offsetLeft || 0) + padding;
      const topBound = (viewport?.offsetTop || 0) + padding;
      let rightBound =
        leftBound + (viewport?.width || window.innerWidth) - padding * 2;
      const bottomBound =
        topBound + (viewport?.height || window.innerHeight) - padding * 2;
      const bounds = anchor.getBoundingClientRect();
      if (sidebar) {
        const sidebarBounds = sidebar.getBoundingClientRect();
        leftBound = Math.max(leftBound, sidebarBounds.left + padding);
        rightBound = Math.min(rightBound, sidebarBounds.right - padding);
        // The popup may extend above or below a short order card. Only the
        // trigger's visibility is constrained by the card's scrolling area.
        if (
          bounds.bottom <= Math.max(topBound, sidebarBounds.top) ||
          bounds.top >= Math.min(bottomBound, sidebarBounds.bottom)
        ) {
          setOpen(false);
          return;
        }
      }
      if (
        bounds.bottom <= topBound ||
        bounds.top >= bottomBound ||
        bounds.right <= leftBound ||
        bounds.left >= rightBound
      ) {
        setOpen(false);
        return;
      }
      const gap = 6;
      const above = Math.max(0, bounds.top - topBound - gap);
      const below = Math.max(0, bottomBound - bounds.bottom - gap);
      const desired = Math.min(
        320,
        list.current?.scrollHeight || options.length * 44 + 12,
      );
      const direction =
        above >= Math.min(desired, 176) || above >= below ? "up" : "down";
      const maxHeight = Math.floor(
        Math.min(320, direction === "up" ? above : below),
      );
      if (maxHeight < 32 || rightBound <= leftBound) {
        setOpen(false);
        return;
      }
      const width = Math.min(bounds.width, rightBound - leftBound);
      const height = Math.min(maxHeight, desired);
      const next: Placement = {
        left: Math.max(leftBound, Math.min(bounds.left, rightBound - width)),
        top:
          direction === "up" ? bounds.top - gap - height : bounds.bottom + gap,
        width,
        maxHeight,
        direction,
      };
      setPlacement((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            previous[key as keyof Placement] === next[key as keyof Placement],
        )
          ? previous
          : next,
      );
    };
    reposition();
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(anchor) && !path.includes(host)) setOpen(false);
    };
    const focusOutside = (event: FocusEvent) => {
      const path = event.composedPath();
      if (!path.includes(anchor) && !path.includes(host)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", focusOutside, true);
    ancestors.forEach((element) =>
      element.addEventListener("scroll", reposition, { passive: true }),
    );
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, { passive: true });
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    const observer = new ResizeObserver(reposition);
    observer.observe(anchor);
    if (sidebar) observer.observe(sidebar);
    const frame = requestAnimationFrame(reposition);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", focusOutside, true);
      ancestors.forEach((element) =>
        element.removeEventListener("scroll", reposition),
      );
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
      host.remove();
      setPortalHost(null);
      setPlacement(null);
    };
  }, [open, optionStateKey]);

  useLayoutEffect(() => {
    if (!open || !portalHost || !placement) return;
    list.current?.focus({ preventScroll: true });
  }, [open, portalHost, Boolean(placement)]);
  useLayoutEffect(() => {
    if (!open) return;
    const index = options.findIndex((option) => option.id === activeId);
    const node = list.current?.querySelector<HTMLElement>(
      `[data-option-index="${index}"]`,
    );
    if (node && list.current) {
      const above = node.offsetTop - list.current.scrollTop;
      const below = above + node.offsetHeight - list.current.clientHeight;
      if (above < 0) list.current.scrollTop += above;
      else if (below > 0) list.current.scrollTop += below;
    }
  }, [open, activeId, portalHost]);

  const activeIndex = options.findIndex((option) => option.id === activeId);
  const popupStyle: CSSProperties | undefined = placement
    ? {
        position: "fixed",
        left: placement.left,
        top: placement.top,
        width: placement.width,
        maxHeight: placement.maxHeight,
        overflowY: "auto",
        overscrollBehavior: "contain",
        pointerEvents: "auto",
      }
    : undefined;

  return (
    <div className="quantity-dropdown">
      <span className="quantity-dropdown-label" id={labelId}>
        {label}
      </span>
      <button
        ref={trigger}
        id={buttonId}
        type="button"
        className="quantity-dropdown-trigger"
        disabled={unavailable}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${valueId}${selected?.priceLabel ? ` ${priceId}` : ""}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (["Home", "End"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
            if (!unavailable) {
              setActiveId(
                (event.key === "Home" ? enabled[0] : enabled.at(-1))?.id || "",
              );
              setOpen(true);
            }
          } else if (
            ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (open) close(true);
            else show(event.key === "ArrowUp");
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
        }}
      >
        <span id={valueId} className="quantity-dropdown-value">
          {selected?.label || "Seçin"}
        </span>
        {selected?.priceLabel && (
          <span id={priceId} className="quantity-dropdown-price">
            {selected.priceLabel}
          </span>
        )}
        {open ? (
          <ChevronUp
            size={17}
            className="quantity-dropdown-chevron"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            size={17}
            className="quantity-dropdown-chevron"
            aria-hidden="true"
          />
        )}
      </button>
      {open &&
        portalHost &&
        placement &&
        createPortal(
          <div
            ref={list}
            id={listId}
            className="quantity-dropdown-list"
            role="listbox"
            tabIndex={-1}
            aria-labelledby={labelId}
            aria-activedescendant={
              activeIndex < 0 ? undefined : `${listId}-option-${activeIndex}`
            }
            data-direction={placement.direction}
            style={popupStyle}
            onKeyDown={onListKey}
          >
            {options.map((option, index) => (
              <div
                key={option.id}
                id={`${listId}-option-${index}`}
                className="quantity-dropdown-option"
                role="option"
                aria-selected={option.id === value}
                aria-disabled={option.disabled || undefined}
                data-active={option.id === activeId ? "true" : "false"}
                data-option-index={index}
                onPointerMove={() => !option.disabled && setActiveId(option.id)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className="quantity-dropdown-option-label">
                  {option.label}
                </span>
                <span className="quantity-dropdown-option-price">
                  {option.priceLabel}
                </span>
                {option.id === value ? (
                  <Check
                    size={16}
                    className="quantity-dropdown-check"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="quantity-dropdown-check"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>,
          portalHost,
        )}
    </div>
  );
}

import { MOUSE, TOUCH } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type InteractionMode = "rotate" | "pan";
type PointerPosition = {
  x: number;
  y: number;
  type: string;
};

/** One OrbitControls state machine owns orbit, pinch, pan and wheel input. */
export function createPreviewGestures(
  controls: OrbitControls,
  element: HTMLCanvasElement,
  render: () => void,
  isActive: () => boolean,
) {
  const document = element.ownerDocument;
  const window = document.defaultView;
  const pointers = new Map<number, PointerPosition>();
  const ignoredPointers = new Set<number>();
  let frame = 0;
  let disposed = false;
  let resetting = false;
  let mode: InteractionMode = "rotate";

  controls.enableRotate = true;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.16;
  controls.rotateSpeed = 0.65;
  controls.panSpeed = 0.9;
  controls.zoomSpeed = 0.85;
  controls.mouseButtons.LEFT = MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = MOUSE.PAN;
  controls.touches.ONE = TOUCH.ROTATE;
  controls.touches.TWO = TOUCH.DOLLY_PAN;

  const enabled = () => isActive() && document.visibilityState !== "hidden";
  const requestRender = () => {
    if (frame || disposed || resetting || !enabled()) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed || !enabled()) return;
      const moving = controls.update();
      render();
      // update emits `change` while damping is moving. Once it settles, the
      // demand-driven loop stops; a stationary preview consumes no frames.
      if (moving) requestRender();
    });
  };

  const releaseCapture = (id: number) => {
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  };
  const clearMomentum = () => {
    const wasResetting = resetting;
    resetting = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    // Use the public API to drain damping without changing the visible pose.
    // Pointer-count changes must not carry orbit velocity into a pinch/pan.
    const camera = controls.object;
    const position = camera.position.clone();
    const target = controls.target.clone();
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    controls.enableDamping = damping;
    resetting = wasResetting;
    if (!resetting) requestRender();
  };
  const stop = () => {
    if (resetting) return;
    resetting = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const pending = [...pointers];
    const captured = [...pointers.keys(), ...ignoredPointers];
    pointers.clear();
    ignoredPointers.clear();
    for (const [id, point] of pending) {
      // OrbitControls normally cleans these on pointer-up. Hide, blur or a
      // capture loss may omit it, so finish each tracked pointer locally.
      element.dispatchEvent(
        new PointerEvent("pointercancel", {
          pointerId: id,
          pointerType: point.type,
          clientX: point.x,
          clientY: point.y,
        }),
      );
    }
    captured.forEach(releaseCapture);

    clearMomentum();
    resetting = false;
  };

  const capturePointer = (event: PointerEvent) => {
    if (!enabled()) {
      event.stopImmediatePropagation();
      return;
    }
    const first = pointers.values().next().value as PointerPosition | undefined;
    if (
      pointers.size >= 2 ||
      (first && (first.type === "touch") !== (event.pointerType === "touch"))
    ) {
      // Extra fingers are ignored until lifted; they cannot replace the two
      // active pointers or leave OrbitControls stuck in an unsupported state.
      ignoredPointers.add(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      if (pointers.size === 1 && !pointers.has(event.pointerId))
        clearMomentum();
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      });
    }
    // Capture every touch, including the second. OrbitControls only captures
    // the first pointer, which can leave the remaining finger outside canvas.
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // A pointer already cancelled by the browser needs no capture.
    }
  };
  const movePointer = (event: PointerEvent) => {
    if (ignoredPointers.has(event.pointerId)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (pointers.has(event.pointerId))
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      });
  };
  const releasePointer = (event: PointerEvent) => {
    if (pointers.size === 2 && pointers.has(event.pointerId)) clearMomentum();
    pointers.delete(event.pointerId);
    if (ignoredPointers.delete(event.pointerId)) {
      event.stopImmediatePropagation();
    }
    releaseCapture(event.pointerId);
  };
  const cancelPointer = (event: PointerEvent) => {
    if (resetting) return;
    if (pointers.has(event.pointerId) || ignoredPointers.has(event.pointerId)) {
      event.stopImmediatePropagation();
      stop();
    }
  };
  const updateVisibility = () => {
    if (!enabled()) stop();
    controls.enabled = enabled();
    if (controls.enabled) requestRender();
  };

  element.addEventListener("pointerdown", capturePointer, true);
  element.addEventListener("pointermove", movePointer, true);
  element.addEventListener("pointerup", releasePointer, true);
  element.addEventListener("pointercancel", cancelPointer, true);
  element.addEventListener("lostpointercapture", cancelPointer);
  document.addEventListener("visibilitychange", updateVisibility);
  window?.addEventListener("blur", stop);
  controls.addEventListener("change", requestRender);
  updateVisibility();

  return {
    stop,
    setActive: updateVisibility,
    setMode(next: InteractionMode) {
      if (mode === next) return;
      stop();
      mode = next;
      controls.mouseButtons.LEFT = next === "pan" ? MOUSE.PAN : MOUSE.ROTATE;
      controls.touches.ONE = next === "pan" ? TOUCH.PAN : TOUCH.ROTATE;
    },
    flush() {
      stop();
      if (enabled()) render();
    },
    dispose() {
      stop();
      disposed = true;
      element.removeEventListener("pointerdown", capturePointer, true);
      element.removeEventListener("pointermove", movePointer, true);
      element.removeEventListener("pointerup", releasePointer, true);
      element.removeEventListener("pointercancel", cancelPointer, true);
      element.removeEventListener("lostpointercapture", cancelPointer);
      document.removeEventListener("visibilitychange", updateVisibility);
      window?.removeEventListener("blur", stop);
      controls.removeEventListener("change", requestRender);
    },
  };
}

import type { Textbox } from "fabric";
import type { ArtboardSpec } from "./types";

/** Fit after Fabric has measured wrapping; a one-line placeholder is not a bound. */
export function fitNewMobileText(
  object: Textbox,
  artboard?: Pick<ArtboardSpec, "canvasWidth" | "canvasHeight">,
) {
  const width = artboard?.canvasWidth || 600;
  const height = artboard?.canvasHeight || 900;
  // The document schema caps unscaled object dimensions at 12000 px. Merely
  // reducing scale would still leave an invalid saved document for huge input.
  if (object.width > 12000 || object.height > 12000) {
    object.set({
      fontSize: Math.max(
        8,
        Math.floor(
          object.fontSize *
            Math.min(11999 / object.width, 11999 / object.height),
        ),
      ),
    });
    if (object.width > 12000 || object.height > 12000)
      throw new Error(
        "Yazı tek bir öğe için fazla uzun. Metni kısaltın veya birkaç yazı öğesine ayırın.",
      );
  }
  const factor = Math.min(
    1,
    (width * 0.8) / object.getScaledWidth(),
    (height * 0.65) / object.getScaledHeight(),
  );
  object.set({
    scaleX: object.scaleX * factor,
    scaleY: object.scaleY * factor,
  });
  object.set({
    left: (width - object.getScaledWidth()) / 2,
    top: (height - object.getScaledHeight()) / 2,
  });
  object.setCoords();
}

import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { Textbox } from "fabric/node";

const compiled = await build({
  entryPoints: [
    new URL("../src/mobileTextLayout.ts", import.meta.url).pathname,
  ],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { fitNewMobileText } = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiled.outputFiles[0].text).toString("base64")
);

test("new mobile text uses actual wrapped Fabric height and centers within the print area", () => {
  const object = new Textbox(
    "Alaçam Dağıtım\nİstanbul için özel baskı\nGüzel bir kahve molası\nŞimdi tasarım sizin\nGörüşmek üzere",
    {
      width: 1170,
      fontSize: 135,
      fontFamily: "Arial",
      left: 135,
      top: 345,
      scaleX: 1,
      scaleY: 1,
    },
  );
  assert.ok(
    object.height > 135 * 1.3,
    "the old one-line input height was incorrect",
  );
  fitNewMobileText(object, { canvasWidth: 1800, canvasHeight: 900 });
  assert.ok(object.getScaledWidth() <= 1800 * 0.8 + 0.001);
  assert.ok(object.getScaledHeight() <= 900 * 0.65 + 0.001);
  assert.ok(Math.abs(object.left + object.getScaledWidth() / 2 - 900) < 0.001);
  assert.ok(Math.abs(object.top + object.getScaledHeight() / 2 - 450) < 0.001);
  assert.ok(object.scaleX <= 1);
  assert.equal(object.scaleX, object.scaleY);
});

test("a short native text is centered without increasing its selected font scale", () => {
  const object = new Textbox("Kahve", {
    width: 390,
    fontSize: 45,
    fontFamily: "Arial",
    scaleX: 0.8,
    scaleY: 0.8,
  });
  fitNewMobileText(object);
  assert.equal(object.scaleX, 0.8);
  assert.equal(object.scaleY, 0.8);
  assert.ok(Math.abs(object.left + object.getScaledWidth() / 2 - 300) < 0.001);
  assert.ok(Math.abs(object.top + object.getScaledHeight() / 2 - 450) < 0.001);
});

test("many pasted lines remain valid document dimensions instead of relying only on a small scale", () => {
  const object = new Textbox("Özel baskı\n".repeat(100), {
    width: 1170,
    fontSize: 135,
    fontFamily: "Arial",
  });
  assert.ok(object.height > 12000);
  fitNewMobileText(object, { canvasWidth: 1800, canvasHeight: 900 });
  assert.ok(object.height <= 12000);
  assert.ok(object.width <= 12000);
  assert.ok(object.fontSize >= 8);
  assert.ok(object.getScaledHeight() <= 585.001);
});

test("unrepresentable line counts reject before an invalid object is committed", () => {
  const object = new Textbox("\n".repeat(1999), {
    width: 1170,
    fontSize: 135,
    fontFamily: "Arial",
  });
  assert.throws(() => fitNewMobileText(object), /birkaç yazı öğesine ayırın/);
});

import { createRef, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { MockupPreview } from "../src/mockups/MockupPreview";
import type { MockupPreviewHandle } from "../src/mockups/types";
import { DEMO_MOCKUP_SCENES } from "../src/mockups/demo";
import css from "../src/mockups/mockups.css?inline";
const style = document.createElement("style");
style.textContent = css;
document.head.append(style);
const host = document.createElement("div");
host.style.cssText = "position:relative;width:100vw;height:100dvh";
document.body.append(host);
const root = createRoot(host),
  ref = createRef<MockupPreviewHandle>();
const front = document.createElement("canvas");
front.width = front.height = 1024;
const back = document.createElement("canvas");
back.width = back.height = 1024;
const draw = (color: string) => {
  const ctx = front.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "#20201e";
  ctx.textAlign = "center";
  ctx.font = "bold 100px Arial";
  ctx.fillText("ALAÇAM", 512, 490);
  ctx.font = "30px Arial";
  ctx.fillText("ÖZGÜN MOCKUP ÖRNEĞİ", 512, 555);
};
draw("#e8e1d3");
let ready = 0,
  scene = DEMO_MOCKUP_SCENES[0];
let probeCapture = false,
  probeResult = "";
function Fixture() {
  useLayoutEffect(() => {
    if (!probeCapture) return;
    ref
      .current!.png()
      .then(() => {
        probeResult = "wrong-scene-captured";
      })
      .catch((error) => {
        probeResult = error.message;
      });
  }, [scene]);
  return (
    <MockupPreview
      ref={ref}
      scene={scene}
      textures={{ front, back }}
      onReady={() => ready++}
    />
  );
}
const render = () => root.render(<Fixture />);
const api = {
  ref,
  render,
  get ready() {
    return ready;
  },
  setColor: (color: string) => {
    draw(color);
    render();
  },
  setScene: (value: typeof scene, probe = false) => {
    probeCapture = probe;
    probeResult = "";
    scene = value;
    render();
  },
  get probeResult() {
    return probeResult;
  },
  unmount: () => root.unmount(),
  scene,
};
Object.assign(window, { mockupFixture: api });
render();

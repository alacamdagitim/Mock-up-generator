import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createLiveStudioEnvironment, liveStudioLighting } from "./liveStudio";
import { createPouchAsset } from "./pouchAsset";
import { arrangeProduct, fittedDistance } from "./productLayout";
import { previewBuffer } from "../shared/render-quality.mjs";
import type { Presentation } from "./types";
import { sceneColors } from "./scene";
import { createContactShadow } from "./ContactShadow";
import { captureRenderSnapshot } from "./render/snapshot";
import { applyPouchFinish } from "./previewFinish";
import type { PreviewAsset } from "./productModel";
import type { RenderSnapshot } from "./render/types";
export type PreviewHandle = {
  png: (scale?: number) => string;
  view: (v: "front" | "back" | "perspective") => void;
  zoom: (delta: number) => void;
  interaction: (mode: "rotate" | "pan") => void;
  layoutCovers: (signal?: AbortSignal) => Promise<Record<string, string>>;
  snapshot: (
    printTextures?: Record<"front" | "back", HTMLCanvasElement>,
  ) => RenderSnapshot;
};
type SceneState = {
  external: boolean;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  maps: THREE.CanvasTexture[];
  printCanvases: HTMLCanvasElement[];
  materials: THREE.MeshPhysicalMaterial[];
  seal: THREE.MeshPhysicalMaterial;
  root: THREE.Group;
  prototype: THREE.Group;
  contacts: THREE.Group;
  contactShadow: ReturnType<typeof createContactShadow>;
  lights: THREE.DirectionalLight[];
  hemisphere: THREE.HemisphereLight;
  mobile: boolean;
  backgroundMap?: THREE.Texture;
  exportBackground?: THREE.Color | THREE.Texture | null;
  render: () => void;
  fit: (view?: "front" | "back" | "perspective") => void;
  updateShadow: () => void;
  flushInteraction: () => void;
  interaction: "rotate" | "pan";
  resize: () => void;
};
export const Preview = forwardRef<
  PreviewHandle,
  {
    textures: Record<"front" | "back", HTMLCanvasElement | null>;
    settings: Presentation;
    assetFactory?: (renderer: THREE.WebGLRenderer) => PreviewAsset;
  }
>(({ textures, settings, assetFactory }, ref) => {
  const host = useRef<HTMLDivElement>(null),
    state = useRef<SceneState | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      layoutCovers: async (signal) => {
        const s = state.current;
        if (!s) throw new Error("3B model henüz hazır değil.");
        const { createLayoutCovers } = await import("./layoutCovers");
        return createLayoutCovers(
          s.renderer,
          s.prototype,
          s.scene,
          settingsRef.current,
          s.external,
          signal,
        );
      },
      snapshot: (printTextures) => {
        const s = state.current;
        if (!s)
          throw new Error(
            "3D sahne henüz hazır değil. Birkaç saniye sonra tekrar deneyin.",
          );
        return captureRenderSnapshot(
          s.root,
          s.camera,
          s.controls.target,
          settingsRef.current,
          printTextures,
        );
      },
      png: (scale = 1) => {
        const s = state.current;
        if (!s) throw new Error("3D önizleme henüz hazır değil.");
        s.flushInteraction();
        const size = s.renderer.getSize(new THREE.Vector2()),
          ratio = s.renderer.getPixelRatio();
        const factor = Math.max(1, scale);
        const longEdge = s.mobile ? 1536 : 2560;
        const exportScale = Math.min(
          factor,
          longEdge / Math.max(size.x, size.y),
        );
        try {
          s.renderer.setPixelRatio(1);
          s.renderer.setSize(
            Math.round(size.x * exportScale),
            Math.round(size.y * exportScale),
            false,
          );
          s.scene.background = s.exportBackground || null;
          s.render();
          return s.renderer.domElement.toDataURL("image/png");
        } finally {
          s.renderer.setPixelRatio(ratio);
          s.renderer.setSize(size.x, size.y, false);
          s.scene.background = null;
          s.render();
        }
      },
      view: (v) => state.current?.fit(v),
      interaction: (mode) => {
        const s = state.current;
        if (s) {
          s.interaction = mode;
          s.controls.enablePan = true;
          s.controls.enableRotate = false;
          s.controls.mouseButtons.LEFT =
            mode === "pan" ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
          s.controls.touches.ONE = mode === "pan" ? THREE.TOUCH.PAN : null;
        }
      },
      zoom: (delta) => {
        const s = state.current;
        if (s) {
          s.camera.position
            .sub(s.controls.target)
            .multiplyScalar(delta)
            .add(s.controls.target);
          s.controls.update();
          s.render();
        }
      },
    }),
    [],
  );
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      setError(true);
      return;
    }
    const mobile = window.matchMedia("(max-width:700px)").matches;
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral preserves packaging ink hues under neutral studio light.
    renderer.toneMapping = THREE.NeutralToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(3.2, 1.2, 9);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableRotate = false;
    // Product rotation owns one-finger drags. A disabled ROTATE mapping leaves
    // OrbitControls in its two-touch state after one finger is lifted.
    controls.touches.ONE = null;
    controls.enableDamping = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI * 0.8;
    controls.minPolarAngle = Math.PI * 0.1;
    // Neutral, locally generated photographic light cards. PMREM supplies
    // roughness-correct reflections without a heavy continuous render pass.
    const environmentTarget = createLiveStudioEnvironment(renderer, mobile);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.72;
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x868686, 0.1);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-5, 5.5, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(key.shadow.camera, {
      left: -10,
      right: 10,
      top: 8,
      bottom: -8,
      near: 0.1,
      far: 30,
    });
    key.shadow.radius = 5;
    key.shadow.blurSamples = 12;
    key.shadow.bias = -0.00015;
    key.shadow.normalBias = 0.015;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(5, 3, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 1.1);
    rim.position.set(2, 5, -5);
    scene.add(rim);
    scene.add(key.target, fill.target, rim.target);
    const asset = assetFactory
      ? assetFactory(renderer)
      : createPouchAsset(renderer);
    const { prototype, maps, materials, seal } = asset;
    const external = "external" in asset && asset.external === true;
    // Reuse one derived canvas per face. Print treatments never change the
    // editable artwork canvases or allocate a new GPU texture on each update.
    const printCanvases = maps.map(() => document.createElement("canvas"));
    const root = new THREE.Group(),
      contacts = new THREE.Group();
    scene.add(root, contacts);
    const contactShadow = createContactShadow(renderer, mobile ? 512 : 1024);
    contacts.add(contactShadow.mesh);
    let disposed = false;
    let dragFrame = 0;
    let shadowDirty = false;
    const render = () => {
      if (!disposed && !renderer.getContext().isContextLost())
        renderer.render(scene, camera);
    };
    const updateShadow = () => {
      if (disposed || renderer.getContext().isContextLost()) return;
      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) return;
      const center = bounds.getCenter(new THREE.Vector3());
      const radius = Math.max(
        2,
        bounds.getSize(new THREE.Vector3()).length() / 2,
      );
      const scale = Math.max(1, radius / 2.2);
      const positions = [
        [settingsRef.current.lighting === "dramatic" ? -6 : -5, 5.5, 6],
        [5, 3, 2],
        [2, 5, -5],
      ];
      [key, fill, rim].forEach((light, i) => {
        light.target.position.copy(center);
        light.target.updateMatrixWorld();
        light.position
          .copy(center)
          .add(new THREE.Vector3(...positions[i]).multiplyScalar(scale));
        light.updateMatrixWorld();
      });
      const shadowCamera = key.shadow.camera;
      shadowCamera.position.copy(key.position);
      shadowCamera.lookAt(center);
      shadowCamera.updateMatrixWorld();
      const inLight = bounds
        .clone()
        .applyMatrix4(shadowCamera.matrixWorldInverse);
      const margin = Math.max(0.3, radius * 0.12);
      shadowCamera.left = inLight.min.x - margin;
      shadowCamera.right = inLight.max.x + margin;
      shadowCamera.top = inLight.max.y + margin;
      shadowCamera.bottom = inLight.min.y - margin;
      shadowCamera.near = Math.max(0.1, -inLight.max.z - margin);
      shadowCamera.far = Math.max(
        shadowCamera.near + 1,
        -inLight.min.z + margin,
      );
      shadowCamera.updateProjectionMatrix();
      renderer.shadowMap.needsUpdate = true;
      if (settingsRef.current.shadows) contactShadow.update(root);
    };
    const flushInteraction = () => {
      if (dragFrame) cancelAnimationFrame(dragFrame);
      dragFrame = 0;
      if (shadowDirty) {
        updateShadow();
        shadowDirty = false;
      }
      render();
    };
    const renderInteraction = () => {
      shadowDirty = true;
      if (!dragFrame) dragFrame = requestAnimationFrame(flushInteraction);
    };
    let fitted = false;
    let framing:
      { distance: number; center: THREE.Vector3; layout: string } | undefined;
    const fit = (view?: "front" | "back" | "perspective") => {
      if (view) {
        root.quaternion.identity();
        root.position.set(0, 0, 0);
      }
      const bounds = new THREE.Box3().setFromObject(root),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      if (!Number.isFinite(center.x)) return;
      const direction =
        view === "front"
          ? new THREE.Vector3(0, 0.025, 1)
          : view === "back"
            ? new THREE.Vector3(0, 0.025, -1)
            : view === "perspective" || !fitted
              ? new THREE.Vector3(0.27, 0.13, 1)
              : camera.position.clone().sub(controls.target);
      direction.normalize();
      const distance = fittedDistance(bounds, camera, direction, 1.2);
      // Preserve the user's orbit, pan offset and relative zoom as spacing
      // changes. Returning to the original arrangement returns the same view.
      const layout = settingsRef.current.layout || "single";
      const preserve = !view && fitted && framing?.layout === layout;
      const zoomRatio = preserve
        ? camera.position.distanceTo(controls.target) / framing!.distance
        : 1;
      const pan = preserve
        ? controls.target.clone().sub(framing!.center)
        : new THREE.Vector3();
      controls.maxDistance = Math.max(36, distance * 6);
      camera.far = Math.max(100, controls.maxDistance + size.length() * 2);
      camera.updateProjectionMatrix();
      controls.target.copy(center).add(pan);
      camera.position
        .copy(controls.target)
        .addScaledVector(direction, distance * zoomRatio);
      framing = { distance, center: center.clone(), layout };
      fitted = true;
      controls.update();
      if (view) updateShadow();
      render();
    };
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      const compact = window.matchMedia("(max-width:700px)").matches;
      if (state.current) state.current.mobile = compact;
      const buffer = previewBuffer(
        w,
        h,
        window.devicePixelRatio,
        compact,
        settingsRef.current.quality === "detail",
      );
      renderer.setSize(buffer.width, buffer.height, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (!fitted && root.children.length) {
        fit();
        fitted = true;
      } else {
        // Resizing a panel changes the projection, not the user's camera
        // position, orbit target, viewing angle or chosen zoom distance.
        render();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    state.current = {
      external,
      renderer,
      scene,
      camera,
      controls,
      maps,
      printCanvases,
      materials,
      seal,
      root,
      prototype,
      contacts,
      contactShadow,
      lights: [key, fill, rim],
      hemisphere,
      mobile,
      render,
      fit,
      updateShadow,
      flushInteraction,
      interaction: "rotate",
      resize,
    };
    // Rotate the product around the dominant drag axis. OrbitControls handles
    // wheel/pinch zoom and the explicit Hand mode, with no inertial movement.
    const pointers = new Map<number, { x: number; y: number; type: string }>();
    let drag: { id: number; x: number; y: number } | null = null;
    const startProductDrag = (event: PointerEvent) => {
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      });
      if (pointers.size > 1) {
        drag = null;
        return;
      }
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        state.current?.interaction !== "rotate"
      )
        return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const moveProductDrag = (event: PointerEvent) => {
      if (pointers.has(event.pointerId))
        pointers.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
          type: event.pointerType,
        });
      if (
        !drag ||
        drag.id !== event.pointerId ||
        pointers.size !== 1 ||
        state.current?.interaction !== "rotate"
      )
        return;
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const centerBefore = new THREE.Box3()
        .setFromObject(root)
        .getCenter(new THREE.Vector3());
      root.rotateOnWorldAxis(
        horizontal ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0),
        ((horizontal ? dx : dy) * Math.PI * 2) / Math.max(1, el.clientHeight),
      );
      const centerAfter = new THREE.Box3()
        .setFromObject(root)
        .getCenter(new THREE.Vector3());
      root.position.add(centerBefore.sub(centerAfter));
      event.preventDefault();
      renderInteraction();
    };
    const endProductDrag = (event: PointerEvent) => {
      if (!pointers.delete(event.pointerId)) return;
      if (drag?.id === event.pointerId) drag = null;
      if (event.type === "pointercancel") {
        pointers.clear();
        drag = null;
      } else if (
        pointers.size === 1 &&
        state.current?.interaction === "rotate"
      ) {
        const [id, point] = [...pointers][0];
        if (point.type === "touch") drag = { id, x: point.x, y: point.y };
      }
      flushInteraction();
    };
    renderer.domElement.addEventListener("pointerdown", startProductDrag);
    renderer.domElement.addEventListener("pointermove", moveProductDrag);
    renderer.domElement.addEventListener("pointerup", endProductDrag);
    renderer.domElement.addEventListener("pointercancel", endProductDrag);
    renderer.domElement.addEventListener("lostpointercapture", endProductDrag);
    resize();
    setReady(true);
    const contextLost = (event: Event) => {
      event.preventDefault();
      setError(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      disposed = true;
      cancelAnimationFrame(dragFrame);
      pointers.clear();
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", startProductDrag);
      renderer.domElement.removeEventListener("pointermove", moveProductDrag);
      renderer.domElement.removeEventListener("pointerup", endProductDrag);
      renderer.domElement.removeEventListener("pointercancel", endProductDrag);
      renderer.domElement.removeEventListener(
        "lostpointercapture",
        endProductDrag,
      );
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      asset.dispose();
      contactShadow.dispose();
      environmentTarget.dispose();
      state.current?.backgroundMap?.dispose();
      [key, fill, rim].forEach((light) => light.shadow.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.root.clear();
    arrangeProduct(
      s.root,
      s.prototype,
      settings.layout,
      settings.spacing,
      s.external ? 1 : 0.08 + (settings.inflate ?? 100) * 0.0092,
    );
    s.updateShadow();
    s.contacts.visible = settings.shadows;
    // React has already committed the mode/layout CSS. Fit the arrangement
    // against its current full-size viewport rather than the previous mini
    // preview's aspect ratio; ordinary resizes still preserve camera position.
    const el = host.current;
    if (el?.clientWidth && el.clientHeight) {
      s.resize();
      s.camera.aspect = el.clientWidth / el.clientHeight;
      s.camera.updateProjectionMatrix();
    }
    s.fit();
  }, [settings.layout, settings.spacing, ready]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (s.external) return;
    const depth = 0.08 + (settings.inflate ?? 100) * 0.0092;
    s.root.children.forEach((model) => {
      model.scale.z = model.scale.x * depth;
    });
    s.updateShadow();
    s.render();
  }, [settings.inflate, ready]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.backgroundMap?.dispose();
    s.backgroundMap = undefined;
    if (settings.backgroundStyle === "transparent") s.exportBackground = null;
    else if (settings.backgroundStyle === "solid")
      s.exportBackground = new THREE.Color(settings.background);
    else {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 512;
      const ctx = c.getContext("2d")!,
        colors = sceneColors(settings.background),
        grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0, colors.top);
      grad.addColorStop(1, colors.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 8, 512);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      s.backgroundMap = t;
      s.exportBackground = t;
    }
    s.scene.background = null;
    const lighting = liveStudioLighting(settings.lighting);
    s.renderer.toneMappingExposure = settings.exposure * lighting.exposure;
    if (!s.external) applyPouchFinish(s.materials, s.seal, settings);
    [lighting.key, lighting.fill, lighting.rim].forEach((intensity, index) => {
      s.lights[index].intensity = intensity;
    });
    const daylight = settings.lighting === "daylight";
    s.lights[0].color.set(daylight ? "#fff9ee" : "#ffffff");
    s.lights[1].color.set(daylight ? "#e6eeff" : "#ffffff");
    s.hemisphere.groundColor.set(daylight ? "#8c98a8" : "#868686");
    s.scene.environmentIntensity = lighting.environment;
    s.hemisphere.intensity = lighting.ambient;
    s.contacts.visible = settings.shadows;
    s.renderer.shadowMap.enabled = settings.shadows;
    s.updateShadow();
    s.resize();
    s.render();
  }, [
    settings.background,
    settings.backgroundStyle,
    settings.material,
    settings.finishing,
    settings.substrate,
    settings.exposure,
    settings.shadows,
    settings.lighting,
    settings.quality,
    ready,
  ]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const printMode = settings.printMode || "color";
    (["front", "back"] as const).forEach((face, i) => {
      const source = textures[face];
      const output = s.printCanvases[i];
      const sourceWidth = source?.width || 600,
        sourceHeight = source?.height || 900;
      const ratio = Math.min(
        1,
        (s.mobile ? 1536 : 2048) / Math.max(sourceWidth, sourceHeight),
      );
      const width = Math.max(1, Math.round(sourceWidth * ratio)),
        height = Math.max(1, Math.round(sourceHeight * ratio));
      if (output.width !== width || output.height !== height) {
        // WebGL2 texture storage has immutable dimensions. Reallocate before
        // switching from the sample portrait to a product's landscape UV map.
        s.maps[i].dispose();
        output.width = width;
        output.height = height;
      }
      const ctx = output.getContext("2d")!;
      ctx.filter = "none";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (source && printMode !== "blank") {
        ctx.filter = printMode === "black" ? "grayscale(1)" : "none";
        ctx.drawImage(source, 0, 0, width, height);
        ctx.filter = "none";
      }
      s.maps[i].image = output;
      s.maps[i].needsUpdate = true;
    });
    const canvas = s.printCanvases[0];
    if (canvas && !s.external) {
      const rgb = canvas.getContext("2d")?.getImageData(0, 0, 1, 1).data;
      if (rgb) {
        const substrate = settings.substrate || "white";
        const tint = new THREE.Color(
          substrate === "kraft"
            ? "#b59362"
            : substrate === "metallic"
              ? "#e0e1e2"
              : "#ffffff",
        );
        s.seal.color
          .setRGB(
            rgb[0] / 255,
            rgb[1] / 255,
            rgb[2] / 255,
            THREE.SRGBColorSpace,
          )
          .multiply(tint);
      }
    }
    s.render();
  }, [textures, settings.printMode, settings.substrate, ready]);
  return (
    <div
      className="preview-render"
      ref={host}
      aria-label={
        assetFactory
          ? "Ürünün 3B model önizlemesi"
          : "Döndürülebilen 3D doypack önizlemesi"
      }
      data-model-source={assetFactory ? "product-glb" : "sample"}
      data-layout={settings.layout || "single"}
      data-finishing={
        settings.finishing ||
        (settings.material === "glossy" ? "gloss" : "matte")
      }
      data-substrate={settings.substrate || "white"}
      data-print-mode={settings.printMode || "color"}
      data-inflate={settings.inflate ?? 100}
    >
      {!ready && !error && (
        <div className="render-loading">Stüdyo ışığı hazırlanıyor…</div>
      )}
      {error && (
        <div className="webgl-error">
          Bu cihazda 3D başlatılamadı veya grafik bağlantısı kesildi. Sayfayı
          yenileyin. 2D tasarım ve JSON indirme kullanılabilir.
        </div>
      )}
    </div>
  );
});

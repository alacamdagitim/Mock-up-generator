import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.ALACAM_TEST_URL || "http://127.0.0.1:5184";
const output = "test-results/render-snapshot";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: process.env.ALACAM_GPU_METAL === "1" ? ["--use-angle=metal"] : [],
});
const summary = { passed: [], errors: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => summary.errors.push(error.message));
  // A blank same-origin document avoids opening another live editor/GPU scene.
  await page.route("**/__render-snapshot-qa", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta charset="utf-8"><title>Render snapshot QA</title>',
    }),
  );
  await page.goto(`${base}/__render-snapshot-qa`);
  const result = await page.evaluate(async () => {
    const T = await import("/node_modules/.vite/deps/three.js");
    const { captureRenderSnapshot } = await import("/src/render/snapshot.ts");
    const makeCanvas = (width, height, fill) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = fill;
      context.fillRect(0, 0, width, height);
      return canvas;
    };
    const front = makeCanvas(4096, 1024, "#ef302a");
    const back = makeCanvas(2048, 512, "#2255cc");
    // Two colors per face prove that the stored pixel data is copied, not just
    // its dimensions or a reusable uniform background color.
    front.getContext("2d").fillStyle = "#38b76a";
    front.getContext("2d").fillRect(2048, 0, 2048, 1024);
    back.getContext("2d").fillStyle = "#f0c32b";
    back.getContext("2d").fillRect(1024, 0, 1024, 512);
    const sourceCanvas = makeCanvas(16, 8, "#775599");
    const sourceFront = new T.CanvasTexture(sourceCanvas);
    sourceFront.flipY = false;
    const sourceBack = new T.CanvasTexture(sourceCanvas);
    sourceBack.flipY = true;
    const materialFront = new T.MeshPhysicalMaterial({ map: sourceFront });
    materialFront.name = "artwork_front";
    const materialBack = new T.MeshPhysicalMaterial({ map: sourceBack });
    materialBack.name = "artwork_back";
    const unprinted = new T.MeshPhysicalMaterial({
      color: "#bda27e",
      map: new T.CanvasTexture(sourceCanvas),
    });
    unprinted.name = "unprinted";
    const geometry = new T.BoxGeometry(1, 2, 0.5);
    const frontMesh = new T.Mesh(geometry, materialFront);
    frontMesh.name = "ordinary_front_mesh";
    const backMesh = new T.Mesh(geometry, materialBack);
    backMesh.name = "ordinary_back_mesh";
    const mixedMesh = new T.Mesh(geometry, [
      materialFront,
      unprinted,
      materialBack,
    ]);
    mixedMesh.name = "ordinary_mixed_mesh";
    for (const group of mixedMesh.geometry.groups) group.materialIndex %= 3;
    const product = new T.Group();
    product.add(frontMesh, backMesh, mixedMesh);
    const camera = new T.PerspectiveCamera(34, 1, 0.05, 100);
    camera.position.set(3, 2, 6);
    camera.lookAt(0, 0, 0);
    const settings = {
      material: "matte",
      background: "#ffffff",
      backgroundStyle: "solid",
      exposure: 1,
      shadows: true,
    };
    const snapshot = captureRenderSnapshot(
      product,
      camera,
      new T.Vector3(),
      settings,
      { front, back },
    );
    const capturedFront = snapshot.product.getObjectByName(frontMesh.name);
    const capturedBack = snapshot.product.getObjectByName(backMesh.name);
    const capturedMixed = snapshot.product.getObjectByName(mixedMesh.name);
    const readPixels = (texture) => {
      const image = texture.image;
      const context = image.getContext("2d");
      return {
        width: image.width,
        height: image.height,
        flipY: texture.flipY,
        first: [...context.getImageData(0, 0, 1, 1).data],
        last: [...context.getImageData(image.width - 1, 0, 1, 1).data],
      };
    };
    const pixels = {
      front: readPixels(capturedFront.material.map),
      back: readPixels(capturedBack.material.map),
      mixed: capturedMixed.material.map((material) => readPixels(material.map)),
    };
    // Mutating the live source after capture must not mutate offline pixels.
    front.width = 1;
    back.height = 1;
    const independent = {
      frontWidth: capturedFront.material.map.image.width,
      backHeight: capturedBack.material.map.image.height,
      cameraCopied: snapshot.camera !== camera,
      geometryCopied: capturedFront.geometry !== geometry,
      materialCopied: capturedFront.material !== materialFront,
      liveMapUnchanged: materialFront.map === sourceFront,
      liveFrontSize: [sourceFront.image.width, sourceFront.image.height],
      liveBackSize: [sourceBack.image.width, sourceBack.image.height],
      originalPixel: [
        ...sourceCanvas.getContext("2d").getImageData(0, 0, 1, 1).data,
      ],
    };
    const snapshotTextures = new Set([
      capturedFront.material.map,
      capturedBack.material.map,
      ...capturedMixed.material.map((material) => material.map),
    ]);
    const ownedImages = [...snapshotTextures].map((texture) => texture.image);
    let textureDisposals = 0;
    let materialDisposals = 0;
    let geometryDisposals = 0;
    snapshotTextures.forEach((texture) =>
      texture.addEventListener("dispose", () => textureDisposals++),
    );
    const snapshotMaterials = new Set([
      capturedFront.material,
      capturedBack.material,
      ...capturedMixed.material,
    ]);
    snapshotMaterials.forEach((material) =>
      material.addEventListener("dispose", () => materialDisposals++),
    );
    capturedFront.geometry.addEventListener(
      "dispose",
      () => geometryDisposals++,
    );
    snapshot.dispose();
    const afterFirstDispose = {
      textureDisposals,
      materialDisposals,
      geometryDisposals,
    };
    snapshot.dispose();
    const afterSecondDispose = {
      textureDisposals,
      materialDisposals,
      geometryDisposals,
    };
    const releasedImages = ownedImages.every(
      (image) => image.width === 1 && image.height === 1,
    );
    geometry.dispose();
    materialFront.dispose();
    materialBack.dispose();
    unprinted.map.dispose();
    unprinted.dispose();
    sourceFront.dispose();
    sourceBack.dispose();
    sourceCanvas.width = sourceCanvas.height = 1;
    return {
      pixels,
      independent,
      afterFirstDispose,
      afterSecondDispose,
      releasedImages,
    };
  });
  expect(result.pixels.front).toEqual({
    width: 4096,
    height: 1024,
    flipY: false,
    first: [239, 48, 42, 255],
    last: [56, 183, 106, 255],
  });
  expect(result.pixels.back).toEqual({
    width: 2048,
    height: 512,
    flipY: true,
    first: [34, 85, 204, 255],
    last: [240, 195, 43, 255],
  });
  expect(result.pixels.mixed[0]).toEqual(result.pixels.front);
  expect(result.pixels.mixed[2]).toEqual(result.pixels.back);
  expect(result.pixels.mixed[1]).toMatchObject({
    width: 16,
    height: 8,
    first: [119, 85, 153, 255],
  });
  expect(result.independent).toEqual({
    frontWidth: 4096,
    backHeight: 512,
    cameraCopied: true,
    geometryCopied: true,
    materialCopied: true,
    liveMapUnchanged: true,
    liveFrontSize: [16, 8],
    liveBackSize: [16, 8],
    originalPixel: [119, 85, 153, 255],
  });
  expect(result.afterSecondDispose).toEqual(result.afterFirstDispose);
  expect(result.afterFirstDispose.materialDisposals).toBe(3);
  expect(result.afterFirstDispose.geometryDisposals).toBe(1);
  expect(result.afterFirstDispose.textureDisposals).toBeGreaterThanOrEqual(3);
  expect(result.releasedImages).toBe(true);
  summary.passed.push(
    "Material-name front/back mapping preserves real 4K/2K pixels and per-face flipY, including mixed materials",
    "Snapshot pixels/geometry/materials/camera are independent; live sources stay unchanged",
    "Disposal is idempotent and releases owned image buffers",
  );

  const manualBinding = await page.evaluate(async () => {
    const T = await import("/node_modules/.vite/deps/three.js");
    const { createImportedAsset } = await import("/src/productModel.ts");
    const { captureRenderSnapshot } = await import("/src/render/snapshot.ts");
    const ink = (width, height, color) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = color;
      context.fillRect(0, 0, width, height);
      return canvas;
    };
    const originalFront = new T.CanvasTexture(ink(16, 8, "#a44b99"));
    const originalBack = new T.CanvasTexture(ink(16, 8, "#884466"));
    const frontMaterial = new T.MeshPhysicalMaterial({ map: originalFront });
    frontMaterial.name = "artwork_front";
    const backMaterial = new T.MeshPhysicalMaterial({ map: originalBack });
    backMaterial.name = "artwork_back";
    const front = new T.Mesh(new T.PlaneGeometry(1, 2), frontMaterial);
    front.name = "print_front";
    const back = new T.Mesh(new T.PlaneGeometry(1, 2), backMaterial);
    back.name = "print_back";
    const product = new T.Group();
    product.add(front, back);
    // Choose the authored back surface as a single FRONT artwork target. The
    // unused authored front surface must retain its original texture in render.
    const asset = createImportedAsset(
      product,
      {
        capabilities: { getMaxAnisotropy: () => 1 },
      },
      { targetId: "1:0", flipY: true },
    );
    const camera = new T.PerspectiveCamera(34, 1, 0.05, 100);
    camera.position.set(0, 0, 5);
    const printFront = ink(4096, 1024, "#00dd44");
    const printBack = ink(2048, 512, "#2255cc");
    const snapshot = captureRenderSnapshot(
      product,
      camera,
      new T.Vector3(),
      {
        material: "matte",
        background: "#ffffff",
        backgroundStyle: "solid",
        exposure: 1,
        shadows: true,
      },
      { front: printFront, back: printBack },
    );
    const pixel = (material) => {
      const canvas = material.map.image;
      return {
        width: canvas.width,
        height: canvas.height,
        flipY: material.map.flipY,
        color: [...canvas.getContext("2d").getImageData(0, 0, 1, 1).data],
      };
    };
    const result = {
      liveSelectedFace: back.material.userData.printableFace,
      liveUnselectedOriginal:
        front.material === frontMaterial &&
        front.material.map === originalFront,
      selected: pixel(snapshot.product.getObjectByName("print_back").material),
      unselected: pixel(
        snapshot.product.getObjectByName("print_front").material,
      ),
    };
    snapshot.dispose();
    asset.dispose();
    printFront.width =
      printFront.height =
      printBack.width =
      printBack.height =
        1;
    return result;
  });
  expect(manualBinding.liveSelectedFace).toBe("front");
  expect(manualBinding.liveUnselectedOriginal).toBe(true);
  expect(manualBinding.selected).toEqual({
    width: 4096,
    height: 1024,
    flipY: true,
    color: [0, 221, 68, 255],
  });
  expect(manualBinding.unselected).toEqual({
    width: 16,
    height: 8,
    flipY: true,
    color: [164, 75, 153, 255],
  });
  summary.passed.push(
    "Manual front binding on a print_back mesh stays front in offline render; unselected explicitly named surfaces preserve original textures",
  );

  const cancellation = await page.evaluate(async () => {
    const T = await import("/node_modules/.vite/deps/three.js");
    const { captureRenderSnapshot } = await import("/src/render/snapshot.ts");
    const { renderStudio } = await import("/src/render/studioRender.ts");
    // Preload the engine so cancellation measures compilation/cleanup, not
    // downloading modules. All compilation and contexts remain native.
    await import("/node_modules/.vite/deps/three-gpu-pathtracer.js");
    const prototype = WebGL2RenderingContext.prototype;
    const getExtension = prototype.getExtension;
    const getProgramParameter = prototype.getProgramParameter;
    const controller = new AbortController();
    let completionPolls = 0;
    let abortTime = 0;
    let abortTimer;
    let disposeCalls = 0;
    const completionStatus = 0x91b1;
    prototype.getExtension = function (name) {
      if (name === "WEBGL_lose_context") return null;
      if (name === "KHR_parallel_shader_compile")
        return (
          getExtension.call(this, name) || {
            COMPLETION_STATUS_KHR: completionStatus,
          }
        );
      return getExtension.call(this, name);
    };
    prototype.getProgramParameter = function (program, parameter) {
      if (parameter === completionStatus) {
        completionPolls++;
        if (!abortTimer)
          abortTimer = setTimeout(() => {
            abortTime = performance.now();
            controller.abort();
          }, 300);
        return false;
      }
      return getProgramParameter.call(this, program, parameter);
    };
    const product = new T.Group();
    const geometry = new T.BoxGeometry(1, 1, 1);
    const material = new T.MeshPhysicalMaterial({ color: "#dca987" });
    product.add(new T.Mesh(geometry, material));
    const camera = new T.PerspectiveCamera(34, 1, 0.05, 100);
    camera.position.set(0, 0.5, 5);
    camera.lookAt(0, 0, 0);
    const snapshot = captureRenderSnapshot(product, camera, new T.Vector3(), {
      material: "matte",
      background: "#ffffff",
      backgroundStyle: "solid",
      exposure: 1,
      shadows: true,
    });
    const dispose = snapshot.dispose;
    snapshot.dispose = () => {
      disposeCalls++;
      dispose();
    };
    const canvas = document.createElement("canvas");
    let name = "";
    let message = "";
    let watchdog;
    const safety = setTimeout(() => controller.abort(), 8000);
    try {
      await Promise.race([
        renderStudio(
          snapshot,
          {
            resolution: 1024,
            quality: "standard",
            studio: "softbox",
            background: "white",
            aspect: "square",
            floorShadow: false,
          },
          { canvas, signal: controller.signal },
        ),
        new Promise((_, reject) => {
          watchdog = setTimeout(
            () => reject(new Error("Compilation cancellation did not settle")),
            12000,
          );
        }),
      ]);
    } catch (error) {
      name = error.name;
      message = error.message;
    } finally {
      clearTimeout(safety);
      clearTimeout(abortTimer);
      clearTimeout(watchdog);
      prototype.getExtension = getExtension;
      prototype.getProgramParameter = getProgramParameter;
      geometry.dispose();
      material.dispose();
    }
    return {
      completionPolls,
      name,
      message,
      disposeCalls,
      cancelledWithinMs: performance.now() - abortTime,
      outputSize: [canvas.width, canvas.height],
    };
  });
  expect(cancellation.completionPolls).toBeGreaterThan(0);
  expect(cancellation.name).toBe("AbortError");
  expect(cancellation.cancelledWithinMs).toBeLessThan(3000);
  expect(cancellation.disposeCalls).toBe(1);
  expect(cancellation.outputSize).toEqual([1, 1]);
  summary.cancellation = cancellation;
  summary.passed.push(
    "Native shader compilation cancellation settles within 3s despite permanently unready programs and unavailable WEBGL_lose_context",
  );
  expect(summary.errors).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify(summary, null, 2));
  console.log("Render snapshot browser checks passed:", summary);
} finally {
  await browser.close();
}

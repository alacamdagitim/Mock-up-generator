import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createPouchAsset } from "../src/pouchAsset";
import { createContactShadow } from "../src/ContactShadow";
import { LAYOUTS, layoutPoses } from "../shared/layouts.mjs";
type Covers = Record<string, string>;
const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
function artwork(back = false) {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 900;
  const x = c.getContext("2d")!;
  x.fillStyle = "#06a3a6";
  x.fillRect(0, 0, 600, 900);
  x.fillStyle = "#008b91";
  x.beginPath();
  x.moveTo(0, 80);
  x.lineTo(600, 320);
  x.lineTo(0, 520);
  x.fill();
  x.fillStyle = "#42bfb9";
  x.beginPath();
  x.moveTo(0, 520);
  x.lineTo(600, 320);
  x.lineTo(600, 760);
  x.fill();
  x.fillStyle = "#70d3c4";
  x.beginPath();
  x.moveTo(0, 520);
  x.lineTo(600, 760);
  x.lineTo(0, 900);
  x.fill();
  x.fillStyle = "#1d8d91";
  x.fillRect(0, 0, 600, 90);
  x.fillRect(0, 855, 600, 45);
  x.fillStyle = "#f8faf4";
  x.fillRect(162, 130, 276, 252);
  x.textAlign = "center";
  x.fillStyle = "#183b3b";
  x.font = "bold 33px Arial";
  x.fillText("ALAÇAM", 300, 242);
  x.font = "19px Arial";
  x.fillText(back ? "ARKA YÜZ" : "AMBALAJ", 300, 277);
  if (back) {
    x.fillStyle = "#1a7778";
    for (let i = 0; i < 5; i++) x.fillRect(145, 478 + i * 22, 310, 5);
    for (let i = 0; i < 24; i++)
      x.fillRect(215 + i * 7, 665, i % 3 === 0 ? 4 : 2, 62);
  } else {
    x.fillStyle = "#e8f6f0";
    x.beginPath();
    x.arc(300, 600, 60, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#2a7c78";
    x.font = "bold 23px Arial";
    x.fillText("140 × 210", 300, 609);
    x.font = "18px Arial";
    x.fillText("Özenle tasarlandı", 300, 777);
  }
  return c;
}
export async function generateLayoutCovers(): Promise<Covers> {
  await nextFrame();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(512, 320);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f0f1f5");
  const room = new RoomEnvironment(),
    pmrem = new THREE.PMREMGenerator(renderer),
    environment = pmrem.fromScene(room, 0.04, 0.1, 100);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;
  room.dispose();
  pmrem.dispose();
  const lights = [
    new THREE.HemisphereLight(0xffffff, 0x9399a5, 0.35),
    new THREE.DirectionalLight(0xfffbef, 2.1),
    new THREE.DirectionalLight(0xe4f0ff, 0.7),
    new THREE.DirectionalLight(0xffffff, 1.3),
  ];
  lights[1].position.set(-4, 7, 5);
  lights[2].position.set(4, 2, 4);
  lights[3].position.set(3, 5, -5);
  scene.add(...lights);
  const asset = createPouchAsset(renderer),
    root = new THREE.Group();
  scene.add(root);
  const shadow = createContactShadow(renderer, 256);
  scene.add(shadow.mesh);
  asset.materials.forEach((m) => {
    m.roughness = 0.36;
    m.clearcoat = 0.4;
    m.clearcoatRoughness = 0.3;
  });
  const camera = new THREE.PerspectiveCamera(29, 1.6, 0.1, 100),
    covers: Covers = {};
  try {
    for (const id of LAYOUTS.map((l) => l.id)) {
      asset.maps.forEach((map, i) => {
        map.image = artwork(i === 1);
        map.needsUpdate = true;
      });
      asset.seal.color.set("#279ca0");
      root.clear();
      for (const p of layoutPoses(id)) {
        const m = asset.prototype.clone(true);
        m.position.set(
          p.x,
          p.y + Math.abs(Math.sin(p.rz)) * 1.17 * p.scale,
          p.z,
        );
        m.rotation.set(0, p.ry, p.rz);
        m.scale.setScalar(p.scale);
        root.add(m);
      }
      shadow.update(root);
      const bounds = new THREE.Box3().setFromObject(root),
        size = bounds.getSize(new THREE.Vector3()),
        center = bounds.getCenter(new THREE.Vector3());
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
        distance =
          Math.max(
            size.y / (2 * tangent),
            size.x / (2 * tangent * camera.aspect),
          ) *
            1.19 +
          size.z * 0.65;
      camera.position
        .copy(center)
        .addScaledVector(
          new THREE.Vector3(0.36, 0.17, 1).normalize(),
          distance,
        );
      camera.lookAt(center);
      renderer.render(scene, camera);
      covers[id] = renderer.domElement.toDataURL("image/webp", 0.82);
      await nextFrame();
    }
    return covers;
  } finally {
    shadow.dispose();
    asset.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

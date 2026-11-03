import { useEffect, useRef, useState } from "react";
import { MAX_MOCKUP_SCENES } from "../../shared/mockup-scenes.mjs";
import { checkAbort, MAX_SCENE_PIXELS } from "./assets";
import { composeMockup, loadMockupScene } from "./compositor";
import type { ArtworkProvider, LoadedMockup } from "./compositor";
import type { MockupScene, MockupTextures } from "./types";

export type GalleryPreview = {
  url?: string;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  stale?: boolean;
};

type GalleryOptions = {
  scenes: MockupScene[];
  active: boolean;
  revision: string;
  textures: MockupTextures;
  artworkProvider?: ArtworkProvider;
  backgroundColors?: Record<string, string>;
  mobile?: boolean;
};
type CachedPreview = GalleryPreview & { key: string };
type PreviewCache = Record<string, CachedPreview>;
type Snapshot = {
  images: Map<string, HTMLCanvasElement>;
  errors: Map<string, string>;
};
type Session = {
  identity: string;
  controller: AbortController;
  scenes: MockupScene[];
  keys: Map<string, string>;
  queue: string[];
  pending: Set<string>;
  working: boolean;
  currentId: string | null;
  targetEdge: number;
  renderEdge: number;
  inputs: GalleryOptions;
};

function message(reason: unknown) {
  return reason instanceof Error ? reason.message : "Mockup oluşturulamadı.";
}
function release(canvas: HTMLCanvasElement | null | undefined) {
  if (canvas) canvas.width = canvas.height = 1;
}
function revoke(entry: CachedPreview | undefined) {
  if (entry?.url) URL.revokeObjectURL(entry.url);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Mockup işlemi iptal edildi.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        if (signal.aborted) abort();
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Freeze artwork before asynchronous scene downloads can observe a newer edit. */
async function snapshotArtwork(session: Session): Promise<Snapshot> {
  const images = new Map<string, HTMLCanvasElement>();
  const errors = new Map<string, string>();
  const needed = new Map<
    string,
    { face: "front" | "back"; mode: "design" | "transparent" }
  >();
  for (const scene of session.scenes)
    for (const surface of scene.surfaces) {
      const mode = surface.backgroundMode || "design";
      needed.set(`${surface.face}:${mode}`, { face: surface.face, mode });
    }
  const signal = session.controller.signal;
  try {
    // Start every provider from this captured revision before awaiting any of them.
    await Promise.all(
      Array.from(needed, async ([key, { face, mode }]) => {
        try {
          checkAbort(signal);
          if (mode === "transparent" && !session.inputs.artworkProvider)
            throw new Error(
              "Bu sahne için saydam tasarım yüzeyi hazırlanamadı.",
            );
          const source = await abortable(
            Promise.resolve(
              session.inputs.artworkProvider
                ? session.inputs.artworkProvider(face, mode)
                : session.inputs.textures[face],
            ),
            signal,
          );
          checkAbort(signal);
          if (!source)
            throw new Error("Mockup için tasarım yüzeyi henüz hazırlanmadı.");
          if (
            !source.width ||
            !source.height ||
            source.width * source.height > MAX_SCENE_PIXELS
          )
            throw new Error(
              "Tasarım görseli izin verilen piksel ölçüsünü aşıyor.",
            );
          const copy = document.createElement("canvas");
          copy.width = source.width;
          copy.height = source.height;
          const context = copy.getContext("2d");
          if (!context) {
            release(copy);
            throw new Error("Bu tarayıcı tasarım yüzeyini açamadı.");
          }
          context.drawImage(source, 0, 0);
          images.set(key, copy);
        } catch (error) {
          if (signal.aborted) throw error;
          errors.set(key, message(error));
        }
      }),
    );
    checkAbort(signal);
    return { images, errors };
  } catch (error) {
    for (const image of images.values()) release(image);
    images.clear();
    throw error;
  }
}

async function previewBlob(
  rendered: HTMLCanvasElement,
  targetEdge: number,
  signal: AbortSignal,
) {
  let resized: HTMLCanvasElement | null = null;
  try {
    checkAbort(signal);
    const longest = Math.max(rendered.width, rendered.height);
    if (longest > targetEdge) {
      resized = document.createElement("canvas");
      const scale = targetEdge / longest;
      resized.width = Math.max(1, Math.round(rendered.width * scale));
      resized.height = Math.max(1, Math.round(rendered.height * scale));
      const context = resized.getContext("2d");
      if (!context) throw new Error("Bu tarayıcı mockup önizlemesini açamadı.");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(rendered, 0, 0, resized.width, resized.height);
    }
    return await abortable(
      new Promise<Blob>((resolve, reject) => {
        (resized || rendered).toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Mockup önizlemesi oluşturulamadı.")),
          "image/webp",
          0.9,
        );
      }),
      signal,
    );
  } finally {
    release(resized);
  }
}

/**
 * One decoded scene at a time, a frozen design per batch, and only small encoded
 * previews in the cache. A parent product change should remount the gallery.
 */
export function useMockupGallery(options: GalleryOptions) {
  const { active, revision, mobile = false } = options;
  const inputs = useRef(options);
  inputs.current = options;
  const cache = useRef<PreviewCache>({});
  const [visibleCache, setVisibleCache] = useState<PreviewCache>({});
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  // Aborting an older run does not immediately finish decoding/encoding. Every
  // replacement waits for its finally block, including Strict Mode effect replay.
  const serial = useRef<Promise<void>>(Promise.resolve());
  const previousCatalog = useRef<string | null>(null);
  const mounted = useRef(false);
  const kick = useRef<(session: Session) => void>(() => {});
  const unique = new Map<string, MockupScene>();
  for (const scene of options.scenes) {
    if (unique.size === MAX_MOCKUP_SCENES) break;
    if (!unique.has(scene.id)) unique.set(scene.id, scene);
  }
  const scenes = Array.from(unique.values());
  const catalogKey = JSON.stringify(
    scenes.slice().sort((a, b) => a.id.localeCompare(b.id)),
  );
  const colorsKey = JSON.stringify(
    scenes
      .map((scene) => [scene.id, options.backgroundColors?.[scene.id] || ""])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  const identity = JSON.stringify([catalogKey, colorsKey, revision, mobile]);
  const requested = useRef({ identity, active });
  requested.current = { identity, active };
  const targetEdge = mobile ? 480 : 640;
  const renderEdge = mobile ? 760 : 960;
  const keyFor = (scene: MockupScene) =>
    JSON.stringify([
      scene,
      revision,
      targetEdge,
      options.backgroundColors?.[scene.id] || "",
    ]);
  const isCurrent = (session: Session) =>
    mounted.current &&
    sessionRef.current === session &&
    requested.current.active &&
    requested.current.identity === session.identity &&
    !session.controller.signal.aborted;
  const update = (id: string, entry: CachedPreview) => {
    cache.current = { ...cache.current, [id]: entry };
    if (mounted.current) setVisibleCache(cache.current);
  };

  kick.current = (session) => {
    if (session.working || !isCurrent(session) || !session.queue.length) return;
    session.working = true;
    setBusy(true);
    const work = async () => {
      let snapshot: Snapshot | null = null;
      try {
        if (!isCurrent(session)) return;
        snapshot = await snapshotArtwork(session);
        while (isCurrent(session) && session.queue.length) {
          const id = session.queue.shift()!;
          session.pending.delete(id);
          session.currentId = id;
          const scene = session.scenes.find((candidate) => candidate.id === id);
          if (!scene) continue;
          const key = session.keys.get(id)!;
          const old = cache.current[id];
          update(id, {
            url: old?.url,
            key,
            status: "loading",
            stale: Boolean(old?.url),
          });
          const controller = new AbortController();
          const abort = () => controller.abort();
          session.controller.signal.addEventListener("abort", abort, {
            once: true,
          });
          const timeout = setTimeout(abort, 45_000);
          let loaded: LoadedMockup | null = null;
          let rendered: HTMLCanvasElement | null = null;
          try {
            for (const surface of scene.surfaces) {
              const error = snapshot.errors.get(
                `${surface.face}:${surface.backgroundMode || "design"}`,
              );
              if (error) throw new Error(error);
            }
            loaded = await loadMockupScene(scene, controller.signal);
            checkAbort(controller.signal);
            rendered = await composeMockup(loaded, session.inputs.textures, {
              maxEdge: session.renderEdge,
              antialias: true,
              signal: controller.signal,
              backgroundColor: session.inputs.backgroundColors?.[id],
              artworkProvider: (face, mode) =>
                snapshot!.images.get(`${face}:${mode}`) || null,
            });
            // Native passes have no reason to remain decoded while WebP encodes.
            loaded.dispose();
            loaded = null;
            const blob = await previewBlob(
              rendered,
              session.targetEdge,
              controller.signal,
            );
            checkAbort(controller.signal);
            if (!isCurrent(session)) return;
            const url = URL.createObjectURL(blob);
            revoke(cache.current[id]);
            update(id, { url, key, status: "ready", stale: false });
          } catch (error) {
            if (!isCurrent(session)) return;
            update(id, {
              url: cache.current[id]?.url,
              key,
              status: "error",
              stale: Boolean(cache.current[id]?.url),
              error: controller.signal.aborted
                ? "Sahne hazırlanırken süre doldu. Yeniden deneyebilirsiniz."
                : message(error),
            });
          } finally {
            clearTimeout(timeout);
            session.controller.signal.removeEventListener("abort", abort);
            loaded?.dispose();
            release(rendered);
            session.currentId = null;
          }
          // Yield between scenes so pointer/scroll input and ready cards paint.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      } catch (error) {
        if (!isCurrent(session)) return;
        for (const id of session.queue)
          update(id, {
            url: cache.current[id]?.url,
            key: session.keys.get(id)!,
            status: "error",
            stale: Boolean(cache.current[id]?.url),
            error: message(error),
          });
        session.queue = [];
        session.pending.clear();
      } finally {
        if (snapshot) {
          for (const image of snapshot.images.values()) release(image);
          snapshot.images.clear();
        }
        session.working = false;
        if (isCurrent(session)) {
          setBusy(false);
          if (session.queue.length) kick.current(session);
        }
      }
    };
    serial.current = serial.current.catch(() => {}).then(work);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sessionRef.current?.controller.abort();
      sessionRef.current = null;
      for (const entry of Object.values(cache.current)) revoke(entry);
      cache.current = {};
    };
  }, []);

  useEffect(() => {
    if (previousCatalog.current !== catalogKey) {
      for (const entry of Object.values(cache.current)) revoke(entry);
      cache.current = {};
      previousCatalog.current = catalogKey;
    }
    const currentScenes = scenes;
    const keys = new Map(
      currentScenes.map((scene) => [scene.id, keyFor(scene)]),
    );
    const queue: string[] = [];
    const next: PreviewCache = {};
    for (const scene of currentScenes) {
      const key = keys.get(scene.id)!;
      const old = cache.current[scene.id];
      if (old?.key === key && ["ready", "error"].includes(old.status))
        next[scene.id] = old;
      else {
        next[scene.id] = {
          key,
          url: old?.url,
          status: active ? "loading" : "idle",
          stale: Boolean(old?.url),
        };
        queue.push(scene.id);
      }
    }
    cache.current = next;
    setVisibleCache(next);
    setBusy(false);
    const session: Session = {
      identity,
      controller: new AbortController(),
      scenes: currentScenes,
      keys,
      queue,
      pending: new Set(queue),
      working: false,
      currentId: null,
      targetEdge,
      renderEdge,
      inputs: {
        ...inputs.current,
        scenes: currentScenes,
        // Snapshot colors too: a later setting change cannot alter this batch.
        backgroundColors: { ...inputs.current.backgroundColors },
      },
    };
    sessionRef.current = session;
    if (active) kick.current(session);
    return () => {
      session.controller.abort();
      if (sessionRef.current === session) sessionRef.current = null;
    };
    // The semantic keys intentionally replace mutable arrays/provider identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogKey, colorsKey, revision, mobile, active]);

  const retry = (id: string) => {
    const session = sessionRef.current;
    if (
      !active ||
      !session ||
      !isCurrent(session) ||
      !session.keys.has(id) ||
      session.currentId === id ||
      session.pending.has(id)
    )
      return;
    const old = cache.current[id];
    // Retry only failed cards; clicking an already complete card never rerenders.
    if (old?.status !== "error") return;
    update(id, {
      key: session.keys.get(id)!,
      url: old.url,
      status: "loading",
      stale: Boolean(old.url),
    });
    session.queue.push(id);
    session.pending.add(id);
    kick.current(session);
  };

  const previews: Record<string, GalleryPreview> = {};
  let completed = 0;
  for (const scene of scenes) {
    const entry = visibleCache[scene.id];
    const current = entry?.key === keyFor(scene);
    const preview: GalleryPreview = current
      ? entry
      : {
          url: previousCatalog.current === catalogKey ? entry?.url : undefined,
          status: active ? "loading" : "idle",
          stale: previousCatalog.current === catalogKey && Boolean(entry?.url),
        };
    previews[scene.id] = preview;
    if (preview.status === "ready" && !preview.stale) completed++;
  }
  return {
    previews,
    completed,
    total: scenes.length,
    running: active && busy,
    retry,
  };
}

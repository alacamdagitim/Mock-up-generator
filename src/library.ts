import { libraryDocument, librarySummary } from "../shared/library.mjs";
import { parseDesign } from "../shared/schema.mjs";
import type { z } from "zod";
export type LibraryDocument = z.infer<
  typeof import("../shared/library.mjs").libraryDocumentSchema
>;
export type LibrarySummary = Omit<LibraryDocument, "design"> & { name: string };
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Bu tarayıcıda kütüphane depolaması kullanılamıyor."));
      return;
    }
    const req = indexedDB.open("alacam-design-library", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const projects = db.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("scope", "scope");
      db.createObjectStore("documents", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        new Error(
          "Kütüphane açılamadı. Tarayıcı depolama izinlerini kontrol edin.",
        ),
      );
    req.onblocked = () =>
      reject(new Error("Kütüphane başka bir sekmede güncelleniyor."));
  });
const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "Kütüphane kaydedilemedi. Depolama kotası dolmuş olabilir; JSON yedeği indirin.",
        ),
      );
  });
export async function listProjects(scope: string): Promise<LibrarySummary[]> {
  const db = await database();
  try {
    const tx = db.transaction("projects", "readonly");
    const entries = await result(
      tx.objectStore("projects").index("scope").getAll(scope),
    );
    return entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}
export async function storeProject(
  input: LibraryDocument,
): Promise<LibrarySummary> {
  const record = libraryDocument(input),
    metadata = librarySummary(record),
    db = await database();
  try {
    const tx = db.transaction(["projects", "documents"], "readwrite"),
      complete = done(tx);
    const existing = await result(tx.objectStore("projects").get(record.id));
    if (existing && existing.scope !== record.scope) {
      tx.abort();
      await complete.catch(() => {});
      throw new Error("Bu tasarım başka bir kütüphaneye ait.");
    }
    tx.objectStore("projects").put(metadata);
    tx.objectStore("documents").put({
      id: record.id,
      scope: record.scope,
      design: record.design,
    });
    await complete;
    return metadata;
  } finally {
    db.close();
  }
}
export async function readProject(
  scope: string,
  id: string,
): Promise<LibraryDocument> {
  const db = await database();
  try {
    const tx = db.transaction(["projects", "documents"], "readonly");
    const [metadata, doc] = await Promise.all([
      result(tx.objectStore("projects").get(id)),
      result(tx.objectStore("documents").get(id)),
    ]);
    if (!metadata || !doc || metadata.scope !== scope || doc.scope !== scope)
      throw new Error("Tasarım bu kütüphanede bulunamadı.");
    const { name, ...record } = metadata;
    return libraryDocument({ ...record, design: parseDesign(doc.design) });
  } finally {
    db.close();
  }
}
export async function archiveProject(
  scope: string,
  id: string,
  archived: boolean,
) {
  const db = await database();
  try {
    const tx = db.transaction("projects", "readwrite"),
      complete = done(tx),
      store = tx.objectStore("projects");
    const entry = await result(store.get(id));
    if (!entry || entry.scope !== scope) {
      tx.abort();
      await complete;
      return;
    }
    store.put({ ...entry, archived });
    await complete;
  } finally {
    db.close();
  }
}
export async function projectThumbnail(png: string) {
  const image = new Image();
  image.src = png;
  await image.decode();
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    420 / image.naturalWidth,
    320 / image.naturalHeight,
  );
  canvas.width = Math.round(image.naturalWidth * ratio);
  canvas.height = Math.round(image.naturalHeight * ratio);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.86);
}

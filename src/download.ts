/** Activate downloads inside the editor's modal, including nested ShadowRoots. */
export function downloadExport(
  blob: Blob,
  filename: string,
  container?: HTMLElement | null,
) {
  if (container === null || (container && !container.isConnected))
    throw new Error("İndirme penceresi kapatıldı. Dosyayı yeniden indirin.");
  const host = container || document.body;
  const link = host.ownerDocument.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  try {
    // document.body is inert while the storefront launcher uses showModal().
    // The activating anchor must stay in the same connected modal subtree.
    host.append(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  // Safari may start reading the object URL after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

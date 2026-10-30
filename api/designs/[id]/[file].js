import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSavedFile } from "../../../server/design-blob.mjs";
import { allowDesignRequest, apiError } from "../../../server/design-http.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    if (!allowDesignRequest(req, res, ["GET", "HEAD"])) return;
    // Parse the URL as well as the Vercel route parameters so this handler also
    // works in a normal Node adapter without framework-specific query fields.
    const segments = new URL(req.url, "https://api.invalid").pathname.split(
      "/",
    );
    const id =
      typeof req.query?.id === "string" ? req.query.id : segments.at(-2) || "";
    const file =
      typeof req.query?.file === "string"
        ? req.query.file
        : segments.at(-1) || "";
    const saved = await getSavedFile(id, file);
    res.statusCode = 200;
    res.setHeader("Content-Type", saved.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${file}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (req.method === "HEAD") {
      await saved.stream.cancel();
      res.end();
      return;
    }
    // Streaming avoids loading the editable document into the function response
    // payload; designs larger than 4.5 MB remain downloadable.
    res.flushHeaders?.();
    await pipeline(Readable.fromWeb(saved.stream), res);
  } catch (error) {
    apiError(res, error);
  }
}

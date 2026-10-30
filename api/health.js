import { designStorageHealth } from "../server/design-blob.mjs";
import {
  allowDesignRequest,
  apiError,
  jsonResponse,
} from "../server/design-http.mjs";

export default async function handler(req, res) {
  try {
    if (!allowDesignRequest(req, res, ["GET", "HEAD"])) return;
    const health = await designStorageHealth();
    if (req.method === "HEAD") {
      res.statusCode = 200;
      res.end();
      return;
    }
    jsonResponse(res, 200, health);
  } catch (error) {
    apiError(res, error);
  }
}

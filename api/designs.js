import {
  connectDesignStorage,
  finalizeDesignUpload,
  prepareDesignUpload,
  saveInlineDesign,
} from "../server/design-blob.mjs";
import { DesignApiError } from "../server/design-contract.mjs";
import {
  allowDesignRequest,
  apiError,
  jsonResponse,
  limitDesignWrites,
  readJsonBody,
} from "../server/design-http.mjs";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    if (!allowDesignRequest(req, res, ["POST"])) return;
    limitDesignWrites(req, res);
    const action = new URL(req.url, "https://api.invalid").searchParams.get(
      "action",
    );
    const body = await readJsonBody(req, action ? 20_000 : undefined);
    if (action === "prepare")
      return jsonResponse(res, 201, await prepareDesignUpload(body));
    if (action === "connect")
      return jsonResponse(res, 200, await connectDesignStorage(body));
    if (action === "finalize")
      return jsonResponse(res, 201, await finalizeDesignUpload(body));
    if (action)
      throw new DesignApiError(400, "Bilinmeyen tasarım kayıt işlemi.");
    jsonResponse(res, 201, await saveInlineDesign(body));
  } catch (error) {
    apiError(res, error);
  }
}

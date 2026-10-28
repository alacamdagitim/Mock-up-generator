import { createApp } from "./app.mjs";
const port = Number(process.env.PORT || 3001);
createApp().listen(port, "0.0.0.0", () =>
  console.log(
    `Alaçam Design API: http://localhost:${port} (storage ${process.env.DESIGN_STORAGE_DIR && process.env.PUBLIC_BASE_URL ? "configured" : "NOT configured"})`,
  ),
);

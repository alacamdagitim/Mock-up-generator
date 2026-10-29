import { createPsdService } from "./service.mjs";
const service = await createPsdService();
const server = service.app.listen(
  Number(process.env.PSD_PORT || 3002),
  process.env.PSD_HOST || "127.0.0.1",
  () => console.log("PSD worker ready; sources are private."),
);
server.requestTimeout = 600000;
async function stop() {
  server.close();
  await service.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

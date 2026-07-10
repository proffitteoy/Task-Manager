import { createApp } from "./server.js";

const { app, config } = await createApp();

await app.listen({
  host: config.host,
  port: config.port
});

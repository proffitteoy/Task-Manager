import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import { ActivityStatsAdapter } from "./adapters/activityStats.js";
import { ActivityWatchAdapter } from "./adapters/activitywatch.js";
import { MusicAdapter } from "./adapters/music.js";
import { loadConfig, type WorkbenchConfig } from "./config.js";
import { openDatabase, type DatabaseContext } from "./db/client.js";
import { EventBus } from "./events/bus.js";
import { WorkbenchRepository } from "./modules/repository.js";
import { registerRoutes } from "./api/routes.js";

export interface WorkbenchApp {
  app: FastifyInstance;
  config: WorkbenchConfig;
  database: DatabaseContext;
}

export async function createApp(overrides: Partial<WorkbenchConfig> = {}): Promise<WorkbenchApp> {
  const config = loadConfig(overrides);
  const database = openDatabase(config);
  const repository = new WorkbenchRepository(database.sqlite);
  const events = new EventBus();
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  app.setErrorHandler((error, _request, reply) => {
    const maybeStatusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : undefined;
    const statusCode = maybeStatusCode && maybeStatusCode >= 400 ? maybeStatusCode : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    reply.status(statusCode).send({
      error: message,
      detail: statusCode >= 500 ? "Workbench core request failed" : undefined
    });
  });

  await registerRoutes(app, {
    config,
    repository,
    activityStats: new ActivityStatsAdapter(config),
    activityWatch: new ActivityWatchAdapter(config),
    music: new MusicAdapter(config, repository),
    events
  });

  app.addHook("onClose", async () => {
    database.sqlite.close();
  });

  return { app, config, database };
}

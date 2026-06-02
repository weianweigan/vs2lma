import { serve } from "@hono/node-server";
import type { AppConfig, ServerStatus } from "../config/types.js";
import { LogStore } from "./logger.js";
import { createApp } from "./routes.js";

export class ServerManager {
  private server: ReturnType<typeof serve> | null = null;
  private logStore: LogStore;
  private config: AppConfig | null = null;
  private startedAt: number | null = null;

  constructor() {
    this.logStore = new LogStore();
  }

  getLogStore(): LogStore {
    return this.logStore;
  }

  getStatus(): ServerStatus {
    return {
      running: this.server !== null,
      startedAt: this.startedAt,
      host: this.config?.host ?? "localhost",
      port: this.config?.port ?? 11434,
      requestCount: this.logStore.getRequestCount(),
    };
  }

  updateConfig(config: AppConfig): void {
    this.config = { ...config };
  }

  getConfig(): AppConfig | null {
    return this.config ? { ...this.config } : null;
  }

  async start(config: AppConfig): Promise<void> {
    if (this.server) {
      throw new Error("Server is already running");
    }

    this.config = { ...config };
    const app = createApp(this.config, this.logStore);

    return new Promise<void>((resolve, reject) => {
      try {
        this.server = serve(
          {
            fetch: app.fetch,
            hostname: config.host,
            port: config.port,
          },
          (info) => {
            this.startedAt = Date.now();
            this.logStore.addInfo(
              `Server started on http://${info.address}:${info.port}`
            );
            resolve();
          }
        );
      } catch (e: any) {
        if (e.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${config.port} is already in use. Please stop the other process or choose a different port.`
            )
          );
        } else {
          reject(e);
        }
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise<void>((resolve) => {
      // @hono/node-server close() is synchronous and fires the callback
      this.server!.close(() => {
        this.server = null;
        this.startedAt = null;
        this.logStore.addInfo("Server stopped");
        resolve();
      });
    });
  }
}

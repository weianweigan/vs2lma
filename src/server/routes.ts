import { Hono } from "hono";
import { proxy } from "hono/proxy";
import type { AppConfig } from "../config/types.js";
import { LogStore } from "./logger.js";

const DEFAULT_DEEPSEEK_URL = "https://api.deepseek.com";

export function createApp(config: AppConfig, logStore: LogStore): Hono {
  const app = new Hono();
  const caps = [
    ...(config.capabilities.tools ? ["tools"] : []),
    ...(config.capabilities.thinking ? ["thinking"] : []),
  ];

  // Request logging middleware
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    const path = new URL(c.req.url).pathname;
    if (!path.startsWith("/api/status") && !path.startsWith("/api/logs")) {
      logStore.addRequest(c.req.method, path, c.res.status, duration);
    }
  });

  // Ollama-compatible API routes
  app.get("/api/version", (c) => {
    return c.json({ version: "0.11.0" });
  });

  app.post("/api/show", async (c) => {
    const body = await c.req.json();
    let capabilities = ["completion", "tools", ...caps];
    if (body.model === "deepseek-reasoner") {
      capabilities = [...capabilities, "thinking"];
    }
    return c.json({
      model_info: { "general.architecture": "qwen2" },
      capabilities: [...new Set(capabilities)],
    });
  });

  app.get("/api/tags", async (c) => {
    const url = config.baseUrl.includes(DEFAULT_DEEPSEEK_URL)
      ? `${DEFAULT_DEEPSEEK_URL}/models`
      : `${config.baseUrl}/v1/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        const models = (data.data ?? []).map((item: any) => ({
          name: item.id,
          model: item.id,
        }));
        return c.json({ models });
      }
    } catch (e) {
      logStore.addError("GET", "/api/tags", String(e));
    } finally {
      clearTimeout(timeout);
    }
    return c.text("internal error", 500);
  });

  app.post("/v1/chat/completions", async (c) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await proxy(`${config.baseUrl}/v1/chat/completions`, {
        ...c.req,
        method: "POST",
        headers: {
          ...c.req.header(),
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal: controller.signal,
      });
      return res;
    } catch (e) {
      logStore.addError("POST", "/v1/chat/completions", String(e));
      return c.text("internal error", 500);
    } finally {
      clearTimeout(timeout);
    }
  });

  // Monitoring API (for Tauri frontend)
  app.get("/api/status", (c) => {
    return c.json({
      running: true,
      requestCount: logStore.getRequestCount(),
      host: config.host,
      port: config.port,
    });
  });

  app.get("/api/logs", (c) => {
    return c.json(logStore.getRecent(100));
  });

  app.delete("/api/logs", (c) => {
    logStore.clear();
    return c.json({ ok: true });
  });

  return app;
}

import type { AppConfig } from "./types.js";

export const defaultConfig: AppConfig = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  host: "localhost",
  port: 11434,
  capabilities: {
    tools: true,
    thinking: false,
  },
  autoStartServer: false,
  minimizeToTray: true,
};

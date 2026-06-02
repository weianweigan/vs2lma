import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "./types.js";
import { defaultConfig } from "./defaults.js";

function getConfigPath(): string {
  const dir = join(homedir(), "AppData", "Roaming", "vs2lma");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "config.json");
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath();
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...defaultConfig, ...parsed, capabilities: { ...defaultConfig.capabilities, ...parsed.capabilities } };
    }
  } catch {
    // Corrupt config — fall through to defaults
  }
  return { ...defaultConfig };
}

export function saveConfig(config: AppConfig): void {
  const configPath = getConfigPath();
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function getConfigDir(): string {
  return join(homedir(), "AppData", "Roaming", "vs2lma");
}

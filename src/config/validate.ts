import type { AppConfig, ValidationError } from "./types.js";

export function validateUrl(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return "Base URL is required";
  }
  try {
    new URL(value.trim());
  } catch {
    return "Invalid URL format (e.g., https://api.deepseek.com)";
  }
  return null;
}

export function validatePort(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return "Port must be a number between 1 and 65535";
  }
  return null;
}

export function validateApiKey(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return "API key is required";
  }
  return null;
}

export function validateConfig(config: Partial<AppConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.baseUrl !== undefined) {
    const err = validateUrl(config.baseUrl);
    if (err) errors.push({ field: "baseUrl", message: err });
  }

  if (config.port !== undefined) {
    const err = validatePort(config.port);
    if (err) errors.push({ field: "port", message: err });
  }

  if (config.apiKey !== undefined) {
    const err = validateApiKey(config.apiKey);
    if (err) errors.push({ field: "apiKey", message: err });
  }

  return errors;
}

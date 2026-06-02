export interface AppConfig {
  baseUrl: string;
  apiKey: string;
  host: string;
  port: number;
  capabilities: {
    tools: boolean;
    thinking: boolean;
  };
  autoStartServer: boolean;
  minimizeToTray: boolean;
}

export interface ServerStatus {
  running: boolean;
  startedAt: number | null;
  host: string;
  port: number;
  requestCount: number;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  type: "request" | "error" | "info";
  error?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface TestResult {
  success: boolean;
  models?: { name: string; model: string }[];
  error?: string;
}

import type { LogEntry } from "../config/types.js";

export class LogStore {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  addRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.add({
      method,
      path,
      statusCode,
      durationMs,
      type: "request",
    });
  }

  addError(method: string, path: string, error: string): void {
    this.add({
      method,
      path,
      statusCode: 0,
      durationMs: 0,
      type: "error",
      error,
    });
  }

  addInfo(message: string): void {
    this.add({
      method: "INFO",
      path: message,
      statusCode: 0,
      durationMs: 0,
      type: "info",
    });
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getRecent(count: number): LogEntry[] {
    return this.entries.slice(-count);
  }

  clear(): void {
    this.entries = [];
  }

  getRequestCount(): number {
    return this.entries.filter((e) => e.type === "request").length;
  }

  private add(entry: Omit<LogEntry, "id" | "timestamp">): void {
    const full: LogEntry = {
      ...entry,
      id: this.nextId++,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(full);
    if (this.entries.length > this.maxSize) {
      this.entries = this.entries.slice(-this.maxSize);
    }
  }
}

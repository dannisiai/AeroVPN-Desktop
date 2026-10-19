import { app } from "electron";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { resourcePath } from "./resources";

let pendingProxyOperation: Promise<void> = Promise.resolve();

function enqueueProxyOperation(operation: () => Promise<void>): Promise<void> {
  const result = pendingProxyOperation.then(operation, operation);
  pendingProxyOperation = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function proxyStatePath(): string {
  return join(app.getPath("userData"), "windows-system-proxy-backup.json");
}

function runProxyScript(
  action: "enable" | "restore",
  statePath: string,
  port?: number,
  bypassDomains: string[] = [],
): Promise<void> {
  const scriptPath = resourcePath("windows-system-proxy.ps1");
  const arguments_ = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-Action",
    action,
    "-StateFile",
    statePath,
  ];
  if (action === "enable") {
    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
      return Promise.reject(new Error("The local proxy port is invalid."));
    }
    arguments_.push("-Port", String(port), "-BypassDomain", bypassDomains.join(";"));
  }
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      arguments_,
      { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          const details = stderr.trim();
          reject(new Error(details === "" ? error.message : details));
          return;
        }
        resolve();
      },
    );
  });
}

export function enableWindowsSystemProxy(
  port: number,
  bypassDomains: string[],
): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("System Proxy mode is only available on Windows."));
  }
  const statePath = proxyStatePath();
  return enqueueProxyOperation(() =>
    runProxyScript("enable", statePath, port, bypassDomains),
  );
}

export function restoreWindowsSystemProxy(): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.resolve();
  }
  const statePath = proxyStatePath();
  return enqueueProxyOperation(async () => {
    if (!existsSync(statePath)) {
      return;
    }
    await runProxyScript("restore", statePath);
  });
}

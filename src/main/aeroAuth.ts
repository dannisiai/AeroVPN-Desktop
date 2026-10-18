import { app, ipcMain, safeStorage } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { AERO_AUTH_CALL } from "../shared/ipc";
import { AERO_MANAGED_MODE } from "../shared/appPolicy";
import type {
  AeroAccountSnapshot,
  AeroConnectSessionSnapshot,
  AeroConnectionSnapshot,
  AeroRegionSnapshot,
  ProfilesResult,
} from "../shared/ipc";
import { startAeroManagedConfig, stopAeroManagedService } from "./profiles";

const API_BASE_URL = "https://www.ethworldcupcoin.xyz:8443";
const API_TIMEOUT_MILLISECONDS = 15_000;

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  deviceSessionId: string;
  account: AeroAccountSnapshot;
  connection: AeroConnectionSnapshot | null;
}

class AeroAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

let cachedSession: StoredSession | null | undefined;
let refreshInFlight: Promise<StoredSession> | null = null;

function sessionPath(): string {
  return join(app.getPath("userData"), "aerovpn-session.bin");
}

function parseSession(value: unknown): StoredSession | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.accessToken !== "string" ||
    candidate.accessToken === "" ||
    typeof candidate.refreshToken !== "string" ||
    candidate.refreshToken === "" ||
    typeof candidate.email !== "string" ||
    typeof candidate.account !== "object" ||
    candidate.account === null
  ) {
    return null;
  }
  const account = candidate.account as Record<string, unknown>;
  if (typeof account.email !== "string") {
    return null;
  }
  const rawPlan = account.plan;
  let plan: AeroAccountSnapshot["plan"] = null;
  if (typeof rawPlan === "object" && rawPlan !== null && !Array.isArray(rawPlan)) {
    const raw = rawPlan as Record<string, unknown>;
    plan = {
      name: typeof raw.name === "string" ? raw.name : "",
      status: typeof raw.status === "string" ? raw.status : "unknown",
      expiresAt: typeof raw.expiresAt === "number" ? raw.expiresAt : 0,
      maxDevices: typeof raw.maxDevices === "number" ? raw.maxDevices : 0,
      currentDevices: typeof raw.currentDevices === "number" ? raw.currentDevices : 0,
      trafficGb: typeof raw.trafficGb === "number" ? raw.trafficGb : null,
      trafficUsedGb: typeof raw.trafficUsedGb === "number" ? raw.trafficUsedGb : null,
    };
  }
  const rawConnection = candidate.connection;
  const connection = isRecord(rawConnection) &&
      typeof rawConnection.sessionId === "string" &&
      typeof rawConnection.regionId === "string" &&
      typeof rawConnection.cityId === "string" &&
      typeof rawConnection.cityName === "string" &&
      typeof rawConnection.countryName === "string" &&
      typeof rawConnection.countryCode === "string" &&
      typeof rawConnection.protocol === "string" &&
      typeof rawConnection.expiresAt === "number"
    ? {
        sessionId: rawConnection.sessionId,
        regionId: rawConnection.regionId,
        cityId: rawConnection.cityId,
        cityName: rawConnection.cityName,
        countryName: rawConnection.countryName,
        countryCode: rawConnection.countryCode,
        protocol: rawConnection.protocol,
        expiresAt: rawConnection.expiresAt,
      }
    : null;
  return {
    accessToken: candidate.accessToken,
    refreshToken: candidate.refreshToken,
    email: candidate.email,
    deviceSessionId: typeof candidate.deviceSessionId === "string" ? candidate.deviceSessionId : "",
    account: { email: account.email, plan },
    connection,
  };
}

function readSession(): StoredSession | null {
  if (cachedSession !== undefined) {
    return cachedSession;
  }
  const path = sessionPath();
  if (!existsSync(path)) {
    cachedSession = null;
    return null;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable. Restart AeroVPN and try again.");
  }
  try {
    const decrypted = safeStorage.decryptString(readFileSync(path));
    cachedSession = parseSession(JSON.parse(decrypted));
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

function writeSession(session: StoredSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable. Restart AeroVPN and try again.");
  }
  const path = sessionPath();
  const temporaryPath = `${path}.${process.pid}.tmp`;
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(temporaryPath, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 });
  renameSync(temporaryPath, path);
  cachedSession = session;
}

function clearSession(): void {
  const path = sessionPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
  cachedSession = null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const message = value.error ?? value.message;
  return typeof message === "string" && message !== "" ? message : null;
}

async function request(
  endpoint: string,
  options: { method: "GET" | "POST"; body?: Record<string, unknown>; accessToken?: string },
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: options.method,
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.accessToken === undefined
          ? {}
          : { Authorization: `Bearer ${options.accessToken}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let body: unknown = {};
    if (response.status !== 204 && response.headers.get("content-length") !== "0") {
      try {
        body = await response.json();
      } catch {
        throw new AeroAuthError(`Non-JSON response from server (HTTP ${response.status})`, response.status);
      }
    }
    if (!response.ok) {
      throw new AeroAuthError(responseMessage(body) ?? "Request failed", response.status);
    }
    return body;
  } catch (error) {
    if (error instanceof AeroAuthError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Network request timed out. Please try again.");
    }
    throw new Error(`Network connection error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseAccount(value: unknown, fallbackEmail: string): AeroAccountSnapshot {
  const result = isRecord(value) ? value : {};
  const rawPlan = result.plan;
  let plan: AeroAccountSnapshot["plan"] = null;
  if (isRecord(rawPlan)) {
    plan = {
      name: typeof rawPlan.name === "string" ? rawPlan.name : "",
      status: typeof rawPlan.status === "string" ? rawPlan.status : "unknown",
      expiresAt: typeof rawPlan.expires_at === "number" ? rawPlan.expires_at : 0,
      maxDevices: typeof rawPlan.max_devices === "number" ? rawPlan.max_devices : 0,
      currentDevices: typeof rawPlan.current_devices === "number" ? rawPlan.current_devices : 0,
      trafficGb: typeof rawPlan.traffic_gb === "number" ? rawPlan.traffic_gb : null,
      trafficUsedGb: typeof rawPlan.traffic_used_gb === "number" ? rawPlan.traffic_used_gb : null,
    };
  }
  return {
    email: typeof result.email === "string" && result.email !== "" ? result.email : fallbackEmail,
    plan,
  };
}

async function authorizedRequest(
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<unknown> {
  const session = readSession();
  if (session === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  try {
    return await request(endpoint, { method, body, accessToken: session.accessToken });
  } catch (error) {
    if (!(error instanceof AeroAuthError) || error.statusCode !== 401) {
      throw error;
    }
  }

  const latestSession = readSession();
  if (latestSession === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  const updatedSession = latestSession.accessToken !== session.accessToken
    ? latestSession
    : await refreshSessionTokens(latestSession);
  return request(endpoint, { method, body, accessToken: updatedSession.accessToken });
}

function refreshSessionTokens(session: StoredSession): Promise<StoredSession> {
  if (refreshInFlight !== null) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    let refresh: unknown;
    try {
      refresh = await request("/v1/auth/refresh", {
        method: "POST",
        body: { refresh_token: session.refreshToken },
      });
    } catch (error) {
      if (error instanceof AeroAuthError && error.statusCode >= 400 && error.statusCode < 500) {
        clearSession();
        throw new AeroAuthError("Your session has expired. Please sign in again.", 401);
      }
      throw error;
    }
    if (!isRecord(refresh) || typeof refresh.access_token !== "string" || typeof refresh.refresh_token !== "string") {
      throw new Error("The server returned an invalid session response.");
    }
    const current = readSession();
    if (current === null) {
      throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
    }
    if (current.accessToken !== session.accessToken) {
      return current;
    }
    const updatedSession = {
      ...current,
      accessToken: refresh.access_token,
      refreshToken: refresh.refresh_token,
    };
    writeSession(updatedSession);
    return updatedSession;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function loadAccount(): Promise<AeroAccountSnapshot> {
  const session = readSession();
  if (session === null) {
    throw new AeroAuthError("Please sign in to your AeroVPN account.", 401);
  }
  const response = await authorizedRequest("/v1/account", "GET");
  let account = parseAccount(response, session.email);
  if (account.plan !== null) {
    try {
      const sessions = await listConnectSessions();
      const activeDeviceIds = new Set(
        sessions
          .filter((item) => !item.revoked && item.expiresAt > Math.floor(Date.now() / 1000))
          .map((item) => item.deviceId),
      );
      account = { ...account, plan: { ...account.plan, currentDevices: activeDeviceIds.size } };
    } catch {
      // Account status remains useful if the optional session listing is unavailable.
    }
  }
  writeSession({ ...readSession()!, email: account.email, account });
  return account;
}

function deviceId(): string {
  const path = join(app.getPath("userData"), "aerovpn-device-id");
  try {
    const stored = readFileSync(path, "utf-8").trim();
    if (stored !== "") {
      return stored;
    }
  } catch {
    // A missing device identifier is created below.
  }
  const created = randomUUID();
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(path, created, { mode: 0o600 });
  return created;
}

function parseRegions(value: unknown): AeroRegionSnapshot[] {
  if (!isRecord(value) || !Array.isArray(value.regions)) {
    throw new Error("The server returned an invalid region list.");
  }
  return value.regions.flatMap((entry): AeroRegionSnapshot[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      return [];
    }
    const cities = Array.isArray(entry.cities)
      ? entry.cities.flatMap((city): AeroRegionSnapshot["cities"] => {
          if (!isRecord(city) || typeof city.id !== "string" || typeof city.name !== "string") {
            return [];
          }
          return [{
            id: city.id,
            name: city.name,
            latencyMs: typeof city.latency_ms === "number" ? city.latency_ms : 0,
            loadPercent: typeof city.load_percent === "number" ? city.load_percent : 0,
            features: Array.isArray(city.features) ? city.features.filter((feature): feature is string => typeof feature === "string") : [],
          }];
        })
      : [];
    return [{
      id: entry.id,
      name: entry.name,
      code: typeof entry.code === "string" ? entry.code : "",
      flagEmoji: typeof entry.flag_emoji === "string" ? entry.flag_emoji : "🌐",
      recommended: entry.recommended === true,
      cities,
    }];
  }).filter((region) => region.cities.length > 0);
}

function parseConnectionResponse(value: unknown): { connection: AeroConnectionSnapshot; nodeSpec: Record<string, unknown> } {
  if (
    !isRecord(value) ||
    typeof value.session_id !== "string" ||
    typeof value.region_id !== "string" ||
    typeof value.city_id !== "string" ||
    typeof value.city_name !== "string" ||
    typeof value.country_name !== "string" ||
    typeof value.country_code !== "string" ||
    typeof value.protocol !== "string" ||
    typeof value.expires_at !== "number" ||
    !isRecord(value.node_spec)
  ) {
    throw new Error("The server returned an invalid connection response.");
  }
  return {
    connection: {
      sessionId: value.session_id,
      regionId: value.region_id,
      cityId: value.city_id,
      cityName: value.city_name,
      countryName: value.country_name,
      countryCode: value.country_code,
      protocol: value.protocol,
      expiresAt: value.expires_at,
    },
    nodeSpec: value.node_spec,
  };
}

function buildNodeOutbound(protocolValue: string, nodeSpec: Record<string, unknown>): Record<string, unknown> {
  const protocol = protocolValue.toLowerCase();
  const server = typeof nodeSpec.server === "string" ? nodeSpec.server : "";
  const serverPort = nodeSpec.server_port;
  const tls = isRecord(nodeSpec.tls) ? nodeSpec.tls : {};
  const serverName = typeof tls.server_name === "string" ? tls.server_name : server;
  if (server === "" || typeof serverPort !== "number" || !Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
    throw new Error("The server returned incomplete node connection details.");
  }

  if (protocol === "hysteria2") {
    if (typeof nodeSpec.password !== "string" || nodeSpec.password === "") {
      throw new Error("The server returned incomplete Hysteria2 credentials.");
    }
    const obfsValue = isRecord(nodeSpec.obfs) ? nodeSpec.obfs : isRecord(tls.obfs) ? tls.obfs : null;
    const outbound: Record<string, unknown> = {
      type: "hysteria2",
      tag: "proxy",
      server,
      server_port: serverPort,
      password: nodeSpec.password,
      tls: { enabled: true, server_name: serverName },
    };
    if (obfsValue !== null) {
      if (typeof obfsValue.password !== "string" || obfsValue.password === "") {
        throw new Error("The server returned incomplete obfuscation credentials.");
      }
      outbound.obfs = {
        type: typeof obfsValue.type === "string" ? obfsValue.type : "salamander",
        password: obfsValue.password,
      };
    }
    if (typeof nodeSpec.up_mbps === "number" && nodeSpec.up_mbps > 0) {
      outbound.up_mbps = nodeSpec.up_mbps;
    }
    if (typeof nodeSpec.down_mbps === "number" && nodeSpec.down_mbps > 0) {
      outbound.down_mbps = nodeSpec.down_mbps;
    }
    return outbound;
  }

  if (protocol === "vless") {
    if (typeof nodeSpec.uuid !== "string" || nodeSpec.uuid === "" || serverName === "") {
      throw new Error("The server returned incomplete VLESS credentials.");
    }
    const tlsConfig: Record<string, unknown> = {
      enabled: true,
      server_name: serverName,
      utls: { enabled: true, fingerprint: "chrome" },
    };
    if (isRecord(tls.reality)) {
      if (typeof tls.reality.public_key !== "string" || typeof tls.reality.short_id !== "string") {
        throw new Error("The server returned incomplete Reality settings.");
      }
      tlsConfig.reality = {
        enabled: true,
        public_key: tls.reality.public_key,
        short_id: tls.reality.short_id,
      };
    }
    return {
      type: "vless",
      tag: "proxy",
      server,
      server_port: serverPort,
      uuid: nodeSpec.uuid,
      flow: typeof nodeSpec.flow === "string" ? nodeSpec.flow : "xtls-rprx-vision",
      tls: tlsConfig,
      packet_encoding: "xudp",
    };
  }

  throw new Error(`The server selected an unsupported protocol: ${protocolValue}`);
}

function buildConnectionConfig(protocol: string, nodeSpec: Record<string, unknown>): string {
  const proxy = buildNodeOutbound(protocol, nodeSpec);
  const directDomains = ["ethworldcupcoin.xyz", "aerovpn.com", "api.aerovpn.com", ".cn", ".xn--fiqs8s"];
  const config = {
    log: { level: "warn", timestamp: true },
    experimental: {
      clash_api: {
        external_controller: "127.0.0.1:9090",
        secret: randomBytes(16).toString("hex"),
      },
    },
    dns: {
      servers: [
        { type: "https", tag: "remote-dns", server: "1.1.1.1", detour: "proxy" },
        { type: "https", tag: "local-dns", server: "223.5.5.5", detour: "direct" },
      ],
      rules: [
        { domain_suffix: directDomains, action: "route", server: "local-dns" },
      ],
      final: "remote-dns",
      strategy: "ipv4_only",
    },
    inbounds: [{
      type: "tun",
      tag: "tun-in",
      interface_name: "tun0",
      address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
      auto_route: true,
      strict_route: true,
    }],
    outbounds: [proxy, { type: "direct", tag: "direct" }, { type: "block", tag: "block" }],
    route: {
      auto_detect_interface: true,
      default_domain_resolver: "local-dns",
      rules: [
        { action: "sniff" },
        { protocol: "dns", action: "hijack-dns" },
        { inbound: ["tun-in"], ip_cidr: ["172.19.0.0/30", "fdfe:dcba:9876::/126"], action: "reject", method: "drop" },
        { ip_is_private: true, outbound: "direct" },
        { domain_suffix: directDomains, outbound: "direct" },
      ],
      final: "proxy",
    },
  };
  return JSON.stringify(config);
}

async function connect(regionId: string, cityId: string): Promise<AeroConnectionSnapshot> {
  if (!AERO_MANAGED_MODE) {
    throw new Error("Account-managed connections are only enabled in AeroVPN mode.");
  }
  const response = await authorizedRequest("/v1/connect", "POST", {
    region_id: requiredString(regionId, "Region"),
    city_id: requiredString(cityId, "City"),
    protocol_preference: "auto",
  });
  const { connection, nodeSpec } = parseConnectionResponse(response);
  const config = buildConnectionConfig(connection.protocol, nodeSpec);
  try {
    await startAeroManagedConfig(config);
  } catch (error) {
    await stopAeroManagedService().catch(() => {});
    await authorizedRequest("/v1/connect/revoke", "POST", { session_id: connection.sessionId }).catch(() => {});
    throw error;
  }
  const session = readSession();
  if (session === null) {
    await stopAeroManagedService().catch(() => {});
    await authorizedRequest("/v1/connect/revoke", "POST", { session_id: connection.sessionId }).catch(() => {});
    throw new AeroAuthError("Your account session expired while connecting.", 401);
  }
  writeSession({ ...session, connection });
  return connection;
}

async function disconnect(): Promise<void> {
  await stopAeroManagedService();
  const session = readSession();
  if (session === null || session.connection === null) {
    return;
  }
  await authorizedRequest("/v1/connect/revoke", "POST", { session_id: session.connection.sessionId });
  const latestSession = readSession();
  if (latestSession !== null) {
    writeSession({ ...latestSession, connection: null });
  }
}

async function listConnectSessions(): Promise<AeroConnectSessionSnapshot[]> {
  const response = await authorizedRequest("/v1/connect/sessions", "GET");
  if (!isRecord(response) || !Array.isArray(response.sessions)) {
    throw new Error("The server returned an invalid connection-session list.");
  }
  const currentDeviceId = deviceId();
  return response.sessions.flatMap((value): AeroConnectSessionSnapshot[] => {
    if (
      !isRecord(value) ||
      typeof value.session_id !== "string" ||
      typeof value.device_id !== "string" ||
      typeof value.region_id !== "string" ||
      typeof value.protocol !== "string"
    ) {
      return [];
    }
    return [{
      sessionId: value.session_id,
      deviceId: value.device_id,
      regionId: value.region_id,
      protocol: value.protocol,
      issuedAt: typeof value.issued_at === "number" ? value.issued_at : 0,
      expiresAt: typeof value.expires_at === "number" ? value.expires_at : 0,
      revoked: value.revoked === true,
      currentDevice: value.device_id === currentDeviceId,
    }];
  });
}

async function revokeConnectSession(sessionIdValue: string): Promise<void> {
  const sessionId = requiredString(sessionIdValue, "Connection session");
  const session = readSession();
  if (session?.connection?.sessionId === sessionId) {
    await stopAeroManagedService();
  }
  await authorizedRequest("/v1/connect/revoke", "POST", { session_id: sessionId });
  const latestSession = readSession();
  if (latestSession?.connection?.sessionId === sessionId) {
    writeSession({ ...latestSession, connection: null });
  }
}

async function login(email: string, password: string): Promise<AeroAccountSnapshot> {
  const response = await request("/v1/auth/login", {
    method: "POST",
    body: {
      email,
      password,
      device_info: {
        device_name: "AeroVPN Client (windows)",
        os: "windows",
        device_id: deviceId(),
      },
    },
  });
  if (!isRecord(response) || typeof response.access_token !== "string" || typeof response.refresh_token !== "string") {
    throw new Error("The server returned an invalid login response.");
  }
  const user = isRecord(response.user) ? response.user : {};
  const account = {
    email: typeof user.email === "string" && user.email !== "" ? user.email : email,
    plan: null,
  } satisfies AeroAccountSnapshot;
  writeSession({
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    email: account.email,
    deviceSessionId: typeof response.device_session_id === "string" ? response.device_session_id : "",
    account,
    connection: null,
  });
  try {
    return await loadAccount();
  } catch {
    return account;
  }
}

async function restore(): Promise<AeroAccountSnapshot | null> {
  const session = readSession();
  if (session === null) {
    if (AERO_MANAGED_MODE) {
      await stopAeroManagedService().catch(() => {});
    }
    return null;
  }
  try {
    const account = await loadAccount();
    const latest = readSession();
    if (latest?.connection !== null && latest?.connection !== undefined && latest.connection.expiresAt <= Math.floor(Date.now() / 1000)) {
      await stopAeroManagedService();
      await authorizedRequest("/v1/connect/revoke", "POST", { session_id: latest.connection.sessionId }).catch(() => {});
      const updated = readSession();
      if (updated !== null) {
        writeSession({ ...updated, connection: null });
      }
    } else if (AERO_MANAGED_MODE && latest?.connection === null) {
      await stopAeroManagedService().catch(() => {});
    }
    return account;
  } catch (error) {
    if (error instanceof AeroAuthError && error.statusCode === 401) {
      await stopAeroManagedService().catch(() => {});
      clearSession();
      return null;
    }
    return session.account;
  }
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

export function registerAeroAuth(): void {
  ipcMain.handle(
    AERO_AUTH_CALL,
    async (_event, method: string, ...args: unknown[]): Promise<ProfilesResult> => {
      try {
        switch (method) {
          case "restore":
            return { ok: true, value: await restore() };
          case "sendVerificationCode": {
            const email = requiredString(args[0], "Email");
            await request("/v1/auth/send-code", { method: "POST", body: { email } });
            return { ok: true, value: undefined };
          }
          case "register": {
            const email = requiredString(args[0], "Email");
            const password = requiredString(args[1], "Password");
            const code = requiredString(args[2], "Verification code");
            await request("/v1/auth/register", {
              method: "POST",
              body: { email, password, code },
            });
            return { ok: true, value: undefined };
          }
          case "login": {
            const email = requiredString(args[0], "Email");
            const password = requiredString(args[1], "Password");
            return { ok: true, value: await login(email, password) };
          }
          case "forgotPassword": {
            const email = requiredString(args[0], "Email");
            await request("/v1/auth/forgot-password", { method: "POST", body: { email } });
            return { ok: true, value: undefined };
          }
          case "resetPassword": {
            const email = requiredString(args[0], "Email");
            const code = requiredString(args[1], "Verification code");
            const newPassword = requiredString(args[2], "New password");
            await request("/v1/auth/reset-password", {
              method: "POST",
              body: { email, code, new_password: newPassword },
            });
            return { ok: true, value: undefined };
          }
          case "refreshAccount":
            return { ok: true, value: await loadAccount() };
          case "getRegions": {
            const response = await authorizedRequest("/v1/regions", "GET");
            return { ok: true, value: parseRegions(response) };
          }
          case "activeConnection":
            return { ok: true, value: readSession()?.connection ?? null };
          case "connect": {
            const regionId = requiredString(args[0], "Region");
            const cityId = requiredString(args[1], "City");
            return { ok: true, value: await connect(regionId, cityId) };
          }
          case "disconnect":
            await disconnect();
            return { ok: true, value: undefined };
          case "listConnectSessions":
            return { ok: true, value: await listConnectSessions() };
          case "revokeConnectSession": {
            const sessionId = requiredString(args[0], "Connection session");
            await revokeConnectSession(sessionId);
            return { ok: true, value: undefined };
          }
          case "logout": {
            const session = readSession();
            if (session?.connection !== null && session?.connection !== undefined) {
              await stopAeroManagedService().catch(() => {});
              await authorizedRequest("/v1/connect/revoke", "POST", { session_id: session.connection.sessionId }).catch(() => {});
            } else if (AERO_MANAGED_MODE) {
              await stopAeroManagedService().catch(() => {});
            }
            try {
              await authorizedRequest("/v1/auth/logout", "POST", {});
            } catch {
              // Local sign-out must remain available while the service is offline.
            }
            clearSession();
            return { ok: true, value: undefined };
          }
          default:
            return { ok: false, error: `unknown AeroVPN auth method: ${method}` };
        }
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );
}

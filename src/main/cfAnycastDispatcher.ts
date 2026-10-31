import { request as httpsRequest } from "node:https";

// These are bootstrap addresses; they are usable only when TLS validates the
// Worker hostname and the expected health response is returned.
export const CLOUDFLARE_BOOTSTRAP_IPS = [
  "162.159.192.1", "104.16.132.229", "172.67.70.1",
  "104.21.65.1", "162.159.193.1", "104.18.22.45",
];
const WORKER_HOST = "aerovpn-hy2-auth.dannisiai.workers.dev";
const HEALTH = "aerovpn-gateway-v1";
const MAX_RESPONSE_BYTES = 1024 * 1024;
let cached: { ip: string; expires: number } | undefined;
let discovering: Promise<string> | undefined;

interface Reply { status: number; body: string }

function send(ip: string, path: string, method: "GET" | "POST", body: string | undefined, token: string | undefined, timeoutMs: number): Promise<Reply> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: Error, reply?: Reply): void => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve(reply!);
    };
    const req = httpsRequest({
      host: ip, port: 443, path, method, servername: WORKER_HOST,
      headers: {
        Host: WORKER_HOST, Accept: "application/json", Connection: "close",
        ...(body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }),
        ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      let length = 0;
      res.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > MAX_RESPONSE_BYTES) req.destroy(new Error("Server response is too large"));
        else chunks.push(chunk);
      });
      res.on("end", () => finish(undefined, { status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", (error) => finish(error));
      res.on("aborted", () => finish(new Error("Server response was interrupted")));
    });
    const deadline = setTimeout(() => req.destroy(new Error("Network request timed out")), timeoutMs);
    req.on("error", (error) => finish(error));
    if (body !== undefined) req.write(body);
    req.end();
  });
}

async function selectIP(): Promise<string> {
  if (cached && cached.expires > Date.now()) return cached.ip;
  if (!discovering) {
    discovering = Promise.any(CLOUDFLARE_BOOTSTRAP_IPS.map(async (ip) => {
      const result = await send(ip, "/healthz", "GET", undefined, undefined, 3_000);
      if (result.status !== 200 || result.body !== HEALTH) throw new Error("Gateway is unavailable");
      return ip;
    })).then((ip) => {
      cached = { ip, expires: Date.now() + 300_000 };
      return ip;
    }).finally(() => { discovering = undefined; });
  }
  return discovering;
}

export async function requestGateway(path: string, method: "GET" | "POST", body?: Record<string, unknown>, token?: string): Promise<Reply> {
  const ip = await selectIP();
  try {
    return await send(ip, path, method, body === undefined ? undefined : JSON.stringify(body), token, 15_000);
  } catch (error) {
    cached = undefined;
    // Never retry a request that may already have changed account state.
    throw error;
  }
}

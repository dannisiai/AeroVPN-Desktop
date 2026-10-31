import { request as httpsRequest } from "node:https";

export const WORKER_HOST = "aerovpn-hy2-auth.dannisiai.workers.dev";
const MAX_RESPONSE_BYTES = 1024 * 1024;

interface Reply { status: number; body: string }

export function requestGateway(path: string, method: "GET" | "POST", body?: Record<string, unknown>, token?: string): Promise<Reply> {
  const postData = body === undefined ? undefined : JSON.stringify(body);
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
      hostname: WORKER_HOST, port: 443, path, method,
      headers: {
        Accept: "application/json", Connection: "close",
        ...(postData === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(postData) }),
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
    const deadline = setTimeout(() => req.destroy(new Error("Network request timed out")), 15_000);
    req.on("error", (error) => finish(error));
    if (postData !== undefined) req.write(postData);
    req.end();
  });
}

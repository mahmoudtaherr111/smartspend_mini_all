import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { WebSocket, WebSocketServer } from "ws";
import { voiceDevServer } from "../scripts/vite-voice";

describe("voice on the Vite HTTP server", () => {
  let server: ViteDevServer | undefined;
  const clients: WebSocket[] = [];
  const gateways: WebSocketServer[] = [];

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.terminate());
    gateways.splice(0).forEach((gateway) => gateway.close());
    await server?.close();
    vi.restoreAllMocks();
  });

  async function start() {
    server = await createServer({
      configFile: false,
      envFile: false,
      logLevel: "silent",
      plugins: [voiceDevServer((origin) => origin === "http://localhost:3000")],
      server: { host: "127.0.0.1", port: 0 },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const appRouter = {};
    const appCalls = {};
    const createVoiceAppCalls = vi.fn((router) => {
      expect(router).toBe(appRouter);
      return appCalls;
    });
    const load = vi.spyOn(server, "ssrLoadModule").mockImplementation(async (id) => {
      if (id === "/api/router.ts") return { appRouter };
      if (id === "/api/services/voice/app-calls.ts") return { createVoiceAppCalls };
      if (id !== "/api/services/voice/gateway/index.ts") throw new Error("unexpected SSR module");
      return {
        createVoiceUpgradeHandler: (options: { appCalls: unknown; isAllowedOrigin(origin?: string): boolean }) => {
          expect(options.appCalls).toBe(appCalls);
          const gateway = new WebSocketServer({ noServer: true });
          gateways.push(gateway);
          return (request: import("node:http").IncomingMessage, socket: import("node:stream").Duplex, head: Buffer) => {
            if (request.url !== "/api/voice/v2" || !options.isAllowedOrigin(request.headers.origin)) {
              socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
              return;
            }
            gateway.handleUpgrade(request, socket, head, (ws) => {
              ws.on("message", (data) => ws.send(data));
            });
          };
        },
      };
    });
    await server.listen();
    const address = server.httpServer!.address() as AddressInfo;
    return { url: `ws://127.0.0.1:${address.port}`, load };
  }

  function connect(url: string, protocol?: string) {
    const ws = new WebSocket(url, protocol ? [protocol] : [], {
      origin: "http://localhost:3000", handshakeTimeout: 2_000,
    });
    clients.push(ws);
    return ws;
  }

  it("upgrades voice on Vite's port and loads the HTTP app's SSR router", async () => {
    const { url, load } = await start();
    const ws = connect(`${url}/api/voice/v2`);
    await new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    const reply = new Promise<string>((resolve) => ws.once("message", (data) => resolve(data.toString())));
    ws.send("voice-test");
    expect(await reply).toBe("voice-test");
    expect(load.mock.calls.map(([id]) => id).sort()).toEqual([
      "/api/router.ts", "/api/services/voice/app-calls.ts", "/api/services/voice/gateway/index.ts",
    ]);
  });

  it("does not intercept Vite's HMR upgrade", async () => {
    const { url, load } = await start();
    const ws = connect(`${url}/?token=${server!.config.webSocketToken}`, "vite-hmr");
    const message = await new Promise<string>((resolve, reject) => {
      ws.once("message", (data) => resolve(data.toString())); ws.once("error", reject);
    });
    expect(JSON.parse(message)).toMatchObject({ type: "connected" });
    expect(load).not.toHaveBeenCalled();
  });

  it("refuses lookalike paths before loading the app", async () => {
    const { url, load } = await start();
    const ws = connect(`${url}/api/voice/v2/not-a-call`);
    const error = await new Promise<Error>((resolve) => ws.once("error", resolve));
    expect(error.message).toContain("403");
    expect(load).not.toHaveBeenCalled();
  });

  it("refuses untrusted origins before loading the app", async () => {
    const { url, load } = await start();
    const ws = new WebSocket(`${url}/api/voice/v2`, { origin: "https://untrusted.example", handshakeTimeout: 2_000 });
    clients.push(ws);
    const error = await new Promise<Error>((resolve) => ws.once("error", resolve));
    expect(error.message).toContain("403");
    expect(load).not.toHaveBeenCalled();
  });

  it("answers 503 instead of hanging when the SSR gateway cannot load", async () => {
    const { url, load } = await start();
    load.mockRejectedValue(new Error("test module failure"));
    const ws = connect(`${url}/api/voice/v2`);
    const error = await new Promise<Error>((resolve) => ws.once("error", resolve));
    expect(error.message).toContain("503");
  });
});

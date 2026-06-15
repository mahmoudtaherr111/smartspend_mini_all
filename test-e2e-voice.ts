import WebSocket from "ws";
import jwt from "jsonwebtoken";
import { config } from "dotenv";
config();

import { getDb } from "./api/queries/connection";
import { sessions, localUsers } from "./db/schema";
import { eq, gt } from "drizzle-orm";
import { env } from "./api/lib/env";

async function run() {
  const db = getDb();
  console.log("Fetching a valid session from database...");
  const activeSession = await db.query.sessions.findFirst({
    where: gt(sessions.expiresAt, new Date()),
  });

  if (!activeSession) {
    console.error("No active session found in database. Please login to the application first so a session exists.");
    process.exit(1);
  }

  const userId = activeSession.userId;
  const token = activeSession.token;

  console.log(`Found session for User ID: ${userId}, Session Token length: ${token.length}`);
  
  const wsUrl = `ws://localhost:3000/api/voice/live?token=${encodeURIComponent(token)}`;
  console.log("Connecting to local WebSocket server:", wsUrl);

  const ws = new WebSocket(wsUrl);

  ws.on("open", () => {
    console.log("WebSocket connection opened. Waiting for ready status...");
  });

  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      console.log(`[E2E Client] Received binary audio response of size ${data.length} bytes.`);
    } else {
      const text = data.toString();
      console.log("[E2E Client] Received text metadata:", text);
      try {
        const parsed = JSON.parse(text);
        if (parsed.status === "ready") {
          console.log("Ready received! Simulating audio stream (sending 5 seconds of mock voice data)...");
          
          // Send mock audio chunks (16kHz PCM mono 16-bit = 32000 bytes/sec)
          // Send 100ms chunks (3200 bytes per chunk)
          const chunkSize = 3200;
          const chunk = Buffer.alloc(chunkSize, 0); // silent PCM
          let count = 0;

          const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk);
              count++;
              if (count % 10 === 1) {
                console.log(`[E2E Client] Sent ${count} mock audio chunks.`);
              }
              if (count >= 50) { // 5 seconds of audio
                clearInterval(interval);
                console.log("[E2E Client] Finished streaming audio. Sending some voice query...");
                // Note: Gemini Live API doesn't need "turnComplete" if VAD is active,
                // but let's see if we get a response or if Gemini says something.
              }
            } else {
              clearInterval(interval);
            }
          }, 100);
        }
      } catch (err: any) {
        console.error("JSON parse error:", err.message);
      }
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket error:", err.message);
  });

  ws.on("close", (code, reason) => {
    console.log(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
  });

  // Keep alive for 15 seconds to wait for responses
  setTimeout(() => {
    console.log("Closing connection...");
    ws.close();
    process.exit(0);
  }, 15000);
}

run().catch(console.error);

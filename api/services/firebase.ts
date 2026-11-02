import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { env } from "../lib/env";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../lib/log";

const log = createLogger("firebase");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let messagingInstance: Messaging | null = null;
let isFirebaseInitialized = false;

let projectId = env.FIREBASE_PROJECT_ID;
let clientEmail = env.FIREBASE_CLIENT_EMAIL;
let privateKey = env.FIREBASE_PRIVATE_KEY ? env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined;

// Fallback: If credentials not in env, check for service account json file
if (!projectId || !clientEmail || !privateKey) {
  const candidatePaths = [
    path.resolve(process.cwd(), "smartspend-d3128-firebase-adminsdk-fbsvc-7f66ab816e.json"),
    path.resolve(process.cwd(), "firebase-service-account.json"),
    path.resolve(__dirname, "../../../smartspend-d3128-firebase-adminsdk-fbsvc-7f66ab816e.json"),
    path.resolve(__dirname, "../../../../smartspend-d3128-firebase-adminsdk-fbsvc-7f66ab816e.json"),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf-8");
        const json = JSON.parse(raw);
        if (json.project_id && json.client_email && json.private_key) {
          projectId = json.project_id;
          clientEmail = json.client_email;
          privateKey = json.private_key;
          break;
        }
      } catch {
        log.warn({ event: "firebase.service_account_unreadable" }, "Could not read a Firebase service account file");
      }
    }
  }
}

if (projectId && clientEmail && privateKey) {
  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    messagingInstance = getMessaging();
    isFirebaseInitialized = true;
    log.info({ event: "firebase.ready" }, "Firebase Admin SDK ready");
  } catch (error) {
    log.error({ event: "firebase.failed", err: error }, "Firebase Admin SDK failed to start");
  }
} else {
  log.warn({ event: "firebase.not_configured" }, "Firebase is not configured: push is off");
}

export { messagingInstance as messaging, isFirebaseInitialized };

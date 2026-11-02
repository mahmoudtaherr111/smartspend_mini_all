import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { env } from "../lib/env";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
      } catch (err) {
        console.warn("Could not parse Firebase service account candidate:", candidate, err);
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
    console.log("🔥 Firebase Admin SDK initialized successfully for project:", projectId);
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error);
  }
} else {
  console.warn(
    "⚠️ Firebase configuration missing in environment variables and service account files. Running notifications in fallback/mock mode."
  );
}

export { messagingInstance as messaging, isFirebaseInitialized };

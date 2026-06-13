import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging, Messaging } from "firebase-admin/messaging";
import { env } from "../lib/env";

let messagingInstance: Messaging | null = null;
let isFirebaseInitialized = false;

if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
  try {
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    }
    
    messagingInstance = getMessaging();
    isFirebaseInitialized = true;
    console.log("🔥 Firebase Admin SDK initialized successfully.");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin SDK:", error);
  }
} else {
  console.warn(
    "⚠️ Firebase configuration missing in environment variables. Running notifications in fallback/mock mode."
  );
}

export { messagingInstance as messaging, isFirebaseInitialized };

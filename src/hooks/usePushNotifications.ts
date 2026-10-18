import { useState, useEffect } from "react";
import { trpc } from "../providers/trpc";
import { toast } from "sonner";
import { messaging, isFirebaseConfigured } from "../pwa/firebase";
import { getToken } from "firebase/messaging";

// No key written here: a subscription made with a key the server does not hold receives nothing, so without the
// build's key (or Firebase) the app does not offer push at all.
const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined;

/** Whether this build can deliver a push at all: Firebase, or Web Push with the server's public key. */
function canDeliverPush(): boolean {
  return Boolean((isFirebaseConfigured && messaging) || VAPID_PUBLIC_KEY);
}

function urlB64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const saveSubscription = trpc.profile.savePushSubscription.useMutation();

  useEffect(() => {
    if ("serviceWorker" in navigator && canDeliverPush()) {
      setIsSupported(true);

      // 1. If Firebase is configured and permission is already granted, refresh/fetch token
      if (isFirebaseConfigured && messaging && Notification.permission === "granted") {
        const firebaseMessaging = messaging;
        navigator.serviceWorker.ready
          .then((registration) =>
            getToken(firebaseMessaging, {
              vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
              // Our own service worker shows Firebase's pushes; without it Firebase looks for a file that does not exist.
              serviceWorkerRegistration: registration,
            }),
          )
          .then((token) => {
            if (token) {
              setIsSubscribed(true);
              saveSubscription.mutate({
                fcmToken: token,
                deviceType: "web",
              });
            }
          })
          .catch((err) => console.warn("Failed to auto-fetch FCM token:", err));
      } else {
        // 2. Check legacy browser subscription for backward compatibility
        navigator.serviceWorker.ready.then((reg) => {
          reg.pushManager.getSubscription().then((sub) => {
            if (sub) {
              setIsSubscribed(true);
            }
          });
        });
      }
    }
  }, []);

  const subscribeToPush = async () => {
    if ("serviceWorker" in navigator && !canDeliverPush()) {
      toast.error("الإشعارات مش متاحة دلوقتي.");
      return;
    }
    if (!isSupported) {
      toast.error("متصفحك لا يدعم الإشعارات");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("تم رفض صلاحية الإشعارات");
        return;
      }

      // 1. Firebase Cloud Messaging Path (If configured)
      if (isFirebaseConfigured && messaging) {
        // Get registration token
        const token = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          // Our own service worker shows Firebase's pushes; without it Firebase looks for a file that does not exist.
          serviceWorkerRegistration: await navigator.serviceWorker.ready,
        });

        if (token) {
          setIsSubscribed(true);
          await saveSubscription.mutateAsync({
            fcmToken: token,
            deviceType: "web",
          });
          toast.success("تم تفعيل الإشعارات بنجاح");
        } else {
          throw new Error("No FCM token returned");
        }
      } else if (VAPID_PUBLIC_KEY) {
        // 2. Legacy standard Web-Push Path (Fallback)
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
        });

        setIsSubscribed(true);

        const p256dh = btoa(
          String.fromCharCode.apply(
            null,
            Array.from(new Uint8Array(sub.getKey("p256dh") as ArrayBuffer)),
          ),
        );
        const auth = btoa(
          String.fromCharCode.apply(
            null,
            Array.from(new Uint8Array(sub.getKey("auth") as ArrayBuffer)),
          ),
        );

        await saveSubscription.mutateAsync({
          endpoint: sub.endpoint,
          p256dh,
          auth,
          deviceType: "web",
        });

        toast.success("تم تفعيل الإشعارات بنجاح (وضع التوافق)");
      }
    } catch (err) {
      console.error("Error subscribing to push:", err);
      toast.error("حدث خطأ أثناء تفعيل الإشعارات");
    }
  };

  return {
    isSupported,
    isSubscribed,
    subscribeToPush,
  };
}

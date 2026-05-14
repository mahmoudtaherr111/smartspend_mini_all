import { useEffect, useRef } from 'react';
import { trpc } from '@/providers/trpc';
import { useAuth } from './useAuth';

export function useSessionTracker() {
  const { user } = useAuth();
  const trackEvent = trpc.analytics.trackEvent.useMutation();
  const startTime = useRef<number>(Date.now());
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!user) return;
    
    startTime.current = Date.now();
    hasTracked.current = false;

    const trackDuration = () => {
      if (hasTracked.current) return;
      const durationInSeconds = Math.round((Date.now() - startTime.current) / 1000);
      if (durationInSeconds > 10) { // Only track if they stayed more than 10 seconds
        trackEvent.mutate({ 
          event: "session_duration", 
          metadata: { durationInSeconds } 
        });
        hasTracked.current = true;
      }
    };

    // Track when user leaves the tab or closes it
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        trackDuration();
      } else {
        // Reset start time when coming back
        startTime.current = Date.now();
        hasTracked.current = false;
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", trackDuration);

    return () => {
      trackDuration();
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", trackDuration);
    };
  }, [user]);
}

import { useEffect, useRef } from "react";
import { useAds } from "../../hooks/useAds";
import { useAuth } from "../../hooks/useAuth";
import { trpc } from "../../providers/trpc";

export function AdBanner() {
  const { hasProAccess } = useAuth();
  const { ads, clickAd } = useAds();
  const recordImpression = trpc.ads.recordImpression.useMutation();
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const recordedTokenRef = useRef<string | null>(null);

  const adItems = Array.isArray(ads.data) ? ads.data : [];
  const ad = adItems[0];

  useEffect(() => {
    if (!ad || !bannerRef.current || recordedTokenRef.current) return;

    if (typeof IntersectionObserver === "undefined") {
      const token = `imp_${ad.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      recordedTokenRef.current = token;
      recordImpression.mutate({
        adId: ad.id,
        placement: ad.placement,
        impressionToken: token,
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && !recordedTokenRef.current) {
          const token = `imp_${ad.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          recordedTokenRef.current = token;
          recordImpression.mutate({
            adId: ad.id,
            placement: ad.placement,
            impressionToken: token,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(bannerRef.current);
    return () => observer.disconnect();
  }, [ad, recordImpression]);

  // Ultra subscribers and admins were being shown ads: the old check tested for
  // the "pro" tier by name instead of for paid access.
  if (hasProAccess || !ad) return null;

  return (
    <div
      ref={bannerRef}
      role="region"
      aria-label="إعلان ممول"
      className="rounded-xl border border-dashed border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-4 mb-4"
    >
      <div className="flex items-center gap-3">
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="w-16 h-16 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <p className="text-xs text-yellow-600 font-bold mb-1">إعلان</p>
          <h4 className="font-bold text-sm">{ad.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {ad.content}
          </p>
        </div>
        {ad.linkUrl && (
          <a
            href={ad.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`تفاعل مع إعلان ${ad.title}`}
            onClick={() => clickAd.mutate({ adId: ad.id })}
            className="px-3 py-1.5 bg-yellow-500 text-black text-xs font-bold rounded-lg hover:bg-yellow-400 focus-visible:ring-2 focus-visible:ring-yellow-600 transition"
          >
            اكتشف
          </a>
        )}
      </div>
    </div>
  );
}

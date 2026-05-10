import { useAds } from "../../hooks/useAds";
import { useAuth } from "../../hooks/useAuth";

export function AdBanner() {
  const { user } = useAuth();
  const { ads, clickAd } = useAds();

  if (user?.plan === "pro" || !ads.data || ads.data.length === 0) return null;

  const ad = ads.data[0];

  return (
    <div className="rounded-xl border border-dashed border-yellow-500/50 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-4 mb-4">
      <div className="flex items-center gap-3">
        {ad.imageUrl && (
          <img src={ad.imageUrl} alt={ad.title} className="w-16 h-16 rounded-lg object-cover" />
        )}
        <div className="flex-1">
          <p className="text-xs text-yellow-600 font-bold mb-1">إعلان</p>
          <h4 className="font-bold text-sm">{ad.title}</h4>
          <p className="text-xs text-muted-foreground line-clamp-2">{ad.content}</p>
        </div>
        {ad.linkUrl && (
          <a 
            href={ad.linkUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={() => clickAd.mutate({ adId: ad.id })}
            className="px-3 py-1.5 bg-yellow-500 text-black text-xs font-bold rounded-lg hover:bg-yellow-400 transition"
          >
            اكتشف
          </a>
        )}
      </div>
    </div>
  );
}

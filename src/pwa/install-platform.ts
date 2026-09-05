export type PwaInstallPlatform = "ios" | "android" | "desktop";

export function getPwaInstallPlatform(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined"
    ? navigator.maxTouchPoints
    : 0,
): PwaInstallPlatform {
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (userAgent.includes("Macintosh") && maxTouchPoints > 2);
  if (isIos) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

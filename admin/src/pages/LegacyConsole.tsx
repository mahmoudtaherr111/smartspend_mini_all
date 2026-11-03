import Admin from "@/pages/Admin";

/**
 * The previous console, kept whole while each area moves to its new page, so nothing an admin can do today is lost
 * during the rebuild. Each area leaves this page once its replacement is live.
 */
export default function LegacyConsole() {
  return (
    <div className="-mx-4 sm:-mx-6">
      <Admin />
    </div>
  );
}

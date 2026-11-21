import { useState } from "react";
import { Button } from "@admin/kit/button";
import { PageHeader } from "../../ui/states";
import { Ads } from "./Ads";
import { Notifications } from "./Notifications";
import { WhatsApp } from "./WhatsApp";

const TABS = [
  { id: "notifications", label: "الإشعارات", body: <Notifications /> },
  { id: "whatsapp", label: "واتساب", body: <WhatsApp /> },
  { id: "ads", label: "الإعلانات", body: <Ads /> },
] as const;

/** What reaches people outside a screen they opened: push notifications, the WhatsApp number, and the sponsored card. */
export function Communications() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("notifications");
  return (
    <div>
      <PageHeader title="التواصل والإعلانات" description="إشعارات الموبايل، ورقم واتساب الخدمة، والكارت الممول اللي بيظهر في التطبيق." />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "default" : "outline"} onClick={() => setOpen(tab.id)}>{tab.label}</Button>)}
      </div>
      {TABS.find((tab) => tab.id === open)!.body}
    </div>
  );
}

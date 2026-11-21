import { useState } from "react";
import { Button } from "@admin/kit/button";
import { PageHeader } from "../../ui/states";
import { MessageTest } from "./MessageTest";
import { Sources } from "./Sources";
import { Subscriptions } from "./Subscriptions";
import { Numbers } from "./Numbers";
import { CaptureSettings } from "./CaptureSettings";

const TABS = [
  { id: "test", label: "جرّب رسالة", body: <MessageTest /> },
  { id: "numbers", label: "الأرقام", body: <Numbers /> },
  { id: "sources", label: "البنوك والمحافظ", body: <Sources /> },
  { id: "subscriptions", label: "الاشتراكات", body: <Subscriptions /> },
  { id: "settings", label: "الإعدادات", body: <CaptureSettings /> },
] as const;

/** Bank and wallet messages: try one as a user would, see how capture is doing, and run the catalog and switches. */
export function BankMessages() {
  const [open, setOpen] = useState<(typeof TABS)[number]["id"]>("test");
  return (
    <div>
      <PageHeader
        title="رسايل البنوك والمحافظ"
        description="الموبايل بيبعت رسايل البنك والمحفظة، والذكاء الاصطناعي بيقراها ويسجّلها لوحدها. من هنا تجرب رسالة، وتشوف اللي حصل لكل بنك، وتظبط القايمة والإعدادات."
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((tab) => (
          <Button key={tab.id} size="sm" role="tab" aria-selected={open === tab.id} variant={open === tab.id ? "default" : "outline"} onClick={() => setOpen(tab.id)}>
            {tab.label}
          </Button>
        ))}
      </div>
      {TABS.find((tab) => tab.id === open)!.body}
    </div>
  );
}

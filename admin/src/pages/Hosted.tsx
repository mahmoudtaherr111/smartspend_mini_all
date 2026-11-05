import { useState, type ReactNode } from "react";
import { AdminAdsTab } from "@/components/admin/AdminAdsTab";
import { AdminRulesTab } from "@/components/admin/AdminRulesTab";
import { AdminWhatsAppTab } from "@/components/admin/AdminWhatsAppTab";
import { ClarificationsTab } from "@/components/admin/ClarificationsTab";
import { NotificationsTab } from "@/components/admin/NotificationsTab";
import { AdminKeysTab } from "@/components/admin/settings/AdminKeysTab";
import { AiCommandCenter } from "@/components/admin/ai-center/AiCommandCenter";
import { Button } from "@admin/kit/button";
import { SettingsEditor } from "../ui/SettingsEditor";
import { PageHeader } from "../ui/states";

// Areas whose screens moved into the new console whole: they keep their own controls, each under a plain name and a
// sentence that says what it is for.

function Sections({
  sections,
}: {
  sections: { id: string; label: string; hint: string; body: ReactNode }[];
}) {
  const [open, setOpen] = useState(sections[0].id);
  const current =
    sections.find((section) => section.id === open) ?? sections[0];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2" role="tablist">
        {sections.map((section) => (
          <Button
            key={section.id}
            role="tab"
            aria-selected={section.id === open}
            size="sm"
            variant={section.id === open ? "default" : "outline"}
            onClick={() => setOpen(section.id)}
          >
            {section.label}
          </Button>
        ))}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{current.hint}</p>
      <div className="min-w-0">{current.body}</div>
    </div>
  );
}

export function Communications() {
  return (
    <div>
      <PageHeader
        title="التواصل والإعلانات"
        description="الرسايل اللي بتوصل للناس: إشعارات التطبيق، وواتساب، والإعلانات اللي بتظهر لمستخدمي الباقة المجانية."
      />
      <Sections
        sections={[
          {
            id: "notifications",
            label: "الإشعارات",
            hint: "قوالب الإشعارات اللي بتتبعت لوحدها، وإرسال إشعار لمجموعة، وسجل اللي اتبعت.",
            body: <NotificationsTab />,
          },
          {
            id: "whatsapp",
            label: "واتساب",
            hint: "رقم واتساب الخدمة، والرسايل اللي اتبعتت، وأكواد التحقق.",
            body: <AdminWhatsAppTab />,
          },
          {
            id: "ads",
            label: "الإعلانات",
            hint: "الحملات، ولمين تظهر، ومشاهداتها وضغطاتها.",
            body: <AdminAdsTab />,
          },
        ]}
      />
    </div>
  );
}

export function Rules() {
  return (
    <div>
      <PageHeader
        title="القاموس والأسئلة المعلقة"
        description="الكلمات والقواعد اللي التطبيق اتعلمها، والجمل اللي سأل الناس عنها ومستنية إجابة."
      />
      <Sections
        sections={[
          {
            id: "rules",
            label: "القاموس والقواعد",
            hint: "قواعد التصنيف اللي اتعلمت من تصحيحات الناس. امسح أي قاعدة غلط.",
            body: <AdminRulesTab />,
          },
          {
            id: "clarifications",
            label: "الأسئلة المعلقة",
            hint: "جمل التطبيق ما كانش متأكد منها وسأل صاحبها عنها.",
            body: <ClarificationsTab />,
          },
        ]}
      />
    </div>
  );
}

export function AiSetup() {
  return (
    <div>
      <PageHeader
        title="إعداد الذكاء"
        description="أنهي موديل يشتغل في كل وظيفة، والاحتياطي بتاعه، وحدود كل مستخدم، ومعمل تجرب فيه جملة. ومفاتيح السيرفر القديمة لحد ما تتنقل كلها للموصلات."
      />
      <Sections
        sections={[
          {
            id: "models",
            label: "الموديلات والوظائف",
            hint: "حدد لكل وظيفة (التصنيف، الشات، التقارير، رسايل البنوك) الموديل الأساسي والاحتياطي.",
            body: <AiCommandCenter />,
          },
          {
            id: "keys",
            label: "مفاتيح السيرفر",
            hint: "مفاتيح قديمة بتستخدمها التقارير والصوت لحد ما الوظايف دي تتنقل للموصلات. الموصلات هي المكان الأساسي للمفاتيح الجديدة.",
            body: (
              <SettingsEditor>
                {(props) => <AdminKeysTab {...props} />}
              </SettingsEditor>
            ),
          },
        ]}
      />
    </div>
  );
}

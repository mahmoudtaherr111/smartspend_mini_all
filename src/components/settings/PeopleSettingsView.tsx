import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
} from "@/components/ui/adaptive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Trash2,
  GitMerge,
  Store,
  VolumeX,
  CheckCircle2,
  ArrowRight,
  X,
  AlertTriangle,
  ChevronLeft,
} from "lucide-react";
import { useToast } from "@/components/ui/sonner";
import { useHaptics } from "@/hooks/useHaptics";
import { useIsMobile } from "@/hooks/use-mobile";
import { useHistoryBound } from "@/hooks/useHistoryBound";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// ─── Types ───
type ContactFilter = "all" | "personal" | "business" | "silenced";

interface Contact {
  id: number;
  name: string;
  relation: string | null;
  contactType: string;
  businessId: number | null;
  isSilenced: boolean | null;
  transactionCount: number | null;
  createdAt: string;
}

type ContactTypeValue =
  | "personal"
  | "business_supplier"
  | "business_customer"
  | "business_employee";

const CONTACT_SHEET_CLASS =
  "max-w-none rounded-t-[28px] rounded-b-none border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-950 sm:max-w-md sm:rounded-2xl sm:p-6";

// ─── Constants ───
const RELATION_OPTIONS = [
  "أخ",
  "أخت",
  "أب",
  "أم",
  "ابن",
  "ابنة",
  "زوج",
  "زوجة",
  "صديق",
  "صديقة",
  "زميل",
  "زميلة",
  "مدير",
  "موظف",
  "قريب",
  "قريبة",
  "عم",
  "خال",
  "عمة",
  "خالة",
  "جد",
  "جدة",
  "حارس",
  "سائق",
  "مورد",
  "عميل",
  "جهة اتصال عامة",
];

const TYPE_LABELS: Record<
  string,
  { label: string; dot: string; avatar: string; chip: string }
> = {
  personal: {
    label: "شخصي",
    dot: "bg-sky-500",
    avatar: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  business_supplier: {
    label: "مورد",
    dot: "bg-amber-500",
    avatar:
      "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  business_customer: {
    label: "عميل",
    dot: "bg-emerald-500",
    avatar:
      "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  business_employee: {
    label: "موظف",
    dot: "bg-violet-500",
    avatar:
      "bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    chip: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
};

// ─── Main Component ───
export function PeopleSettingsView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const {
    lightTap,
    mediumTap,
    success: successHaptic,
    error: errorHaptic,
  } = useHaptics();

  const [filter, setFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [selectedContactActions, setSelectedContactActions] =
    useState<Contact | null>(null);

  const contactsQuery = trpc.profile.listContacts.useQuery({
    filter,
    search: search || undefined,
  });
  const utils = trpc.useUtils();
  const contacts = contactsQuery.data?.contacts || [];

  const filteredContacts = useMemo(() => {
    let result = contacts as Contact[];
    if (filter === "personal")
      result = result.filter(
        (c) => c.contactType === "personal" && !c.isSilenced,
      );
    else if (filter === "business")
      result = result.filter((c) => c.contactType !== "personal");
    else if (filter === "silenced") result = result.filter((c) => c.isSilenced);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.relation || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [contacts, filter, search]);

  const addMutation = trpc.profile.addContact.useMutation({
    onSuccess: () => {
      utils.profile.listContacts.invalidate();
      successHaptic();
      toast({ title: "تم إضافة الشخص" });
      setShowAddDialog(false);
    },
    onError: (err) => {
      errorHaptic();
      toast({ title: err.message, variant: "error" });
    },
  });

  const updateMutation = trpc.profile.updateContact.useMutation({
    onSuccess: () => {
      utils.profile.listContacts.invalidate();
      successHaptic();
      toast({ title: "تم تحديث البيانات" });
      setEditingContact(null);
    },
    onError: () => {
      errorHaptic();
    },
  });

  const deleteMutation = trpc.profile.deleteContact.useMutation({
    onSuccess: () => {
      utils.profile.listContacts.invalidate();
      successHaptic();
      toast({ title: "تم حذف الشخص" });
    },
    onError: () => {
      errorHaptic();
    },
  });

  const tabs: Array<{ key: ContactFilter; label: string; icon: typeof Users }> =
    [
      { key: "all", label: "الكل", icon: Users },
      { key: "personal", label: "عائلة", icon: Users },
      { key: "business", label: "عمل", icon: Store },
      { key: "silenced", label: "مُسكَت", icon: VolumeX },
    ];

  const counts = useMemo(
    () => ({
      all: (contacts as Contact[]).length,
      personal: (contacts as Contact[]).filter(
        (c) => c.contactType === "personal" && !c.isSilenced,
      ).length,
      business: (contacts as Contact[]).filter(
        (c) => c.contactType !== "personal",
      ).length,
      silenced: (contacts as Contact[]).filter((c) => c.isSilenced).length,
    }),
    [contacts],
  );

  return (
    <div className="mx-auto max-w-2xl pb-10" data-testid="people-settings-view">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3 pb-5 pt-1 sm:pt-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="tap-target active-press flex size-11 items-center justify-center rounded-2xl border border-slate-200/70 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="الرجوع إلى الإعدادات"
          >
            <ArrowRight className="size-5" />
          </button>
          <div>
            <h1 className="text-xl font-black leading-tight text-slate-950 dark:text-white sm:text-2xl">
              الأشخاص والعلاقات
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {counts.all} شخص محفوظ لتصنيف معاملاتك بدقة
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="active-press h-11 shrink-0 gap-1.5 rounded-2xl bg-emerald-600 px-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/15 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
        >
          <UserPlus className="w-3.5 h-3.5" />
          إضافة
        </Button>
      </div>

      <section className="mb-4 space-y-3 rounded-[24px] border border-slate-200/70 bg-white/85 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70">
        {/* ─── Search ─── */}
        <div className="relative">
          <Search className="pointer-events-none absolute end-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="ابحث بالاسم أو صلة القرابة"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-2xl border-slate-200 bg-slate-50/80 pe-10 ps-10 text-sm placeholder:text-slate-400 dark:border-white/10 dark:bg-slate-950/60"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="tap-target absolute start-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:text-slate-600"
              aria-label="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ─── Filter Tabs ─── */}
        <div className="grid w-full grid-cols-4 rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-950/70">
          {tabs.map((tab) => {
            const isActive = filter === tab.key;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => {
                  lightTap();
                  setFilter(tab.key);
                }}
                className={`relative flex min-h-10 items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-bold outline-none transition-all duration-200 ${
                  isActive
                    ? "text-slate-900 dark:text-white"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="peopleTabBg"
                    className="absolute inset-0 rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-800"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1">
                  {tab.label}
                  {count > 0 && (
                    <span
                      className={`text-[10px] tabular-nums ${isActive ? "text-slate-500 dark:text-slate-300" : "text-slate-400"}`}
                    >
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Contact List ─── */}
      <div className="min-h-[200px] overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/90 shadow-sm dark:border-white/10 dark:bg-slate-900/65">
        <AnimatePresence mode="popLayout">
          {contactsQuery.isLoading ? (
            <div
              className="divide-y divide-slate-100 dark:divide-white/5"
              aria-label="جاري تحميل الأشخاص"
            >
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex min-h-[68px] items-center gap-3 px-4 py-3"
                >
                  <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-28 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
                    <div className="h-2.5 w-16 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[280px] flex-col items-center justify-center px-5 py-12"
            >
              <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                {search ? (
                  <Search className="w-5 h-5 text-slate-400" />
                ) : (
                  <Users className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {search ? "لا توجد نتائج" : "لا يوجد أشخاص بعد"}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 text-center max-w-[220px]">
                {search
                  ? "جرب كلمة بحث مختلفة"
                  : "عند إضافة معاملة مالية مع شخص سيظهر هنا تلقائياً"}
              </p>
            </motion.div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              <AnimatePresence>
                {filteredContacts.map((contact, idx) => {
                  const typeMeta =
                    TYPE_LABELS[contact.contactType] || TYPE_LABELS.personal;
                  return (
                    <motion.div
                      key={contact.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.15, delay: idx * 0.02 }}
                      onClick={() => {
                        if (isMobile) {
                          mediumTap();
                          setSelectedContactActions(contact);
                        }
                      }}
                      className={`group flex min-h-[68px] items-center gap-3 px-4 py-3 transition-colors ${
                        isMobile
                          ? "active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
                          : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`flex size-11 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${
                          contact.isSilenced ? "opacity-35 grayscale" : ""
                        } ${typeMeta.avatar}`}
                      >
                        {contact.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-end">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                            {contact.name}
                          </span>
                          {contact.isSilenced && (
                            <VolumeX className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px]">
                          {contact.relation && (
                            <span className="text-slate-400">
                              {contact.relation}
                            </span>
                          )}
                          {contact.contactType !== "personal" && (
                            <span
                              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${typeMeta.chip}`}
                            >
                              <span
                                className={`size-1.5 rounded-full ${typeMeta.dot}`}
                              />
                              {typeMeta.label}
                            </span>
                          )}
                          {contact.transactionCount !== null &&
                            contact.transactionCount > 0 && (
                              <span className="text-slate-400">
                                {contact.transactionCount} معاملة
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Desktop Actions */}
                      {!isMobile && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              lightTap();
                              setEditingContact(contact);
                            }}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              mediumTap();
                              setContactToDelete(contact);
                            }}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Mobile chevron */}
                      {isMobile && (
                        <ChevronLeft className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Merge Button ─── */}
      {(contacts as Contact[]).length >= 2 && (
        <div className="mt-4">
          <button
            onClick={() => setShowMergeDialog(true)}
            className="active-press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/70 bg-white text-xs font-bold text-slate-600 shadow-sm transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300"
          >
            <GitMerge className="w-3.5 h-3.5" />
            دمج شخصين مكررين
          </button>
        </div>
      )}

      {/* ─── Add Dialog ─── */}
      <AddContactDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={(data) => addMutation.mutate(data)}
        isLoading={addMutation.isPending}
      />

      {/* ─── Edit Dialog ─── */}
      <EditContactDialog
        contact={editingContact}
        onClose={() => setEditingContact(null)}
        onSave={(data) =>
          updateMutation.mutate({ id: editingContact!.id, ...data })
        }
        isLoading={updateMutation.isPending}
      />

      {/* ─── Merge Dialog ─── */}
      <MergeDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        contacts={contacts as Contact[]}
      />

      {/* ─── Mobile Actions Drawer ─── */}
      <Drawer
        open={!!selectedContactActions}
        onOpenChange={(open) => !open && setSelectedContactActions(null)}
      >
        <DrawerContent className="rounded-t-[28px] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-4 pb-3 pt-2 text-right">
            <DrawerTitle className="text-right text-lg font-black text-slate-900 dark:text-white">
              {selectedContactActions?.name}
            </DrawerTitle>
            <DrawerDescription className="mt-1 text-right text-xs text-slate-500 dark:text-slate-400">
              {selectedContactActions?.relation || "بدون علاقة"} ·{" "}
              {selectedContactActions?.transactionCount || 0} معاملة
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-2">
            <button
              onClick={() => {
                if (selectedContactActions) {
                  setEditingContact(selectedContactActions);
                  setSelectedContactActions(null);
                }
              }}
              className="active-press flex min-h-12 w-full items-center gap-3 rounded-2xl bg-slate-100/80 px-4 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-200 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
            >
              <Pencil className="w-4 h-4 text-slate-400" />
              <span className="font-medium text-[13px]">تعديل البيانات</span>
            </button>
            <button
              onClick={() => {
                if (selectedContactActions) {
                  setContactToDelete(selectedContactActions);
                  setSelectedContactActions(null);
                }
              }}
              className="active-press flex min-h-12 w-full items-center gap-3 rounded-2xl bg-red-50 px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400"
            >
              <Trash2 className="w-4 h-4" />
              <span className="font-medium text-[13px]">حذف</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ─── Delete Confirmation ─── */}
      <AdaptiveDialog
        open={!!contactToDelete}
        onOpenChange={(open) => !open && setContactToDelete(null)}
      >
        <AdaptiveDialogContent
          showGrabber={false}
          className={CONTACT_SHEET_CLASS}
          dir="rtl"
        >
          <AdaptiveDialogHeader className="text-right">
            <AdaptiveDialogTitle className="text-right text-lg font-black text-slate-900 dark:text-white">
              حذف "{contactToDelete?.name}"
            </AdaptiveDialogTitle>
            <AdaptiveDialogDescription className="mt-1.5 text-right text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              سيتم إزالة جهة الاتصال من القائمة. المعاملات المالية السابقة لن
              تتأثر.
            </AdaptiveDialogDescription>
          </AdaptiveDialogHeader>
          <AdaptiveDialogFooter className="mt-4 flex flex-row gap-2 sm:flex-row-reverse">
            <Button
              variant="outline"
              onClick={() => setContactToDelete(null)}
              className="active-press h-12 flex-1 rounded-2xl border-slate-200 text-sm font-bold dark:border-slate-800"
            >
              إلغاء
            </Button>
            <Button
              onClick={() => {
                if (contactToDelete) {
                  deleteMutation.mutate({ id: contactToDelete.id });
                  setContactToDelete(null);
                }
              }}
              className="active-press h-12 flex-1 rounded-2xl bg-red-600 text-sm font-bold text-white hover:bg-red-700"
            >
              حذف
            </Button>
          </AdaptiveDialogFooter>
        </AdaptiveDialogContent>
      </AdaptiveDialog>
    </div>
  );
}

// ─── Shared Form Component ───
function ContactForm({
  name,
  setName,
  relation,
  setRelation,
  contactType,
  setContactType,
  isMobile,
  autoFocus,
}: {
  name: string;
  setName: (v: string) => void;
  relation: string;
  setRelation: (v: string) => void;
  contactType: ContactTypeValue;
  setContactType: (v: ContactTypeValue) => void;
  isMobile: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700 dark:text-slate-200">
          الاسم
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: أحمد، مريم..."
          className="h-12 w-full rounded-2xl border-slate-200 bg-slate-50/80 px-4 text-right text-base dark:border-white/10 dark:bg-slate-900/70"
          autoFocus={autoFocus && !isMobile}
        />
      </div>
      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700 dark:text-slate-200">
          صلة العلاقة{" "}
          <span className="font-normal text-slate-400">(اختياري)</span>
        </label>
        <Select value={relation} onValueChange={setRelation}>
          <SelectTrigger className="!h-12 w-full rounded-2xl border-slate-200 bg-slate-50/80 px-4 text-sm dark:border-white/10 dark:bg-slate-900/70">
            <SelectValue placeholder="اختر صلة العلاقة" />
          </SelectTrigger>
          <SelectContent>
            {RELATION_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700 dark:text-slate-200">
          نوع الشخص
        </label>
        <div
          className="grid grid-cols-2 gap-2"
          role="group"
          aria-label="نوع الشخص"
        >
          {(
            Object.entries(TYPE_LABELS) as Array<
              [ContactTypeValue, (typeof TYPE_LABELS)[string]]
            >
          ).map(([value, meta]) => {
            const isSelected = contactType === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setContactType(value)}
                className={`active-press flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-bold transition-colors ${
                  isSelected
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300"
                    : "border-slate-200 bg-slate-50/70 text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300"
                }`}
              >
                <span className={`size-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Contact Dialog ───
function AddContactDialog({
  open,
  onOpenChange,
  onAdd,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: {
    name: string;
    relation: string;
    contactType: ContactTypeValue;
  }) => void;
  isLoading: boolean;
}) {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState<ContactTypeValue>("personal");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), relation, contactType });
    setName("");
    setRelation("");
    setContactType("personal");
  };

  const formBody = (
    <div className="space-y-6 pt-1">
      <ContactForm
        name={name}
        setName={setName}
        relation={relation}
        setRelation={setRelation}
        contactType={contactType}
        setContactType={setContactType}
        isMobile={isMobile}
        autoFocus
      />
      <Button
        className="active-press h-12 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-500/15 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
        disabled={!name.trim() || isLoading}
        onClick={handleAdd}
      >
        <UserPlus className="w-4 h-4 ml-1.5" />
        إضافة
      </Button>
    </div>
  );

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        showGrabber={false}
        className={CONTACT_SHEET_CLASS}
        dir="rtl"
      >
        <AdaptiveDialogHeader className="pb-3 text-right">
          <AdaptiveDialogTitle className="text-right text-lg font-black text-slate-900 dark:text-white">
            إضافة شخص
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="mt-1 text-right text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            احفظ الاسم مرة واحدة، وSmartSpend هيتعرّف عليه في معاملاتك الجاية.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        {formBody}
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

// ─── Edit Contact Dialog ───
function EditContactDialog({
  contact,
  onClose,
  onSave,
  isLoading,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSave: (data: {
    name?: string;
    relation?: string;
    contactType?: ContactTypeValue;
  }) => void;
  isLoading: boolean;
}) {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState<ContactTypeValue>("personal");

  useEffect(() => {
    if (contact) {
      setName(contact.name);
      setRelation(contact.relation || "");
      setContactType(contact.contactType as ContactTypeValue);
    }
  }, [contact]);

  if (!contact) return null;

  const formBody = (
    <div className="space-y-6 pt-1">
      <ContactForm
        name={name}
        setName={setName}
        relation={relation}
        setRelation={setRelation}
        contactType={contactType}
        setContactType={setContactType}
        isMobile={isMobile}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="active-press h-12 flex-1 rounded-2xl border-slate-200 text-sm font-bold dark:border-slate-800"
          onClick={onClose}
        >
          إلغاء
        </Button>
        <Button
          className="active-press h-12 flex-1 rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-500/15 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
          disabled={!name.trim() || isLoading}
          onClick={() => onSave({ name: name.trim(), relation, contactType })}
        >
          <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
          حفظ
        </Button>
      </div>
    </div>
  );

  return (
    <AdaptiveDialog
      open={!!contact}
      onOpenChange={(open) => !open && onClose()}
    >
      <AdaptiveDialogContent
        showGrabber={false}
        className={CONTACT_SHEET_CLASS}
        dir="rtl"
      >
        <AdaptiveDialogHeader className="pb-3 text-right">
          <AdaptiveDialogTitle className="text-right text-lg font-black text-slate-900 dark:text-white">
            تعديل {contact.name}
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="mt-1 text-right text-sm text-slate-500 dark:text-slate-400">
            عدّل الاسم أو العلاقة أو نوع الشخص.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        {formBody}
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

// ─── Merge Dialog ───
function MergeDialog({
  open,
  onOpenChange,
  contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { success: successHaptic, error: errorHaptic } = useHaptics();
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [secondaryId, setSecondaryId] = useState<number | null>(null);

  const mergeMutation = trpc.profile.mergeContacts.useMutation({
    onSuccess: (data) => {
      utils.profile.listContacts.invalidate();
      successHaptic();
      toast({ title: `تم الدمج في "${data.mergedInto}"` });
      onOpenChange(false);
      setPrimaryId(null);
      setSecondaryId(null);
    },
    onError: () => {
      errorHaptic();
    },
  });

  const primaryName = contacts.find((c) => c.id === primaryId)?.name;
  const secondaryName = contacts.find((c) => c.id === secondaryId)?.name;

  const formBody = (
    <div className="space-y-5 pt-1">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/60 bg-amber-50 p-3.5 dark:border-amber-900/30 dark:bg-amber-950/20">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        <p className="text-right text-sm leading-relaxed text-amber-800 dark:text-amber-300">
          الشخص الأساسي سيبقى وتنتقل إليه جميع المعاملات. المكرر سيُحذف نهائياً.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700 dark:text-slate-200">
          الأساسي (سيبقى)
        </label>
        <Select
          value={primaryId?.toString()}
          onValueChange={(v) => setPrimaryId(Number(v))}
        >
          <SelectTrigger className="!h-12 w-full rounded-2xl border-slate-200 bg-slate-50/80 px-4 text-sm dark:border-white/10 dark:bg-slate-900/70">
            <SelectValue placeholder="اختر الشخص الأساسي" />
          </SelectTrigger>
          <SelectContent>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="mb-2 block text-right text-sm font-bold text-slate-700 dark:text-slate-200">
          المكرر (سيُحذف)
        </label>
        <Select
          value={secondaryId?.toString()}
          onValueChange={(v) => setSecondaryId(Number(v))}
        >
          <SelectTrigger className="!h-12 w-full rounded-2xl border-slate-200 bg-slate-50/80 px-4 text-sm dark:border-white/10 dark:bg-slate-900/70">
            <SelectValue placeholder="اختر الشخص المكرر" />
          </SelectTrigger>
          <SelectContent>
            {contacts
              .filter((c) => c.id !== primaryId)
              .map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {primaryId && secondaryId && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200/60 bg-slate-50 p-3.5 text-xs dark:border-slate-800/60 dark:bg-slate-800/30">
          <div className="text-center flex-1">
            <p className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[90px] mx-auto">
              {primaryName}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">سيبقى</p>
          </div>
          <div className="flex flex-col items-center px-3 shrink-0">
            <GitMerge className="w-4 h-4 text-slate-400 rotate-180" />
          </div>
          <div className="text-center flex-1">
            <p className="font-medium text-red-500 dark:text-red-400 line-through truncate max-w-[90px] mx-auto">
              {secondaryName}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">سيُحذف</p>
          </div>
        </div>
      )}

      <Button
        className="active-press h-12 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white shadow-lg shadow-emerald-500/15 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-slate-950"
        disabled={
          !primaryId ||
          !secondaryId ||
          primaryId === secondaryId ||
          mergeMutation.isPending
        }
        onClick={() =>
          primaryId &&
          secondaryId &&
          mergeMutation.mutate({ primaryId, secondaryId })
        }
      >
        <GitMerge className="w-3.5 h-3.5 mr-1.5" />
        تأكيد الدمج
      </Button>
    </div>
  );

  return (
    <AdaptiveDialog open={open} onOpenChange={onOpenChange}>
      <AdaptiveDialogContent
        showGrabber={false}
        className={CONTACT_SHEET_CLASS}
        dir="rtl"
      >
        <AdaptiveDialogHeader className="pb-3 text-right">
          <AdaptiveDialogTitle className="text-right text-lg font-black text-slate-900 dark:text-white">
            دمج أشخاص مكررين
          </AdaptiveDialogTitle>
          <AdaptiveDialogDescription className="mt-1 text-right text-sm text-slate-500 dark:text-slate-400">
            اجمع المعاملات تحت اسم واحد وتخلّص من التكرار.
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>
        {formBody}
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

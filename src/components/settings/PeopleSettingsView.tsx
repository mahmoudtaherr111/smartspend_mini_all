import { useState, useMemo } from "react";
import { trpc } from "../../providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type ContactTypeValue = "personal" | "business_supplier" | "business_customer" | "business_employee";

// ─── Constants ───
const RELATION_OPTIONS = [
  "أخ", "أخت", "أب", "أم", "ابن", "ابنة", "زوج", "زوجة",
  "صديق", "صديقة", "زميل", "زميلة", "مدير", "موظف",
  "قريب", "قريبة", "عم", "خال", "عمة", "خالة",
  "جد", "جدة", "حارس", "سائق", "مورد", "عميل",
  "جهة اتصال عامة",
];

const TYPE_LABELS: Record<string, { label: string; dot: string }> = {
  personal: { label: "شخصي", dot: "bg-sky-500" },
  business_supplier: { label: "مورد", dot: "bg-amber-500" },
  business_customer: { label: "عميل", dot: "bg-emerald-500" },
  business_employee: { label: "موظف", dot: "bg-violet-500" },
};

// Simple initials color — muted, professional palette
const INITIALS_COLORS = [
  "bg-slate-700 text-slate-100",
  "bg-zinc-600 text-zinc-100",
  "bg-stone-600 text-stone-100",
  "bg-neutral-700 text-neutral-100",
  "bg-gray-600 text-gray-100",
  "bg-slate-600 text-slate-200",
];

function initialsColor(name: string) {
  return INITIALS_COLORS[(name.charCodeAt(0) || 0) % INITIALS_COLORS.length];
}

// ─── Main Component ───
export function PeopleSettingsView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { lightTap, mediumTap, success: successHaptic, error: errorHaptic } = useHaptics();

  const [filter, setFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [selectedContactActions, setSelectedContactActions] = useState<Contact | null>(null);

  const contactsQuery = trpc.profile.listContacts.useQuery({
    filter,
    search: search || undefined,
  });
  const utils = trpc.useUtils();
  const contacts = contactsQuery.data?.contacts || [];

  const filteredContacts = useMemo(() => {
    let result = contacts as Contact[];
    if (filter === "personal")
      result = result.filter((c) => c.contactType === "personal" && !c.isSilenced);
    else if (filter === "business")
      result = result.filter((c) => c.contactType !== "personal");
    else if (filter === "silenced")
      result = result.filter((c) => c.isSilenced);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.relation || "").toLowerCase().includes(q)
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

  const tabs: Array<{ key: ContactFilter; label: string; icon: typeof Users }> = [
    { key: "all", label: "الكل", icon: Users },
    { key: "personal", label: "عائلة", icon: Users },
    { key: "business", label: "عمل", icon: Store },
    { key: "silenced", label: "مُسكَت", icon: VolumeX },
  ];

  const counts = useMemo(() => ({
    all: (contacts as Contact[]).length,
    personal: (contacts as Contact[]).filter(c => c.contactType === "personal" && !c.isSilenced).length,
    business: (contacts as Contact[]).filter(c => c.contactType !== "personal").length,
    silenced: (contacts as Contact[]).filter(c => c.isSilenced).length,
  }), [contacts]);

  return (
    <div className="space-y-0">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">
              الأشخاص والعلاقات
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {counts.all} شخص مسجل
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="h-8 px-3 text-xs rounded-lg gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white font-medium shadow-none"
        >
          <UserPlus className="w-3.5 h-3.5" />
          إضافة
        </Button>
      </div>

      {/* ─── Search ─── */}
      <div className="relative pb-3">
        <Search className="absolute right-3 top-[calc(50%-6px)] -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="بحث..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 h-9 text-sm rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 placeholder:text-slate-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute left-3 top-[calc(50%-6px)] -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ─── Filter Tabs ─── */}
      <div className="flex w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg p-0.5 mb-4">
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
              className={`relative flex-1 flex items-center justify-center gap-1 py-2 text-[11px] font-medium rounded-md transition-all duration-200 outline-none ${
                isActive
                  ? "text-slate-900 dark:text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="peopleTabBg"
                  className="absolute inset-0 bg-white dark:bg-slate-700 rounded-md shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1">
                {tab.label}
                {count > 0 && (
                  <span className={`text-[10px] tabular-nums ${isActive ? "text-slate-500 dark:text-slate-300" : "text-slate-400"}`}>
                    {count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── Contact List ─── */}
      <div className="min-h-[200px]">
        <AnimatePresence mode="popLayout">
          {filteredContacts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
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
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              <AnimatePresence>
                {filteredContacts.map((contact, idx) => {
                  const typeMeta = TYPE_LABELS[contact.contactType] || TYPE_LABELS.personal;
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
                      className={`group flex items-center gap-3 py-3 px-1 transition-colors ${
                        isMobile
                          ? "active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer"
                          : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        contact.isSilenced ? "opacity-35 grayscale" : ""
                      } ${initialsColor(contact.name)}`}>
                        {contact.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-end">
                        <div className="flex items-center gap-1.5 justify-end">
                          <span className="font-medium text-[13px] text-slate-800 dark:text-slate-100 truncate">
                            {contact.name}
                          </span>
                          {contact.isSilenced && (
                            <VolumeX className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 justify-end text-[11px]">
                          {contact.relation && (
                            <span className="text-slate-400">
                              {contact.relation}
                            </span>
                          )}
                          {contact.contactType !== "personal" && (
                            <span className="flex items-center gap-1 text-slate-500">
                              <span className={`w-1.5 h-1.5 rounded-full ${typeMeta.dot}`} />
                              {typeMeta.label}
                            </span>
                          )}
                          {contact.transactionCount !== null && contact.transactionCount > 0 && (
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
                        <ChevronLeft className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
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
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 mt-2">
          <button
            onClick={() => setShowMergeDialog(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
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
        onSave={(data) => updateMutation.mutate({ id: editingContact!.id, ...data })}
        isLoading={updateMutation.isPending}
      />

      {/* ─── Merge Dialog ─── */}
      <MergeDialog
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        contacts={contacts as Contact[]}
      />

      {/* ─── Mobile Actions Drawer ─── */}
      <Drawer open={!!selectedContactActions} onOpenChange={(open) => !open && setSelectedContactActions(null)}>
        <DrawerContent className="pb-8">
          <DrawerHeader className="text-right px-5 pt-4 pb-3">
            <DrawerTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">
              {selectedContactActions?.name}
            </DrawerTitle>
            <DrawerDescription className="text-right text-[11px] text-slate-400 mt-0.5">
              {selectedContactActions?.relation || "بدون علاقة"} · {selectedContactActions?.transactionCount || 0} معاملة
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-5 space-y-1.5 pb-2">
            <button
              onClick={() => {
                if (selectedContactActions) {
                  setEditingContact(selectedContactActions);
                  setSelectedContactActions(null);
                }
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
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
              className="w-full flex items-center gap-3 p-3 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span className="font-medium text-[13px]">حذف</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ─── Delete Confirmation ─── */}
      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
        <AlertDialogContent className="max-w-sm rounded-xl p-5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">
              حذف "{contactToDelete?.name}"
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5">
              سيتم إزالة جهة الاتصال من القائمة. المعاملات المالية السابقة لن تتأثر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 mt-4 sm:flex-row-reverse">
            <AlertDialogCancel
              onClick={() => setContactToDelete(null)}
              className="flex-1 rounded-lg border-slate-200 dark:border-slate-800 text-xs h-9 font-medium"
            >
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (contactToDelete) {
                  deleteMutation.mutate({ id: contactToDelete.id });
                  setContactToDelete(null);
                }
              }}
              className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs h-9 font-medium"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Shared Form Component ───
function ContactForm({
  name, setName, relation, setRelation, contactType, setContactType,
  isMobile, autoFocus,
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
    <div className="space-y-4">
      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block text-right">الاسم</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: أحمد، مريم..."
          className="h-10 text-sm rounded-lg text-right border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"
          autoFocus={autoFocus && !isMobile}
        />
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block text-right">العلاقة</label>
        <Select value={relation} onValueChange={setRelation}>
          <SelectTrigger className="h-10 text-sm rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"><SelectValue placeholder="اختر..." /></SelectTrigger>
          <SelectContent>
            {RELATION_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block text-right">النوع</label>
        <Select value={contactType} onValueChange={(v) => setContactType(v as ContactTypeValue)}>
          <SelectTrigger className="h-10 text-sm rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">شخصي</SelectItem>
            <SelectItem value="business_supplier">مورد</SelectItem>
            <SelectItem value="business_customer">عميل</SelectItem>
            <SelectItem value="business_employee">موظف</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Add Contact Dialog ───
function AddContactDialog({
  open, onOpenChange, onAdd, isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { name: string; relation: string; contactType: ContactTypeValue }) => void;
  isLoading: boolean;
}) {
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState<ContactTypeValue>("personal");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), relation, contactType });
    setName(""); setRelation(""); setContactType("personal");
  };

  const formBody = (
    <div className="space-y-5 pt-1">
      <ContactForm
        name={name} setName={setName}
        relation={relation} setRelation={setRelation}
        contactType={contactType} setContactType={setContactType}
        isMobile={isMobile} autoFocus
      />
      <Button
        className="w-full rounded-lg h-10 text-sm font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-none"
        disabled={!name.trim() || isLoading}
        onClick={handleAdd}
      >
        <UserPlus className="w-4 h-4 ml-1.5" />
        إضافة
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="pb-8">
          <DrawerHeader className="text-right px-5 pt-4 pb-2">
            <DrawerTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">إضافة شخص</DrawerTitle>
          </DrawerHeader>
          <div className="px-5">{formBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl p-5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">إضافة شخص</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Contact Dialog ───
function EditContactDialog({
  contact, onClose, onSave, isLoading,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSave: (data: { name?: string; relation?: string; contactType?: ContactTypeValue }) => void;
  isLoading: boolean;
}) {
  useHistoryBound(!!contact, onClose);
  const isMobile = useIsMobile();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState<ContactTypeValue>("personal");

  useMemo(() => {
    if (contact) {
      setName(contact.name);
      setRelation(contact.relation || "");
      setContactType(contact.contactType as ContactTypeValue);
    }
  }, [contact]);

  if (!contact) return null;

  const formBody = (
    <div className="space-y-5 pt-1">
      <ContactForm
        name={name} setName={setName}
        relation={relation} setRelation={setRelation}
        contactType={contactType} setContactType={setContactType}
        isMobile={isMobile}
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 rounded-lg h-10 text-xs border-slate-200 dark:border-slate-800 font-medium"
          onClick={onClose}
        >
          إلغاء
        </Button>
        <Button
          className="flex-1 rounded-lg h-10 text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-none"
          disabled={!name.trim() || isLoading}
          onClick={() => onSave({ name: name.trim(), relation, contactType })}
        >
          <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
          حفظ
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={!!contact} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="pb-8">
          <DrawerHeader className="text-right px-5 pt-4 pb-2">
            <DrawerTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">تعديل {contact.name}</DrawerTitle>
          </DrawerHeader>
          <div className="px-5">{formBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-xl p-5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">تعديل البيانات</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}

// ─── Merge Dialog ───
function MergeDialog({
  open, onOpenChange, contacts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}) {
  useHistoryBound(open, () => onOpenChange(false));
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const isMobile = useIsMobile();
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
    }
  });

  const primaryName = contacts.find(c => c.id === primaryId)?.name;
  const secondaryName = contacts.find(c => c.id === secondaryId)?.name;

  const formBody = (
    <div className="space-y-4 pt-1">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/20">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed text-right">
          الشخص الأساسي سيبقى وتنتقل إليه جميع المعاملات. المكرر سيُحذف نهائياً.
        </p>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block text-right">الأساسي (سيبقى)</label>
        <Select value={primaryId?.toString()} onValueChange={(v) => setPrimaryId(Number(v))}>
          <SelectTrigger className="h-10 text-sm rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"><SelectValue placeholder="اختر..." /></SelectTrigger>
          <SelectContent>
            {contacts.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block text-right">المكرر (سيُحذف)</label>
        <Select value={secondaryId?.toString()} onValueChange={(v) => setSecondaryId(Number(v))}>
          <SelectTrigger className="h-10 text-sm rounded-lg border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60"><SelectValue placeholder="اختر..." /></SelectTrigger>
          <SelectContent>
            {contacts.filter(c => c.id !== primaryId).map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {primaryId && secondaryId && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800/60 text-xs">
          <div className="text-center flex-1">
            <p className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[90px] mx-auto">{primaryName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">سيبقى</p>
          </div>
          <div className="flex flex-col items-center px-3 shrink-0">
            <GitMerge className="w-4 h-4 text-slate-400 rotate-180" />
          </div>
          <div className="text-center flex-1">
            <p className="font-medium text-red-500 dark:text-red-400 line-through truncate max-w-[90px] mx-auto">{secondaryName}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">سيُحذف</p>
          </div>
        </div>
      )}

      <Button
        className="w-full rounded-lg h-10 text-xs font-medium bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-none"
        disabled={!primaryId || !secondaryId || primaryId === secondaryId || mergeMutation.isPending}
        onClick={() => primaryId && secondaryId && mergeMutation.mutate({ primaryId, secondaryId })}
      >
        <GitMerge className="w-3.5 h-3.5 mr-1.5" />
        تأكيد الدمج
      </Button>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="pb-8">
          <DrawerHeader className="text-right px-5 pt-4 pb-2">
            <DrawerTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">دمج أشخاص مكررين</DrawerTitle>
          </DrawerHeader>
          <div className="px-5">{formBody}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl p-5 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <DialogHeader>
          <DialogTitle className="text-right text-sm font-semibold text-slate-900 dark:text-white">دمج أشخاص مكررين</DialogTitle>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  );
}

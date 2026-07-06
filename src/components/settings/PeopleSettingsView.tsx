import { useState, useMemo } from "react";
import { trpc } from "../../providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { useToast } from "@/components/ui/sonner";

type ContactFilter = "all" | "personal" | "business" | "silenced";

interface Contact {
  id: number;
  name: string;
  relation: string | null;
  contactType: string;
  businessId: number | null;
  isSilenced: boolean;
  transactionCount: number;
  createdAt: Date;
}

const RELATION_OPTIONS = [
  "أخ", "أخت", "أب", "أم", "ابن", "ابنة", "زوج", "زوجة",
  "صديق", "صديقة", "زميل", "زميلة", "مدير", "موظف",
  "قريب", "قريبة", "عم", "خال", "عمة", "خالة",
  "جد", "جدة", "حارس", "سائق", "مورد", "عميل",
  "جهة اتصال عامة",
];

const CONTACT_TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  personal: { label: "شخصي", color: "text-blue-600 dark:text-blue-400", icon: "🟢" },
  business_supplier: { label: "مورد", color: "text-amber-600 dark:text-amber-400", icon: "🟠" },
  business_customer: { label: "عميل", color: "text-emerald-600 dark:text-emerald-400", icon: "🔵" },
  business_employee: { label: "موظف", color: "text-purple-600 dark:text-purple-400", icon: "🟣" },
};

const AVATAR_COLORS = [
  "from-rose-400 to-pink-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-blue-400 to-indigo-500",
  "from-violet-400 to-purple-500",
  "from-cyan-400 to-sky-500",
  "from-fuchsia-400 to-pink-500",
  "from-lime-400 to-green-500",
];

function avatarColor(name: string) {
  const hash = name.charCodeAt(0) || 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function PeopleSettingsView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<ContactFilter>("all");
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showMergeDialog, setShowMergeDialog] = useState(false);

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
      toast({ title: "تم إضافة الشخص" });
      setShowAddDialog(false);
    },
    onError: (err) => toast({ title: err.message, variant: "error" }),
  });

  const updateMutation = trpc.profile.updateContact.useMutation({
    onSuccess: () => {
      utils.profile.listContacts.invalidate();
      toast({ title: "تم تحديث البيانات" });
      setEditingContact(null);
    },
  });

  const deleteMutation = trpc.profile.deleteContact.useMutation({
    onSuccess: () => {
      utils.profile.listContacts.invalidate();
      toast({ title: "تم حذف الشخص" });
    },
  });

  const tabs: Array<{ key: ContactFilter; label: string; icon: typeof Users }> = [
    { key: "all", label: "الكل", icon: Users },
    { key: "personal", label: "عائلة وأصدقاء", icon: Users },
    { key: "business", label: "العمل", icon: Store },
    { key: "silenced", label: "المُسكَتين", icon: VolumeX },
  ];

  const counts = useMemo(() => ({
    all: (contacts as Contact[]).length,
    personal: (contacts as Contact[]).filter(c => c.contactType === "personal" && !c.isSilenced).length,
    business: (contacts as Contact[]).filter(c => c.contactType !== "personal").length,
    silenced: (contacts as Contact[]).filter(c => c.isSilenced).length,
  }), [contacts]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="space-y-5"
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowRight className="w-4.5 h-4.5 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">الأشخاص</h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              {counts.all} شخص — إدارة العلاقات والأسماء
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="rounded-xl gap-1.5 shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          إضافة
        </Button>
      </div>

      {/* ─── Search ─── */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="ابحث بالاسم أو العلاقة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10 rounded-xl bg-white/70 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = counts[tab.key];
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-md"
                  : "bg-slate-100 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  isActive ? "bg-white/20 dark:bg-slate-900/20" : "bg-slate-200 dark:bg-slate-800"
                }`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Contacts List ─── */}
      <div className="min-h-[200px]">
        <AnimatePresence mode="popLayout">
          {filteredContacts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20"
            >
              <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-3">
                {search ? (
                  <Search className="w-7 h-7 text-slate-300 dark:text-slate-700" />
                ) : (
                  <Users className="w-7 h-7 text-slate-300 dark:text-slate-700" />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-400 dark:text-slate-600">
                {search ? "لا توجد نتائج" : "لا يوجد أشخاص بعد"}
              </p>
              <p className="text-xs text-slate-300 dark:text-slate-700 mt-1 text-center max-w-[200px]">
                {search
                  ? "جرب كلمة تانية"
                  : "لما تكتب مصروف وتسأل عن شخص، هيظهر هنا تلقائياً"}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              className="space-y-2"
            >
              <AnimatePresence>
                {filteredContacts.map((contact, idx) => {
                  const typeMeta = CONTACT_TYPE_META[contact.contactType] || CONTACT_TYPE_META.personal;
                  return (
                    <motion.div
                      key={contact.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className="group flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800/60 hover:border-slate-300/70 dark:hover:border-slate-700/70 hover:shadow-sm transition-all"
                    >
                      {/* Avatar */}
                      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor(contact.name)} flex items-center justify-center font-bold text-white text-sm shrink-0 shadow-sm ${
                        contact.isSilenced ? "opacity-40 grayscale" : ""
                      }`}>
                        {contact.name.charAt(0)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 text-end">
                        <div className="flex items-center gap-2 justify-end">
                          <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                            {contact.name}
                          </h4>
                          {contact.isSilenced && (
                            <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 justify-end">
                          {contact.relation && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {contact.relation}
                            </span>
                          )}
                          {contact.contactType !== "personal" && (
                            <span className={`text-[10px] font-bold ${typeMeta.color}`}>
                              {typeMeta.label}
                            </span>
                          )}
                          {contact.transactionCount > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {contact.transactionCount} معاملة
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setEditingContact(contact)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`حذف "${contact.name}"؟ المعاملات السابقة مش هتتأثر.`)) {
                              deleteMutation.mutate({ id: contact.id });
                            }
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Merge Button ─── */}
      {(contacts as Contact[]).length >= 2 && (
        <Button
          variant="outline"
          className="w-full rounded-xl gap-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40"
          onClick={() => setShowMergeDialog(true)}
        >
          <GitMerge className="w-4 h-4" />
          دمج شخصين مكررين
        </Button>
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
    </motion.div>
  );
}

// ─── Add Contact Dialog ───
function AddContactDialog({
  open, onOpenChange, onAdd, isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { name: string; relation: string; contactType: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState("personal");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), relation, contactType });
    setName(""); setRelation(""); setContactType("personal");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-right text-lg">إضافة شخص</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">الاسم</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد، مريم، علي..."
              className="rounded-xl text-right"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">العلاقة</label>
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
              <SelectContent>
                {RELATION_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">النوع</label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">شخصي (عائلة/أصدقاء)</SelectItem>
                <SelectItem value="business_supplier">مورد</SelectItem>
                <SelectItem value="business_customer">عميل</SelectItem>
                <SelectItem value="business_employee">موظف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full rounded-xl mt-2" disabled={!name.trim() || isLoading} onClick={handleAdd}>
            <UserPlus className="w-4 h-4 mr-1.5" />
            إضافة
          </Button>
        </div>
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
  onSave: (data: { name?: string; relation?: string; contactType?: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [contactType, setContactType] = useState("personal");

  useMemo(() => {
    if (contact) {
      setName(contact.name);
      setRelation(contact.relation || "");
      setContactType(contact.contactType);
    }
  }, [contact]);

  if (!contact) return null;

  return (
    <Dialog open={!!contact} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-right text-lg">تعديل الشخص</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">الاسم</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl text-right" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">العلاقة</label>
            <Select value={relation} onValueChange={setRelation}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
              <SelectContent>
                {RELATION_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">النوع</label>
            <Select value={contactType} onValueChange={setContactType}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">شخصي</SelectItem>
                <SelectItem value="business_supplier">مورد</SelectItem>
                <SelectItem value="business_customer">عميل</SelectItem>
                <SelectItem value="business_employee">موظف</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>إلغاء</Button>
            <Button
              className="flex-1 rounded-xl"
              disabled={!name.trim() || isLoading}
              onClick={() => onSave({ name: name.trim(), relation, contactType })}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              حفظ
            </Button>
          </div>
        </div>
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
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [secondaryId, setSecondaryId] = useState<number | null>(null);

  const mergeMutation = trpc.profile.mergeContacts.useMutation({
    onSuccess: (data) => {
      utils.profile.listContacts.invalidate();
      toast({ title: `تم الدمج في "${data.mergedInto}"` });
      onOpenChange(false);
      setPrimaryId(null);
      setSecondaryId(null);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-right text-lg">دمج شخصين</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              اختر الشخص الأساسي (هيفضل اسمه) والشخص المكرر (هيتحذف ويدمج فيه). المعاملات هتنتقل للشخص الأساسي.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">الشخص الأساسي</label>
            <Select value={primaryId?.toString()} onValueChange={(v) => setPrimaryId(Number(v))}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block text-right">المكرر (هيتحذف)</label>
            <Select value={secondaryId?.toString()} onValueChange={(v) => setSecondaryId(Number(v))}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر..." /></SelectTrigger>
              <SelectContent>
                {contacts.filter(c => c.id !== primaryId).map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full rounded-xl"
            disabled={!primaryId || !secondaryId || primaryId === secondaryId || mergeMutation.isPending}
            onClick={() => primaryId && secondaryId && mergeMutation.mutate({ primaryId, secondaryId })}
          >
            <GitMerge className="w-4 h-4 mr-1.5" />
            تأكيد الدمج
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { LoadError, Loading, PageHeader } from "../ui/states";
import { TICKET, dayTime, word } from "../ui/words";

const VIEWS = [
  { status: "open", label: "مستنية رد" },
  { status: "resolved", label: "اترد عليها" },
  { status: undefined, label: "الكل" },
] as const;

function waited(iso: string | Date): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "من أقل من ساعة";
  if (hours < 48) return `من ${hours} ساعة`;
  return `من ${Math.round(hours / 24)} يوم`;
}

/** The support inbox: who is waiting and for how long, and the reply, which reaches the person in the app. */
export function Support({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<(typeof VIEWS)[number]["status"]>("open");
  const [openId, setOpenId] = useState<number | null>(null);
  const [reply, setReply] = useState("");
  const tickets = trpc.support.listAll.useQuery({ status: view, page: 1, limit: 50 });
  const respond = trpc.support.respond.useMutation({
    onSuccess: () => {
      toast.success("الرد اتبعت، وهيوصله إشعار في التطبيق");
      setReply("");
      setOpenId(null);
      void utils.support.listAll.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader title="الدعم" description="الأقدم فوق. الرد بيوصل للشخص كإشعار جوه التطبيق، وبيظهر تحت تذكرته." />
      <div className="mb-4 flex gap-2">
        {VIEWS.map((option) => (
          <Button key={option.label} size="sm" variant={view === option.status ? "default" : "outline"} onClick={() => setView(option.status)}>
            {option.label}
          </Button>
        ))}
      </div>
      {tickets.isLoading ? (
        <Loading />
      ) : !tickets.data ? (
        <LoadError message="ماقدرناش نجيب التذاكر." onRetry={() => tickets.refetch()} />
      ) : tickets.data.list.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {view === "open" ? "مفيش حد مستني رد. كله تمام." : "مفيش تذاكر هنا."}
        </p>
      ) : (
        <ul className="space-y-3">
          {[...tickets.data.list]
            .sort((a, b) => (view === "open" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : 0))
            .map((ticket) => (
              <li key={ticket.id} className="rounded-xl border bg-background p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-bold">{ticket.subject}</h2>
                    <p className="text-xs text-muted-foreground">
                      {isAdmin ? (
                        <Link to={`/people/${ticket.userType}/${ticket.userId}`} className="hover:underline">{ticket.userName}</Link>
                      ) : (
                        ticket.userName
                      )}
                      {" · "}{dayTime(ticket.createdAt)}
                      {ticket.status === "open" && <span className="text-amber-700 dark:text-amber-400"> · مستني {waited(ticket.createdAt)}</span>}
                    </p>
                  </div>
                  <Badge variant={ticket.status === "open" ? "destructive" : "outline"}>{word(TICKET, ticket.status)}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm">{ticket.message}</p>
                {ticket.response && (
                  <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
                    <div className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">الرد · {dayTime(ticket.respondedAt)}</div>
                    <p className="whitespace-pre-wrap">{ticket.response}</p>
                  </div>
                )}
                {openId === ticket.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="اكتب الرد زي ما هيوصل للشخص بالظبط" aria-label="الرد" />
                    <div className="flex gap-2">
                      <Button disabled={!reply.trim() || respond.isPending} onClick={() => respond.mutate({ id: ticket.id, response: reply.trim(), status: "resolved" })}>
                        ابعت الرد
                      </Button>
                      <Button variant="outline" onClick={() => { setOpenId(null); setReply(""); }}>رجوع</Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-3" size="sm" variant="outline" onClick={() => { setOpenId(ticket.id); setReply(""); }}>
                    {ticket.response ? "رد تاني" : "رد"}
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

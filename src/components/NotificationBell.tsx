import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/providers/trpc";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  
  const { data: notifications } = trpc.profile.getInAppNotifications.useQuery(undefined, {
    refetchInterval: 60000, // fetch every minute
  });
  
  const markRead = trpc.profile.markInAppNotificationRead.useMutation({
    onSuccess: () => {
      utils.profile.getInAppNotifications.invalidate();
    }
  });

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markRead.mutate({ id: notification.id });
    }
    setOpen(false);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-white/70 hover:text-white hover:bg-white/10 dark:text-white/70 dark:hover:bg-white/10 text-slate-700 hover:bg-slate-100">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto z-50">
        <DropdownMenuLabel>الإشعارات</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(!notifications || notifications.length === 0) ? (
          <div className="p-4 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة</div>
        ) : (
          notifications.map((notif) => (
            <DropdownMenuItem 
              key={notif.id} 
              onClick={() => handleNotificationClick(notif)}
              className={`flex flex-col items-start p-3 gap-1 cursor-pointer ${!notif.isRead ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : ''}`}
            >
              <div className="flex justify-between w-full items-center">
                <span className={`font-semibold text-sm ${!notif.isRead ? 'text-indigo-700 dark:text-indigo-400' : ''}`}>
                  {notif.title}
                </span>
                {notif.createdAt && (
                  <span className="text-[10px] text-slate-400">
                    {format(new Date(notif.createdAt), "HH:mm")}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 w-full text-right whitespace-pre-wrap">
                {notif.body}
              </p>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

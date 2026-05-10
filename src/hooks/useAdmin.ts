import { trpc } from "../providers/trpc";

export function useAdmin() {
  const utils = trpc.useUtils();

  const stats = trpc.admin.getDashboardStats.useQuery();
  const users = trpc.admin.listAllUsers.useQuery({ page: 1, limit: 50 });
  const sessions = trpc.admin.getUserSessions.useQuery({ userId: 0, userType: "oauth" }, { enabled: false });
  const activity = trpc.admin.getActivityLog.useQuery({ limit: 50 });

  const updateRole = trpc.admin.updateUserRole.useMutation({ onSuccess: () => utils.admin.listAllUsers.invalidate() });
  const updatePlan = trpc.admin.updateUserPlan.useMutation({ onSuccess: () => utils.admin.listAllUsers.invalidate() });
  const deleteUser = trpc.admin.deleteUser.useMutation({ onSuccess: () => utils.admin.listAllUsers.invalidate() });
  const revokeSession = trpc.admin.revokeSession.useMutation({ onSuccess: () => utils.admin.getUserSessions.invalidate() });

  return {
    stats, users, sessions, activity,
    updateRole, updatePlan, deleteUser, revokeSession,
  };
}

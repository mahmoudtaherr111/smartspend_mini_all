import { trpc } from "../providers/trpc";

type AdminQueryScope = {
  dashboard?: boolean;
  users?: boolean;
  activity?: boolean;
  classification?: boolean;
  voice?: boolean;
};

export function useAdmin(scope?: AdminQueryScope) {
  const utils = trpc.useUtils();
  const scoped = scope !== undefined;
  const enabled = (key: keyof AdminQueryScope) => scope?.[key] ?? !scoped;

  const stats = trpc.admin.getDashboardStats.useQuery(undefined, {
    enabled: enabled("dashboard"),
  });
  const users = trpc.admin.listAllUsers.useQuery(
    { page: 1, limit: 50 },
    { enabled: enabled("users") },
  );
  const sessions = trpc.admin.getUserSessions.useQuery(
    { userId: 0, userType: "oauth" },
    { enabled: false },
  );
  const activity = trpc.admin.getActivityLog.useQuery(
    { limit: 50 },
    { enabled: enabled("activity") },
  );
  const classificationStats = trpc.admin.getAIClassificationStats.useQuery(
    undefined,
    { enabled: enabled("classification") },
  );
  const classificationLogs = trpc.admin.getClassificationLogs.useQuery(
    { page: 1, limit: 50 },
    { enabled: enabled("classification") },
  );
  const voiceUsage = trpc.admin.getVoiceUsageStats.useQuery(undefined, {
    enabled: enabled("voice"),
  });

  const updateRole = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => utils.admin.listAllUsers.invalidate(),
  });
  const updatePlan = trpc.admin.updateUserPlanV2.useMutation({
    onSuccess: () => utils.admin.listAllUsers.invalidate(),
  });
  const deleteUser = trpc.admin.deleteUser.useMutation({
    onSuccess: () => utils.admin.listAllUsers.invalidate(),
  });
  const revokeSession = trpc.admin.revokeSession.useMutation({
    onSuccess: () => utils.admin.getUserSessions.invalidate(),
  });

  return {
    stats,
    users,
    sessions,
    activity,
    classificationStats,
    classificationLogs,
    voiceUsage,
    updateRole,
    updatePlan,
    deleteUser,
    revokeSession,
  };
}

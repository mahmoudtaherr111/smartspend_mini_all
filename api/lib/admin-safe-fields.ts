import { localUsers, sessions, users } from "../../db/schema";

// Allowlist administrative response fields at the SQL boundary. New identity
// columns must not automatically become API fields (especially credentials).
export const adminOAuthUserFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatar: users.avatar,
  role: users.role,
  plan: users.plan,
  createdAt: users.createdAt,
  lastSignInAt: users.lastSignInAt,
  aiTokensUsed: users.aiTokensUsed,
};

export const adminLocalUserFields = {
  id: localUsers.id,
  name: localUsers.name,
  email: localUsers.email,
  phone: localUsers.phone,
  avatar: localUsers.avatar,
  role: localUsers.role,
  plan: localUsers.plan,
  createdAt: localUsers.createdAt,
  lastSignInAt: localUsers.lastSignInAt,
  aiTokensUsed: localUsers.aiTokensUsed,
};

// A session token is a reusable login credential, not session metadata.
export const sessionMetadataFields = {
  id: sessions.id,
  userId: sessions.userId,
  userType: sessions.userType,
  ipAddress: sessions.ipAddress,
  userAgent: sessions.userAgent,
  expiresAt: sessions.expiresAt,
  createdAt: sessions.createdAt,
};

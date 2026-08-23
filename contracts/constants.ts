export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/login",
  oauthCallback: "/api/oauth/callback",
  dashboard: "/dashboard",
} as const;

/** Shared validation limits for expense APIs and client forms */
export const ExpenseInputLimits = {
  rawTextMax: 5000,
  categoryMax: 100,
  subCategoryMax: 100,
  descriptionMax: 2000,
  amountMax: 999_999_999,
} as const;

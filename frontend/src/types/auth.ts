export type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "STUDENT";

/**
 * Roles live in Clerk `publicMetadata.role` (set per-user in the Clerk
 * dashboard — see README). The middleware reads them from the session token
 * via the `metadata` custom claim.
 */
declare global {
  interface CustomJwtSessionClaims {
    metadata?: { role?: Role };
  }
}

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { Role } from "@/types/auth";

const GUARDS: Array<[ReturnType<typeof createRouteMatcher>, Role[]]> = [
  [createRouteMatcher(["/super-admin(.*)"]), ["SUPER_ADMIN"]],
  [createRouteMatcher(["/admin(.*)"]), ["SUPER_ADMIN", "ORG_ADMIN"]],
  [createRouteMatcher(["/student(.*)"]), ["SUPER_ADMIN", "STUDENT"]],
];

export default clerkMiddleware(async (auth, req) => {
  const guard = GUARDS.find(([matches]) => matches(req));
  if (!guard) return;

  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Requires the Clerk session token to carry a `metadata` claim — see README.
  const role = sessionClaims?.metadata?.role;
  if (!role || !guard[1].includes(role)) {
    // "/" explains the missing/insufficient role instead of looping.
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: [
    // Clerk's recommended matcher: everything except static assets and _next internals.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

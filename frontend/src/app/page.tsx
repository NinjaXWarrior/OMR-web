"use client";

import { useUser } from "@clerk/nextjs";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { Role } from "@/types/auth";

const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  ORG_ADMIN: "/admin",
  STUDENT: "/student",
};

export default function RootPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const role = user?.publicMetadata?.role as Role | undefined;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) router.replace("/login");
    else if (role && ROLE_HOME[role]) router.replace(ROLE_HOME[role]);
  }, [isLoaded, isSignedIn, role, router]);

  // Signed in but no (valid) role — the middleware bounces such users here,
  // so explain the one-time Clerk setup instead of silently looping.
  if (isLoaded && isSignedIn && (!role || !ROLE_HOME[role])) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Alert className="max-w-lg border-[#ec835a]/40 bg-[#ec835a]/5">
          <AlertTriangle className="h-4 w-4 text-[#b45309]" />
          <AlertTitle>No role assigned to your account</AlertTitle>
          <AlertDescription className="text-muted-foreground">
            An administrator must set <code>publicMetadata.role</code> to <code>SUPER_ADMIN</code>,{" "}
            <code>ORG_ADMIN</code> or <code>STUDENT</code> for this user in the Clerk dashboard, and
            the session token must include the <code>metadata</code> claim — see{" "}
            <code>frontend/README.md</code>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

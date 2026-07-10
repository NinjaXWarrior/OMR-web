import { SignIn } from "@clerk/nextjs";
import { ScanLine } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden px-4">
      {/* soft radial accent behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(42,120,214,0.14),transparent)]"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#1c5cab] text-primary-foreground shadow-md">
          <ScanLine className="h-6 w-6" />
        </span>
        <div>
          <p className="text-lg font-semibold leading-tight">OMR Platform</p>
          <p className="text-sm text-muted-foreground">Grading & analytics</p>
        </div>
      </div>
      {/* hash routing keeps sign-in flows (verify email, etc.) on this single route */}
      <SignIn routing="hash" fallbackRedirectUrl="/" />
    </div>
  );
}

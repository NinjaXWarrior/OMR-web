import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "OMR Grading Platform",
  description: "AI-powered OMR grading and analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/login"
      afterSignOutUrl="/login"
      appearance={{ variables: { colorPrimary: "#2a78d6", borderRadius: "0.75rem" } }}
    >
      <html lang="en" className={inter.variable}>
        <body className="font-sans">
          <Providers>{children}</Providers>
          <Toaster position="top-right" richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}

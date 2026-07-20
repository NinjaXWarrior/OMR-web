"use client";

import { DatabaseZap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { omrApi } from "@/lib/api-client";

/**
 * Publishes a finished batch to MongoDB under an organization + exam name so
 * students can look it up from their dashboard. Also registers new orgs.
 */
export function PublishCard({ jobId, ready }: { jobId: string; ready: boolean }) {
  const [orgId, setOrgId] = useState("");
  const [examName, setExamName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await omrApi.publishResults(jobId, orgId.trim(), examName.trim());
      toast.success(
        `Published ${res.published} results for "${res.exam_name}" (org ${res.org_id})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!orgName.trim()) return;
    setBusy(true);
    try {
      const res = await omrApi.registerOrg(orgName.trim());
      setOrgId(res.org_id);
      setOrgName("");
      toast.success(`Registered "${res.name}" — Org ID ${res.org_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <DatabaseZap className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold">Publish to database</p>
          <p className="text-sm text-muted-foreground">
            Save this batch permanently so students can view it with your Org ID + roll number.
          </p>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap items-center gap-2" onSubmit={publish}>
        <Input
          placeholder="Org ID (e.g. 3F9A2C)"
          className="w-full font-mono sm:w-44"
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          required
        />
        <Input
          placeholder="Exam name (e.g. Midterm 2026)"
          className="w-full sm:w-64"
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
          required
        />
        <Button type="submit" disabled={!ready || busy}>
          Publish results
        </Button>
      </form>
      {!ready && (
        <p className="mt-2 text-xs text-muted-foreground">
          Publishing unlocks when the batch finishes grading successfully.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          placeholder="New organization name"
          className="w-full sm:w-64"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !orgName.trim()}
          onClick={register}
        >
          Register organization
        </Button>
      </div>
    </Card>
  );
}

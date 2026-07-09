"use client";

import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, FileText, ImagePlus, Loader2, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useOmrProgress } from "@/hooks/useOmrProgress";
import { omrApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useOmrJobStore } from "@/store/useOmrJobStore";

function FilePickButton({
  label,
  accept,
  file,
  onPick,
  onClear,
  icon: Icon,
}: {
  label: string;
  accept: string;
  file: File | null;
  onPick: (f: File) => void;
  onClear: () => void;
  icon: typeof FileText;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" className="justify-start" onClick={() => ref.current?.click()}>
        <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
        {file ? <span className="max-w-[180px] truncate">{file.name}</span> : label}
      </Button>
      {file && (
        <button className="rounded-md p-1 text-muted-foreground hover:bg-secondary" onClick={onClear} aria-label={`Clear ${label}`}>
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function UploadHubPage() {
  const router = useRouter();
  const [images, setImages] = useState<File[]>([]);
  const [answers, setAnswers] = useState<File | null>(null);
  const [template, setTemplate] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  const addJob = useOmrJobStore((s) => s.addJob);
  const activeJobId = useOmrJobStore((s) => s.activeJobId);
  const { data: progress } = useOmrProgress(activeJobId);

  const addImages = (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imgs.length) setImages((prev) => [...prev, ...imgs]);
  };

  const start = useMutation({
    mutationFn: async () => {
      if (!answers || !template || images.length === 0) {
        throw new Error("Provide the answer key CSV, the template .pickle, and at least one sheet image.");
      }
      // Validate the key client-side first (zod) — it also feeds analytics later.
      const key = await omrApi.parseAnswerKey(answers);
      const { job_id } = await omrApi.startRun({ answers, template, images });
      return { job_id, key };
    },
    onSuccess: ({ job_id, key }) => {
      addJob(
        { id: job_id, label: `${images.length} sheets · ${new Date().toLocaleString()}`, startedAt: new Date().toISOString() },
        key
      );
      toast.success("Grading started");
    },
    onError: (err) => toast.error(err.message),
  });

  const running = progress?.state === "running";
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload Hub</h1>
        <p className="text-sm text-muted-foreground">Grade a batch of scanned OMR sheets</p>
      </div>

      <Card className="p-6 shadow-sm">
        <input
          ref={imageInput}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addImages(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={() => imageInput.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && imageInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addImages(e.dataTransfer.files);
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
            dragOver ? "border-primary bg-accent" : "border-input hover:border-primary/50 hover:bg-secondary/50"
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ImagePlus className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium">Drag & drop sheet images here</p>
          <p className="text-xs text-muted-foreground">or click to browse — JPEG/PNG, one photo per student</p>
        </div>

        {images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {images.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs"
              >
                <span className="max-w-[140px] truncate">{f.name}</span>
                <button
                  onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <FilePickButton
            label="Answer key (.csv)"
            accept=".csv"
            file={answers}
            onPick={setAnswers}
            onClear={() => setAnswers(null)}
            icon={FileSpreadsheet}
          />
          <FilePickButton
            label="Template (.pickle)"
            accept=".pickle,.pkl"
            file={template}
            onPick={setTemplate}
            onClear={() => setTemplate(null)}
            icon={Settings2}
          />
        </div>

        <Button className="mt-6 w-full" size="lg" disabled={start.isPending || running} onClick={() => start.mutate()}>
          {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Start grading{images.length > 0 && ` (${images.length} sheets)`}
        </Button>
      </Card>

      {activeJobId && progress && progress.state !== "unknown" && (
        <Card className="p-6 shadow-sm">
          <p className="text-sm font-semibold">
            Job <span className="font-mono text-muted-foreground">{activeJobId.slice(0, 8)}…</span>
          </p>

          {progress.state === "error" ? (
            <Alert variant="destructive" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Job failed</AlertTitle>
              <AlertDescription>
                {progress.error ?? "Unknown error"} — sheets that failed calibration are saved
                server-side in Invalid_sheets/.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#cde2fb]">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5 text-sm text-muted-foreground sm:grid-cols-3">
                <span>
                  Processed <span className="font-medium text-foreground tabular-nums">{progress.done} / {progress.total}</span>
                </span>
                <span>
                  Speed <span className="font-medium text-foreground tabular-nums">{progress.ips.toFixed(2)}</span> sheets/s
                </span>
                <span>
                  ETA <span className="font-medium text-foreground tabular-nums">{Math.max(0, Math.round(progress.eta))}</span> s
                </span>
              </div>
              {progress.last && <p className="mt-1 text-xs text-muted-foreground">Last processed: {progress.last}</p>}
            </>
          )}

          {progress.has_preview && (
            <div className="mt-4 flex justify-center rounded-xl bg-[#141413] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- backend serves dynamic JPEGs */}
              <img
                key={progress.done} // re-fetch latest preview as the job advances
                src={`${omrApi.previewImageUrl(activeJobId)}?t=${progress.done}`}
                alt="Latest graded sheet"
                className="max-h-96 rounded-md object-contain"
              />
            </div>
          )}

          {progress.state === "done" && (
            <div className="mt-4 flex gap-3">
              <Button onClick={() => router.push("/admin")}>View analytics</Button>
              <Button variant="outline" onClick={() => router.push(`/admin/checked-sheets/${activeJobId}`)}>
                Review sheets
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

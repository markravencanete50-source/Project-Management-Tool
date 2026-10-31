"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { MAX_UPLOAD_BYTES, uploadFile } from "@/lib/upload-client";
import { requestRevision } from "@/server/actions/revisions";
import {
  MAX_REVISION_ATTACHMENTS,
  requestRevisionFormSchema,
  type RequestRevisionFormValues,
} from "@/lib/validation/revisions";

/** Request form for the portal. Disabled with an explanation when a request is not allowed. */
export function RequestRevisionForm({
  projectId,
  disabledReason,
  nextRoundNote,
}: {
  projectId: string;
  disabledReason: string | null;
  nextRoundNote: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const disabled = disabledReason !== null || busy;

  const form = useForm<RequestRevisionFormValues>({
    resolver: zodResolver(requestRevisionFormSchema),
    defaultValues: { notes: "" },
  });

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} is larger than 10 MB`);
        continue;
      }
      if (next.length >= MAX_REVISION_ATTACHMENTS) {
        toast.error(`You can attach up to ${MAX_REVISION_ATTACHMENTS} files`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onSubmit(values: RequestRevisionFormValues) {
    setBusy(true);
    try {
      const ids: string[] = [];
      for (const file of files) ids.push(await uploadFile(file, { projectId, purpose: "revisions" }));
      const res = await requestRevision(projectId, values.notes, ids);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.data.billable ? "Request sent. A quote will follow." : "Revision requested");
      form.reset();
      setFiles([]);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {disabledReason ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm leading-relaxed text-foreground" role="status">
          {disabledReason}
        </p>
      ) : (
        <p className="rounded-xl border border-info/25 bg-info/8 p-3.5 text-sm leading-relaxed text-foreground">{nextRoundNote}</p>
      )}

      <Field data-invalid={!!form.formState.errors.notes}>
        <FieldLabel htmlFor="revision-notes">What would you like changed?</FieldLabel>
        <Textarea
          id="revision-notes"
          rows={5}
          disabled={disabled}
          aria-invalid={!!form.formState.errors.notes}
          placeholder="Describe the changes. Be as specific as you can."
          {...form.register("notes")}
        />
        <FieldError errors={[form.formState.errors.notes]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="revision-files">Files (optional)</FieldLabel>
        <input
          ref={fileInput}
          id="revision-files"
          type="file"
          multiple
          disabled={disabled || files.length >= MAX_REVISION_ATTACHMENTS}
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-input bg-muted/30 p-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground file:shadow-xs"
        />
        <FieldDescription>Up to {MAX_REVISION_ATTACHMENTS} files, 10 MB each. Screenshots, documents or reference images.</FieldDescription>
        {files.length > 0 ? (
          <ul className="mt-1 space-y-1.5">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-xs">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Field>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={disabled}>
        <Send data-icon="inline-start" />
        {busy ? "Sending..." : "Request revision"}
      </Button>
    </form>
  );
}

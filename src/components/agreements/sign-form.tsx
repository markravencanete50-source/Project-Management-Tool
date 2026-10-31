"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, FileText, PenLine } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso, formatIsoDate } from "@/lib/dates";
import { AGREEMENT_CONSENT_TEXT, MAX_SIGNATURE_BYTES } from "@/lib/validation/agreements";

type Props = {
  projectId: string;
  agreementId: string;
  version: number;
  pdfHash: string;
};

export function SignForm({ projectId, agreementId, version, pdfHash }: Props) {
  const router = useRouter();
  const pad = useRef<SignatureCanvas | null>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The pad is sized to its container when it mounts. Rebuild it (which clears it)
  // only when the width changes, not on the height-only resizes that mobile browsers
  // fire while the address bar hides and shows.
  const lastWidth = useRef(0);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    lastWidth.current = el.offsetWidth;
    function onResize() {
      const width = wrapper.current?.offsetWidth ?? 0;
      if (width !== lastWidth.current) {
        lastWidth.current = width;
        setHasInk(false);
        setPadKey((k) => k + 1);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clear = useCallback(() => {
    pad.current?.clear();
    setHasInk(false);
  }, []);

  const trimmedName = name.trim();
  const ready = trimmedName.length >= 2 && consent && hasInk && !busy;

  async function submit() {
    setError(null);
    const canvas = pad.current;
    if (!canvas || canvas.isEmpty()) {
      setError("Please draw your signature.");
      return;
    }
    const signatureDataUrl = canvas.getTrimmedCanvas().toDataURL("image/png");
    if (signatureDataUrl.length > Math.ceil((MAX_SIGNATURE_BYTES * 4) / 3)) {
      setError("The signature is too detailed. Clear it and draw it again.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agreements/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, agreementId, version, pdfHash, signerName: trimmedName, signatureDataUrl, consent: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) router.refresh();
        return;
      }
      toast.success("Agreement signed. A copy is on its way to your email.");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const missing: string[] = [];
  if (trimmedName.length < 2) missing.push("your full name");
  if (!hasInk) missing.push("your signature");
  if (!consent) missing.push("your agreement to the terms");

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-medium">Agreement, version {version}</p>
          <p className="text-muted-foreground">You are signing the document above. Please make sure you have read all of it.</p>
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">Fingerprint {pdfHash.slice(0, 16)}</p>
        </div>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="sign-step-1">
        <h3 id="sign-step-1" className="flex items-center gap-2 text-sm font-semibold">
          <StepNumber n={1} />
          Confirm your name
        </h3>
        <Field>
          <FieldLabel htmlFor="signer-name">Full name</FieldLabel>
          <Input
            id="signer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={120}
            placeholder="Type your full legal name"
            required
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sign-step-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="sign-step-2" className="flex items-center gap-2 text-sm font-semibold">
            <StepNumber n={2} />
            <Label id="signature-label" className="text-sm font-semibold">
              Signature
            </Label>
          </h3>
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasInk || busy}>
            <Eraser data-icon="inline-start" />
            Clear
          </Button>
        </div>
        {/* A fixed light "paper" surface with dark ink in every theme: the drawn PNG is placed on a white PDF page. */}
        <div
          ref={wrapper}
          className="relative overflow-hidden rounded-xl border border-input shadow-xs"
          style={{ backgroundColor: "Canvas", colorScheme: "light" }}
        >
          <SignatureCanvas
            key={padKey}
            ref={pad}
            clearOnResize={false}
            penColor="#111111"
            onBegin={() => setHasInk(true)}
            canvasProps={{
              className: "relative z-10 block h-44 w-full touch-none",
              "aria-labelledby": "signature-label",
              role: "img",
            }}
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-10 z-0 flex items-end gap-2">
            <span className="pb-1 text-lg leading-none" style={{ color: "GrayText" }}>
              x
            </span>
            <span className="h-px flex-1" style={{ backgroundColor: "GrayText" }} />
          </div>
          {!hasInk ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/3 z-0 text-center text-sm"
              style={{ color: "GrayText" }}
            >
              Sign here
            </span>
          ) : null}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-5 bottom-3 z-0 text-xs" style={{ color: "GrayText" }}>
            {trimmedName ? `${trimmedName}, ${formatIsoDate(todayIso())}` : formatIsoDate(todayIso())}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Draw with your finger, stylus or mouse. Use Clear to start again.</p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sign-step-3">
        <h3 id="sign-step-3" className="flex items-center gap-2 text-sm font-semibold">
          <StepNumber n={3} />
          Agree and sign
        </h3>
        <div className="flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-xs">
          <Checkbox id="consent" checked={consent} onCheckedChange={(value) => setConsent(value === true)} className="mt-0.5" />
          <Label htmlFor="consent" className="items-start text-sm leading-snug font-normal">
            {AGREEMENT_CONSENT_TEXT}
          </Label>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={!ready}>
          <PenLine data-icon="inline-start" />
          {busy ? "Signing..." : "Sign agreement"}
        </Button>
        {!ready && !busy ? (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Still needed: {missing.join(", ")}.
          </p>
        ) : null}
      </section>
    </form>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary tabular-nums"
    >
      {n}
    </span>
  );
}

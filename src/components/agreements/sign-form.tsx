"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
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

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label id="signature-label">Signature</Label>
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!hasInk || busy}>
            Clear
          </Button>
        </div>
        <div ref={wrapper} className="overflow-hidden rounded-lg border border-input bg-background">
          <SignatureCanvas
            key={padKey}
            ref={pad}
            clearOnResize={false}
            penColor="#111111"
            onBegin={() => setHasInk(true)}
            canvasProps={{
              className: "block h-40 w-full touch-none",
              "aria-labelledby": "signature-label",
              role: "img",
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">Draw with your finger, stylus or mouse.</p>
      </div>

      <div className="flex items-start gap-3">
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

      <Button type="submit" size="lg" className="h-10 w-full" disabled={!ready}>
        {busy ? "Signing..." : "Sign agreement"}
      </Button>
    </form>
  );
}

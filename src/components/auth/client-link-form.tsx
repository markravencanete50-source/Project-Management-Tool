"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestClientLink } from "@/server/actions/auth";

const schema = z.object({ email: z.email("Enter a valid email address") });
type Values = z.infer<typeof schema>;

/** The answer is identical whether or not the address belongs to a client. */
export const LINK_SENT_MESSAGE = "If that email belongs to a client, a link is on its way.";

export function ClientLinkForm({ submitLabel = "Email me a sign-in link" }: { submitLabel?: string }) {
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  function onSubmit(values: Values) {
    startTransition(async () => {
      const res = await requestClientLink(values.email);
      if (!res.ok) {
        form.setError("email", { message: res.error });
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <Alert>
        <MailCheck />
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>{LINK_SENT_MESSAGE} The link works once and expires in 30 minutes.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <Field data-invalid={form.formState.errors.email ? true : undefined}>
        <FieldLabel htmlFor="client-email">Email address</FieldLabel>
        <Input
          id="client-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@company.com"
          aria-invalid={form.formState.errors.email ? true : undefined}
          {...form.register("email")}
        />
        <FieldError errors={[form.formState.errors.email]} />
      </Field>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending..." : submitLabel}
      </Button>
    </form>
  );
}

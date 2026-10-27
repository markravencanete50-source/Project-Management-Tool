"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SimpleSelect } from "@/components/projects-core/simple-select";
import { useAction } from "@/components/common/use-action";
import { createClient, updateClient } from "@/server/actions/clients";
import { clientSchema, type ClientData, type ClientInput } from "@/lib/validation/clients";
import { CURRENCIES } from "@/lib/money";

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

type Props = { client?: { id: string } & ClientInput; fullWidthTrigger?: boolean };

/** Create (no client prop) or edit (client prop) a client in a dialog. */
export function ClientFormDialog({ client, fullWidthTrigger }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  const editing = Boolean(client);

  const initial: ClientInput = {
    name: client?.name ?? "",
    company: client?.company ?? "",
    email: client?.email ?? "",
    defaultCurrency: client?.defaultCurrency ?? "GBP",
    notes: client?.notes ?? "",
  };
  const form = useForm<ClientInput, unknown, ClientData>({
    resolver: zodResolver(clientSchema),
    defaultValues: initial,
  });
  const { register, control, handleSubmit, reset, formState } = form;
  const { errors } = formState;

  function onSubmit() {
    // Send the raw input; the server parses and normalises it again.
    const values = form.getValues();
    if (client) {
      execute(() => updateClient(client.id, values), { success: "Client updated", onSuccess: () => setOpen(false) });
    } else {
      execute(() => createClient(values), {
        success: "Client created",
        refresh: false,
        onSuccess: (data) => {
          setOpen(false);
          router.push(`/admin/clients/${data.id}`);
        },
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(initial);
      }}
    >
      <DialogTrigger
        render={<Button variant={editing ? "outline" : "default"} className={fullWidthTrigger ? "w-full sm:w-auto" : undefined} />}
      >
        {editing ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {editing ? "Edit" : "New client"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update contact details and notes." : "Add a client. Their email is used for portal sign-in."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="client-name">Name</FieldLabel>
              <Input id="client-name" autoComplete="off" aria-invalid={Boolean(errors.name)} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field data-invalid={Boolean(errors.company)}>
              <FieldLabel htmlFor="client-company">Company</FieldLabel>
              <Input id="client-company" autoComplete="off" {...register("company")} />
              <FieldError errors={[errors.company]} />
            </Field>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="client-email">Email</FieldLabel>
              <Input id="client-email" type="email" autoComplete="off" aria-invalid={Boolean(errors.email)} {...register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-currency">Default currency</FieldLabel>
              <Controller
                control={control}
                name="defaultCurrency"
                render={({ field }) => (
                  <SimpleSelect id="client-currency" value={field.value} onValueChange={field.onChange} options={CURRENCY_OPTIONS} />
                )}
              />
            </Field>
            <Field data-invalid={Boolean(errors.notes)}>
              <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
              <Textarea id="client-notes" rows={3} {...register("notes")} />
              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : editing ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

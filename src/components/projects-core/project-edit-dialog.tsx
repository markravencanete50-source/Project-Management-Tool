"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/common/use-action";
import { updateProject } from "@/server/actions/projects";
import { projectUpdateSchema, type ProjectUpdateInput } from "@/lib/validation/projects";

/** Edits title, description, dates and revision allowance. Never contract value or status. */
export function ProjectEditDialog({ projectId, initial }: { projectId: string; initial: ProjectUpdateInput }) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();

  const form = useForm<ProjectUpdateInput, unknown, unknown>({
    resolver: zodResolver(projectUpdateSchema),
    defaultValues: initial,
  });
  const { register, handleSubmit, reset, formState } = form;
  const { errors } = formState;

  function onSubmit() {
    const values = form.getValues();
    execute(() => updateProject(projectId, values), { success: "Project updated", onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(initial);
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil data-icon="inline-start" />
        Edit
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Contract value and the payment schedule are edited in the Payments tab.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input id="edit-title" autoComplete="off" aria-invalid={Boolean(errors.title)} {...register("title")} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={Boolean(errors.description)}>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea id="edit-description" rows={4} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>
            <Field data-invalid={Boolean(errors.revisionAllowance)}>
              <FieldLabel htmlFor="edit-revisions">Included revision rounds</FieldLabel>
              <Input id="edit-revisions" inputMode="numeric" aria-invalid={Boolean(errors.revisionAllowance)} {...register("revisionAllowance")} />
              <FieldDescription>Changing this does not alter the agreement that was already generated.</FieldDescription>
              <FieldError errors={[errors.revisionAllowance]} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.startDate)}>
                <FieldLabel htmlFor="edit-start">Start date</FieldLabel>
                <Input id="edit-start" type="date" {...register("startDate")} />
                <FieldError errors={[errors.startDate]} />
              </Field>
              <Field data-invalid={Boolean(errors.deadline)}>
                <FieldLabel htmlFor="edit-deadline">Deadline</FieldLabel>
                <Input id="edit-deadline" type="date" {...register("deadline")} />
                <FieldError errors={[errors.deadline]} />
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

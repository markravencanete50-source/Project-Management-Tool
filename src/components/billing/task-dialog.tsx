"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/common/use-action";
import { fromMinor, toMinor, type Currency } from "@/lib/money";
import type { ActionResult } from "@/lib/types";
import { addTask, updateTask } from "@/server/actions/tasks";

export type EditableTask = { id: string; title: string; price: number };
type FormValues = { title: string; price: string };

/** Add a task (no `task` prop) or edit one. */
export function TaskDialog({
  projectId,
  currency,
  task,
  iconOnly = false,
  defaultPrice = 0,
}: {
  projectId: string;
  currency: Currency;
  task?: EditableTask;
  iconOnly?: boolean;
  /** Add mode: the project's default price per task in minor units. 0 means none. */
  defaultPrice?: number;
}) {
  const [open, setOpen] = useState(false);
  const { pending, execute } = useAction();
  const blank: FormValues = { title: "", price: defaultPrice > 0 ? fromMinor(defaultPrice) : "" };
  const initial: FormValues = task ? { title: task.title, price: fromMinor(task.price) } : blank;
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: initial });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) reset(initial);
  }

  function submit(values: FormValues, another: boolean) {
    execute(
      async (): Promise<ActionResult<unknown>> => (task ? updateTask({ projectId, taskId: task.id, ...values }) : addTask({ projectId, ...values })),
      {
        success: task ? "Task updated" : "Task added",
        onSuccess: () => {
          reset(blank);
          if (another) {
            // Keep the dialog open for the next task: title cleared, price back to the default.
            setFocus("title");
          } else {
            setOpen(false);
          }
        },
      },
    );
  }

  const onSubmit = (values: FormValues) => submit(values, false);
  const onAddAnother = handleSubmit((values) => submit(values, true));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant={task ? "outline" : "default"}
            size={task ? (iconOnly ? "icon-sm" : "sm") : "default"}
            aria-label={task && iconOnly ? `Edit task ${task.title}` : undefined}
          />
        }
      >
        {task ? <Pencil data-icon={iconOnly ? undefined : "inline-start"} /> : <Plus data-icon="inline-start" />}
        {task ? (iconOnly ? null : "Edit") : "Add task"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "Add task"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Changing the price of a finished task changes what is owed."
              : defaultPrice > 0
                ? `Starts at the default price in ${currency}, which you can change. It is owed once you mark it done.`
                : `Give it a price in ${currency}. It is owed once you mark it done.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4" noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor="task-title">Task</FieldLabel>
              <Input
                id="task-title"
                autoComplete="off"
                maxLength={160}
                aria-invalid={Boolean(errors.title)}
                {...register("title", { validate: (v) => v.trim().length > 0 || "Task title is required" })}
              />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={Boolean(errors.price)}>
              <FieldLabel htmlFor="task-price">Price ({currency})</FieldLabel>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted-foreground">
                  {currency}
                </span>
                <Input
                  id="task-price"
                  inputMode="decimal"
                  placeholder="250.00"
                  autoComplete="off"
                  className="pl-12 tabular-nums"
                  aria-invalid={Boolean(errors.price)}
                  {...register("price", {
                    validate: (v) => {
                      const minor = toMinor(v);
                      if (minor === null) return "Enter a valid amount, for example 250.00";
                      return minor > 0 || "Price must be greater than zero";
                    },
                  })}
                />
              </div>
              <FieldError errors={[errors.price]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            {task ? null : (
              <Button type="button" variant="outline" disabled={pending} onClick={onAddAnother}>
                Add and add another
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : task ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

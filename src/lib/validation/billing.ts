import { z } from "zod";
import { toHundredths } from "@/lib/billing";
import { isoDateSchema } from "@/lib/dates";
import { moneyString } from "@/lib/validation/payments";

const idSchema = z.string().min(1);

/** Hours or days typed into a text input ("7.5"), stored as hundredths. */
export const quantityString = z.string().transform((value, ctx) => {
  const hundredths = toHundredths(value);
  if (hundredths === null) {
    ctx.addIssue({ code: "custom", message: "Enter a quantity above 0 and up to 1000, with at most 2 decimals, for example 7.5" });
    return z.NEVER;
  }
  return hundredths;
});

const timeFields = {
  projectId: idSchema,
  date: isoDateSchema,
  quantity: quantityString,
  note: z.string().trim().max(300, "Note is too long").default(""),
};

export const addTimeEntrySchema = z.object(timeFields);
export const updateTimeEntrySchema = z.object({ ...timeFields, entryId: idSchema });
export const deleteTimeEntrySchema = z.object({ projectId: idSchema, entryId: idSchema });

const taskFields = {
  projectId: idSchema,
  title: z.string().trim().min(1, "Task title is required").max(160, "Title is too long"),
  price: moneyString("Price"),
};

export const addTaskSchema = z.object(taskFields);
export const updateTaskSchema = z.object({ ...taskFields, taskId: idSchema });
export const setTaskDoneSchema = z.object({ projectId: idSchema, taskId: idSchema, done: z.boolean() });
export const deleteTaskSchema = z.object({ projectId: idSchema, taskId: idSchema });

export type AddTimeEntryInput = z.input<typeof addTimeEntrySchema>;
export type UpdateTimeEntryInput = z.input<typeof updateTimeEntrySchema>;
export type DeleteTimeEntryInput = z.input<typeof deleteTimeEntrySchema>;
export type AddTaskInput = z.input<typeof addTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type SetTaskDoneInput = z.input<typeof setTaskDoneSchema>;
export type DeleteTaskInput = z.input<typeof deleteTaskSchema>;

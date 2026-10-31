"use server";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/money";
import {
  addTaskSchema,
  deleteTaskSchema,
  setTaskDoneSchema,
  updateTaskSchema,
  type AddTaskInput,
  type DeleteTaskInput,
  type SetTaskDoneInput,
  type UpdateTaskInput,
} from "@/lib/validation/billing";
import { run, UserError } from "@/server/action";
import { logActivity } from "@/server/activity";
import { projectFromDoc } from "@/server/data/convert";
import { col } from "@/server/data/refs";
import type { Project } from "@/lib/types";

// Priced tasks belong to task projects. A task is owed from the moment it is
// marked done (that moment is stored as doneAt) and stops being owed when it
// goes back to todo. The client sees the task list, so these activity entries
// are visible to the client.

function requireTasksProject(project: Project): void {
  if (project.kind !== "tasks") throw new UserError("Tasks can only be added to a task project");
}

export async function addTask(raw: AddTaskInput) {
  return run(async () => {
    await requireAdmin();
    const input = addTaskSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const taskRef = col.tasks(input.projectId).doc();
    await db().runTransaction(async (tx) => {
      const [projectSnap, tasksSnap] = await Promise.all([tx.get(projectRef), tx.get(col.tasks(input.projectId))]);
      if (!projectSnap.exists) throw new UserError("Project not found");
      const project = projectFromDoc(projectSnap);
      requireTasksProject(project);
      const order = tasksSnap.docs.reduce((max, d) => Math.max(max, Number(d.data().order ?? 0)), -1) + 1;
      tx.set(taskRef, {
        title: input.title,
        price: input.price,
        status: "todo",
        order,
        doneAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "task.added",
        message: `Task added: ${input.title} (${formatMoney(input.price, project.currency)})`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
    return { id: taskRef.id };
  });
}

export async function updateTask(raw: UpdateTaskInput) {
  return run(async () => {
    await requireAdmin();
    const input = updateTaskSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const taskRef = col.tasks(input.projectId).doc(input.taskId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, taskSnap] = await Promise.all([tx.get(projectRef), tx.get(taskRef)]);
      if (!projectSnap.exists || !taskSnap.exists) throw new UserError("Task not found");
      const project = projectFromDoc(projectSnap);
      requireTasksProject(project);
      tx.update(taskRef, { title: input.title, price: input.price, updatedAt: FieldValue.serverTimestamp() });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "task.updated",
        message: `Task updated: ${input.title} (${formatMoney(input.price, project.currency)})`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}

/** Mark a task done (it becomes owed now) or back to todo (it is no longer owed). */
export async function setTaskDone(raw: SetTaskDoneInput) {
  return run(async () => {
    await requireAdmin();
    const input = setTaskDoneSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const taskRef = col.tasks(input.projectId).doc(input.taskId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, taskSnap] = await Promise.all([tx.get(projectRef), tx.get(taskRef)]);
      if (!projectSnap.exists || !taskSnap.exists) throw new UserError("Task not found");
      const project = projectFromDoc(projectSnap);
      requireTasksProject(project);
      const task = taskSnap.data() as { title: string; price: number; status: string };
      if ((task.status === "done") === input.done) return;
      tx.update(taskRef, {
        status: input.done ? "done" : "todo",
        doneAt: input.done ? Timestamp.now() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: input.done ? "task.done" : "task.reopened",
        message: input.done
          ? `Task done: ${task.title} (${formatMoney(task.price, project.currency)})`
          : `Task reopened: ${task.title}`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}

export async function deleteTask(raw: DeleteTaskInput) {
  return run(async () => {
    await requireAdmin();
    const input = deleteTaskSchema.parse(raw);
    const projectRef = col.projects().doc(input.projectId);
    const taskRef = col.tasks(input.projectId).doc(input.taskId);
    await db().runTransaction(async (tx) => {
      const [projectSnap, taskSnap] = await Promise.all([tx.get(projectRef), tx.get(taskRef)]);
      if (!projectSnap.exists || !taskSnap.exists) throw new UserError("Task not found");
      const project = projectFromDoc(projectSnap);
      requireTasksProject(project);
      const task = taskSnap.data() as { title: string };
      tx.delete(taskRef);
      tx.update(projectRef, { updatedAt: FieldValue.serverTimestamp() });
      logActivity(tx, {
        type: "task.deleted",
        message: `Task removed: ${task.title}`,
        actor: "admin",
        visibility: "client",
        projectId: project.id,
        clientId: project.clientId,
      });
    });
  });
}

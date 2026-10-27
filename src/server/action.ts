import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/types";

/** Error whose message is safe to show the user. */
export class UserError extends Error {}

/**
 * Wrap a server action body: returns { ok, data } or { ok: false, error }.
 * Redirects and notFound pass through. Zod and UserError messages are shown;
 * anything else is logged and replaced with a generic message.
 */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
    if (err instanceof UserError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/firebase/admin";
import { TZ } from "@/lib/dates";
import { col } from "@/server/data/refs";
import { logActivity } from "@/server/activity";
import { run } from "@/server/action";
import { settingsSchema, type SettingsInput } from "@/lib/validation/settings";

/**
 * Save settings by merging into settings/app. The accepted rule only affects
 * projects accepted from now on: it never rewrites an existing acceptedAt.
 * The time zone is fixed in v1 and always written as Asia/Manila.
 */
export async function saveSettings(raw: SettingsInput) {
  return run(async () => {
    const input = settingsSchema.parse(raw);
    await requireAdmin();

    const batch = db().batch();
    batch.set(col.settings(), { ...input, timezone: TZ }, { merge: true });
    logActivity(batch, {
      type: "settings.updated",
      message: "Settings updated",
      actor: "admin",
      visibility: "internal",
    });
    await batch.commit();

    revalidatePath("/admin/settings");
  });
}

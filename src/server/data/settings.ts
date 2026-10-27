import "server-only";
import { cache } from "react";
import { col } from "@/server/data/refs";
import { DEFAULT_AGREEMENT_TEMPLATE } from "@/lib/pdf/default-template";
import { TZ } from "@/lib/dates";
import type { Settings } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  timezone: TZ,
  acceptedRule: "signed",
  defaultRevisionAllowance: 2,
  businessName: "Mark Raven",
  businessEmail: "",
  agreementTemplate: DEFAULT_AGREEMENT_TEMPLATE,
};

/** Settings merged over defaults. No session check: callers are already gated. */
export const getSettings = cache(async (): Promise<Settings> => {
  const snap = await col.settings().get();
  return { ...DEFAULT_SETTINGS, ...((snap.data() as Partial<Settings> | undefined) ?? {}), timezone: TZ };
});

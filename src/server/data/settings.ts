import "server-only";
import { cache } from "react";
import { col } from "@/server/data/refs";
import { DEFAULT_AGREEMENT_TEMPLATE } from "@/lib/pdf/default-template";
import { TZ } from "@/lib/dates";
import { normalizeFxOverrides } from "@/lib/fx/overrides";
import { normalizeOpeningBalances, normalizeOpeningDate } from "@/lib/available-money";
import type { Settings } from "@/lib/types";

export const DEFAULT_SETTINGS: Settings = {
  timezone: TZ,
  acceptedRule: "signed",
  defaultRevisionAllowance: 2,
  businessName: "Mark Raven",
  businessEmail: "",
  agreementTemplate: DEFAULT_AGREEMENT_TEMPLATE,
  fxOverrides: {},
  openingBalances: {},
  openingBalanceDate: null,
};

/** Settings merged over defaults. No session check: callers are already gated. */
export const getSettings = cache(async (): Promise<Settings> => {
  const snap = await col.settings().get();
  const data = (snap.data() as Partial<Settings> | undefined) ?? {};
  // Old docs have no fxOverrides: missing or invalid means "live".
  // Old docs also have no openingBalances or openingBalanceDate: missing means none.
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    timezone: TZ,
    fxOverrides: normalizeFxOverrides(data.fxOverrides),
    openingBalances: normalizeOpeningBalances(data.openingBalances),
    openingBalanceDate: normalizeOpeningDate(data.openingBalanceDate),
  };
});

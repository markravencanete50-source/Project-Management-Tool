import type { PaymentMethod, ScheduleKind } from "@/lib/types";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank transfer",
  paypal: "PayPal",
  wise: "Wise",
  gcash: "GCash",
  other: "Other",
};

export const KIND_LABELS: Record<ScheduleKind, string> = {
  deposit: "Deposit",
  milestone: "Milestone",
  final: "Final payment",
  change_order: "Change order",
};

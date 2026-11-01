"use client";

import type { UseFormRegisterReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { expectedFromInputs } from "@/lib/engagement";
import { formatMoney, type Currency } from "@/lib/money";
import type { RateUnit } from "@/lib/types";

/**
 * The "Working schedule" group of a retainer (project or prospect): hours per
 * day, days per month and a live summary of what that is expected to earn.
 */
export function RetainerSchedule({
  idPrefix,
  hoursField,
  daysField,
  hoursError,
  daysError,
  unit,
  currency,
  rateText,
  hoursText,
  daysText,
}: {
  idPrefix: string;
  hoursField: UseFormRegisterReturn;
  daysField: UseFormRegisterReturn;
  hoursError?: { message?: string };
  daysError?: { message?: string };
  unit: RateUnit;
  currency: Currency;
  rateText: string;
  hoursText: string;
  daysText: string;
}) {
  const expected = expectedFromInputs(unit, rateText, hoursText, daysText);
  return (
    <div className="grid gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2" role="group" aria-label="Working schedule">
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Working schedule</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Used to work out your expected monthly earnings and to prefill your time log.</p>
      </div>
      <Field data-invalid={Boolean(hoursError)}>
        <FieldLabel htmlFor={`${idPrefix}-hours`}>Hours per day</FieldLabel>
        <Input
          id={`${idPrefix}-hours`}
          inputMode="decimal"
          placeholder="8"
          autoComplete="off"
          className="tabular-nums"
          aria-invalid={Boolean(hoursError)}
          {...hoursField}
        />
        <FieldError errors={[hoursError]} />
      </Field>
      <Field data-invalid={Boolean(daysError)}>
        <FieldLabel htmlFor={`${idPrefix}-days`}>Days per month</FieldLabel>
        <Input
          id={`${idPrefix}-days`}
          inputMode="decimal"
          placeholder="22"
          autoComplete="off"
          className="tabular-nums"
          aria-invalid={Boolean(daysError)}
          {...daysField}
        />
        <FieldError errors={[daysError]} />
      </Field>
      <div className="sm:col-span-2" aria-live="polite">
        {expected ? (
          <>
            <p className="text-sm font-semibold tabular-nums">Expected per month: {formatMoney(expected.monthly, currency)}</p>
            <FieldDescription className="tabular-nums">
              About {formatMoney(expected.rates.hourly, currency)} per hour, {formatMoney(expected.rates.daily, currency)} per day,{" "}
              {formatMoney(expected.rates.weekly, currency)} per week
            </FieldDescription>
          </>
        ) : (
          <FieldDescription>Enter a rate to see your expected earnings per month.</FieldDescription>
        )}
      </div>
    </div>
  );
}

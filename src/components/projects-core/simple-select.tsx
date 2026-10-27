"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SelectOption = { value: string; label: string };

/** Thin wrapper over the shadcn Select for plain string options. */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select",
  id,
  className,
  disabled,
  ariaLabel,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Select
      value={value || null}
      onValueChange={(v) => {
        if (v !== null) onValueChange(v);
      }}
      items={options}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className ?? "w-full"} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

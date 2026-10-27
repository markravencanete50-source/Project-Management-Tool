"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Item = { value: string; label: string };

/** Thin wrapper so every select shows labels instead of raw values. */
export function LabeledSelect({
  value,
  onValueChange,
  items,
  placeholder,
  className,
  disabled,
  id,
  size,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  items: Item[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value}
      items={items}
      disabled={disabled}
      onValueChange={(v) => {
        if (typeof v === "string") onValueChange(v);
      }}
    >
      <SelectTrigger id={id} size={size} className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Labelled single-select used in filter bars. Radix Select forbids empty values: use a sentinel for "all". */
export const ALL = '__all__';

export function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <div className="flex min-w-36 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

export const pickValue = (v: string): string | undefined => (v === ALL ? undefined : v);

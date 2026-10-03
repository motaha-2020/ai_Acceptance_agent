import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('flex gap-3 rounded-md border p-3 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', {
  variants: {
    tone: {
      info: 'border-transparent bg-st-info-bg text-st-info-fg',
      warning: 'border-transparent bg-st-warning-bg text-st-warning-fg',
      danger: 'border-transparent bg-st-danger-bg text-st-danger-fg',
      success: 'border-transparent bg-st-success-bg text-st-success-fg',
      neutral: 'bg-muted text-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Alert({ className, tone, role = 'status', ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>) {
  return <div role={role} className={cn(alertVariants({ tone }), className)} {...props} />;
}

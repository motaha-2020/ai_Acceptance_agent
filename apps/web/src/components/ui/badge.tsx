import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 text-xs font-medium leading-4 [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-st-neutral-bg text-st-neutral-fg',
        info: 'bg-st-info-bg text-st-info-fg',
        success: 'bg-st-success-bg text-st-success-fg',
        warning: 'bg-st-warning-bg text-st-warning-fg',
        danger: 'bg-st-danger-bg text-st-danger-fg',
        violet: 'bg-st-violet-bg text-st-violet-fg',
        outline: 'border-border bg-transparent text-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

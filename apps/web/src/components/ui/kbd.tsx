import { cn } from '@/lib/utils';

/** Keyboard key cap. Keys are shown in Latin (physical key labels) in both languages. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded border border-b-2 bg-muted px-1 font-mono text-[0.6875rem] font-medium leading-5 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

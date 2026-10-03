'use client';

import { useTranslations } from 'next-intl';
import { Controller, useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/data/form-field';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'textarea' | 'select';
  options?: Array<{ value: string; label: string }>;
  /** Technical values (codes, IPs, hostnames) are always left-to-right. */
  ltr?: boolean;
  /** Not shown (and not sent) when editing: identity fields such as codes. */
  createOnly?: boolean;
  required?: boolean;
}

export type FormValues = Record<string, string | number | undefined>;

/** Drops empty strings/NaN so optional zod fields are simply absent. */
export function compact(values: FormValues): FormValues {
  const out: FormValues = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined || (typeof v === 'number' && Number.isNaN(v))) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Schema-driven create/edit dialog. The zod schema is the shared API contract, so client and
 * server validate the same rules; messages are generic ("check this field") on purpose.
 */
export function EntityDialog({
  open,
  title,
  description,
  fields,
  schema,
  initial,
  editing,
  submitting,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  fields: FieldDef[];
  schema: z.ZodTypeAny;
  initial: FormValues;
  editing: boolean;
  submitting?: boolean;
  onSubmit: (values: FormValues) => void;
  onClose: () => void;
}) {
  const tCommon = useTranslations('common');
  const t = useTranslations('admin.form');
  const visible = fields.filter((f) => !(editing && f.createOnly));
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FieldValues>({
    resolver: zodResolver(schema) as Resolver<FieldValues>,
    values: initial,
  });
  const id = (n: string): string => `ent-${n}`;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <form
          id="entity-form"
          noValidate
          className="grid gap-3"
          onSubmit={handleSubmit((raw) => {
            const values = compact(raw as FormValues);
            for (const f of fields) if (editing && f.createOnly) delete values[f.name];
            onSubmit(values);
          })}
        >
          {visible.map((f) => {
            const error = errors[f.name] ? t('invalid') : undefined;
            return (
              <Field key={f.name} id={id(f.name)} label={f.required ? `${f.label} *` : f.label} error={error}>
                {f.type === 'select' ? (
                  <Controller
                    control={control}
                    name={f.name}
                    render={({ field }) => (
                      <Select value={(field.value as string | undefined) ?? ''} onValueChange={field.onChange}>
                        <SelectTrigger id={id(f.name)} aria-invalid={!!errors[f.name]}>
                          <SelectValue placeholder={t('choose')} />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options?.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                ) : f.type === 'textarea' ? (
                  <Textarea id={id(f.name)} aria-invalid={!!errors[f.name]} {...register(f.name)} />
                ) : f.type === 'number' ? (
                  <Input
                    id={id(f.name)}
                    type="number"
                    inputMode="numeric"
                    dir="ltr"
                    className="text-start"
                    aria-invalid={!!errors[f.name]}
                    {...register(f.name, { setValueAs: (v: string) => (v === '' || v === undefined ? undefined : Number(v)) })}
                  />
                ) : (
                  <Input id={id(f.name)} dir={f.ltr ? 'ltr' : undefined} className={f.ltr ? 'text-start' : undefined} aria-invalid={!!errors[f.name]} {...register(f.name)} />
                )}
              </Field>
            );
          })}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form="entity-form" loading={submitting}>
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

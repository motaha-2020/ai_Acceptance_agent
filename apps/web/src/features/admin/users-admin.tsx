'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Pencil, Plus, Search, UserX } from 'lucide-react';
import { z } from 'zod';
import { CreateUserRequest, Role } from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ALL, FilterSelect, pickValue } from '@/components/data/filter-select';
import { DataTable, type Column } from '@/components/data/data-table';
import { Field } from '@/components/data/form-field';
import { PageHeader } from '@/components/data/states';
import { ActiveBadge } from '@/components/data/status-badges';
import { useConfirm } from '@/components/data/confirm-dialog';
import { useSession } from '@/components/session-provider';
import { createUser, deactivateUser, listUsers, updateUser } from '@/lib/api/endpoints';
import type { RoleDto, UserDto } from '@/lib/api/types';
import type { AppLocale } from '@/i18n/config';
import { useErrorMessage } from '@/lib/errors';
import { formatRelative } from '@/lib/format';

const ROLES = Role.options;

type UserFormValues = { email: string; name: string; password: string; role: RoleDto; phone: string; isActive: boolean };

const CreateForm = CreateUserRequest;
const EditForm = z.object({
  name: z.string().trim().min(1).max(120),
  role: Role,
  phone: z.string().trim().max(40),
  isActive: z.boolean(),
  password: z.union([z.literal(''), z.string().min(10).max(256)]),
});

function UserDialog({ user, open, onClose }: { user: UserDto | null; open: boolean; onClose: () => void }) {
  const t = useTranslations('admin.users');
  const tRole = useTranslations('roles');
  const tCommon = useTranslations('common');
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const me = useSession();
  const editing = user !== null;
  const schema = editing ? EditForm : CreateForm;
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(schema as z.ZodTypeAny) as Resolver<UserFormValues>,
    values: { email: user?.email ?? '', name: user?.name ?? '', password: '', role: user?.role ?? 'reviewer', phone: user?.phone ?? '', isActive: user?.isActive ?? true },
  });

  const save = useMutation({
    mutationFn: async (v: UserFormValues) => {
      if (user) {
        return updateUser(user.id, {
          name: v.name,
          role: v.role,
          phone: v.phone ? v.phone : null,
          isActive: v.isActive,
          ...(v.password ? { password: v.password } : {}),
        });
      }
      return createUser({ email: v.email, name: v.name, password: v.password, role: v.role, ...(v.phone ? { phone: v.phone } : {}) });
    },
    onSuccess: () => {
      toast.success(editing ? t('saved') : t('created'));
      void qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const err = (k: keyof UserFormValues, msg: string): string | undefined => (errors[k] ? msg : undefined);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('editTitle') : t('createTitle')}</DialogTitle>
          <DialogDescription>{editing ? user.email : t('createDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-3" id="user-form">
          {!editing ? (
            <Field id="u-email" label={t('email')} error={err('email', t('invalidEmail'))}>
              <Input id="u-email" type="email" dir="ltr" className="text-start" aria-invalid={!!errors.email} {...register('email')} />
            </Field>
          ) : null}
          <Field id="u-name" label={t('name')} error={err('name', t('required'))}>
            <Input id="u-name" aria-invalid={!!errors.name} {...register('name')} />
          </Field>
          <Field id="u-role" label={t('role')}>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={editing && user.id === me.id}>
                  <SelectTrigger id="u-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {tRole(r)} — {tRole(`${r}Hint`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field id="u-phone" label={t('phone')}>
            <Input id="u-phone" type="tel" dir="ltr" className="text-start" {...register('phone')} />
          </Field>
          <Field id="u-password" label={editing ? t('newPassword') : t('password')} hint={t('passwordHint')} error={err('password', t('passwordTooShort'))}>
            <Input id="u-password" type="password" dir="ltr" className="text-start" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
          </Field>
          {editing ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <label htmlFor="u-active" className="text-sm font-medium">
                {t('accountActive')}
              </label>
              <Controller control={control} name="isActive" render={({ field }) => <Switch id="u-active" checked={field.value} onCheckedChange={field.onChange} disabled={user.id === me.id} />} />
            </div>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form="user-form" loading={save.isPending}>
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersAdmin() {
  const t = useTranslations('admin.users');
  const tRole = useTranslations('roles');
  const tCommon = useTranslations('common');
  const locale = useLocale() as AppLocale;
  const qc = useQueryClient();
  const me = useSession();
  const errorMessage = useErrorMessage();
  const { confirm, dialog } = useConfirm();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<RoleDto | undefined>();
  const [active, setActive] = useState<'true' | 'false' | undefined>();
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [creating, setCreating] = useState(false);

  const query = { page, pageSize, q: q || undefined, role, isActive: active };
  const users = useQuery({ queryKey: ['users', 'admin', query], queryFn: () => listUsers(query), placeholderData: keepPreviousData });
  const deactivate = useMutation({
    mutationFn: (u: UserDto) => deactivateUser(u.id),
    onSuccess: () => {
      toast.success(t('deactivated'));
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<UserDto>[] = useMemo(
    () => [
      { id: 'name', header: t('name'), sortValue: (u) => u.name, cell: (u) => <span className="font-medium">{u.name}</span> },
      { id: 'email', header: t('email'), sortValue: (u) => u.email, cell: (u) => <span className="ltr-token">{u.email}</span> },
      { id: 'role', header: t('role'), sortValue: (u) => u.role, cell: (u) => <Badge tone={u.role === 'admin' ? 'violet' : 'info'}>{tRole(u.role)}</Badge> },
      { id: 'status', header: t('status'), cell: (u) => <ActiveBadge active={u.isActive} /> },
      { id: 'last', header: t('lastLogin'), sortValue: (u) => u.lastLoginAt ?? '', cell: (u) => <span className="text-muted-foreground">{u.lastLoginAt ? formatRelative(u.lastLoginAt, locale) : t('never')}</span> },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        cell: (u) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
              <Pencil aria-hidden />
              {tCommon('edit')}
            </Button>
            {u.isActive && u.id !== me.id ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={async () => {
                  if (await confirm({ title: t('deactivateTitle', { name: u.name }), description: t('deactivateBody'), confirmLabel: t('deactivate'), destructive: true })) deactivate.mutate(u);
                }}
              >
                <UserX aria-hidden />
                {t('deactivate')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [t, tRole, tCommon, locale, me.id, confirm, deactivate],
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreating(true)} data-testid="create-user">
            <Plus aria-hidden />
            {t('create')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={users.data?.items}
        rowKey={(u) => u.id}
        isLoading={users.isLoading}
        error={users.error}
        onRetry={() => void users.refetch()}
        page={page}
        pageSize={pageSize}
        total={users.data?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        emptyTitle={t('empty')}
        caption={t('title')}
        toolbar={
          <>
            <div className="relative flex min-w-56 flex-col gap-1">
              <span className="text-xs text-muted-foreground">{t('search')}</span>
              <Search className="pointer-events-none absolute start-2.5 bottom-2 size-4 text-muted-foreground" aria-hidden />
              <Input aria-label={t('search')} className="h-8 ps-8" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
            <FilterSelect label={t('role')} value={role ?? ALL} onChange={(v) => { setRole(pickValue(v) as RoleDto | undefined); setPage(1); }}>
              <SelectItem value={ALL}>{t('allRoles')}</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {tRole(r)}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect label={t('status')} value={active ?? ALL} onChange={(v) => { setActive(pickValue(v) as 'true' | 'false' | undefined); setPage(1); }}>
              <SelectItem value={ALL}>{t('allStatuses')}</SelectItem>
              <SelectItem value="true">{tCommon('active')}</SelectItem>
              <SelectItem value="false">{tCommon('inactive')}</SelectItem>
            </FilterSelect>
          </>
        }
      />
      <UserDialog user={null} open={creating} onClose={() => setCreating(false)} />
      <UserDialog user={editing} open={editing !== null} onClose={() => setEditing(null)} />
      {dialog}
    </>
  );
}

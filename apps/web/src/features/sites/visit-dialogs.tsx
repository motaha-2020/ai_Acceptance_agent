'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { VisitType } from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/data/form-field';
import { assignTechnicians, createVisit, listUsers, unassignTechnician } from '@/lib/api/endpoints';
import type { UserDto, VisitDto, VisitTypeDto } from '@/lib/api/types';
import { useErrorMessage } from '@/lib/errors';

/** Roles the API accepts as visit assignees (visits.service ASSIGNABLE_ROLES). */
const ASSIGNABLE = new Set(['technician', 'engineer']);

/** Which assignments to add and remove to go from `current` to `selected`. */
export function assignmentDiff(current: readonly string[], selected: readonly string[]): { add: string[]; remove: string[] } {
  const cur = new Set(current);
  const sel = new Set(selected);
  return { add: [...sel].filter((id) => !cur.has(id)), remove: [...cur].filter((id) => !sel.has(id)) };
}

function useAssignableUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => listUsers({ isActive: 'true', pageSize: 200 }),
    select: (p) => p.items.filter((u) => ASSIGNABLE.has(u.role)),
    enabled,
    staleTime: 60_000,
  });
}

function TechnicianPicker({ users, selected, onChange }: { users: UserDto[] | undefined; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations('siteDetail.visits');
  if (!users) return <p className="text-sm text-muted-foreground">…</p>;
  if (users.length === 0) return <p className="text-sm text-muted-foreground">{t('noAssignees')}</p>;
  return (
    <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-3">
      {users.map((u) => {
        const id = `assignee-${u.id}`;
        const checked = selected.includes(u.id);
        return (
          <li key={u.id} className="flex items-center gap-2">
            <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true ? [...selected, u.id] : selected.filter((s) => s !== u.id))} />
            <Label htmlFor={id} className="font-normal">
              {u.name} <span className="ltr-token text-muted-foreground">{u.email}</span>
            </Label>
          </li>
        );
      })}
    </ul>
  );
}

function useVisitsInvalidation(siteId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['visits', siteId] });
    void qc.invalidateQueries({ queryKey: ['site-progress', siteId] });
  };
}

export function NewVisitDialog({ siteId, open, onClose }: { siteId: string; open: boolean; onClose: () => void }) {
  const t = useTranslations('siteDetail.visits');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const refresh = useVisitsInvalidation(siteId);
  const users = useAssignableUsers(open);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<VisitTypeDto>('installation');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setType('installation');
    setDate('');
    setNotes('');
    setAssignees([]);
    setTouched(false);
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      createVisit({
        siteId,
        title: title.trim(),
        type,
        ...(date ? { scheduledFor: new Date(date) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        technicianIds: assignees,
      }),
    onSuccess: () => {
      toast.success(t('created'));
      refresh();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const titleError = touched && !title.trim() ? t('required') : undefined;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('new')}</DialogTitle>
          <DialogDescription>{t('newDescription')}</DialogDescription>
        </DialogHeader>
        <form
          id="new-visit-form"
          noValidate
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (title.trim()) save.mutate();
          }}
        >
          <Field id="visit-title" label={`${t('titleField')} *`} error={titleError}>
            <Input id="visit-title" value={title} maxLength={200} aria-invalid={!!titleError} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="visit-type" label={t('type')}>
              <Select value={type} onValueChange={(v) => setType(v as VisitTypeDto)}>
                <SelectTrigger id="visit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VisitType.options.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`types.${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="visit-date" label={t('scheduledFor')}>
              <Input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field id="visit-assignees" label={t('assignees')} hint={t('assigneesHint')}>
            <TechnicianPicker users={users.data} selected={assignees} onChange={setAssignees} />
          </Field>
          <Field id="visit-notes" label={t('notes')}>
            <Textarea id="visit-notes" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" form="new-visit-form" loading={save.isPending}>
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignTechniciansDialog({ siteId, visit, onClose }: { siteId: string; visit: VisitDto | null; onClose: () => void }) {
  const t = useTranslations('siteDetail.visits');
  const tCommon = useTranslations('common');
  const errorMessage = useErrorMessage();
  const refresh = useVisitsInvalidation(siteId);
  const users = useAssignableUsers(visit !== null);
  const current = visit?.assignments?.map((a) => a.user.id) ?? [];
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected(visit?.assignments?.map((a) => a.user.id) ?? []);
  }, [visit]);

  const save = useMutation({
    mutationFn: async () => {
      if (!visit) return;
      const { add, remove } = assignmentDiff(current, selected);
      if (add.length) await assignTechnicians(visit.id, add);
      for (const userId of remove) await unassignTechnician(visit.id, userId);
    },
    onSuccess: () => {
      toast.success(t('assigned'));
      refresh();
      onClose();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      refresh();
    },
  });

  return (
    <Dialog open={visit !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('manageTitle', { title: visit?.title ?? '' })}</DialogTitle>
          <DialogDescription>{t('assigneesHint')}</DialogDescription>
        </DialogHeader>
        <TechnicianPicker users={users.data} selected={selected} onChange={setSelected} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {tCommon('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

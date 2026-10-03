'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CreateDeviceRequest,
  CreateProjectRequest,
  CreateSiteRequest,
  UpdateDeviceRequest,
  UpdateProjectRequest,
  UpdateSiteRequest,
} from '@acceptance/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/data/data-table';
import { PageHeader } from '@/components/data/states';
import { useConfirm } from '@/components/data/confirm-dialog';
import { useProjects, useSites } from '@/features/common/lookups';
import { archiveProject, archiveSite, createDevice, createProject, createSite, deleteDevice, listDevices, listProjects, listSites, updateDevice, updateProject, updateSite } from '@/lib/api/endpoints';
import type { DeviceDto, ProjectDto, SiteDto } from '@/lib/api/types';
import { useErrorMessage } from '@/lib/errors';
import { EntityDialog, type FieldDef, type FormValues } from './entity-dialog';

/** Small CRUD hook shared by the three tabs: list query + create/update/remove mutations + toasts. */
function useCrud<T extends { id: string }>(opts: {
  key: string;
  list: (page: number, pageSize: number) => Promise<{ items: T[]; total: number }>;
  create: (v: FormValues) => Promise<unknown>;
  update: (id: string, v: FormValues) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}) {
  const t = useTranslations('admin.form');
  const qc = useQueryClient();
  const errorMessage = useErrorMessage();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'edit'; row: T } | null>(null);
  const q = useQuery({ queryKey: ['catalog', opts.key, page, pageSize], queryFn: () => opts.list(page, pageSize), placeholderData: keepPreviousData });
  const done = (msg: string) => () => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['catalog'] });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['sites'] });
    setDialog(null);
  };
  const save = useMutation({
    mutationFn: (v: FormValues) => (dialog?.mode === 'edit' ? opts.update(dialog.row.id, v) : opts.create(v)),
    onSuccess: done(t('saved')),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: opts.remove, onSuccess: done(t('removed')), onError: (e) => toast.error(errorMessage(e)) });
  return { q, page, setPage, pageSize, setPageSize, dialog, setDialog, save, remove };
}

function ProjectsTab() {
  const t = useTranslations('admin.projects');
  const tCommon = useTranslations('common');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const c = useCrud<ProjectDto>({
    key: 'projects',
    list: (page, pageSize) => listProjects({ page, pageSize }),
    create: (v) => createProject(v as unknown as CreateProjectRequest),
    update: (id, v) => updateProject(id, v as unknown as UpdateProjectRequest),
    remove: archiveProject,
  });
  const fields: FieldDef[] = [
    { name: 'code', label: t('code'), ltr: true, createOnly: true, required: true },
    { name: 'name', label: t('name'), required: true },
    { name: 'clientName', label: t('client') },
    { name: 'description', label: t('descriptionField'), type: 'textarea' },
  ];
  const columns: Column<ProjectDto>[] = [
    { id: 'code', header: t('code'), sortValue: (p) => p.code, cell: (p) => <span className="ltr-token font-mono">{p.code}</span> },
    { id: 'name', header: t('name'), sortValue: (p) => p.name, cell: (p) => <span className="font-medium">{p.name}</span> },
    { id: 'client', header: t('client'), cell: (p) => p.clientName ?? '—' },
    { id: 'sites', header: t('sites'), cell: (p) => p._count?.sites ?? 0 },
    {
      id: 'actions',
      header: <span className="sr-only">{tCommon('actions')}</span>,
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => c.setDialog({ mode: 'edit', row: p })}>
            <Pencil aria-hidden />
            {tCommon('edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: t('archiveTitle', { name: p.name }), description: t('archiveBody'), confirmLabel: t('archive'), destructive: true })) c.remove.mutate(p.id);
            }}
          >
            <Archive aria-hidden />
            {t('archive')}
          </Button>
        </div>
      ),
    },
  ];
  const row = c.dialog?.mode === 'edit' ? c.dialog.row : null;
  return (
    <>
      <TabToolbar label={t('create')} onCreate={() => c.setDialog({ mode: 'create' })} />
      <DataTable columns={columns} rows={c.q.data?.items} rowKey={(p) => p.id} isLoading={c.q.isLoading} error={c.q.error} onRetry={() => void c.q.refetch()} page={c.page} pageSize={c.pageSize} total={c.q.data?.total ?? 0} onPageChange={c.setPage} onPageSizeChange={(n) => { c.setPageSize(n); c.setPage(1); }} emptyTitle={t('empty')} caption={t('title')} />
      <EntityDialog
        open={c.dialog !== null}
        title={row ? t('editTitle') : t('createTitle')}
        fields={fields}
        schema={row ? UpdateProjectRequest : CreateProjectRequest}
        editing={!!row}
        initial={{ code: row?.code ?? '', name: row?.name ?? '', clientName: row?.clientName ?? '', description: row?.description ?? '' }}
        submitting={c.save.isPending}
        onSubmit={(v) => c.save.mutate(v)}
        onClose={() => c.setDialog(null)}
      />
      {confirmDialog}
    </>
  );
}

function SitesTab() {
  const t = useTranslations('admin.sites');
  const tCommon = useTranslations('common');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const projects = useProjects();
  const c = useCrud<SiteDto>({
    key: 'sites',
    list: (page, pageSize) => listSites({ page, pageSize }),
    create: (v) => createSite(v as unknown as CreateSiteRequest),
    update: (id, v) => updateSite(id, v as unknown as UpdateSiteRequest),
    remove: archiveSite,
  });
  const fields: FieldDef[] = [
    { name: 'projectId', label: t('project'), type: 'select', createOnly: true, required: true, options: (projects.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })) },
    { name: 'code', label: t('code'), ltr: true, createOnly: true, required: true },
    { name: 'name', label: t('name'), required: true },
    { name: 'exchange', label: t('exchange') },
    { name: 'region', label: t('region') },
    { name: 'room', label: t('room') },
    { name: 'floor', label: t('floor') },
    { name: 'racks', label: t('racks'), type: 'number' },
  ];
  const columns: Column<SiteDto>[] = [
    { id: 'code', header: t('code'), sortValue: (s) => s.code, cell: (s) => <span className="ltr-token font-mono">{s.code}</span> },
    { id: 'name', header: t('name'), sortValue: (s) => s.name, cell: (s) => <span className="font-medium">{s.name}</span> },
    { id: 'project', header: t('project'), cell: (s) => s.project?.name ?? '—' },
    { id: 'exchange', header: t('exchange'), cell: (s) => s.exchange ?? '—' },
    { id: 'racks', header: t('racks'), cell: (s) => s.racks ?? '—' },
    {
      id: 'actions',
      header: <span className="sr-only">{tCommon('actions')}</span>,
      cell: (s) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => c.setDialog({ mode: 'edit', row: s })}>
            <Pencil aria-hidden />
            {tCommon('edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: t('archiveTitle', { name: s.name }), description: t('archiveBody'), confirmLabel: t('archive'), destructive: true })) c.remove.mutate(s.id);
            }}
          >
            <Archive aria-hidden />
            {t('archive')}
          </Button>
        </div>
      ),
    },
  ];
  const row = c.dialog?.mode === 'edit' ? c.dialog.row : null;
  return (
    <>
      <TabToolbar label={t('create')} onCreate={() => c.setDialog({ mode: 'create' })} />
      <DataTable columns={columns} rows={c.q.data?.items} rowKey={(s) => s.id} isLoading={c.q.isLoading} error={c.q.error} onRetry={() => void c.q.refetch()} page={c.page} pageSize={c.pageSize} total={c.q.data?.total ?? 0} onPageChange={c.setPage} onPageSizeChange={(n) => { c.setPageSize(n); c.setPage(1); }} emptyTitle={t('empty')} caption={t('title')} />
      <EntityDialog
        open={c.dialog !== null}
        title={row ? t('editTitle') : t('createTitle')}
        fields={fields}
        schema={row ? UpdateSiteRequest : CreateSiteRequest}
        editing={!!row}
        initial={{
          projectId: row?.projectId ?? projects.data?.items[0]?.id ?? '',
          code: row?.code ?? '',
          name: row?.name ?? '',
          exchange: row?.exchange ?? '',
          region: row?.region ?? '',
          room: row?.room ?? '',
          floor: row?.floor ?? '',
          racks: row?.racks ?? undefined,
        }}
        submitting={c.save.isPending}
        onSubmit={(v) => c.save.mutate(v)}
        onClose={() => c.setDialog(null)}
      />
      {confirmDialog}
    </>
  );
}

function DevicesTab() {
  const t = useTranslations('admin.devices');
  const tCommon = useTranslations('common');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const sites = useSites();
  const c = useCrud<DeviceDto>({
    key: 'devices',
    list: (page, pageSize) => listDevices({ page, pageSize }),
    create: (v) => createDevice(v as unknown as CreateDeviceRequest),
    update: (id, v) => updateDevice(id, v as unknown as UpdateDeviceRequest),
    remove: deleteDevice,
  });
  const fields: FieldDef[] = useMemo(
    () => [
      { name: 'siteId', label: t('site'), type: 'select', createOnly: true, required: true, options: (sites.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` })) },
      { name: 'model', label: t('model'), ltr: true, required: true },
      { name: 'hostname', label: t('hostname'), ltr: true },
      { name: 'serial', label: t('serial'), ltr: true },
      { name: 'loopbackIp', label: t('loopback'), ltr: true },
      { name: 'role', label: t('roleField') },
    ],
    [t, sites.data],
  );
  const columns: Column<DeviceDto>[] = [
    { id: 'host', header: t('hostname'), sortValue: (d) => d.hostname ?? '', cell: (d) => <span className="ltr-token font-medium">{d.hostname ?? '—'}</span> },
    { id: 'model', header: t('model'), sortValue: (d) => d.model, cell: (d) => <span className="ltr-token">{d.model}</span> },
    { id: 'site', header: t('site'), cell: (d) => d.site?.name ?? '—' },
    { id: 'ip', header: t('loopback'), cell: (d) => <span className="ltr-token">{d.loopbackIp ?? '—'}</span> },
    { id: 'serial', header: t('serial'), cell: (d) => <span className="ltr-token">{d.serial ?? '—'}</span> },
    {
      id: 'actions',
      header: <span className="sr-only">{tCommon('actions')}</span>,
      cell: (d) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => c.setDialog({ mode: 'edit', row: d })}>
            <Pencil aria-hidden />
            {tCommon('edit')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: t('deleteTitle', { name: d.hostname ?? d.model }), description: t('deleteBody'), confirmLabel: tCommon('delete'), destructive: true })) c.remove.mutate(d.id);
            }}
          >
            <Trash2 aria-hidden />
            {tCommon('delete')}
          </Button>
        </div>
      ),
    },
  ];
  const row = c.dialog?.mode === 'edit' ? c.dialog.row : null;
  return (
    <>
      <TabToolbar label={t('create')} onCreate={() => c.setDialog({ mode: 'create' })} />
      <DataTable columns={columns} rows={c.q.data?.items} rowKey={(d) => d.id} isLoading={c.q.isLoading} error={c.q.error} onRetry={() => void c.q.refetch()} page={c.page} pageSize={c.pageSize} total={c.q.data?.total ?? 0} onPageChange={c.setPage} onPageSizeChange={(n) => { c.setPageSize(n); c.setPage(1); }} emptyTitle={t('empty')} caption={t('title')} />
      <EntityDialog
        open={c.dialog !== null}
        title={row ? t('editTitle') : t('createTitle')}
        fields={fields}
        schema={row ? UpdateDeviceRequest : CreateDeviceRequest}
        editing={!!row}
        initial={{
          siteId: row?.siteId ?? sites.data?.items[0]?.id ?? '',
          model: row?.model ?? '',
          hostname: row?.hostname ?? '',
          serial: row?.serial ?? '',
          loopbackIp: row?.loopbackIp ?? '',
          role: row?.role ?? '',
        }}
        submitting={c.save.isPending}
        onSubmit={(v) => c.save.mutate(v)}
        onClose={() => c.setDialog(null)}
      />
      {confirmDialog}
    </>
  );
}

function TabToolbar({ label, onCreate }: { label: string; onCreate: () => void }) {
  return (
    <div className="mb-3 flex justify-end">
      <Button onClick={onCreate}>
        <Plus aria-hidden />
        {label}
      </Button>
    </div>
  );
}

export function CatalogAdmin() {
  const t = useTranslations('admin.catalog');
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">{t('tabs.projects')}</TabsTrigger>
          <TabsTrigger value="sites">{t('tabs.sites')}</TabsTrigger>
          <TabsTrigger value="devices">{t('tabs.devices')}</TabsTrigger>
        </TabsList>
        <TabsContent value="projects">
          <ProjectsTab />
        </TabsContent>
        <TabsContent value="sites">
          <SitesTab />
        </TabsContent>
        <TabsContent value="devices">
          <DevicesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

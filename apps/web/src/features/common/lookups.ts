'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProjects, listSites, listUsers } from '@/lib/api/endpoints';
import type { ProjectDto, SiteDto, UserDto } from '@/lib/api/types';

const FIVE_MIN = 5 * 60_000;

export function useProjects() {
  return useQuery({ queryKey: ['projects', 'all'], queryFn: () => listProjects({ pageSize: 100 }), staleTime: FIVE_MIN });
}

export function useSites(projectId?: string) {
  return useQuery({
    queryKey: ['sites', 'by-project', projectId ?? null],
    queryFn: () => listSites({ projectId, pageSize: 200 }),
    staleTime: FIVE_MIN,
  });
}

export function useUsersLookup() {
  return useQuery({ queryKey: ['users', 'lookup'], queryFn: () => listUsers({ pageSize: 200 }), staleTime: FIVE_MIN });
}

export function useSiteMap(): Map<string, SiteDto> {
  const q = useSites();
  return useMemo(() => new Map((q.data?.items ?? []).map((s) => [s.id, s])), [q.data]);
}

export function useProjectMap(): Map<string, ProjectDto> {
  const q = useProjects();
  return useMemo(() => new Map((q.data?.items ?? []).map((p) => [p.id, p])), [q.data]);
}

export function useUserMap(): Map<string, UserDto> {
  const q = useUsersLookup();
  return useMemo(() => new Map((q.data?.items ?? []).map((u) => [u.id, u])), [q.data]);
}

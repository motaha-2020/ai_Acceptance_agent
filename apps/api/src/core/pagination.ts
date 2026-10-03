import type { PageQuery, Paginated } from '@acceptance/shared';

export function pageArgs(q: PageQuery): { skip: number; take: number } {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

export function toPage<T>(items: T[], total: number, q: PageQuery): Paginated<T> {
  return { items, total, page: q.page, pageSize: q.pageSize };
}

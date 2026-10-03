import { describe, expect, it } from 'vitest';
import { CHECKLISTS, getChecklist } from '@acceptance/checklist';
import { buildShotPlan, visitCompletion, type ServerPhotoLite } from '../src/features/visits/shot-plan';

describe('shot plan', () => {
  const rack = getChecklist('rack');

  it('covers every checklist category with its required shots', () => {
    const plan = buildShotPlan(CHECKLISTS, [], []);
    expect(plan).toHaveLength(CHECKLISTS.length);
    expect(plan.find((p) => p.category === 'rack')).toMatchObject({ required: rack.requiredShots.length, captured: 0, complete: false, titleAr: rack.titleAr });
  });

  it('merges server photos and queued photos without double counting', () => {
    const plan = buildShotPlan(
      [rack],
      [
        { id: 'p1', clientUuid: 'u1', category: 'rack', status: 'approved' },
        { id: 'p2', clientUuid: 'u2', category: 'rack', status: 'pending_review' },
      ],
      [
        { clientUuid: 'u2', category: 'rack', status: 'done' },
        { clientUuid: 'u2', category: 'rack', status: 'linking' }, // already on server
        { clientUuid: 'u3', category: 'rack', status: 'queued' },
      ],
    );
    expect(plan[0]).toMatchObject({ approved: 1, inReview: 1, local: 1, captured: 3, complete: true });
  });

  it('a rejected photo keeps the category incomplete until it is fixed', () => {
    const shots = rack.requiredShots.length;
    const server: ServerPhotoLite[] = Array.from({ length: shots }, (_, i) => ({ id: `p${i}`, clientUuid: `u${i}`, category: 'rack', status: 'approved' }));
    server.push({ id: 'bad', clientUuid: 'bad', category: 'rack', status: 'rejected' });
    const plan = buildShotPlan([rack], server, []);
    expect(plan[0]).toMatchObject({ rejected: 1, complete: false });
    expect(visitCompletion(plan)).toEqual({ done: 0, total: 1 });
  });
});

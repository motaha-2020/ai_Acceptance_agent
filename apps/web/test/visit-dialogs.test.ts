import { describe, expect, it } from 'vitest';
import { assignmentDiff } from '@/features/sites/visit-dialogs';

describe('visit technician assignment', () => {
  it('adds newly selected and removes deselected technicians only', () => {
    expect(assignmentDiff(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
  });
  it('is a no-op when nothing changed (order does not matter)', () => {
    expect(assignmentDiff(['a', 'b'], ['b', 'a'])).toEqual({ add: [], remove: [] });
  });
  it('handles an unassigned visit and clearing everyone', () => {
    expect(assignmentDiff([], ['x'])).toEqual({ add: ['x'], remove: [] });
    expect(assignmentDiff(['x'], [])).toEqual({ add: [], remove: ['x'] });
  });
});

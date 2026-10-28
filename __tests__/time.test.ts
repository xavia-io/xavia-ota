import { formatWatTimestamp } from '../components/time';

describe('WAT timestamps', () => {
  it('displays an ISO UTC publication time one hour ahead without a timezone label', () => {
    expect(formatWatTimestamp('2026-09-25T17:32:00.000Z')).toBe('Sep 25, 2026 18:32');
    expect(formatWatTimestamp('2026-09-25T23:30:00.000Z', 'MMM D, HH:mm')).toBe('Sep 26, 00:30');
  });
});

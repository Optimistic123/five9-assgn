import { formatLaunchDate } from '../utils/formatDate';

describe('formatLaunchDate', () => {
  it('formats as "Mon DD YYYY" in UTC', () => {
    expect(formatLaunchDate('2014-09-07T05:00:00.000Z')).toBe('Sep 07 2014');
    expect(formatLaunchDate('2019-04-01T23:59:00.000Z')).toBe('Apr 01 2019');
  });

  it('handles invalid input', () => {
    expect(formatLaunchDate('nope')).toBe('—');
  });
});

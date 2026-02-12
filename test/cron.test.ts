// Tests for the cron expression parser and next-fire computation

import { describe, it, expect } from 'vitest';
import { parseCron, getNextFire, isValidCron } from '../src/scheduler/cron';

describe('Cron Expression Parsing', () => {
  describe('parseCron', () => {
    it('parses wildcard fields', () => {
      const fields = parseCron('* * * * *');
      expect(fields.minutes.size).toBe(60);
      expect(fields.hours.size).toBe(24);
      expect(fields.daysOfMonth.size).toBe(31);
      expect(fields.months.size).toBe(12);
      expect(fields.daysOfWeek.size).toBe(7);
    });

    it('parses specific values', () => {
      const fields = parseCron('30 9 * * 1');
      expect(fields.minutes).toEqual(new Set([30]));
      expect(fields.hours).toEqual(new Set([9]));
      expect(fields.daysOfWeek).toEqual(new Set([1]));
    });

    it('parses ranges', () => {
      const fields = parseCron('0 9 * * 1-5');
      expect(fields.daysOfWeek).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it('parses lists', () => {
      const fields = parseCron('0 9,12,18 * * *');
      expect(fields.hours).toEqual(new Set([9, 12, 18]));
    });

    it('parses steps', () => {
      const fields = parseCron('*/15 * * * *');
      expect(fields.minutes).toEqual(new Set([0, 15, 30, 45]));
    });

    it('parses named days', () => {
      const fields = parseCron('0 9 * * MON-FRI');
      expect(fields.daysOfWeek).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it('parses named months', () => {
      const fields = parseCron('0 9 1 JAN,JUN *');
      expect(fields.months).toEqual(new Set([1, 6]));
    });

    it('parses complex expression', () => {
      const fields = parseCron('0,30 9-17 1-15 * 1-5');
      expect(fields.minutes).toEqual(new Set([0, 30]));
      expect(fields.hours.size).toBe(9); // 9,10,11,12,13,14,15,16,17
      expect(fields.daysOfMonth.size).toBe(15);
      expect(fields.daysOfWeek).toEqual(new Set([1, 2, 3, 4, 5]));
    });

    it('throws on invalid field count', () => {
      expect(() => parseCron('* * *')).toThrow('expected 5 fields');
    });

    it('throws on invalid values', () => {
      expect(() => parseCron('60 * * * *')).toThrow(); // minute > 59
      expect(() => parseCron('* 25 * * *')).toThrow(); // hour > 23
    });
  });

  describe('isValidCron', () => {
    it('validates correct expressions', () => {
      expect(isValidCron('* * * * *')).toBe(true);
      expect(isValidCron('0 9 * * 1-5')).toBe(true);
      expect(isValidCron('*/5 * * * *')).toBe(true);
      expect(isValidCron('0 9 * * MON')).toBe(true);
    });

    it('rejects invalid expressions', () => {
      expect(isValidCron('')).toBe(false);
      expect(isValidCron('* *')).toBe(false);
      expect(isValidCron('60 * * * *')).toBe(false);
      expect(isValidCron('not a cron')).toBe(false);
    });
  });

  describe('getNextFire', () => {
    it('computes next fire for every-minute cron', () => {
      const after = new Date('2026-02-12T10:30:00');
      const next = getNextFire('* * * * *', after);
      expect(next.getMinutes()).toBe(31);
      expect(next.getHours()).toBe(10);
    });

    it('computes next fire for specific time', () => {
      const after = new Date('2026-02-12T08:00:00');
      const next = getNextFire('0 9 * * *', after);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(12);
    });

    it('advances to next day if time passed', () => {
      const after = new Date('2026-02-12T10:00:00');
      const next = getNextFire('0 9 * * *', after);
      expect(next.getDate()).toBe(13);
      expect(next.getHours()).toBe(9);
    });

    it('finds next Monday for weekly cron', () => {
      // Feb 12 2026 is a Thursday
      const after = new Date('2026-02-12T10:00:00');
      const next = getNextFire('0 9 * * 1', after);
      expect(next.getDay()).toBe(1); // Monday
      expect(next.getDate()).toBe(16); // Next Monday
    });

    it('handles weekday-only schedules', () => {
      // Feb 14 2026 is a Saturday
      const after = new Date('2026-02-14T10:00:00');
      const next = getNextFire('0 9 * * 1-5', after);
      expect(next.getDay()).toBeGreaterThanOrEqual(1);
      expect(next.getDay()).toBeLessThanOrEqual(5);
    });

    it('handles step expressions for next fire', () => {
      const after = new Date('2026-02-12T10:07:00');
      const next = getNextFire('*/15 * * * *', after);
      expect(next.getMinutes()).toBe(15);
    });
  });
});

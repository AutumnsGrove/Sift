import { describe, it, expect } from 'vitest';
import { isCommand } from '../src/pipeline/commands';

describe('Command Detection', () => {
  it('should detect valid commands', () => {
    expect(isCommand('/start')).toBe(true);
    expect(isCommand('/help')).toBe(true);
    expect(isCommand('/board')).toBe(true);
    expect(isCommand('/today')).toBe(true);
    expect(isCommand('/stats')).toBe(true);
    expect(isCommand('/schedules')).toBe(true);
  });

  it('should detect commands with arguments', () => {
    expect(isCommand('/board --filter high')).toBe(true);
    expect(isCommand('/help about schedules')).toBe(true);
  });

  it('should ignore text that is not a command', () => {
    expect(isCommand('hey what\'s up')).toBe(false);
    expect(isCommand('finish the auth migration')).toBe(false);
    expect(isCommand('show me my board')).toBe(false);
  });

  it('should handle commands with leading/trailing whitespace', () => {
    expect(isCommand('  /start  ')).toBe(true);
    expect(isCommand('\n/help\n')).toBe(true);
  });

  it('should not treat URLs as commands', () => {
    expect(isCommand('https://example.com')).toBe(false);
    expect(isCommand('http://test.com/path')).toBe(false);
  });

  it('should not treat forward slashes in text as commands', () => {
    expect(isCommand('check the docs at docs/README.md')).toBe(false);
    expect(isCommand('the path is /usr/local/bin')).toBe(false);
  });
});

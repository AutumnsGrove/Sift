// Tests for the heuristic intent classification fallback
// These patterns fire when AI parsing fails

import { describe, it, expect } from 'vitest';

type InputIntent = 'brain_dump' | 'query' | 'update' | 'chat' | 'schedule';

// Replicated from ai/classify.ts for testing
function heuristicClassify(text: string): InputIntent {
  const lower = text.toLowerCase();

  if (/\b(what|show|list|how many|which|where|when)\b.*\b(tasks?|todos?|board|plate|due|overdue|progress)\b/.test(lower)) {
    return 'query';
  }

  if (/\b(done|finished|completed|moved?|bump|change|archive|cancel)\b/.test(lower)) {
    return 'update';
  }

  if (/\b(every|remind|recurring|repeat|schedule|daily|weekly|monthly)\b/.test(lower)) {
    return 'schedule';
  }

  if (/^(hey|hi|hello|thanks|thank you|how are you|what are you)\b/.test(lower)) {
    return 'chat';
  }

  return 'brain_dump';
}

describe('Heuristic Intent Classification', () => {
  describe('query intent', () => {
    it('detects "what\'s on my plate"', () => {
      expect(heuristicClassify("what's on my plate today")).toBe('query');
    });

    it('detects "show me tasks"', () => {
      expect(heuristicClassify("show me my tasks")).toBe('query');
    });

    it('detects "what\'s due"', () => {
      expect(heuristicClassify("what's due this week")).toBe('query');
    });

    it('detects "list overdue"', () => {
      expect(heuristicClassify("list overdue items")).toBe('query');
    });

    it('detects "show board"', () => {
      expect(heuristicClassify("show me my board")).toBe('query');
    });
  });

  describe('update intent', () => {
    it('detects "is done"', () => {
      expect(heuristicClassify("the stripe thing is done")).toBe('update');
    });

    it('detects "finished"', () => {
      expect(heuristicClassify("finished the auth migration")).toBe('update');
    });

    it('detects "bump to high"', () => {
      expect(heuristicClassify("bump that to high priority")).toBe('update');
    });

    it('detects "archive"', () => {
      expect(heuristicClassify("archive the old research task")).toBe('update');
    });

    it('detects "move"', () => {
      expect(heuristicClassify("move that to in progress")).toBe('update');
    });
  });

  describe('schedule intent', () => {
    it('detects "every Monday"', () => {
      expect(heuristicClassify("every Monday review the board")).toBe('schedule');
    });

    it('detects "remind me"', () => {
      expect(heuristicClassify("remind me to water the plants")).toBe('schedule');
    });

    it('detects "weekly"', () => {
      expect(heuristicClassify("weekly standup notes")).toBe('schedule');
    });

    it('detects "recurring"', () => {
      expect(heuristicClassify("set up a recurring check")).toBe('schedule');
    });
  });

  describe('chat intent', () => {
    it('detects "hey"', () => {
      expect(heuristicClassify("hey there")).toBe('chat');
    });

    it('detects "hello"', () => {
      expect(heuristicClassify("hello")).toBe('chat');
    });

    it('detects "thanks"', () => {
      expect(heuristicClassify("thanks for that")).toBe('chat');
    });
  });

  describe('brain_dump intent (default)', () => {
    it('treats task descriptions as brain dump', () => {
      expect(heuristicClassify("I need to fix the auth bug and call the dentist")).toBe('brain_dump');
    });

    it('treats random text as brain dump', () => {
      expect(heuristicClassify("figure out the D1 trigger situation")).toBe('brain_dump');
    });

    it('treats long dumps as brain dump', () => {
      expect(
        heuristicClassify(
          "ok so I need to fix the payments flow, also write the newsletter, and check if D1 supports foreign keys"
        )
      ).toBe('brain_dump');
    });
  });
});

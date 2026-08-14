import { describe, expect, it } from 'bun:test';
import { parseEpisodeSummaryResponse } from '../episode-events.js';

const twoEventsJson = {
  summary: 'The group planned dinner and Dan was late again.',
  events: [
    {
      who: ['Dana', 'Noam'],
      what: 'Picked a restaurant',
      when: 'Thursday',
      why_it_matters: 'Locks the weekly plan',
    },
    { who: ['Dan'], what: 'Showed up late' },
  ],
};

describe('parseEpisodeSummaryResponse', () => {
  it('parses valid JSON with 2 events', () => {
    expect(parseEpisodeSummaryResponse(JSON.stringify(twoEventsJson))).toEqual(twoEventsJson);
  });

  it('parses markdown-fenced JSON', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(twoEventsJson)}\n\`\`\``;
    expect(parseEpisodeSummaryResponse(fenced)).toEqual(twoEventsJson);
  });

  it('treats legacy prose as summary with no events', () => {
    const prose = 'The group talked about dinner plans and Dan was late.';
    expect(parseEpisodeSummaryResponse(prose)).toEqual({ summary: prose, events: [] });
  });

  it('falls back when invalid text looks like a JSON object', () => {
    expect(parseEpisodeSummaryResponse('{ summary: not-json, events: [ }')).toEqual({
      summary: 'Group activity.',
      events: [],
    });
  });

  it('caps events at 3', () => {
    const result = parseEpisodeSummaryResponse(
      JSON.stringify({
        summary: 'A busy stretch.',
        events: [
          { who: ['A'], what: 'One' },
          { who: ['B'], what: 'Two' },
          { who: ['C'], what: 'Three' },
          { who: ['D'], what: 'Four' },
        ],
      }),
    );
    expect(result.events).toHaveLength(3);
    expect(result.events.map((e) => e.what)).toEqual(['One', 'Two', 'Three']);
  });

  it('drops events with empty what', () => {
    const result = parseEpisodeSummaryResponse(
      JSON.stringify({
        summary: 'Mostly noise.',
        events: [{ who: ['A'], what: '' }, { who: ['B'], what: 'Kept the plan' }, { who: ['C'] }],
      }),
    );
    expect(result.events).toEqual([{ who: ['B'], what: 'Kept the plan' }]);
  });

  it('accepts a bare JSON string as the summary', () => {
    expect(parseEpisodeSummaryResponse(JSON.stringify('Dinner talk, no decisions.'))).toEqual({
      summary: 'Dinner talk, no decisions.',
      events: [],
    });
  });

  it('defaults missing who to [] and empty summary to Group activity.', () => {
    expect(
      parseEpisodeSummaryResponse(JSON.stringify({ summary: '   ', events: [{ what: 'Booked a table' }] })),
    ).toEqual({
      summary: 'Group activity.',
      events: [{ who: [], what: 'Booked a table' }],
    });
  });
});

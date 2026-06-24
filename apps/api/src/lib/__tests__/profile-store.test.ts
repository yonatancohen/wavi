import { describe, it, expect } from 'bun:test';
import { mergeProfileFromIngest } from '../profile-merge.js';
import type { UserProfileData } from '@wavi/shared';

const baseProfileData: UserProfileData = {
  humor_type: 'dry',
  humor_score: 50,
  formality_score: 40,
  activity_level: 'medium',
  dominant_topics: ['work'],
  sensitivity_flags: [],
  emoji_usage: 'moderate',
  avg_message_length: 'medium',
  aliases: ['Old Name'],
};

describe('mergeProfileFromIngest', () => {
  it('preserves locked display name and summary', () => {
    const existing = {
      display_name: 'Curated Name',
      behavioral_summary: 'Hand-written summary',
      msg_count: 10,
      profile_data: {
        ...baseProfileData,
        curation: { display_name_locked: true, summary_locked: true },
      },
    };

    const incoming = {
      group_id: 'g1',
      wa_user_id: '123',
      display_name: 'Export Name',
      behavioral_summary: 'LLM summary',
      msg_count: 100,
      profile_data: { ...baseProfileData, aliases: ['Export Alias'] },
    };

    const merged = mergeProfileFromIngest(existing, incoming);
    expect(merged.display_name).toBe('Curated Name');
    expect(merged.behavioral_summary).toBe('Hand-written summary');
    expect(merged.msg_count).toBe(100);
    expect(merged.profile_data.aliases).toContain('Old Name');
    expect(merged.profile_data.aliases).toContain('Export Alias');
  });

  it('replaces unlocked fields from ingest', () => {
    const existing = {
      display_name: 'Old',
      behavioral_summary: 'Old summary',
      msg_count: 5,
      profile_data: baseProfileData,
    };

    const incoming = {
      group_id: 'g1',
      wa_user_id: '123',
      display_name: 'New',
      behavioral_summary: 'New summary',
      msg_count: 20,
      profile_data: { ...baseProfileData, aliases: ['A'] },
    };

    const merged = mergeProfileFromIngest(existing, incoming);
    expect(merged.display_name).toBe('New');
    expect(merged.behavioral_summary).toBe('New summary');
  });
});

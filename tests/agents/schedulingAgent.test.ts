import { describe, it, expect } from 'vitest';
import { buildSchedulingPrompt } from '../../src/agents/schedulingAgent.js';
import type { Job, CrewProfile } from '../../src/types/index.js';

const sampleJob: Partial<Job> = {
  jobNumber: '600049',
  itemName: 'GILROY #600049',
  jobType: 'deck',
  address: '123 Main St',
  materialReady: true,
  trailerNeeded: [],
};

const sampleCrew: Partial<CrewProfile> = {
  key: 'santiago',
  displayName: 'Santiago',
  strengths: ['deck install'],
  cautions: [],
  reliability: 'high',
};

describe('buildSchedulingPrompt', () => {
  it('includes all job numbers in the prompt', () => {
    const prompt = buildSchedulingPrompt(
      [sampleJob as Job],
      [sampleCrew as CrewProfile],
      '2026-05-13'
    );
    expect(prompt).toContain('600049');
    expect(prompt).toContain('santiago');
    expect(prompt).toContain('2026-05-13');
  });

  it('includes scheduling rules in the prompt', () => {
    const prompt = buildSchedulingPrompt([], [], '2026-05-13');
    expect(prompt).toContain('coping');
    expect(prompt).toContain('Toby');
    expect(prompt).toContain('material_ready');
  });
});

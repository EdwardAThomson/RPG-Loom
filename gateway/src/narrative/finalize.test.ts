import { describe, it, expect } from 'vitest';
import { applyLengthBudget, finalizeBlock, MAX_LINES, MAX_CHARS_PER_LINE, MAX_CHARS_TOTAL, MAX_TAGS, MAX_TITLE_CHARS } from './finalize.js';
import type { NarrativeTaskDTO } from '@rpg-loom/shared';

const TASK: NarrativeTaskDTO = {
    id: 't1',
    type: 'quest_flavor',
    createdAtMs: 0,
    backendId: 'mock',
    references: { questId: 'q_abc' },
    facts: {}
};

describe('applyLengthBudget', () => {
    it('passes through short lines unchanged', () => {
        const lines = applyLengthBudget(['Hello.', 'World.']);
        expect(lines).toEqual(['Hello.', 'World.']);
    });

    it('coerces a non-array string into a single-line array', () => {
        const lines = applyLengthBudget('A single string.');
        expect(lines).toEqual(['A single string.']);
    });

    it('returns empty array for null / undefined / empty', () => {
        expect(applyLengthBudget(undefined)).toEqual([]);
        expect(applyLengthBudget(null)).toEqual([]);
        expect(applyLengthBudget([])).toEqual([]);
    });

    it('caps the number of lines at MAX_LINES', () => {
        const many = Array.from({ length: 20 }, (_, i) => `line ${i}`);
        const lines = applyLengthBudget(many);
        expect(lines.length).toBe(MAX_LINES);
    });

    it('truncates an over-long line with an ellipsis', () => {
        const long = 'x'.repeat(MAX_CHARS_PER_LINE + 50);
        const [out] = applyLengthBudget([long]);
        expect(out.length).toBe(MAX_CHARS_PER_LINE);
        expect(out.endsWith('…')).toBe(true);
    });

    it('drops trailing lines once MAX_CHARS_TOTAL is exhausted', () => {
        // Each "line" is just under the per-line cap; many of them
        // together blow the total budget.
        const chunk = 'a'.repeat(200);
        const many = Array.from({ length: 10 }, () => chunk);
        const lines = applyLengthBudget(many);
        const total = lines.reduce((sum, l) => sum + l.length, 0);
        expect(total).toBeLessThanOrEqual(MAX_CHARS_TOTAL);
        // We should have stopped well before MAX_LINES too in this case.
        expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
    });

    it('skips empty strings', () => {
        expect(applyLengthBudget(['', 'a', '', 'b'])).toEqual(['a', 'b']);
    });
});

describe('finalizeBlock', () => {
    it('uses task references verbatim, ignoring AI-supplied refs', () => {
        const block = finalizeBlock({
            id: 'ai-supplied-id',
            references: { questId: 'AI_INVENTED' },
            lines: ['ok'],
            tags: ['ai-tag']
        }, TASK);
        expect(block.references).toEqual({ questId: 'q_abc' });
    });

    it('caps tags at MAX_TAGS', () => {
        const block = finalizeBlock({
            tags: Array.from({ length: 20 }, (_, i) => `t${i}`)
        }, TASK);
        expect(block.tags.length).toBe(MAX_TAGS);
    });

    it('defaults tags to the task\'s backendId when none provided', () => {
        // TASK.backendId is 'mock'.
        const block = finalizeBlock({}, TASK);
        expect(block.tags).toEqual(['mock']);
    });

    it('falls back to "unknown" when backendId is null', () => {
        const noBackend = { ...TASK, backendId: null };
        const block = finalizeBlock({}, noBackend);
        expect(block.tags).toEqual(['unknown']);
    });

    it('generates a uuid id when none is provided', () => {
        const block = finalizeBlock({ lines: ['x'] }, TASK);
        expect(block.id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('truncates an over-long title', () => {
        const longTitle = 'T'.repeat(MAX_TITLE_CHARS + 20);
        const block = finalizeBlock({ title: longTitle, lines: ['x'] }, TASK);
        expect(block.title?.length).toBe(MAX_TITLE_CHARS);
        expect(block.title?.endsWith('…')).toBe(true);
    });

    it('leaves a short title alone', () => {
        const block = finalizeBlock({ title: 'A Short Title', lines: ['x'] }, TASK);
        expect(block.title).toBe('A Short Title');
    });

    it('drops a non-string title', () => {
        const block = finalizeBlock({ title: 12345, lines: ['x'] }, TASK);
        expect(block.title).toBeUndefined();
    });

    it('applies length budget to lines', () => {
        const block = finalizeBlock({
            lines: Array.from({ length: 20 }, (_, i) => `line ${i}`)
        }, TASK);
        expect(block.lines.length).toBe(MAX_LINES);
    });

    it('uses the task type, not any type field from the AI', () => {
        const block = finalizeBlock({ type: 'rumor_feed' }, TASK);
        expect(block.type).toBe('quest_flavor');
    });
});

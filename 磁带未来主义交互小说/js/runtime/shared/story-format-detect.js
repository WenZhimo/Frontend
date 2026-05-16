import { normalizeLegacyStory } from '../formats/story-format-v1.js';
import { isStrongV2Story, normalizeV2Story } from '../formats/story-format-v2.js';

export function detectStoryFormat(rawStory) {
    if (!rawStory || typeof rawStory !== 'object' || Array.isArray(rawStory)) {
        throw new Error('Unsupported story format.');
    }

    if (isStrongV2Story(rawStory)) {
        return 'v2';
    }

    if (Array.isArray(rawStory.nodes)) {
        return 'v2-compat';
    }

    return 'v1';
}

export function normalizeStory(rawStory) {
    const format = detectStoryFormat(rawStory);
    return format === 'v1'
        ? normalizeLegacyStory(rawStory)
        : normalizeV2Story(rawStory);
}

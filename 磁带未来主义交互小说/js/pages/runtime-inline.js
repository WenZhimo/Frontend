import { normalizeStory } from '../runtime/shared/story-format-detect.js';
import { createNormalizedStory } from '../runtime/shared/story-runtime-core.js';
import { createRuntimeApp, createTerminalImageRenderer } from '../runtime/shared/story-runtime-ui.js';

const textElement = document.getElementById('story-text');
const choicesElement = document.getElementById('choices');
const clockElement = document.getElementById('clock');

const app = createRuntimeApp({
    textElement,
    choicesElement,
    clockElement,
    imageRenderer: createTerminalImageRenderer(textElement)
});
app.startClock();
app.bindSkipOnBodyClick();

const inlineStory = window.__INLINE_STORY__;
app.loadStory(createNormalizedStory(normalizeStory(inlineStory)));

const bootText = 'BIOS DATE 01/01/1985 14:22:56 VER 1.02\nCPU: NEC V20, SPEED: 8 MHz\n640K RAM SYSTEM... \\C[#0f0]{OK}\nLOADING CASSETTE INTERFACE...\\.\\.\\.';
app.bootSequence(bootText, () => {
    setTimeout(() => {
        const story = app.getCurrentStory();
        if (story) {
            app.showNode(story.startNodeId);
        }
    }, 1000);
});

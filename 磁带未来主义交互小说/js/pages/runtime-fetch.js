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

function bootStory() {
    const bootText = 'BIOS DATE 01/01/1985 14:22:56 VER 1.02\nCPU: NEC V20, SPEED: 8 MHz\n640K RAM SYSTEM... \\C[#0f0]{OK}\nLOADING CASSETTE INTERFACE\\..\\..\\..';
    app.bootSequence(bootText, () => {
        setTimeout(() => {
            const story = app.getCurrentStory();
            if (story) {
                app.showNode(story.startNodeId);
            }
        }, 1000);
    });
}

fetch('./stories/巡逻舰经过时_story.v2.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
    })
    .then(rawStory => {
        app.loadStory(createNormalizedStory(normalizeStory(rawStory)));
        bootStory();
    })
    .catch(() => {
        textElement.innerHTML = '';
        app.typewriter.start(app.queueFromLegacyText('\\C[red]{ERROR: CARTRIDGE NOT FOUND.}\\.\n请确保使用本地服务器运行此网页，或者 story.json 文件格式无效。'));
    });

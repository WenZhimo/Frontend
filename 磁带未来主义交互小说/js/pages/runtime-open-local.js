import { normalizeStory } from '../runtime/shared/story-format-detect.js';
import { createNormalizedStory } from '../runtime/shared/story-runtime-core.js';
import { createRuntimeApp, createTerminalImageRenderer } from '../runtime/shared/story-runtime-ui.js';

const textElement = document.getElementById('story-text');
const choicesElement = document.getElementById('choices');
const clockElement = document.getElementById('clock');
const fileInput = document.getElementById('json-loader');

const app = createRuntimeApp({
    textElement,
    choicesElement,
    clockElement,
    imageRenderer: createTerminalImageRenderer(textElement)
});
app.startClock();
app.bindSkipOnBodyClick();

function bootStory() {
    const bootText = 'BIOS DATE 01/01/1985 14:22:56 VER 1.02\nCPU: NEC V20, SPEED: 8 MHz\n640K RAM SYSTEM... \\C[#0f0]{OK}\nLOADING CASSETTE INTERFACE...\\.\\.\\.';
    app.bootSequence(bootText, () => {
        setTimeout(() => {
            const story = app.getCurrentStory();
            if (story) {
                app.showNode(story.startNodeId);
            }
        }, 1000);
    });
}

function appendChoiceButton(label, onClick) {
    const button = document.createElement('button');
    button.innerText = label;
    button.onclick = event => {
        event.stopPropagation();
        onClick();
    };
    choicesElement.appendChild(button);
}

function showFoundUI(story) {
    app.typewriter.start(app.queueFromLegacyText('\n\n\\C[#0f0]{SIGNAL DETECTED: \\_{ [STORY.JSON] } }\\.\nINTEGRITY CHECK: OK.'), () => {
        appendChoiceButton('EXECUTE [AUTO LOAD]', () => {
            app.loadStory(story);
            bootStory();
        });
        appendChoiceButton('MANUAL OVERRIDE [INSERT TAPE]', () => {
            fileInput.click();
        });
        textElement.scrollTop = textElement.scrollHeight;
    });
}

function showMissingUI() {
    app.typewriter.start(app.queueFromLegacyText('\n\n\\C[red]{NO CARTRIDGE DETECTED.}\\.\nPLEASE INSERT DATA MANUALLY.'), () => {
        appendChoiceButton('INSERT TAPE [SELECT FILE]', () => {
            fileInput.click();
        });
        textElement.scrollTop = textElement.scrollHeight;
    });
}

function showLoadErrorUI() {
    app.typewriter.start(app.queueFromLegacyText('\n\n\\C[red]{DATA CARTRIDGE DETECTED, BUT THE SIGNAL IS CORRUPTED.}\\.\nPLEASE LOAD A VALID STORY FILE MANUALLY.'), () => {
        appendChoiceButton('MANUAL RECOVERY [SELECT FILE]', () => {
            fileInput.click();
        });
        textElement.scrollTop = textElement.scrollHeight;
    });
}

function preloadStory() {
    const scanText = 'SYSTEM ONLINE.\nINITIALIZING NET_PROTOCOL... \\.\\.\nSEARCHING FOR DATA CARTRIDGE...\\.';
    app.typewriter.start(app.queueFromLegacyText(scanText), () => {
        fetch('./stories/磁带主义story.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status === 404 ? '404' : `HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(rawStory => {
                showFoundUI(createNormalizedStory(normalizeStory(rawStory)));
            })
            .catch(error => {
                if (error.message === '404') {
                    showMissingUI();
                    return;
                }
                console.error('Failed to preload story:', error);
                showLoadErrorUI();
            });
    });
}

fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    textElement.innerText = 'READING MAGNETIC TAPE...\nDECODING SECTORS...';
    choicesElement.innerHTML = '';

    const reader = new FileReader();
    reader.onload = loadEvent => {
        try {
            const rawStory = JSON.parse(loadEvent.target.result);
            app.loadStory(createNormalizedStory(normalizeStory(rawStory)));
            setTimeout(bootStory, 1000);
        } catch (error) {
            console.error('Failed to load story file:', error);
            textElement.innerHTML = '';
            app.typewriter.start(app.queueFromLegacyText('\\C[red]{FATAL ERROR: DATA CORRUPTED.}\\.\n无法解析 JSON 文件或格式不符合协议。'));
            appendChoiceButton('RETRY LOAD', () => {
                fileInput.click();
            });
        }
    };
    reader.readAsText(file);
});

preloadStory();

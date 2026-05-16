import { contentTokensToTypeQueue, createTypewriterController } from './story-runtime-core.js';
import { tokenizeLegacyText } from '../formats/story-format-v1.js';

export function createTerminalImageRenderer(textElement) {
    return function renderImage(imagePath) {
        const imgContainer = document.createElement('div');
        imgContainer.className = 'terminal-img-container';
        imgContainer.style.display = 'block';

        const img = document.createElement('img');
        img.src = imagePath;
        img.className = 'terminal-img';
        img.onerror = function() {
            imgContainer.style.display = 'none';
            const errSpan = document.createElement('div');
            errSpan.innerHTML = '<span style="color:red;font-size:0.8em;">[ERR: IMAGE_DATA_CORRUPT]</span>';
            textElement.appendChild(errSpan);
        };

        const overlay = document.createElement('div');
        overlay.className = 'terminal-img-overlay';

        imgContainer.appendChild(img);
        imgContainer.appendChild(overlay);
        textElement.appendChild(imgContainer);
    };
}

export function createRuntimeApp({ textElement, choicesElement, clockElement, imageRenderer = null }) {
    let currentStory = null;
    const typewriter = createTypewriterController({ textElement });

    function updateClock() {
        if (!clockElement) {
            return;
        }
        clockElement.innerText = new Date().toLocaleTimeString('en-US', { hour12: false });
    }

    function renderNodeImage(imagePath) {
        if (!imageRenderer || !imagePath) {
            return;
        }
        imageRenderer(imagePath);
    }

    function renderChoices(options) {
        options.forEach(option => {
            const button = document.createElement('button');
            button.innerText = option.text;
            button.onclick = event => {
                event.stopPropagation();
                if (option.target) {
                    showNode(option.target);
                }
            };
            choicesElement.appendChild(button);
        });
    }

    function showError(message) {
        textElement.innerHTML = '';
        choicesElement.innerHTML = '';
        typewriter.start(contentTokensToTypeQueue([
            {
                type: 'styled',
                color: 'red',
                underline: false,
                strike: false,
                children: [{ type: 'text', value: message }]
            }
        ]));
    }

    function showNode(nodeId) {
        const node = currentStory?.nodeMap[nodeId];
        if (!node) {
            showError(`ERROR: SECTOR [${nodeId}] NOT FOUND.`);
            return;
        }

        textElement.innerHTML = '';
        choicesElement.innerHTML = '';
        renderNodeImage(node.image);
        typewriter.start(contentTokensToTypeQueue(node.content), () => {
            renderChoices(node.options);
            textElement.scrollTop = textElement.scrollHeight;
        });
    }

    function queueFromLegacyText(text) {
        return contentTokensToTypeQueue(tokenizeLegacyText(text));
    }

    function bootSequence(bootText, onComplete) {
        textElement.innerHTML = '';
        choicesElement.innerHTML = '';
        typewriter.start(queueFromLegacyText(bootText), onComplete);
    }

    function bindSkipOnBodyClick() {
        document.body.addEventListener('click', event => {
            if (event.target.tagName === 'BUTTON') {
                return;
            }
            if (typewriter.isTyping) {
                typewriter.finishImmediately();
            }
        });
    }

    updateClock();
    return {
        bindSkipOnBodyClick,
        bootSequence,
        getCurrentStory() {
            return currentStory;
        },
        loadStory(story) {
            currentStory = story;
        },
        queueFromLegacyText,
        renderChoices,
        showError,
        showNode,
        startClock() {
            updateClock();
            return setInterval(updateClock, 1000);
        },
        typewriter
    };
}

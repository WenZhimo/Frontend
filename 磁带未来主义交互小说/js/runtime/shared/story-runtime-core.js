export function buildNodeMap(nodes) {
    return nodes.reduce((map, node) => {
        if (!node.id) {
            return map;
        }
        if (map[node.id]) {
            throw new Error(`Duplicate node id: ${node.id}`);
        }
        map[node.id] = node;
        return map;
    }, {});
}

export function getInitialNodeId(story) {
    if (story.startNodeId && story.nodeMap[story.startNodeId]) {
        return story.startNodeId;
    }
    return story.nodes[0]?.id || '';
}

export function createNormalizedStory(rawStory) {
    if (!rawStory || !Array.isArray(rawStory.nodes) || rawStory.nodes.length === 0) {
        throw new Error('Story must contain at least one node.');
    }

    const normalizedStory = {
        meta: rawStory.meta,
        nodes: rawStory.nodes,
        editor: rawStory.editor || {},
        nodeMap: buildNodeMap(rawStory.nodes),
        startNodeId: rawStory.startNodeId || ''
    };

    normalizedStory.startNodeId = getInitialNodeId(normalizedStory);
    return normalizedStory;
}

export function mergeTextStyle(baseStyle, styleToken) {
    return {
        color: styleToken.color || baseStyle.color,
        underline: baseStyle.underline || Boolean(styleToken.underline),
        strike: baseStyle.strike || Boolean(styleToken.strike)
    };
}

export function styleToCssText(style) {
    const segments = [];
    if (style.color) {
        segments.push(`color: ${style.color};`);
    }

    const decorations = [];
    if (style.underline) decorations.push('underline');
    if (style.strike) decorations.push('line-through');
    if (decorations.length > 0) {
        segments.push(`text-decoration: ${decorations.join(' ')};`);
    }

    return segments.join(' ');
}

export function contentTokensToTypeQueue(tokens, inheritedStyle = { color: '', underline: false, strike: false }) {
    const queue = [];

    for (const token of tokens || []) {
        if (token.type === 'pause') {
            queue.push({ type: 'wait', ms: token.ms });
            continue;
        }

        if (token.type === 'text') {
            const style = styleToCssText(inheritedStyle);
            for (const char of token.value) {
                queue.push({ type: 'char', char, style });
            }
            continue;
        }

        if (token.type === 'styled') {
            queue.push(...contentTokensToTypeQueue(token.children, mergeTextStyle(inheritedStyle, token)));
        }
    }

    return queue;
}

export function createTypewriterController({ textElement }) {
    const state = {
        queue: [],
        index: 0,
        callback: null,
        timer: null,
        isTyping: false
    };

    function appendCharToScreen(item) {
        const span = document.createElement('span');
        span.textContent = item.char;
        span.className = 'char-span';
        if (item.style) {
            span.style.cssText = item.style;
        }
        textElement.appendChild(span);
    }

    function processNext() {
        if (state.index >= state.queue.length) {
            state.isTyping = false;
            if (state.callback) {
                state.callback();
            }
            return;
        }

        const item = state.queue[state.index];
        state.index++;

        if (item.type === 'wait') {
            state.timer = setTimeout(processNext, item.ms);
            return;
        }

        appendCharToScreen(item);
        textElement.scrollTop = textElement.scrollHeight;
        let speed = Math.random() * 30 + 10;
        if (['.', '?', '!', '\n'].includes(item.char)) {
            speed += 200;
        }
        state.timer = setTimeout(processNext, speed);
    }

    return {
        get isTyping() {
            return state.isTyping;
        },
        start(queue, callback) {
            if (state.timer) {
                clearTimeout(state.timer);
            }
            state.queue = queue;
            state.index = 0;
            state.callback = callback;
            state.isTyping = true;
            processNext();
        },
        finishImmediately() {
            if (!state.isTyping) {
                return;
            }
            clearTimeout(state.timer);
            while (state.index < state.queue.length) {
                const item = state.queue[state.index];
                state.index++;
                if (item.type === 'char') {
                    appendCharToScreen(item);
                }
            }
            textElement.scrollTop = textElement.scrollHeight;
            state.isTyping = false;
            if (state.callback) {
                state.callback();
            }
        }
    };
}

export function findClosingBrace(text, startIndex) {
    let depth = 0;
    for (let index = startIndex; index < text.length; index++) {
        if (text[index] === '{') {
            depth++;
        }
        if (text[index] === '}') {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

export function tokenizeLegacyText(text) {
    function walk(source) {
        const tokens = [];
        let cursor = 0;
        let buffer = '';

        function flushBuffer() {
            if (!buffer) {
                return;
            }
            tokens.push({ type: 'text', value: buffer });
            buffer = '';
        }

        while (cursor < source.length) {
            if (source.startsWith('\\.', cursor)) {
                flushBuffer();
                tokens.push({ type: 'pause', ms: 500 });
                cursor += 2;
                continue;
            }

            if (source.startsWith('\\C[', cursor)) {
                const colorEnd = source.indexOf(']', cursor);
                if (colorEnd > -1 && source[colorEnd + 1] === '{') {
                    const contentEnd = findClosingBrace(source, colorEnd + 1);
                    if (contentEnd > -1) {
                        flushBuffer();
                        tokens.push({
                            type: 'styled',
                            color: source.substring(cursor + 3, colorEnd),
                            underline: false,
                            strike: false,
                            children: walk(source.substring(colorEnd + 2, contentEnd))
                        });
                        cursor = contentEnd + 1;
                        continue;
                    }
                }
            }

            if (source.startsWith('\\-{', cursor)) {
                const contentEnd = findClosingBrace(source, cursor + 2);
                if (contentEnd > -1) {
                    flushBuffer();
                    tokens.push({
                        type: 'styled',
                        color: '',
                        underline: false,
                        strike: true,
                        children: walk(source.substring(cursor + 3, contentEnd))
                    });
                    cursor = contentEnd + 1;
                    continue;
                }
            }

            if (source.startsWith('\\_{', cursor)) {
                const contentEnd = findClosingBrace(source, cursor + 2);
                if (contentEnd > -1) {
                    flushBuffer();
                    tokens.push({
                        type: 'styled',
                        color: '',
                        underline: true,
                        strike: false,
                        children: walk(source.substring(cursor + 3, contentEnd))
                    });
                    cursor = contentEnd + 1;
                    continue;
                }
            }

            buffer += source[cursor];
            cursor++;
        }

        flushBuffer();
        return tokens;
    }

    return walk(typeof text === 'string' ? text : '');
}

export function contentTokensToLegacyText(tokens) {
    if (!Array.isArray(tokens)) {
        return '';
    }

    return tokens.map(token => {
        if (typeof token === 'string') {
            return token;
        }
        if (!token || typeof token !== 'object' || typeof token.type !== 'string') {
            return '';
        }
        if (token.type === 'text') {
            return token.value == null ? '' : String(token.value);
        }
        if (token.type === 'pause') {
            return '\\.';
        }
        if (token.type === 'styled') {
            let inner = contentTokensToLegacyText(token.children || []);
            if (token.strike) {
                inner = `\\-{${inner}}`;
            }
            if (token.underline) {
                inner = `\\_{${inner}}`;
            }
            if (token.color) {
                inner = `\\C[${token.color}]{${inner}}`;
            }
            return inner;
        }
        return '';
    }).join('');
}

export function normalizeLegacyOptions(options) {
    if (!Array.isArray(options)) {
        return [];
    }
    return options.map(option => ({
        text: typeof option?.text === 'string' ? option.text : '',
        target: typeof option?.nextNode === 'string' ? option.nextNode : ''
    }));
}

export function normalizeLegacyNode(id, node) {
    return {
        id,
        image: typeof node?.image === 'string' ? node.image.trim() : '',
        content: tokenizeLegacyText(typeof node?.text === 'string' ? node.text : ''),
        options: normalizeLegacyOptions(node?.options)
    };
}

export function normalizeLegacyStory(rawStory) {
    const nodes = Object.entries(rawStory).map(([id, node]) => normalizeLegacyNode(id, node));
    return {
        meta: {
            format: 'cassette-if',
            version: 1,
            sourceFormat: 'v1',
            title: 'Legacy Story'
        },
        startNodeId: rawStory.start ? 'start' : nodes[0]?.id || '',
        nodes
    };
}

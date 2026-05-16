export const V2_SCHEMA_ID = 'cassette-if.story/v2';

export function isStrongV2Story(rawStory) {
    return Boolean(
        rawStory &&
        typeof rawStory === 'object' &&
        rawStory.schemaId === V2_SCHEMA_ID &&
        Array.isArray(rawStory.nodes)
    );
}

export function normalizeImage(image) {
    if (typeof image === 'string') {
        return image.trim();
    }
    if (image && typeof image === 'object' && typeof image.src === 'string') {
        return image.src.trim();
    }
    return '';
}

export function normalizeContentTokens(tokens) {
    if (!Array.isArray(tokens)) {
        return [];
    }

    const normalizedTokens = [];
    for (const token of tokens) {
        if (typeof token === 'string') {
            if (token) {
                normalizedTokens.push({ type: 'text', value: token });
            }
            continue;
        }

        if (!token || typeof token !== 'object' || typeof token.type !== 'string') {
            continue;
        }

        if (token.type === 'text') {
            const value = token.value == null ? '' : String(token.value);
            if (value) {
                normalizedTokens.push({ type: 'text', value });
            }
            continue;
        }

        if (token.type === 'pause') {
            const ms = Number(token.ms);
            normalizedTokens.push({ type: 'pause', ms: Number.isFinite(ms) && ms >= 0 ? ms : 500 });
            continue;
        }

        if (token.type === 'styled') {
            normalizedTokens.push({
                type: 'styled',
                color: typeof token.color === 'string' && token.color.trim() ? token.color.trim() : '',
                underline: Boolean(token.underline),
                strike: Boolean(token.strike),
                children: normalizeContentTokens(token.children)
            });
        }
    }

    return normalizedTokens;
}

export function normalizeV2Options(options) {
    if (!Array.isArray(options)) {
        return [];
    }
    return options.map(option => ({
        text: typeof option?.text === 'string' ? option.text : '',
        target: typeof option?.target === 'string' ? option.target : ''
    }));
}

export function normalizeV2Node(node) {
    return {
        id: typeof node?.id === 'string' ? node.id : '',
        image: normalizeImage(node?.image),
        content: normalizeContentTokens(node?.content),
        options: normalizeV2Options(node?.options)
    };
}

export function normalizeV2Story(rawStory) {
    const nodes = Array.isArray(rawStory.nodes) ? rawStory.nodes.map(normalizeV2Node) : [];
    return {
        meta: {
            schemaId: typeof rawStory.schemaId === 'string' ? rawStory.schemaId : '',
            format: typeof rawStory.format === 'string' ? rawStory.format : 'cassette-if',
            version: Number.isFinite(rawStory.version) ? rawStory.version : 2,
            sourceFormat: 'v2',
            title: typeof rawStory.title === 'string' && rawStory.title.trim() ? rawStory.title.trim() : 'Untitled Story'
        },
        startNodeId: typeof rawStory.startNodeId === 'string' ? rawStory.startNodeId : '',
        nodes,
        editor: rawStory.editor && typeof rawStory.editor === 'object' ? rawStory.editor : {}
    };
}

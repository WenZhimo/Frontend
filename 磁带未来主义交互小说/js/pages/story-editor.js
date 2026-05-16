import { normalizeStory } from '../runtime/shared/story-format-detect.js';
import { createNormalizedStory } from '../runtime/shared/story-runtime-core.js';
import { tokenizeLegacyText, contentTokensToLegacyText } from '../runtime/formats/story-format-v1.js';
import { V2_SCHEMA_ID } from '../runtime/formats/story-format-v2.js';

let nodesData = {};
let storyMeta = {
    schemaId: V2_SCHEMA_ID,
    format: 'cassette-if',
    version: 2,
    title: 'Untitled Story',
    startNodeId: 'start'
};

const container = document.getElementById('nodes-container');
const svg = document.getElementById('connections');
const workspace = document.getElementById('workspace');
const fileInput = document.getElementById('file-input');

let isDragging = false;
let dragTarget = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let contextMenuPos = { x: 0, y: 0 };

function init() {
    if (Object.keys(nodesData).length === 0) {
        createNode('start', 100, 100);
    }
    drawConnections();
}

function createNode(id = null, x = 100, y = 100, content = '') {
    const finalId = id || `node_${Date.now()}`;
    const nodeData = {
        id: finalId,
        x,
        y,
        image: '',
        text: content || '在此输入旧版脚本文本，导出时会自动转换为 v2 content token。',
        options: []
    };

    if (nodesData[finalId]) {
        nodesData[finalId].x = x;
        nodesData[finalId].y = y;
        if (content) {
            nodesData[finalId].text = content;
        }
    } else {
        nodesData[finalId] = nodeData;
    }

    renderNode(finalId);
    return finalId;
}

function deleteNode(id) {
    if (confirm(`确定要删除节点 [${id}] 吗？`)) {
        delete nodesData[id];
        const element = document.getElementById(id);
        if (element) {
            element.remove();
        }
        drawConnections();
    }
}

function renderNode(id) {
    const data = nodesData[id];
    const existing = document.getElementById(id);
    if (existing) {
        existing.remove();
    }

    const el = document.createElement('div');
    el.className = 'node';
    el.id = id;
    el.style.left = `${data.x}px`;
    el.style.top = `${data.y}px`;

    el.innerHTML = `
        <div class="node-header" onmousedown="window.storyEditor.startDrag(event, '${id}')">
            <input class="node-id-input" value="${id}" onchange="window.storyEditor.updateNodeId('${id}', this.value)">
            <div class="node-tools">
                <button onclick="window.storyEditor.deleteNode('${id}')">X</button>
            </div>
        </div>
        <div class="node-body">
            <div class="img-control-row">
                <span class="img-label">IMG:</span>
                <input class="img-input" id="img-input-${id}"
                       placeholder="images/filename.jpg"
                       value="${data.image || ''}"
                       oninput="window.storyEditor.updateNodeImage('${id}', this.value)">

                <button class="img-btn-select" title="选择本地图片" onclick="window.storyEditor.triggerFileSelect('${id}')">📂</button>
                <input type="file" id="img-file-${id}" style="display:none" accept="image/*" onchange="window.storyEditor.handleFileSelect('${id}', this)">
            </div>

            <div class="img-preview ${data.image ? 'has-img' : ''}" id="preview-${id}">
                ${data.image ? `<img src="${data.image}" onerror="this.parentNode.innerHTML='NOT FOUND'">` : 'NO IMAGE'}
            </div>

            <div class="helper-bar">
                <button onclick="window.storyEditor.insertTag('${id}', '\\\\. ')">Wait</button>
                <button onclick="window.storyEditor.insertTag('${id}', '\\\\C[red]{}', 8)">Color</button>
                <button onclick="window.storyEditor.insertTag('${id}', '\\\\_{}', 3)">Line</button>
                <button onclick="window.storyEditor.insertTag('${id}', '\\\\-{}', 3)">Strike</button>
            </div>
            <textarea id="text-${id}" oninput="window.storyEditor.updateNodeText('${id}')">${data.text}</textarea>

            <div class="options-list" id="opts-${id}"></div>
            <button class="add-option-btn" onclick="window.storyEditor.addOption('${id}')">+ 添加选项</button>
        </div>
    `;

    container.appendChild(el);
    renderOptions(id);
}

function renderOptions(nodeId) {
    const listContainer = document.getElementById(`opts-${nodeId}`);
    listContainer.innerHTML = '';

    nodesData[nodeId].options.forEach((option, index) => {
        const optDiv = document.createElement('div');
        optDiv.className = 'option-item';

        let selectHtml = `<select class="option-target" onchange="window.storyEditor.updateOptionTarget('${nodeId}', ${index}, this.value)">
            <option value="">(结束)</option>`;

        Object.keys(nodesData).forEach(key => {
            const selected = option.target === key ? 'selected' : '';
            selectHtml += `<option value="${key}" ${selected}>${key}</option>`;
        });
        selectHtml += `</select>`;

        optDiv.innerHTML = `
            <div class="option-row">
                <input class="option-text" value="${option.text}" placeholder="按钮文字" oninput="window.storyEditor.updateOptionText('${nodeId}', ${index}, this.value)">
                <button class="option-del" onclick="window.storyEditor.deleteOption('${nodeId}', ${index})">×</button>
            </div>
            <div class="option-row">
                <span style="font-size:12px;color:#666;line-height:20px;">跳转:</span>
                ${selectHtml}
            </div>
        `;
        listContainer.appendChild(optDiv);
    });
}

function triggerFileSelect(id) {
    document.getElementById(`img-file-${id}`).click();
}

function handleFileSelect(id, inputElement) {
    const file = inputElement.files[0];
    if (file) {
        const filename = file.name;
        const relativePath = `images/${filename}`;
        document.getElementById(`img-input-${id}`).value = relativePath;
        updateNodeImage(id, relativePath);
    }
    inputElement.value = '';
}

function updateNodeId(oldId, newId) {
    if (oldId === newId) return;
    if (nodesData[newId]) {
        alert('ID 已存在！');
        renderNode(oldId);
        return;
    }

    nodesData[newId] = nodesData[oldId];
    nodesData[newId].id = newId;
    delete nodesData[oldId];

    Object.values(nodesData).forEach(node => {
        node.options.forEach(option => {
            if (option.target === oldId) {
                option.target = newId;
            }
        });
    });

    if (storyMeta.startNodeId === oldId) {
        storyMeta.startNodeId = newId;
    }

    refreshAll();
}

function updateNodeText(id) {
    nodesData[id].text = document.getElementById(`text-${id}`).value;
}

function updateNodeImage(id, value) {
    nodesData[id].image = value;
    const previewEl = document.getElementById(`preview-${id}`);
    if (value && value.trim() !== '') {
        previewEl.className = 'img-preview has-img';
        previewEl.innerHTML = `<img src="${value}" onerror="this.parentNode.innerHTML='NOT FOUND'">`;
    } else {
        previewEl.className = 'img-preview';
        previewEl.innerHTML = 'NO IMAGE';
    }
}

function addOption(id) {
    nodesData[id].options.push({ text: '选项', target: '' });
    renderOptions(id);
}

function deleteOption(id, index) {
    nodesData[id].options.splice(index, 1);
    renderOptions(id);
    drawConnections();
}

function updateOptionText(id, index, value) {
    nodesData[id].options[index].text = value;
}

function updateOptionTarget(id, index, targetId) {
    nodesData[id].options[index].target = targetId;
    drawConnections();
}

function insertTag(id, tag, cursorPosOffset = 0) {
    const textarea = document.getElementById(`text-${id}`);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    nodesData[id].text = textarea.value;
    textarea.focus();
    const newPos = start + (cursorPosOffset || tag.length);
    textarea.setSelectionRange(newPos, newPos);
}

function refreshAll() {
    container.innerHTML = '';
    Object.keys(nodesData).forEach(key => renderNode(key));
    drawConnections();
}

function startDrag(event, id) {
    isDragging = true;
    dragTarget = id;
    const node = document.getElementById(id);
    const rect = node.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    document.querySelectorAll('.node').forEach(item => item.classList.remove('selected'));
    node.classList.add('selected');
}

document.addEventListener('mousemove', event => {
    if (!isDragging || !dragTarget) return;
    let newX = event.clientX - dragOffsetX;
    let newY = event.clientY - dragOffsetY - 50;
    newX = Math.round(newX / 20) * 20;
    newY = Math.round(newY / 20) * 20;
    const node = document.getElementById(dragTarget);
    node.style.left = `${newX}px`;
    node.style.top = `${newY}px`;
    nodesData[dragTarget].x = newX;
    nodesData[dragTarget].y = newY;
    drawConnections();
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    dragTarget = null;
});

function drawConnections() {
    let paths = '';
    Object.values(nodesData).forEach(node => {
        if (!document.getElementById(node.id)) return;
        node.options.forEach((option, index) => {
            if (option.target && nodesData[option.target]) {
                const startX = nodesData[node.id].x + 320;
                const startY = nodesData[node.id].y + 260 + index * 60;
                const endX = nodesData[option.target].x;
                const endY = nodesData[option.target].y + 20;
                const cp1X = startX + 80;
                const cp1Y = startY;
                const cp2X = endX - 80;
                const cp2Y = endY;
                const color = `hsl(${(option.target.length * 20) % 360}, 70%, 50%)`;
                paths += `<path d="M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}" stroke="${color}" />`;
            }
        });
    });
    svg.innerHTML = paths;
}

workspace.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (event.target === workspace || event.target === svg) {
        const menu = document.getElementById('context-menu');
        menu.style.display = 'flex';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;
        contextMenuPos = { x: event.clientX, y: event.clientY - 50 };
    }
});

document.getElementById('ctx-add-node').addEventListener('click', () => {
    createNode(null, contextMenuPos.x, contextMenuPos.y);
    document.getElementById('context-menu').style.display = 'none';
});

workspace.addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
});

function createNewNode() {
    createNode(null, 100, 100);
}

function createAutoPositionGenerator() {
    let autoX = 50;
    let autoY = 50;

    return () => {
        const position = { x: autoX, y: autoY };
        autoX += 360;
        if (autoX > 1000) {
            autoX = 50;
            autoY += 500;
        }
        return position;
    };
}

function buildEditorPositions(rawStory, normalizedStory) {
    const nextAutoPosition = createAutoPositionGenerator();
    const sourceFormat = normalizedStory.meta.sourceFormat;
    const v2Positions = normalizedStory.editor?.nodePositions || {};

    return normalizedStory.nodes.reduce((positions, node) => {
        let x;
        let y;

        if (sourceFormat === 'v2') {
            const position = v2Positions[node.id] || {};
            x = position.x;
            y = position.y;
        } else {
            const rawNode = rawStory[node.id] || {};
            x = Number.isFinite(rawNode.x) ? rawNode.x : rawNode._editor?.x;
            y = Number.isFinite(rawNode.y) ? rawNode.y : rawNode._editor?.y;
        }

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            const autoPosition = nextAutoPosition();
            if (!Number.isFinite(x)) {
                x = autoPosition.x;
            }
            if (!Number.isFinite(y)) {
                y = autoPosition.y;
            }
        }

        positions[node.id] = { x, y };
        return positions;
    }, {});
}

function toEditorNode(node, positions) {
    return {
        id: node.id,
        text: contentTokensToLegacyText(node.content || []),
        image: node.image || '',
        options: (node.options || []).map(option => ({
            text: option.text || '',
            target: option.target || ''
        })),
        x: positions[node.id].x,
        y: positions[node.id].y
    };
}

// 编辑器现在先走共享规范化层，再把规范化结果投影成画布内部状态，避免重复维护 v1/v2 两套导入逻辑。
function storyToEditorState(rawStory) {
    const normalizedStory = createNormalizedStory(normalizeStory(rawStory));
    const positions = buildEditorPositions(rawStory, normalizedStory);
    const title = normalizedStory.meta.sourceFormat === 'v1' && normalizedStory.meta.title === 'Legacy Story'
        ? 'Imported Legacy Story'
        : normalizedStory.meta.title;

    return {
        meta: {
            schemaId: V2_SCHEMA_ID,
            format: normalizedStory.meta.format || 'cassette-if',
            version: 2,
            title,
            startNodeId: normalizedStory.startNodeId
        },
        nodesData: normalizedStory.nodes.reduce((map, node) => {
            map[node.id] = toEditorNode(node, positions);
            return map;
        }, {})
    };
}

function editorStateToV2Story() {
    const nodeIds = Object.keys(nodesData);
    const startNodeId = nodeIds.includes(storyMeta.startNodeId) ? storyMeta.startNodeId : (nodeIds[0] || 'start');

    return {
        schemaId: V2_SCHEMA_ID,
        format: 'cassette-if',
        version: 2,
        title: storyMeta.title,
        startNodeId,
        nodes: nodeIds.map(nodeId => {
            const node = nodesData[nodeId];
            return {
                id: node.id,
                image: node.image || '',
                content: tokenizeLegacyText(node.text || ''),
                options: node.options.map(option => ({
                    text: option.text,
                    target: option.target
                }))
            };
        }),
        editor: {
            nodePositions: nodeIds.reduce((map, nodeId) => {
                map[nodeId] = { x: nodesData[nodeId].x, y: nodesData[nodeId].y };
                return map;
            }, {})
        }
    };
}

function exportJSON() {
    const dataStr = JSON.stringify(editorStateToV2Story(), null, 4);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'story.v2.json';
    anchor.click();
    URL.revokeObjectURL(url);
}

fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
        try {
            const importedData = JSON.parse(loadEvent.target.result);
            const editorState = storyToEditorState(importedData);
            storyMeta = editorState.meta;
            nodesData = editorState.nodesData;
            refreshAll();
        } catch (error) {
            alert('导入失败：' + error.message);
        }
    };
    reader.readAsText(file);
});

window.storyEditor = {
    addOption,
    createNewNode,
    deleteNode,
    deleteOption,
    handleFileSelect,
    insertTag,
    startDrag,
    triggerFileSelect,
    updateNodeId,
    updateNodeImage,
    updateNodeText,
    updateOptionTarget,
    updateOptionText
};

window.createNewNode = createNewNode;
window.exportJSON = exportJSON;

init();

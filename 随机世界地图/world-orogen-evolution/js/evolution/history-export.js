const HISTORY_SUMMARY_SCHEMA = 'world-orogen-history-summary';
const HISTORY_SUMMARY_VERSION = 1;
const HISTORY_TIMELINE_SCHEMA = 'world-orogen-history-timeline';
const HISTORY_TIMELINE_VERSION = 1;

function round(value, digits = 3) {
    if (!Number.isFinite(value)) return 0;
    const m = 10 ** digits;
    return Math.round(value * m) / m;
}

function eventCounts(events = []) {
    const counts = {};
    for (const event of events) counts[event.type] = (counts[event.type] || 0) + 1;
    return counts;
}

function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
}

function topByPopulation(items = [], limit = 8) {
    return items
        .slice()
        .sort((a, b) => (b.population || 0) - (a.population || 0))
        .slice(0, limit);
}

function summarizeGroups(groups = []) {
    return topByPopulation(groups).map(group => ({
        id: group.id,
        cell: group.cell,
        originCell: group.originCell,
        population: Math.round(group.population || 0),
        cultureId: group.cultureId,
        languageId: group.languageId,
        polityId: group.polityId ?? null,
        subsistenceMode: group.subsistenceMode || 'unknown',
        migrationPressure: round(group.migrationPressure || 0),
        technologyLevel: round(group.technologyLevel || 0),
        tradeReach: round(group.tradeReach || 0),
        pathLength: Array.isArray(group.path) ? group.path.length : 0,
    }));
}

function summarizeSettlements(settlements = []) {
    return topByPopulation(settlements).map(settlement => ({
        id: settlement.id,
        cell: settlement.cell,
        population: Math.round(settlement.population || 0),
        rank: settlement.rank || 1,
        cultureId: settlement.cultureId,
        languageId: settlement.languageId,
        polityId: settlement.polityId ?? null,
        foundedYear: settlement.foundedYear,
    }));
}

function summarizePolities(polities = []) {
    return topByPopulation(polities).map(polity => ({
        id: polity.id,
        capitalCell: polity.capitalCell,
        population: Math.round(polity.population || 0),
        cultureId: polity.cultureId,
        formedYear: polity.formedYear,
        collapsedYear: polity.collapsedYear ?? null,
        status: polity.status || 'chiefdom',
        stability: round(polity.stability || 0),
    }));
}

function summarizeMigration(groups = []) {
    return groups
        .filter(group => Array.isArray(group.path) && group.path.length > 1)
        .sort((a, b) => b.path.length - a.path.length)
        .slice(0, 8)
        .map(group => ({
            groupId: group.id,
            originCell: group.originCell,
            currentCell: group.cell,
            pathLength: group.path.length,
            recentPath: group.path.slice(-8),
            migrationPressure: round(group.migrationPressure || 0),
        }));
}

function identityKey(kind) {
    return kind === 'language' ? 'languageId' : 'cultureId';
}

function nodeDepth(node, byId, seen = new Set()) {
    if (!node || node.parentId == null || seen.has(node.id)) return 0;
    seen.add(node.id);
    return 1 + nodeDepth(byId.get(node.parentId), byId, seen);
}

function nodeRootId(node, byId, seen = new Set()) {
    if (!node || node.parentId == null || seen.has(node.id)) return node?.id ?? null;
    seen.add(node.id);
    const parent = byId.get(node.parentId);
    return parent ? nodeRootId(parent, byId, seen) : node.id;
}

function summarizeIdentityNodes(items = [], groups = [], kind = 'culture') {
    const key = identityKey(kind);
    const byId = new Map(items.map(item => [item.id, item]));
    const children = new Map();
    const stats = new Map();

    for (const item of items) {
        if (item.parentId != null) {
            const list = children.get(item.parentId) || [];
            list.push(item.id);
            children.set(item.parentId, list);
        }
        stats.set(item.id, {
            population: 0,
            groupCount: 0,
            cells: new Set(),
        });
    }

    for (const group of groups) {
        const id = group[key];
        if (id == null) continue;
        if (!stats.has(id)) {
            stats.set(id, {
                population: 0,
                groupCount: 0,
                cells: new Set(),
            });
        }
        const stat = stats.get(id);
        stat.population += group.population || 0;
        stat.groupCount++;
        if (group.cell != null) stat.cells.add(group.cell);
    }

    return Array.from(stats.entries()).map(([id, stat]) => {
        const item = byId.get(id) || { id, parentId: null, originCell: null, bornYear: null };
        return {
            id,
            parentId: item.parentId ?? null,
            rootId: nodeRootId(item, byId),
            depth: nodeDepth(item, byId),
            originCell: item.originCell ?? null,
            bornYear: item.bornYear ?? null,
            population: Math.round(stat.population || 0),
            groupCount: stat.groupCount || 0,
            activeCells: Array.from(stat.cells).slice(0, 8),
            childCount: children.get(id)?.length || 0,
        };
    }).sort((a, b) => (
        (b.population - a.population) ||
        (b.groupCount - a.groupCount) ||
        (a.bornYear ?? 0) - (b.bornYear ?? 0) ||
        a.id - b.id
    ));
}

function summarizeIdentityFamilies(nodes = []) {
    const byRoot = new Map();
    for (const node of nodes) {
        const rootId = node.rootId ?? node.id;
        if (!byRoot.has(rootId)) {
            byRoot.set(rootId, {
                rootId,
                population: 0,
                activeGroups: 0,
                branchCount: 0,
                maxDepth: 0,
                originCell: node.originCell,
                bornYear: node.bornYear,
            });
        }
        const family = byRoot.get(rootId);
        family.population += node.population || 0;
        family.activeGroups += node.groupCount || 0;
        family.branchCount++;
        family.maxDepth = Math.max(family.maxDepth, node.depth || 0);
        if (family.bornYear == null || (node.bornYear != null && node.bornYear < family.bornYear)) {
            family.bornYear = node.bornYear;
            family.originCell = node.originCell;
        }
    }
    return Array.from(byRoot.values())
        .sort((a, b) => (
            (b.population - a.population) ||
            (b.branchCount - a.branchCount) ||
            a.rootId - b.rootId
        ))
        .slice(0, 8);
}

function summarizeIdentityLineages(civ) {
    const groups = civ.populationGroups || [];
    const cultures = summarizeIdentityNodes(civ.cultures || [], groups, 'culture');
    const languages = summarizeIdentityNodes(civ.languages || [], groups, 'language');
    return {
        cultureFamilies: summarizeIdentityFamilies(cultures),
        languageFamilies: summarizeIdentityFamilies(languages),
        cultures: cultures.slice(0, 12),
        languages: languages.slice(0, 12),
    };
}

function summarizeTraceCorridors(groups = []) {
    return groups
        .filter(group => Array.isArray(group.path) && group.path.length > 2)
        .sort((a, b) => (
            b.path.length - a.path.length ||
            (b.population || 0) - (a.population || 0)
        ))
        .slice(0, 8)
        .map(group => ({
            type: 'migration-corridor',
            groupId: group.id,
            originCell: group.originCell,
            currentCell: group.cell,
            cells: group.path.slice(-10),
            pathLength: group.path.length,
            population: Math.round(group.population || 0),
            migrationPressure: round(group.migrationPressure || 0),
            cultureId: group.cultureId,
            languageId: group.languageId,
        }));
}

function summarizeStressSignals(groups = []) {
    return groups
        .map(group => {
            const collapseRisk = round(group.collapseRisk || 0);
            const conflictPressure = round(group.conflictPressure || 0);
            const migrationPressure = round(group.migrationPressure || 0);
            const severity = round(Math.max(collapseRisk, conflictPressure, migrationPressure));
            return {
                type: 'stress-signal',
                groupId: group.id,
                cell: group.cell,
                population: Math.round(group.population || 0),
                severity,
                collapseRisk,
                conflictPressure,
                migrationPressure,
                cultureId: group.cultureId,
                languageId: group.languageId,
            };
        })
        .filter(signal => signal.severity >= 0.35)
        .sort((a, b) => b.severity - a.severity || b.population - a.population)
        .slice(0, 8);
}

function summarizeSettlementSites(settlements = [], year = 0) {
    return settlements
        .slice()
        .sort((a, b) => (
            (b.rank || 1) - (a.rank || 1) ||
            (b.population || 0) - (a.population || 0)
        ))
        .slice(0, 8)
        .map(settlement => ({
            type: 'settlement-site',
            settlementId: settlement.id,
            cell: settlement.cell,
            foundedYear: settlement.foundedYear,
            ageYears: settlement.foundedYear == null ? 0 : Math.max(0, year - settlement.foundedYear),
            population: Math.round(settlement.population || 0),
            rank: settlement.rank || 1,
            cultureId: settlement.cultureId,
            languageId: settlement.languageId,
            polityId: settlement.polityId ?? null,
            traceValue: round((settlement.rank || 1) / 4 + Math.min(1, (year - (settlement.foundedYear ?? year)) / 2000), 3),
        }));
}

function summarizeRuins(polities = []) {
    return polities
        .filter(polity => polity.status === 'collapsed' || polity.collapsedYear != null)
        .sort((a, b) => (b.collapsedYear || 0) - (a.collapsedYear || 0))
        .slice(0, 8)
        .map(polity => ({
            type: 'collapsed-polity-ruin',
            polityId: polity.id,
            cell: polity.capitalCell,
            formedYear: polity.formedYear,
            collapsedYear: polity.collapsedYear ?? null,
            population: Math.round(polity.population || 0),
            cultureId: polity.cultureId,
            stabilityAtMemory: round(polity.stability || 0),
        }));
}

function emptyHistoricalTraces() {
    return {
        ruins: [],
        settlementSites: [],
        migrationCorridors: [],
        stressSignals: [],
        traceSignals: ['尚未出现显著历史痕迹信号。'],
    };
}

function summarizeHistoricalTraces(civ) {
    const year = civ.timeYear || 0;
    const ruins = summarizeRuins(civ.polities || []);
    const settlementSites = summarizeSettlementSites(civ.settlements || [], year);
    const migrationCorridors = summarizeTraceCorridors(civ.populationGroups || []);
    const stressSignals = summarizeStressSignals(civ.populationGroups || []);
    const traceSignals = [];
    if (ruins.length) traceSignals.push(`${ruins.length} 处已崩溃政体遗址标记了昔日权力中心。`);
    if (settlementSites.length) traceSignals.push(`${settlementSites.length} 处聚落遗址保留了长期居住锚点。`);
    if (migrationCorridors.length) traceSignals.push(`${migrationCorridors.length} 条迁徙走廊保留了族群移动路径记忆。`);
    if (stressSignals.length) traceSignals.push(`${stressSignals.length} 个高压力人口信号指向潜在饥荒、冲突、迁移或崩溃压力。`);
    if (!traceSignals.length) traceSignals.push('尚未出现显著历史痕迹信号。');
    return {
        ruins,
        settlementSites,
        migrationCorridors,
        stressSignals,
        traceSignals,
    };
}

function historySignals(summary) {
    const events = summary.civilization.eventCounts;
    const metrics = summary.civilization.metrics;
    const lineages = summary.civilization.lineages;
    const traces = summary.civilization.historicalTraces;
    const signals = [];
    signals.push(`人口达到 ${metrics.population.toLocaleString()}，分布在 ${metrics.livingGroups} 个存续群体中。`);
    signals.push(`${metrics.settlements} 个聚落由宜居性、淡水、农业潜力和通行条件共同催生。`);
    if ((events['culture-split'] || 0) || (events['language-split'] || 0)) {
        signals.push(`隔离造成 ${events['culture-split'] || 0} 次文化分裂和 ${events['language-split'] || 0} 次语言分裂。`);
    } else {
        signals.push('尚未发生身份分裂；继续推进文明时间可暴露更长时程的历史分化。');
    }
    if (metrics.polities > 0) {
        signals.push(`${metrics.polities} 个活跃政体在聚落人口、贸易、技术与农业条件同时成熟处形成。`);
    } else {
        signals.push('尚未形成政体；当前聚落仍低于组织化阈值。');
    }
    if (lineages?.cultureFamilies?.length || lineages?.languageFamilies?.length) {
        const topCulture = lineages.cultureFamilies?.[0];
        const topLanguage = lineages.languageFamilies?.[0];
        signals.push(`主导谱系根源为文化 ${topCulture?.rootId ?? '无'} 与语言 ${topLanguage?.rootId ?? '无'}，已追踪 ${lineages.cultures?.length || 0} 条文化分支和 ${lineages.languages?.length || 0} 条语言分支。`);
    }
    if (traces?.traceSignals?.length) {
        signals.push(traces.traceSignals[0]);
    }
    if (summary.environment.climateEnhanced) {
        signals.push('已存在气候增强环境输入，因此农业潜力与宜居性包含计算得到的温度和降水。');
    } else {
        signals.push('环境输入目前仅由地形推导；计算气候图层可获得更丰富的文明输入。');
    }
    return signals;
}

export function buildHistorySummary(curData) {
    if (!curData) throw new Error('请先生成世界，再生成历史摘要。');
    const civ = curData.civilizationState;
    if (!civ) throw new Error('请先播种文明，再生成历史摘要。');

    const summary = {
        schema: HISTORY_SUMMARY_SCHEMA,
        version: HISTORY_SUMMARY_VERSION,
        world: {
            seed: curData.seed,
            regions: curData.mesh?.numRegions || curData.r_elevation?.length || 0,
            climateComputed: !!curData.environmentInputs?.metrics?.climateEnhanced,
            geologyTimeMyr: curData.evolutionState?.time?.timeMyr || 0,
        },
        environment: {
            schema: curData.environmentInputs?.schema || null,
            climateEnhanced: !!curData.environmentInputs?.metrics?.climateEnhanced,
            climateEnhancedCells: curData.environmentInputs?.metrics?.climateEnhancedCells || 0,
            landCells: curData.environmentInputs?.metrics?.landCells || 0,
            layers: Array.isArray(curData.environmentInputs?.layers) ? curData.environmentInputs.layers.slice() : [],
        },
        civilization: {
            schema: civ.schema,
            version: civ.version,
            year: civ.timeYear || 0,
            stepIndex: civ.stepIndex || 0,
            metrics: {
                population: Math.round(civ.metrics?.population || 0),
                livingGroups: civ.metrics?.livingGroups || 0,
                settlements: civ.metrics?.settlements || 0,
                cultures: civ.metrics?.cultures || 0,
                languages: civ.metrics?.languages || 0,
                polities: civ.metrics?.polities || 0,
                collapsedPolities: civ.metrics?.collapsedPolities || 0,
                events: civ.metrics?.events || 0,
            },
            eventCounts: eventCounts(civ.eventLog),
            recentEvents: (civ.eventLog || []).slice(-20),
            groups: summarizeGroups(civ.populationGroups),
            settlements: summarizeSettlements(civ.settlements),
            polities: summarizePolities(civ.polities),
            migrationRoutes: summarizeMigration(civ.populationGroups),
            lineages: summarizeIdentityLineages(civ),
            historicalTraces: summarizeHistoricalTraces(civ),
        },
        availableDebugLayers: Object.keys(curData.debugLayers || {}).filter(name => (
            name.includes('population') ||
            name.includes('migration') ||
            name.includes('settlement') ||
            name.includes('culture') ||
            name.includes('language') ||
            name.includes('polity') ||
            name.includes('civilization') ||
            name.includes('habitability') ||
            name.includes('agriculture')
        )).sort(),
    };
    summary.narrativeSignals = historySignals(summary);
    return summary;
}

export function formatHistorySummaryMarkdown(summary) {
    const metrics = summary.civilization.metrics;
    const events = summary.civilization.eventCounts;
    const traces = summary.civilization.historicalTraces || emptyHistoricalTraces();
    const lines = [
        '# 世界造山历史摘要',
        '',
        `- 种子：${summary.world.seed}`,
        `- 区域数：${summary.world.regions.toLocaleString()}`,
        `- 地质时间：${round(summary.world.geologyTimeMyr, 2)} Myr`,
        `- 文明年份：${summary.civilization.year.toLocaleString()}`,
        `- 人口：${metrics.population.toLocaleString()}`,
        `- 群体 / 聚落 / 政体：${metrics.livingGroups} / ${metrics.settlements} / ${metrics.polities}`,
        `- 文化 / 语言：${metrics.cultures} / ${metrics.languages}`,
        '',
        '## 叙事信号',
        ...summary.narrativeSignals.map(item => `- ${item}`),
        '',
        '## 事件计数',
        ...Object.entries(events).sort((a, b) => a[0].localeCompare(b[0])).map(([type, count]) => `- ${type}: ${count}`),
        '',
        '## 主要聚落',
        ...(summary.civilization.settlements.length
            ? summary.civilization.settlements.map(s => `- 聚落 ${s.id}：单元 ${s.cell}，人口 ${s.population.toLocaleString()}，等级 ${s.rank}，文化 ${s.cultureId}，语言 ${s.languageId}，政体 ${s.polityId ?? '无'}`)
            : ['- 暂无。']),
        '',
        '## 活跃或被记忆的政体',
        ...(summary.civilization.polities.length
            ? summary.civilization.polities.map(p => `- 政体 ${p.id}：${p.status}，首都单元 ${p.capitalCell}，人口 ${p.population.toLocaleString()}，稳定度 ${p.stability}`)
            : ['- 暂无。']),
        '',
        '## 迁徙路线',
        ...(summary.civilization.migrationRoutes.length
            ? summary.civilization.migrationRoutes.map(route => `- 群体 ${route.groupId}：${route.originCell} -> ${route.currentCell}，路径长度 ${route.pathLength}，压力 ${route.migrationPressure}`)
            : ['- 尚未记录跨单元迁徙路线。']),
        '',
        '## 文化与语言谱系',
        ...(summary.civilization.lineages?.cultureFamilies?.length
            ? summary.civilization.lineages.cultureFamilies.map(family => `- 文化根 ${family.rootId}：人口 ${family.population.toLocaleString()}，分支 ${family.branchCount}，最大深度 ${family.maxDepth}，起源单元 ${family.originCell ?? '未知'}`)
            : ['- 尚未记录文化谱系。']),
        ...(summary.civilization.lineages?.languageFamilies?.length
            ? summary.civilization.lineages.languageFamilies.map(family => `- 语言根 ${family.rootId}：人口 ${family.population.toLocaleString()}，分支 ${family.branchCount}，最大深度 ${family.maxDepth}，起源单元 ${family.originCell ?? '未知'}`)
            : ['- 尚未记录语言谱系。']),
        '',
        '## 历史痕迹与压力',
        ...traces.traceSignals.map(signal => `- ${signal}`),
        ...(traces.ruins.length
            ? traces.ruins.map(ruin => `- 政体遗址 ${ruin.polityId}：单元 ${ruin.cell}，形成于 ${ruin.formedYear}，崩溃于 ${ruin.collapsedYear ?? '未知'}，人口记忆 ${ruin.population.toLocaleString()}`)
            : ['- 尚未记录已崩溃政体遗址。']),
        ...(traces.settlementSites.length
            ? traces.settlementSites.slice(0, 5).map(site => `- 聚落遗址 ${site.settlementId}：单元 ${site.cell}，年龄 ${site.ageYears.toLocaleString()} 年，等级 ${site.rank}，人口 ${site.population.toLocaleString()}`)
            : ['- 尚未记录聚落遗址。']),
        ...(traces.migrationCorridors.length
            ? traces.migrationCorridors.slice(0, 5).map(route => `- 走廊群体 ${route.groupId}：${route.originCell} -> ${route.currentCell}，路径长度 ${route.pathLength}，压力 ${route.migrationPressure}`)
            : ['- 尚未记录迁徙走廊痕迹。']),
        ...(traces.stressSignals.length
            ? traces.stressSignals.slice(0, 5).map(signal => `- 压力群体 ${signal.groupId}：单元 ${signal.cell}，严重度 ${signal.severity}，冲突 ${signal.conflictPressure}，崩溃 ${signal.collapseRisk}`)
            : ['- 尚未记录高压力人口信号。']),
    ];
    return lines.join('\n');
}

export function formatHistorySummaryJson(summary) {
    return JSON.stringify(summary, null, 2);
}

export function createHistoryPoint(summary, {
    source = 'manual',
    snapshotId = null,
    label = '',
} = {}) {
    const safeSummary = clonePlain(summary);
    return {
        id: `${safeSummary.world.seed || 'world'}:${safeSummary.civilization.year}:${source}:${safeSummary.civilization.stepIndex}`,
        source,
        snapshotId,
        label: label || `第 ${safeSummary.civilization.year} 年`,
        capturedAt: new Date().toISOString(),
        year: safeSummary.civilization.year,
        geologyTimeMyr: safeSummary.world.geologyTimeMyr,
        metrics: safeSummary.civilization.metrics,
        eventCounts: safeSummary.civilization.eventCounts,
        narrativeSignals: safeSummary.narrativeSignals,
        summary: safeSummary,
    };
}

function mergeEventCounts(points) {
    const totals = {};
    for (const point of points) {
        for (const [type, count] of Object.entries(point.eventCounts || {})) {
            totals[type] = Math.max(totals[type] || 0, count);
        }
    }
    return totals;
}

function timelineDeltas(points) {
    const deltas = [];
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const current = points[i];
        deltas.push({
            fromYear: prev.year,
            toYear: current.year,
            populationChange: (current.metrics.population || 0) - (prev.metrics.population || 0),
            settlementChange: (current.metrics.settlements || 0) - (prev.metrics.settlements || 0),
            cultureChange: (current.metrics.cultures || 0) - (prev.metrics.cultures || 0),
            languageChange: (current.metrics.languages || 0) - (prev.metrics.languages || 0),
            polityChange: (current.metrics.polities || 0) - (prev.metrics.polities || 0),
        });
    }
    return deltas;
}

function eventCountDeltas(prev = {}, current = {}) {
    const out = {};
    const types = new Set([...Object.keys(prev || {}), ...Object.keys(current || {})]);
    for (const type of types) {
        const delta = (current?.[type] || 0) - (prev?.[type] || 0);
        if (delta > 0) out[type] = delta;
    }
    return out;
}

function leadingEventTypes(events = {}, limit = 4) {
    return Object.entries(events)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([type, count]) => ({ type, count }));
}

function recentEventCountsInRange(summary, fromYear, toYear) {
    const counts = {};
    for (const event of summary?.civilization?.recentEvents || []) {
        if (event.year <= fromYear || event.year > toYear) continue;
        counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
}

function hasEventCounts(events) {
    return Object.keys(events || {}).length > 0;
}

function eraHighlights(delta, events, endSummary) {
    const highlights = [];
    if (delta.populationChange > 0) highlights.push(`人口 +${Math.round(delta.populationChange).toLocaleString()}`);
    if (delta.settlementChange > 0) highlights.push(`新增聚落 ${delta.settlementChange}`);
    if (delta.cultureChange > 0 || delta.languageChange > 0) {
        highlights.push(`文化分裂 ${Math.max(0, delta.cultureChange)} 次，语言分裂 ${Math.max(0, delta.languageChange)} 次`);
    }
    if (delta.polityChange > 0 || events['polity-formed']) {
        const count = delta.polityChange > 0 ? delta.polityChange : events['polity-formed'];
        highlights.push(`政体形成信号 ${count} 个`);
    }
    if (events['polity-collapsed']) highlights.push(`政体崩溃信号 ${events['polity-collapsed']} 个`);
    const route = endSummary.civilization.migrationRoutes?.[0];
    if (route?.pathLength > 1) highlights.push(`最长迁徙路线跨越 ${route.pathLength} 个单元`);
    if (!highlights.length) highlights.push('缓慢整合，记录到的结构变化有限');
    return highlights;
}

function eraExplanation(delta, events, endSummary) {
    const lines = [];
    const env = endSummary.environment;
    const metrics = endSummary.civilization.metrics;
    if (delta.settlementChange > 0) {
        lines.push('宜居性、淡水可达性、农业潜力和通行条件支撑了新聚落。');
    }
    if (delta.cultureChange > 0 || delta.languageChange > 0 || events['culture-split'] || events['language-split']) {
        lines.push('屏障和通行成本造成的隔离压力引发文化或语言分化。');
    }
    if (delta.polityChange > 0 || events['polity-formed']) {
        lines.push('高密度聚落在贸易范围、技术、农业和资源条件支持下跨过政体阈值。');
    }
    if (events['polity-collapsed']) {
        lines.push('低稳定性、拥挤、冲突压力或局部宜居性不足造成崩溃风险。');
    }
    if (delta.populationChange > 0 && metrics.settlements === 0) {
        lines.push('人口先于稳定聚落制度扩张。');
    }
    if (env.climateEnhanced) {
        lines.push('气候增强环境输入塑造了本时代的宜居性与农业条件。');
    } else {
        lines.push('本时代主要由地形推导环境输入塑造；计算气候会提供更强的因果细节。');
    }
    return lines.slice(0, 5);
}

function buildEraSummaries(points, deltas) {
    if (!points.length) return [];
    if (points.length === 1) {
        const point = points[0];
        return [{
            index: 1,
            label: '奠基快照',
            fromYear: point.year,
            toYear: point.year,
            durationYears: 0,
            metrics: point.metrics,
            eventCounts: point.eventCounts || {},
            leadingEvents: leadingEventTypes(point.eventCounts || {}),
            highlights: point.narrativeSignals?.slice(0, 3) || ['已记录初始文明快照。'],
            explanationChain: point.narrativeSignals?.slice(0, 5) || [],
            leadingSettlements: point.summary.civilization.settlements?.slice(0, 5) || [],
            leadingPolities: point.summary.civilization.polities?.slice(0, 5) || [],
            migrationRoutes: point.summary.civilization.migrationRoutes?.slice(0, 5) || [],
            cultureFamilies: point.summary.civilization.lineages?.cultureFamilies?.slice(0, 3) || [],
            languageFamilies: point.summary.civilization.lineages?.languageFamilies?.slice(0, 3) || [],
            historicalTraces: {
                ruins: point.summary.civilization.historicalTraces?.ruins?.slice(0, 3) || [],
                settlementSites: point.summary.civilization.historicalTraces?.settlementSites?.slice(0, 3) || [],
                migrationCorridors: point.summary.civilization.historicalTraces?.migrationCorridors?.slice(0, 3) || [],
                stressSignals: point.summary.civilization.historicalTraces?.stressSignals?.slice(0, 3) || [],
            },
        }];
    }
    return deltas.map((delta, i) => {
        const start = points[i];
        const end = points[i + 1];
        const recentEvents = recentEventCountsInRange(end.summary, start.year, end.year);
        const events = hasEventCounts(recentEvents)
            ? recentEvents
            : eventCountDeltas(start.eventCounts || {}, end.eventCounts || {});
        return {
            index: i + 1,
            label: `时代 ${i + 1}：第 ${start.year} 年至第 ${end.year} 年`,
            fromYear: start.year,
            toYear: end.year,
            durationYears: end.year - start.year,
            metrics: end.metrics,
            changes: delta,
            eventCounts: events,
            leadingEvents: leadingEventTypes(events),
            highlights: eraHighlights(delta, events, end.summary),
            explanationChain: eraExplanation(delta, events, end.summary),
            leadingSettlements: end.summary.civilization.settlements?.slice(0, 5) || [],
            leadingPolities: end.summary.civilization.polities?.slice(0, 5) || [],
            migrationRoutes: end.summary.civilization.migrationRoutes?.slice(0, 5) || [],
            cultureFamilies: end.summary.civilization.lineages?.cultureFamilies?.slice(0, 3) || [],
            languageFamilies: end.summary.civilization.lineages?.languageFamilies?.slice(0, 3) || [],
            historicalTraces: {
                ruins: end.summary.civilization.historicalTraces?.ruins?.slice(0, 3) || [],
                settlementSites: end.summary.civilization.historicalTraces?.settlementSites?.slice(0, 3) || [],
                migrationCorridors: end.summary.civilization.historicalTraces?.migrationCorridors?.slice(0, 3) || [],
                stressSignals: end.summary.civilization.historicalTraces?.stressSignals?.slice(0, 3) || [],
            },
        };
    });
}

function lineageFamilyLine(kind, family) {
    if (!family) return `${kind === 'culture' ? '文化' : '语言'}：无`;
    return `${kind === 'culture' ? '文化' : '语言'}根 ${family.rootId}，人口 ${family.population.toLocaleString()}，分支 ${family.branchCount}`;
}

function traceLine(traces = {}) {
    const parts = [];
    if (traces.ruins?.length) parts.push(`${traces.ruins.length} 处遗址`);
    if (traces.settlementSites?.length) parts.push(`${traces.settlementSites.length} 处聚落遗址`);
    if (traces.migrationCorridors?.length) parts.push(`${traces.migrationCorridors.length} 条走廊`);
    if (traces.stressSignals?.length) parts.push(`${traces.stressSignals.length} 个压力信号`);
    return parts.length ? parts.join('，') : '无显著痕迹';
}

function dedupePoints(points) {
    const byKey = new Map();
    for (const point of points) {
        const stepIndex = point.summary?.civilization?.stepIndex ?? point.metrics?.stepIndex ?? '';
        const key = `${point.snapshotId || 'runtime'}:${point.year}:${stepIndex}`;
        byKey.set(key, point);
    }
    return Array.from(byKey.values()).sort((a, b) => (
        (a.year - b.year) ||
        String(a.capturedAt).localeCompare(String(b.capturedAt))
    ));
}

export function buildHistoryTimeline(points, { currentSummary = null } = {}) {
    const rawPoints = points.slice();
    if (currentSummary) rawPoints.push(createHistoryPoint(currentSummary, { source: 'current' }));
    const ordered = dedupePoints(rawPoints).map(clonePlain);
    if (!ordered.length) throw new Error('请先生成或记录至少一个历史摘要，再生成时间线。');
    const latest = ordered[ordered.length - 1];
    const deltas = timelineDeltas(ordered);
    return {
        schema: HISTORY_TIMELINE_SCHEMA,
        version: HISTORY_TIMELINE_VERSION,
        world: {
            seed: latest.summary.world.seed,
            regions: latest.summary.world.regions,
            pointCount: ordered.length,
        },
        range: {
            startYear: ordered[0].year,
            endYear: latest.year,
            startGeologyTimeMyr: ordered[0].geologyTimeMyr,
            endGeologyTimeMyr: latest.geologyTimeMyr,
        },
        points: ordered,
        eventTotals: mergeEventCounts(ordered),
        deltas,
        eras: buildEraSummaries(ordered, deltas),
        latestSummary: latest.summary,
    };
}

export function formatHistoryTimelineMarkdown(timeline) {
    const latest = timeline.latestSummary;
    const latestTraces = latest.civilization.historicalTraces || emptyHistoricalTraces();
    const lines = [
        '# 世界造山历史时间线',
        '',
        `- 种子：${timeline.world.seed}`,
        `- 区域数：${timeline.world.regions.toLocaleString()}`,
        `- 时间范围：第 ${timeline.range.startYear.toLocaleString()} 年 -> 第 ${timeline.range.endYear.toLocaleString()} 年`,
        `- 历史点：${timeline.world.pointCount}`,
        '',
        '## 时代摘要',
        ...(timeline.eras?.length
            ? timeline.eras.flatMap(era => [
                `- ${era.label}：人口 ${era.metrics.population.toLocaleString()}，聚落 ${era.metrics.settlements}，文化 ${era.metrics.cultures}，语言 ${era.metrics.languages}，政体 ${era.metrics.polities}`,
                `  - 亮点：${era.highlights.join('；')}`,
                `  - 原因：${era.explanationChain.join(' ') || '尚未记录因果信号。'}`,
                `  - 谱系：${lineageFamilyLine('culture', era.cultureFamilies?.[0])}；${lineageFamilyLine('language', era.languageFamilies?.[0])}`,
                `  - 痕迹：${traceLine(era.historicalTraces)}`,
            ])
            : ['- 暂无时代摘要。']),
        '',
        '## 时间线点',
        ...timeline.points.map(point => {
            const m = point.metrics;
            return `- 第 ${point.year.toLocaleString()} 年：人口 ${m.population.toLocaleString()}，群体 ${m.livingGroups}，聚落 ${m.settlements}，文化 ${m.cultures}，语言 ${m.languages}，政体 ${m.polities}`;
        }),
        '',
        '## 变化链',
        ...(timeline.deltas.length
            ? timeline.deltas.map(delta => `- 第 ${delta.fromYear.toLocaleString()} 年 -> 第 ${delta.toYear.toLocaleString()} 年：人口 ${delta.populationChange >= 0 ? '+' : ''}${delta.populationChange.toLocaleString()}，聚落 ${delta.settlementChange >= 0 ? '+' : ''}${delta.settlementChange}，文化 ${delta.cultureChange >= 0 ? '+' : ''}${delta.cultureChange}，语言 ${delta.languageChange >= 0 ? '+' : ''}${delta.languageChange}，政体 ${delta.polityChange >= 0 ? '+' : ''}${delta.polityChange}`)
            : ['- 目前只记录了一个历史点。']),
        '',
        '## 事件总计',
        ...Object.entries(timeline.eventTotals).sort((a, b) => a[0].localeCompare(b[0])).map(([type, count]) => `- ${type}: ${count}`),
        '',
        '## 最新叙事信号',
        ...latest.narrativeSignals.map(signal => `- ${signal}`),
        '',
        '## 最新文化与语言谱系',
        ...(latest.civilization.lineages?.cultureFamilies?.length
            ? latest.civilization.lineages.cultureFamilies.map(family => `- 文化根 ${family.rootId}：人口 ${family.population.toLocaleString()}，分支 ${family.branchCount}，最大深度 ${family.maxDepth}`)
            : ['- 尚未记录文化谱系。']),
        ...(latest.civilization.lineages?.languageFamilies?.length
            ? latest.civilization.lineages.languageFamilies.map(family => `- 语言根 ${family.rootId}：人口 ${family.population.toLocaleString()}，分支 ${family.branchCount}，最大深度 ${family.maxDepth}`)
            : ['- 尚未记录语言谱系。']),
        '',
        '## 最新历史痕迹与压力',
        ...latestTraces.traceSignals.map(signal => `- ${signal}`),
        ...(latestTraces.ruins.length
            ? latestTraces.ruins.map(ruin => `- 政体遗址 ${ruin.polityId}：单元 ${ruin.cell}，崩溃于 ${ruin.collapsedYear ?? '未知'}`)
            : ['- 尚未记录已崩溃政体遗址。']),
        ...(latestTraces.settlementSites.length
            ? latestTraces.settlementSites.slice(0, 5).map(site => `- 聚落遗址 ${site.settlementId}：单元 ${site.cell}，年龄 ${site.ageYears.toLocaleString()} 年，等级 ${site.rank}`)
            : ['- 尚未记录聚落遗址。']),
        ...(latestTraces.migrationCorridors.length
            ? latestTraces.migrationCorridors.slice(0, 5).map(route => `- 走廊群体 ${route.groupId}：${route.originCell} -> ${route.currentCell}，路径长度 ${route.pathLength}`)
            : ['- 尚未记录迁徙走廊痕迹。']),
        ...(latestTraces.stressSignals.length
            ? latestTraces.stressSignals.slice(0, 5).map(signal => `- 压力群体 ${signal.groupId}：单元 ${signal.cell}，严重度 ${signal.severity}`)
            : ['- 尚未记录高压力人口信号。']),
    ];
    return lines.join('\n');
}

export function formatHistoryTimelineJson(timeline) {
    return JSON.stringify(timeline, null, 2);
}

function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function downloadHistorySummary(summary, format = 'markdown') {
    const year = summary.civilization.year || 0;
    const seed = summary.world.seed ?? 'world';
    if (format === 'json') {
        const filename = `world-orogen-history-${seed}-year-${year}.json`;
        downloadText(filename, formatHistorySummaryJson(summary), 'application/json');
        return filename;
    }
    const filename = `world-orogen-history-${seed}-year-${year}.md`;
    downloadText(filename, formatHistorySummaryMarkdown(summary), 'text/markdown');
    return filename;
}

export function downloadHistoryTimeline(timeline, format = 'markdown') {
    const start = timeline.range.startYear || 0;
    const end = timeline.range.endYear || 0;
    const seed = timeline.world.seed ?? 'world';
    if (format === 'json') {
        const filename = `world-orogen-history-timeline-${seed}-year-${start}-to-${end}.json`;
        downloadText(filename, formatHistoryTimelineJson(timeline), 'application/json');
        return filename;
    }
    const filename = `world-orogen-history-timeline-${seed}-year-${start}-to-${end}.md`;
    downloadText(filename, formatHistoryTimelineMarkdown(timeline), 'text/markdown');
    return filename;
}

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

function historySignals(summary) {
    const events = summary.civilization.eventCounts;
    const metrics = summary.civilization.metrics;
    const lineages = summary.civilization.lineages;
    const signals = [];
    signals.push(`Population reached ${metrics.population.toLocaleString()} across ${metrics.livingGroups} living groups.`);
    signals.push(`${metrics.settlements} settlements emerged from habitability, freshwater, agriculture, and mobility inputs.`);
    if ((events['culture-split'] || 0) || (events['language-split'] || 0)) {
        signals.push(`Isolation produced ${events['culture-split'] || 0} culture splits and ${events['language-split'] || 0} language splits.`);
    } else {
        signals.push('No identity split has occurred yet; advance civilization time to expose longer historical divergence.');
    }
    if (metrics.polities > 0) {
        signals.push(`${metrics.polities} active polities formed where settlement population, trade, technology, and agriculture aligned.`);
    } else {
        signals.push('No polity has formed yet; current settlements remain below the organization threshold.');
    }
    if (lineages?.cultureFamilies?.length || lineages?.languageFamilies?.length) {
        const topCulture = lineages.cultureFamilies?.[0];
        const topLanguage = lineages.languageFamilies?.[0];
        signals.push(`Dominant lineage roots are culture ${topCulture?.rootId ?? 'none'} and language ${topLanguage?.rootId ?? 'none'}, with ${lineages.cultures?.length || 0} tracked culture branches and ${lineages.languages?.length || 0} tracked language branches.`);
    }
    if (summary.environment.climateEnhanced) {
        signals.push('Climate-enhanced environment inputs are present, so agriculture and habitability include computed temperature and precipitation.');
    } else {
        signals.push('Environment inputs are terrain-derived only; compute a climate layer for richer civilization inputs.');
    }
    return signals;
}

export function buildHistorySummary(curData) {
    if (!curData) throw new Error('Generate a world before building history summary.');
    const civ = curData.civilizationState;
    if (!civ) throw new Error('Seed civilization before building history summary.');

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
    const lines = [
        '# World Orogen History Summary',
        '',
        `- Seed: ${summary.world.seed}`,
        `- Regions: ${summary.world.regions.toLocaleString()}`,
        `- Geology time: ${round(summary.world.geologyTimeMyr, 2)} Myr`,
        `- Civilization year: ${summary.civilization.year.toLocaleString()}`,
        `- Population: ${metrics.population.toLocaleString()}`,
        `- Groups / settlements / polities: ${metrics.livingGroups} / ${metrics.settlements} / ${metrics.polities}`,
        `- Cultures / languages: ${metrics.cultures} / ${metrics.languages}`,
        '',
        '## Narrative Signals',
        ...summary.narrativeSignals.map(item => `- ${item}`),
        '',
        '## Event Counts',
        ...Object.entries(events).sort((a, b) => a[0].localeCompare(b[0])).map(([type, count]) => `- ${type}: ${count}`),
        '',
        '## Leading Settlements',
        ...(summary.civilization.settlements.length
            ? summary.civilization.settlements.map(s => `- Settlement ${s.id}: cell ${s.cell}, pop ${s.population.toLocaleString()}, rank ${s.rank}, culture ${s.cultureId}, language ${s.languageId}, polity ${s.polityId ?? 'none'}`)
            : ['- None yet.']),
        '',
        '## Active Or Remembered Polities',
        ...(summary.civilization.polities.length
            ? summary.civilization.polities.map(p => `- Polity ${p.id}: ${p.status}, capital cell ${p.capitalCell}, pop ${p.population.toLocaleString()}, stability ${p.stability}`)
            : ['- None yet.']),
        '',
        '## Migration Routes',
        ...(summary.civilization.migrationRoutes.length
            ? summary.civilization.migrationRoutes.map(route => `- Group ${route.groupId}: ${route.originCell} -> ${route.currentCell}, path length ${route.pathLength}, pressure ${route.migrationPressure}`)
            : ['- No multi-cell migration route recorded yet.']),
        '',
        '## Culture And Language Lineages',
        ...(summary.civilization.lineages?.cultureFamilies?.length
            ? summary.civilization.lineages.cultureFamilies.map(family => `- Culture root ${family.rootId}: pop ${family.population.toLocaleString()}, branches ${family.branchCount}, max depth ${family.maxDepth}, origin cell ${family.originCell ?? 'unknown'}`)
            : ['- No culture lineage recorded yet.']),
        ...(summary.civilization.lineages?.languageFamilies?.length
            ? summary.civilization.lineages.languageFamilies.map(family => `- Language root ${family.rootId}: pop ${family.population.toLocaleString()}, branches ${family.branchCount}, max depth ${family.maxDepth}, origin cell ${family.originCell ?? 'unknown'}`)
            : ['- No language lineage recorded yet.']),
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
        label: label || `Year ${safeSummary.civilization.year}`,
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
    if (delta.populationChange > 0) highlights.push(`population +${Math.round(delta.populationChange).toLocaleString()}`);
    if (delta.settlementChange > 0) highlights.push(`${delta.settlementChange} new settlement${delta.settlementChange === 1 ? '' : 's'}`);
    if (delta.cultureChange > 0 || delta.languageChange > 0) {
        highlights.push(`${Math.max(0, delta.cultureChange)} culture and ${Math.max(0, delta.languageChange)} language splits`);
    }
    if (delta.polityChange > 0 || events['polity-formed']) {
        const count = delta.polityChange > 0 ? delta.polityChange : events['polity-formed'];
        highlights.push(`${count} polity formation signal${count === 1 ? '' : 's'}`);
    }
    if (events['polity-collapsed']) highlights.push(`${events['polity-collapsed']} polity collapse signal${events['polity-collapsed'] === 1 ? '' : 's'}`);
    const route = endSummary.civilization.migrationRoutes?.[0];
    if (route?.pathLength > 1) highlights.push(`longest migration route spans ${route.pathLength} cells`);
    if (!highlights.length) highlights.push('slow consolidation with limited recorded structural change');
    return highlights;
}

function eraExplanation(delta, events, endSummary) {
    const lines = [];
    const env = endSummary.environment;
    const metrics = endSummary.civilization.metrics;
    if (delta.settlementChange > 0) {
        lines.push('Habitability, freshwater access, agriculture potential, and mobility inputs supported new settlements.');
    }
    if (delta.cultureChange > 0 || delta.languageChange > 0 || events['culture-split'] || events['language-split']) {
        lines.push('Isolation pressure from barriers and mobility costs produced culture or language divergence.');
    }
    if (delta.polityChange > 0 || events['polity-formed']) {
        lines.push('Dense settlements with trade reach, technology, agriculture, and resources crossed the polity threshold.');
    }
    if (events['polity-collapsed']) {
        lines.push('Low stability, crowding, conflict pressure, or poor local habitability created collapse risk.');
    }
    if (delta.populationChange > 0 && metrics.settlements === 0) {
        lines.push('Population expanded before durable settlement institutions emerged.');
    }
    if (env.climateEnhanced) {
        lines.push('Climate-enhanced environment inputs shaped habitability and agriculture in this era.');
    } else {
        lines.push('Terrain-derived environment inputs shaped this era; climate computation would add stronger causal detail.');
    }
    return lines.slice(0, 5);
}

function buildEraSummaries(points, deltas) {
    if (!points.length) return [];
    if (points.length === 1) {
        const point = points[0];
        return [{
            index: 1,
            label: 'Founding snapshot',
            fromYear: point.year,
            toYear: point.year,
            durationYears: 0,
            metrics: point.metrics,
            eventCounts: point.eventCounts || {},
            leadingEvents: leadingEventTypes(point.eventCounts || {}),
            highlights: point.narrativeSignals?.slice(0, 3) || ['Initial civilization snapshot recorded.'],
            explanationChain: point.narrativeSignals?.slice(0, 5) || [],
            leadingSettlements: point.summary.civilization.settlements?.slice(0, 5) || [],
            leadingPolities: point.summary.civilization.polities?.slice(0, 5) || [],
            migrationRoutes: point.summary.civilization.migrationRoutes?.slice(0, 5) || [],
            cultureFamilies: point.summary.civilization.lineages?.cultureFamilies?.slice(0, 3) || [],
            languageFamilies: point.summary.civilization.lineages?.languageFamilies?.slice(0, 3) || [],
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
            label: `Era ${i + 1}: Year ${start.year} to ${end.year}`,
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
        };
    });
}

function lineageFamilyLine(kind, family) {
    if (!family) return `${kind} none`;
    return `${kind} root ${family.rootId} pop ${family.population.toLocaleString()} branches ${family.branchCount}`;
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
    if (!ordered.length) throw new Error('Build or record at least one history summary before building a timeline.');
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
    const lines = [
        '# World Orogen History Timeline',
        '',
        `- Seed: ${timeline.world.seed}`,
        `- Regions: ${timeline.world.regions.toLocaleString()}`,
        `- Time range: Year ${timeline.range.startYear.toLocaleString()} -> Year ${timeline.range.endYear.toLocaleString()}`,
        `- History points: ${timeline.world.pointCount}`,
        '',
        '## Era Summaries',
        ...(timeline.eras?.length
            ? timeline.eras.flatMap(era => [
                `- ${era.label}: pop ${era.metrics.population.toLocaleString()}, settlements ${era.metrics.settlements}, cultures ${era.metrics.cultures}, languages ${era.metrics.languages}, polities ${era.metrics.polities}`,
                `  - Highlights: ${era.highlights.join('; ')}`,
                `  - Why: ${era.explanationChain.join(' ') || 'No causal signal recorded yet.'}`,
                `  - Lineages: ${lineageFamilyLine('culture', era.cultureFamilies?.[0])}; ${lineageFamilyLine('language', era.languageFamilies?.[0])}`,
            ])
            : ['- No era summaries available.']),
        '',
        '## Timeline Points',
        ...timeline.points.map(point => {
            const m = point.metrics;
            return `- Year ${point.year.toLocaleString()}: pop ${m.population.toLocaleString()}, groups ${m.livingGroups}, settlements ${m.settlements}, cultures ${m.cultures}, languages ${m.languages}, polities ${m.polities}`;
        }),
        '',
        '## Change Chain',
        ...(timeline.deltas.length
            ? timeline.deltas.map(delta => `- Year ${delta.fromYear.toLocaleString()} -> ${delta.toYear.toLocaleString()}: population ${delta.populationChange >= 0 ? '+' : ''}${delta.populationChange.toLocaleString()}, settlements ${delta.settlementChange >= 0 ? '+' : ''}${delta.settlementChange}, cultures ${delta.cultureChange >= 0 ? '+' : ''}${delta.cultureChange}, languages ${delta.languageChange >= 0 ? '+' : ''}${delta.languageChange}, polities ${delta.polityChange >= 0 ? '+' : ''}${delta.polityChange}`)
            : ['- Only one history point is recorded so far.']),
        '',
        '## Event Totals',
        ...Object.entries(timeline.eventTotals).sort((a, b) => a[0].localeCompare(b[0])).map(([type, count]) => `- ${type}: ${count}`),
        '',
        '## Latest Narrative Signals',
        ...latest.narrativeSignals.map(signal => `- ${signal}`),
        '',
        '## Latest Culture And Language Lineages',
        ...(latest.civilization.lineages?.cultureFamilies?.length
            ? latest.civilization.lineages.cultureFamilies.map(family => `- Culture root ${family.rootId}: pop ${family.population.toLocaleString()}, branches ${family.branchCount}, max depth ${family.maxDepth}`)
            : ['- No culture lineage recorded yet.']),
        ...(latest.civilization.lineages?.languageFamilies?.length
            ? latest.civilization.lineages.languageFamilies.map(family => `- Language root ${family.rootId}: pop ${family.population.toLocaleString()}, branches ${family.branchCount}, max depth ${family.maxDepth}`)
            : ['- No language lineage recorded yet.']),
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

const HISTORY_SUMMARY_SCHEMA = 'world-orogen-history-summary';
const HISTORY_SUMMARY_VERSION = 1;

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

function historySignals(summary) {
    const events = summary.civilization.eventCounts;
    const metrics = summary.civilization.metrics;
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
    ];
    return lines.join('\n');
}

export function formatHistorySummaryJson(summary) {
    return JSON.stringify(summary, null, 2);
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

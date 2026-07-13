export function areaTotal(grid) {
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) total += cellArea(grid, id);
  return total;
}

export function weightedSum(grid, field, options = {}) {
  const predicate = options.predicate;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    total += Number(field[id] ?? 0) * cellArea(grid, id);
  }
  return total;
}

export function weightedMean(grid, field, options = {}) {
  const predicate = options.predicate;
  let total = 0;
  let weight = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    const area = cellArea(grid, id);
    total += Number(field[id] ?? 0) * area;
    weight += area;
  }
  return total / Math.max(weight, Number.EPSILON);
}

export function weightedShare(grid, mask, options = {}) {
  const predicate = options.predicate;
  let covered = 0;
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    const area = cellArea(grid, id);
    total += area;
    if (mask[id]) covered += area;
  }
  return covered / Math.max(total, Number.EPSILON);
}

export function weightedCategoryShares(grid, categories, categoryCount, options = {}) {
  const predicate = options.predicate;
  const areaByCategory = new Float64Array(Math.max(0, categoryCount));
  let total = 0;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    const category = categories[id];
    if (category < 0 || category >= areaByCategory.length) continue;
    const area = cellArea(grid, id);
    areaByCategory[category] += area;
    total += area;
  }
  const shares = new Float64Array(areaByCategory.length);
  for (let i = 0; i < areaByCategory.length; i += 1) {
    shares[i] = areaByCategory[i] / Math.max(total, Number.EPSILON);
  }
  return { areaByCategory, shares, totalArea: total };
}

export function weightedFieldSummary(grid, field, options = {}) {
  const predicate = options.predicate;
  let weightedTotal = 0;
  let totalArea = 0;
  let finiteArea = 0;
  let nonZeroArea = 0;
  let positiveArea = 0;
  let negativeArea = 0;
  let finiteCount = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let id = 0; id < grid.size; id += 1) {
    if (predicate && !predicate(id)) continue;
    const area = cellArea(grid, id);
    totalArea += area;
    const value = Number(field[id] ?? NaN);
    if (!Number.isFinite(value)) continue;
    finiteCount += 1;
    finiteArea += area;
    weightedTotal += value * area;
    min = Math.min(min, value);
    max = Math.max(max, value);
    if (value !== 0) nonZeroArea += area;
    if (value > 0) positiveArea += area;
    if (value < 0) negativeArea += area;
  }
  const safeTotalArea = Math.max(totalArea, Number.EPSILON);
  const safeFiniteArea = Math.max(finiteArea, Number.EPSILON);
  return {
    finiteShare: finiteArea / safeTotalArea,
    finiteCount,
    weightedMean: weightedTotal / safeFiniteArea,
    min: finiteCount ? min : null,
    max: finiteCount ? max : null,
    nonZeroShare: nonZeroArea / safeTotalArea,
    positiveShare: positiveArea / safeTotalArea,
    negativeShare: negativeArea / safeTotalArea,
    sampledArea: totalArea,
  };
}

export function measureAreaStats(grid) {
  let total = 0;
  let min = Infinity;
  let max = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = cellArea(grid, id);
    total += area;
    min = Math.min(min, area);
    max = Math.max(max, area);
  }
  return {
    areaTotal: total,
    areaTotalError: total - 4 * Math.PI,
    areaMin: min,
    areaMax: max,
    areaMinMaxRatio: max / Math.max(min, Number.EPSILON),
    equalAreaCell: 4 * Math.PI / Math.max(1, grid.size),
  };
}

export function measureHemisphereAreaStats(grid) {
  let north = 0;
  let south = 0;
  let east = 0;
  let west = 0;
  for (let id = 0; id < grid.size; id += 1) {
    const area = cellArea(grid, id);
    if (grid.positionY[id] >= 0) north += area;
    else south += area;
    if (grid.positionZ[id] >= 0) east += area;
    else west += area;
  }
  return {
    northAreaShare: north / Math.max(north + south, Number.EPSILON),
    southAreaShare: south / Math.max(north + south, Number.EPSILON),
    eastAreaShare: east / Math.max(east + west, Number.EPSILON),
    westAreaShare: west / Math.max(east + west, Number.EPSILON),
  };
}

export function finiteShare(field) {
  let finite = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i])) finite += 1;
  }
  return finite / Math.max(1, field.length);
}

export function maxFinite(field) {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) {
    if (Number.isFinite(field[i]) && field[i] > max) max = field[i];
  }
  return max;
}

function cellArea(grid, id) {
  return grid.area?.[id] ?? 1;
}

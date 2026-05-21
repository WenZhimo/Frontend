from __future__ import annotations

from statistics import mean, pstdev

DEFAULT_SCORE_WEIGHT = 2500.0
DEFAULT_SURVIVAL_WEIGHT = 100.0
DEFAULT_RAW_FITNESS_WEIGHT = 0.1
DEFAULT_RAW_FITNESS_CAP = 300.0
DEFAULT_ZERO_SCORE_PENALTY = 50.0
DEFAULT_APPROACH_APPLE_WEIGHT = 12.0
DEFAULT_REPEAT_CELL_PENALTY = 3.0
DEFAULT_STALL_PENALTY = 1.5


def compute_survival_ratio(frames: float, starvation_limit: int) -> float:
    if starvation_limit <= 0:
        return 0.0
    return min(1.0, frames / starvation_limit)


def compute_selection_score(
    *,
    score: float,
    frames: float,
    raw_fitness: float,
    starvation_limit: int,
    approach_apple_events: float = 0.0,
    repeat_cell_count: float = 0.0,
    stall_steps: float = 0.0,
    score_weight: float = DEFAULT_SCORE_WEIGHT,
    survival_weight: float = DEFAULT_SURVIVAL_WEIGHT,
    raw_fitness_weight: float = DEFAULT_RAW_FITNESS_WEIGHT,
    raw_fitness_cap: float = DEFAULT_RAW_FITNESS_CAP,
    zero_score_penalty: float = DEFAULT_ZERO_SCORE_PENALTY,
    approach_apple_weight: float = DEFAULT_APPROACH_APPLE_WEIGHT,
    repeat_cell_penalty: float = DEFAULT_REPEAT_CELL_PENALTY,
    stall_penalty: float = DEFAULT_STALL_PENALTY,
) -> float:
    survival_ratio = compute_survival_ratio(frames, starvation_limit)
    clipped_fitness = min(raw_fitness, raw_fitness_cap)
    selection_score = (
        score * score_weight
        + survival_ratio * survival_weight
        + clipped_fitness * raw_fitness_weight
        + approach_apple_events * approach_apple_weight
        - repeat_cell_count * repeat_cell_penalty
        - stall_steps * stall_penalty
    )
    if score <= 0:
        selection_score -= zero_score_penalty
    return selection_score


def summarize_episodes(
    episodes,
    *,
    score_weight: float = DEFAULT_SCORE_WEIGHT,
    survival_weight: float = DEFAULT_SURVIVAL_WEIGHT,
    raw_fitness_weight: float = DEFAULT_RAW_FITNESS_WEIGHT,
    raw_fitness_cap: float = DEFAULT_RAW_FITNESS_CAP,
    zero_score_penalty: float = DEFAULT_ZERO_SCORE_PENALTY,
    approach_apple_weight: float = DEFAULT_APPROACH_APPLE_WEIGHT,
    repeat_cell_penalty: float = DEFAULT_REPEAT_CELL_PENALTY,
    stall_penalty: float = DEFAULT_STALL_PENALTY,
):
    return {
        'avgFitness': mean(item['fitness'] for item in episodes),
        'avgSelectionScore': mean(item['selectionScore'] for item in episodes),
        'avgScore': mean(item['score'] for item in episodes),
        'avgFrames': mean(item['frames'] for item in episodes),
        'avgSurvivalRatio': mean(item['survivalRatio'] for item in episodes),
        'avgApproachAppleEvents': mean(item['approachAppleEvents'] for item in episodes),
        'avgRepeatCellCount': mean(item['repeatCellCount'] for item in episodes),
        'avgStallSteps': mean(item['stallSteps'] for item in episodes),
        'fitnessStd': pstdev(item['fitness'] for item in episodes) if len(episodes) > 1 else 0.0,
        'selectionScoreStd': pstdev(item['selectionScore'] for item in episodes) if len(episodes) > 1 else 0.0,
        'scoreWeight': score_weight,
        'survivalWeight': survival_weight,
        'rawFitnessWeight': raw_fitness_weight,
        'rawFitnessCap': raw_fitness_cap,
        'zeroScorePenalty': zero_score_penalty,
        'approachAppleWeight': approach_apple_weight,
        'repeatCellPenalty': repeat_cell_penalty,
        'stallPenalty': stall_penalty,
    }

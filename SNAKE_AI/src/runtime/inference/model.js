function relu(value) {
    return Math.max(0, value);
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-value));
}

function dense(input, weights, bias, activation) {
    const output = new Array(bias.length).fill(0);
    for (let col = 0; col < bias.length; col += 1) {
        let sum = bias[col];
        for (let row = 0; row < input.length; row += 1) {
            sum += input[row] * weights[row][col];
        }
        output[col] = activation(sum);
    }
    return output;
}

export function validateModel(model) {
    if (!model || model.inputSize !== 32 || model.outputSize !== 4) {
        throw new Error('Invalid SnakeAI model metadata');
    }

    const { W1, b1, W2, b2, W3, b3 } = model.weights || {};
    if (!W1 || !b1 || !W2 || !b2 || !W3 || !b3) {
        throw new Error('SnakeAI model weights are incomplete');
    }

    if (W1.length !== model.inputSize || b1.length !== model.hiddenSizes[0]) {
        throw new Error('SnakeAI W1/b1 shape mismatch');
    }
    if (W2.length !== model.hiddenSizes[0] || b2.length !== model.hiddenSizes[1]) {
        throw new Error('SnakeAI W2/b2 shape mismatch');
    }
    if (W3.length !== model.hiddenSizes[1] || b3.length !== model.outputSize) {
        throw new Error('SnakeAI W3/b3 shape mismatch');
    }
    return model;
}

export function runModel(model, features) {
    if (features.length !== model.inputSize) {
        throw new Error(`SnakeAI feature vector must be ${model.inputSize}, got ${features.length}`);
    }

    const hidden1 = dense(features, model.weights.W1, model.weights.b1, relu);
    const hidden2 = dense(hidden1, model.weights.W2, model.weights.b2, relu);
    const output = dense(hidden2, model.weights.W3, model.weights.b3, sigmoid);
    return {
        hidden1,
        hidden2,
        output,
    };
}

export function rankOutputDirections(model, output) {
    return output
        .map((score, index) => ({ score, direction: model.outputDirectionOrder[index] }))
        .sort((a, b) => b.score - a.score);
}

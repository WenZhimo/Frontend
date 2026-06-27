const INTEGER_PLACES = ["十亿", "亿", "千万", "百万", "十万", "万", "千", "百", "十", "个"];
const FRACTION_PLACES = ["十分", "百分", "千分", "万分"];
const TOTAL_RODS = INTEGER_PLACES.length + FRACTION_PLACES.length;
const OPERATORS = {
  "+": { precedence: 2, assoc: "left", arity: 2 },
  "-": { precedence: 2, assoc: "left", arity: 2 },
  "*": { precedence: 3, assoc: "left", arity: 2 },
  "/": { precedence: 3, assoc: "left", arity: 2 },
  "^": { precedence: 4, assoc: "right", arity: 2 },
  "%": { precedence: 5, assoc: "left", arity: 1, postfix: true },
  "u+": { precedence: 6, assoc: "right", arity: 1 },
  "u-": { precedence: 6, assoc: "right", arity: 1 },
};
const FUNCTIONS = new Set(["sqrt", "cbrt", "abs", "floor", "ceil", "round", "pow"]);

const abacusEl = document.querySelector("#abacus");
const expressionEl = document.querySelector("#expression");
const runBtn = document.querySelector("#runBtn");
const stepBtn = document.querySelector("#stepBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const resetBtn = document.querySelector("#resetBtn");
const timelineEl = document.querySelector("#timeline");
const microStepEl = document.querySelector("#microStep");
const currentValueEl = document.querySelector("#currentValue");
const finalValueEl = document.querySelector("#finalValue");
const statusTextEl = document.querySelector("#statusText");
const stepCounterEl = document.querySelector("#stepCounter");
const speedEl = document.querySelector("#speed");

let rods = [];
let currentDigits = Array(TOTAL_RODS).fill(0);
let currentStepIndex = 0;
let preparedSteps = [];
let playbackToken = 0;
let isRunning = false;
let speed = 1;

function createAbacus() {
  abacusEl.innerHTML = "";
  rods = Array.from({ length: TOTAL_RODS }, (_, index) => {
    const rod = document.createElement("div");
    rod.className = "rod";
    if (index === INTEGER_PLACES.length) rod.classList.add("decimal");

    const uppers = [0, 1].map((slot) => {
      const bead = document.createElement("span");
      bead.className = "bead upper";
      bead.dataset.slot = String(slot);
      rod.appendChild(bead);
      return bead;
    });

    const lowers = [0, 1, 2, 3, 4].map((slot) => {
      const bead = document.createElement("span");
      bead.className = "bead lower";
      bead.dataset.slot = String(slot);
      rod.appendChild(bead);
      return bead;
    });

    const digit = document.createElement("span");
    digit.className = "digit-label";
    digit.textContent = "0";
    rod.appendChild(digit);

    const label = document.createElement("span");
    label.className = "place-label";
    label.textContent =
      index < INTEGER_PLACES.length
        ? INTEGER_PLACES[index]
        : FRACTION_PLACES[index - INTEGER_PLACES.length];
    rod.appendChild(label);

    abacusEl.appendChild(rod);
    return { rod, uppers, lowers, digit };
  });
}

function setRodDigit(index, value) {
  const digit = Math.max(0, Math.min(9, Math.trunc(value)));
  const upperCount = digit >= 5 ? 1 : 0;
  const lowerCount = digit % 5;
  const target = rods[index];
  if (!target) return;

  target.uppers.forEach((bead, slot) => {
    bead.classList.toggle("active", slot < upperCount);
  });
  target.lowers.forEach((bead, slot) => {
    bead.classList.toggle("active", slot < lowerCount);
  });
  target.digit.textContent = String(digit);
  target.rod.classList.remove("pulse");
  window.requestAnimationFrame(() => target.rod.classList.add("pulse"));
  currentDigits[index] = digit;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round((value + Number.EPSILON) * 1e10) / 1e10;
  if (Object.is(rounded, -0)) return "0";
  return String(rounded);
}

function formatForAbacus(value) {
  if (!Number.isFinite(value)) throw new Error("结果超出算盘可表示范围");
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const normalized = formatNumber(absolute);
  let [intPart, fracPart = ""] = normalized.includes("e")
    ? absolute.toFixed(FRACTION_PLACES.length).split(".")
    : normalized.split(".");

  if (intPart.length > INTEGER_PLACES.length) {
    throw new Error(`整数部分超过 ${INTEGER_PLACES.length} 档，当前算盘放不下`);
  }

  intPart = intPart.padStart(INTEGER_PLACES.length, "0");
  fracPart = fracPart.slice(0, FRACTION_PLACES.length).padEnd(FRACTION_PLACES.length, "0");
  return { sign, display: `${sign}${normalized}`, digits: `${intPart}${fracPart}`.split("").map(Number) };
}

function placeName(index) {
  return index < INTEGER_PLACES.length
    ? INTEGER_PLACES[index]
    : FRACTION_PLACES[index - INTEGER_PLACES.length];
}

function digitPhrase(index, from, to) {
  const upper = to >= 5 ? "一颗上珠靠梁作五" : "上珠离梁";
  const lower = to % 5;
  const lowerText = lower ? `${lower} 颗下珠靠梁` : "下珠全部离梁";
  return `${placeName(index)}：${from} 拨成 ${to}，${upper}，${lowerText}。`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms / speed));
}

async function animateToValue(value, token) {
  const formatted = formatForAbacus(value);
  currentValueEl.textContent = formatted.display;
  const changes = formatted.digits
    .map((digit, index) => ({ digit, index, from: currentDigits[index] }))
    .filter((change) => change.digit !== change.from);

  if (!changes.length) {
    microStepEl.textContent = `${formatted.sign ? "负数以符号记录，" : ""}算盘保持 ${formatted.display}。`;
    await sleep(260);
    return;
  }

  for (const change of changes) {
    if (token !== playbackToken) return;
    microStepEl.textContent = digitPhrase(change.index, change.from, change.digit);
    setRodDigit(change.index, change.digit);
    await sleep(170);
  }
  if (formatted.sign) {
    microStepEl.textContent = `算盘表示绝对值，负号另记：${formatted.display}。`;
    await sleep(220);
  }
}

function tokenize(input) {
  const tokens = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/\d|\./.test(char)) {
      const start = index;
      let dotCount = 0;
      while (index < input.length && /[\d.]/.test(input[index])) {
        if (input[index] === ".") dotCount += 1;
        index += 1;
      }
      const raw = input.slice(start, index);
      if (dotCount > 1 || raw === ".") throw new Error(`数字格式错误：${raw}`);
      tokens.push({ type: "number", value: Number(raw), raw });
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      const start = index;
      while (index < input.length && /[a-zA-Z]/.test(input[index])) index += 1;
      const name = input.slice(start, index).toLowerCase();
      if (!FUNCTIONS.has(name)) throw new Error(`暂不支持函数：${name}`);
      tokens.push({ type: "function", value: name });
      continue;
    }
    if ("+-*/^%(),".includes(char)) {
      tokens.push({ type: char === "," ? "comma" : char === "(" || char === ")" ? "paren" : "operator", value: char });
      index += 1;
      continue;
    }
    throw new Error(`无法识别字符：${char}`);
  }
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const stack = [];
  let previous = null;

  tokens.forEach((token) => {
    if (token.type === "number") {
      output.push(token);
      previous = token;
      return;
    }

    if (token.type === "function") {
      stack.push(token);
      previous = token;
      return;
    }

    if (token.type === "comma") {
      while (stack.length && stack.at(-1).value !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("函数参数分隔符位置错误");
      previous = token;
      return;
    }

    if (token.type === "paren" && token.value === "(") {
      stack.push(token);
      previous = token;
      return;
    }

    if (token.type === "paren" && token.value === ")") {
      while (stack.length && stack.at(-1).value !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("括号不匹配");
      stack.pop();
      if (stack.length && stack.at(-1).type === "function") output.push(stack.pop());
      previous = token;
      return;
    }

    if (token.type === "operator") {
      let op = token.value;
      const unaryContext =
        !previous ||
        previous.type === "operator" && previous.value !== "%" ||
        previous.type === "comma" ||
        previous.type === "function" ||
        previous.type === "paren" && previous.value === "(";

      if ((op === "+" || op === "-") && unaryContext) op = `u${op}`;
      const operator = OPERATORS[op];
      if (!operator) throw new Error(`未知运算符：${op}`);

      while (stack.length) {
        const top = stack.at(-1);
        const topOp = OPERATORS[top.value];
        if (!topOp) break;
        const shouldPop =
          (!operator.postfix && operator.assoc === "left" && operator.precedence <= topOp.precedence) ||
          (!operator.postfix && operator.assoc === "right" && operator.precedence < topOp.precedence) ||
          (operator.postfix && operator.precedence <= topOp.precedence);
        if (!shouldPop) break;
        output.push(stack.pop());
      }
      stack.push({ type: "operator", value: op });
      previous = { type: "operator", value: op };
    }
  });

  while (stack.length) {
    const token = stack.pop();
    if (token.value === "(" || token.value === ")") throw new Error("括号不匹配");
    output.push(token);
  }
  return output;
}

function applyOperator(op, args) {
  const [a, b] = args;
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") {
    if (b === 0) throw new Error("除数不能为 0");
    return a / b;
  }
  if (op === "^") return Math.pow(a, b);
  if (op === "%") return a / 100;
  if (op === "u+") return a;
  if (op === "u-") return -a;
  throw new Error(`未知运算符：${op}`);
}

function applyFunction(name, args) {
  if (name === "sqrt") {
    if (args[0] < 0) throw new Error("sqrt 不能开负数");
    return Math.sqrt(args[0]);
  }
  if (name === "cbrt") return Math.cbrt(args[0]);
  if (name === "abs") return Math.abs(args[0]);
  if (name === "floor") return Math.floor(args[0]);
  if (name === "ceil") return Math.ceil(args[0]);
  if (name === "round") return Math.round(args[0]);
  if (name === "pow") return Math.pow(args[0], args[1]);
  throw new Error(`未知函数：${name}`);
}

function operationNote(op, args, result) {
  const values = args.map(formatNumber);
  const out = formatNumber(result);
  if (op === "+") return `拨入 ${values[1]}，满五用上珠，满十向前一档进位，得到 ${out}。`;
  if (op === "-") return `拨去 ${values[1]}，不够减时向前一档借位，得到 ${out}。`;
  if (op === "*") return `按位乘积逐次累加到算盘，本步汇总为 ${values[0]} × ${values[1]} = ${out}。`;
  if (op === "/") return `估商、试减并保留余量，本步汇总为 ${values[0]} ÷ ${values[1]} = ${out}。`;
  if (op === "^") return `乘方可视作连续乘法，本步得到 ${values[0]} ^ ${values[1]} = ${out}。`;
  if (op === "%") return `${values[0]}% 换算为 ${out}，再拨到小数档。`;
  if (op === "u-") return `记录负号，算盘拨出绝对值 ${formatNumber(Math.abs(result))}。`;
  return `得到 ${out}。`;
}

function evaluateExpression(input) {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error("请输入运算式");
  const rpn = toRpn(tokens);
  const stack = [];
  const steps = [];

  rpn.forEach((token) => {
    if (token.type === "number") {
      stack.push(token.value);
      steps.push({
        title: `置数 ${token.raw}`,
        value: token.value,
        detail: `先把 ${token.raw} 拨入算盘，作为当前操作数。`,
      });
      return;
    }

    if (token.type === "operator") {
      const operator = OPERATORS[token.value];
      if (stack.length < operator.arity) throw new Error("运算式缺少操作数");
      const args = stack.splice(stack.length - operator.arity, operator.arity);
      const result = applyOperator(token.value, args);
      if (!Number.isFinite(result)) throw new Error("计算结果不是有限数");
      stack.push(result);
      steps.push({
        title: `${args.map(formatNumber).join(` ${token.value.replace("u", "")} `)} = ${formatNumber(result)}`,
        value: result,
        detail: operationNote(token.value, args, result),
      });
      return;
    }

    if (token.type === "function") {
      const arity = token.value === "pow" ? 2 : 1;
      if (stack.length < arity) throw new Error(`${token.value} 缺少参数`);
      const args = stack.splice(stack.length - arity, arity);
      const result = applyFunction(token.value, args);
      if (!Number.isFinite(result)) throw new Error("函数结果不是有限数");
      stack.push(result);
      steps.push({
        title: `${token.value}(${args.map(formatNumber).join(", ")}) = ${formatNumber(result)}`,
        value: result,
        detail:
          token.value === "sqrt" || token.value === "cbrt"
            ? `开方用试商和逐档逼近，本步把结果 ${formatNumber(result)} 拨到算盘。`
            : `函数运算完成，把 ${formatNumber(result)} 拨到算盘。`,
      });
    }
  });

  if (stack.length !== 1) throw new Error("运算式结构不完整");
  return { result: stack[0], steps };
}

function renderTimeline(steps) {
  timelineEl.innerHTML = "";
  steps.forEach((step, index) => {
    const item = document.createElement("li");
    item.dataset.index = String(index + 1);
    item.innerHTML = `<strong>${step.title}</strong><span>${step.detail}</span>`;
    timelineEl.appendChild(item);
  });
  updateStepCounter();
}

function updateStepCounter() {
  stepCounterEl.textContent = `${Math.min(currentStepIndex, preparedSteps.length)} / ${preparedSteps.length}`;
  [...timelineEl.children].forEach((item, index) => {
    item.classList.toggle("active", index === currentStepIndex - 1);
  });
}

function setStatus(text, error = false) {
  statusTextEl.textContent = text;
  statusTextEl.classList.toggle("error", error);
}

function clearAbacusVisual(message = "算盘归零，等待演算。") {
  currentDigits = Array(TOTAL_RODS).fill(0);
  rods.forEach((_, index) => setRodDigit(index, 0));
  currentValueEl.textContent = "0";
  microStepEl.textContent = message;
}

function prepare() {
  try {
    const { result, steps } = evaluateExpression(expressionEl.value);
    formatForAbacus(result);
    preparedSteps = steps;
    currentStepIndex = 0;
    clearAbacusVisual("已解析运算式，算盘归零，准备逐步拨珠。");
    renderTimeline(preparedSteps);
    finalValueEl.textContent = formatNumber(result);
    setStatus("已解析");
    return true;
  } catch (error) {
    preparedSteps = [];
    currentStepIndex = 0;
    renderTimeline(preparedSteps);
    finalValueEl.textContent = "无法计算";
    microStepEl.textContent = error.message;
    setStatus("错误", true);
    return false;
  }
}

async function playFromCurrent() {
  if (!preparedSteps.length && !prepare()) return;
  playbackToken += 1;
  const token = playbackToken;
  isRunning = true;
  setStatus("演算中");

  while (currentStepIndex < preparedSteps.length && token === playbackToken) {
    const step = preparedSteps[currentStepIndex];
    currentStepIndex += 1;
    updateStepCounter();
    microStepEl.textContent = step.detail;
    await animateToValue(step.value, token);
    await sleep(240);
  }

  if (token === playbackToken) {
    isRunning = false;
    setStatus("完成");
    microStepEl.textContent = "演算完成，算盘停在最终结果。";
  }
}

async function playOneStep() {
  if (!preparedSteps.length && !prepare()) return;
  if (currentStepIndex >= preparedSteps.length) return;
  playbackToken += 1;
  const token = playbackToken;
  const step = preparedSteps[currentStepIndex];
  currentStepIndex += 1;
  updateStepCounter();
  setStatus("单步");
  await animateToValue(step.value, token);
}

function resetAbacus() {
  playbackToken += 1;
  isRunning = false;
  currentStepIndex = 0;
  clearAbacusVisual();
  finalValueEl.textContent = "待演算";
  setStatus("就绪");
  updateStepCounter();
}

runBtn.addEventListener("click", () => {
  if (prepare()) playFromCurrent();
});

stepBtn.addEventListener("click", () => {
  if (!preparedSteps.length || currentStepIndex >= preparedSteps.length) prepare();
  playOneStep();
});

pauseBtn.addEventListener("click", () => {
  playbackToken += 1;
  isRunning = false;
  setStatus("已暂停");
});

resetBtn.addEventListener("click", resetAbacus);

speedEl.addEventListener("input", () => {
  speed = Number(speedEl.value);
  document.documentElement.style.setProperty("--speed", String(speed));
});

document.querySelectorAll("[data-expression]").forEach((button) => {
  button.addEventListener("click", () => {
    expressionEl.value = button.dataset.expression;
    prepare();
  });
});

expressionEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (!isRunning && prepare()) playFromCurrent();
  }
});

createAbacus();
resetAbacus();
prepare();

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPERATION = /^[A-Za-z0-9_+\-*/().\s]+$/;

function operationVariables(expression) {
  if (!OPERATION.test(expression) || !/[+\-*/]/.test(expression)) return [];
  return [...new Set(expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [])];
}

export function inspectTemplateVariables(...parts) {
  const tokens = new Set();
  for (const part of parts) {
    for (const match of String(part || "").matchAll(/\{([^{}]+)\}/g)) {
      tokens.add(match[1].trim());
    }
  }

  const variables = new Set();
  for (const token of tokens) {
    if (VARIABLE_NAME.test(token)) {
      variables.add(token);
      continue;
    }
    operationVariables(token).forEach((variable) => variables.add(variable));
  }
  return [...variables];
}

export function evaluateSheetOperation(expression, values) {
  if (!OPERATION.test(expression)) throw new Error("This operation contains unsupported characters.");

  const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/]/g) || [];
  if (tokens.join("") !== expression.replace(/\s+/g, "")) {
    throw new Error("This operation is not valid.");
  }

  let index = 0;
  const parsePrimary = () => {
    const token = tokens[index++];
    if (token === "(") {
      const value = parseExpression();
      if (tokens[index++] !== ")") throw new Error("This operation has mismatched parentheses.");
      return value;
    }
    if (token === "+" || token === "-") {
      const value = parsePrimary();
      return token === "-" ? -value : value;
    }
    const value = VARIABLE_NAME.test(token || "") ? Number(values[token]) : Number(token);
    if (!Number.isFinite(value)) throw new Error(`Add a numeric value for ${token || "this operation"}.`);
    return value;
  };
  const parseTerm = () => {
    let value = parsePrimary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = parsePrimary();
      if (operator === "/" && right === 0) throw new Error("An operation cannot divide by zero.");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const parseExpression = () => {
    let value = parseTerm();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  if (!tokens.length) throw new Error("Enter a valid operation.");
  const result = parseExpression();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("This operation is not valid.");
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function renderSheetTemplate(template, values, { html = false } = {}) {
  return String(template || "").replace(/\{([^{}]+)\}/g, (placeholder, rawExpression) => {
    const expression = rawExpression.trim();
    if (Object.hasOwn(values, expression)) {
      const value = String(values[expression] ?? "");
      return html ? escapeHtml(value) : value;
    }
    if (operationVariables(expression).length) {
      const value = String(evaluateSheetOperation(expression, values));
      return html ? escapeHtml(value) : value;
    }
    return placeholder;
  });
}

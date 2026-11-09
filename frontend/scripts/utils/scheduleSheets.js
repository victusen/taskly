const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPERATION = /^[A-Za-z0-9_+\-*/().\s]+$/;
const MAX_SHEET_ROW = 1_000_000;

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
  const operations = [];
  for (const token of tokens) {
    if (VARIABLE_NAME.test(token)) {
      variables.add(token);
      continue;
    }
    const operands = operationVariables(token);
    if (operands.length) {
      operands.forEach((operand) => variables.add(operand));
      operations.push({ expression: token, variables: operands });
    }
  }

  return {
    tokens: [...tokens],
    variables: [...variables],
    operations,
  };
}

export function parseSheetRowSelection(value) {
  const normalized = String(value || "").trim().replace(/^r/i, "").replace(/r/gi, "");
  const rangeMatch = normalized.match(/^(\d+)\s*(?:-|to)\s*(\d+)$/i);
  const singleMatch = normalized.match(/^\d+$/);
  if (!rangeMatch && !singleMatch) {
    throw new Error("Enter a row number or a range such as 40-50.");
  }

  const start = Number(rangeMatch?.[1] || normalized);
  const end = Number(rangeMatch?.[2] || start);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end > MAX_SHEET_ROW
  ) {
    throw new Error(`Rows must be between 1 and ${MAX_SHEET_ROW}, with the range in ascending order.`);
  }

  return { start, end };
}

export function formatSheetRowSelection(rows) {
  return rows.map(({ start, end }) => (
    start === end ? `r${start}` : `(r${start}tor${end})`
  )).join("+");
}

export function validateSheetPlan(plan, requiredVariables = []) {
  const errors = [];
  if (!plan?.file?.id) errors.push("Choose a spreadsheet.");
  if (!plan?.sheet?.id) errors.push("Choose a sheet.");
  if (!plan?.emailColumn) errors.push("Choose the column containing recipient email addresses.");

  const startRow = Number(plan?.startRow);
  if (!Number.isSafeInteger(startRow) || startRow < 1 || startRow > MAX_SHEET_ROW) {
    errors.push("Choose a valid first data row.");
  }
  const headerRow = Number(plan?.headerRow);
  if (!Number.isSafeInteger(headerRow) || headerRow < 1 || headerRow >= startRow) {
    errors.push("The first data row must come after the header row.");
  }

  const mappings = plan?.variableColumns || {};
  const missing = requiredVariables.filter((variable) => !mappings[variable]);
  if (missing.length) {
    errors.push(`Choose a spreadsheet column for ${missing.map((item) => `{${item}}`).join(", ")}.`);
  }

  const manualRows = Array.isArray(plan?.manualRows) ? plan.manualRows : [];
  manualRows.forEach((row, index) => {
    const email = String(row.email || "").trim();
    if (!email) errors.push(`Additional row ${index + 1} needs a recipient email.`);
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Additional row ${index + 1} needs a valid recipient email.`);
    for (const variable of requiredVariables) {
      if (!String(row.values?.[variable] ?? "").trim()) {
        errors.push(`Additional row ${index + 1} needs a value for {${variable}}.`);
      }
    }
  });

  return errors;
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

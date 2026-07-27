/**
 * Developer: Md. Anisur Rahman
 * + Line-by-line (step-by-step) code & flowchart execution engine added
 */

let editor;
let currentFunctionName = null;

// ================== STEP ENGINE STATE ==================
let astNodeToFlowId = new Map();   // AST node -> flowchart node id (rebuilt on every buildFlow() call)
let lastNodesById = {};            // flowchart node id -> raw "id=>type: text|flowstate" line
let lastEdges = [];                // flowchart edge lines
let stepState = null;              // { generator, finished }
let visitedFlowIds = new Set();    // kept for API symmetry / possible future use
let currentHighlightLine = null;   // currently highlighted CodeMirror line number
let autoPlayInterval = null;
let varTraceWindowEl = null;       // floating variable trace window DOM element
let varTraceDragState = null;      // drag offset while dragging the floating window

// ১. CodeMirror Initialization
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `for (let i = 1; i <= 20; i++) {\n if (i % 2 == 0) {\n    continue; \n  }\n  if (i == 15) {\n    break;\n  }\n\n  console.log(i);\n}`
  });

  const nextBtn = document.getElementById("stepNextBtn");
  const autoBtn = document.getElementById("stepAutoBtn");
  const startBtn = document.getElementById("stepStartBtn");
  const resetBtn = document.getElementById("stepResetBtn");
  if (startBtn) startBtn.addEventListener("click", startStepMode);
  if (nextBtn) nextBtn.addEventListener("click", stepNext);
  if (autoBtn) autoBtn.addEventListener("click", toggleAutoPlay);
  if (resetBtn) resetBtn.addEventListener("click", resetStepMode);
  setStepControlsEnabled(false);
};

// ================== SHARED FLOWCHART RENDER OPTIONS ==================
function getFlowchartOptions() {
  const isMobile = window.innerWidth <= 600;
  return {
    'line-width': 2,
    'line-length': isMobile ? 35 : 50,
    'text-margin': 10,
    'font-size': isMobile ? 13 : 14,
    'font-family': 'Inter',
    'yes-text': 'TRUE',
    'no-text': 'FALSE',
    'scale': isMobile ? 0.85 : 1,
    'flowstate': {
      'variable': { 'fill': '#e1f5fe' },
      'process': { 'fill': '#f1f8e9' },
      'io': { 'fill': '#e1bee7' },
      'decision': { 'fill': '#fff9c4' },
      'function': { 'fill': '#f3e5f5' },
      'end': { 'fill': '#ffebee' },
      // লাইভ এক্সিকিউশন ইন্ডিকেটর — বর্তমানে যে নোডটি রান হচ্ছে সেটার হাইলাইট
      'current': { 'fill': '#facc15', 'font-color': '#111827', 'font-weight': 'bold', 'element-color': '#b45309', 'stroke-width': 3 }
    }
  };
}

// ২. Generate Flowchart Logic (static, non-stepped generation)
function generateFlowchart() {
  const code = editor.getValue();
  const output = document.getElementById("output");
  output.innerHTML = "";

  try {
    const ast = esprima.parseScript(code, { range: true });
    const flowCode = buildFlow(ast); // this also refreshes astNodeToFlowId / lastNodesById / lastEdges
    const diagram = flowchart.parse(flowCode);

    diagram.drawSVG(output, getFlowchartOptions());
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:10px;">Syntax Error: ${err.message}</p>`;
  }
}

// ================== ফ্লোচার্ট রি-রেন্ডার (স্টেপ মোডে, কারেন্ট নোড হাইলাইট সহ) ==================
function renderFlowchartState(currentId) {
  const output = document.getElementById("output");
  const nodeLines = Object.entries(lastNodesById).map(([id, line]) => {
    if (id === currentId) {
      // নোডের নিজস্ব ক্যাটাগরি-কালার (variable/process/decision/...) সাময়িকভাবে
      // সরিয়ে "current" হাইলাইট বসানো হচ্ছে
      return line.replace(/\|[^|]+$/, '') + '|current';
    }
    return line;
  });
  const flowSource = nodeLines.join("\n") + "\n" + lastEdges.join("\n");

  try {
    output.innerHTML = "";
    const diagram = flowchart.parse(flowSource);
    diagram.drawSVG(output, getFlowchartOptions());
  } catch (e) {
    console.error("flowchart render error:", e);
  }
}

// ৩. Master AST Walker Logic
function buildFlow(ast) {
  // প্রতিটি নতুন buildFlow() কলে ম্যাপ রিসেট হয়
  astNodeToFlowId = new Map();

  let nodes = ["st=>start: Start|start"];
  let edges = [];
  let count = 1;
  const newId = (pre) => pre + (count++);

  function walk(node, prev) {
    if (!node) return prev;

    switch(node.type) {
      case "Program":
      case "BlockStatement":
        let curr = prev;
        node.body.forEach(n => curr = walk(n, curr));
        return curr;

      case "VariableDeclaration":
        const vId = newId("var");
        // Full text for array, object, and simple variables
        const vText = node.declarations.map(d => {
          const initVal = d.init ? getText(d.init) : "undefined";
          return `${d.id.name} = ${initVal}`;
        }).join(", ");

        const isV_IO = vText.includes("prompt");
        const vType = isV_IO ? "inputoutput" : "operation";
        nodes.push(`${vId}=>${vType}: ${vText}|variable`);
        edges.push(`${prev}->${vId}`);
        astNodeToFlowId.set(node, vId);
        return vId;

      case "IfStatement":
        const dId = newId("dec");
        const testText = getText(node.test);

        // ডায়মন্ড শেপ এখন শুধু কন্ডিশন দেখাবে (Clean Diamond)
        nodes.push(`${dId}=>condition: IF: ${testText}|decision`);
        edges.push(`${prev}->${dId}`);
        astNodeToFlowId.set(node, dId);

        const yesEnd = walk(node.consequent, dId + "(yes)");
        const noEnd = node.alternate ? walk(node.alternate, dId + "(no)") : dId + "(no)";

        const join = newId("merge");
        nodes.push(`${join}=>operation: Next|process`);

        edges.push(`${yesEnd}->${join}`);
        edges.push(`${noEnd}->${join}`);
        return join;

  case "SwitchStatement":
  const sId = newId("switch");
  const discriminant = getText(node.discriminant);

  nodes.push(`${sId}=>condition: SWITCH: ${discriminant}|decision`);
  edges.push(`${prev}->${sId}`);
  astNodeToFlowId.set(node, sId);

  let afterSwitch = newId("merge");
  nodes.push(`${afterSwitch}=>operation: Next|process`);

  let lastCaseEnd = null;

  node.cases.forEach((caseNode, index) => {
    const caseLabel = caseNode.test
      ? `CASE: ${getText(caseNode.test)}`
      : "DEFAULT";

    const cId = newId("case");
    nodes.push(`${cId}=>condition: ${caseLabel}|decision`);

    if (index === 0) {
      edges.push(`${sId}(yes)->${cId}`);
    } else {
      edges.push(`${lastCaseEnd}(no)->${cId}`);
    }

    let caseStart = cId + "(yes)";
    let caseEnd = caseStart;

    caseNode.consequent.forEach(stmt => {
      caseEnd = walk(stmt, caseEnd);
    });

    edges.push(`${caseEnd}->${afterSwitch}`);
    lastCaseEnd = cId;
  });

  if (lastCaseEnd) {
    edges.push(`${lastCaseEnd}(no)->${afterSwitch}`);
  }

  return afterSwitch;

      case "ForStatement":
        const fInit = walk(node.init, prev);
        const fCondId = newId("forCond");
        nodes.push(`${fCondId}=>condition: FOR: ${getText(node.test)}|decision`);
        edges.push(`${fInit}->${fCondId}`);
        astNodeToFlowId.set(node, fCondId);
        const fBodyEnd = walk(node.body, fCondId + "(yes)");
        const fUpdId = newId("upd");
        nodes.push(`${fUpdId}=>operation: ${getText(node.update)}|process`);
        edges.push(`${fBodyEnd}->${fUpdId}`);
        edges.push(`${fUpdId}(left)->${fCondId}`);
        return fCondId + "(no)";

      case "WhileStatement":
        const wCondId = newId("whileCond");
        nodes.push(`${wCondId}=>condition: WHILE: ${getText(node.test)}|decision`);
        edges.push(`${prev}->${wCondId}`);
        astNodeToFlowId.set(node, wCondId);
        const wBodyEnd = walk(node.body, wCondId + "(yes)");
        edges.push(`${wBodyEnd}(left)->${wCondId}`);
        return wCondId + "(no)";

    /*case "FunctionDeclaration":
      const funcId = newId("func");
      const params = node.params.map(p => getText(p)).join(", "); 
      nodes.push(`${funcId}=>subroutine: FUNCTION: ${node.id.name}(${params})|function`);
      edges.push(`${prev}->${funcId}`);
      return walk(node.body, funcId);


  case "ReturnStatement":
  const rId = newId("ret");
  nodes.push(`${rId}=>operation: RETURN ${getText(node.argument)}|process`);
  edges.push(`${prev}->${rId}`);
  return rId;*/

    case "FunctionDeclaration": {
    const funcId = newId("func");
    const params = node.params.map(p => getText(p)).join(", ");

    nodes.push(`${funcId}=>subroutine: FUNCTION: ${node.id.name}(${params})|function`);
    edges.push(`${prev}->${funcId}`);
    astNodeToFlowId.set(node, funcId);

    const prevFunctionName = currentFunctionName;
    currentFunctionName = node.id.name;

    const endId = walk(node.body, funcId);

    currentFunctionName = prevFunctionName;
    return endId;
}
case "ReturnStatement": {
    const rId = newId("ret");
    const arg = node.argument;

    let text = getText(arg);

    function hasFunctionCall(node) {
        if (!node) return false;
        if (node.type === "CallExpression") return true;

        switch(node.type) {
            case "BinaryExpression":
            case "LogicalExpression":
                return hasFunctionCall(node.left) || hasFunctionCall(node.right);
            case "UnaryExpression":
            case "UpdateExpression":
                return hasFunctionCall(node.argument);
            case "MemberExpression":
                return hasFunctionCall(node.object) || hasFunctionCall(node.property);
            case "ConditionalExpression":
                return hasFunctionCall(node.test) || hasFunctionCall(node.consequent) || hasFunctionCall(node.alternate);
            case "AssignmentExpression":
                return hasFunctionCall(node.left) || hasFunctionCall(node.right);
            case "ArrayExpression":
                return node.elements.some(hasFunctionCall);
            case "ObjectExpression":
                return node.properties.some(p => hasFunctionCall(p.value));
            default:
                return false;
        }
    }

    function containsRecursiveCall(node, funcName) {
        if (!node) return false;

        if (
            node.type === "CallExpression" &&
            node.callee.type === "Identifier" &&
            node.callee.name === funcName
        ) return true;

        switch(node.type) {
            case "BinaryExpression":
            case "LogicalExpression":
                return containsRecursiveCall(node.left, funcName) || containsRecursiveCall(node.right, funcName);
            case "UnaryExpression":
            case "UpdateExpression":
                return containsRecursiveCall(node.argument, funcName);
            case "MemberExpression":
                return containsRecursiveCall(node.object, funcName) || containsRecursiveCall(node.property, funcName);
            case "ConditionalExpression":
                return containsRecursiveCall(node.test, funcName) || containsRecursiveCall(node.consequent, funcName) || containsRecursiveCall(node.alternate, funcName);
            case "AssignmentExpression":
                return containsRecursiveCall(node.left, funcName) || containsRecursiveCall(node.right, funcName);
            case "ArrayExpression":
                return node.elements.some(e => containsRecursiveCall(e, funcName));
            case "ObjectExpression":
                return node.properties.some(p => containsRecursiveCall(p.value, funcName));
            default:
                return false;
        }
    }

    const hasCall = hasFunctionCall(arg);
    const isRecursive = currentFunctionName && containsRecursiveCall(arg, currentFunctionName);

    if (isRecursive) {
        text += ` → recursive call → ${currentFunctionName}(…)`;
        nodes.push(`${rId}=>subroutine: RETURN ${text}|function`);
    }
      else{
          nodes.push(`${rId}=>operation: RETURN ${text}|process`);
      }

    edges.push(`${prev}->${rId}`);
    astNodeToFlowId.set(node, rId);
    return rId;
}


      case "BreakStatement":
        const bId = newId("brk");
        nodes.push(`${bId}=>operation: BREAK|end`);
        edges.push(`${prev}->${bId}`);
        astNodeToFlowId.set(node, bId);
        return bId;

      case "ContinueStatement":
        const cId = newId("cont");
        nodes.push(`${cId}=>operation: CONTINUE|process`);
        edges.push(`${prev}->${cId}`);
        astNodeToFlowId.set(node, cId);
        return cId;

      case "ExpressionStatement":
        const eId = newId("proc");
        const eText = getText(node.expression);
        const isIO = /console\.log|alert|prompt/.test(eText);
        const eType = isIO ? "inputoutput" : "operation";
        nodes.push(`${eId}=>${eType}: ${eText}|io`);
        edges.push(`${prev}->${eId}`);
        astNodeToFlowId.set(node, eId);
        return eId;

      default: return prev;
    }
  }
  const final = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${final}->e`);

  // স্টেপ-এক্সিকিউশন মোডের জন্য id -> raw node text ম্যাপ সংরক্ষণ করা হচ্ছে
  lastNodesById = {};
  nodes.forEach(line => {
    const m = line.match(/^(\w+)=>/);
    if (m) lastNodesById[m[1]] = line;
  });
  lastEdges = edges.slice();

  return nodes.join("\n") + "\n" + edges.join("\n");
}

// ====================
function getText(node) {
  if (!node) return "";

  switch (node.type) {
    case "Identifier":
      return node.name;

    case "Literal":
      return JSON.stringify(node.value);

    case "BinaryExpression":
    case "LogicalExpression":
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;

    case "UnaryExpression":
      return node.prefix
        ? `${node.operator}${getText(node.argument)}`
        : `${getText(node.argument)}${node.operator}`;

    case "UpdateExpression":
      return node.prefix
        ? `${node.operator}${getText(node.argument)}`
        : `${getText(node.argument)}${node.operator}`;

    case "AssignmentExpression":
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;

    case "ConditionalExpression":
      return `${getText(node.test)} ? ${getText(node.consequent)} : ${getText(node.alternate)}`;

    case "ArrayExpression":
      return `[${node.elements.map(el => getText(el)).join(", ")}]`;

    case "ObjectExpression":
      return `{ ${node.properties.map(p => {
        const key = p.key.name || p.key.value;
        return `${key}: ${getText(p.value)}`;
      }).join(", ")} }`;

    case "MemberExpression":
      const prop = node.computed
        ? `[${getText(node.property)}]`
        : `.${node.property.name}`;
      return `${getText(node.object)}${prop}`;

    case "CallExpression":
      return `${getText(node.callee)}(${node.arguments.map(arg => getText(arg)).join(", ")})`;

    case "ArrowFunctionExpression":
      const params = node.params.map(p => getText(p)).join(", ");
      return `(${params}) => ${getText(node.body)}`;

    case "FunctionExpression":
      const fnParams = node.params.map(p => getText(p)).join(", ");
      return `function(${fnParams}) { ... }`;

    case "TemplateLiteral":
      return "`" + node.quasis.map((q, i) => {
        const expr = node.expressions[i]
          ? "${" + getText(node.expressions[i]) + "}"
          : "";
        return q.value.raw + expr;
      }).join("") + "`";

    case "VariableDeclarator":
      return `${node.id.name} = ${getText(node.init)}`;

    case "SequenceExpression":
      return node.expressions.map(getText).join(", ");

    default:
      return "";
  }
}

// ==================================================================
// ================  STEP-BY-STEP EXECUTION ENGINE  ================
// ==================================================================
// esprima-এর AST-এর উপর generator-চালিত একটা ছোট tree-walking interpreter,
// যেটা statement-by-statement থামে, যাতে প্রতিটি "Next Step" ক্লিকে ঠিক একটা
// কোড লাইন ও একটা ফ্লোচার্ট নোড হাইলাইট হয়ে এক্সিকিউট হয়।

class BreakSignal {}
class ContinueSignal {}
class ReturnSignal { constructor(value) { this.value = value; } }

class Scope {
  constructor(parent) {
    this.vars = new Map();
    this.parent = parent || null;
  }
  declare(name, value) { this.vars.set(name, value); }
  has(name) {
    if (this.vars.has(name)) return true;
    return this.parent ? this.parent.has(name) : false;
  }
  get(name) {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`'${name}' is not defined`);
  }
  set(name, value) {
    if (this.vars.has(name)) { this.vars.set(name, value); return; }
    if (this.parent && this.parent.has(name)) { this.parent.set(name, value); return; }
    this.vars.set(name, value); // implicit global, matches normal JS behavior
  }
}

function createRootScope() {
  const root = new Scope(null);
  root.declare("Math", Math);
  root.declare("console", console);
  root.declare("JSON", JSON);
  root.declare("Array", Array);
  root.declare("Object", Object);
  root.declare("String", String);
  root.declare("Number", Number);
  root.declare("Boolean", Boolean);
  root.declare("Date", Date);
  root.declare("undefined", undefined);
  root.declare("NaN", NaN);
  root.declare("Infinity", Infinity);
  return root;
}

function applyBinary(op, l, r) {
  switch (op) {
    case "+": return l + r;
    case "-": return l - r;
    case "*": return l * r;
    case "/": return l / r;
    case "%": return l % r;
    case "**": return l ** r;
    case "==": return l == r;
    case "===": return l === r;
    case "!=": return l != r;
    case "!==": return l !== r;
    case "<": return l < r;
    case "<=": return l <= r;
    case ">": return l > r;
    case ">=": return l >= r;
    case "&": return l & r;
    case "|": return l | r;
    case "^": return l ^ r;
    case "<<": return l << r;
    case ">>": return l >> r;
    case ">>>": return l >>> r;
    default: throw new Error("Unknown operator: " + op);
  }
}

function formatValueForConsole(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "[" + value.map(formatValueForConsole).join(", ") + "]";
  if (typeof value === "object") {
    return "{ " + Object.entries(value).map(([k, v]) => `${k}: ${formatValueForConsole(v)}`).join(", ") + " }";
  }
  return String(value);
}

function appendConsoleOutput(args) {
  const consoleEl = document.getElementById("console");
  if (!consoleEl) return;
  consoleEl.innerText += args.map(formatValueForConsole).join(" ") + "\n";
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function makeUserFunction(node, closureScope) {
  return { __isUserFunction__: true, node, closureScope };
}

// রিকার্সিভ/নেস্টেড ফাংশন কল "স্টেপ ওভার" করা হয় — পুরো ফাংশন বডি এক ধাপেই
// সম্পূর্ণ চালিয়ে রিটার্ন ভ্যালু বের করে আনা হয় (ভিতরের প্রতিটি লাইন আলাদাভাবে
// হাইলাইট হয় না, কিন্তু ফলাফল ঠিকই থাকে)।
function callUserFunction(fn, args) {
  const fnScope = new Scope(fn.closureScope);
  fn.node.params.forEach((p, i) => fnScope.declare(p.name, args[i]));

  if (fn.node.body.type !== "BlockStatement") {
    // Expression-bodied arrow function, e.g. (x) => x * 2
    return evalExpr(fn.node.body, fnScope);
  }

  const gen = execBlockArray(fn.node.body.body, fnScope);
  try {
    let res = gen.next();
    while (!res.done) res = gen.next();
  } catch (e) {
    if (e instanceof ReturnSignal) return e.value;
    throw e;
  }
  return undefined;
}

function bindForTarget(target, value, scope) {
  if (target.type === "VariableDeclaration") {
    scope.declare(target.declarations[0].id.name, value);
  } else if (target.type === "Identifier") {
    scope.set(target.name, value);
  }
}

function assignTo(node, value, scope) {
  if (node.type === "Identifier") {
    scope.set(node.name, value);
  } else if (node.type === "MemberExpression") {
    const obj = evalExpr(node.object, scope);
    const key = node.computed ? evalExpr(node.property, scope) : node.property.name;
    obj[key] = value;
  } else {
    throw new Error("Unsupported assignment target: " + node.type);
  }
}

function evalCall(node, scope) {
  const callee = node.callee;
  const args = node.arguments.map(a => evalExpr(a, scope));

  if (callee.type === "MemberExpression") {
    const obj = evalExpr(callee.object, scope);
    const methodName = callee.computed ? evalExpr(callee.property, scope) : callee.property.name;

    if (obj === console && methodName === "log") {
      appendConsoleOutput(args);
      return undefined;
    }
    if (obj === undefined || obj === null) {
      throw new Error(`Cannot call '${methodName}' on null/undefined`);
    }
    if (typeof obj[methodName] === "function") {
      return obj[methodName].apply(obj, args);
    }
    throw new Error(`Method '${methodName}' not found`);
  }

  if (callee.type === "Identifier") {
    if (callee.name === "prompt") return window.prompt(args[0] !== undefined ? String(args[0]) : "");
    if (callee.name === "alert") { window.alert(args[0]); return undefined; }
    if (callee.name === "isNaN") return isNaN(args[0]);
    if (callee.name === "parseInt") return parseInt(args[0], args[1]);
    if (callee.name === "parseFloat") return parseFloat(args[0]);

    const fn = scope.get(callee.name);
    if (fn && fn.__isUserFunction__) return callUserFunction(fn, args);
    if (typeof fn === "function") return fn(...args);
    throw new Error(`Function '${callee.name}' not found`);
  }

  // IIFE style: (function(){...})() or ((x)=>x)()
  const fnVal = evalExpr(callee, scope);
  if (fnVal && fnVal.__isUserFunction__) return callUserFunction(fnVal, args);
  if (typeof fnVal === "function") return fnVal(...args);
  throw new Error("Unsupported function call");
}

function evalExpr(node, scope) {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal": return node.value;
    case "Identifier": return scope.get(node.name);

    case "ArrayExpression":
      return node.elements.map(e => e ? evalExpr(e, scope) : undefined);

    case "ObjectExpression": {
      const obj = {};
      for (const p of node.properties) {
        const key = p.key.type === "Identifier" ? p.key.name : p.key.value;
        obj[key] = evalExpr(p.value, scope);
      }
      return obj;
    }

    case "TemplateLiteral": {
      let result = "";
      node.quasis.forEach((q, i) => {
        result += q.value.cooked;
        if (i < node.expressions.length) result += String(evalExpr(node.expressions[i], scope));
      });
      return result;
    }

    case "BinaryExpression":
      return applyBinary(node.operator, evalExpr(node.left, scope), evalExpr(node.right, scope));

    case "LogicalExpression": {
      const l = evalExpr(node.left, scope);
      if (node.operator === "&&") return l ? evalExpr(node.right, scope) : l;
      if (node.operator === "||") return l ? l : evalExpr(node.right, scope);
      if (node.operator === "??") return (l !== null && l !== undefined) ? l : evalExpr(node.right, scope);
      throw new Error("Unknown logical operator: " + node.operator);
    }

    case "UnaryExpression": {
      if (node.operator === "typeof" && node.argument.type === "Identifier" && !scope.has(node.argument.name)) {
        return "undefined";
      }
      const arg = evalExpr(node.argument, scope);
      switch (node.operator) {
        case "-": return -arg;
        case "+": return +arg;
        case "!": return !arg;
        case "~": return ~arg;
        case "typeof": return typeof arg;
        case "void": return undefined;
        default: throw new Error("Unknown unary operator: " + node.operator);
      }
    }

    case "UpdateExpression": {
      const oldVal = evalExpr(node.argument, scope);
      const newVal = node.operator === "++" ? oldVal + 1 : oldVal - 1;
      assignTo(node.argument, newVal, scope);
      return node.prefix ? newVal : oldVal;
    }

    case "AssignmentExpression": {
      let newVal;
      if (node.operator === "=") {
        newVal = evalExpr(node.right, scope);
      } else {
        const oldVal = evalExpr(node.left, scope);
        const rVal = evalExpr(node.right, scope);
        newVal = applyBinary(node.operator.slice(0, -1), oldVal, rVal);
      }
      assignTo(node.left, newVal, scope);
      return newVal;
    }

    case "ConditionalExpression":
      return evalExpr(node.test, scope) ? evalExpr(node.consequent, scope) : evalExpr(node.alternate, scope);

    case "SequenceExpression": {
      let result;
      for (const e of node.expressions) result = evalExpr(e, scope);
      return result;
    }

    case "MemberExpression": {
      const obj = evalExpr(node.object, scope);
      const key = node.computed ? evalExpr(node.property, scope) : node.property.name;
      return (obj === null || obj === undefined) ? undefined : obj[key];
    }

    case "CallExpression":
      return evalCall(node, scope);

    case "NewExpression": {
      const ctor = evalExpr(node.callee, scope);
      const args = node.arguments.map(a => evalExpr(a, scope));
      return new ctor(...args);
    }

    case "ArrowFunctionExpression":
    case "FunctionExpression":
      return makeUserFunction(node, scope);

    default:
      throw new Error("This expression is not supported: " + node.type);
  }
}

function* execBlockArray(bodyArr, scope) {
  for (const stmt of bodyArr) {
    yield* execStatement(stmt, scope);
  }
}

function* execBody(node, scope) {
  if (!node) return;
  if (node.type === "BlockStatement") {
    yield* execBlockArray(node.body, scope);
  } else {
    yield* execStatement(node, scope);
  }
}

function* execStatement(node, scope) {
  if (!node) return;

  // প্রতিটি স্টেটমেন্টের ঠিক আগে থামো — UI এখানে লাইন/নোড হাইলাইট করবে
  yield { node, scope };

  switch (node.type) {

    case "VariableDeclaration": {
      for (const d of node.declarations) {
        const val = d.init ? evalExpr(d.init, scope) : undefined;
        scope.declare(d.id.name, val);
      }
      break;
    }

    case "ExpressionStatement": {
      evalExpr(node.expression, scope);
      break;
    }

    case "IfStatement": {
      if (evalExpr(node.test, scope)) {
        yield* execBody(node.consequent, scope);
      } else if (node.alternate) {
        yield* execBody(node.alternate, scope);
      }
      break;
    }

    case "WhileStatement": {
      while (evalExpr(node.test, scope)) {
        try {
          yield* execBody(node.body, scope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "DoWhileStatement": {
      do {
        try {
          yield* execBody(node.body, scope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      } while (evalExpr(node.test, scope));
      break;
    }

    case "ForStatement": {
      const forScope = new Scope(scope);
      if (node.init) {
        if (node.init.type === "VariableDeclaration") {
          for (const d of node.init.declarations) {
            forScope.declare(d.id.name, d.init ? evalExpr(d.init, forScope) : undefined);
          }
        } else {
          evalExpr(node.init, forScope);
        }
      }
      while (!node.test || evalExpr(node.test, forScope)) {
        try {
          yield* execBody(node.body, forScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (!(e instanceof ContinueSignal)) throw e;
        }
        if (node.update) evalExpr(node.update, forScope);
      }
      break;
    }

    case "ForOfStatement": {
      const iterable = evalExpr(node.right, scope);
      for (const item of iterable) {
        const loopScope = new Scope(scope);
        bindForTarget(node.left, item, loopScope);
        try {
          yield* execBody(node.body, loopScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "ForInStatement": {
      const obj = evalExpr(node.right, scope);
      for (const key in obj) {
        const loopScope = new Scope(scope);
        bindForTarget(node.left, key, loopScope);
        try {
          yield* execBody(node.body, loopScope);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
      }
      break;
    }

    case "SwitchStatement": {
      const disc = evalExpr(node.discriminant, scope);
      const switchScope = new Scope(scope);
      let matchIndex = node.cases.findIndex(c => c.test !== null && evalExpr(c.test, switchScope) === disc);
      if (matchIndex === -1) matchIndex = node.cases.findIndex(c => c.test === null);
      try {
        if (matchIndex !== -1) {
          for (let i = matchIndex; i < node.cases.length; i++) {
            for (const stmt of node.cases[i].consequent) {
              yield* execStatement(stmt, switchScope);
            }
          }
        }
      } catch (e) {
        if (!(e instanceof BreakSignal)) throw e;
      }
      break;
    }

    case "FunctionDeclaration": {
      scope.declare(node.id.name, makeUserFunction(node, scope));
      break;
    }

    case "ReturnStatement": {
      const val = node.argument ? evalExpr(node.argument, scope) : undefined;
      throw new ReturnSignal(val);
    }

    case "BreakStatement":
      throw new BreakSignal();

    case "ContinueStatement":
      throw new ContinueSignal();

    case "TryStatement": {
      try {
        yield* execBlockArray(node.block.body, scope);
      } catch (e) {
        if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) throw e;
        if (node.handler) {
          const catchScope = new Scope(scope);
          if (node.handler.param) catchScope.declare(node.handler.param.name, e);
          yield* execBlockArray(node.handler.body.body, catchScope);
        } else {
          throw e;
        }
      } finally {
        if (node.finalizer) {
          yield* execBlockArray(node.finalizer.body, scope);
        }
      }
      break;
    }

    case "ThrowStatement": {
      const val = evalExpr(node.argument, scope);
      throw (val instanceof Error ? val : new Error(typeof val === "string" ? val : formatValueForConsole(val)));
    }

    default:
      break;
  }
}

// ==================================================================
// ============  FLOATING VARIABLE TRACE TABLE WINDOW  ==============
// ==================================================================
// A small draggable floating window that shows the values of every
// variable in the current scope chain, live, while stepping through code.

const VAR_TRACE_BUILTIN_NAMES = new Set([
  "Math", "console", "JSON", "Array", "Object", "String", "Number",
  "Boolean", "Date", "undefined", "NaN", "Infinity"
]);

function ensureVarTraceWindow() {
  if (varTraceWindowEl) return varTraceWindowEl;

  const style = document.createElement("style");
  style.textContent = `
    #varTraceWindow {
      position: fixed;
      top: 90px;
      right: 20px;
      width: 260px;
      max-height: 60vh;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }
    #varTraceWindow.collapsed #varTraceBody { display: none; }
    #varTraceHeader {
      background: #1e293b;
      color: #fff;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
    }
    #varTraceHeader .vtw-title { font-weight: 600; }
    #varTraceHeader .vtw-btns button {
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      margin-left: 6px;
      line-height: 1;
      padding: 2px 4px;
    }
    #varTraceHeader .vtw-btns button:hover { opacity: 0.7; }
    #varTraceBody {
      overflow-y: auto;
      padding: 4px 0;
    }
    #varTraceTable {
      width: 100%;
      border-collapse: collapse;
    }
    #varTraceTable th, #varTraceTable td {
      text-align: left;
      padding: 5px 10px;
      border-bottom: 1px solid #e2e8f0;
      word-break: break-all;
    }
    #varTraceTable th {
      background: #f1f5f9;
      color: #334155;
      font-size: 12px;
      position: sticky;
      top: 0;
    }
    #varTraceTable td.vtw-name { color: #1d4ed8; font-weight: 600; }
    #varTraceTable td.vtw-value { color: #059669; }
    #varTraceTable tr.vtw-scope-row td {
      background: #fef9c3;
      font-size: 11px;
      color: #92400e;
      font-weight: 600;
      padding: 4px 10px;
    }
    #varTraceEmpty {
      padding: 12px 10px;
      color: #94a3b8;
      font-style: italic;
      text-align: center;
    }
    @media (max-width: 600px) {
      #varTraceWindow { width: 200px; top: auto; bottom: 12px; right: 12px; }
    }
  `;
  document.head.appendChild(style);

  const win = document.createElement("div");
  win.id = "varTraceWindow";
  win.innerHTML = `
    <div id="varTraceHeader">
      <span class="vtw-title">🔍 Variable Trace</span>
      <span class="vtw-btns">
        <button id="varTraceMinBtn" title="Minimize/expand">—</button>
        <button id="varTraceCloseBtn" title="Close">✕</button>
      </span>
    </div>
    <div id="varTraceBody">
      <table id="varTraceTable">
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody id="varTraceTbody"></tbody>
      </table>
      <div id="varTraceEmpty" style="display:none;">No variables yet</div>
    </div>
  `;
  document.body.appendChild(win);
  varTraceWindowEl = win;

  const header = win.querySelector("#varTraceHeader");

  const startDrag = (clientX, clientY) => {
    const rect = win.getBoundingClientRect();
    varTraceDragState = { offsetX: clientX - rect.left, offsetY: clientY - rect.top };
    win.style.right = "auto";
    win.style.bottom = "auto";
  };

  header.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    startDrag(e.clientX, e.clientY);
    document.addEventListener("mousemove", onVarTraceMouseMove);
    document.addEventListener("mouseup", onVarTraceDragEnd);
  });

  header.addEventListener("touchstart", (e) => {
    if (e.target.closest("button")) return;
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
    document.addEventListener("touchmove", onVarTraceTouchMove, { passive: false });
    document.addEventListener("touchend", onVarTraceDragEnd);
  }, { passive: true });

  win.querySelector("#varTraceMinBtn").addEventListener("click", () => {
    win.classList.toggle("collapsed");
  });
  win.querySelector("#varTraceCloseBtn").addEventListener("click", () => {
    win.style.display = "none";
  });

  return win;
}

function positionVarTraceWindow(x, y) {
  const win = varTraceWindowEl;
  if (!win) return;
  const maxX = window.innerWidth - win.offsetWidth - 4;
  const maxY = window.innerHeight - win.offsetHeight - 4;
  win.style.left = Math.max(4, Math.min(x, maxX)) + "px";
  win.style.top = Math.max(4, Math.min(y, maxY)) + "px";
}

function onVarTraceMouseMove(e) {
  if (!varTraceDragState) return;
  positionVarTraceWindow(e.clientX - varTraceDragState.offsetX, e.clientY - varTraceDragState.offsetY);
}

function onVarTraceTouchMove(e) {
  if (!varTraceDragState) return;
  e.preventDefault();
  const t = e.touches[0];
  positionVarTraceWindow(t.clientX - varTraceDragState.offsetX, t.clientY - varTraceDragState.offsetY);
}

function onVarTraceDragEnd() {
  varTraceDragState = null;
  document.removeEventListener("mousemove", onVarTraceMouseMove);
  document.removeEventListener("mouseup", onVarTraceDragEnd);
  document.removeEventListener("touchmove", onVarTraceTouchMove);
  document.removeEventListener("touchend", onVarTraceDragEnd);
}

// Collects variables from the current scope outward, one group per level
function collectScopeChainVars(scope) {
  const levels = [];
  let s = scope;
  let depth = 0;
  while (s) {
    const entries = [];
    for (const [name, value] of s.vars.entries()) {
      if (!VAR_TRACE_BUILTIN_NAMES.has(name)) entries.push([name, value]);
    }
    if (entries.length) levels.push({ depth, entries });
    s = s.parent;
    depth++;
  }
  return levels;
}

function formatVarTraceValue(value) {
  if (typeof value === "function" || (value && value.__isUserFunction__)) return "ƒ function";
  try {
    return formatValueForConsole(value);
  } catch (e) {
    return String(value);
  }
}

// Re-renders the table for the given scope, or shows an empty state if none
function updateVarTraceTable(scope) {
  const win = ensureVarTraceWindow();
  if (win.style.display !== "flex") win.style.display = "flex";

  const tbody = win.querySelector("#varTraceTbody");
  const emptyEl = win.querySelector("#varTraceEmpty");
  const tableEl = win.querySelector("#varTraceTable");
  tbody.innerHTML = "";

  const levels = scope ? collectScopeChainVars(scope) : [];

  if (!levels.length) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }

  emptyEl.style.display = "none";
  tableEl.style.display = "table";

  levels.forEach(({ depth, entries }) => {
    const scopeRow = document.createElement("tr");
    scopeRow.className = "vtw-scope-row";
    const label = depth === 0 ? "Current Scope" : `Parent Scope (${depth})`;
    scopeRow.innerHTML = `<td colspan="2">${label}</td>`;
    tbody.appendChild(scopeRow);

    entries.forEach(([name, value]) => {
      const tr = document.createElement("tr");
      const nameTd = document.createElement("td");
      nameTd.className = "vtw-name";
      nameTd.textContent = name;
      const valTd = document.createElement("td");
      valTd.className = "vtw-value";
      valTd.textContent = formatVarTraceValue(value);
      tr.appendChild(nameTd);
      tr.appendChild(valTd);
      tbody.appendChild(tr);
    });
  });
}

// ================== STEP-MODE UI DRIVER ==================

function setStepControlsEnabled(started) {
  const startBtn = document.getElementById("stepStartBtn");
  const nextBtn = document.getElementById("stepNextBtn");
  const autoBtn = document.getElementById("stepAutoBtn");
  const resetBtn = document.getElementById("stepResetBtn");
  if (startBtn) startBtn.disabled = started;
  if (nextBtn) nextBtn.disabled = !started;
  if (autoBtn) autoBtn.disabled = !started;
  if (resetBtn) resetBtn.disabled = !started;
}

function highlightCodeLine(node) {
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }
  if (!node || !node.range) return;
  const pos = editor.posFromIndex(node.range[0]);
  currentHighlightLine = pos.line;
  editor.addLineClass(currentHighlightLine, 'background', 'step-current-line');
  editor.scrollIntoView({ line: currentHighlightLine, ch: 0 }, 100);
}

function showStepError(msg) {
  const consoleEl = document.getElementById("console");
  if (consoleEl) consoleEl.innerText += "Error: " + msg + "\n";
}

function startStepMode() {
  const code = editor.getValue();

  let ast;
  try {
    ast = esprima.parseScript(code, { range: true });
  } catch (err) {
    showStepError("Syntax Error - " + err.message);
    return;
  }

  const output = document.getElementById("output");
  try {
    buildFlow(ast); // refreshes astNodeToFlowId / lastNodesById / lastEdges
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:10px;">${err.message}</p>`;
    return;
  }

  document.getElementById("console").innerText = "";
  visitedFlowIds = new Set();
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }

  const rootScope = createRootScope();
  stepState = {
    generator: execBlockArray(ast.body, rootScope),
    finished: false
  };

  renderFlowchartState(null);
  ensureVarTraceWindow();
  updateVarTraceTable(rootScope);
  setStepControlsEnabled(true);
}

function stepNext() {
  if (!stepState || stepState.finished) return;

  let result;
  try {
    result = stepState.generator.next();
  } catch (err) {
    showStepError(err.message || String(err));
    finishStepMode();
    return;
  }

  if (result.done) {
    finishStepMode();
    appendConsoleOutput(["--- Execution finished ---"]);
    return;
  }

  const { node, scope } = result.value;
  highlightCodeLine(node);
  updateVarTraceTable(scope);

  const flowId = astNodeToFlowId.get(node);
  if (flowId) {
    renderFlowchartState(flowId);
    visitedFlowIds.add(flowId);
  }
}

function finishStepMode() {
  if (stepState) stepState.finished = true;
  stopAutoPlay();
  setStepControlsEnabled(false);
  if (currentHighlightLine !== null) {
    editor.removeLineClass(currentHighlightLine, 'background', 'step-current-line');
    currentHighlightLine = null;
  }
}

function resetStepMode() {
  finishStepMode();
  stepState = null;
  visitedFlowIds = new Set();
  renderFlowchartState(null);
  updateVarTraceTable(null);
  document.getElementById("console").innerText = "";
}

function toggleAutoPlay() {
  const autoBtn = document.getElementById("stepAutoBtn");
  if (autoPlayInterval) {
    stopAutoPlay();
  } else {
    autoPlayInterval = setInterval(() => {
      if (!stepState || stepState.finished) { stopAutoPlay(); return; }
      stepNext();
    }, 800);
    if (autoBtn) autoBtn.innerText = "⏸ Pause";
  }
}

function stopAutoPlay() {
  if (autoPlayInterval) { clearInterval(autoPlayInterval); autoPlayInterval = null; }
  const autoBtn = document.getElementById("stepAutoBtn");
  if (autoBtn) autoBtn.innerText = "⏩ Auto Play";
}

// ================== RUN (instant run button) ==================
function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";
  const originalLog = console.log;

  function formatObject(obj) {
    return "{ " + Object.entries(obj)
      .map(([key, val]) => `${key}: ${val}`)
      .join(", ") + " }";
  }

  console.log = (...args) => {
    const formatted = args.map(arg => {
      if (typeof arg === "object" && arg !== null) {
        return formatObject(arg);
      }
      return arg;
    }).join(" ");

    consoleEl.innerText += formatted + "\n";
  };

  try {
    eval(editor.getValue());
  } catch (err) {
    consoleEl.innerText += "Error: " + err.message;
  }

  console.log = originalLog;
}

// ৬. Download PNG High-Res
function downloadImage() {
  const svg = document.querySelector("#output svg");
  if (!svg) { alert("Please generate a flowchart first!"); return; }

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  const svgSize = svg.getBoundingClientRect();
  canvas.width = svgSize.width * 2;
  canvas.height = svgSize.height * 2;

  img.onload = function () {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = "flowchart.png";
    link.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
}

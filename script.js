/**
 * Developer: Md. Anisur Rahman
 * Project: JS Visualizer Pro (Flowchart Generator)
 * Features: Variable Full Text, Rhombus IO, PNG Export, Break/Continue Handling
 */

let editor;

// ১. CodeMirror Initialization
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `for (let i = 1; i <= 20; i++) {\n if (i % 2 == 0) {\n    continue; \n  }\n  if (i == 15) {\n    break;\n  }\n\n  console.log(i);\n}`
  });
};

// ২. Generate Flowchart Logic
function generateFlowchart() {
  const code = editor.getValue();
  const output = document.getElementById("output");
  output.innerHTML = ""; 

  try {
    const ast = esprima.parseScript(code, { range: true });
    const flowCode = buildFlow(ast);
    const diagram = flowchart.parse(flowCode);
    
    const isMobile = window.innerWidth <= 600;

    diagram.drawSVG(output, {
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
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:10px;">Syntax Error: ${err.message}</p>`;
  }
}

// ৩. Master AST Walker Logic
function buildFlow(ast) {
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
        return vId;

      case "IfStatement":
        const dId = newId("dec");
        const testText = getText(node.test);
        
        // ডায়মন্ড শেপ এখন শুধু কন্ডিশন দেখাবে (Clean Diamond)
        nodes.push(`${dId}=>condition: IF: ${testText}|decision`);
        edges.push(`${prev}->${dId}`);
        
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
        const wBodyEnd = walk(node.body, wCondId + "(yes)");
        edges.push(`${wBodyEnd}(left)->${wCondId}`);
        return wCondId + "(no)";

    case "FunctionDeclaration":
      const funcId = newId("func");
      const params = node.params.map(p => getText(p)).join(", "); 
      nodes.push(`${funcId}=>subroutine: FUNCTION: ${node.id.name}(${params})|function`);
      edges.push(`${prev}->${funcId}`);
      return walk(node.body, funcId);

      case "ReturnStatement":
        const rId = newId("ret");
        nodes.push(`${rId}=>inputoutput: RETURN ${getText(node.argument)}|io`);
        edges.push(`${prev}->${rId}`);
        return rId;

      case "BreakStatement":
        const bId = newId("brk");
        nodes.push(`${bId}=>operation: BREAK|end`);
        edges.push(`${prev}->${bId}`);
        return bId;

      case "ContinueStatement":
        const cId = newId("cont");
        nodes.push(`${cId}=>operation: CONTINUE|process`);
        edges.push(`${prev}->${cId}`);
        return cId;

      case "ExpressionStatement":
        const eId = newId("proc");
        const eText = getText(node.expression);
        const isIO = /console\.log|alert|prompt/.test(eText);
        const eType = isIO ? "inputoutput" : "operation";
        nodes.push(`${eId}=>${eType}: ${eText}|io`);
        edges.push(`${prev}->${eId}`);
        return eId;

      default: return prev;
    }
  }
  const final = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${final}->e`);
  return nodes.join("\n") + "\n" + edges.join("\n");
}

// ৪. Helper: Get Code Text (Deep Recursion for Objects/Arrays)
/* function getText(node) {
  if (!node) return "";
  switch(node.type) {
    case "Identifier": return node.name;
    case "Literal": return JSON.stringify(node.value);
    case "BinaryExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "UpdateExpression": return node.prefix ? `${node.operator}${getText(node.argument)}` : `${getText(node.argument)}${node.operator}`;
    case "AssignmentExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "ArrayExpression": 
      return `[${node.elements.map(getText).join(", ")}]`;
    case "ObjectExpression":
      const pMap = node.properties.map(p => `${p.key.name || p.key.value}: ${getText(p.value)}`);
      return `{ ${pMap.join(", ")} }`;
    case "MemberExpression": 
      const prop = node.computed ? `[${getText(node.property)}]` : `.${node.property.name}`;
      return `${getText(node.object)}${prop}`;
    case "CallExpression": 
      return `${getText(node.callee)}(${node.arguments.map(getText).join(", ")})`;
    case "VariableDeclarator":
      return `${node.id.name} = ${getText(node.init)}`;
    default: return "";
  }
}*/

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


// ৫. CLEAN Console Runner
function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = ""; 
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try { eval(editor.getValue()); } catch (err) { consoleEl.innerText += "Error: " + err.message; }
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

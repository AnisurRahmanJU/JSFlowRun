let editor;

// ১. CodeMirror Initialization
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `// ১. Variable & Array Declaration\nlet prices = [10, 20, 30, 40, 50];\nlet user = { name: "Anis", age: 25 };\n\n// ২. Function with Logic\nfunction calculateTotal(arr) {\n  let sum = 0;\n  for(let i = 0; i < arr.length; i++) {\n    sum = sum + arr[i];\n  }\n  return sum;\n}\n\n// ৩. Output Logic\nlet total = calculateTotal(prices);\nconsole.log("Total Price:", total);\n\nif(total > 100) {\n  console.log("Expensive Prices!");\n} else {\n  console.log("Budget Friendly");\n}`
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
        'variable': { 'fill': '#e1f5fe' }, // Light Blue for vars
        'process': { 'fill': '#f1f8e9' },  // Light Green for operations
        'io': { 'fill': '#e1bee7' },       // Purple for Rhombus (IO)
        'decision': { 'fill': '#fff9c4' }, // Yellow for Diamonds
        'function': { 'fill': '#f3e5f5' }, // Lavender for subroutines
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:10px;">Syntax Error: ${err.message}</p>`;
  }
}

// ৩. AST Walker Logic
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
        // প্রতিটি ডিক্লারেশনকে (a = [1,2]) টেক্সট হিসেবে নেওয়া
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
        nodes.push(`${dId}=>condition: IF: ${getText(node.test)}|decision`);
        edges.push(`${prev}->${dId}`);
        const yesEnd = walk(node.consequent, dId + "(yes)");
        const noEnd = node.alternate ? walk(node.alternate, dId + "(no)") : dId + "(no)";
        const join = newId("merge");
        nodes.push(`${join}=>operation: Next|process`);
        edges.push(`${yesEnd}->${join}`);
        edges.push(`${noEnd}->${join}`);
        return join;

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
        nodes.push(`${funcId}=>subroutine: FUNCTION: ${node.id.name}|function`);
        edges.push(`${prev}->${funcId}`);
        return walk(node.body, funcId);

      case "ReturnStatement":
        const rId = newId("ret");
        nodes.push(`${rId}=>inputoutput: RETURN ${getText(node.argument)}|io`);
        edges.push(`${prev}->${rId}`);
        return rId;

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

// ৪. Helper: Get Full Text (Supports Array, Object, Member Expression)
function getText(node) {
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
      const props = node.properties.map(p => `${p.key.name || p.key.value}: ${getText(p.value)}`).join(", ");
      return `{${props}}`;
    case "MemberExpression": 
      const prop = node.computed ? `[${getText(node.property)}]` : `.${node.property.name}`;
      return `${getText(node.object)}${prop}`;
    case "CallExpression": 
      return `${getText(node.callee)}(${node.arguments.map(getText).join(", ")})`;
    default: return "";
  }
}

// ৫. Clean Console Runner
function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = ""; 
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try { eval(editor.getValue()); } catch (err) { consoleEl.innerText += "Error: " + err.message; }
  console.log = originalLog;
}

// ৬. Download PNG Logic
function downloadImage() {
  const svg = document.querySelector("#output svg");
  if (!svg) { alert("Generate flowchart first!"); return; }

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
    link.download = "image.png";
    link.click();
  };
  img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
}

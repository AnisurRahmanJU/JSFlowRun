let editor;

window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `// Define the function\nfunction addNumbers(a, b) {\n  return a + b;\n}\n\n// Call the function\nlet sum = addNumbers(10, 20);\nconsole.log(sum);`
  });
};

function generateFlowchart() {
  const code = editor.getValue();
  const output = document.getElementById("output");
  output.innerHTML = ""; 

  try {
    const ast = esprima.parseScript(code, { range: true });
    const flowCode = buildFlow(ast);
    const diagram = flowchart.parse(flowCode);
    
    // --- SMART SCALING LOGIC ---
    const lineCount = code.split('\n').length;
    const isMobile = window.innerWidth <= 600;
    
    // কোড ছোট হলে স্কেল কম হবে, কোড বড় হলে স্কেল বাড়বে
    let dynamicScale = 1.0;
    let dynamicLine = 40;

    if (isMobile) {
      if (lineCount < 10) {
        dynamicScale = 0.9; // ছোট কোডের জন্য জুম কম
        dynamicLine = 30;
      } else {
        dynamicScale = 1.1; // বড় কোডের জন্য জুম বেশি
        dynamicLine = 50;
      }
    }

    diagram.drawSVG(output, {
      'line-width': 2,
      'line-length': dynamicLine,
      'text-margin': 10,
      'font-size': isMobile ? 15 : 14,
      'font-family': 'Inter',
      'yes-text': 'TRUE',
      'no-text': 'FALSE',
      'scale': dynamicScale,
      'flowstate': {
        'variable': { 'fill': '#e1f5fe' },
        'process': { 'fill': '#f1f8e9' },
        'io': { 'fill': '#e1bee7' }, // Rhombus color
        'decision': { 'fill': '#fff9c4' },
        'function': { 'fill': '#f3e5f5' },
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:20px;">Parse Error: ${err.message}</p>`;
  }
}

// AST Walker (Supports All Topics)
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
        const vText = getText(node);
        const vType = vText.includes("prompt") ? "inputoutput" : "operation";
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
        nodes.push(`${join}=>operation: Continue|process`);
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
        const fId = newId("func");
        nodes.push(`${fId}=>subroutine: FUNCTION: ${node.id.name}|function`);
        edges.push(`${prev}->${fId}`);
        return walk(node.body, fId);

      case "ReturnStatement":
        const rId = newId("ret");
        nodes.push(`${rId}=>inputoutput: RETURN ${getText(node.argument)}|io`);
        edges.push(`${prev}->${rId}`);
        return rId;

      case "ExpressionStatement":
        const eId = newId("proc");
        const eText = getText(node.expression);
        const isIO = eText.includes("console.log") || eText.includes("alert") || eText.includes("prompt");
        const eType = isIO ? "inputoutput" : "operation";
        nodes.push(`${eId}=>${eType}: ${eText}|io`);
        edges.push(`${prev}->${eId}`);
        return eId;

      default: return prev;
    }
  }

  const lastPath = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${lastPath}->e`);
  return nodes.join("\n") + "\n" + edges.join("\n");
}

function getText(node) {
  if (!node) return "";
  switch(node.type) {
    case "BinaryExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "Identifier": return node.name;
    case "Literal": return typeof node.value === 'string' ? `"${node.value}"` : node.value;
    case "UpdateExpression": return `${node.argument.name}${node.operator}`;
    case "AssignmentExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "MemberExpression": 
      const p = node.computed ? `[${getText(node.property)}]` : `.${node.property.name}`;
      return `${getText(node.object)}${p}`;
    case "CallExpression": 
      return `${getText(node.callee)}(${node.arguments.map(getText).join(", ")})`;
    case "VariableDeclaration": return node.declarations.map(d => `${d.id.name}=${getText(d.init)}`).join(", ");
    case "VariableDeclarator": return `${node.id.name}=${getText(node.init)}`;
    default: return "";
  }
}

function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "Output:\n---\n";
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try { eval(editor.getValue()); } catch (err) { consoleEl.innerText += "Error: " + err.message; }
  console.log = originalLog;
}

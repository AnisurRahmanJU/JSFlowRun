let editor;

window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    value: `let x = 0;\n\nfor(let i = 0; i < 5; i++) {\n  x += i;\n}\n\nif (x > 5) {\n  console.log("Big");\n} else {\n  console.log("Small");\n}\n\nconsole.log("Done");`
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
    
    diagram.drawSVG(output, {
      'line-width': 2,
      'font-size': 14,
      'yes-text': 'True',
      'no-text': 'False',
      'flowstate': {
        'variable': { 'fill': '#e1f5fe' },
        'process': { 'fill': '#f1f8e9' },
        'decision': { 'fill': '#fff9c4' }, // Diamond Color
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red;">Parse Error: ${err.message}</p>`;
  }
}

function buildFlow(ast) {
  let nodes = ["st=>start: Start|start"];
  let edges = [];
  let count = 1;

  function newId(prefix) { return prefix + (count++); }

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
        const vText = node.declarations.map(d => `${d.id.name}${d.init ? "=" + getText(d.init) : ""}`).join(", ");
        nodes.push(`${vId}=>operation: ${vText}|variable`);
        edges.push(`${prev}->${vId}`);
        return vId;

      case "ForStatement":
        // 1. Init (e.g., let i = 0)
        const initId = walk(node.init, prev);
        // 2. Condition Diamond (e.g., i < 5)
        const condId = newId("loopCond");
        nodes.push(`${condId}=>condition: ${getText(node.test)}|decision`);
        edges.push(`${initId}->${condId}`);
        // 3. Body
        const bodyEnd = walk(node.body, condId + "(yes)");
        // 4. Update (e.g., i++)
        const updId = newId("upd");
        nodes.push(`${updId}=>operation: ${getText(node.update)}|process`);
        edges.push(`${bodyEnd}->${updId}`);
        edges.push(`${updId}(left)->${condId}`); // Loop back to diamond
        return condId + "(no)"; // Exit path

      case "IfStatement":
        const dId = newId("dec");
        nodes.push(`${dId}=>condition: ${getText(node.test)}|decision`);
        edges.push(`${prev}->${dId}`);
        const yesPath = walk(node.consequent, dId + "(yes)");
        const noPath = node.alternate ? walk(node.alternate, dId + "(no)") : dId + "(no)";
        const join = newId("merge");
        nodes.push(`${join}=>operation: Continue|process`);
        edges.push(`${yesPath}->${join}`);
        edges.push(`${noPath}->${join}`);
        return join;

      case "ExpressionStatement":
        const eId = newId("proc");
        nodes.push(`${eId}=>operation: ${getText(node.expression)}|process`);
        edges.push(`${prev}->${eId}`);
        return eId;

      default:
        return prev;
    }
  }

  const finalPath = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${finalPath}->e`);

  return nodes.join("\n") + "\n" + edges.join("\n");
}

function getText(node) {
  if (!node) return "";
  switch(node.type) {
    case "BinaryExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "Identifier": return node.name;
    case "Literal": return node.value;
    case "UpdateExpression": return `${node.argument.name}${node.operator}`;
    case "AssignmentExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "MemberExpression": return `${getText(node.object)}.${node.property.name}`;
    case "CallExpression": return `${getText(node.callee)}(${node.arguments.map(getText).join(", ")})`;
    case "VariableDeclaration": return node.declarations.map(d => `${d.id.name}=${getText(d.init)}`).join(", ");
    default: return "";
  }
}

function runCode() {
  const code = editor.getValue();
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try { eval(code); } catch (err) { consoleEl.innerText += "Error: " + err.message; }
  console.log = originalLog;
}

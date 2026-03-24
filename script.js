let editor;

window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `let x = 0;\n\nfor(let i = 0; i < 5; i++) {\n  x += i;\n}\n\nif (x > 5) {\n  console.log("Big Result");\n} else {\n  console.log("Small Result");\n}\n\nconsole.log("Done");`
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
      'line-length': 40,
      'text-margin': 10,
      'font-size': 14,
      'font-family': 'Inter',
      'yes-text': 'TRUE',
      'no-text': 'FALSE',
      'scale': 1, // মোবাইলে ফিট করতে চাইলে ০.৮ বা ০.৯ করতে পারেন
      'flowstate': {
        'variable': { 'fill': '#e1f5fe' },
        'process': { 'fill': '#f1f8e9' },
        'decision': { 'fill': '#fff9c4' }, // DIAMOND SHAPE
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:20px;">Parse Error: ${err.message}</p>`;
  }
}

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
        nodes.push(`${vId}=>operation: ${getText(node)}|variable`);
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
        edges.push(`${fUpdId}(left)->${fCondId}`); // Loop back
        
        return fCondId + "(no)";

      case "WhileStatement":
        const wCondId = newId("whileCond");
        nodes.push(`${wCondId}=>condition: WHILE: ${getText(node.test)}|decision`);
        edges.push(`${prev}->${wCondId}`);
        
        const wBodyEnd = walk(node.body, wCondId + "(yes)");
        edges.push(`${wBodyEnd}(left)->${wCondId}`);
        return wCondId + "(no)";

      case "ExpressionStatement":
        const eId = newId("proc");
        nodes.push(`${eId}=>operation: ${getText(node.expression)}|process`);
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
    case "Literal": return node.value;
    case "UpdateExpression": return `${node.argument.name}${node.operator}`;
    case "AssignmentExpression": return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "MemberExpression": return `${getText(node.object)}.${node.property.name || getText(node.property)}`;
    case "CallExpression": return `${getText(node.callee)}(...)`;
    case "VariableDeclaration": return node.declarations.map(d => `${d.id.name}=${getText(d.init)}`).join(", ");
    case "VariableDeclarator": return `${node.id.name}=${getText(node.init)}`;
    default: return "";
  }
}

function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "Running...\n---\n";
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try {
    eval(editor.getValue());
  } catch (err) {
    consoleEl.innerText += "Error: " + err.message;
  }
  console.log = originalLog;
}

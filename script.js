let editor;

// ১. CodeMirror সেটআপ এবং ডেমো কোড
window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    lineWrapping: true,
    value: `// Input Example\nlet name = "Anis";\nlet age = 25;\n\n// Logic with Output\nif (age >= 18) {\n  console.log(name + " is Adult");\n} else {\n  console.log(name + " is Minor");\n}\n\n// Array & Loop Output\nlet skills = ["JS", "HTML"];\nfor(let i = 0; i < skills.length; i++) {\n  console.log("Skill: " + skills[i]);\n}\n\n// Final Output\nalert("Done!");`
  });
};

// ২. মেইন ফ্লোচার্ট জেনারেটর ফাংশন
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
      'scale': 1,
      'flowstate': {
        'variable': { 'fill': '#e1f5fe' },
        'process': { 'fill': '#f1f8e9' },
        'io': { 'fill': '#e1bee7' }, // রম্বস বা Input/Output শেপের কালার
        'decision': { 'fill': '#fff9c4' },
        'function': { 'fill': '#f3e5f5' },
        'end': { 'fill': '#ffebee' }
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red; padding:20px;">Parse Error: ${err.message}</p>`;
  }
}

// ৩. মাস্টার AST ওয়াকার
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
        // যদি prompt() থাকে তবে এটিকে input হিসেবে দেখাবে
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

      case "ExpressionStatement":
        const eId = newId("proc");
        const eText = getText(node.expression);
        // console.log, alert বা prompt থাকলে রম্বস (inputoutput) শেপ হবে
        const isIO = eText.includes("console.log") || eText.includes("alert") || eText.includes("prompt");
        const eType = isIO ? "inputoutput" : "operation";
        nodes.push(`${eId}=>${eType}: ${eText}|io`);
        edges.push(`${prev}->${eId}`);
        return eId;

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

      default: return prev;
    }
  }

  const finalPath = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${finalPath}->e`);

  return nodes.join("\n") + "\n" + edges.join("\n");
}

// ৪. টেক্সট হেল্পার (সব ধরণের জাভাস্ক্রিপ্ট সিনট্যাক্স সাপোর্ট)
function getText(node) {
  if (!node) return "";
  switch(node.type) {
    case "BinaryExpression": 
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "Identifier": return node.name;
    case "Literal": return typeof node.value === 'string' ? `"${node.value}"` : node.value;
    case "UpdateExpression": return `${node.argument.name}${node.operator}`;
    case "AssignmentExpression": 
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "MemberExpression": 
      const prop = node.computed ? `[${getText(node.property)}]` : `.${node.property.name}`;
      return `${getText(node.object)}${prop}`;
    case "CallExpression": 
      const args = node.arguments.map(getText).join(", ");
      return `${getText(node.callee)}(${args})`;
    case "ArrayExpression":
      return `[${node.elements.map(getText).join(", ")}]`;
    case "VariableDeclaration": 
      return node.declarations.map(d => `${d.id.name}=${getText(d.init)}`).join(", ");
    case "VariableDeclarator": return `${node.id.name}=${getText(node.init)}`;
    default: return "";
  }
}

// ৫. কোড রানার
function runCode() {
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "Running Output:\n---\n";
  const originalLog = console.log;
  console.log = (...args) => consoleEl.innerText += args.join(" ") + "\n";
  try {
    eval(editor.getValue());
  } catch (err) {
    consoleEl.innerText += "Error: " + err.message;
  }
  console.log = originalLog;
}

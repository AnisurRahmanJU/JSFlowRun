let editor;
let diagram;

window.onload = function () {
  editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    theme: "default",
    value: `let x = 0;

for(let i = 0; i < 5; i++) {
  x += i;
}

if (x > 5) {
  console.log("Big");
} else {
  console.log("Small");
}

console.log("Done");`
  });
};

// ===== GENERATE FLOWCHART =====
function generateFlowchart() {
  const code = editor.getValue();
  const output = document.getElementById("output");
  output.innerHTML = "";

  try {
    const ast = esprima.parseScript(code, { loc: true });
    const flowCode = buildFlow(ast);

    diagram = flowchart.parse(flowCode);
    diagram.drawSVG(output, {
      flowstate: {
        variable: { fill: "#a2d5f2", fontColor: "#000" }, // light blue
        process: { fill: "#b9f2a2", fontColor: "#000" },  // light green
        decision: { fill: "#fff79a", fontColor: "#000" }, // yellow
        loop: { fill: "#ffb86c", fontColor: "#000" },     // orange
        end: { fill: "#ff6b6b", fontColor: "#fff" }       // red
      }
    });
  } catch (err) {
    output.innerHTML = `<p style="color:red;">${err.message}</p>`;
  }
}

// ===== AST → FLOWCHART (with real code) =====
function buildFlow(ast) {
  let nodes = [];
  let edges = [];
  let count = 1;

  function newId(prefix = "node") { return prefix + (count++); }

  function walk(node, prev) {
    if (!node) return prev;

    switch(node.type) {
      case "Program":
        let curr = prev;
        node.body.forEach(n => curr = walk(n, curr));
        return curr;

      case "VariableDeclaration":
        const varNode = newId("var");
        nodes.push(`${varNode}=>operation: ${node.declarations.map(d => d.id.name + (d.init ? " = " + getText(d.init) : "")).join(", ")}|variable`);
        edges.push(`${prev}->${varNode}`);
        return varNode;

      case "ExpressionStatement":
        const exprNode = newId("proc");
        nodes.push(`${exprNode}=>operation: ${getText(node.expression)}|process`);
        edges.push(`${prev}->${exprNode}`);
        return exprNode;

      case "IfStatement":
        const decNode = newId("dec");
        nodes.push(`${decNode}=>condition: ${getText(node.test)}|decision`);
        edges.push(`${prev}->${decNode}`);
        const yesEnd = walk(node.consequent, decNode + "(yes)");
        const noEnd = node.alternate ? walk(node.alternate, decNode + "(no)") : decNode;
        return yesEnd || noEnd;

      case "ForStatement":
        const loopNode = newId("loop");
        const loopText = `for (${getText(node.init)}; ${getText(node.test)}; ${getText(node.update)})`;
        nodes.push(`${loopNode}=>subroutine: ${loopText}|loop`);
        edges.push(`${prev}->${loopNode}`);
        return walk(node.body, loopNode);

      case "WhileStatement":
        const whileNode = newId("loop");
        nodes.push(`${whileNode}=>subroutine: while (${getText(node.test)})|loop`);
        edges.push(`${prev}->${whileNode}`);
        return walk(node.body, whileNode);

      case "ReturnStatement":
        const retNode = newId("end");
        nodes.push(`${retNode}=>end: return ${node.argument ? getText(node.argument) : ""}|end`);
        edges.push(`${prev}->${retNode}`);
        return retNode;

      case "BlockStatement":
        let last = prev;
        node.body.forEach(n => last = walk(n, last));
        return last;

      default:
        const defNode = newId("process");
        nodes.push(`${defNode}=>operation: ${getText(node)}|process`);
        edges.push(`${prev}->${defNode}`);
        return defNode;
    }
  }

  nodes.push("st=>start: Start|start");
  const last = walk(ast, "st");
  nodes.push("e=>end: End|end");
  edges.push(`${last}->e`);

  return nodes.join("\n") + "\n" + edges.join("\n");
}

// ===== HELPER =====
function getText(node) {
  if (!node) return "";
  switch(node.type) {
    case "BinaryExpression":
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "Identifier":
      return node.name;
    case "Literal":
      return node.value;
    case "UpdateExpression":
      return `${node.argument.name}${node.operator}`;
    case "AssignmentExpression":
      return `${getText(node.left)} ${node.operator} ${getText(node.right)}`;
    case "CallExpression":
      const args = node.arguments.map(a => getText(a)).join(", ");
      return `${getText(node.callee)}(${args})`;
    default:
      return node.type;
  }
}

// ===== RUN CODE =====
function runCode() {
  const code = editor.getValue();
  const consoleEl = document.getElementById("console");
  consoleEl.innerText = "";

  const originalLog = console.log;
  console.log = function(...args) {
    consoleEl.innerText += args.join(" ") + "\n";
    originalLog.apply(console, args);
  };

  try {
    eval(code);
  } catch (err) {
    consoleEl.innerText += "Error: " + err.message;
  }

  console.log = originalLog;
}

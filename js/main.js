// main.js

// Global references
let pyodide = null;
let codeMirrorEditor = null;

// For storing final variable values after code is run
let lastExecutionResults = {};

// Wait for Pyodide to load
async function loadPyodideAndPackages() {
  console.log("Loading Pyodide...");
  pyodide = await loadPyodide({
    indexURL : "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/"
  });
  console.log("Pyodide loaded.");

  // Optional: install pyflowchart if needed
  // (If you prefer a direct import, do so here)
  console.log("Installing pyflowchart via micropip...");
  await pyodide.runPythonAsync(`
    import micropip
    await micropip.install("pyflowchart")
  `);
  console.log("pyflowchart installed.");

  // Pre-import for speed
  await pyodide.runPythonAsync(`
    import ast, random
    from pyflowchart import Flowchart
  `);
  console.log("Initial Python modules loaded.");
}

function initCodeMirror() {
  const textarea = document.getElementById("codeEditor");
  codeMirrorEditor = CodeMirror.fromTextArea(textarea, {
    mode: "python",
    theme: "dracula",
    lineNumbers: true,
    indentUnit: 4,
    smartIndent: true
  });
  codeMirrorEditor.setSize("100%", "100%");
}

// Build minimal AST-based code in Python
// We'll just do a short example. You can elaborate further:
function generateRandomCode(options) {
  const {
    difficulty,
    includeIf,
    includeFor,
    includeWhile,
    useInt,
    useBool,
    useStr
  } = options;

  // We'll do everything in Python. Return code as string from a function
  // Let's do a small python snippet that returns code
  const code = `
import ast
import random

allowed_types = []
if ${useInt}: allowed_types.append("int")
if ${useBool}: allowed_types.append("bool")
if ${useStr}: allowed_types.append("str")

# We'll build a small code snippet that has a few variables
# and optionally an if, for, or while.

# We'll define a function that returns the code as a string
def build_code():
    var_names = ["a", "b", "c", "res"]
    # pick random subset for usage
    import random
    random.shuffle(var_names)
    used_vars = var_names[:random.randint(2, 3)]

    # We'll start building a list of AST statements
    module_body = []

    # Assign random initial values
    for var in used_vars:
        t = random.choice(allowed_types)
        if t == "int":
            val = ast.Constant(value=random.randint(1, 10))
        elif t == "bool":
            val = ast.Constant(value=random.choice([True, False]))
        else:
            # string
            sample_strings = ["hello", "test", "abc"]
            val = ast.Constant(value=random.choice(sample_strings))
        assign_node = ast.Assign(
            targets=[ast.Name(id=var, ctx=ast.Store())],
            value=val
        )
        module_body.append(assign_node)

    # Maybe add if
    if ${includeIf}:
        if_node = ast.If(
            test=ast.Compare(
                left=ast.Name(id=used_vars[0], ctx=ast.Load()),
                ops=[ast.Eq()],
                comparators=[ast.Constant(value=5)]
            ),
            body=[
                ast.AugAssign(
                    target=ast.Name(id=used_vars[0], ctx=ast.Store()),
                    op=ast.Add(),
                    value=ast.Constant(value=10)
                )
            ],
            orelse=[]
        )
        module_body.append(if_node)

    # Maybe add for
    if ${includeFor}:
        # for var in range(0, 3):
        loop_var = "i"
        for_node = ast.For(
            target=ast.Name(id=loop_var, ctx=ast.Store()),
            iter=ast.Call(
                func=ast.Name(id='range', ctx=ast.Load()),
                args=[ast.Constant(value=3)],
                keywords=[]
            ),
            body=[
                ast.AugAssign(
                    target=ast.Name(id=used_vars[-1], ctx=ast.Store()),
                    op=ast.Add(),
                    value=ast.Constant(value=1)
                )
            ],
            orelse=[]
        )
        module_body.append(for_node)

    # Maybe add while
    if ${includeWhile}:
        # We'll do a simple while that decrements the first var if it's int
        # to avoid infinite loop, else skip
        while_node = ast.While(
            test=ast.Compare(
                left=ast.Name(id=used_vars[0], ctx=ast.Load()),
                ops=[ast.Gt()],
                comparators=[ast.Constant(value=0)]
            ),
            body=[
                ast.AugAssign(
                    target=ast.Name(id=used_vars[0], ctx=ast.Store()),
                    op=ast.Sub(),
                    value=ast.Constant(value=1)
                )
            ],
            orelse=[]
        )
        module_body.append(while_node)

    # Final AST
    module = ast.Module(body=module_body, type_ignores=[])
    # fix locations
    ast.fix_missing_locations(module)

    code_str = ast.unparse(module)
    return code_str

generated = build_code()
generated
`;
  // run Python in pyodide to get the generated code
  return pyodide.runPython(code);
}

async function generateFlowchart(codeString) {
  // use pyflowchart in Pyodide to convert code -> DSL text
  const flowchartDsl = await pyodide.runPythonAsync(`
from pyflowchart import Flowchart
Flowchart.from_code(\"\"\"${escapeForPyString(codeString)}\"\"\").flowchart()
  `);
  return flowchartDsl;
}

// helper: escape code string for triple-quoted python
function escapeForPyString(str) {
  return str.replace(/([\"\\\\])/g, '\\$1');
}

// Called after user clicks "Generate Code"
async function onGenerate() {
  const difficulty = document.getElementById("difficultySelect").value;
  const includeIf = document.getElementById("includeIf").checked;
  const includeFor = document.getElementById("includeFor").checked;
  const includeWhile = document.getElementById("includeWhile").checked;
  const typeInt = document.getElementById("typeInt").checked;
  const typeBool = document.getElementById("typeBool").checked;
  const typeStr = document.getElementById("typeStr").checked;

  const options = {
    difficulty,
    includeIf,
    includeFor,
    includeWhile,
    useInt: typeInt,
    useBool: typeBool,
    useStr: typeStr
  };

  // Generate code
  const generatedCode = generateRandomCode(options);
  codeMirrorEditor.setValue(generatedCode);

  // Also generate flowchart for this code
  const diagramText = await generateFlowchart(generatedCode);
  drawFlowchart(diagramText);
}

// Renders the flowchart in flowchartContainer
function drawFlowchart(diagramText) {
  const container = document.getElementById("flowchartDiagram");
  container.innerHTML = "";  // clear old
  const diagram = flowchart.parse(diagramText);
  diagram.drawSVG("flowchartDiagram", {
    // optionally pass chart options here
  });
}

// Toggling between code view & flowchart view
function onToggleView() {
  const editorDiv = document.getElementById("editorContainer");
  const flowchartDiv = document.getElementById("flowchartContainer");
  if (editorDiv.style.display === "none") {
    editorDiv.style.display = "block";
    flowchartDiv.style.display = "none";
  } else {
    editorDiv.style.display = "none";
    flowchartDiv.style.display = "block";
  }
}

// Execute user code in Pyodide, then ask for the final state of variables
async function onRunCheck() {
  // Clear old feedback
  const feedbackDiv = document.getElementById("feedbackSection");
  feedbackDiv.innerHTML = "";

  // Get user code from the editor
  const userCode = codeMirrorEditor.getValue();

  // Attempt to run code in Pyodide
  // We'll capture final variables in a dict
  const codeWithCapture = `
globals_dict = {}
def run_user_code():
    global globals_dict
    import sys
    loc = {}
    code = """${escapeForPyString(userCode)}"""
    exec(code, loc, loc)
    # capture variables
    # Let's just pick everything that isn't __builtins__
    result_dict = {}
    for k, v in loc.items():
        if not k.startswith("__"):
            result_dict[k] = v
    globals_dict = result_dict

run_user_code()
globals_dict
`;

  let runResult;
  try {
    runResult = await pyodide.runPythonAsync(codeWithCapture);
  } catch (err) {
    // Show error
    feedbackDiv.innerHTML = `<div class="alert alert-danger" role="alert">
      <strong>Error:</strong> ${err}
    </div>`;
    console.error(err);
    return;
  }

  // runResult is a PyProxy dict-like object. Convert to JS object
  lastExecutionResults = runResult.toJs();

  // Ask the user to guess final variable values
  promptUserToGuess();
}

function promptUserToGuess() {
  const feedbackDiv = document.getElementById("feedbackSection");
  feedbackDiv.innerHTML = "";

  // build a small form with each variable from lastExecutionResults
  const vars = Object.keys(lastExecutionResults);
  if (vars.length === 0) {
    feedbackDiv.innerHTML = `<div class="alert alert-info">No variables found.</div>`;
    return;
  }

  let formHtml = `<form id="guessForm"><p>Guess the final values:</p>`;
  for (let v of vars) {
    formHtml += `
    <div class="mb-2">
      <label><strong>${v}</strong> = </label>
      <input type="text" class="form-control" name="${v}" />
    </div>`;
  }
  formHtml += `
    <button type="submit" class="btn btn-primary mt-2">Submit Guesses</button>
  </form>
  `;
  feedbackDiv.innerHTML = formHtml;

  // attach event
  document.getElementById("guessForm").addEventListener("submit", onSubmitGuesses);
}

function onSubmitGuesses(evt) {
  evt.preventDefault();
  const formData = new FormData(evt.target);
  const feedbackDiv = document.getElementById("feedbackSection");
  let resultsHtml = `<h5>Results:</h5>`;

  for (let [varName, guess] of formData.entries()) {
    const actualValue = lastExecutionResults[varName];
    let correct = false;

    // We'll do simple type conversion for guess
    // If actualValue is bool, check for 'true'/'false' ignoring case, etc.
    if (typeof actualValue === 'boolean') {
      const guessLower = guess.trim().toLowerCase();
      const isTrue = guessLower === 'true';
      const isFalse = guessLower === 'false';
      correct = (actualValue && isTrue) || (!actualValue && isFalse);
    } else if (typeof actualValue === 'number') {
      // parse guess as int
      let guessNum = parseFloat(guess);
      correct = (guessNum === actualValue);
    } else if (typeof actualValue === 'string') {
      correct = (guess === actualValue);
    } else {
      // fallback: direct string compare
      correct = (guess === String(actualValue));
    }

    if (correct) {
      resultsHtml += `<div><strong>${varName}</strong>: <span class="text-success">Correct!</span> (Value = ${actualValue})</div>`;
    } else {
      resultsHtml += `<div><strong>${varName}</strong>: <span class="text-danger">Incorrect</span> (Your guess = ${guess}, Actual = ${actualValue})</div>`;
    }
  }

  feedbackDiv.innerHTML = resultsHtml;
}

// On DOM load
window.addEventListener("DOMContentLoaded", async () => {
  // 1) Load Pyodide
  await loadPyodideAndPackages();
  // 2) Init CodeMirror
  initCodeMirror();

  // 3) Hook up event listeners
  document.getElementById("btnGenerate").addEventListener("click", onGenerate);
  document.getElementById("btnToggleView").addEventListener("click", onToggleView);
  document.getElementById("btnRunCode").addEventListener("click", onRunCheck);

  // Optionally auto-generate code once on startup
  onGenerate();
});

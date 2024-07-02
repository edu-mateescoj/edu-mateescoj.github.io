var le_bouton_run;/*MOD*/

class blockModule extends HTMLElement {
  constructor(block_type, titre = null) {
    super();
    let template = document.getElementById('mes-blocs');
    this.initial_content = this.innerHTML;
    this.innerHTML = '';
    this.appendChild(template.content.cloneNode(true));
    this.querySelector('.inside').classList.add(block_type);
    this.titre = titre;
    this.loadData();
  }

  loadData() {
    const contenu = this.getAttribute('data-file');
    if (contenu != "" && contenu != null) {
      var httpRequest = new XMLHttpRequest();
      httpRequest.onreadystatechange = (function (elt, xhr) {
        return function (contenu) {
          var DONE = 4; // readyState 4 means the request is done.
          var OK = 200; // status 200 is a successful return.
          if (xhr.readyState === DONE) {
            if (xhr.status === OK) {
              elt.querySelector('.inside').innerHTML = xhr.responseText;
              if (elt.titre != null) {
                elt.querySelector('.inside').prepend(elt.titre);
              }
              var event = new CustomEvent('bloc-loaded');
              elt.dispatchEvent(event);
            }
          }
        };
      }(this, httpRequest));
      httpRequest.open("GET", contenu);
      httpRequest.send();
    } else {
      this.querySelector('.inside').innerHTML = this.initial_content;
      if (this.titre != null) {
        this.querySelector('.inside').prepend(this.titre);
      }
    }
  }
}

/* Classe pour les cours */
class Cours extends blockModule {
  constructor() {
    super('cours');
  }
}

/* Elements custom */
class Attention extends blockModule {
  constructor() {
    let titre = document.createElement('h5');
    titre.innerHTML = '<i class="fas fa-bomb"></i> Attention !';
    super('attention', titre);
  }
}

/* Elements custom */
class Retenir extends blockModule {
  constructor() {
    let titre = document.createElement('h5');
    titre.innerHTML = '<i class="fas fa-brain"></i> À retenir.';
    super('retenir', titre);
  }
}

/* Elements custom */
class Consigne extends blockModule {
  constructor() {
    let titre = document.createElement('h5');
    titre.innerHTML = '<i class="fas fa-cogs"></i> À faire.';
    super('consigne', titre);
  }
}




/* showdowns pour avoir mermaid, latex entre autres avec les include html...*/
/* par contre ceci semble empêcher l'inclusion de HTML dans du MD*/
class MarkdownBlock extends blockModule {
  constructor() {
    super('markdown');
    this.addEventListener(('bloc-loaded'), function (e) {
      this.querySelectorAll('.markdown').forEach((block) => {
      showdowns.makeHtml(block.textContent).then(html => {/* block.innerHTML ne marche pas... */
      block.innerHTML = html;
        });
      });
    });
    var event = new CustomEvent('bloc-loaded');
    this.dispatchEvent(event);
  }
}



/* 
class MarkdownBlock extends blockModule {
  constructor() {
    super('markdown');
    this.addEventListener(('bloc-loaded'), function (e) {
      this.querySelectorAll('.markdown').forEach((block) => {
        var converter = new showdown.Converter({tables: true}),
        html = converter.makeHtml(block.innerHTML);
        block.innerHTML = html;
      });
    });
    var event = new CustomEvent('bloc-loaded');
    this.dispatchEvent(event);
  }
} */

class PythonModule extends HTMLElement {
  constructor() {
    super();
    //preserve inner content
    this.datas = {};
    this.datas.initialPython = this.innerHTML.trim();
    // Empty content
    this.innerHTML = '';
    // clone template
    let myTemplate = document.getElementById('mon-python');
    this.appendChild(myTemplate.content.cloneNode(true));
    
    // Assign an ID if not present
    function dec2hex(dec) {
      return ('0' + dec.toString(16)).substr(-2);
    }

    // generateId :: Integer -> String
    function generateId(len) {
      var arr = new Uint8Array((len || 40) / 2);
      window.crypto.getRandomValues(arr);
      return Array.from(arr, dec2hex).join('');
    }

    if (this.id == "" || this.id == null) {
      this.id = generateId(16);
    }

    /* Divisions */
    this.tododiv = this.querySelector('[role="consignes"]');
    this.acediv = this.querySelector('[role="editor"]');
    this.pythondiv = this.querySelector('[role="result"]');
    this.pythonoutput = this.querySelector('[role="output"');/*ne pas ajouter le crochet fermant*/
    /*  console.log(this.pythonoutput);*/
    this.pythonoutput.id = this.id + "Console";
    /* console.log(this.pythonoutput.id); */
    this.graphicdiv = this.querySelector('[role="graphic"]');
    this.graphicdiv.id = this.id + "Graphic";
    /* Editor buttons */
    this.downloadButton = this.querySelector('[role="download"]');
    this.restoreButton = this.querySelector('[role="restore"]');
    this.saveButton = this.querySelector('[role="save"]');
    this.reloadButton = this.querySelector('[role="reload"]');
    this.themeButton = this.querySelector('[role="theme"]');
    this.runButton = this.querySelector('[role="run"]');
    le_bouton_run = this.runButton;/*MOD*/
    /* Tab buttons */
    this.consoleTab = this.querySelector('[aria-controls="console"]');
    this.graphicTab = this.querySelector('[aria-controls="graphic"]');

    // Event listeners for tab switching
    this.consoleTab.addEventListener('click', (function (elt) {
      return function (e) {
        elt.pythondiv.classList.add('show', 'active');
        elt.graphicdiv.classList.remove('show', 'active');
        elt.consoleTab.classList.add('active');
        elt.graphicTab.classList.remove('active');
        e.preventDefault();
      };
    })(this));

    this.graphicTab.addEventListener('click', (function (elt) {
      return function (e) {
        console.log(elt);
        elt.pythondiv.classList.remove('show', 'active');
        elt.graphicdiv.classList.add('show', 'active');
        elt.consoleTab.classList.remove('active');
        elt.graphicTab.classList.add('active');
        e.preventDefault();
      };
    })(this));

    function pythonout(elt) {
      return function (txt) {
        //elt.pythondiv.innerHTML = elt.pythondiv.innerHTML + txt;
        elt.pythonoutput.innerHTML = elt.pythonoutput.innerHTML + txt;
      };
    }

    function builtinRead(x) {
      if (Sk.builtinFiles === undefined || Sk.builtinFiles.files[x] === undefined) {
        throw "File not found: '" + x + "'";
      }
      return Sk.builtinFiles.files[x];
    }

    function myRun(elt) {
      return function () {
        (function (elt, prog, mypre) {
          mypre.innerHTML = '';
          Sk.pre = "output";
          Sk.canvas = elt.graphicdiv.id;
          Sk.python3 = true;
          var SkFuture = {
            print_function: true,
            division: true,
            absolute_import: null,
            unicode_literals: true,
            // skulpt specific
            set_repr: false,
            class_repr: false,
            inherit_from_object: false,
            super_args: false,
            // skulpt 1.11.32 specific
            octal_number_literal: true,
            bankers_rounding: true,
            python_version: true,
            dunder_next: true,
            dunder_round: true,
            exceptions: true,
            no_long_type: false,
            ceil_floor_int: true,
          };
          Sk.externalLibraries = {
            numpy: {
              path: 'https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/numpy/__init__.js',
              dependencies: ['https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/deps/math.js']
            },
            "numpy.random": {
              path: 'https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/numpy/random/__init__.js'
            },
            matplotlib: {
              path: 'https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/matplotlib/__init__.js'
            },
            "matplotlib.pyplot": {
              path: 'https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/matplotlib/pyplot/__init__.js',
              dependencies: ['https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/deps/d3.min.js']
            },
            pygal: {
              path: 'https://cdn.jsdelivr.net/gh/trinketapp/pygal.js@0.1.4/__init__.js',
              dependencies: ['https://cdn.jsdelivr.net/gh/highcharts/highcharts-dist@6.0.7/highcharts.js',
                'https://cdn.jsdelivr.net/gh/highcharts/highcharts-dist@6.0.7/highcharts-more.js'
              ]
            },
            processing: {
              path: 'https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/processing/__init__.js',
              dependencies: ['https://cdn.jsdelivr.net/gh/diraison/GenPyExo/external/deps/processing.js']
            }
          };

          Sk.configure({
            output: pythonout(elt),
            read: builtinRead,
            __future__: SkFuture,
            killableWhile: true,
            killableFor: true,
            //inputfun : null , // fonction d'entrée personnalisée, voir https://github.com/skulpt/skulpt/issues/685
            //inputfunTakesPrompt:true
          });
          (Sk.TurtleGraphics || (Sk.TurtleGraphics = {})).target = elt.graphicdiv;
          var myPromise = Sk.misceval.asyncToPromise(function () {
            return Sk.importMainWithBody("<stdin>", false, prog, true);
          });
          myPromise.then(function (mod) {
              console.log('Python évalué avec succés');
              elt.graphicdiv.style = ""; //pyplot block style incompatible with bootstrap tabs
            },
            function (err) {
              console.log(err.toString());
              console.log(document.getElementById('errorModal'));
              $('#errorModal .modal-body').html("<pre>" + err.toString() + "</pre>");
              $('#errorModal').modal('show');
            });
        }(elt, elt.editor.getValue(), elt.pythonoutput));
      };
    }

    function mySave(e) {
      return function () {
        console.log('Sauvegarde lancée !!')
        (function (elt) {
          if (elt.restoreButton.classList.contains('disabled')) {
            elt.restoreButton.classList.remove('disabled');
          }
          elt.datas.savedPython = elt.editor.getValue();
        }(e));
      };
    }

    function myRestore(elt) {
      return function () {
        console.log('Restauration lancée !!')
        (function (elt) {
          elt.editor.setValue(elt.datas.savedPython);
        }(elt));
      };
    }

    function myReload(elt) {
      return function () {
        console.log('REcahrge lancée !!')
        (function (elt) {
          elt.editor.setValue(elt.datas.initialPython);
        }(elt));
      };
    }

    function myDownload(elt) {
      return function () {
        console.log('Download lancé !!')
        (function (elt) {
          var blob = new Blob([elt.editor.getValue()], {
            type: "text/x-python;charset=utf-8"
          });
          saveAs(blob, "programme.py");
        }(elt));
      };
    }

    function myTheme(elt) {
      return function () {
        console.log('Changement de thème lancé !!')
        (function (elt) {
          console.log('Thème actuel: ', elt.editor.getTheme());
          if (elt.editor.getTheme() == "ace/theme/xcode")
              {
                elt.editor.setTheme("ace/theme/monokai");
              }
          else
              {
                elt.editor.setTheme("ace/theme/xcode");
              }
        }(elt));
      };
    }

   // Initialize the ACE editor
    //this.acediv.style.minHeight = "20rem";
    this.editor = ace.edit(this.acediv);
    this.editor.setTheme("ace/theme/xcode");/*MOD*/
    this.editor.session.setMode("ace/mode/python");
    this.runButton.onclick = myRun(this);
    this.saveButton.onclick = mySave(this);
    this.restoreButton.onclick = myRestore(this);
    this.reloadButton.onclick = myReload(this);
    this.downloadButton.onclick = myDownload(this);
    this.themeButton.onclick = myTheme(this);/*MOD*/
    this.loadPython();
  }

  // Load Python 
  loadPython() {
    const python = this.getAttribute('data-python');
    if (python != "" && python != null) {
      var httpRequest = new XMLHttpRequest();
      httpRequest.onreadystatechange = (function (elt, xhr) {
        //quelle data ??
        return function (data) {
          var DONE = 4; // readyState 4 means the request is done.
          var OK = 200; // status 200 is a successful return.
          if (xhr.readyState === DONE) {
            if (xhr.status === OK) {
              elt.datas.initialPython = xhr.responseText;
              elt.editor.setValue(elt.datas.initialPython);
            }
          }
        };
      }(this, httpRequest));
      httpRequest.open("GET", python);
      httpRequest.send();
    } else {
      this.editor.setValue(this.datas.initialPython)
    }
    if (this.hasAttribute('graphic-first')) {
      this.pythondiv.classList.remove('show', 'active');
      this.graphicdiv.classList.add('show', 'active');
      this.consoleTab.classList.remove('active');
      this.graphicTab.classList.add('active');
    }

    if (this.hasAttribute('small-editor')) {
      this.pythondiv.classList.add('pyexec-small');
      this.graphicdiv.classList.add('pyexec-small');
      this.acediv.classList.add('pyexec-small');
    }

    if (this.hasAttribute('moyen')) {
      this.pythondiv.classList.add('pyexec-moyen');
      this.graphicdiv.classList.add('pyexec-moyen');
      this.acediv.classList.add('pyexec-moyen');
    }

    if (this.hasAttribute('fixed-result')) {
      this.pythondiv.classList.add('pyexec-fixed');
    }
  }
}

/* définition des classes pour mon exerciseur dynamique */
class ExerciseGenerator {
  constructor(difficulty = 3) {
      this.difficulty = difficulty;
      this.variables = [];
      this.expressions = [];
      this.currentCorrectAnswers = {};
      this.myData = {
          name_and_type: {
              n: "integer", x: "integer", y: "integer", z: "integer", a: "integer", b: "integer", temp:"integer", item: "float", 
              i:"integer", j:"integer", k: "integer", age: "integer", name: "string", user_id: "integer", count: "integer",
              total: "float", sum: "float", product: "float", average: "float", mon_index: "integer", my_index: "integer", index: "integer", 
              max: "float", min: "float", height: "float", width: "float", dividende: "integer", girth: "float", 
              length: "float", size: "integer", position: "integer", status: "string", diviseur: "integer", 
              color: "string", date: "string", flag: "boolean", is_active: "boolean", divisor: "integer", nb_users: "integer", 
              has_items: "boolean", is_visible: "boolean",  nom: "string", user_score: "integer", nb_steps: "integer", 
              score_utilisateur: "integer", compteur: "integer", total_count: "float", speed: "float", nb_msgs: "integer", 
              somme: "float", produit: "float", moyenne: "float", maximum: "float", quotient: "float",
              minimum: "float", hauteur: "float", largeur: "float", longueur: "float", taille: "integer",
              position: "integer", statut: "string", couleur: "string", date: "string", data_points: "float",
              drapeau: "boolean", est_actif: "boolean", a_des_objets: "boolean", est_visible: "boolean",
              est_complet: "boolean", est_valide: "boolean", login_attempts: "integer", my_variable: "float", 
              cell_number: "integer", is_verified: "boolean", price_per_unit: "float"
          },
          operators: {
              cocktail: ["+", "-", "+", "*", "//", "%","==", "!=", "<", ">", "<=", ">="],
              logique: ["and", "or", "not"],
              comparaison: ["==", "!=", "<", ">", "<=", ">="],
              arithmetique: ["+", "-", "*", "//", "%"]
          }
      };
      this.currentOperators = [];
  }

  generateDynamicExercise() {
      this.resetExercise();
      this.selectVariables();
      this.generateExpressions();
      return {
          variables: this.variables,
          expressions: this.expressions,
          currentCorrectAnswers: this.currentCorrectAnswers
      };
  }

  resetExercise() {
      this.variables = [];
      this.expressions = [];
      this.currentCorrectAnswers = {};
  }

  selectVariables() {
      const variableNames = Object.keys(this.myData.name_and_type);
      while (this.variables.length < this.difficulty) {
          const randomIndex = Math.floor(Math.random() * variableNames.length);
          const variable = variableNames[randomIndex];
          if (!this.variables.find(v => v.name === variable)) {
              const type = this.myData.name_and_type[variable];
              const value = this.initializeVariable(type);
              this.variables.push({ name: variable, type, value });
              this.expressions.push(`${variable} = ${this.formatValueForDisplay(value)}`);
          }
      }
  }

  generateExpressions() {
      this.updateOperatorAvailability();
      this.variables.forEach((variable, index) => {
          const inputId = `inputValue${index + 1}`;
          const isBoolean = variable.type === "boolean";
          const operatorSet = isBoolean ? this.myData.operators.logique : this.currentOperators;
          const operator = operatorSet[Math.floor(Math.random() * operatorSet.length)];
          
          let expression, evalResult;

          if (isBoolean && operator === "not") {
              expression = `${variable.name} = not ${variable.name}`;
              evalResult = !variable.value;
          } else {
              const otherVariable = this.selectAppropriateVariable(variable);
              const valueToUse = otherVariable ? otherVariable.value : this.getRandomBoolean();
              expression = `${variable.name} = ${variable.name} ${operator} ${this.formatValueForDisplay(valueToUse)}`;
              evalResult = this.evaluateExpression(variable.value, valueToUse, operator);
          }

          this.expressions.push(expression);
          variable.value = evalResult;
          this.currentCorrectAnswers[inputId] = typeof evalResult === 'boolean' ? this.formatValueForDisplay(evalResult) : evalResult.toString();
      });
      this.shuffleExpressions();
  }

  updateOperatorAvailability() {
      const maxOperators = 2 * this.difficulty;
      this.currentOperators = this.myData.operators.cocktail.slice(0, Math.min(maxOperators, this.myData.operators.cocktail.length));
  }

  initializeVariable(type) {
      switch(type) {
          case "integer":
          case "float":
          case "string":
              return Math.floor(Math.random() * 11) - 0;
          case "boolean":
              return Math.random() < 0.5;
          default:
              return null;
      }
  }

  formatValueForDisplay(value) {
      if (typeof value === 'boolean') {
          return value ? "True" : "False";
      }
      return value;
  }

  selectAppropriateVariable(currentVariable) {
      return this.variables.find(v => v !== currentVariable && typeof v.value === (currentVariable.type === 'boolean' ? 'boolean' : 'number'));
  }

  getRandomBoolean() {
      return Math.random() < 0.5;
  }

  evaluateExpression(left, right, operator) {
      try {
          switch(operator) {
              case "and": return left && right;
              case "or": return left || right;
              case "not": return !left;
              case "+":
              case "-":
              case "*":
                  return eval(`${left} ${operator} ${right}`);
              case "//":
                  if (right === 0 || right === false ) return "Error: Division by zero";
                  return Math.floor(left / right);
              case "%":
                  if (right === 0 || right === false) return "Error: Division by zero";
                  return left % right;
              default:
                  return eval(`${left} ${operator} ${right}`);
          }
      } catch (e) {
          console.error('Erreur:', e.message);
          return "Error: Invalid expression";
      }
  }

  shuffleExpressions() {
      for (let i = this.expressions.length - 1; i > this.difficulty - 1; i--) {
          const j = this.difficulty + Math.floor(Math.random() * (i - this.difficulty + 1)); //* (i + 1) OU BIEN sans les blancs espaces blancs: (i - this.difficulty + 1)
          [this.expressions[i], this.expressions[j]] = [this.expressions[j], this.expressions[i]];
      }
  }
}

class UIManager {
  constructor(exerciseGenerator, answerHandler) {
      this.exerciseGenerator = exerciseGenerator;
      this.answerHandler = answerHandler;
      this.codeDisplay = document.getElementById('code-display');
      this.container = document.querySelector('.exercise-container');
      this.difficultySlider = document.getElementById('difficultyLevel');
      this.variableCountDisplay = document.getElementById('variableCount');
      this.setupEventListeners();
  }

  setupEventListeners() {
      document.getElementById('generate-button').addEventListener('click', () => this.generateNewExercise());
      document.getElementById('verify-button').addEventListener('click', () => this.answerHandler.verifyAnswers());
      document.getElementById('show-button').addEventListener('click', () => this.answerHandler.showAnswers());
      this.difficultySlider.addEventListener('input', (e) => this.handleDifficultyChange(e.target.value));
  }

  generateNewExercise() {
      const exercise = this.exerciseGenerator.generateDynamicExercise();
      this.updateUIWithExercise(exercise);
  }

  updateUIWithExercise(exercise) {
      this.codeDisplay.textContent = exercise.expressions.join('\n');
      this.clearInputGroups();
      this.createInputGroups(exercise);
  }

  clearInputGroups() {
      this.container.querySelectorAll('.input-group').forEach(el => el.remove());
  }

  createInputGroups(exercise) {
      exercise.variables.forEach((variable, index) => {
          const inputGroup = this.createInputGroup(variable, index);
          this.container.appendChild(inputGroup);
      });
  }

  createInputGroup(variable, index) {
      const inputGroup = document.createElement('div');
      inputGroup.className = 'input-group';

      const labelElement = document.createElement('label');
      labelElement.htmlFor = `inputValue${index + 1}`;
      labelElement.textContent = `${variable.name}:`;

      const inputElement = document.createElement('input');
      inputElement.type = 'text';
      inputElement.id = `inputValue${index + 1}`;
      inputElement.placeholder = `Valeur finale de ${variable.name}`;

      const errorCheckbox = document.createElement('input');
      errorCheckbox.type = 'checkbox';
      errorCheckbox.id = `errorCheckbox${index + 1}`;
      
      const errorLabel = document.createElement('label');
      errorLabel.htmlFor = `errorCheckbox${index + 1}`;
      errorLabel.textContent = "Erreur ?";

      inputGroup.append(labelElement, inputElement, errorCheckbox, errorLabel);
      return inputGroup;
  }

  handleDifficultyChange(value) {
      this.updateVariableCount(value);
      this.updateRangeColor(value);
      this.exerciseGenerator.difficulty = parseInt(value);
      this.generateNewExercise();
  }

  updateVariableCount(value) {
      this.variableCountDisplay.textContent = value;
  }

  updateRangeColor(value) {
      const max = parseInt(this.difficultySlider.max);
      const min = parseInt(this.difficultySlider.min);
      const fraction = (value - min) / (max - min);
      const red = Math.round(250 * fraction);
      const green = Math.round(250 * (1 - fraction));
      const blue = 50;
      this.difficultySlider.style.background = `linear-gradient(to right, rgb(${red}, ${green}, ${blue}) ${fraction * 100}%, #ddd ${fraction * 100}%)`;
  }
}

class AnswerHandler {
  constructor(exerciseGenerator) {
      this.exerciseGenerator = exerciseGenerator;
  }

  verifyAnswers() {
      document.querySelectorAll('.input-group').forEach(group => {
          const input = group.querySelector('input[type="text"]');
          const errorCheckbox = group.querySelector('input[type="checkbox"]');
          const userAnswer = input.value.trim();
          const correctAnswer = this.exerciseGenerator.currentCorrectAnswers[input.id];
          
          this.updateInputStyle(input, errorCheckbox, userAnswer, correctAnswer);
      });
  }

  updateInputStyle(input, errorCheckbox, userAnswer, correctAnswer) {
      if (errorCheckbox.checked) {
          if (correctAnswer === "Error: Division by zero" && userAnswer === "") {
              input.style.backgroundColor = 'lightgreen';
          } else if (correctAnswer === "Error: Division by zero") {
              input.style.backgroundColor = '';
          } else {
              input.style.backgroundColor = 'salmon';
          }
      } else {
          if (userAnswer === "") {
              input.style.backgroundColor = "";
          } else if (userAnswer === correctAnswer) {
              input.style.backgroundColor = 'lightgreen';
          } else {
              input.style.backgroundColor = 'salmon';
          }
      }
  }

  showAnswers() {
      document.querySelectorAll('.input-group').forEach(group => {
          const input = group.querySelector('input[type="text"]');
          const errorCheckbox = group.querySelector('input[type="checkbox"]');
          const correctAnswer = this.exerciseGenerator.currentCorrectAnswers[input.id];

          if (correctAnswer.startsWith("Error")) {
              errorCheckbox.checked = true;
              input.value = "";
              input.style.backgroundColor = 'lightgray';
          } else {
              input.value = correctAnswer;
              input.style.backgroundColor = 'lightgray';
          }
      });
  }
}
/* fin de mes classes "Exerciseur" */

/* J'ajoute l'initialisation de l'exerciseur à l'événement DOMContentLoaded */
document.addEventListener('DOMContentLoaded', function() {
  // Initialisation de l'exerciseur
  const exerciseGenerator = new ExerciseGenerator(3);
  const answerHandler = new AnswerHandler(exerciseGenerator);
  const uiManager = new UIManager(exerciseGenerator, answerHandler);
  
  uiManager.generateNewExercise();

  // Associer les boutons à leurs fonctions respectives
  document.getElementById('verify-button').addEventListener('click', verifyAnswers);
  document.getElementById('show-button').addEventListener('click', showAnswers);
  document.getElementById('generate-button').addEventListener('click', generateDynamicExercise);
  // Générer un exercice au chargement de la page
  generateDynamicExercise();
});


/* Création du contenu des modules Python */
document.addEventListener('templateLoaded', function (e) {
  customElements.define('bloc-python', PythonModule);
  customElements.define('bloc-cours', Cours);
  customElements.define('bloc-attention', Attention);
  customElements.define('bloc-retenir', Retenir);
  customElements.define('bloc-consigne', Consigne);
  customElements.define('bloc-markdown', MarkdownBlock);
});

document.addEventListener('bloc-loaded', function (e) {
  document.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightBlock(block);
  });
});

$LAB.script("https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.13.0/js/all.min.js")
  .script("https://cdnjs.cloudflare.com/ajax/libs/showdown/1.9.1/showdown.min.js")
  .script("https://cdn.jsdelivr.net/npm/file-saver@2.0.2/dist/FileSaver.min.js")
  .script("https://cdnjs.cloudflare.com/ajax/libs/ace/1.4.7/ace.js").wait()
  .script("https://cdn.jsdelivr.net/gh/trinketapp/skulpt-dist@0.11.1.19/skulpt.min.js").wait()
  .script("https://cdn.jsdelivr.net/gh/trinketapp/skulpt-dist@0.11.1.19/skulpt-stdlib.js")
  .script("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.18.1/highlight.min.js").wait()
  .script("https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.18.1/languages/python.min.js")
  .script("https://code.jquery.com/jquery-3.4.1.slim.min.js").wait()
  .script("https://cdn.jsdelivr.net/npm/popper.js@1.16.0/dist/umd/popper.min.js").wait()
  .script("https://stackpath.bootstrapcdn.com/bootstrap/4.4.1/js/bootstrap.min.js")
  .wait(function () {


    /* Chargement des templates */
    var httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = (function (xhr) {
      return function (data) {
        var DONE = 4; // readyState 4 means the request is done.
        var OK = 200; // status 200 is a successful return.
        if (xhr.readyState === DONE) {
          if (xhr.status === OK) {
            template = document.createElement('templates');
            template.innerHTML = xhr.responseText;
            document.getElementsByTagName('body')[0].prepend(template);
            var event = new CustomEvent('templateLoaded');
            document.dispatchEvent(event);
          }
        }
      };
    }(httpRequest));

    
/*
modif à apporter si je mets des fichiers en dehors du dossier racine :
    if (pythonexec_template_dir === undefined) {
      pythonexec_template_dir = "templates";
    }
    httpRequest.open("GET", pythonexec_template_dir+"/blocs.html");
puis mettre le chemin vers editeur/templates: 
<script>pythonexec_template_dir="blabla/editeur/templates";</script>
dans le fichier qui n'est pas dans la racine
*/
    httpRequest.open("GET", "js/blocs.html");/*MOD "../js/blocs.html" */
    httpRequest.send();
  });




/*MOD*/
    /*
Ctrl-Entrée lance l'exécution
voir ici pour une meilleure implémentation :
http://s15847115.domainepardefaut.fr/python/

    https://blog.lesieur.name/comment-gerer-les-raccourcis-clavier-en-javascript/
     * Nous sommes dans le scope global,
     * aussi l'objet `keys` est accessible partout
     * dans le code à travers tous les fichiers JavaScript.
    */
   var keys = {};
   /*
    * Étant dans le code global,
    * `window.onkeydown` est identique à `this.onkeydown`
    * lui même identique à `onkeydown`.
    * On associe ci-dessous la même fonction lorsqu'une
    * touche est appuyée, et lorsqu'une touche est relachée.
   */
   onkeydown = onkeyup = function (e) {
       /*
        * Si `e` n'existe pas,
        * nous somme probablement dans un vieux IE.
        * On affecte alors `event` à `e`.
        */
       e = e || event;
       /*
        * Si `e.which` n'existe pas,
        * On affecte alors l'alternative `e.keyCode` à `e.which`.
        */
       e.which = e.which || e.keyCode;
       /*
        * Si la fonction courante est executée,
        * quand une touche est enfoncée,
        * `e.type === 'keydown'` renverra `true`
        * sinon elle renverra `false`.
        * Il suffit alors d'assigner chaque état
        * dans le tableau `keys` pour chaque
        * touche `e.keyCode`.
        */
       keys[e.which] = e.type === 'keydown';
       /*
        * Cette zone sera exécutée lorsque les touches
        * Ctrl (17) et Entrée (13)
        * seront enfoncée en même temps
        * car l'objet `keys` vaudra alors :
        * {
        *  17: true,
        *  13: true
        * }
        */
       if (keys[17] && keys[13]) {
      	  le_bouton_run.onclick();
          }
   }


class ExerciceModule extends HTMLElement {
  constructor() {
    super();
    let template = document.getElementById('mon-exercice');
    this.appendChild(template.content.cloneNode(true));
    this.generateButton = this.querySelector('#generate-button');
    this.verifyButton = this.querySelector('#verify-button');
    this.showButton = this.querySelector('#show-button');
    this.codeDisplay = this.querySelector('#code-display');

    this.generateButton.addEventListener('click', generateDynamicExercise);
    this.verifyButton.addEventListener('click', verifyAnswers);
    this.showButton.addEventListener('click', showAnswers);
  }

  connectedCallback() {
    generateDynamicExercise();
  }
}

customElements.define('bloc-exercice', ExerciceModule);

// js/flowchart-generator.js

// Variable globale pour stocker l'instance de Pyodide une fois chargée.
var pyodide = null;
// Variable pour stocker le code de votre classe CFG une fois chargé.
var cfgPythonScript = "";
// Référence au bandeau de chargement
var loadingOverlay = null;

/**
 * Affiche ou masque le bandeau de chargement.
 * @param {boolean} show Vrai pour afficher, faux pour masquer.
 */
function setLoadingState(show) {
    if (!loadingOverlay) {
        loadingOverlay = document.getElementById('loading-overlay');
    }
    if (loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Initialise Pyodide et charge le script Python contenant la classe ControlFlowGraph.
 * Implémente un pattern Singleton pour éviter les rechargements multiples.
 */
async function initPyodideAndLoadScript() {
    // --- VÉRIFICATION SINGLETON : Si déjà chargé, on ne fait rien ---
    if (pyodide !== null && cfgPythonScript !== "") {
        // Optionnel : Vérifier si handlePythonInput a changé et le mettre à jour
        if (typeof window.handlePythonInput === 'function' && pyodide.globals) {
             try { pyodide.globals.set("js_input_handler", window.handlePythonInput); } catch(e){}
        }
        return; 
    }
    // ---------------------------------------------------------------

    try {
        console.log("Initialisation de Pyodide...");
        
        // 1. Charger le moteur Pyodide (si pas encore fait)
        if (pyodide === null) {
            pyodide = await loadPyodide();
            console.log("Pyodide chargé avec succès.");
        }

        // 2. Charger les packages nécessaires
        // 'micropip' est souvent nécessaire pour installer d'autres libs, 'autopep8' pour le formatage si utilisé
        await pyodide.loadPackage(["micropip"]);
        const micropip = pyodide.pyimport("micropip");
        // await micropip.install('autopep8'); // Décommenter si nécessaire

        // 3. Connecter la fonction d'input JS à Python
        if (typeof window.handlePythonInput === 'function') {
            pyodide.globals.set("js_input_handler", window.handlePythonInput);
            console.log("Gestionnaire d'input JS connecté à Pyodide.");
        } else {
            console.warn("handlePythonInput non défini globalement. Les inputs() Python ne fonctionneront pas via l'UI.");
        }

        // 4. Charger le script MyCFG.py (si pas encore fait)
        if (cfgPythonScript === "") {
            // Détection du mode (Statique vs Flask)
            const isStatic = (typeof IS_STATIC_VERSION !== 'undefined' && IS_STATIC_VERSION === true);
            const scriptPath = isStatic ? 'MyCFG.py' : '/static/py/MyCFG.py';
            
            console.log(`Chargement de MyCFG.py depuis : ${scriptPath}`);
            
            const response = await fetch(scriptPath);
            if (!response.ok) {
                throw new Error(`Impossible de charger le script Python CFG (Status: ${response.status})`);
            }
            cfgPythonScript = await response.text();
            
            // Écrire le fichier dans le système de fichiers virtuel (VFS) de Pyodide
            // Cela permet de faire "import MyCFG" ou "from MyCFG import ..." proprement
            pyodide.FS.writeFile("MyCFG.py", cfgPythonScript);
            
            // On peut aussi l'exécuter une fois pour définir les classes dans le scope global si besoin,
            // mais l'import est plus propre.
            await pyodide.runPythonAsync(`
import sys
if '.' not in sys.path: sys.path.append('.')
import MyCFG
print("Module MyCFG importé avec succès.")
            `);
            
            console.log("Script MyCFG.py chargé et configuré.");
        }

    } catch (err) {
        console.error("Erreur critique lors de l'initialisation de Pyodide:", err);
        // En cas d'échec, on reset pour permettre une nouvelle tentative propre
        pyodide = null; 
        cfgPythonScript = "";
        throw err;
    }
}

/**
 * Génère le diagramme Mermaid à partir du code Python fourni.
 * @param {string} pythonCode Le code Python à analyser.
 * @returns {Promise<Object|null>} Un objet { mermaid, canonicalCode, ast_dump, detectedTypes } ou null.
 */
async function generateFlowchartFromCode(pythonCode) {
    setLoadingState(true);
    try {
        await initPyodideAndLoadScript();

        if (!pythonCode || pythonCode.trim() === "") {
            return {
                mermaid: "",
                canonicalCode: "",
                ast_dump: "",
                detectedTypes: {}
            };
        }

        pyodide.globals.set("user_code_to_analyze", pythonCode);

        const pythonScript = `
import sys
import ast
import json
import MyCFG

from MyCFG import ControlFlowGraph

output = {}

try:
    current_code = user_code_to_analyze
    cfg_instance = ControlFlowGraph(current_code)
    output = cfg_instance.process_and_get_results()

    if not isinstance(output, dict):
        output = {}
    if "detected_types" not in output:
        output["detected_types"] = {}
    if "ast_dump" not in output and cfg_instance.tree is not None:
        output["ast_dump"] = ast.dump(cfg_instance.tree)

except Exception as e:
    import traceback
    output = {
        "mermaid": f"Error: {str(e)}",
        "canonical_code": "",
        "ast_dump": "",
        "detected_types": {},
        "error": f"{type(e).__name__}: {str(e)}\\n{traceback.format_exc()}"
    }

json.dumps(output)
`;

        const resultJson = await pyodide.runPythonAsync(pythonScript);
        const result = JSON.parse(resultJson);

        return {
            mermaid: result.mermaid || "",
            canonicalCode: result.canonical_code || result.canonicalCode || "",
            ast_dump: result.ast_dump || "",
            detectedTypes: result.detected_types || {},
            error: result.error || null
        };

    } catch (err) {
        console.error("Erreur JS lors de la génération du diagramme:", err);
        return null;
    } finally {
        setLoadingState(false);
    }
}

// Variable globale pour l'instance de zoom (pour pouvoir la détruire/réinitialiser)
var panZoomInstance = null;
if (typeof window.panZoomInstance === 'undefined') {
    window.panZoomInstance = null;
}

function isFlowchartVisible() {
    const flowchart = document.getElementById('flowchart');
    if (!flowchart) return false;
    return !!(flowchart.offsetParent || flowchart.getClientRects().length);
}

function bboxReady(svgElement) {
    if (!svgElement) return false;
    const box = svgElement.getBBox();
    return Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0;
}

window.__mermaidRenderInProgress = window.__mermaidRenderInProgress || false;
window.__pendingMermaidRender = window.__pendingMermaidRender || false;

window.renderPendingFlowchart = function() {
    const container = document.getElementById('flowchart');
    if (!container || !container.dataset || typeof container.dataset.mermaidSource !== 'string') return;
    if (!isFlowchartVisible()) {
        window.__pendingMermaidRender = true;
        return;
    }
    displayFlowchart(container.dataset.mermaidSource, 'flowchart');
};

/**
 * Affiche le diagramme Mermaid dans le div spécifié.
 * @param {string} mermaidCode La chaîne de caractères Mermaid.
 * @param {string} targetDivId L'ID du div où afficher le diagramme.
 */
async function displayFlowchart(mermaidCode, targetDivId) {
    const targetDiv = document.getElementById(targetDivId);
    const zoomControls = document.getElementById('zoom-controls');
    
    if (!targetDiv) return;

    targetDiv.dataset.mermaidSource = mermaidCode || "";

    if (!isFlowchartVisible()) {
        window.__pendingMermaidRender = true;
        return;
    }

    if (window.__mermaidRenderInProgress) {
        window.__pendingMermaidRender = true;
        return;
    }
    window.__mermaidRenderInProgress = true;

    if (window.panZoomInstance && typeof window.panZoomInstance.destroy === 'function') {
        try {
            const svgElement = targetDiv.querySelector('svg');
            if (svgElement && bboxReady(svgElement)) {
                window.panZoomInstance.destroy();
            }
        } catch (e) {
            console.warn(e);
        }
        window.panZoomInstance = null;
        panZoomInstance = null;
    }

    if (!mermaidCode) {
        targetDiv.innerHTML = '<p class="text-center text-muted mt-3">Aucun diagramme à afficher.</p>';
        if (zoomControls) zoomControls.classList.remove('show');
        window.__mermaidRenderInProgress = false;
        return;
    }

    targetDiv.innerHTML = '';
    const graphDiv = document.createElement('div');
    graphDiv.className = 'mermaid';
    graphDiv.textContent = mermaidCode;
    targetDiv.appendChild(graphDiv);

    try {
        await mermaid.run({ nodes: [graphDiv] });

        const svgElement = targetDiv.querySelector('svg');

        if (svgElement) {
            svgElement.removeAttribute('height');
            svgElement.removeAttribute('width');
            svgElement.removeAttribute('style');
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';
            svgElement.style.maxWidth = 'none';
            svgElement.style.display = 'block';

            const tryInitPanZoom = () => {
                if (!svgElement.getClientRects().length || !bboxReady(svgElement)) return false;
                if (typeof svgPanZoom === 'undefined') return false;

                window.panZoomInstance = svgPanZoom(svgElement, {
                    zoomEnabled: true,
                    controlIconsEnabled: false,
                    fit: true,
                    center: true,
                    minZoom: 0.1,
                    maxZoom: 10,
                    dblClickZoomEnabled: false
                });
                panZoomInstance = window.panZoomInstance;

                try {
                    window.panZoomInstance.resize();
                    window.panZoomInstance.fit();
                    window.panZoomInstance.center();
                } catch (e) {
                    console.warn(e);
                }

                if (zoomControls) zoomControls.classList.add('show');
                return true;
            };

            if (!tryInitPanZoom()) {
                setTimeout(tryInitPanZoom, 120);
            }
        }
    } catch (err) {
        console.error("Erreur de rendu Mermaid:", err);
        targetDiv.innerHTML = `<div class="alert alert-danger m-3">Erreur d'affichage graphique: ${err.message}</div>`;
        if (zoomControls) zoomControls.classList.remove('show');
    } finally {
        window.__mermaidRenderInProgress = false;
        if (window.__pendingMermaidRender && isFlowchartVisible()) {
            window.__pendingMermaidRender = false;
            window.renderPendingFlowchart();
        }
    }
}

// --- Fonctions globales pour les boutons de zoom ---
window.zoomIn = function() {
    if (panZoomInstance) panZoomInstance.zoomIn();
};

window.zoomOut = function() {
    if (panZoomInstance) panZoomInstance.zoomOut();
};

window.resetZoom = function() {
    if (panZoomInstance) {
        panZoomInstance.resetZoom();
        panZoomInstance.center();
    }
};

// Initialiser Pyodide et charger le script dès que la page est prête.
// Nous utilisons DOMContentLoaded pour s'assurer que le DOM est prêt avant de manipuler les divs.
document.addEventListener('DOMContentLoaded', function() {
    
    loadingOverlay = document.getElementById('loading-overlay'); // Initialiser la référence ici
    
    // CORRECTION : On attend la fin du chargement pour masquer le bandeau
    initPyodideAndLoadScript()
        .then(() => {
            console.log("Initialisation terminée, masquage du bandeau.");
            setLoadingState(false);
        })
        .catch(err => {
            console.error("Erreur lors du chargement initial:", err);
            // En cas d'erreur, on affiche le message dans le bandeau pour ne pas laisser l'utilisateur dans le flou
            if (loadingOverlay) {
                loadingOverlay.innerHTML = `
                    <div class="alert alert-danger m-4">
                        <h4>Erreur de chargement</h4>
                        <p>${err.message}</p>
                        <button class="btn btn-outline-light mt-2" onclick="location.reload()">Réessayer</button>
                    </div>`;
            }
        });

    const initMermaid = () => {
        if (typeof window.mermaid === 'undefined') {
            console.warn("Mermaid n'est pas encore chargé. Nouvelle tentative dans 300ms...");
            setTimeout(initMermaid, 300);
            return;
        }

        window.mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: false,
                htmlLabels: true
            }
        });
    };

    initMermaid();
});

// Fonction globale pour être appelée depuis d'autres scripts
// Fonction principale pour mettre à jour le diagramme, appelée par un événement externe (bouton).
/**
 * Récupère le code, génère le diagramme et l'affiche.
 */
async function triggerFlowchartUpdate() {
    // S'assurer que codeEditorInstance est accessible (doit être défini globalement ou passé en paramètre)
    if (typeof codeEditorInstance === 'undefined' || !codeEditorInstance) {
        console.error("L'instance de CodeMirror (codeEditorInstance) n'est pas disponible.");
        alert("Erreur : L'éditeur de code n'est pas initialisé.");
        return;
    }
    var currentCode = codeEditorInstance.getValue();

    if (currentCode) {
        // 1. On appelle la fonction et on stocke l'objet complet dans "results"
        var results = await generateFlowchartFromCode(currentCode);

        // 2. On vérifie que l'objet "results" existe ET qu'il contient bien la propriété "mermaid"
        if (results && results.mermaid) {
            // 3. On passe uniquement la propriété "mermaid" à la fonction d'affichage
            await displayFlowchart(results.mermaid, 'flowchart');
        } else {
            // Gérer le cas où la génération a échoué et n'a rien retourné de valide
            await displayFlowchart("", 'flowchart');
        }
        
        // 4. On retourne l'objet complet pour que main.js puisse l'utiliser
        return results;

    } else {
        // Effacer le diagramme si pas de code
        await displayFlowchart("", 'flowchart');
        return null; // Retourner null si pas de code
    }
}

window.rerenderStoredFlowchart = function() {
    const container = document.getElementById('flowchart');
    if (!container || !container.dataset || typeof container.dataset.mermaidSource !== 'string') return;
    if (!isFlowchartVisible()) {
        window.__pendingMermaidRender = true;
        return;
    }
    displayFlowchart(container.dataset.mermaidSource, 'flowchart');
};

document.addEventListener('theme:changed', function() {
    if (typeof window.rerenderStoredFlowchart === 'function') {
        window.rerenderStoredFlowchart();
    }
});
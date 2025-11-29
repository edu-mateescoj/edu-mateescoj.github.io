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
 * @returns {Promise<Object|null>} Un objet { mermaid, canonicalCode, ast_dump } ou null.
 */
async function generateFlowchartFromCode(pythonCode) {
    setLoadingState(true);
    try {
        await initPyodideAndLoadScript();

        if (!pythonCode || pythonCode.trim() === "") {
            return null;
        }

        pyodide.globals.set("user_code_to_analyze", pythonCode);

        // --- SCRIPT PYTHON AMÉLIORÉ ---
        // Retourne du JSON avec Mermaid + AST Dump + Code Canonique
        const pythonScript = `
import sys
import ast
import json
import MyCFG
# importlib.reload(MyCFG) # Décommenter en dev si besoin

from MyCFG import ControlFlowGraph

output = {}

try:
    code_str = user_code_to_analyze
    
    # 1. Analyse CFG
    cfg = ControlFlowGraph(code_str)
    cfg.visit(cfg.tree, None)
    mermaid_code = cfg.to_mermaid()
    
    # 2. Dump AST (pour la détection de changements structurels)
    # On utilise l'arbre déjà parsé par CFG
    ast_dump = ast.dump(cfg.tree)
    
    # 3. Code Canonique (pour éviter de loguer des changements d'espaces/commentaires)
    # On utilise ast.unparse (Python 3.9+) pour normaliser le code
    try:
        canonical_code = ast.unparse(cfg.tree)
    except AttributeError:
        # Fallback pour vieilles versions de Python (peu probable sous Pyodide récent)
        canonical_code = code_str.strip()

    output = {
        "mermaid": mermaid_code,
        "ast_dump": ast_dump,
        "canonicalCode": canonical_code,
        "status": "success"
    }

except Exception as e:
    output = {
        "status": "error",
        "message": str(e),
        "mermaid": f"Error: {str(e)}"
    }

json.dumps(output)
`;

        const resultJson = await pyodide.runPythonAsync(pythonScript);
        const result = JSON.parse(resultJson);

        if (result.status === "error") {
            console.error("Erreur Python CFG:", result.message);
            return { mermaid: result.mermaid, canonicalCode: "", ast_dump: "" }; // Retour partiel pour afficher l'erreur
        }

        return result;

    } catch (err) {
        console.error("Erreur JS lors de la génération du diagramme:", err);
        return null;
    } finally {
        setLoadingState(false);
    }
}

// Variable globale pour l'instance de zoom (pour pouvoir la détruire/réinitialiser)
var panZoomInstance = null;

/**
 * Affiche le diagramme Mermaid dans le div spécifié.
 * @param {string} mermaidCode La chaîne de caractères Mermaid.
 * @param {string} targetDivId L'ID du div où afficher le diagramme.
 */
async function displayFlowchart(mermaidCode, targetDivId) {
    const targetDiv = document.getElementById(targetDivId);
    const zoomControls = document.getElementById('zoom-controls');
    
    if (!targetDiv) return;

    // 1. Nettoyage de l'ancienne instance
    if (panZoomInstance) {
        try {
            panZoomInstance.destroy();
        } catch(e) { console.warn("Erreur destruction panZoom:", e); }
        panZoomInstance = null;
    }

    if (!mermaidCode) {
        targetDiv.innerHTML = '<div class="alert alert-warning m-3">Impossible de générer le diagramme.</div>';
        if (zoomControls) zoomControls.style.display = 'none';
        return;
    }

    // 2. Préparation du conteneur
    targetDiv.innerHTML = '';
    const graphDiv = document.createElement('div');
    graphDiv.className = 'mermaid';
    
    // REVERSION : On utilise le code Mermaid brut sans modification JS
    graphDiv.textContent = mermaidCode;
    
    targetDiv.appendChild(graphDiv);

    // 3. Rendu Mermaid
    try {
        await mermaid.run({
            nodes: [graphDiv]
        });

        // 4. Initialisation SVG-PAN-ZOOM (Renforcée)
        const svgElement = targetDiv.querySelector('svg');
        
        if (svgElement) {
            // A. Assurer un ID unique (Requis par la lib parfois)
            if (!svgElement.id) {
                svgElement.id = "mermaid-svg-" + Date.now();
            }

            // B. Nettoyer les attributs de taille fixes de Mermaid
            svgElement.removeAttribute('height');
            svgElement.removeAttribute('width');
            svgElement.removeAttribute('style'); 
            
            // C. Forcer le style CSS pour remplir le conteneur
            svgElement.style.width = "100%";
            svgElement.style.height = "100%";
            svgElement.style.maxWidth = "none"; 
            svgElement.style.display = "block";

            // D. Initialisation avec un léger délai
            setTimeout(() => {
                try {
                    if (typeof svgPanZoom === 'undefined') return;

                    panZoomInstance = svgPanZoom('#' + svgElement.id, {
                        zoomEnabled: true,
                        controlIconsEnabled: false,
                        fit: false, // On interdit l'ajustement automatique
                        center: true, // On centre l'image
                        minZoom: 0.1,
                        maxZoom: 10,
                        dblClickZoomEnabled: false
                    });
                    
                    // --- CORRECTION DU ZOOM ---
                    // Au lieu de laisser la librairie deviner, on force un zoom à 100% (échelle 1)
                    // Cela garantit que le texte est lisible, même si le diagramme dépasse du cadre.
                    panZoomInstance.zoom(1.0);
                    panZoomInstance.center(); // On recentre après le zoom
                    
                    if (zoomControls) zoomControls.style.display = 'flex';

                } catch (err) {
                    console.error("Erreur zoom:", err);
                }
            }, 200); // Délai légèrement augmenté (200ms) pour être sûr que le rendu est fini
        } else {
            console.error("Aucun élément SVG trouvé après le rendu Mermaid.");
        }

    } catch (err) {
        console.error("Erreur de rendu Mermaid:", err);
        targetDiv.innerHTML = `<div class="alert alert-danger m-3">Erreur d'affichage graphique: ${err.message}</div>`;
        if (zoomControls) zoomControls.style.display = 'none';
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

    // Initialiser Mermaid (configuration globale si nécessaire)
    mermaid.initialize({
        startOnLoad: false, // Nous allons appeler mermaid.run() manuellement
        securityLevel: 'loose',
        flowchart: {
            htmlLabels: true
        }
    });
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
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
                detectedTypes: {},
                nodeSourceSpans: {},
                nodeSourceSpansEditor: {}
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
    if "node_source_spans" not in output:
        output["node_source_spans"] = {}
    if "ast_dump" not in output and cfg_instance.tree is not None:
        output["ast_dump"] = ast.dump(cfg_instance.tree)

except Exception as e:
    import traceback
    output = {
        "mermaid": f"Error: {str(e)}",
        "canonical_code": "",
        "ast_dump": "",
        "detected_types": {},
        "node_source_spans": {},
        "error": f"{type(e).__name__}: {str(e)}\\n{traceback.format_exc()}"
    }

json.dumps(output)
`;

        const resultJson = await pyodide.runPythonAsync(pythonScript);
        const result = JSON.parse(resultJson);
        const rawNodeSourceSpans = result.node_source_spans || {};
        const nodeSourceSpansEditor = {};

        Object.entries(rawNodeSourceSpans).forEach(([nodeId, span]) => {
            nodeSourceSpansEditor[nodeId] = {
                ...span,
                editorLine: Number.isInteger(span?.lineno) ? Math.max(0, span.lineno - 1) : null,
                editorEndLine: Number.isInteger(span?.end_lineno) ? Math.max(0, span.end_lineno - 1) : null
            };
        });

        return {
            mermaid: result.mermaid || "",
            canonicalCode: result.canonical_code || result.canonicalCode || "",
            ast_dump: result.ast_dump || "",
            detectedTypes: result.detected_types || {},
            nodeSourceSpans: rawNodeSourceSpans,
            nodeSourceSpansEditor,
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
window.__selectedFlowchartNodeId = window.__selectedFlowchartNodeId || null;
window.__selectedFlowchartRowSourceSpan = window.__selectedFlowchartRowSourceSpan || null;
window.__flowchartLineAlignmentState = window.__flowchartLineAlignmentState || {
    baseCode: '',
    currentCode: '',
    cachedBaseCode: null,
    cachedCurrentCode: null,
    cachedAlignment: null,
};

function splitTextIntoLines(text) {
    return String(text || '').split(/\r\n|\r|\n/);
}

function isCosmeticOnlyLine(lineText) {
    const trimmedLine = String(lineText || '').trim();
    return trimmedLine === '' || trimmedLine.startsWith('#');
}

function buildLcsLineMatches(baseLines, currentLines) {
    const baseCount = baseLines.length;
    const currentCount = currentLines.length;
    const matrix = Array.from({ length: baseCount + 1 }, () => new Array(currentCount + 1).fill(0));

    for (let baseIndex = baseCount - 1; baseIndex >= 0; baseIndex -= 1) {
        for (let currentIndex = currentCount - 1; currentIndex >= 0; currentIndex -= 1) {
            if (baseLines[baseIndex] === currentLines[currentIndex]) {
                matrix[baseIndex][currentIndex] = matrix[baseIndex + 1][currentIndex + 1] + 1;
            } else {
                matrix[baseIndex][currentIndex] = Math.max(
                    matrix[baseIndex + 1][currentIndex],
                    matrix[baseIndex][currentIndex + 1]
                );
            }
        }
    }

    const matches = [];
    let baseIndex = 0;
    let currentIndex = 0;

    while (baseIndex < baseCount && currentIndex < currentCount) {
        if (baseLines[baseIndex] === currentLines[currentIndex]) {
            matches.push([baseIndex, currentIndex]);
            baseIndex += 1;
            currentIndex += 1;
            continue;
        }

        if (matrix[baseIndex + 1][currentIndex] >= matrix[baseIndex][currentIndex + 1]) {
            baseIndex += 1;
        } else {
            currentIndex += 1;
        }
    }

    return matches;
}

function mapGapOffset(offset, totalOffsets, startIndex, endIndex) {
    if (!Number.isInteger(offset) || offset < 0) return null;
    if (!Number.isInteger(totalOffsets) || totalOffsets <= 0) return null;
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex < startIndex) return null;

    const windowLength = endIndex - startIndex + 1;
    if (windowLength <= 1 || totalOffsets <= 1) {
        return startIndex;
    }

    const relativeIndex = Math.round((offset * (windowLength - 1)) / (totalOffsets - 1));
    return startIndex + Math.max(0, Math.min(relativeIndex, windowLength - 1));
}

function computeCurrentGapWindow(currentLines, gapStart, gapEnd, requiredSlots) {
    if (!Number.isInteger(gapStart) || !Number.isInteger(gapEnd) || gapEnd < gapStart) {
        return null;
    }

    let startIndex = gapStart;
    let endIndex = gapEnd;

    while (
        startIndex <= endIndex &&
        isCosmeticOnlyLine(currentLines[startIndex]) &&
        (endIndex - startIndex + 1) > requiredSlots
    ) {
        startIndex += 1;
    }

    while (
        endIndex >= startIndex &&
        isCosmeticOnlyLine(currentLines[endIndex]) &&
        (endIndex - startIndex + 1) > requiredSlots
    ) {
        endIndex -= 1;
    }

    return startIndex <= endIndex ? { startIndex, endIndex } : null;
}

function buildFlowchartLineAlignment(baseCode, currentCode) {
    const baseLines = splitTextIntoLines(baseCode);
    const currentLines = splitTextIntoLines(currentCode);
    const sourceToCurrent = new Array(baseLines.length).fill(null);
    const currentToSource = new Array(currentLines.length).fill(null);
    const matches = buildLcsLineMatches(baseLines, currentLines);

    matches.forEach(([baseIndex, currentIndex]) => {
        sourceToCurrent[baseIndex] = currentIndex;
        currentToSource[currentIndex] = baseIndex;
    });

    const anchors = [[-1, -1], ...matches, [baseLines.length, currentLines.length]];

    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex += 1) {
        const [previousBaseIndex, previousCurrentIndex] = anchors[anchorIndex];
        const [nextBaseIndex, nextCurrentIndex] = anchors[anchorIndex + 1];
        const sourceGapCount = nextBaseIndex - previousBaseIndex - 1;
        const currentGapCount = nextCurrentIndex - previousCurrentIndex - 1;

        if (sourceGapCount <= 0 && currentGapCount <= 0) {
            continue;
        }

        const currentGapWindow = computeCurrentGapWindow(
            currentLines,
            previousCurrentIndex + 1,
            nextCurrentIndex - 1,
            Math.max(1, sourceGapCount)
        );

        if (sourceGapCount > 0) {
            for (let offset = 0; offset < sourceGapCount; offset += 1) {
                const sourceIndex = previousBaseIndex + 1 + offset;
                if (Number.isInteger(sourceToCurrent[sourceIndex])) {
                    continue;
                }

                let mappedCurrentIndex = null;

                if (currentGapWindow) {
                    mappedCurrentIndex = mapGapOffset(
                        offset,
                        sourceGapCount,
                        currentGapWindow.startIndex,
                        currentGapWindow.endIndex
                    );
                }

                if (!Number.isInteger(mappedCurrentIndex)) {
                    mappedCurrentIndex = previousCurrentIndex + 1 + Math.min(offset, Math.max(0, currentGapCount - 1));
                }

                if (currentLines.length === 0) {
                    sourceToCurrent[sourceIndex] = 0;
                } else {
                    sourceToCurrent[sourceIndex] = Math.max(0, Math.min(mappedCurrentIndex, currentLines.length - 1));
                }
            }
        }

        const nonCosmeticCurrentStart = currentGapWindow ? currentGapWindow.startIndex : null;
        const nonCosmeticCurrentEnd = currentGapWindow ? currentGapWindow.endIndex : null;
        const nonCosmeticCurrentCount = Number.isInteger(nonCosmeticCurrentStart) && Number.isInteger(nonCosmeticCurrentEnd)
            ? Math.max(0, nonCosmeticCurrentEnd - nonCosmeticCurrentStart + 1)
            : 0;

        if (currentGapCount > 0 && sourceGapCount > 0 && nonCosmeticCurrentCount > 0) {
            for (let offset = 0; offset < nonCosmeticCurrentCount; offset += 1) {
                const currentIndex = nonCosmeticCurrentStart + offset;
                if (Number.isInteger(currentToSource[currentIndex])) {
                    continue;
                }

                const mappedSourceIndex = mapGapOffset(
                    offset,
                    nonCosmeticCurrentCount,
                    previousBaseIndex + 1,
                    nextBaseIndex - 1
                );

                if (Number.isInteger(mappedSourceIndex)) {
                    currentToSource[currentIndex] = mappedSourceIndex;
                }
            }
        }
    }

    return {
        baseLines,
        currentLines,
        sourceToCurrent,
        currentToSource,
    };
}

window.resetFlowchartLineAlignment = function(baseCode) {
    const normalizedBaseCode = typeof baseCode === 'string' ? baseCode : '';
    window.__flowchartLineAlignmentState.baseCode = normalizedBaseCode;
    window.__flowchartLineAlignmentState.currentCode = normalizedBaseCode;
    window.__flowchartLineAlignmentState.cachedBaseCode = null;
    window.__flowchartLineAlignmentState.cachedCurrentCode = null;
    window.__flowchartLineAlignmentState.cachedAlignment = null;
};

window.setFlowchartCurrentEditorCode = function(currentCode) {
    window.__flowchartLineAlignmentState.currentCode = typeof currentCode === 'string' ? currentCode : '';
    window.__flowchartLineAlignmentState.cachedBaseCode = null;
    window.__flowchartLineAlignmentState.cachedCurrentCode = null;
    window.__flowchartLineAlignmentState.cachedAlignment = null;
};

function getFlowchartLineAlignment() {
    const alignmentState = window.__flowchartLineAlignmentState;
    const currentEditorCode = typeof alignmentState.currentCode === 'string'
        ? alignmentState.currentCode
        : (
            (typeof codeEditorInstance !== 'undefined' && codeEditorInstance && typeof codeEditorInstance.getValue === 'function')
                ? codeEditorInstance.getValue()
                : alignmentState.baseCode
        );

    if (
        alignmentState.cachedAlignment &&
        alignmentState.cachedBaseCode === alignmentState.baseCode &&
        alignmentState.cachedCurrentCode === currentEditorCode
    ) {
        return alignmentState.cachedAlignment;
    }

    const alignment = buildFlowchartLineAlignment(alignmentState.baseCode, currentEditorCode);
    alignmentState.currentCode = currentEditorCode;
    alignmentState.cachedBaseCode = alignmentState.baseCode;
    alignmentState.cachedCurrentCode = currentEditorCode;
    alignmentState.cachedAlignment = alignment;
    return alignment;
}

window.translateFlowchartSourceSpanToCurrentEditor = function(sourceSpan) {
    if (!sourceSpan) return null;

    const translatedSpan = { ...sourceSpan };
    const alignment = getFlowchartLineAlignment();
    const sourceStartLine = Number.isInteger(sourceSpan.lineno) ? sourceSpan.lineno - 1 : null;
    const sourceEndLine = Number.isInteger(sourceSpan.end_lineno) ? sourceSpan.end_lineno - 1 : sourceStartLine;
    const mappedStartLine = Number.isInteger(sourceStartLine)
        ? alignment.sourceToCurrent[sourceStartLine]
        : null;
    const mappedEndLine = Number.isInteger(sourceEndLine)
        ? alignment.sourceToCurrent[sourceEndLine]
        : mappedStartLine;

    translatedSpan.editorLine = Number.isInteger(mappedStartLine)
        ? mappedStartLine
        : (Number.isInteger(sourceStartLine) ? Math.max(0, sourceStartLine) : null);
    translatedSpan.editorEndLine = Number.isInteger(mappedEndLine)
        ? mappedEndLine
        : (Number.isInteger(translatedSpan.editorLine) ? translatedSpan.editorLine : null);

    return translatedSpan;
};

window.translateCurrentEditorLineToFlowchartSourceLine = function(editorLine) {
    if (!Number.isInteger(editorLine) || editorLine < 0) return null;

    const alignment = getFlowchartLineAlignment();
    const sourceLine = alignment.currentToSource[editorLine];
    return Number.isInteger(sourceLine) ? sourceLine + 1 : null;
};

function getTargetDivElement(target) {
    if (target instanceof Element) return target;
    if (typeof target === 'string') return document.getElementById(target);
    return document.getElementById('flowchart');
}

function extractSourceSpanFromDataset(dataset, attributePrefix = '') {
    if (!dataset) return null;

    const prefix = attributePrefix
        ? attributePrefix.charAt(0).toUpperCase() + attributePrefix.slice(1)
        : '';
    const span = {
        lineno: Number.parseInt(dataset[`${attributePrefix}Lineno`] || dataset.lineno || '', 10),
        end_lineno: Number.parseInt(dataset[`${attributePrefix}EndLineno`] || dataset.endLineno || '', 10),
        col_offset: Number.parseInt(dataset[`${attributePrefix}ColOffset`] || dataset.colOffset || '', 10),
        end_col_offset: Number.parseInt(dataset[`${attributePrefix}EndColOffset`] || dataset.endColOffset || '', 10),
    };

    if (!Number.isInteger(span.lineno)) return null;

    if (!Number.isInteger(span.end_lineno)) {
        span.end_lineno = span.lineno;
    }
    if (!Number.isInteger(span.col_offset)) {
        span.col_offset = 0;
    }
    if (!Number.isInteger(span.end_col_offset)) {
        span.end_col_offset = span.col_offset;
    }

    return span;
}

function sourceSpanContainsLine(sourceSpan, sourceLine) {
    if (!sourceSpan || !Number.isInteger(sourceLine)) return false;
    if (!Number.isInteger(sourceSpan.lineno)) return false;
    const endLine = Number.isInteger(sourceSpan.end_lineno) ? sourceSpan.end_lineno : sourceSpan.lineno;
    return sourceLine >= sourceSpan.lineno && sourceLine <= endLine;
}

function getSourceSpanLength(sourceSpan) {
    if (!sourceSpan || !Number.isInteger(sourceSpan.lineno)) return Number.POSITIVE_INFINITY;
    const endLine = Number.isInteger(sourceSpan.end_lineno) ? sourceSpan.end_lineno : sourceSpan.lineno;
    return Math.max(0, endLine - sourceSpan.lineno);
}

function findBestFlowchartCandidateForSourceLine(targetDiv, sourceLine) {
    if (!targetDiv || !Number.isInteger(sourceLine)) return null;

    let bestRowCandidate = null;
    let bestNodeCandidate = null;

    targetDiv.querySelectorAll('g.node[data-node-id]').forEach(nodeGroup => {
        const nodeSpan = extractSourceSpanFromDataset(nodeGroup.dataset);
        if (sourceSpanContainsLine(nodeSpan, sourceLine)) {
            const candidate = {
                nodeGroup,
                nodeId: nodeGroup.dataset.nodeId,
                sourceSpan: nodeSpan,
                rowSourceSpan: null,
                score: getSourceSpanLength(nodeSpan),
            };

            if (!bestNodeCandidate || candidate.score < bestNodeCandidate.score) {
                bestNodeCandidate = candidate;
            }
        }

        const seenRowTargets = new Set();
        nodeGroup.querySelectorAll('[data-source-lineno]').forEach(rowOrCellElement => {
            const rowHighlightTarget = rowOrCellElement.closest('tr') || rowOrCellElement;
            if (!rowHighlightTarget || seenRowTargets.has(rowHighlightTarget)) return;

            seenRowTargets.add(rowHighlightTarget);
            const rowSpan = extractSourceSpanFromDataset(rowHighlightTarget.dataset, 'source');
            if (!sourceSpanContainsLine(rowSpan, sourceLine)) return;

            const candidate = {
                nodeGroup,
                nodeId: nodeGroup.dataset.nodeId,
                sourceSpan: rowSpan,
                rowSourceSpan: rowSpan,
                score: getSourceSpanLength(rowSpan),
            };

            if (!bestRowCandidate || candidate.score < bestRowCandidate.score) {
                bestRowCandidate = candidate;
            }
        });
    });

    return bestRowCandidate || bestNodeCandidate;
}

window.clearFlowchartSelection = function(target = 'flowchart') {
    const targetDiv = getTargetDivElement(target);
    if (!targetDiv) return;
    clearFlowchartNodeSelection(targetDiv);
};

function clearFlowchartRowSelection(targetDiv) {
    if (!targetDiv) return;

    targetDiv.querySelectorAll('g.node.flowchart-node-row-selected').forEach(nodeGroup => {
        nodeGroup.classList.remove('flowchart-node-row-selected');
    });

    targetDiv.querySelectorAll('tr.flowchart-row-selected').forEach(rowElement => {
        rowElement.classList.remove('flowchart-row-selected');
    });

    targetDiv.querySelectorAll('.flowchart-row-selected-cell').forEach(cellElement => {
        cellElement.classList.remove('flowchart-row-selected-cell');
    });

    window.__selectedFlowchartRowSourceSpan = null;
}

function clearFlowchartNodeSelection(targetDiv) {
    if (!targetDiv) return;

    clearFlowchartRowSelection(targetDiv);

    targetDiv.querySelectorAll('g.node.flowchart-node-selected').forEach(nodeGroup => {
        nodeGroup.classList.remove('flowchart-node-selected');
    });

    window.__selectedFlowchartNodeId = null;

    // Éviter une trace visuelle orpheline dans l'éditeur quand le diagramme se désélectionne.
    if (typeof window.clearEditorSourceSelection === 'function') {
        window.clearEditorSourceSelection();
    }
}

function findRowHighlightTarget(nodeGroup, sourceSpan) {
    if (!nodeGroup || !sourceSpan) return null;

    const spanParts = [
        ['source-lineno', sourceSpan.lineno],
        ['source-end-lineno', sourceSpan.end_lineno],
        ['source-col-offset', sourceSpan.col_offset],
        ['source-end-col-offset', sourceSpan.end_col_offset],
    ];

    if (!spanParts.every(([, value]) => Number.isInteger(value))) {
        return null;
    }

    const selector = spanParts
        .map(([attrName, value]) => `[data-${attrName}="${String(value)}"]`)
        .join('');
    const matchedElement = nodeGroup.querySelector(selector);
    if (!matchedElement) {
        return null;
    }

    if (matchedElement.tagName && matchedElement.tagName.toLowerCase() === 'tr') {
        return matchedElement;
    }

    return matchedElement.closest('tr') || matchedElement;
}

function applyFlowchartRowSelection(targetDiv, nodeGroup, rowHighlightTarget, sourceSpan) {
    if (!targetDiv || !nodeGroup || !rowHighlightTarget) return false;

    nodeGroup.classList.add('flowchart-node-row-selected');

    if (rowHighlightTarget.tagName && rowHighlightTarget.tagName.toLowerCase() === 'tr') {
        rowHighlightTarget.classList.add('flowchart-row-selected');
        rowHighlightTarget.querySelectorAll('td, th').forEach(cellElement => {
            cellElement.classList.add('flowchart-row-selected-cell');
        });
    } else {
        rowHighlightTarget.classList.add('flowchart-row-selected-cell');
    }

    window.__selectedFlowchartRowSourceSpan = {
        lineno: sourceSpan.lineno,
        end_lineno: sourceSpan.end_lineno,
        col_offset: sourceSpan.col_offset,
        end_col_offset: sourceSpan.end_col_offset,
    };
    return true;
}

function applyFlowchartNodeSelection(targetDiv, nodeId, rowSourceSpan = null) {
    if (!targetDiv) return;

    clearFlowchartRowSelection(targetDiv);

    targetDiv.querySelectorAll('g.node.flowchart-node-selected').forEach(nodeGroup => {
        nodeGroup.classList.remove('flowchart-node-selected');
    });

    if (!nodeId) {
        clearFlowchartNodeSelection(targetDiv);
        return;
    }

    const selectedNode = targetDiv.querySelector(`g.node[data-node-id="${nodeId}"]`);
    if (!selectedNode) {
        clearFlowchartNodeSelection(targetDiv);
        return;
    }

    const rowHighlightTarget = findRowHighlightTarget(selectedNode, rowSourceSpan);
    const rowSelectionApplied = rowHighlightTarget
        ? applyFlowchartRowSelection(targetDiv, selectedNode, rowHighlightTarget, rowSourceSpan)
        : false;

    if (!rowSelectionApplied) {
        selectedNode.classList.add('flowchart-node-selected');
    }

    window.__selectedFlowchartNodeId = nodeId;
}

window.selectFlowchartElementBySourceLine = function(sourceLine, target = 'flowchart', options = {}) {
    const targetDiv = getTargetDivElement(target);
    if (!targetDiv || !Number.isInteger(sourceLine)) return null;

    const selectionCandidate = findBestFlowchartCandidateForSourceLine(targetDiv, sourceLine);
    if (!selectionCandidate) {
        if (options.clearOnMiss !== false) {
            clearFlowchartNodeSelection(targetDiv);
        }
        return null;
    }

    applyFlowchartNodeSelection(
        targetDiv,
        selectionCandidate.nodeId,
        selectionCandidate.rowSourceSpan
    );

    if (options.syncEditorSelection && typeof window.selectEditorSourceRange === 'function') {
        const translatedSpan = typeof window.translateFlowchartSourceSpanToCurrentEditor === 'function'
            ? window.translateFlowchartSourceSpanToCurrentEditor(selectionCandidate.sourceSpan)
            : selectionCandidate.sourceSpan;
        window.selectEditorSourceRange(translatedSpan);
    }

    return {
        ...selectionCandidate,
        translatedSourceSpan: typeof window.translateFlowchartSourceSpanToCurrentEditor === 'function'
            ? window.translateFlowchartSourceSpanToCurrentEditor(selectionCandidate.sourceSpan)
            : selectionCandidate.sourceSpan,
    };
};

window.selectFlowchartElementByEditorLine = function(editorLine, target = 'flowchart', options = {}) {
    if (!Number.isInteger(editorLine)) return null;

    const sourceLine = typeof window.translateCurrentEditorLineToFlowchartSourceLine === 'function'
        ? window.translateCurrentEditorLineToFlowchartSourceLine(editorLine)
        : null;

    if (!Number.isInteger(sourceLine)) {
        const targetDiv = getTargetDivElement(target);
        if (targetDiv && options.clearOnMiss !== false) {
            clearFlowchartNodeSelection(targetDiv);
        }
        return null;
    }

    return window.selectFlowchartElementBySourceLine(sourceLine, target, options);
};

function normalizeRenderedNodeId(rawId) {
    if (!rawId || typeof rawId !== 'string') return '';

    let normalizedId = rawId;
    if (normalizedId.startsWith('flowchart-')) {
        normalizedId = normalizedId.slice('flowchart-'.length);
    }

    const lastDashIndex = normalizedId.lastIndexOf('-');
    if (lastDashIndex > 0) {
        const suffix = normalizedId.slice(lastDashIndex + 1);
        if (/^\d+$/.test(suffix)) {
            normalizedId = normalizedId.slice(0, lastDashIndex);
        }
    }

    return normalizedId;
}

function resolveRenderedNodeId(nodeGroup, nodeSourceSpansEditor) {
    if (!nodeGroup || !nodeSourceSpansEditor) return null;

    const availableNodeIds = new Set(Object.keys(nodeSourceSpansEditor));
    const candidates = [];
    const rawId = nodeGroup.getAttribute('id');

    if (rawId) {
        candidates.push(rawId);
        candidates.push(normalizeRenderedNodeId(rawId));
    }

    const titleElement = nodeGroup.querySelector('title');
    if (titleElement && titleElement.textContent) {
        candidates.push(titleElement.textContent.trim());
    }

    for (const candidate of candidates) {
        if (candidate && availableNodeIds.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

function annotateFlowchartSvgNodes(targetDiv, svgElement) {
    if (!targetDiv || !svgElement) return;

    const nodeSourceSpansEditor = targetDiv.__nodeSourceSpansEditor || {};
    const nodeGroups = Array.from(svgElement.querySelectorAll('g.node'));

    nodeGroups.forEach(nodeGroup => {
        nodeGroup.classList.remove('flowchart-node-selectable', 'flowchart-node-selected');
        delete nodeGroup.dataset.nodeId;
        delete nodeGroup.dataset.editorLine;
        delete nodeGroup.dataset.editorEndLine;
        delete nodeGroup.dataset.lineno;
        delete nodeGroup.dataset.endLineno;
        delete nodeGroup.dataset.colOffset;
        delete nodeGroup.dataset.endColOffset;

        const nodeId = resolveRenderedNodeId(nodeGroup, nodeSourceSpansEditor);
        if (!nodeId) return;

        const span = nodeSourceSpansEditor[nodeId];
        nodeGroup.classList.add('flowchart-node-selectable');
        nodeGroup.dataset.nodeId = nodeId;

        if (Number.isInteger(span?.editorLine)) {
            nodeGroup.dataset.editorLine = String(span.editorLine);
        }
        if (Number.isInteger(span?.editorEndLine)) {
            nodeGroup.dataset.editorEndLine = String(span.editorEndLine);
        }
        if (Number.isInteger(span?.lineno)) {
            nodeGroup.dataset.lineno = String(span.lineno);
        }
        if (Number.isInteger(span?.end_lineno)) {
            nodeGroup.dataset.endLineno = String(span.end_lineno);
        }
        if (Number.isInteger(span?.col_offset)) {
            nodeGroup.dataset.colOffset = String(span.col_offset);
        }
        if (Number.isInteger(span?.end_col_offset)) {
            nodeGroup.dataset.endColOffset = String(span.end_col_offset);
        }
    });

    if (window.__selectedFlowchartNodeId) {
        applyFlowchartNodeSelection(
            targetDiv,
            window.__selectedFlowchartNodeId,
            window.__selectedFlowchartRowSourceSpan
        );
    }
}

function bindFlowchartSelectionHandlers(targetDiv) {
    if (!targetDiv) return;

    if (typeof targetDiv.__flowchartClickHandler === 'function') {
        targetDiv.removeEventListener('click', targetDiv.__flowchartClickHandler);
    }

    targetDiv.__flowchartClickHandler = function(event) {
        const eventTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
        if (!eventTarget) return;

        const clickedNodeGroup = eventTarget.closest('g.node[data-node-id]');

        if (clickedNodeGroup) {
            const clickedRowElement = eventTarget.closest('[data-source-lineno], [data-source-end-lineno], [data-source-col-offset], [data-source-end-col-offset]');
            const clickedRowIsInsideNode = !!clickedRowElement;

            const sourceSpan = clickedRowIsInsideNode
                ? extractSourceSpanFromDataset(clickedRowElement.dataset, 'source')
                : extractSourceSpanFromDataset(clickedNodeGroup.dataset);

            const translatedSourceSpan = typeof window.translateFlowchartSourceSpanToCurrentEditor === 'function'
                ? window.translateFlowchartSourceSpanToCurrentEditor(sourceSpan)
                : sourceSpan;

            const hasExplicitSourceSpan = [
                translatedSourceSpan?.editorLine,
                translatedSourceSpan?.editorEndLine,
                translatedSourceSpan?.lineno,
                translatedSourceSpan?.end_lineno,
                translatedSourceSpan?.col_offset,
                translatedSourceSpan?.end_col_offset,
            ].some(Number.isInteger);

            applyFlowchartNodeSelection(
                targetDiv,
                clickedNodeGroup.dataset.nodeId,
                clickedRowIsInsideNode ? sourceSpan : null
            );
            if (hasExplicitSourceSpan && typeof window.selectEditorSourceRange === 'function') {
                window.selectEditorSourceRange(translatedSourceSpan);
            } else if (typeof window.clearEditorSourceSelection === 'function') {
                window.clearEditorSourceSelection();
            }
            return;
        }

        if (eventTarget.closest('svg') || eventTarget === targetDiv) {
            clearFlowchartNodeSelection(targetDiv);
        }
    };

    targetDiv.addEventListener('click', targetDiv.__flowchartClickHandler);
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
async function displayFlowchart(mermaidCode, targetDivId, nodeSourceSpansEditor = null) {
    const targetDiv = document.getElementById(targetDivId);
    const zoomControls = document.getElementById('zoom-controls');
    
    if (!targetDiv) return;

    targetDiv.dataset.mermaidSource = mermaidCode || "";
    if (nodeSourceSpansEditor && typeof nodeSourceSpansEditor === 'object') {
        targetDiv.__nodeSourceSpansEditor = nodeSourceSpansEditor;
    } else if (!targetDiv.__nodeSourceSpansEditor) {
        targetDiv.__nodeSourceSpansEditor = {};
    }

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
        targetDiv.__nodeSourceSpansEditor = {};
        clearFlowchartNodeSelection(targetDiv);
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
            annotateFlowchartSvgNodes(targetDiv, svgElement);
            bindFlowchartSelectionHandlers(targetDiv);
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

        if (typeof window.resetFlowchartLineAlignment === 'function') {
            window.resetFlowchartLineAlignment(currentCode);
        }

        // 2. On vérifie que l'objet "results" existe ET qu'il contient bien la propriété "mermaid"
        if (results && results.mermaid) {
            // 3. On passe uniquement la propriété "mermaid" à la fonction d'affichage
            await displayFlowchart(results.mermaid, 'flowchart', results.nodeSourceSpansEditor || {});
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
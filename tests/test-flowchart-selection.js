document.addEventListener('DOMContentLoaded', () => {
    describe('Sélection interactive du logigramme', () => {
        it('Traduit les lignes AST vers CodeMirror après insertion cosmétique', async () => {
            window.resetFlowchartLineAlignment('a = 1\nb = 2\nc = 3');
            window.setFlowchartCurrentEditorCode('\n# commentaire\na = 1\nb = 2\nc = 3');

            const translatedSpan = window.translateFlowchartSourceSpanToCurrentEditor({
                lineno: 2,
                end_lineno: 2,
                col_offset: 0,
                end_col_offset: 5,
            });

            expect(translatedSpan.editorLine).toBe(3);
            expect(translatedSpan.editorEndLine).toBe(3);
            expect(window.translateCurrentEditorLineToFlowchartSourceLine(0)).toBe(null);
            expect(window.translateCurrentEditorLineToFlowchartSourceLine(1)).toBe(null);
            expect(window.translateCurrentEditorLineToFlowchartSourceLine(3)).toBe(2);
        });

        it('Désélectionne aussi le texte quand on clique dans le vide du diagramme', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="1" data-editor-end-line="1" data-lineno="2" data-end-lineno="2" data-col-offset="0" data-end-col-offset="6">
                        <rect width="10" height="10"></rect>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;
            window.resetFlowchartLineAlignment('a = 1\nb = a + 1');
            window.setFlowchartCurrentEditorCode('a = 1\nb = a + 1');

            bindFlowchartSelectionHandlers(targetDiv);

            const nodeRect = targetDiv.querySelector('rect');
            nodeRect.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBeDefined();
            expect(targetDiv.querySelectorAll('g.node.flowchart-node-selected').length).toBe(1);

            const svgElement = targetDiv.querySelector('svg');
            svgElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBe(null);
            expect(targetDiv.querySelectorAll('g.node.flowchart-node-selected').length).toBe(0);

            targetDiv.remove();
        });

        it('N applique aucun fallback éditeur pour un noeud sans span source', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="1" data-editor-end-line="1" data-lineno="2" data-end-lineno="2" data-col-offset="0" data-end-col-offset="6">
                        <rect class="with-span" width="10" height="10"></rect>
                    </g>
                    <g class="node" data-node-id="node03">
                        <rect class="without-span" width="10" height="10"></rect>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;
            window.resetFlowchartLineAlignment('a = 1\nb = 2\nc = 3');
            window.setFlowchartCurrentEditorCode('a = 1\nb = 2\nc = 3');

            bindFlowchartSelectionHandlers(targetDiv);

            targetDiv.querySelector('rect.with-span').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(currentEditorSelection).toBeDefined();

            targetDiv.querySelector('rect.without-span').dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBe(null);
            expect(targetDiv.querySelectorAll('g.node.flowchart-node-selected').length).toBe(1);
            expect(targetDiv.querySelector('g.node.flowchart-node-selected').dataset.nodeId).toBe('node03');

            targetDiv.remove();
        });

        it('Sélectionne uniquement la ligne cliquée dans un bloc fusionné', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="0" data-editor-end-line="2" data-lineno="1" data-end-lineno="3" data-col-offset="0" data-end-col-offset="22">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="24">
                                            <td>a</td><td>←</td><td>1</td>
                                        </tr>
                                        <tr data-source-lineno="2" data-source-end-lineno="2" data-source-col-offset="0" data-source-end-col-offset="28">
                                            <td class="clicked-row" data-source-lineno="2" data-source-end-lineno="2" data-source-col-offset="0" data-source-end-col-offset="28">b</td><td>←</td><td>a + 1</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;

            bindFlowchartSelectionHandlers(targetDiv);

            targetDiv.querySelector('.clicked-row').dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBeDefined();
            expect(currentEditorSelection.lineno).toBe(2);
            expect(currentEditorSelection.end_lineno).toBe(2);
            expect(currentEditorSelection.col_offset).toBe(0);
            expect(currentEditorSelection.end_col_offset).toBe(28);
            expect(currentEditorSelection.editorLine).toBe(1);
            expect(currentEditorSelection.editorEndLine).toBe(1);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected').dataset.nodeId).toBe('node02');
            expect(targetDiv.querySelector('g.node.flowchart-node-selected')).toBe(null);
            expect(targetDiv.querySelector('tr.flowchart-row-selected') === null).toBe(false);
            expect(targetDiv.querySelectorAll('.flowchart-row-selected-cell').length).toBe(3);

            targetDiv.remove();
        });

        it('Sélectionne uniquement la ligne cliquée dans un bloc compact empilé', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="0" data-editor-end-line="2" data-lineno="1" data-end-lineno="3" data-col-offset="0" data-end-col-offset="22">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="24">
                                            <td colspan="3">a ← 1</td>
                                        </tr>
                                        <tr data-source-lineno="3" data-source-end-lineno="3" data-source-col-offset="0" data-source-end-col-offset="16">
                                            <td class="clicked-stacked-row" colspan="3" data-source-lineno="3" data-source-end-lineno="3" data-source-col-offset="0" data-source-end-col-offset="16">c ← 3</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;

            bindFlowchartSelectionHandlers(targetDiv);

            targetDiv.querySelector('.clicked-stacked-row').dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBeDefined();
            expect(currentEditorSelection.lineno).toBe(3);
            expect(currentEditorSelection.end_lineno).toBe(3);
            expect(currentEditorSelection.editorLine).toBe(2);
            expect(currentEditorSelection.editorEndLine).toBe(2);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected').dataset.nodeId).toBe('node02');
            expect(targetDiv.querySelector('g.node.flowchart-node-selected')).toBe(null);
            expect(targetDiv.querySelector('td.flowchart-row-selected-cell') === null).toBe(false);

            targetDiv.querySelector('svg').dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected')).toBe(null);
            expect(targetDiv.querySelector('.flowchart-row-selected-cell')).toBe(null);

            targetDiv.remove();
        });

        it('Recentre visuellement une affectation compacte sans casser la sélection de ligne', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="0" data-editor-end-line="0" data-lineno="1" data-end-lineno="1" data-col-offset="0" data-end-col-offset="14">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="14">
                                            <td class="compact-cell" colspan="3" data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="14">prefix ← value</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            const svgElement = targetDiv.querySelector('svg');
            const normalizedCount = normalizeCompactAssignmentBlockLabels(svgElement);
            const compactCell = targetDiv.querySelector('.compact-cell');

            expect(normalizedCount).toBe(1);
            expect(targetDiv.querySelectorAll('td').length).toBe(1);
            expect(compactCell.dataset.compactAssignmentNormalized).toBe('true');
            expect(targetDiv.querySelector('.flowchart-assignment-layout')).toBeDefined();
            expect(targetDiv.querySelector('.flowchart-assignment-part-target').textContent).toBe('prefix');
            expect(targetDiv.querySelector('.flowchart-assignment-part-operator').textContent).toBe('←');
            expect(targetDiv.querySelector('.flowchart-assignment-part-value').textContent).toBe('value');

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;

            bindFlowchartSelectionHandlers(targetDiv);

            targetDiv.querySelector('.flowchart-assignment-part-operator').dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBeDefined();
            expect(currentEditorSelection.lineno).toBe(1);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected').dataset.nodeId).toBe('node02');
            expect(targetDiv.querySelectorAll('.flowchart-row-selected-cell').length).toBe(1);

            targetDiv.remove();
        });

        it('Aligne verticalement les flèches d un bloc compact selon la variable la plus longue', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node04" data-editor-line="0" data-editor-end-line="2" data-lineno="1" data-end-lineno="3" data-col-offset="0" data-end-col-offset="24">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="10">
                                            <td colspan="3" data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="10">x ← 5</td>
                                        </tr>
                                        <tr data-source-lineno="2" data-source-end-lineno="2" data-source-col-offset="0" data-source-end-col-offset="16">
                                            <td colspan="3" data-source-lineno="2" data-source-end-lineno="2" data-source-col-offset="0" data-source-end-col-offset="16">long_name ← 10</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            const normalizedCount = normalizeCompactAssignmentBlockLabels(targetDiv.querySelector('svg'));
            const layouts = Array.from(targetDiv.querySelectorAll('.flowchart-assignment-layout'));

            expect(normalizedCount).toBe(2);
            expect(layouts.length).toBe(2);
            // Les deux lignes du bloc partagent la même colonne gauche (alignement vertical des flèches)
            expect(layouts[0].style.gridTemplateColumns).toBe(layouts[1].style.gridTemplateColumns);
            // La colonne gauche est exprimée en ch, calibrée sur la variable la plus longue du bloc
            const leftCol = layouts[0].style.gridTemplateColumns.split(' ')[0];
            expect(leftCol.endsWith('ch')).toBe(true);
            // La colonne gauche doit être plus large que celle qu'on aurait calculée pour 'x' seul
            const leftColValue = parseFloat(leftCol);
            expect(leftColValue).toBeGreaterThan(1);

            targetDiv.remove();
        });

        it('Conserve le rendu compact original pour une valeur vraiment trop longue', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node03" data-editor-line="0" data-editor-end-line="0" data-lineno="1" data-end-lineno="1" data-col-offset="0" data-end-col-offset="29">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="29">
                                            <td class="compact-list-cell" colspan="3" data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="29">values ← [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500]</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            const svgElement = targetDiv.querySelector('svg');
            const normalizedCount = normalizeCompactAssignmentBlockLabels(svgElement);
            const compactCell = targetDiv.querySelector('.compact-list-cell');

            expect(normalizedCount).toBe(0);
            expect(compactCell.dataset.compactAssignmentNormalized).toBe(undefined);
            expect(compactCell.textContent.includes('[100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500]')).toBe(true);
            expect(targetDiv.querySelector('.flowchart-assignment-layout')).toBe(null);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;

            bindFlowchartSelectionHandlers(targetDiv);
            compactCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(currentEditorSelection).toBeDefined();
            expect(currentEditorSelection.lineno).toBe(1);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected').dataset.nodeId).toBe('node03');
            expect(targetDiv.querySelectorAll('.flowchart-row-selected-cell').length).toBe(1);

            targetDiv.remove();
        });

        it('Sélectionne la bonne ligne du logigramme depuis une ligne CodeMirror décalée', async () => {
            const targetDiv = document.createElement('div');
            targetDiv.innerHTML = `
                <svg>
                    <g class="node" data-node-id="node02" data-editor-line="0" data-editor-end-line="2" data-lineno="1" data-end-lineno="3" data-col-offset="0" data-end-col-offset="22">
                        <foreignObject>
                            <div xmlns="http://www.w3.org/1999/xhtml">
                                <table>
                                    <tbody>
                                        <tr data-source-lineno="1" data-source-end-lineno="1" data-source-col-offset="0" data-source-end-col-offset="5">
                                            <td colspan="3">a = 1</td>
                                        </tr>
                                        <tr data-source-lineno="2" data-source-end-lineno="2" data-source-col-offset="0" data-source-end-col-offset="5">
                                            <td colspan="3">b = 2</td>
                                        </tr>
                                        <tr data-source-lineno="3" data-source-end-lineno="3" data-source-col-offset="0" data-source-end-col-offset="5">
                                            <td colspan="3">c = 3</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </foreignObject>
                    </g>
                </svg>
            `;
            document.body.appendChild(targetDiv);

            let currentEditorSelection = null;
            window.selectEditorSourceRange = function(sourceSpan) {
                currentEditorSelection = sourceSpan;
            };
            window.clearEditorSourceSelection = function() {
                currentEditorSelection = null;
            };
            window.__selectedFlowchartNodeId = null;

            window.resetFlowchartLineAlignment('a = 1\nb = 2\nc = 3');
            window.setFlowchartCurrentEditorCode('\n# commentaire\na = 1\nb = 2\nc = 3');

            const selectionResult = window.selectFlowchartElementByEditorLine(3, targetDiv, { syncEditorSelection: true });

            expect(selectionResult).toBeDefined();
            expect(selectionResult.sourceSpan.lineno).toBe(2);
            expect(currentEditorSelection.editorLine).toBe(3);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected').dataset.nodeId).toBe('node02');
            expect(targetDiv.querySelectorAll('.flowchart-row-selected-cell').length).toBe(1);

            const missResult = window.selectFlowchartElementByEditorLine(1, targetDiv, { syncEditorSelection: true });

            expect(missResult).toBe(null);
            expect(targetDiv.querySelector('g.node.flowchart-node-row-selected')).toBe(null);

            targetDiv.remove();
        });
    });
});
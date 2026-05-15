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
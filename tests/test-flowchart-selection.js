document.addEventListener('DOMContentLoaded', () => {
    describe('Sélection interactive du logigramme', () => {
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
            expect(targetDiv.querySelector('g.node.flowchart-node-selected').dataset.nodeId).toBe('node02');

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
            expect(targetDiv.querySelector('g.node.flowchart-node-selected').dataset.nodeId).toBe('node02');

            targetDiv.remove();
        });
    });
});
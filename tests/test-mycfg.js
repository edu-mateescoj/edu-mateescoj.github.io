document.addEventListener('DOMContentLoaded', () => {
    let cfgSnapshotQueue = Promise.resolve();

    function buildCfgSnapshot(code, renderConfig = {}) {
        const runSnapshot = async () => {
            await initPyodideAndLoadScript();

            pyodide.globals.set('cfg_test_code', code);
            pyodide.globals.set('cfg_render_config_json', JSON.stringify(renderConfig || {}));
            const snapshotJson = await pyodide.runPythonAsync(`
import json
from MyCFG import ControlFlowGraph

cfg = ControlFlowGraph(cfg_test_code, render_config=json.loads(cfg_render_config_json))
cfg.process_and_get_results()

json.dumps({
    "edges": sorted(list(cfg.edges)),
    "node_labels": cfg.node_labels,
    "node_render_payloads": cfg.node_render_payloads,
    "node_types": cfg.node_types,
    "node_source_spans": cfg.node_source_spans,
})
            `);

            return JSON.parse(snapshotJson);
        };

        const result = cfgSnapshotQueue.then(runSnapshot);
        cfgSnapshotQueue = result.catch(() => {});
        return result;
    }

    function findNodeIdByLabelFragment(snapshot, labelFragment) {
        const entry = Object.entries(snapshot.node_labels).find(([, nodeLabel]) => nodeLabel.includes(labelFragment));

        if (!entry) {
            throw new Error(`Noeud introuvable pour le fragment: ${labelFragment}`);
        }

        return entry[0];
    }

    function getOutgoingEdges(snapshot, nodeId) {
        return snapshot.edges.filter(([fromNode]) => fromNode === nodeId);
    }

    function getNodeLabelsByType(snapshot, nodeType) {
        return Object.entries(snapshot.node_labels)
            .filter(([nodeId]) => snapshot.node_types[nodeId] === nodeType)
            .map(([, nodeLabel]) => nodeLabel);
    }

    function getNodeSourceSpan(snapshot, nodeId) {
        return snapshot.node_source_spans[nodeId] || null;
    }

    function getNodeRenderPayload(snapshot, nodeId) {
        return snapshot.node_render_payloads[nodeId] || null;
    }

    describe('CFG MyCFG', () => {
        it('Relie break d\'un for a la sortie de boucle', async () => {
            const snapshot = await buildCfgSnapshot('for x in [1, 2]:\n    break\nprint("done")');
            const breakNodeId = findNodeIdByLabelFragment(snapshot, 'Break');
            const afterNodeId = findNodeIdByLabelFragment(snapshot, 'done');
            const breakEdges = getOutgoingEdges(snapshot, breakNodeId).filter(([, , label]) => label === 'break');

            expect(breakEdges.length).toBe(1);

            const breakTargetId = breakEdges[0][1];
            expect(snapshot.node_types[breakTargetId]).toBe('Junction');
            expect(getOutgoingEdges(snapshot, breakTargetId).some(([, toNode]) => toNode === afterNodeId)).toBe(true);
        });

        it('Relie break d\'un while a la sortie de boucle', async () => {
            const snapshot = await buildCfgSnapshot('while True:\n    break\nprint("after")');
            const breakNodeId = findNodeIdByLabelFragment(snapshot, 'Break');
            const afterNodeId = findNodeIdByLabelFragment(snapshot, 'after');
            const breakEdges = getOutgoingEdges(snapshot, breakNodeId).filter(([, , label]) => label === 'break');

            expect(breakEdges.length).toBe(1);

            const breakTargetId = breakEdges[0][1];
            expect(snapshot.node_types[breakTargetId]).toBe('Junction');
            expect(getOutgoingEdges(snapshot, breakTargetId).some(([, toNode]) => toNode === afterNodeId)).toBe(true);
        });

        it('Prend le else d\'un while si la condition est fausse dès le départ', async () => {
            const snapshot = await buildCfgSnapshot(
                'while False:\n    print("body")\nelse:\n    print("no body")\nprint("after")'
            );
            const whileDecisionId = findNodeIdByLabelFragment(snapshot, 'False');
            const elseNodeId = findNodeIdByLabelFragment(snapshot, 'no body');
            const afterNodeId = findNodeIdByLabelFragment(snapshot, 'after');
            const nonEdges = getOutgoingEdges(snapshot, whileDecisionId).filter(([, , label]) => label === 'Non');

            expect(nonEdges.length).toBe(1);
            expect(nonEdges[0][1]).toBe(elseNodeId);

            const elseOutgoingEdges = getOutgoingEdges(snapshot, elseNodeId);
            expect(elseOutgoingEdges.length).toBe(1);

            const loopExitId = elseOutgoingEdges[0][1];
            expect(snapshot.node_types[loopExitId]).toBe('Junction');
            expect(getOutgoingEdges(snapshot, loopExitId).some(([, toNode]) => toNode === afterNodeId)).toBe(true);
        });

        it('Relie continue d\'un while au re-test de la condition', async () => {
            const snapshot = await buildCfgSnapshot('while x > 0:\n    continue\nprint("after")');
            const whileDecisionId = findNodeIdByLabelFragment(snapshot, 'x > 0');
            const continueNodeId = findNodeIdByLabelFragment(snapshot, 'Continue');
            const continueEdges = getOutgoingEdges(snapshot, continueNodeId);

            expect(continueEdges.length).toBe(1);
            expect(continueEdges[0][1]).toBe(whileDecisionId);
        });

        it('Découpe un while booléen sur la conjonction finale', async () => {
            const snapshot = await buildCfgSnapshot(
                'while ((count > 0) or has_value) and z > 0:\n    count -= 1\nprint("after")'
            );
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');

            expect(
                decisionLabels.some(label => label.includes('(count > 0 or has_value)\nand z > 0'))
            ).toBe(true);
        });

        it('Découpe aussi un if booléen sur la conjonction finale quand le label devient trop large', async () => {
            const snapshot = await buildCfgSnapshot(
                'if ((count > 0) or has_value) and z > 0:\n    print("ok")'
            );
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');

            expect(
                decisionLabels.some(label => label.includes('(count > 0 or has_value)\nand z > 0'))
            ).toBe(true);
        });

        it('Découpe une comparaison d appartenance longue sur le membre droit', async () => {
            const snapshot = await buildCfgSnapshot(
                'if item in [5, -3, 4, 4, 1]:\n    print(item)'
            );
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');

            expect(
                decisionLabels.some(label => label.includes('item in\n[5, -3, 4, 4, 1]'))
            ).toBe(true);
        });

        it('Fait contourner else a un break de for', async () => {
            const snapshot = await buildCfgSnapshot(
                'for x in [1, 2]:\n    break\nelse:\n    print("no break")\nprint("after")'
            );
            const breakNodeId = findNodeIdByLabelFragment(snapshot, 'Break');
            const elseNodeId = findNodeIdByLabelFragment(snapshot, 'no break');
            const afterNodeId = findNodeIdByLabelFragment(snapshot, 'after');
            const breakEdges = getOutgoingEdges(snapshot, breakNodeId).filter(([, , label]) => label === 'break');

            expect(breakEdges.length).toBe(1);

            const breakTargetId = breakEdges[0][1];
            const outgoingTargets = getOutgoingEdges(snapshot, breakTargetId).map(([, toNode]) => toNode);

            expect(outgoingTargets.includes(afterNodeId)).toBe(true);
            expect(outgoingTargets.includes(elseNodeId)).toBe(false);
        });

        it('Relie continue d\'un for au contrôle de boucle', async () => {
            const snapshot = await buildCfgSnapshot('for x in [1, 2]:\n    continue\nprint("after")');
            const forDecisionId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const continueNodeId = findNodeIdByLabelFragment(snapshot, 'Continue');
            const continueEdges = getOutgoingEdges(snapshot, continueNodeId);

            expect(continueEdges.length).toBe(1);
            expect(continueEdges[0][1]).toBe(forDecisionId);
        });

        it('Affiche un littéral de liste homogène sans le marquer mixte', async () => {
            const snapshot = await buildCfgSnapshot('for item in [1, 2, 3]:\n    print(item)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const decisionPayload = getNodeRenderPayload(snapshot, decisionNodeId);

            expect(decisionLabels.some(label => label.includes('[1, 2, 3]'))).toBe(true);
            expect(decisionLabels.some(label => label.includes('nombre'))).toBe(false);
            expect(decisionLabels.some(label => label.includes('élément mixte'))).toBe(false);
            expect(decisionPayload.inferred_element_type).toBe('nombre');
        });

        it('Reconnaît une liste littérale homogène avec entier négatif', async () => {
            const snapshot = await buildCfgSnapshot('for item in [5, -3, 4, 4, 1]:\n    print(item)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const decisionPayload = getNodeRenderPayload(snapshot, decisionNodeId);

            expect(decisionLabels.some(label => label.includes('[5, -3, 4, 4, 1]'))).toBe(true);
            expect(decisionLabels.some(label => label.includes('nombre'))).toBe(false);
            expect(decisionLabels.some(label => label.includes('élément mixte'))).toBe(false);
            expect(decisionPayload.inferred_element_type).toBe('nombre');
        });

        it('Affiche une variable de liste sans quotes ni préfixe verbeux', async () => {
            const snapshot = await buildCfgSnapshot('values = [1, 2, 3]\nfor item in values:\n    print(item)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');

            expect(decisionLabels.some(label => label.includes('values'))).toBe(true);
            expect(decisionLabels.some(label => label.includes("'values'"))).toBe(false);
            expect(decisionLabels.some(label => label.includes('variable (liste)'))).toBe(false);
        });

        it('Conserve le type nombre pour une variable de liste contenant un entier négatif', async () => {
            const snapshot = await buildCfgSnapshot('values = [5, -3, 4, 4, 1]\nfor item in values:\n    print(item)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const decisionPayload = getNodeRenderPayload(snapshot, decisionNodeId);

            expect(decisionLabels.some(label => label.includes('values'))).toBe(true);
            expect(decisionLabels.some(label => label.includes('nombre'))).toBe(false);
            expect(decisionLabels.some(label => label.includes('élément mixte'))).toBe(false);
            expect(decisionPayload.inferred_element_type).toBe('nombre');
        });

        it('Affiche une variable issue d\'un appel sans rappeler sa provenance', async () => {
            const snapshot = await buildCfgSnapshot('values = compute()\nfor item in values:\n    print(item)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');

            expect(decisionLabels.some(label => label.includes('values'))).toBe(true);
            expect(decisionLabels.some(label => label.includes('résultat d\'appel de fonction'))).toBe(false);
            expect(decisionLabels.some(label => label.includes('contenu:'))).toBe(false);
        });

        it('Peut expliciter un nombre suivant dans le modèle hasnext unique', async () => {
            const snapshot = await buildCfgSnapshot('for item in [3, -1, -3, 3]:\n    print(item)', {
                element_type_visibility: 'show'
            });

            expect(findNodeIdByLabelFragment(snapshot, 'Encore un nombre à parcourir')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'nombre suivant')).toBeDefined();
        });

        it('Affiche un littéral chaîne avec sa syntaxe Python', async () => {
            const snapshot = await buildCfgSnapshot('for ch in "abc":\n    print(ch)');
            const decisionLabels = getNodeLabelsByType(snapshot, 'Decision');
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const decisionPayload = getNodeRenderPayload(snapshot, decisionNodeId);

            expect(decisionLabels.some(label => label.includes("'abc'"))).toBe(true);
            expect(decisionLabels.some(label => label.includes('la variable'))).toBe(false);
            expect(decisionLabels.some(label => label.includes('contenu:'))).toBe(false);
            expect(decisionPayload.inferred_element_type).toBe('caractère');
        });

        it('Prend le else d\'un for vide sur la branche Non initiale', async () => {
            const snapshot = await buildCfgSnapshot(
                'for x in []:\n    print(x)\nelse:\n    print("empty")\nprint("after")'
            );
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'Encore un élément à parcourir');
            const elseNodeId = findNodeIdByLabelFragment(snapshot, 'empty');
            const afterNodeId = findNodeIdByLabelFragment(snapshot, 'after');
            const nonEdges = getOutgoingEdges(snapshot, decisionNodeId).filter(([, , label]) => label === 'Non');

            expect(nonEdges.length).toBe(1);
            expect(nonEdges[0][1]).toBe(elseNodeId);

            const elseOutgoingEdges = getOutgoingEdges(snapshot, elseNodeId);
            expect(elseOutgoingEdges.length).toBe(1);

            const loopExitId = elseOutgoingEdges[0][1];
            expect(snapshot.node_types[loopExitId]).toBe('Junction');
            expect(getOutgoingEdges(snapshot, loopExitId).some(([, toNode]) => toNode === afterNodeId)).toBe(true);
        });

        it('Fusionne des affectations simples consécutives dans un seul rectangle', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\ny = 2\nz = 3\nprint(z)');
            const mergedEntry = Object.entries(snapshot.node_labels).find(([, nodeLabel]) =>
                nodeLabel === 'x ← 1\ny ← 2\nz ← 3'
            );

            expect(mergedEntry).toBeDefined();
            expect(snapshot.node_types[mergedEntry[0]]).toBe('AssignmentBlock');
            expect(
                Object.values(snapshot.node_labels).filter(nodeLabel => nodeLabel.includes('←')).length
            ).toBe(1);

            const mergedNodeId = mergedEntry[0];
            const printNodeId = findNodeIdByLabelFragment(snapshot, 'print(z)');
            expect(getOutgoingEdges(snapshot, mergedNodeId).some(([, toNode]) => toNode === printNodeId)).toBe(true);
        });

        it('Fusionne aussi les affectations augmentées dans le bloc unifié', async () => {
            const snapshot = await buildCfgSnapshot('count = 3\ncount += 1\ncount -= 2\nprint(count)');
            const mergedEntry = Object.entries(snapshot.node_labels).find(([, nodeLabel]) =>
                nodeLabel === 'count ← 3\ncount += 1\ncount -= 2'
            );

            expect(mergedEntry).toBeDefined();
            expect(snapshot.node_types[mergedEntry[0]]).toBe('AssignmentBlock');
            expect(
                Object.values(snapshot.node_labels).some(nodeLabel => nodeLabel === 'count += 1')
            ).toBe(false);
            expect(
                Object.values(snapshot.node_labels).some(nodeLabel => nodeLabel === 'count -= 2')
            ).toBe(false);
        });

        it('Expose des plages source AST pour les noeuds du CFG', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\ny = 2\nwhile x > 0:\n    x -= 1');
            const assignBlockNodeId = findNodeIdByLabelFragment(snapshot, 'x ← 1\ny ← 2');
            const whileNodeId = findNodeIdByLabelFragment(snapshot, 'x > 0');
            const assignBlockSpan = getNodeSourceSpan(snapshot, assignBlockNodeId);
            const whileSpan = getNodeSourceSpan(snapshot, whileNodeId);

            expect(assignBlockSpan).toBeDefined();
            expect(assignBlockSpan.lineno).toBe(1);
            expect(assignBlockSpan.end_lineno).toBe(2);
            expect(whileSpan).toBeDefined();
            expect(whileSpan.lineno).toBe(3);
        });

        it('Ancre la décision if sur node.test uniquement', async () => {
            const snapshot = await buildCfgSnapshot('if x > 0:\n    print(x)');
            const ifNodeId = findNodeIdByLabelFragment(snapshot, 'x > 0');
            const ifSpan = getNodeSourceSpan(snapshot, ifNodeId);

            expect(ifSpan).toBeDefined();
            expect(ifSpan.lineno).toBe(1);
            expect(ifSpan.end_lineno).toBe(1);
            expect(ifSpan.col_offset).toBe(3);
            expect(ifSpan.end_col_offset).toBe(8);
        });

        it('Ancre la décision while sur node.test uniquement', async () => {
            const snapshot = await buildCfgSnapshot('while x > 0:\n    x -= 1');
            const whileNodeId = findNodeIdByLabelFragment(snapshot, 'x > 0');
            const whileSpan = getNodeSourceSpan(snapshot, whileNodeId);

            expect(whileSpan).toBeDefined();
            expect(whileSpan.lineno).toBe(1);
            expect(whileSpan.end_lineno).toBe(1);
            expect(whileSpan.col_offset).toBe(6);
            expect(whileSpan.end_col_offset).toBe(11);
        });

        it('Ancre les noeuds de contrôle du for sur la seule ligne d’en-tête', async () => {
            const snapshot = await buildCfgSnapshot('for item in values:\n    print(item)');
            const forControlFragments = [
                'Encore un élément à parcourir',
                'élément suivant'
            ];

            forControlFragments.forEach(labelFragment => {
                const nodeId = findNodeIdByLabelFragment(snapshot, labelFragment);
                const span = getNodeSourceSpan(snapshot, nodeId);

                expect(span).toBeDefined();
                expect(span.lineno).toBe(1);
                expect(span.end_lineno).toBe(1);
                expect(span.col_offset).toBe(0);
                expect(span.end_col_offset).toBe(19);
            });
        });

        it('Ancre Start fonction sur la ligne def et laisse End fonction sans span source', async () => {
            const snapshot = await buildCfgSnapshot('def fetch(config):\n    return config');
            const startNodeId = findNodeIdByLabelFragment(snapshot, 'Start fetch');
            const endNodeId = findNodeIdByLabelFragment(snapshot, 'End fetch');
            const startSpan = getNodeSourceSpan(snapshot, startNodeId);
            const endSpan = getNodeSourceSpan(snapshot, endNodeId);

            expect(startSpan).toBeDefined();
            expect(startSpan.lineno).toBe(1);
            expect(startSpan.end_lineno).toBe(1);
            expect(startSpan.col_offset).toBe(0);
            expect(startSpan.end_col_offset).toBe(18);
            expect(endSpan).toBe(null);
        });

        it('Ne fusionne pas des affectations top-level séparées par un def', async () => {
            const snapshot = await buildCfgSnapshot(
                'a = 1\ndef fetch(config):\n    return config\nb = 2\nprint(b)'
            );
            const assignmentBlockLabels = getNodeLabelsByType(snapshot, 'AssignmentBlock');

            expect(assignmentBlockLabels.includes('a ← 1\nb ← 2')).toBe(false);
            expect(findNodeIdByLabelFragment(snapshot, 'a ← 1')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'b ← 2')).toBeDefined();
        });

        it('Garde l\'annotation source d\'une affectation annotée par défaut', async () => {
            const snapshot = await buildCfgSnapshot('a: int = 2');

            expect(findNodeIdByLabelFragment(snapshot, 'a : int ← 2')).toBeDefined();
        });

        it('Peut masquer l\'annotation source', async () => {
            const snapshot = await buildCfgSnapshot('a: int = 2', {
                source_annotation_visibility: 'hide'
            });
            const nodeId = findNodeIdByLabelFragment(snapshot, 'a ← 2');

            expect(snapshot.node_labels[nodeId].includes(': int')).toBe(false);
        });

        it('Peut ajouter une annotation inférée sur une variable non annotée', async () => {
            const snapshot = await buildCfgSnapshot('a = 3', {
                missing_annotation_policy: 'infer'
            });

            expect(findNodeIdByLabelFragment(snapshot, 'a : int ← 3')).toBeDefined();
        });

        it('Peut corriger visuellement une annotation incohérente', async () => {
            const snapshot = await buildCfgSnapshot('a: int = "Bonjour"', {
                conflicting_annotation_policy: 'use_inferred'
            });
            const nodeId = findNodeIdByLabelFragment(snapshot, 'a : str');

            expect(snapshot.node_labels[nodeId].includes('Bonjour')).toBe(true);
            expect(snapshot.node_labels[nodeId].includes(': int')).toBe(false);
        });

        it('Peut séparer des affectations contiguës en rectangles distincts', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\ny = 2\nz = 3', {
                assignment_grouping_mode: 'separate_nodes'
            });
            const assignmentBlockLabels = getNodeLabelsByType(snapshot, 'AssignmentBlock');

            expect(assignmentBlockLabels.length).toBe(0);
            expect(findNodeIdByLabelFragment(snapshot, 'x ← 1')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'y ← 2')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'z ← 3')).toBeDefined();
        });

        it('Peut inclure des expressions contiguës dans un bloc fusionné', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\nprint(x)\ny = 2', {
                assignment_grouping_mode: 'merged_block',
                expression_grouping_policy: 'include_in_blocks'
            });
            const mergedEntry = Object.entries(snapshot.node_labels).find(([, nodeLabel]) =>
                nodeLabel === 'x ← 1\nprint(x)\ny ← 2'
            );

            expect(mergedEntry).toBeDefined();
            expect(snapshot.node_types[mergedEntry[0]]).toBe('AssignmentBlock');
        });

        it('Peut traduire l\'affectation simple avec le signe égal', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\ny = 2', {
                assignment_operator_mode: 'equals',
                assignment_grouping_mode: 'merged_block'
            });
            const assignmentBlockEntry = Object.entries(snapshot.node_types)
                .find(([, nodeType]) => nodeType === 'AssignmentBlock');
            const assignmentBlockLabel = assignmentBlockEntry
                ? snapshot.node_labels[assignmentBlockEntry[0]]
                : '';

            expect(assignmentBlockEntry).toBeDefined();
            expect(assignmentBlockLabel.includes('x = 1')).toBe(true);
            expect(assignmentBlockLabel.includes('y = 2')).toBe(true);
            expect(assignmentBlockLabel.includes('←')).toBe(false);
        });

        it('Expose le mode compact empilé dans le payload du bloc', async () => {
            const snapshot = await buildCfgSnapshot('x = 1\ny = 2', {
                assignment_grouping_mode: 'stacked_compact'
            });
            const assignmentBlockEntry = Object.entries(snapshot.node_types)
                .find(([, nodeType]) => nodeType === 'AssignmentBlock');
            const blockPayload = getNodeRenderPayload(snapshot, assignmentBlockEntry[0]);

            expect(blockPayload.layout_mode).toBe('stacked_compact');
        });

        it('Peut rendre les conditions avec un lexique français et des comparateurs mathématiques', async () => {
            const snapshot = await buildCfgSnapshot('if a <= b and x != y:\n    print(a)', {
                boolean_lexicon: 'fr_lower',
                comparison_glyph_mode: 'math'
            });
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'a ≤ b et x ≠ y');

            expect(snapshot.node_labels[decisionNodeId]).toContain('a ≤ b et x ≠ y');
        });

        it('Applique aussi les comparateurs mathématiques dans les affectations', async () => {
            const snapshot = await buildCfgSnapshot(
                'var1 = 5\nvar2 = 3\ncond1 = var1 <= var2\ncond2 = var1 == var2\ncond3 = var1 != var2',
                {
                    assignment_operator_mode: 'equals',
                    assignment_grouping_mode: 'merged_block',
                    comparison_glyph_mode: 'math'
                }
            );
            const assignmentBlockEntry = Object.entries(snapshot.node_types)
                .find(([, nodeType]) => nodeType === 'AssignmentBlock');
            const assignmentBlockLabel = assignmentBlockEntry
                ? snapshot.node_labels[assignmentBlockEntry[0]]
                : '';

            expect(assignmentBlockEntry).toBeDefined();
            expect(assignmentBlockLabel).toContain('cond1 = var1 ≤ var2');
            expect(assignmentBlockLabel).toContain('cond2 = var1 == var2');
            expect(assignmentBlockLabel).toContain('cond3 = var1 ≠ var2');
        });

        it('Peut rendre l\'égalité et l\'appartenance selon les choix sélectionnés', async () => {
            const snapshot = await buildCfgSnapshot('if x == y and elt in xs:\n    print(x)', {
                boolean_lexicon: 'c_style',
                equality_mode: 'single_equals',
                membership_mode: 'french_dans'
            });
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'x = y && elt dans xs');

            expect(snapshot.node_labels[decisionNodeId]).toContain('x = y && elt dans xs');
        });

        it('Conserve == quand l\'affectation est elle-même rendue avec le signe égal', async () => {
            const snapshot = await buildCfgSnapshot('cond = x == y', {
                assignment_operator_mode: 'equals',
                assignment_grouping_mode: 'merged_block',
                equality_mode: 'single_equals'
            });
            const assignmentBlockNodeId = findNodeIdByLabelFragment(snapshot, 'cond = x == y');

            expect(snapshot.node_labels[assignmentBlockNodeId]).toContain('cond = x == y');
            expect(snapshot.node_labels[assignmentBlockNodeId].includes('cond = x = y')).toBe(false);
        });

        it('Traduit l\'égalité en = par défaut quand l\'affectation utilise la flèche', async () => {
            const snapshot = await buildCfgSnapshot('if x == y:\n    print(x)');
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'x = y');

            expect(snapshot.node_labels[decisionNodeId]).toContain('x = y');
        });

        it('Peut réactiver le modèle for avec premier et suivant', async () => {
            const snapshot = await buildCfgSnapshot('for ch in "abc":\n    print(ch)', {
                for_loop_model: 'empty_then_next',
                element_type_visibility: 'show'
            });

            expect(findNodeIdByLabelFragment(snapshot, 'Au moins un caractère à parcourir')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'premier caractère')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'Encore un caractère à parcourir')).toBeDefined();
            expect(findNodeIdByLabelFragment(snapshot, 'caractère suivant')).toBeDefined();
        });

        it('Peut activer un modèle for intermédiaire avec affectation unique', async () => {
            const snapshot = await buildCfgSnapshot('for ch in "abc":\n    print(ch)', {
                for_loop_model: 'empty_then_shared_next',
                element_type_visibility: 'show'
            });
            const entryDecisionId = findNodeIdByLabelFragment(snapshot, 'Au moins un caractère à parcourir');
            const repeatDecisionId = findNodeIdByLabelFragment(snapshot, 'Encore un caractère à parcourir');
            const assignmentNodeId = findNodeIdByLabelFragment(snapshot, 'caractère suivant');
            const assignmentLabels = Object.values(snapshot.node_labels).filter(nodeLabel => nodeLabel.includes('caractère suivant'));

            expect(Object.values(snapshot.node_labels).some(nodeLabel => nodeLabel.includes('premier caractère'))).toBe(false);
            expect(assignmentLabels.length).toBe(1);
            expect(getOutgoingEdges(snapshot, entryDecisionId).some(([, toNode, label]) => toNode === assignmentNodeId && label === 'Oui')).toBe(true);
            expect(getOutgoingEdges(snapshot, repeatDecisionId).some(([, toNode, label]) => toNode === assignmentNodeId && label === 'Oui')).toBe(true);
            expect(getNodeRenderPayload(snapshot, assignmentNodeId).for_loop_model).toBe('empty_then_shared_next');
        });

        it('Peut afficher la nature de l\'itérable dans les libellés du for', async () => {
            const snapshot = await buildCfgSnapshot('values = [1, 2]\nfor item in values:\n    print(item)', {
                iterable_kind_visibility: 'show'
            });
            const decisionNodeId = findNodeIdByLabelFragment(snapshot, 'dans la variable values');
            const assignmentNodeId = findNodeIdByLabelFragment(snapshot, 'de la variable values');

            expect(snapshot.node_labels[decisionNodeId]).toContain('dans la variable values');
            expect(snapshot.node_labels[assignmentNodeId]).toContain('de la variable values');
        });

        it('Infère str sur une réaffectation via replace quand les annotations inférées sont demandées', async () => {
            const snapshot = await buildCfgSnapshot('input = "world"\ninput = input.replace(input[0], "")', {
                missing_annotation_policy: 'infer',
                assignment_grouping_mode: 'separate_nodes'
            });
            const assignNodeId = findNodeIdByLabelFragment(snapshot, 'input : str ← input.replace');

            expect(snapshot.node_labels[assignNodeId]).toContain('input : str ← input.replace');
        });

        it('Infère float sur une réaffectation arithmétique après une initialisation signée', async () => {
            const snapshot = await buildCfgSnapshot('epsilon = -1.46\nepsilon = epsilon - 0.4', {
                missing_annotation_policy: 'infer',
                assignment_grouping_mode: 'separate_nodes'
            });
            const assignNodeId = findNodeIdByLabelFragment(snapshot, 'epsilon : float ← epsilon - 0.4');

            expect(snapshot.node_labels[assignNodeId]).toContain('epsilon : float ← epsilon - 0.4');
        });

        it('Conserve extend comme appel autonome préfixé par Appel', async () => {
            const snapshot = await buildCfgSnapshot('scores = [1, 2]\nscores.extend([1, 5])', {
                assignment_grouping_mode: 'separate_nodes'
            });
            const callNodeId = findNodeIdByLabelFragment(snapshot, 'Appel: scores.extend([1, 5])');

            expect(snapshot.node_labels[callNodeId]).toBe('Appel: scores.extend([1, 5])');
            expect(snapshot.node_types[callNodeId]).toBe('Process');
        });

        it('Conserve le else d\'un for vide avec le modèle empty puis next', async () => {
            const snapshot = await buildCfgSnapshot(
                'for x in []:\n    print(x)\nelse:\n    print("empty")\nprint("after")',
                { for_loop_model: 'empty_then_next' }
            );
            const entryDecisionId = findNodeIdByLabelFragment(snapshot, 'Au moins un élément à parcourir');
            const elseNodeId = findNodeIdByLabelFragment(snapshot, 'empty');
            const nonEdges = getOutgoingEdges(snapshot, entryDecisionId).filter(([, , label]) => label === 'Non');

            expect(nonEdges.length).toBe(1);
            expect(nonEdges[0][1]).toBe(elseNodeId);
        });

        it('Conserve le else d\'un for vide avec le modèle for intermédiaire', async () => {
            const snapshot = await buildCfgSnapshot(
                'for x in []:\n    print(x)\nelse:\n    print("empty")\nprint("after")',
                { for_loop_model: 'empty_then_shared_next' }
            );
            const entryDecisionId = findNodeIdByLabelFragment(snapshot, 'Au moins un élément à parcourir');
            const elseNodeId = findNodeIdByLabelFragment(snapshot, 'empty');
            const nonEdges = getOutgoingEdges(snapshot, entryDecisionId).filter(([, , label]) => label === 'Non');

            expect(nonEdges.length).toBe(1);
            expect(nonEdges[0][1]).toBe(elseNodeId);
        });
    });
});
document.addEventListener('DOMContentLoaded', () => {
    let cfgSnapshotQueue = Promise.resolve();

    function buildCfgSnapshot(code) {
        const runSnapshot = async () => {
            await initPyodideAndLoadScript();

            pyodide.globals.set('cfg_test_code', code);
            const snapshotJson = await pyodide.runPythonAsync(`
import json
from MyCFG import ControlFlowGraph

cfg = ControlFlowGraph(cfg_test_code)
cfg.process_and_get_results()

json.dumps({
    "edges": sorted(list(cfg.edges)),
    "node_labels": cfg.node_labels,
    "node_types": cfg.node_types,
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
    });
});
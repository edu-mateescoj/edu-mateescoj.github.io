/**
 * Tests unitaires pour code-generator.js
 */

document.addEventListener('DOMContentLoaded', () => {

    describe("Générateur de Code Python", () => {

        it("Doit générer un code non vide", async () => {
            const options = {
                difficultyLevelGlobal: 1,
                numLinesGlobal: 5,
                numTotalVariablesGlobal: 3
            };
            const code = generateRandomPythonCode(options);
            expect(code).toBeDefined();
            expect(code.length).toBeGreaterThan(10);
        });

        it("Doit respecter le nombre minimum de lignes", async () => {
            const target = 15;
            const options = {
                difficultyLevelGlobal: 2,
                numLinesGlobal: target,
                numTotalVariablesGlobal: 5
            };
            const code = generateRandomPythonCode(options);
            const lines = code.split('\n').filter(l => l.trim() !== '');
            // On accepte une petite marge d'erreur car le générateur peut dépasser
            expect(lines.length).toBeGreaterThan(target - 1); 
        });

        it("Doit inclure des listes si demandé", async () => {
            const options = {
                difficultyLevelGlobal: 3,
                numLinesGlobal: 10,
                var_list_count: 2, // On veut 2 listes
                var_int_count: 1
            };
            const code = generateRandomPythonCode(options);
            
            // Vérifie la présence de crochets []
            expect(code).toContain('[');
            expect(code).toContain(']');
            
            // Vérifie qu'il y a au moins 2 déclarations de listes (approximatif)
            const listDeclarations = code.match(/\w+\s*=\s*\[/g);
            expect(listDeclarations).toBeDefined();
            expect(listDeclarations.length).toBeGreaterThan(1);
        });

        it("Doit générer une fonction si demandé", async () => {
            const options = {
                difficultyLevelGlobal: 3,
                numLinesGlobal: 10,
                main_functions: true,
                func_def_simple: true
            };
            const code = generateRandomPythonCode(options);
            expect(code).toContain('def ');
        });

        it("Ne doit pas générer d'erreurs JS sur 50 générations aléatoires", async () => {
            // Test de robustesse (Fuzzing léger)
            for(let i=0; i<50; i++) {
                const options = {
                    difficultyLevelGlobal: Math.floor(Math.random() * 5) + 1,
                    numLinesGlobal: 10,
                    numTotalVariablesGlobal: 5,
                    var_str_count: 1,
                    var_list_count: 1,
                    main_loops: true,
                    loop_for_list: true
                };
                try {
                    const code = generateRandomPythonCode(options);
                    expect(code).toBeDefined();
                } catch(e) {
                    throw new Error(`Crash à l'itération ${i}: ${e.message}`);
                }
            }
        });

    });

});
/**
 * Tests unitaires pour code-generator.js
 */

document.addEventListener('DOMContentLoaded', () => {

    function withFixedRandom(randomValue, callback) {
        const originalRandom = Math.random;
        Math.random = () => randomValue;

        try {
            return callback();
        } finally {
            Math.random = originalRandom;
        }
    }

    function withSeededRandom(seed, callback) {
        const originalRandom = Math.random;
        let currentSeed = seed >>> 0;

        Math.random = () => {
            currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
            return currentSeed / 4294967296;
        };

        try {
            return callback();
        } finally {
            Math.random = originalRandom;
        }
    }

    function extractWhileBodyOperations(code) {
        const lines = code.split('\n');
        const whileIndex = lines.findIndex(line => line.trim().startsWith('while '));

        if (whileIndex === -1) {
            return [];
        }

        return lines
            .slice(whileIndex + 1)
            .filter(line => line.startsWith('    '))
            .map(line => line.trim())
            .filter(line => !line.includes('Limite de sécurité'))
            .filter(line => !line.includes('Décrémenter la limite de sécurité'))
            .filter(line => !line.includes('Garantir la progression vers la sortie'));
    }

    function countMostIndentedLines(code) {
        const nonEmptyLines = code.split('\n').filter(line => line.trim() !== '');
        const maxIndent = nonEmptyLines.reduce((currentMax, line) => {
            const indentSize = line.match(/^\s*/)[0].length;
            return Math.max(currentMax, indentSize);
        }, 0);

        return nonEmptyLines.filter(line => line.match(/^\s*/)[0].length === maxIndent).length;
    }

    function extractLoopBlock(code, headerPrefix) {
        const lines = code.split('\n');
        const startIndex = lines.findIndex(line => line.trim().startsWith(headerPrefix));

        if (startIndex === -1) {
            return { header: '', body: [] };
        }

        const header = lines[startIndex].trim();
        const body = [];

        for (let lineIndex = startIndex + 1; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            if (line.trim() === '') {
                continue;
            }
            if (!line.startsWith('    ')) {
                break;
            }

            body.push(line.trim());
        }

        return { header, body };
    }

    function stripInlineComments(code) {
        return code
            .split('\n')
            .map(line => line.replace(/\s*#.*$/, ''))
            .join('\n');
    }

    function hasAdvancedArithmeticOperators(code) {
        const sanitizedCode = stripInlineComments(code);
        return /(\*\*|\/\/=|\/\/|%=|\*=|\/=| \* | \/ | % )/.test(sanitizedCode);
    }

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

        it("Doit générer un while avec opérateur logique si demandé", async () => {
            const options = {
                difficultyLevelGlobal: 3,
                numLinesGlobal: 10,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while_op: true
            };
            const code = generateRandomPythonCode(options);

            expect(code).toContain('while ');
            expect(code).toMatch(/while .*\b(and|or|not)\b.*:/);
        });

        it("Doit simplifier les while faciles", async () => {
            const code = withFixedRandom(0.35, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_while: true
            }));

            const whileBodyLines = extractWhileBodyOperations(code);
            expect(whileBodyLines.length).toBeGreaterThan(0);
            expect(whileBodyLines[0].includes('*')).toBe(false);
            expect(whileBodyLines[0].includes('//')).toBe(false);
            expect(whileBodyLines[0].includes('%')).toBe(false);
        });

        it("Doit simplifier while{op} quand la difficulté baisse", async () => {
            const code = withFixedRandom(0.95, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while_op: true
            }));

            const whileLine = code.split('\n').find(line => line.trim().startsWith('while '));
            expect(whileLine).toBeDefined();
            expect(whileLine.includes(' or ')).toBe(false);
            expect(whileLine.includes('not ')).toBe(false);
        });

        it("Doit enrichir les nested if quand la difficulté monte", async () => {
            const lowDifficultyCode = withSeededRandom(12345, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 3,
                main_conditions: true,
                cond_if_if: true
            }));
            const highDifficultyCode = withSeededRandom(12345, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 3,
                main_conditions: true,
                cond_if_if: true
            }));

            expect(countMostIndentedLines(highDifficultyCode)).toBeGreaterThan(countMostIndentedLines(lowDifficultyCode));
        });

        it("Doit garder for_list lisible quand la difficulté est basse", async () => {
            const code = withSeededRandom(24680, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_for_list: true,
                var_list_count: 1
            }));
            const loopBlock = extractLoopBlock(code, 'for ');

            expect(loopBlock.header).toContain(' in ');
            expect(loopBlock.body.length).toBeGreaterThan(0);
            expect(loopBlock.body[0]).toContain('str(');
        });

        it("Doit garder for_str simple au niveau facile", async () => {
            const code = withSeededRandom(13579, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_for_str: true,
                var_str_count: 1
            }));
            const loopBlock = extractLoopBlock(code, 'for ');

            expect(loopBlock.header).toContain(' in ');
            expect(loopBlock.body.length).toBe(1);
            expect(loopBlock.body[0]).notToContain('.upper()');
        });

        it("Doit enrichir for_str quand la difficulté monte", async () => {
            const easyCode = withSeededRandom(97531, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_for_str: true,
                var_str_count: 1
            }));
            const hardCode = withSeededRandom(97531, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 10,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_for_str: true,
                var_str_count: 1
            }));

            const easyLoopBlock = extractLoopBlock(easyCode, 'for ');
            const hardLoopBlock = extractLoopBlock(hardCode, 'for ');

            expect(hardLoopBlock.body.length).toBeGreaterThan(easyLoopBlock.body.length);
        });

        it("Doit limiter l'arithmétique par défaut à plus et moins", async () => {
            const seeds = [101, 202, 303, 404, 505];

            seeds.forEach(seed => {
                const code = withSeededRandom(seed, () => generateRandomPythonCode({
                    difficultyLevelGlobal: 6,
                    numLinesGlobal: 18,
                    numTotalVariablesGlobal: 6,
                    var_int_count: 2,
                    var_float_count: 1,
                    var_str_count: 1,
                    var_bool_count: 1,
                    main_functions: true,
                    func_def_ab: true
                }));

                expect(hasAdvancedArithmeticOperators(code)).toBe(false);
            });
        });

        it("Doit respecter plus/minus seul sans opérateurs avancés", async () => {
            const seeds = [606, 707, 808, 909, 1001];

            seeds.forEach(seed => {
                const code = withSeededRandom(seed, () => generateRandomPythonCode({
                    difficultyLevelGlobal: 6,
                    numLinesGlobal: 18,
                    numTotalVariablesGlobal: 6,
                    var_int_count: 2,
                    var_float_count: 1,
                    var_str_count: 1,
                    main_functions: true,
                    func_def_ab: true,
                    op_plus_minus: true,
                    op_mult_div_pow: false,
                    op_modulo_floor: false
                }));

                expect(hasAdvancedArithmeticOperators(code)).toBe(false);
            });
        });

        it("Doit garantir un slice simple quand op_slice_ab est demandé", async () => {
            const code = withFixedRandom(0.25, () => generateRandomPythonCode({
                difficultyLevelGlobal: 4,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 2,
                op_slice_ab: true
            }));

            expect(code).toMatch(/\[[^:\]\n]*:[^:\]\n]*\]/);
        });

        it("Doit garantir un slice avec pas quand op_slice_abs est demandé", async () => {
            const code = withFixedRandom(0.75, () => generateRandomPythonCode({
                difficultyLevelGlobal: 4,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 2,
                op_slice_abs: true
            }));

            expect(code).toMatch(/\[[^\]\n]*:[^\]\n]*:[1-9]\d*\]/);
        });

        it("Doit respecter les opérateurs booléens cochés (or/not)", async () => {
            const code = withSeededRandom(424242, () => generateRandomPythonCode({
                difficultyLevelGlobal: 3,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                var_bool_count: 1,
                var_str_count: 1,
                op_or: true,
                op_not: true,
                op_and: false,
                op_slice_ab: true
            }));

            const normalizedCode = ` ${code} `;
            expect(normalizedCode.includes(' or ') || normalizedCode.includes(' not ')).toBe(true);
            expect(normalizedCode.includes(' and ')).toBe(false);
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
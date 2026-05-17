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

    function extractWhileHeader(code) {
        return extractLoopBlock(code, 'while ').header;
    }

    function splitWhileClauses(header) {
        if (!header) {
            return [];
        }

        return header
            .replace(/^while\s+/, '')
            .replace(/:\s*$/, '')
            .split(/\s+and\s+/)
            .map(clause => clause.replace(/^\(+|\)+$/g, '').trim())
            .filter(Boolean);
    }

    function extractWhileSupportVariableNames(code) {
        return code
            .split('\n')
            .map(line => line.trim())
            .filter(line => /^(loop_guard|loop_text|loop_items)/.test(line))
            .map(line => line.split('=')[0].trim())
            .filter(name => !name.endsWith('_result'));
    }

    function findUnusedDeclaredVariables(code, variableNames) {
        const lines = code.split('\n');

        return variableNames.filter(name => !lines.some(line => {
            const trimmedLine = line.trim();
            return !trimmedLine.startsWith(`${name} =`) && trimmedLine.includes(name);
        }));
    }

    function stripInlineComments(code) {
        return code
            .split('\n')
            .map(line => line.replace(/\s*#.*$/, ''))
            .join('\n');
    }

    function hasAdvancedArithmeticOperators(code) {
        const sanitizedCode = stripInlineComments(code);
        return /(\*\*|\/\/=|\/\/|%=|\*=| \* | % )/.test(sanitizedCode);
    }

    function hasTrueDivisionOperator(code) {
        const sanitizedCode = stripInlineComments(code);
        return /(^|[^/])\/(?!\/)/m.test(sanitizedCode);
    }

    function collectDistinctMatches(codes, regex) {
        const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
        const globalRegex = new RegExp(regex.source, flags);
        const distinctMatches = new Set();

        codes.forEach(code => {
            const sanitizedCode = stripInlineComments(code);
            globalRegex.lastIndex = 0;

            let match = globalRegex.exec(sanitizedCode);
            while (match) {
                distinctMatches.add(match[0].trim());

                if (globalRegex.lastIndex === match.index) {
                    globalRegex.lastIndex++;
                }
                match = globalRegex.exec(sanitizedCode);
            }
        });

        return distinctMatches;
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

        it("Doit générer un while composé au niveau avancé", async () => {
            const options = {
                difficultyLevelGlobal: 4,
                numLinesGlobal: 10,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while: true,
                op_logic: true,
                op_comparison: true
            };
            const code = generateRandomPythonCode(options);

            expect(code).toContain('while ');
            expect(code).toMatch(/while .* and .*:/);
            expect(code.includes('break')).toBe(false);
            expect(code.includes('Limite de sécurité')).toBe(false);
        });

        it("Niveau 1 garde un while à comparaison littérale unique", async () => {
            const code = withFixedRandom(0.35, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while: true
            }));

            const whileHeader = extractWhileHeader(code);
            expect(/^while \w+ [<>] -?\d+:$/.test(whileHeader)).toBe(true);
            expect(whileHeader.includes(' and ')).toBe(false);
            expect(/\bnot\b/.test(whileHeader)).toBe(false);
            expect(/\bin\b/.test(whileHeader)).toBe(false);
        });

        it("Niveau 2 garde exactement deux clauses de comparaison", async () => {
            const code = withSeededRandom(20240517, () => generateRandomPythonCode({
                difficultyLevelGlobal: 2,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while: true
            }));

            const whileHeader = extractWhileHeader(code);
            const clauses = splitWhileClauses(whileHeader);

            expect(clauses.length).toBe(2);
            expect(/\bor\b/.test(whileHeader)).toBe(false);
            expect(/\bnot\b/.test(whileHeader)).toBe(false);
            expect(/\bnot\s+in\b/.test(whileHeader)).toBe(false);
            expect(/\bin\b/.test(whileHeader)).toBe(false);
            expect(clauses.every(clause => /(?:==|!=|<=|>=|<|>)/.test(clause))).toBe(true);
        });

        it("Niveau 3 peut introduire une borne variable sans ajouter de familles non choisies", async () => {
            const code = withFixedRandom(0.9, () => generateRandomPythonCode({
                difficultyLevelGlobal: 3,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while: true
            }));

            const whileHeader = extractWhileHeader(code);

            expect(/\b(limit|minimum)\b/.test(whileHeader)).toBe(true);
            expect(/\bnot\s+in\b/.test(whileHeader)).toBe(false);
            expect(/\bin\b/.test(whileHeader)).toBe(false);
            expect(/\bor\b/.test(whileHeader)).toBe(false);
            expect(/\bnot\b/.test(whileHeader)).toBe(false);
        });

        it("Niveau 3 sans familles choisies reste plus simple que les niveaux avancés", async () => {
            const levelThreeCode = withFixedRandom(0.9, () => generateRandomPythonCode({
                difficultyLevelGlobal: 3,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while: true
            }));
            const advancedCode = withSeededRandom(30303, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 10,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while: true,
                op_logic: true,
                op_membership: true,
                op_comparison: true
            }));

            expect(splitWhileClauses(extractWhileHeader(levelThreeCode)).length).toBe(2);
            expect(splitWhileClauses(extractWhileHeader(advancedCode)).length > 2).toBe(true);
        });

        it("Un while expert ne déclare pas de supports auxiliaires orphelins", async () => {
            const code = withSeededRandom(424242, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 12,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while: true,
                op_logic: true,
                op_membership: true
            }));

            const supportVarNames = extractWhileSupportVariableNames(code);

            expect(findUnusedDeclaredVariables(code, supportVarNames).length).toBe(0);
            expect(supportVarNames.length <= 3).toBe(true);
        });

        it("Respecte not et not in explicites sans multiplier les supports", async () => {
            const code = withSeededRandom(101010, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 12,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while: true,
                op_not: true,
                op_not_in: true
            }));

            const supportVarNames = extractWhileSupportVariableNames(code);

            expect(/\bnot\b(?!\s+in)/.test(code)).toBe(true);
            expect(/\bnot\s+in\b/.test(code)).toBe(true);
            expect(findUnusedDeclaredVariables(code, supportVarNames).length).toBe(0);
            expect(supportVarNames.length <= 2).toBe(true);
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
            expect(code.includes('break')).toBe(false);
            expect(code.includes('Limite de sécurité')).toBe(false);
        });

        it("Doit garder le while simple quand la difficulté baisse", async () => {
            const code = withFixedRandom(0.95, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                main_loops: true,
                loop_while: true
            }));

            const whileLine = code.split('\n').find(line => line.trim().startsWith('while '));
            expect(whileLine).toBeDefined();
            expect(whileLine.includes(' and ')).toBe(false);
            expect(whileLine.includes(' or ')).toBe(false);
            expect(/\bnot\b/.test(whileLine)).toBe(false);
            expect(code.includes('break')).toBe(false);
        });

        it("Fait varier les conditions de contrôle des while avancés", async () => {
            const seeds = [301, 302, 303, 304, 305, 306];
            const codes = seeds.map(seed => withSeededRandom(seed, () => generateRandomPythonCode({
                difficultyLevelGlobal: 5,
                numLinesGlobal: 10,
                numTotalVariablesGlobal: 5,
                main_loops: true,
                loop_while: true,
                op_logic: true,
                op_membership: true,
                op_comparison: true
            })));

            const whileHeaders = codes
                .map(code => code.split('\n').find(line => line.trim().startsWith('while '))?.trim())
                .filter(Boolean);
            const distinctHeaders = new Set(whileHeaders);

            expect(distinctHeaders.size > 2).toBe(true);
            expect(codes.every(code => !code.includes('break'))).toBe(true);
            expect(codes.every(code => !code.includes('Limite de sécurité'))).toBe(true);
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

        it("Doit utiliser une liste littérale pour for_list sans var_list_count", async () => {
            const code = withSeededRandom(86420, () => generateRandomPythonCode({
                difficultyLevelGlobal: 1,
                numLinesGlobal: 6,
                numTotalVariablesGlobal: 3,
                main_loops: true,
                loop_for_list: true,
                var_list_count: 0
            }));
            const loopBlock = extractLoopBlock(code, 'for ');

            expect(loopBlock.header).toMatch(/^for\s+\w+\s+in\s+\[[^\]]*\]:$/);
            expect(/^\s*\w+\s*=\s*\[[^\]]*\]/m.test(code)).toBe(false);
            expect(loopBlock.body.length).toBeGreaterThan(0);
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
                    op_multiply: false,
                    op_power: false,
                    op_modulo: false,
                    op_floor_div: false
                }));

                expect(hasAdvancedArithmeticOperators(code)).toBe(false);
                expect(hasTrueDivisionOperator(code)).toBe(false);
            });
        });

        it("N'utilise jamais la division réelle même avec les familles avancées activées", async () => {
            const seeds = [1102, 2203, 3304, 4405, 5506];

            seeds.forEach(seed => {
                const code = withSeededRandom(seed, () => generateRandomPythonCode({
                    difficultyLevelGlobal: 6,
                    numLinesGlobal: 20,
                    numTotalVariablesGlobal: 6,
                    var_int_count: 2,
                    var_float_count: 2,
                    var_str_count: 1,
                    var_list_count: 1,
                    main_functions: true,
                    func_def_ab: true,
                    op_plus_minus: true,
                    op_multiply: true,
                    op_power: true,
                    op_modulo: true,
                    op_floor_div: true
                }));

                expect(hasTrueDivisionOperator(code)).toBe(false);
            });
        });

        it("Doit réserver les conditions aux comparateurs quand seul op_comparison est demandé", async () => {
            const seeds = [141, 242, 343, 444, 545, 646];
            const codes = seeds.map(seed => withSeededRandom(seed, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 12,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_bool_count: 1,
                var_int_count: 1,
                var_str_count: 1,
                op_comparison: true,
                op_logic: false,
                op_membership: false
            })));

            const mergedCode = stripInlineComments(codes.join('\n'));
            expect(/(==|!=|<=|>=|<|>| is | is not )/.test(mergedCode)).toBe(true);
            expect(mergedCode.includes(' and ')).toBe(false);
            expect(mergedCode.includes(' or ')).toBe(false);
            expect(mergedCode.includes(' not in ')).toBe(false);
        });

        it("Doit mobiliser le membership quand seul op_membership est demandé", async () => {
            const seeds = [717, 818, 919, 1020, 1121, 1222];
            const codes = seeds.map(seed => withSeededRandom(seed, () => generateRandomPythonCode({
                difficultyLevelGlobal: 5,
                numLinesGlobal: 12,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_list_count: 1,
                var_str_count: 1,
                op_comparison: false,
                op_logic: false,
                op_membership: true
            })));

            const mergedCode = stripInlineComments(codes.join('\n'));
            expect(mergedCode.includes(' in ') || mergedCode.includes(' not in ')).toBe(true);
            expect(/(==|!=|<=|>=|<|>| is | is not )/.test(mergedCode)).toBe(false);
            expect(mergedCode.includes(' and ')).toBe(false);
            expect(mergedCode.includes(' or ')).toBe(false);
        });

        it("Doit garantir in et not in au niveau 5 si op_membership est demandé", async () => {
            const code = withSeededRandom(1313, () => generateRandomPythonCode({
                difficultyLevelGlobal: 5,
                numLinesGlobal: 14,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_bool_count: 1,
                var_list_count: 1,
                var_str_count: 1,
                op_comparison: false,
                op_logic: false,
                op_membership: true
            }));

            const mergedCode = stripInlineComments(code);
            expect(mergedCode.includes(' in ')).toBe(true);
            expect(mergedCode.includes(' not in ')).toBe(true);
        });

        it("Doit rendre accessibles is et is not au niveau difficile", async () => {
            const seeds = [1901, 1902, 1903, 1904, 1905, 1906, 1907, 1908, 1909, 1910];
            const codes = seeds.map(seed => withSeededRandom(seed, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 14,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_bool_count: 2,
                op_comparison: true,
                op_logic: false,
                op_membership: false
            })));

            const mergedCode = stripInlineComments(codes.join('\n'));
            expect(mergedCode.includes(' is ') || mergedCode.includes(' is not ')).toBe(true);
        });

        it("Doit garantir tout le pool de comparateurs au niveau 5 si op_comparison est demandé", async () => {
            const code = withSeededRandom(1717, () => generateRandomPythonCode({
                difficultyLevelGlobal: 5,
                numLinesGlobal: 20,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_bool_count: 2,
                var_int_count: 2,
                op_comparison: true,
                op_logic: false,
                op_membership: false
            }));

            const mergedCode = stripInlineComments(code);
            expect(mergedCode.includes('==')).toBe(true);
            expect(mergedCode.includes('!=')).toBe(true);
            expect(/\s<\s/.test(mergedCode)).toBe(true);
            expect(/\s>\s/.test(mergedCode)).toBe(true);
            expect(mergedCode.includes('<=')).toBe(true);
            expect(mergedCode.includes('>=')).toBe(true);
            expect(mergedCode.includes(' is ')).toBe(true);
            expect(mergedCode.includes(' is not ')).toBe(true);
        });

        it("Doit garder une variabilité minimale sur les comparateurs autorisés", async () => {
            const seeds = [2101, 2202, 2303, 2404, 2505, 2606, 2707, 2808];
            const codes = seeds.map(seed => withSeededRandom(seed, () => generateRandomPythonCode({
                difficultyLevelGlobal: 6,
                numLinesGlobal: 14,
                numTotalVariablesGlobal: 5,
                main_conditions: true,
                cond_if: true,
                var_bool_count: 1,
                var_int_count: 1,
                var_str_count: 1,
                op_comparison: true,
                op_logic: false,
                op_membership: false
            })));

            const distinctComparators = collectDistinctMatches(codes, /is not|is|==|!=|<=|>=|<|>/g);
            expect(distinctComparators.size).toBeGreaterThan(2);
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

        it("Doit mobiliser un opérateur logique si op_logic est demandé", async () => {
            const code = withSeededRandom(424242, () => generateRandomPythonCode({
                difficultyLevelGlobal: 3,
                numLinesGlobal: 8,
                numTotalVariablesGlobal: 4,
                var_bool_count: 1,
                var_str_count: 1,
                op_logic: true,
                op_membership: false,
                op_comparison: false,
                op_slice_ab: true
            }));

            const normalizedCode = ` ${code} `;
            expect(normalizedCode.includes(' or ') || normalizedCode.includes(' not ')).toBe(true);
        });

        it("Évite les réaffectations opaques en profil opérateurs seuls au niveau 2", async () => {
            const code = withSeededRandom(20260517, () => generateRandomPythonCode({
                difficultyLevelGlobal: 2,
                numLinesGlobal: 5,
                numTotalVariablesGlobal: 3,
                op_logic: true,
                op_membership: true,
                op_comparison: true
            }));

            const normalizedCode = stripInlineComments(code);
            const assignedNames = normalizedCode
                .split('\n')
                .map(line => line.trim())
                .filter(line => /^\w+\s*=/.test(line))
                .map(line => line.split('=')[0].trim());
            const duplicateAssignments = assignedNames.filter((name, index) => assignedNames.indexOf(name) !== index);

            expect(new Set(duplicateAssignments).size === 0).toBe(true);
            expect(/\+=|-=/.test(normalizedCode)).toBe(false);
        });

        it("Doit garantir and, or et not au niveau 5 si op_logic est demandé", async () => {
            const code = withSeededRandom(515151, () => generateRandomPythonCode({
                difficultyLevelGlobal: 5,
                numLinesGlobal: 14,
                numTotalVariablesGlobal: 4,
                var_bool_count: 1,
                op_logic: true,
                op_membership: false,
                op_comparison: false
            }));

            const normalizedCode = ` ${stripInlineComments(code)} `;
            expect(normalizedCode.includes(' and ')).toBe(true);
            expect(normalizedCode.includes(' or ')).toBe(true);
            expect(normalizedCode.includes(' not ')).toBe(true);
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
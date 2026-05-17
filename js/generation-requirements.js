(function (global) {
    const DEFAULT_LIMITS = {
        minCodeLines: 3,
        minTotalVariables: 1,
        maxCodeLines: 30,
        maxTotalVariables: 20
    };

    function normalizeCount(value) {
        const parsedValue = Number.parseInt(value, 10);
        return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
    }

    function getRequestedVarCounts(options = {}) {
        return {
            int: normalizeCount(options.var_int_count),
            float: normalizeCount(options.var_float_count),
            str: normalizeCount(options.var_str_count),
            list: normalizeCount(options.var_list_count),
            bool: normalizeCount(options.var_bool_count)
        };
    }

    function hasFunctionDefinitionSelection(options = {}) {
        return Boolean(options.func_def_simple || options.func_def_a || options.func_def_ab);
    }

    function getDifficultyLevel(options = {}) {
        const parsedDifficulty = normalizeCount(options.difficultyLevelGlobal);
        return parsedDifficulty > 0 ? parsedDifficulty : 1;
    }

    function getDifficultyAwareOperatorLineCount(poolSize, difficultyLevel) {
        if (poolSize <= 0) {
            return 0;
        }

        return difficultyLevel >= 5 ? poolSize : 1;
    }

    function getDeterministicSequenceSupportType(options = {}, varCounts = getRequestedVarCounts(options)) {
        if (varCounts.str > 0) {
            return 'str';
        }

        if (varCounts.list > 0) {
            return 'list';
        }

        return 'str';
    }

    function calculateOperatorRequirements(options = {}, varCounts = getRequestedVarCounts(options)) {
        const difficultyLevel = getDifficultyLevel(options);
        let requiredLines = 0;
        let additionalVariables = 0;

        const logicalExplicitCount = [options.op_and, options.op_or, options.op_not].filter(Boolean).length;
        const logicalRequested = Boolean(options.op_logic || logicalExplicitCount > 0);
        const membershipExplicitCount = [options.op_in, options.op_not_in].filter(Boolean).length;
        const membershipRequested = Boolean(options.op_membership || membershipExplicitCount > 0);
        const comparisonRequested = Boolean(options.op_comparison);
        const slicingCount = [options.op_slice_ab, options.op_slice_abs].filter(Boolean).length;
        const slicingRequested = slicingCount > 0;

        const comparisonPoolSize = difficultyLevel <= 2
            ? 2
            : (difficultyLevel <= 4 ? 4 : 8);

        if (logicalRequested) {
            requiredLines += logicalExplicitCount > 0
                ? logicalExplicitCount
                : getDifficultyAwareOperatorLineCount(3, difficultyLevel);
        }

        if (membershipRequested) {
            requiredLines += membershipExplicitCount > 0
                ? membershipExplicitCount
                : getDifficultyAwareOperatorLineCount(2, difficultyLevel);
        }

        if (comparisonRequested) {
            requiredLines += getDifficultyAwareOperatorLineCount(comparisonPoolSize, difficultyLevel);
        }

        if (slicingRequested) {
            requiredLines += slicingCount;
        }

        const boolSupportRequired = logicalRequested || membershipRequested || comparisonRequested;
        const sequenceSupportRequired = membershipRequested || slicingRequested;
        const sequenceSupportType = sequenceSupportRequired && varCounts.str === 0 && varCounts.list === 0
            ? getDeterministicSequenceSupportType(options, varCounts)
            : null;

        if (boolSupportRequired && varCounts.bool === 0) {
            additionalVariables += 1;
        }

        if (sequenceSupportType) {
            additionalVariables += 1;
        }

        return {
            requiredLines,
            additionalVariables,
            boolSupportRequired,
            sequenceSupportRequired,
            sequenceSupportType,
            logicalRequested,
            membershipRequested,
            comparisonRequested,
            slicingRequested
        };
    }

    function calculateStructureRequirements(options = {}, varCounts = getRequestedVarCounts(options)) {
        let requiredLines = 0;
        let minimumVariableFloor = 0;
        let additionalVariables = 0;

        if (options.main_conditions) {
            if (options.cond_if) {
                let simpleIfLines = 2;
                if (options.cond_if_elif) simpleIfLines += 2;
                if (options.cond_if_else || options.cond_if_elif_else) simpleIfLines += 2;
                requiredLines += simpleIfLines;
            }
            if (options.cond_if_if) requiredLines += 3;
            if (options.cond_if_if_if) requiredLines += 4;

            if (options.cond_if || options.cond_if_if || options.cond_if_if_if) {
                minimumVariableFloor = Math.max(minimumVariableFloor, 1);
            }
        }

        if (options.main_loops) {
            if (options.loop_for_range || options.loop_range_ab || options.loop_range_abs) {
                requiredLines += 2;
                additionalVariables += 1;
            }
            if (options.loop_nested_for2) {
                requiredLines += 3;
                additionalVariables += 2;
            }
            if (options.loop_nested_for3) {
                requiredLines += 4;
                additionalVariables += 3;
            }
            if (options.loop_for_list) {
                requiredLines += 2;
                additionalVariables += 1;
            }
            if (options.loop_for_str) {
                requiredLines += 2;
                additionalVariables += 1;
            }
            if (options.loop_while) {
                requiredLines += 3;
                additionalVariables += 1;
            }
            if (options.loop_while_op && !options.loop_while) {
                requiredLines += 3;
                additionalVariables += 1;
            }
        }

        if (options.main_functions && hasFunctionDefinitionSelection(options)) {
            requiredLines += 3;
            if (options.func_def_a) additionalVariables += 1;
            if (options.func_def_ab) additionalVariables += 1;
            if (options.builtin_print) requiredLines += 1;
            if (options.func_return) requiredLines += 1;
        }

        return {
            requiredLines,
            minimumVariableFloor,
            additionalVariables,
            totalStructuralVariables: minimumVariableFloor + additionalVariables
        };
    }

    function calculateGenerationMinimums(options = {}, config = {}) {
        const limits = { ...DEFAULT_LIMITS, ...config };
        const varCounts = config.varCounts || getRequestedVarCounts(options);
        const explicitVarCount = Object.values(varCounts).reduce((sum, count) => sum + count, 0);
        const structureRequirements = calculateStructureRequirements(options, varCounts);
        const operatorRequirements = calculateOperatorRequirements(options, varCounts);

        let minTotalLines = Math.max(limits.minCodeLines, explicitVarCount)
            + structureRequirements.requiredLines
            + operatorRequirements.requiredLines;
        let minTotalVariables = Math.max(limits.minTotalVariables, explicitVarCount);

        minTotalVariables = Math.max(minTotalVariables, structureRequirements.minimumVariableFloor);
        minTotalVariables += structureRequirements.additionalVariables;
        minTotalVariables += operatorRequirements.additionalVariables;

        if (Number.isFinite(limits.maxCodeLines)) {
            minTotalLines = Math.min(minTotalLines, limits.maxCodeLines);
        }
        if (Number.isFinite(limits.maxTotalVariables)) {
            minTotalVariables = Math.min(minTotalVariables, limits.maxTotalVariables);
        }

        return {
            minLines: minTotalLines,
            minVariables: minTotalVariables,
            explicitVarCount,
            varCounts,
            operatorRequirements,
            ...structureRequirements
        };
    }

    function calculateHighlightPlan(options = {}, config = {}) {
        const limits = { ...DEFAULT_LIMITS, ...config };
        const varCounts = config.varCounts || getRequestedVarCounts(options);
        const semanticRequirements = calculateGenerationMinimums(options, { ...limits, varCounts });
        const highlightPriority = { none: 0, suggested: 1, required: 2 };
        const highlights = {};

        const registerHighlight = (elementId, state, reason) => {
            if (!elementId || !highlightPriority.hasOwnProperty(state)) {
                return;
            }

            const currentState = highlights[elementId] || { state: 'none', reasons: [] };

            if (highlightPriority[state] > highlightPriority[currentState.state]) {
                highlights[elementId] = {
                    state,
                    reasons: reason ? [reason] : []
                };
                return;
            }

            if (highlightPriority[state] === highlightPriority[currentState.state] && reason && !currentState.reasons.includes(reason)) {
                currentState.reasons.push(reason);
                highlights[elementId] = currentState;
            }
        };

        const intIsActive = varCounts.int > 0;
        const strIsActive = varCounts.str > 0;
        const listIsActive = varCounts.list > 0;
        const boolIsActive = varCounts.bool > 0;
        const whileLoopActive = Boolean(options.loop_while || options.loop_while_op);
        const conditionStructuresActive = Boolean(
            options.cond_if
            || options.cond_if_else
            || options.cond_if_elif
            || options.cond_if_elif_else
            || options.cond_if_if
            || options.cond_if_if_if
        );
        const logicalSelected = Boolean(options.op_logic || options.op_and || options.op_or || options.op_not);
        const membershipSelected = Boolean(options.op_membership || options.op_in || options.op_not_in);
        const comparisonSelected = Boolean(options.op_comparison);
        const slicingSelected = Boolean(options.op_slice_ab || options.op_slice_abs);
        const listBehaviorSelected = Boolean(options.loop_for_list || options.func_op_list);
        const strBehaviorSelected = Boolean(options.loop_for_str || options.func_op_str);

        // Suggestions: la présence du type ou de la famille changerait la génération sans support imposé.
        if (conditionStructuresActive && !boolIsActive) {
            registerHighlight('var-bool', 'suggested', 'Des booléens rendraient les conditions plus variées.');
        }

        if (listBehaviorSelected && !listIsActive) {
            registerHighlight('var-list', 'suggested', 'Une liste explicite changerait le comportement de génération.');
        }

        if (strBehaviorSelected && !strIsActive) {
            registerHighlight('var-str', 'suggested', 'Une chaîne explicite changerait le comportement de génération.');
        }

        if ((strIsActive || listIsActive) && !options.op_slice_ab) {
            registerHighlight('op-slice-ab', 'suggested', 'Le slicing simple enrichirait la génération.');
        }

        if ((strIsActive || listIsActive) && !options.op_slice_abs) {
            registerHighlight('op-slice-abs', 'suggested', 'Le slicing avec pas enrichirait la génération.');
        }

        if ((strIsActive || listIsActive) && !membershipSelected) {
            registerHighlight('op-membership', 'suggested', 'Le membership deviendrait exploitable avec une séquence active.');
        }

        if (boolIsActive && !logicalSelected) {
            registerHighlight('op-logic', 'suggested', 'Les opérateurs logiques enrichiraient la génération.');
        }

        if ((boolIsActive || intIsActive || strIsActive || listIsActive || conditionStructuresActive) && !(whileLoopActive || comparisonSelected)) {
            registerHighlight('op-comparison', 'suggested', 'Les comparaisons enrichiraient la génération.');
        }

        // Impositions: le moteur fera effectivement apparaître cette famille ou ce type.
        if (whileLoopActive) {
            registerHighlight('op-comparison', 'required', 'Le while repose toujours sur au moins une comparaison.');
        }

        if (comparisonSelected) {
            registerHighlight('op-comparison', 'required', 'Les comparaisons sélectionnées seront garanties.');
        }

        if (logicalSelected) {
            registerHighlight('op-logic', 'required', 'Les opérateurs logiques sélectionnés seront garantis.');
        }

        if (membershipSelected) {
            registerHighlight('op-membership', 'required', 'Le membership sélectionné sera garanti.');
        }

        if (options.op_slice_ab) {
            registerHighlight('op-slice-ab', 'required', 'Un slicing simple sera généré.');
        }

        if (options.op_slice_abs) {
            registerHighlight('op-slice-abs', 'required', 'Un slicing avec pas sera généré.');
        }

        if (whileLoopActive && !intIsActive) {
            registerHighlight('var-int', 'required', 'Le while créera un entier de contrôle.');
        }

        if ((logicalSelected || membershipSelected || comparisonSelected) && !boolIsActive) {
            registerHighlight('var-bool', 'required', 'Un booléen sera ajouté pour les résultats d’opérateurs.');
        }

        if (semanticRequirements.operatorRequirements.sequenceSupportType === 'str') {
            registerHighlight('var-str', 'required', 'Une chaîne support sera ajoutée automatiquement.');
        }

        if (semanticRequirements.operatorRequirements.sequenceSupportType === 'list') {
            registerHighlight('var-list', 'required', 'Une liste support sera ajoutée automatiquement.');
        }

        const baseMinLines = Math.max(limits.minCodeLines, semanticRequirements.explicitVarCount);
        const baseMinVariables = Math.max(limits.minTotalVariables, semanticRequirements.explicitVarCount);

        if (semanticRequirements.minLines > baseMinLines) {
            registerHighlight('num-lines-global', 'required', `Minimum relevé à ${semanticRequirements.minLines} lignes.`);
        }

        if (semanticRequirements.minVariables > baseMinVariables) {
            registerHighlight('num-total-variables-global', 'required', `Minimum relevé à ${semanticRequirements.minVariables} variables.`);
        }

        return {
            highlights,
            semanticRequirements
        };
    }

    global.GenerationRequirements = {
        DEFAULT_LIMITS,
        normalizeCount,
        getRequestedVarCounts,
        hasFunctionDefinitionSelection,
        getDifficultyLevel,
        getDeterministicSequenceSupportType,
        getDifficultyAwareOperatorLineCount,
        calculateOperatorRequirements,
        calculateStructureRequirements,
        calculateGenerationMinimums,
        calculateHighlightPlan
    };
})(window);
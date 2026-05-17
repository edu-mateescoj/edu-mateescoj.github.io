function generateRandomPythonCode(options) {
    console.log("Début de generateRandomPythonCode avec options :", JSON.parse(JSON.stringify(options)));

    // --- CONSTANTES POUR LA GÉNÉRATION ---

    const FUNCTION_NAMES = [
    'calculate', 'compute', 'process', 'transform', 'convert',
    'analyze', 'validate', 'check', 'verify', 'format',
    'get_data', 'update', 'create', 'generate', 'build',
    'initialize', 'setup', 'configure', 'prepare', 'find',
    'search', 'retrieve', 'fetch', 'display', 'show',
    'multiply', 'divide', 'subtract', 'compare',
    'filter', 'sort', 'average', 'normalize'
    ];

    // --- CONSTANTES PARTAGÉES POUR LES NOMS ET TYPES ---

    // Noms de variables par type pour l'inférence cohérente
    const INT_VAR_NAMES = ['count', 'total', 'num', 'value', 'index', 'i', 'j', 'k', 'x', 'y', 'z', 'num1', 'num2', 'sum'];
    const FLOAT_VAR_NAMES = ['price', 'rate', 'ratio', 'avg', 'score', 'factor', 'pi', 'epsilon', 'scale'];
    const STR_VAR_NAMES = ['name', 'text', 'message', 'word', 'label', 'title', 'code', 'prefix', 'suffix', 'content', 'string', 'input'];
    const LIST_VAR_NAMES = ['items', 'values', 'data', 'elements', 'numbers', 'results', 'scores', 'names', 'collection', 'list', 'array'];
    const BOOL_VAR_NAMES = ['is_valid', 'found', 'done', 'active', 'enabled', 'exists', 'has_value', 'ready', 'flag', 'mode'];

    const VAR_NAMES_BY_TYPE = {
        int: INT_VAR_NAMES,
        float: FLOAT_VAR_NAMES,
        str: STR_VAR_NAMES,
        list: LIST_VAR_NAMES,
        bool: BOOL_VAR_NAMES
    };

    const MATH_FUNCTIONS = ['calculate', 'compute', 'multiply', 'divide', 'subtract', 'average', 'sum'];
    const DATA_FUNCTIONS = ['process', 'filter', 'sort', 'update', 'analyze', 'count'];
    const TEXT_FUNCTIONS = ['format', 'display', 'show', 'validate', 'check', 'verify'];
    const UTIL_FUNCTIONS = ['configure', 'setup', 'initialize', 'run', 'prepare'];
    const GENERIC_FUNCTIONS = ['execute', 'handle', 'manage', 'control', 'transform', 'convert'];

    // Valeurs littérales pour chaque type
    const LITERALS_BY_TYPE = {
        int: (difficulty) => getRandomInt(-getValueRange(difficulty), getValueRange(difficulty)),
        float: (difficulty) => parseFloat((getRandomInt(-getValueRange(difficulty), getValueRange(difficulty)) + Math.random() - 0.5).toFixed(2)),
        str: () => {
            const words = ["alpha", "beta", "gamma", "delta", "omega", "sigma", "lambda", "python", "code", "hello", "world"];
            return `"${getRandomItem(words)}"`;
        },
        bool: () => getRandomItem(["True", "False"]),
        list: (difficulty, itemType = 'int') => {
            const size = getRandomInt(2, Math.min(5, 2 + difficulty));
            const items = [];
            for (let i = 0; i < size; i++) {
                if (itemType === 'int') {
                    items.push(getRandomInt(-getValueRange(difficulty), getValueRange(difficulty)));
                } else if (itemType === 'str') {
                    const words = ["alpha", "beta", "gamma", "delta", "omega"];
                    items.push(`"${getRandomItem(words)}"`);
                } else if (itemType === 'bool') {
                    items.push(getRandomItem(["True", "False"]));
                }
            }
            return `[${items.join(', ')}]`;
        }
    };

    function getValueRange(difficulty) {
        return difficulty <= 3 ? 5 : (difficulty <= 5 ? 10 : 15);
    }

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function getRandomItem(array) {
        if (!array || array.length === 0) return null;
        return array[Math.floor(Math.random() * array.length)];
    }

    let iteratorCounter = 0;
    const usedIteratorNames = new Set();

    function generateUniqueIteratorName(type) {
        const prefixMap = {
            'int': 'i',
            'str': 'char',
            'list': 'item'
        };

        const prefix = prefixMap[type] || 'iter';
        let iterName;

        if (iteratorCounter === 0 && !usedIteratorNames.has(prefix)) {
            iterName = prefix;
        } else {
            iterName = `${prefix}${iteratorCounter + 1}`;
        }

        iteratorCounter++;
        usedIteratorNames.add(iterName);

        return iterName;
    }

    const difficulty = options.difficultyLevelGlobal || 3;
    const targetLines = options.numLinesGlobal || 10;
    const MAX_TOTAL_VARIABLES = options.numTotalVariablesGlobal || 5;

    let codeLines = [];
    let indentLevel = 0;
    let linesGenerated = 0;
    let declaredVarsByType = {
        int: [],
        float: [],
        str: [],
        list: [],
        bool: []
    };
    let variableRegistry = {};
    let allDeclaredVarNames = new Set();
    let plannedVarsByType = { int: [], float: [], str: [], list: [], bool: [] };
    let allPlannedVarNames = new Set();

    function generateUniqueVarName(type) {
        const availableNames = VAR_NAMES_BY_TYPE[type] || VAR_NAMES_BY_TYPE.int;
        const availableUnusedNames = availableNames.filter(name => !allDeclaredVarNames.has(name));

        if (availableUnusedNames.length > 0) {
            return getRandomItem(availableUnusedNames);
        }

        let counter = 1;
        const baseName = getRandomItem(availableNames) || type;
        let newName;
        do {
            newName = `${baseName}_${counter}`;
            counter++;
        } while (allDeclaredVarNames.has(newName));

        return newName;
    }

    function sanitizePreferredVarBase(preferredBase, type) {
        const fallbackBaseByType = {
            int: 'result_value',
            float: 'result_number',
            str: 'result_text',
            list: 'result_list',
            bool: 'result_flag'
        };

        if (typeof preferredBase !== 'string' || preferredBase.trim() === '') {
            return fallbackBaseByType[type] || 'result_value';
        }

        let normalizedBase = preferredBase
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .replace(/_+/g, '_');

        if (!normalizedBase) {
            return fallbackBaseByType[type] || 'result_value';
        }

        if (!/^[a-z_]/.test(normalizedBase)) {
            normalizedBase = `${type}_${normalizedBase}`;
        }

        return normalizedBase;
    }

    function generatePreferredVarName(preferredBase, type) {
        const baseName = sanitizePreferredVarBase(preferredBase, type);

        if (!allDeclaredVarNames.has(baseName)) {
            return baseName;
        }

        let counter = 1;
        let candidateName = `${baseName}_${counter}`;
        while (allDeclaredVarNames.has(candidateName)) {
            counter++;
            candidateName = `${baseName}_${counter}`;
        }

        return candidateName;
    }

    function getRegisteredVariableLength(type, finalValue) {
        if (type === 'str') {
            return String(finalValue).replace(/^["']|["']$/g, '').length;
        }

        if (type === 'list') {
            const content = String(finalValue).replace(/^\[|\]$/g, '');
            return content.trim() === '' ? 0 : content.split(',').length;
        }

        return 0;
    }

    function registerDeclaredVariable(name, type, finalValue, { prepend = false, metadata = {} } = {}) {
        const declarationLine = `${name} = ${finalValue}`;

        if (prepend) {
            codeLines.unshift(declarationLine);
        } else {
            codeLines.push(declarationLine);
        }

        allDeclaredVarNames.add(name);
        declaredVarsByType[type].push(name);
        variableRegistry[name] = {
            type,
            value: finalValue,
            length: getRegisteredVariableLength(type, finalValue),
            ...metadata
        };

        linesGenerated++;
        return name;
    }

    function declareVariable(type, value = null) {
        const name = generateUniqueVarName(type);
        const finalValue = value !== null ? value : LITERALS_BY_TYPE[type](difficulty, 'int');

        return registerDeclaredVariable(name, type, finalValue, { prepend: true });
    }

    function declareNamedVariable(type, value = null, preferredBase = null, metadata = {}) {
        const finalValue = value !== null ? value : LITERALS_BY_TYPE[type](difficulty, 'int');
        const name = preferredBase
            ? generatePreferredVarName(preferredBase, type)
            : generateUniqueVarName(type);

        return registerDeclaredVariable(name, type, finalValue, { metadata });
    }

    function declareDerivedVariable(type, expression, preferredBase, metadata = {}) {
        const name = generatePreferredVarName(preferredBase, type);
        return registerDeclaredVariable(name, type, expression, {
            metadata: {
                skipUsageRequirement: true,
                derivedResult: true,
                ...metadata
            }
        });
    }

    function ensureVariableExists(type) {
        if (declaredVarsByType[type] && declaredVarsByType[type].length > 0) {
            return getRandomItem(declaredVarsByType[type]);
        }

        return declareVariable(type);
    }

    let hasGeneratedRequestedSlice = false;
    const conditionOperatorPoolCache = new Map();

    function getAllowedOperationFamilies() {
        const multiplyRequested = Boolean(options.op_multiply || options.op_mult_div_pow);
        const powerRequested = Boolean(options.op_power || options.op_mult_div_pow);
        const moduloRequested = Boolean(options.op_modulo || options.op_modulo_floor);
        const floorDivRequested = Boolean(options.op_floor_div || options.op_modulo_floor);
        const hasExplicitArithmeticSelection = Boolean(
            options.op_plus_minus || multiplyRequested || powerRequested || moduloRequested || floorDivRequested
        );
        const logicalGroupRequested = Boolean(options.op_logic);
        const explicitLogicalRequested = Boolean(options.op_and || options.op_or || options.op_not);
        const comparisonRequested = Boolean(options.op_comparison);
        const membershipGroupRequested = Boolean(options.op_membership);
        const membershipInRequested = Boolean(options.op_in);
        const membershipNotInRequested = Boolean(options.op_not_in);

        return {
            arithmetic: {
                plusMinus: Boolean(options.op_plus_minus) || !hasExplicitArithmeticSelection,
                multiply: multiplyRequested,
                power: powerRequested,
                modulo: moduloRequested,
                floorDiv: floorDivRequested,
                multDivPow: multiplyRequested || powerRequested,
                moduloFloor: moduloRequested || floorDivRequested
            },
            logical: {
                grouped: logicalGroupRequested,
                explicit: logicalGroupRequested || explicitLogicalRequested,
                and: Boolean(options.op_and),
                or: Boolean(options.op_or),
                not: Boolean(options.op_not)
            },
            membership: {
                grouped: membershipGroupRequested,
                in: membershipInRequested,
                notIn: membershipNotInRequested,
                explicit: membershipGroupRequested || membershipInRequested || membershipNotInRequested
            },
            comparison: {
                enabled: comparisonRequested
            },
            slicing: {
                ab: Boolean(options.op_slice_ab),
                abs: Boolean(options.op_slice_abs)
            }
        };
    }

    function hasRequestedSlices() {
        const slicing = getAllowedOperationFamilies().slicing;
        return slicing.ab || slicing.abs;
    }

    function hasExplicitLogicalSelection() {
        return getAllowedOperationFamilies().logical.explicit;
    }

    function hasExplicitMembershipSelection() {
        return getAllowedOperationFamilies().membership.explicit;
    }

    function hasExplicitConditionOperatorSelection() {
        return hasExplicitLogicalSelection() || hasExplicitMembershipSelection() || Boolean(options.op_comparison);
    }

    function buildDifficultyWeightedOperatorPool(basePool, level = difficulty, guaranteeLevel = 5) {
        const uniquePool = Array.from(new Set((basePool || []).filter(Boolean)));
        if (uniquePool.length === 0) {
            return [];
        }

        const normalizedLevel = Math.max(1, level || difficulty || 1);
        const weightedPool = [getRandomItem(uniquePool)];
        const optionalDrawCount = Math.max(0, Math.min(normalizedLevel, guaranteeLevel) - 1);
        const extraDrawProbability = normalizedLevel >= guaranteeLevel
            ? 1
            : Math.min(0.95, normalizedLevel / guaranteeLevel);
        const coverageProbability = normalizedLevel >= guaranteeLevel
            ? 1
            : (normalizedLevel >= guaranteeLevel - 1 ? 0.5 : 0);

        for (let drawIndex = 0; drawIndex < optionalDrawCount; drawIndex++) {
            if (Math.random() < extraDrawProbability) {
                weightedPool.push(getRandomItem(uniquePool));
            }
        }

        uniquePool.forEach(operator => {
            if (!weightedPool.includes(operator) && Math.random() < coverageProbability) {
                weightedPool.push(operator);
            }
        });

        if (normalizedLevel >= guaranteeLevel) {
            uniquePool.forEach(operator => {
                if (!weightedPool.includes(operator)) {
                    weightedPool.push(operator);
                }
            });
        }

        return weightedPool;
    }

    function getCachedConditionOperatorPool(poolName, basePool, level = difficulty) {
        const cacheKey = `${poolName}:${level}:${(basePool || []).join('|')}`;

        if (!conditionOperatorPoolCache.has(cacheKey)) {
            conditionOperatorPoolCache.set(cacheKey, buildDifficultyWeightedOperatorPool(basePool, level));
        }

        return [...conditionOperatorPoolCache.get(cacheKey)];
    }

    function getRequestedLogicalOperators(level = difficulty) {
        const operators = [];
        if (options.op_and) operators.push('and');
        if (options.op_or) operators.push('or');
        if (options.op_not) operators.push('not');
        if (operators.length > 0) {
            return operators;
        }

        if (!options.op_logic) {
            return [];
        }

        return getCachedConditionOperatorPool('logical', ['and', 'or', 'not'], level);
    }

    function getAllowedLogicalOperators(level = difficulty) {
        const explicitOperators = getRequestedLogicalOperators(level);
        if (explicitOperators.length > 0) {
            return explicitOperators;
        }
        return hasExplicitConditionOperatorSelection()
            ? []
            : getCachedConditionOperatorPool('logical-default', ['and', 'or', 'not'], level);
    }

    function getRequestedMembershipOperators(level = difficulty) {
        const operators = [];
        if (options.op_in) operators.push('in');
        if (options.op_not_in) operators.push('not in');
        if (operators.length > 0) {
            return operators;
        }

        if (!options.op_membership) {
            return [];
        }

        return getCachedConditionOperatorPool('membership', ['in', 'not in'], level);
    }

    function getDifficultyTier(level = difficulty) {
        if (level <= 2) {
            return 'easy';
        }
        if (level <= 4) {
            return 'medium';
        }
        return 'hard';
    }

    function getAllowedMembershipOperators(level = difficulty) {
        const explicitOperators = getRequestedMembershipOperators(level);
        if (explicitOperators.length > 0) {
            return explicitOperators;
        }
        return hasExplicitConditionOperatorSelection()
            ? []
            : getCachedConditionOperatorPool('membership-default', ['in', 'not in'], level);
    }

    function getAllowedComparisonOperators(level = difficulty) {
        const difficultyTier = getDifficultyTier(level);
        const baseOperators = ['==', '!='];

        if (difficultyTier !== 'easy') {
            baseOperators.push('<', '>');
        }
        if (difficultyTier === 'hard') {
            baseOperators.push('<=', '>=', 'is', 'is not');
        }

        if (options.op_comparison) {
            return getCachedConditionOperatorPool(`comparison-${difficultyTier}`, baseOperators, level);
        }

        return hasExplicitConditionOperatorSelection()
            ? []
            : getCachedConditionOperatorPool(`comparison-default-${difficultyTier}`, baseOperators, level);
    }

    function getMembershipPreferenceWeight(level = difficulty) {
        if (!(options.op_membership || options.op_in || options.op_not_in)) {
            return 1;
        }

        if (level <= 2) {
            return 3;
        }
        if (level <= 4) {
            return 4;
        }

        return 5;
    }

    function addWeightedCandidates(targetArray, candidates, repeatCount = 1) {
        const normalizedCandidates = Array.isArray(candidates) ? candidates : [candidates];

        for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
            normalizedCandidates.forEach(candidate => targetArray.push(candidate));
        }
    }

    function lineContainsLogicalOperator(line, operator) {
        if (typeof line !== 'string') {
            return false;
        }

        const normalized = line.trim();

        if (operator === 'not') {
            return /\bnot\b/.test(normalized)
                && !/\bnot\s+in\b/.test(normalized)
                && !/\bis\s+not\b/.test(normalized);
        }
        if (operator === 'and') {
            return /\band\b/.test(normalized);
        }
        if (operator === 'or') {
            return /\bor\b/.test(normalized);
        }

        return false;
    }

    function lineContainsMembershipOperator(line, operator) {
        if (typeof line !== 'string') {
            return false;
        }

        const trimmed = line.trim();
        if (trimmed.startsWith('for ')) {
            return false;
        }

        if (operator === 'not in') {
            return /\bnot\s+in\b/.test(trimmed);
        }

        return /\bin\b/.test(trimmed) && !/\bnot\s+in\b/.test(trimmed);
    }

    function lineContainsComparisonOperator(line, operator) {
        if (typeof line !== 'string') {
            return false;
        }

        const normalized = ` ${line.trim()} `;
        if (operator === 'is not') {
            return normalized.includes(' is not ');
        }
        if (operator === 'is') {
            return normalized.includes(' is ') && !normalized.includes(' is not ');
        }

        return normalized.includes(` ${operator} `);
    }

    function getSequenceLengthHint(sourceName) {
        const metadata = variableRegistry[sourceName];
        if (metadata && typeof metadata.length === 'number' && metadata.length > 0) {
            return metadata.length;
        }

        return Math.max(3, Math.min(6, difficulty + 2));
    }

    function getAllowedArithmeticOperatorPool(type) {
        const allowedFamilies = getAllowedOperationFamilies();
        const operators = [];

        if (allowedFamilies.arithmetic.plusMinus) {
            operators.push('+', '-', '+=', '-=');
        }
        if (allowedFamilies.arithmetic.multiply) {
            operators.push('*', '*=');
        }

        if (type === 'str') {
            return operators.filter(operator => ['+', '+=', '*', '*='].includes(operator));
        }

        if (type === 'list') {
            return [];
        }

        if (allowedFamilies.arithmetic.power && ['int', 'float'].includes(type)) {
            operators.push('**');
        }
        if (allowedFamilies.arithmetic.modulo && ['int', 'float'].includes(type)) {
            operators.push('%', '%=');
        }
        if (allowedFamilies.arithmetic.floorDiv && ['int', 'float'].includes(type)) {
            operators.push('//', '//=');
        }

        return operators;
    }

    function buildSliceExpression(sourceName, preferredKind = null) {
        const slicing = getAllowedOperationFamilies().slicing;
        const availableKinds = [];

        if (slicing.ab) availableKinds.push('ab');
        if (slicing.abs) availableKinds.push('abs');
        if (availableKinds.length === 0) return null;

        const selectedKind = preferredKind && availableKinds.includes(preferredKind)
            ? preferredKind
            : getRandomItem(availableKinds);
        const sequenceLength = Math.max(2, getSequenceLengthHint(sourceName));

        if (selectedKind === 'ab') {
            const sliceVariant = getRandomItem(['a:b', ':b', 'a:']);

            if (sliceVariant === 'a:b') {
                const start = getRandomInt(0, sequenceLength - 2);
                const end = getRandomInt(start + 1, sequenceLength);
                return `[${start}:${end}]`;
            }

            if (sliceVariant === ':b') {
                return `[:${getRandomInt(1, sequenceLength)}]`;
            }

            return `[${getRandomInt(0, sequenceLength - 1)}:]`;
        }

        const step = getRandomInt(1, Math.min(3, sequenceLength));
        const sliceVariant = getRandomItem(['a:b:s', '::s']);

        if (sliceVariant === 'a:b:s') {
            const start = getRandomInt(0, sequenceLength - 2);
            const end = getRandomInt(start + 1, sequenceLength);
            return `[${start}:${end}:${step}]`;
        }

        return `[::${step}]`;
    }

    function buildSliceAssignment(type, targetName, sourceName = targetName, preferredKind = null) {
        if (!['str', 'list'].includes(type)) {
            return null;
        }

        const sliceExpression = buildSliceExpression(sourceName, preferredKind);
        if (!sliceExpression) {
            return null;
        }

        hasGeneratedRequestedSlice = true;
        return `${targetName} = ${sourceName}${sliceExpression}`;
    }

    function getSliceOperationBuilders(type, varName) {
        if (!['str', 'list'].includes(type)) {
            return [];
        }

        const slicing = getAllowedOperationFamilies().slicing;
        const builders = [];

        if (slicing.ab) {
            builders.push(() => buildSliceAssignment(type, varName, varName, 'ab'));
        }
        if (slicing.abs) {
            builders.push(() => buildSliceAssignment(type, varName, varName, 'abs'));
        }

        return builders;
    }

    // Détecte une opération de slicing Python (forme [a:b] ou [a:b:s]) sur une ligne générée.
    function isSliceOperation(line) {
        if (typeof line !== 'string') {
            return false;
        }

        // Un slicing Python contient toujours au moins un ':' à l'intérieur des crochets.
        return /\[[^\]\n]*:[^\]\n]*\]/.test(line);
    }

    function getBeginnerMutationHint(line) {
        if (!line || line.trim().startsWith('#')) {
            return null;
        }

        const hintRules = [
            { regex: /\.append\(/, hint: 'append(...) ajoute un element en fin de liste.' },
            { regex: /\.extend\(/, hint: 'extend(...) ajoute plusieurs elements en fin de liste.' },
            { regex: /\.insert\(/, hint: 'insert(i, x) insere x a la position i.' },
            { regex: /\.pop\(/, hint: 'pop(i) retire et renvoie l element a la position i.' },
            { regex: /\.remove\(/, hint: 'remove(x) retire la premiere occurrence de x.' },
            { regex: /\.sort\(/, hint: 'sort() trie la liste sur place.' },
            { regex: /\.upper\(/, hint: 'upper() met le texte en majuscules.' },
            { regex: /\.lower\(/, hint: 'lower() met le texte en minuscules.' },
            { regex: /\.title\(/, hint: 'title() met chaque mot avec une initiale majuscule.' },
            { regex: /\.capitalize\(/, hint: 'capitalize() met la premiere lettre en majuscule.' },
            { regex: /\.replace\(/, hint: 'replace(a, b) remplace le texte a par b.' },
            { regex: /\.strip\(/, hint: 'strip() retire les espaces en debut et fin de texte.' }
        ];

        const matchedRule = hintRules.find(rule => rule.regex.test(line));
        return matchedRule ? matchedRule.hint : null;
    }

    function annotateBeginnerMutationLine(line) {
        const hint = getBeginnerMutationHint(line);
        if (!hint) {
            return line;
        }

        if (line.includes('NB:')) {
            return line;
        }

        if (line.includes('#')) {
            return `${line} | NB: ${hint}`;
        }

        return `${line}  # NB: ${hint}`;
    }

    // "patch" dans la phase d'initialisation pour éviter bug du nombre de listes insuffisant
    // pour les options var_list_count
    function ensureListVariablesCount() {
        // Vérifier si le nombre actuel de listes déclarées correspond à l'option demandée
        const targetListCount = options.var_list_count || 0;
        let currentListCount = declaredVarsByType.list.length;
        
        // Si on a déjà assez de listes, ne rien faire
        if (currentListCount >= targetListCount) return;
        
        // Créer autant de listes que nécessaire
        for (let i = 0; i < targetListCount - currentListCount; i++) {
            // Déterminer le type des éléments de la liste en fonction des options sélectionnées
            let itemTypes = ['int']; // Type par défaut
            
            // Si d'autres types sont disponibles, les considérer aussi
            if (options.var_str_count > 0) itemTypes.push('str');
            if (options.var_bool_count > 0) itemTypes.push('bool');
            if (options.var_float_count > 0) itemTypes.push('float');
            
            // Génère une nouvelle liste avec des types d'éléments diversifiés
            const listValue = generateDiverseList(itemTypes, difficulty);
            const listVar = declareVariable('list', listValue);
            currentListCount++;
            // S'assurer que la liste est utilisée quelque part dans le code
            ensureListVariableIsUsed(listVar);
        }
    }
    /** 
     * Assure qu'une variable de liste est utilisée dans le code.
     * Si la variable n'est pas utilisée de manière significative, ajoute une opération conditionnelle
     * pour l'utiliser, comme un append ou un print.
     * @param {string} listVarName - Le nom de la variable de liste à vérifier.
     * @modifies {codeLines} - Modifie le tableau global codeLines en y ajoutant des opérations.
     * @returns {void}
    */
    // Générer des myList.append(random) ou print(myList[0]) conditionnels sur len() > 0 si builtins choisis
    // pour le cas où la liste est là mais pas *vraiment* utilisée
    function ensureListVariableIsUsed(listVarName) {
        // Vérifier d'abord si la variable est déjà utilisée dans le code sans avoir été déclarée
        const isUsed = codeLines.some(line => {
        // Ligne qui n'est pas une déclaration mais contient le nom de variable
        const isNotDeclaration = !line.trim().startsWith(`${listVarName} =`);
        
        // Utilisation significative: méthodes de liste, indexation, etc.
        const isSignificantUse = 
            line.includes(`${listVarName}.append(`) || 
            line.includes(`${listVarName}.extend(`) ||
            line.includes(`${listVarName}[`) ||
            line.includes(`for `) && line.includes(` in ${listVarName}:`);
            // A AJOUTER line.includes(`len(${listVarName})`
        //
        return isNotDeclaration && line.includes(listVarName) && isSignificantUse;
    });
        // Si la variable n'est pas utilisée de façon significative, ajouter une utilisation
        if (!isUsed) {
            const useAdvancedOps = difficulty >= 4 || options.builtin_isinstance || options.builtin_len;
        
            // Ajouter une opération utilisant cette liste
        /*    const operations = [
                // Parcourir la liste
                () => {
                    const loopVar = generateUniqueIteratorName('list');
                    codeLines.push(`for ${loopVar} in ${listVarName}:`);
                    const indent = safeIndent(1);
                    codeLines.push(`${indent}print(${loopVar})`);
                    linesGenerated += 2;
                },
                // Accéder à un élément
                () => {
                    const targetVar = ensureVariableExists('int');
                    codeLines.push(`if len(${listVarName}) > 0:`);
                    const indent = safeIndent(1);
                    codeLines.push(`${indent}${targetVar} = ${targetVar} + ${listVarName}[0]`);
                    linesGenerated += 2;
                },
                // Ajouter un élément
                () => {
                    codeLines.push(`${listVarName}.append(${getRandomInt(1, 10)})`);
                    linesGenerated++;
                }
            ];
          */
            const operations = [];

            // Opération basique toujours disponible
            operations.push(() => {
                codeLines.push(`${listVarName}.append(${getRandomInt(1, 10)})`);
                linesGenerated++;
            });
            
            // Opérations avancées conditionnelles
            if (useAdvancedOps) {
                operations.push(() => {
                    codeLines.push(`if len(${listVarName}) > 0:`);
                    const indent = safeIndent(1);
                    codeLines.push(`${indent}print(${listVarName}[0])`);
                    linesGenerated += 2;
                });
            }
            // Exécuter une opération aléatoire
            getRandomItem(operations)();
        }
    }

    // Générer une valeur pour un type donné
    function generateValueForType(type) {
        return LITERALS_BY_TYPE[type](difficulty);
    }
    
    /**
     * Génère une liste diversifiée d'éléments.
     * @param {Array<string>} allowedTypes - Les types de données autorisés pour les éléments de la liste.
     * @param {number} difficulty - Le niveau de difficulté pour la génération des éléments.
     * @returns {string} - Une représentation en chaîne de la liste générée.
     */
    function generateDiverseList(allowedTypes, difficulty) {
        // Déterminer la taille de la liste en fonction de la difficulté
        const size = getRandomInt(2, Math.min(5, 2 + difficulty));
        
        // Déterminer si la liste sera homogène ou hétérogène
        const isHomogeneous = difficulty <= 3 || Math.random() < 0.7;
        
        // Sélectionner les types à utiliser
        let typesToUse;
        if (isHomogeneous) {
            // Liste homogène : un seul type
            typesToUse = [getRandomItem(allowedTypes)];
        } else {
            // Liste hétérogène : plusieurs types
            // Plus la difficulté est élevée, plus on peut mélanger de types
            const maxTypes = Math.min(allowedTypes.length, 1 + Math.floor(difficulty / 2));
            typesToUse = shuffleArray([...allowedTypes]).slice(0, getRandomInt(2, maxTypes));
        }
        
        // Générer les éléments de la liste
        const items = [];
        for (let i = 0; i < size; i++) {
            // Pour une liste homogène, utiliser toujours le même type
            // Pour une liste hétérogène, alterner entre les types sélectionnés
            const currentType = isHomogeneous ? typesToUse[0] : typesToUse[i % typesToUse.length];
            // Générer une valeur du type approprié
            items.push(generateValueOfType(currentType, difficulty));
        }
        return `[${items.join(', ')}]`;
    }

    function generateValueOfType(type, difficulty) {
        switch (type) {
            case 'int':
                return getRandomInt(-getValueRange(difficulty), getValueRange(difficulty));
            case 'float':
                return parseFloat((getRandomInt(-getValueRange(difficulty), getValueRange(difficulty)) + Math.random()).toFixed(2));
            case 'str':
                const words = ["alpha", "beta", "gamma", "delta", "epsilon", "kappa", "theta", "omega", "python", "code"];
                return `"${getRandomItem(words)}"`;
            case 'bool':
                return getRandomItem(["True", "False"]);
            default:
                return 0; // Fallback
        }
    }

    // --- ANCIENNE GÉNÉRATION DES ÉLÉMENTS DE SYNTAXE ---

    // Phase 1 : Génération des variables selon les options
    function generateInitialVariables() {
        const typesToGenerate = [];
        
        // Déterminer les types à générer selon les options
        if (options.var_int_count) typesToGenerate.push({ type: 'int', count: options.var_int_count });
        if (options.var_float_count) typesToGenerate.push({ type: 'float', count: options.var_float_count });
        if (options.var_str_count) typesToGenerate.push({ type: 'str', count: options.var_str_count });
        if (options.var_list_count) typesToGenerate.push({ type: 'list', count: options.var_list_count });
        if (options.var_bool_count) typesToGenerate.push({ type: 'bool', count: options.var_bool_count });
 
        shuffleArray(typesToGenerate);

        // Générer les variables dans l'ordre des types (pas en mélange)
        for (const typeInfo of typesToGenerate) {
            for (let i = 0; i < typeInfo.count && allDeclaredVarNames.size < MAX_TOTAL_VARIABLES; i++) {
                const varName = generateUniqueVarName(typeInfo.type);
                const value = generateValueForType(typeInfo.type);
                
                codeLines.push(`${varName} = ${value}`);
                allDeclaredVarNames.add(varName);
                declaredVarsByType[typeInfo.type].push(varName);
                linesGenerated++;
            }
        }
        
        // Si besoin de plus de variables pour atteindre le minimum (toujours en integers)
        while (allDeclaredVarNames.size < Math.min(MAX_TOTAL_VARIABLES, options.numTotalVariablesGlobal || 3) && 
               linesGenerated < targetLines) {
            const varName = generateUniqueVarName('int');
            const value = generateValueForType('int');
            
            codeLines.push(`${varName} = ${value}`);
            allDeclaredVarNames.add(varName);
            declaredVarsByType.int.push(varName);
            linesGenerated++;
        }
    }
    /**
     * Génère une condition basée sur les variables disponibles.
     * @param {Array<string>} varTypes - Les types de variables à prendre en compte.
     * @param {boolean} preferExisting - Indique s'il faut privilégier les variables existantes.
     * @returns {string|null} - La condition générée ou null si aucune condition n'est trouvée.
     */
    function generateCondition(varTypes = ['int', 'bool', 'str', 'list'], preferExisting = true, conditionOptions = {}) {
        const possibleConditions = [];
        const boolAtoms = [];
        const allowCompoundBoolean = conditionOptions.allowCompoundBoolean ?? true;
        const conditionDifficulty = conditionOptions.difficultyLevel ?? difficulty;
        const logicalOperators = getAllowedLogicalOperators(conditionDifficulty);
        const membershipOperators = getAllowedMembershipOperators(conditionDifficulty);
        const comparisonOperators = getAllowedComparisonOperators(conditionDifficulty);
        const standardComparisonOperators = comparisonOperators.filter(operator => operator !== 'is' && operator !== 'is not');
        const identityComparisonOperators = comparisonOperators.filter(operator => operator === 'is' || operator === 'is not');
        const membershipBias = getMembershipPreferenceWeight(conditionDifficulty);
        const prefersMembershipConditions = hasExplicitMembershipSelection() && membershipOperators.length > 0;

        // Conditions basées sur les booléens
        if (varTypes.includes('bool') && declaredVarsByType.bool.length > 0 && preferExisting) {
            declaredVarsByType.bool.forEach(boolVar => {
                boolAtoms.push(boolVar);

                if (logicalOperators.includes('not')) {
                    boolAtoms.push(`not ${boolVar}`);
                }
                if (standardComparisonOperators.includes('==')) {
                    boolAtoms.push(`${boolVar} == False`);
                    boolAtoms.push(`${boolVar} == True`);
                }
                if (standardComparisonOperators.includes('!=')) {
                    boolAtoms.push(`True != ${boolVar}`);
                    boolAtoms.push(`False != ${boolVar}`);
                }
                if (identityComparisonOperators.includes('is')) {
                    boolAtoms.push(`${boolVar} is True`);
                }
                if (identityComparisonOperators.includes('is not')) {
                    boolAtoms.push(`${boolVar} is not False`);
                }
            });

            possibleConditions.push(...boolAtoms);

            const compoundOperators = logicalOperators.filter(operator => operator === 'and' || operator === 'or');
            if (allowCompoundBoolean && compoundOperators.length > 0 && boolAtoms.length >= 2) {
                const firstCond = getRandomItem(boolAtoms);
                let secondCond;
                do {
                    secondCond = getRandomItem(boolAtoms);
                } while (secondCond === firstCond && boolAtoms.length > 1);

                possibleConditions.push(`(${firstCond}) ${getRandomItem(compoundOperators)} (${secondCond})`);
            }
        }

        // Conditions basées sur les listes
        if (varTypes.includes('list') && declaredVarsByType.list.length > 0 && preferExisting) {
            const listVar = getRandomItem(declaredVarsByType.list);

            if (standardComparisonOperators.length > 0) {
                const compareLength = getRandomInt(0, 3);
                const compareOp = getRandomItem(standardComparisonOperators);
                possibleConditions.push(`len(${listVar}) ${compareOp} ${compareLength}`);
            }

            const valueToFind = getRandomInt(1, 10);
            if (membershipOperators.includes('in')) {
                addWeightedCandidates(possibleConditions, [`${valueToFind} in ${listVar}`], membershipBias);
            }
            if (membershipOperators.includes('not in')) {
                addWeightedCandidates(possibleConditions, [`${valueToFind} not in ${listVar}`], membershipBias);
            }
        }

        // Conditions basées sur les chaînes
        if (varTypes.includes('str') && declaredVarsByType.str.length > 0 && preferExisting) {
            const strVar = getRandomItem(declaredVarsByType.str);

            if (standardComparisonOperators.length > 0) {
                possibleConditions.push(`len(${strVar}) ${getRandomItem(standardComparisonOperators)} ${getRandomInt(3, 8)}`);
            }

            const charToFind = getRandomItem(['a', 'e', 'i', 'o', 'u', 'y']);
            if (membershipOperators.includes('in')) {
                addWeightedCandidates(possibleConditions, [`"${charToFind}" in ${strVar}`], membershipBias);
            }
            if (membershipOperators.includes('not in')) {
                addWeightedCandidates(possibleConditions, [`"${charToFind}" not in ${strVar}`], membershipBias);
            }
        }

        // Conditions basées sur les entiers
        if (varTypes.includes('int') && declaredVarsByType.int.length > 0 && preferExisting) {
            const intVar = getRandomItem(declaredVarsByType.int);

            if (varTypes.includes('while_safe')) {
                possibleConditions.push(`${intVar} > 0`);
            } else if (standardComparisonOperators.length > 0) {
                const compareValue = getRandomInt(-5, 5);
                const compareOp = getRandomItem(standardComparisonOperators);
                possibleConditions.push(`${intVar} ${compareOp} ${compareValue}`);
            }
        }

        let condition = null;
        let intVar = null;

        if (possibleConditions.length > 0) {
            condition = getRandomItem(possibleConditions);
        }
        else {
            if (prefersMembershipConditions) {
                const membershipTargets = [];
                if (varTypes.includes('str')) membershipTargets.push('str');
                if (varTypes.includes('list')) membershipTargets.push('list');

                if (membershipTargets.length > 0) {
                    const chosenMembershipType = getRandomItem(membershipTargets);

                    if (chosenMembershipType === 'str') {
                        const strVar = declareVariable('str');
                        const charToFind = getRandomItem(['a', 'e', 'i', 'o', 'u', 'y']);
                        condition = membershipOperators.includes('in')
                            ? `"${charToFind}" in ${strVar}`
                            : `"${charToFind}" not in ${strVar}`;
                    } else {
                        const listVar = declareVariable('list');
                        const valueToFind = getRandomInt(1, 10);
                        condition = membershipOperators.includes('in')
                            ? `${valueToFind} in ${listVar}`
                            : `${valueToFind} not in ${listVar}`;
                    }
                }
            }

            if (!condition && varTypes.includes('bool')) {
                const boolVar = generateUniqueVarName('bool');
                codeLines.push(`${boolVar} = ${getRandomItem(["True", "False"])}`);
                declaredVarsByType.bool.push(boolVar);
                allDeclaredVarNames.add(boolVar);
                linesGenerated++;
                condition = logicalOperators.includes('not') && Math.random() > 0.5 ? `not ${boolVar}` : boolVar;
            } else if (!condition && membershipOperators.length > 0 && varTypes.includes('str')) {
                const strVar = declareVariable('str');
                const charToFind = getRandomItem(['a', 'e', 'i', 'o', 'u', 'y']);
                condition = membershipOperators.includes('in')
                    ? `"${charToFind}" in ${strVar}`
                    : `"${charToFind}" not in ${strVar}`;
            } else if (!condition && membershipOperators.length > 0 && varTypes.includes('list')) {
                const listVar = declareVariable('list');
                const valueToFind = getRandomInt(1, 10);
                condition = membershipOperators.includes('in')
                    ? `${valueToFind} in ${listVar}`
                    : `${valueToFind} not in ${listVar}`;
            } else if (!condition && (varTypes.includes('int') || varTypes.includes('while_safe'))) {
                const newIntVar = generateUniqueVarName('int');
                const value = varTypes.includes('while_safe') ? getRandomInt(3, 5) : getRandomInt(-5, 5);
                codeLines.push(`${newIntVar} = ${value}`);
                declaredVarsByType.int.push(newIntVar);
                allDeclaredVarNames.add(newIntVar);
                linesGenerated++;

                if (varTypes.includes('while_safe') || standardComparisonOperators.length === 0) {
                    condition = `${newIntVar} > 0`;
                } else {
                    condition = `${newIntVar} ${getRandomItem(standardComparisonOperators)} ${getRandomInt(-5, 5)}`;
                }
            }
        }

        if (condition && /\s>\s0$/.test(condition)) {
            intVar = condition.split('>')[0].trim();
        }

        return { condition, intVar };
    }

    // Génère une boucle for imbriquée de profondeur 2 ou 3
    function generateNestedForLoop(depth) {
        const makeRangeSpec = () => {
            if (options.loop_range_abs) {
                const start = getRandomInt(0, 3);
                const stop = start + getRandomInt(3, 8);
                const step = getRandomInt(1, 3);
                return `${start}, ${stop}, ${step}`;
            } else if (options.loop_range_ab) {
                const start = getRandomInt(0, 3);
                const stop = start + getRandomInt(3, 8);
                return `${start}, ${stop}`;
            }
            return `${getRandomInt(difficulty + 1, difficulty + 4)}`;
        };

        const loopVars = [];
        for (let depthIndex = 0; depthIndex < depth; depthIndex++) {
            const loopVar = generateUniqueIteratorName('int');
            loopVars.push(loopVar);
            codeLines.push(`${safeIndent(indentLevel)}for ${loopVar} in range(${makeRangeSpec()}):`);
            indentLevel++;
        }

        const bodyLines = generateStructureBody(indentLevel, 'for_range', {
            loopVar: loopVars[loopVars.length - 1],
            difficulty
        });
        bodyLines.forEach(line => codeLines.push(line));

        indentLevel -= depth;
        linesGenerated += depth + bodyLines.length;
    }

    function getConditionStructuresToGenerate() {
        if (!options.main_conditions) {
            return [];
        }

        const structures = [];

        if (options.cond_if) {
            structures.push('if');
        }
        if (options.cond_if_if) {
            structures.push('if_nested2');
        }
        if (options.cond_if_if_if) {
            structures.push('if_nested3');
        }

        return structures;
    }

    function getDifficultyTier(level = difficulty) {
        if (level <= 2) {
            return 'easy';
        }
        if (level <= 4) {
            return 'medium';
        }
        return 'hard';
    }

    function getConditionVarTypesForDifficulty(level = difficulty) {
        const difficultyTier = getDifficultyTier(level);
        let conditionVarTypes;

        if (difficultyTier === 'easy') {
            conditionVarTypes = ['bool', 'int'];
        } else if (difficultyTier === 'medium') {
            conditionVarTypes = ['bool', 'int', 'str'];
        } else {
            conditionVarTypes = ['bool', 'int', 'list', 'str'];
        }

        if (hasExplicitMembershipSelection()) {
            if (!conditionVarTypes.includes('str')) {
                conditionVarTypes.push('str');
            }
            if (!conditionVarTypes.includes('list')) {
                conditionVarTypes.push('list');
            }
        }

        return conditionVarTypes;
    }

    function generateDifficultyAwareIntOperation(varName, level = difficulty) {
        const difficultyTier = getDifficultyTier(level);
        const arithmetic = getAllowedOperationFamilies().arithmetic;
        const operations = [];
        const step = getRandomInt(1, difficultyTier === 'easy' ? 2 : 3);

        if (arithmetic.plusMinus) {
            operations.push(`${varName} = ${varName} + ${step}`);
            operations.push(`${varName} += ${step}`);

            if (difficultyTier !== 'easy') {
                operations.push(`${varName} -= ${step}`);
            }
        }

        if (arithmetic.multiply && (difficultyTier !== 'easy' || operations.length === 0)) {
            operations.push(`${varName} = ${varName} * ${getRandomInt(2, Math.max(2, Math.min(4, level + 1)))}`);
        }

        if (arithmetic.power && difficultyTier === 'hard') {
            operations.push(`${varName} = ${varName} ** 2`);
        }

        if (arithmetic.floorDiv && (difficultyTier === 'hard' || operations.length === 0)) {
            operations.push(`${varName} = ${varName} // ${getRandomInt(2, Math.max(2, Math.min(4, level + 1)))}`);
        }

        if (arithmetic.modulo && difficultyTier === 'hard') {
            operations.push(`${varName} = ${varName} % ${getRandomInt(2, Math.max(2, Math.min(4, level + 1)))}`);
        }

        if (difficultyTier === 'hard' && operations.length > 0) {
            return generateVariedOperation('int', varName, level).replace(/;$/, '');
        }

        if (operations.length === 0) {
            operations.push(`${varName} = ${varName} + 1`);
        }

        return getRandomItem(operations);
    }

    function generateDifficultyAwareConditionalStatement(level = difficulty) {
        if (getDifficultyTier(level) === 'easy') {
            const intVar = ensureVariableExists('int');
            return generateDifficultyAwareIntOperation(intVar, level);
        }

        return generateAppropriateStatement();
    }

    function generateDifficultyAwareStringOperation(varName, level = difficulty) {
        const difficultyTier = getDifficultyTier(level);
        const arithmetic = getAllowedOperationFamilies().arithmetic;
        const operations = [];

        if (arithmetic.plusMinus) {
            operations.push(() => `${varName} += "!"`);
            operations.push(() => `${varName} = ${varName} + " fin"`);
        }

        if (arithmetic.multiply) {
            const repeatCount = getRandomInt(2, Math.max(2, Math.floor(level / 2) + 1));
            operations.push(() => `${varName} = ${varName} * ${repeatCount}`);

            if (difficultyTier !== 'easy') {
                operations.push(() => `${varName} *= ${repeatCount}`);
            }
        }

        if (difficultyTier !== 'easy') {
            operations.push(() => `${varName} = ${varName}.upper()`);
        }

        if (difficultyTier === 'hard') {
            operations.push(...getSliceOperationBuilders('str', varName));
        }

        if (difficultyTier === 'hard' && operations.length > 0) {
            return generateVariedOperation('str', varName, level).replace(/;$/, '');
        }

        if (operations.length === 0) {
            operations.push(() => `${varName} = ${varName}`);
        }

        return getRandomItem(operations)();
    }

    function buildForListDirectOperation(targetType, targetVar, loopVar) {
        if (targetType === 'str') {
            return `${targetVar} = ${targetVar} + str(${loopVar})`;
        }

        return `${targetVar} = ${targetVar} + len(str(${loopVar}))`;
    }

    function buildConditionalBodyLines(bodyIndentLevel, level = difficulty) {
        const indent = safeIndent(bodyIndentLevel);
        const lineCount = getDifficultyTier(level) === 'hard' ? 2 : 1;
        const bodyLines = [];

        for (let lineIndex = 0; lineIndex < lineCount; lineIndex++) {
            bodyLines.push(`${indent}${generateDifficultyAwareConditionalStatement(level)}`);
        }

        return bodyLines;
    }

    function generateDistinctCondition(usedConditions = new Set(), structureDifficulty = difficulty) {
        let condition = null;
        let attempts = 0;
        const allowedVarTypes = getConditionVarTypesForDifficulty(structureDifficulty);
        const allowCompoundBoolean = getDifficultyTier(structureDifficulty) === 'hard';

        do {
            condition = generateCondition(allowedVarTypes, true, { allowCompoundBoolean }).condition;
            attempts++;
        } while (condition && usedConditions.has(condition) && attempts < 5);

        return condition;
    }

    // Réutilise les opérateurs logiques explicitement demandés, sinon autorise toute la famille.
    function getWhileLogicalOperators(structureDifficulty = difficulty) {
        const availableOperators = getAllowedLogicalOperators();
        const difficultyTier = getDifficultyTier(structureDifficulty);

        if (availableOperators.length === 0) {
            return [];
        }

        if (difficultyTier === 'easy') {
            return availableOperators.includes('and') ? ['and'] : [availableOperators[0]];
        }

        if (difficultyTier === 'medium') {
            const mediumOperators = availableOperators.filter(operator => operator !== 'not');
            return mediumOperators.length > 0 ? mediumOperators : [availableOperators[0]];
        }

        return availableOperators;
    }

    function getWhilePrimaryComparisonOperators(structureDifficulty = difficulty) {
        if (structureDifficulty <= 2) {
            return ['<', '>'];
        }

        return ['<', '>', '<=', '>='];
    }

    function buildWhileProgressionOperation(controlVar, direction, step, structureDifficulty = difficulty) {
        const useCompactAssignment = getDifficultyTier(structureDifficulty) !== 'easy' || Math.random() > 0.4;

        if (direction === 'increment') {
            return useCompactAssignment
                ? `${controlVar} += ${step}`
                : `${controlVar} = ${controlVar} + ${step}`;
        }

        return useCompactAssignment
            ? `${controlVar} -= ${step}`
            : `${controlVar} = ${controlVar} - ${step}`;
    }

    // Prépare des clauses auxiliaires vraies au départ quand une autre famille a été explicitement choisie.
    function buildTrueWhileAuxiliaryClause(structureDifficulty = difficulty, allowLogicalClause = false) {
        const auxiliaryClauses = [];
        const membershipOperators = Array.from(new Set(getRequestedMembershipOperators(structureDifficulty)));
        const requestedLogicalOperators = allowLogicalClause
            ? Array.from(new Set(getRequestedLogicalOperators(structureDifficulty)))
            : [];
        const logicalOperators = structureDifficulty <= 3
            ? requestedLogicalOperators.filter(operator => operator !== 'and')
            : requestedLogicalOperators;
        const effectiveLogicalOperators = logicalOperators.length > 0 ? logicalOperators : requestedLogicalOperators;

        if (membershipOperators.length > 0) {
            const preferredSequenceType = declaredVarsByType.str.length > 0
                ? 'str'
                : (declaredVarsByType.list.length > 0 ? 'list' : 'str');

            membershipOperators.forEach(operator => {
                auxiliaryClauses.push({
                    family: 'membership',
                    operator,
                    materialize(sharedSupport = {}) {
                        if (preferredSequenceType === 'str') {
                            if (!sharedSupport.membershipStr) {
                                const presentChar = getRandomItem(['a', 'e', 'i', 'o', 'u', 'y']);
                                const strValue = `"${presentChar}${getRandomItem(['loop', 'step', 'trace', 'tempo'])}"`;
                                const strVar = declareNamedVariable('str', strValue, 'loop_text', { skipUsageRequirement: true });
                                sharedSupport.membershipStr = {
                                    varName: strVar,
                                    presentChar,
                                    absentChar: 'z'
                                };
                            }

                            const { varName, presentChar, absentChar } = sharedSupport.membershipStr;
                            return {
                                text: operator === 'in'
                                    ? `"${presentChar}" in ${varName}`
                                    : `"${absentChar}" not in ${varName}`,
                                varsToProtect: []
                            };
                        }

                        if (!sharedSupport.membershipList) {
                            const presentValue = getRandomInt(1, 4);
                            const listValue = `[${presentValue}, ${presentValue + 1}, ${presentValue + 2}]`;
                            const listVar = declareNamedVariable('list', listValue, 'loop_items', { skipUsageRequirement: true });
                            sharedSupport.membershipList = {
                                varName: listVar,
                                presentValue,
                                absentValue: presentValue + 5
                            };
                        }

                        const { varName, presentValue, absentValue } = sharedSupport.membershipList;
                        return {
                            text: operator === 'in'
                                ? `${presentValue} in ${varName}`
                                : `${absentValue} not in ${varName}`,
                            varsToProtect: []
                        };
                    }
                });
            });
        }

        effectiveLogicalOperators.forEach(operator => {
            auxiliaryClauses.push({
                family: 'logical',
                operator,
                materialize(sharedSupport = {}) {
                    if (operator === 'not') {
                        if (!sharedSupport.falseGuardVar) {
                            const preferredBase = sharedSupport.trueGuardVar ? 'loop_guard_false' : 'loop_guard';
                            sharedSupport.falseGuardVar = declareNamedVariable('bool', 'False', preferredBase, { skipUsageRequirement: true });
                        }

                        return {
                            text: `not ${sharedSupport.falseGuardVar}`,
                            varsToProtect: []
                        };
                    }

                    if (!sharedSupport.trueGuardVar) {
                        sharedSupport.trueGuardVar = declareNamedVariable('bool', 'True', 'loop_guard', { skipUsageRequirement: true });
                    }

                    return {
                        text: operator === 'and'
                            ? `${sharedSupport.trueGuardVar} and True`
                            : `${sharedSupport.trueGuardVar} or False`,
                        varsToProtect: []
                    };
                }
            });
        });

        return auxiliaryClauses;
    }

    // Produit une condition de while lisible et bornée par un entier de contrôle.
    function buildWhileConditionSpec(useLogicalOperator = false, structureDifficulty = difficulty) {
        const normalizedDifficulty = Math.max(1, structureDifficulty || difficulty || 1);
        const logicalSelected = Boolean(useLogicalOperator || options.op_logic || options.op_and || options.op_or || options.op_not);
        const membershipSelected = Boolean(options.op_membership || options.op_in || options.op_not_in);
        const comparisonSelected = Boolean(options.op_comparison);
        const controlComparators = getWhilePrimaryComparisonOperators(normalizedDifficulty);
        const direction = getRandomItem(['increment', 'decrement']);
        const step = normalizedDifficulty === 1
            ? 1
            : getRandomInt(1, normalizedDifficulty <= 3 ? 2 : 3);
        const selectedClauses = [];
        const comparisonClausePool = [];
        const auxiliaryClausePool = [];
        const protectedVars = [];
        const protectedVarSet = new Set();
        // Les supports auxiliaires sont créés seulement si la clause est réellement retenue.
        const auxiliarySupportState = {};
        const takeRandomClause = (pool) => {
            if (!pool || pool.length === 0) {
                return null;
            }

            const clauseIndex = getRandomInt(0, pool.length - 1);
            return pool.splice(clauseIndex, 1)[0];
        };
        const removeClauseFromPool = (pool, clause) => {
            if (!pool || !clause) {
                return;
            }

            const clauseIndex = pool.findIndex(candidate => candidate === clause || (candidate.text && clause.text && candidate.text === clause.text));
            if (clauseIndex !== -1) {
                pool.splice(clauseIndex, 1);
            }
        };
        const registerProtectedVar = (varName) => {
            if (!varName || protectedVarSet.has(varName)) {
                return;
            }

            protectedVarSet.add(varName);
            protectedVars.push(varName);
        };
        const materializeClause = (clause) => {
            if (!clause) {
                return null;
            }

            return typeof clause.materialize === 'function'
                ? clause.materialize(auxiliarySupportState)
                : clause;
        };
        const pushComparisonClause = (text, varsToProtect = []) => {
            comparisonClausePool.push({ text, varsToProtect });
        };

        let startValue;
        let exitLiteral;
        let primaryComparator;

        if (direction === 'increment') {
            startValue = getRandomInt(0, Math.max(2, Math.min(4, normalizedDifficulty + 1)));
            exitLiteral = startValue + step * getRandomInt(3, normalizedDifficulty <= 2 ? 4 : Math.min(6, normalizedDifficulty + 3));
            primaryComparator = normalizedDifficulty <= 2
                ? '<'
                : (getRandomItem(controlComparators.filter(operator => operator === '<' || operator === '<=')) || '<');
        } else {
            exitLiteral = getRandomInt(0, Math.max(2, Math.min(3, normalizedDifficulty + 1)));
            startValue = exitLiteral + step * getRandomInt(3, normalizedDifficulty <= 2 ? 4 : Math.min(6, normalizedDifficulty + 3));
            primaryComparator = normalizedDifficulty <= 2
                ? '>'
                : (getRandomItem(controlComparators.filter(operator => operator === '>' || operator === '>=')) || '>');
        }

        const controlVar = declareNamedVariable('int', `${startValue}`, direction === 'increment' ? 'index' : 'count');
        const useBoundVariable = normalizedDifficulty >= 3 && (comparisonSelected || logicalSelected || membershipSelected || Math.random() > 0.55);
        const controlBoundVar = useBoundVariable
            ? declareNamedVariable('int', `${exitLiteral}`, direction === 'increment' ? 'limit' : 'minimum', {
                skipUsageRequirement: true
            })
            : null;
        const controlBoundExpression = controlBoundVar || `${exitLiteral}`;

        if (controlBoundVar) {
            registerProtectedVar(controlBoundVar);
        }

        selectedClauses.push({
            text: `${controlVar} ${primaryComparator} ${controlBoundExpression}`,
            varsToProtect: []
        });

        if (normalizedDifficulty >= 2) {
            const stabilityComparator = direction === 'increment' ? '>=' : '<=';
            pushComparisonClause(`${controlVar} ${stabilityComparator} ${startValue}`);

            const helperVars = declaredVarsByType.int.filter(name => name !== controlVar && name !== controlBoundVar);
            helperVars.forEach(helperVar => {
                const helperValue = Number.parseInt(variableRegistry[helperVar]?.value, 10);

                if (!Number.isFinite(helperValue)) {
                    return;
                }

                pushComparisonClause(`${helperVar} == ${helperValue}`, [helperVar]);
                pushComparisonClause(`${helperVar} >= ${helperValue}`, [helperVar]);
                pushComparisonClause(`${helperVar} <= ${helperValue}`, [helperVar]);
            });
        }

        if (normalizedDifficulty >= 3) {
            if (membershipSelected || logicalSelected) {
                buildTrueWhileAuxiliaryClause(normalizedDifficulty, logicalSelected)
                    .forEach(clause => auxiliaryClausePool.push(clause));
            }

            if (comparisonSelected && normalizedDifficulty >= 4) {
                let compareHelperState = null;
                const getCompareHelperState = () => {
                    if (!compareHelperState) {
                        const compareHelperVar = declareNamedVariable('int', `${getRandomInt(2, 5)}`, 'loop_check', { skipUsageRequirement: true });
                        compareHelperState = {
                            varName: compareHelperVar,
                            value: Number.parseInt(variableRegistry[compareHelperVar]?.value, 10)
                        };
                    }

                    return compareHelperState;
                };

                comparisonClausePool.push({
                    materialize() {
                        const helperState = getCompareHelperState();
                        return {
                            text: `${helperState.varName} != ${helperState.value + 1}`,
                            varsToProtect: [helperState.varName]
                        };
                    }
                });
                comparisonClausePool.push({
                    materialize() {
                        const helperState = getCompareHelperState();
                        return {
                            text: `${helperState.varName} >= ${Math.max(0, helperState.value - 1)}`,
                            varsToProtect: [helperState.varName]
                        };
                    }
                });
            }
        }

        if (normalizedDifficulty === 2) {
            const secondClause = takeRandomClause(comparisonClausePool);
            if (secondClause) {
                selectedClauses.push(secondClause);
            }
        } else if (normalizedDifficulty === 3) {
            const levelThreePool = auxiliaryClausePool.length > 0
                ? [...comparisonClausePool, ...auxiliaryClausePool]
                : [...comparisonClausePool];
            const secondClause = takeRandomClause(levelThreePool);
            if (secondClause) {
                selectedClauses.push(secondClause);
            }
        } else if (normalizedDifficulty >= 4) {
            const clauseBudget = normalizedDifficulty >= 6 ? 4 : 3;
            const firstExtraComparison = takeRandomClause(comparisonClausePool);

            if (firstExtraComparison) {
                selectedClauses.push(firstExtraComparison);
            }

            while (selectedClauses.length < clauseBudget) {
                const mixedPool = auxiliaryClausePool.length > 0
                    ? [...auxiliaryClausePool, ...comparisonClausePool]
                    : [...comparisonClausePool];
                const nextClause = takeRandomClause(mixedPool);

                if (!nextClause) {
                    break;
                }

                selectedClauses.push(nextClause);
                removeClauseFromPool(comparisonClausePool, nextClause);
                removeClauseFromPool(auxiliaryClausePool, nextClause);
            }
        }

        const finalizedClauses = selectedClauses
            .map(materializeClause)
            .filter(Boolean);

        finalizedClauses.forEach(clause => {
            (clause.varsToProtect || []).forEach(registerProtectedVar);
        });

        return {
            condition: finalizedClauses.length === 1
                ? finalizedClauses[0].text
                : finalizedClauses.map(clause => `(${clause.text})`).join(' and '),
            intVar: controlVar,
            progressionOperation: buildWhileProgressionOperation(controlVar, direction, step, normalizedDifficulty),
            protectedVars
        };
    }
    
    function generateControlStructures() {
   
        // Créer un tableau des structures possibles
        const structures = [];

        structures.push(...getConditionStructuresToGenerate());

        if (options.main_loops) {
            if (options.loop_for_range || options.loop_range_ab || options.loop_range_abs) {
                structures.push('for_range');
            }
            if (options.loop_nested_for2) structures.push('for_nested2');
            if (options.loop_nested_for3) structures.push('for_nested3');
            if (options.loop_for_list) structures.push('for_list');
            if (options.loop_for_str) structures.push('for_str');
            if (options.loop_while || options.loop_while_op) structures.push('while');
        }

        if (options.main_functions && (options.func_def_simple || options.func_def_a || options.func_def_ab)) {
            structures.push('function');
        }

        shuffleArray(structures);

        for (const structure of structures) {
            switch (structure) {
                case 'if': generateIfStatement(); break;
                case 'if_nested2': generateNestedIfStatement(2); break;
                case 'if_nested3': generateNestedIfStatement(3); break;
                case 'for_range': generateForRangeLoop(); break;
                case 'for_nested2': generateNestedForLoop(2); break;
                case 'for_nested3': generateNestedForLoop(3); break;
                case 'for_list': generateForListLoop(); break;
                case 'for_str': generateForStrLoop(); break;
                case 'while': generateWhileLoop(options.loop_while_op); break;
                case 'function': generateFunction(); break;
            }
        }
    }

    /**
     * Génère un nombre approprié d'instructions pour le corps d'une structure.
     * @param {number} indentLevel - Niveau d'indentation actuel
     * @param {string} contextType - Type de structure ('for_list', 'for_str', 'function', etc.)
     * @param {Object} contextOptions - Options de génération comme le niveau de difficulté
     * @returns {Array<string>} - Tableau de lignes de code pour le corps
     */
    function generateStructureBody(indentLevel, contextType, contextOptions = {}) {
        // Calculer le nombre d'instructions selon la difficulté
        const structureDifficulty = contextOptions.difficulty || difficulty;
        const instructionCount = 1 + Math.floor(structureDifficulty / 3);
    
        const indent = safeIndent(indentLevel);
        const bodyLines = [];
        
        // Ensemble pour suivre les opérations déjà ajoutées dans ce corps
        const addedOperations = new Set();

            
        // Adapter le comportement selon le contexte
        switch (contextType) {
            case 'for_range': {
            // Pour une boucle for sur range, utiliser la variable d'itération
            const loopVar = contextOptions.loopVar;
            const difficultyTier = getDifficultyTier(structureDifficulty);
            
            // Cible à modifier sera généralement un entier
            const targetVar = ensureVariableExists('int');
            
            for (let i = 0; i < instructionCount; i++) {
                let operation;
                
                if (i === 0) {
                    // La première instruction utilise toujours l'itérateur
                    operation = `${indent}${targetVar} = ${targetVar} + ${loopVar}`;
                } else if (difficultyTier !== 'hard') {
                    operation = `${indent}${generateDifficultyAwareIntOperation(targetVar, structureDifficulty)}`;
                } else {
                    // Les instructions suivantes sont plus variées
                    operation = `${indent}${generateVariedOperation('int', targetVar, structureDifficulty).replace(/;$/, '')}`;
                }
                
                // Vérifier si cette opération est déjà présente dans le corps
                if (addedOperations.has(operation)) {
                    // Ajouter un commentaire unique pour la rendre différente
                    const uniqueId = Math.random().toString(36).substring(2, 5);
                    operation = operation.replace(/\s*#.*$/, '') + `  # var_${uniqueId}`;
                }
                
                bodyLines.push(operation);
                addedOperations.add(operation);
            }
            break;
        }
            case 'for_list': {
                // Pour une boucle for sur liste, utiliser la variable d'itération
                const loopVar = contextOptions.loopVar;
                const difficultyTier = getDifficultyTier(structureDifficulty);
                
                // Déterminer le type de variable à modifier (dépend du contenu de la liste)
                const targetType = difficultyTier === 'easy' ? 'str' : (Math.random() > 0.4 ? 'int' : 'str');
                const targetVar = ensureVariableExists(targetType);
                
                // Générer différentes opérations utilisant la variable d'itération
                for (let i = 0; i < instructionCount; i++) {
                    let operation;

                    if (i === 0) {
                        operation = `${indent}${buildForListDirectOperation(targetType, targetVar, loopVar)}`;
                    } else if (difficultyTier === 'easy') {
                        operation = `${indent}${buildForListDirectOperation(targetType, targetVar, loopVar)}`;
                    } else if (Math.random() > 0.5) {
                        operation = `${indent}${targetType === 'str'
                            ? generateDifficultyAwareStringOperation(targetVar, structureDifficulty)
                            : generateDifficultyAwareIntOperation(targetVar, structureDifficulty)}`;
                    } else {
                        // Utiliser generateVariedOperation pour plus de variété
                        operation = `${indent}${generateVariedOperation(targetType, targetVar, structureDifficulty).replace(/;$/, '')}`;
                        // défensif: supprimer les ";" de JS si ils arrivent à passer
                    }

                    if (addedOperations.has(operation)) {
                        const uniqueId = Math.random().toString(36).substring(2, 5);
                        operation = operation.replace(/\s*#.*$/, '') + `  # list_${uniqueId}`;
                    }

                    bodyLines.push(operation);
                    addedOperations.add(operation);

                }
                break;
            }
            case 'for_str': {
                // Pour une boucle for sur chaîne, utiliser la variable de caractère
                const charVar = contextOptions.loopVar;
                const targetVar = ensureVariableExists('str');
                const difficultyTier = getDifficultyTier(structureDifficulty);

                for (let i = 0; i < instructionCount; i++) {
                    if (i === 0) {
                        bodyLines.push(`${indent}${targetVar} = ${targetVar} + ${charVar}`);
                        if (difficultyTier === 'hard') {
                            bodyLines.push(`${indent}${generateDifficultyAwareStringOperation(targetVar, structureDifficulty)}`);
                        }
                    } else if (difficultyTier === 'hard' && Math.random() > 0.5) {
                        // Concaténation conditionnelle pour difficulté moyenne+
                        bodyLines.push(`${indent}if ${charVar} in "aeiouy":`);
                        bodyLines.push(`${indent}    ${targetVar} += ${charVar}.upper()`);
                    } else {
                        // Utiliser generateVariedOperation pour les autres instructions
                        bodyLines.push(`${indent}${generateDifficultyAwareStringOperation(targetVar, structureDifficulty)}`);
                    }
                }
                break;
            }
            case 'while': {
                const conditionVar = contextOptions.conditionVar || ensureVariableExists('int');
                const protectedVars = new Set([conditionVar, ...(contextOptions.protectedVars || [])]);
                const targetVar = declaredVarsByType.int.find(name => !protectedVars.has(name)) || conditionVar;
                const difficultyTier = getDifficultyTier(structureDifficulty);

                for (let i = 0; i < instructionCount; i++) {
                    let rawOperation;

                    if (difficultyTier === 'easy') {
                        rawOperation = generateDifficultyAwareIntOperation(targetVar, structureDifficulty);
                    } else if (difficultyTier === 'medium' && i === 0) {
                        rawOperation = generateDifficultyAwareIntOperation(targetVar, structureDifficulty);
                    } else {
                        rawOperation = generateVariedOperation('int', targetVar, structureDifficulty).replace(/;$/, '');
                    }

                    let operation = `${indent}${rawOperation}`;

                    if (addedOperations.has(operation)) {
                        const uniqueId = Math.random().toString(36).substring(2, 5);
                        operation = operation.replace(/\s*#.*$/, '') + `  # while_${uniqueId}`;
                    }

                    bodyLines.push(operation);
                    addedOperations.add(operation);
                }
                break;
            }
            case 'function': {
                const params = contextOptions.params || [];
                const paramTypes = contextOptions.paramTypes || params.map(() => 'int');
                const localResultVar = getRandomItem(["local_result", "func_output", "result", "output"]);
                const operations = [];
                const arithmeticFamilies = getAllowedOperationFamilies().arithmetic;
                const slicingFamilies = getAllowedOperationFamilies().slicing;
                const bodyDifficulty = contextOptions.difficulty || difficulty;

                if (params.length > 0) {
                    const firstParam = params[0];
                    const firstType = paramTypes[0];

                    switch (firstType) {
                        case 'str': {
                            let safeAccessCode = "";

                            if (variableRegistry[firstParam]) {
                                const len = variableRegistry[firstParam].length;
                                if (len > 0) {
                                    const accessIndex = getRandomInt(0, len - 1);
                                    safeAccessCode = `${indent}${localResultVar} = ${firstParam}[${accessIndex}] + "_" + ${firstParam}`;
                                } else {
                                    safeAccessCode = `${indent}${localResultVar} = "vide"`;
                                }
                            } else {
                                const targetIdx = getRandomInt(1, 4);
                                safeAccessCode = [
                                    `${indent}if len(${firstParam}) > ${targetIdx}:`,
                                    `${indent}    ${localResultVar} = ${firstParam}[${targetIdx}]  # Accès sécurisé`,
                                    `${indent}else:`,
                                    `${indent}    ${localResultVar} = ${firstParam}[0] if len(${firstParam}) > 0 else ""`
                                ].join('\n');
                            }

                            const stringOps = [
                                `${indent}${localResultVar} = ${firstParam}.upper()`,
                                safeAccessCode
                            ];
                            if (arithmeticFamilies.plusMinus) {
                                stringOps.push(`${indent}${localResultVar} = ${firstParam} + " processed"`);
                            }
                            if (slicingFamilies.ab) {
                                stringOps.push(`${indent}${buildSliceOperation(localResultVar, firstParam, 'ab')}`);
                            }
                            if (slicingFamilies.abs) {
                                stringOps.push(`${indent}${buildSliceOperation(localResultVar, firstParam, 'abs')}`);
                            }

                            const selectedStringOp = getRandomItem(stringOps.filter(Boolean));
                            if (isSliceOperation(selectedStringOp)) {
                                hasGeneratedRequestedSlice = true;
                            }
                            operations.push(selectedStringOp);
                            break;
                        }
                        case 'list': {
                            operations.push(`${indent}${localResultVar} = []`);

                            const useAdvancedListOps = bodyDifficulty >= 4 || options.builtin_isinstance || options.builtin_len;
                            let listAccessCode = "";
                            if (variableRegistry[firstParam]) {
                                const len = variableRegistry[firstParam].length;
                                if (len > 0) {
                                    const idx = getRandomInt(0, len - 1);
                                    listAccessCode = `${indent}${localResultVar} = ${firstParam}[${idx}]`;
                                } else {
                                    listAccessCode = `${indent}${localResultVar} = 0`;
                                }
                            } else {
                                listAccessCode = [
                                    `${indent}if len(${firstParam}) > 0:`,
                                    `${indent}    ${localResultVar} = ${firstParam}[0]`,
                                    `${indent}else:`,
                                    `${indent}    ${localResultVar} = 0`
                                ].join('\n');
                            }

                            const basicListOptions = [
                                [`${indent}${localResultVar}.append(${getRandomInt(1, 5)})`],
                                [listAccessCode]
                            ];
                            if (slicingFamilies.ab) {
                                basicListOptions.push([`${indent}${buildSliceOperation(localResultVar, firstParam, 'ab')}`]);
                            }
                            if (slicingFamilies.abs) {
                                basicListOptions.push([`${indent}${buildSliceOperation(localResultVar, firstParam, 'abs')}`]);
                            }

                            const advancedListOptions = [
                                [
                                    `${indent}if isinstance(${localResultVar}, list):`,
                                    `${indent}    ${localResultVar}.append(${getRandomInt(1, 5)})`,
                                    `${indent}else:`,
                                    `${indent}    ${localResultVar} = [${localResultVar}]`
                                ],
                                [
                                    `${indent}if len(${firstParam}) > 0:`,
                                    `${indent}    ${localResultVar} = ${firstParam}[0]`,
                                    `${indent}else:`,
                                    `${indent}    ${localResultVar} = 0`
                                ]
                            ];

                            const selectedListOps = useAdvancedListOps
                                ? getRandomItem([...advancedListOptions, ...basicListOptions])
                                : getRandomItem(basicListOptions);
                            selectedListOps.forEach(op => {
                                if (isSliceOperation(op)) {
                                    hasGeneratedRequestedSlice = true;
                                }
                                operations.push(op);
                            });
                            break;
                        }
                        case 'bool': {
                            const logicalOps = getAllowedLogicalOperators();
                            const boolOps = [];
                            if (logicalOps.includes('not')) {
                                boolOps.push(`${indent}${localResultVar} = not ${firstParam}`);
                            }
                            if (logicalOps.includes('and')) {
                                boolOps.push(`${indent}${localResultVar} = ${firstParam} and ${getRandomItem(['True', 'False'])}`);
                            }
                            if (logicalOps.includes('or')) {
                                boolOps.push(`${indent}${localResultVar} = ${firstParam} or ${getRandomItem(['True', 'False'])}`);
                            }
                            if (boolOps.length === 0) {
                                boolOps.push(`${indent}${localResultVar} = ${firstParam}`);
                            }
                            if (bodyDifficulty >= 5 && arithmeticFamilies.plusMinus) {
                                boolOps.push(`${indent}${localResultVar} = ${localResultVar} + ${getRandomInt(0, 1)}`);
                            }
                            if (bodyDifficulty >= 5 && arithmeticFamilies.multiply) {
                                boolOps.push(`${indent}${localResultVar} = ${getRandomInt(1, 3)} * ${localResultVar}`);
                            }
                            operations.push(getRandomItem(boolOps));
                            break;
                        }
                        case 'int':
                        case 'float':
                        default: {
                            if (params.length >= 2 && ['int', 'float'].includes(paramTypes[1])) {
                                const secondParam = params[1];
                                const arithmeticOps = [];

                                if (arithmeticFamilies.plusMinus) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} + ${secondParam}`]);
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} - ${secondParam}`]);
                                }
                                if (arithmeticFamilies.multiply) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} * ${secondParam}`]);
                                }
                                if (arithmeticFamilies.floorDiv) {
                                    arithmeticOps.push([
                                        `${indent}if ${secondParam} != 0:`,
                                        `${indent}    ${localResultVar} = ${firstParam} // ${secondParam}`,
                                        `${indent}else:`,
                                        `${indent}    ${localResultVar} = ${firstParam}`
                                    ]);
                                }
                                if (arithmeticFamilies.modulo) {
                                    arithmeticOps.push([
                                        `${indent}if ${secondParam} != 0:`,
                                        `${indent}    ${localResultVar} = ${firstParam} % ${secondParam}`,
                                        `${indent}else:`,
                                        `${indent}    ${localResultVar} = ${firstParam}`
                                    ]);
                                }
                                if (arithmeticFamilies.power) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} ** 2`]);
                                }

                                const selectedOps = arithmeticOps.length > 0
                                    ? getRandomItem(arithmeticOps)
                                    : [`${indent}${localResultVar} = ${firstParam}`];
                                selectedOps.forEach(op => operations.push(op));
                            } else {
                                const mathConstant = Math.floor(Math.random() * 5) + 2;
                                const arithmeticOps = [];

                                if (arithmeticFamilies.plusMinus) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} + ${mathConstant}`]);
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} - ${mathConstant}`]);
                                }
                                if (arithmeticFamilies.multiply) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} * ${mathConstant}`]);
                                }
                                if (arithmeticFamilies.power) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} ** 2`]);
                                }
                                if (arithmeticFamilies.floorDiv) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} // ${mathConstant}`]);
                                }
                                if (arithmeticFamilies.modulo) {
                                    arithmeticOps.push([`${indent}${localResultVar} = ${firstParam} % ${mathConstant}`]);
                                }

                                const selectedOps = arithmeticOps.length > 0
                                    ? getRandomItem(arithmeticOps)
                                    : [`${indent}${localResultVar} = ${firstParam}`];
                                selectedOps.forEach(op => operations.push(op));
                            }
                            break;
                        }
                    }
                } else {
                    operations.push(`${indent}${localResultVar} = ${getRandomInt(1, 10)}`);
                }

                const resultType = params.length > 0 ? paramTypes[0] : 'int';
                const numOperationsTarget = Math.max(1, Math.min(3, Math.floor(bodyDifficulty / 2)));

                if (operations.length < numOperationsTarget) {
                    for (let operationIndex = 0; operationIndex < numOperationsTarget; operationIndex++) {
                        switch (resultType) {
                            case 'str': {
                                const simpleStrOps = [[`${indent}${localResultVar} = ${localResultVar}.upper()`]];
                                const conditionalStrOps = [];

                                if (arithmeticFamilies.plusMinus) {
                                    simpleStrOps.push([`${indent}${localResultVar} += "_modified"`]);
                                    conditionalStrOps.push([
                                        `${indent}if len(${localResultVar}) > ${getRandomInt(1, 3)}:`,
                                        `${indent}    ${localResultVar} = ${localResultVar}.upper()`,
                                        `${indent}else:`,
                                        `${indent}    ${localResultVar} += "_extended"`
                                    ]);
                                }
                                if (slicingFamilies.ab) {
                                    simpleStrOps.push([`${indent}${buildSliceOperation(localResultVar, localResultVar, 'ab')}`]);
                                }
                                if (slicingFamilies.abs) {
                                    simpleStrOps.push([`${indent}${buildSliceOperation(localResultVar, localResultVar, 'abs')}`]);
                                }

                                const selectedStrOps = conditionalStrOps.length > 0 && Math.random() <= 0.5 && operationIndex !== 0
                                    ? getRandomItem(conditionalStrOps)
                                    : getRandomItem(simpleStrOps.filter(item => item.every(Boolean)));
                                selectedStrOps.forEach(op => {
                                    if (isSliceOperation(op)) {
                                        hasGeneratedRequestedSlice = true;
                                    }
                                    operations.push(op);
                                });
                                break;
                            }
                            case 'list': {
                                const listOptions = [
                                    [
                                        `${indent}if isinstance(${localResultVar}, list):`,
                                        `${indent}    ${localResultVar}.append(${getRandomInt(1, 5)})`,
                                        `${indent}else:`,
                                        `${indent}    ${localResultVar} = [${localResultVar}]`
                                    ]
                                ];
                                if (slicingFamilies.ab) {
                                    listOptions.push([`${indent}${buildSliceOperation(localResultVar, localResultVar, 'ab')}`]);
                                }
                                if (slicingFamilies.abs) {
                                    listOptions.push([`${indent}${buildSliceOperation(localResultVar, localResultVar, 'abs')}`]);
                                }

                                getRandomItem(listOptions.filter(item => item.every(Boolean))).forEach(op => {
                                    if (isSliceOperation(op)) {
                                        hasGeneratedRequestedSlice = true;
                                    }
                                    operations.push(op);
                                });
                                break;
                            }
                            case 'bool': {
                                const boolOps = [
                                    `${indent}${localResultVar} = not ${localResultVar}`,
                                    `${indent}${localResultVar} = ${localResultVar} and ${getRandomItem(['True', 'False'])}`,
                                    `${indent}${localResultVar} = ${localResultVar} or ${getRandomItem(['True', 'False'])}`
                                ];
                                if (bodyDifficulty >= 5 && arithmeticFamilies.plusMinus) {
                                    boolOps.push(`${indent}${localResultVar} = ${localResultVar} + ${getRandomInt(0, 1)}`);
                                }
                                if (bodyDifficulty >= 5 && arithmeticFamilies.multiply) {
                                    boolOps.push(`${indent}${localResultVar} = ${getRandomInt(1, 3)} * ${localResultVar}`);
                                }
                                operations.push(getRandomItem(boolOps));
                                break;
                            }
                            case 'int':
                            case 'float':
                            default: {
                                const simpleNumOps = [];
                                const conditionalNumOps = [];

                                if (arithmeticFamilies.plusMinus) {
                                    simpleNumOps.push([`${indent}${localResultVar} += ${getRandomInt(1, 5)}`]);
                                    conditionalNumOps.push([
                                        `${indent}if ${localResultVar} > ${getRandomInt(10, 20)}:`,
                                        `${indent}    ${localResultVar} -= ${getRandomInt(1, 5)}`,
                                        `${indent}else:`,
                                        `${indent}    ${localResultVar} += ${getRandomInt(1, 3)}`
                                    ]);
                                }
                                if (arithmeticFamilies.multiply) {
                                    simpleNumOps.push([`${indent}${localResultVar} *= ${getRandomInt(2, 4)}`]);
                                }
                                if (arithmeticFamilies.floorDiv) {
                                    simpleNumOps.push([`${indent}${localResultVar} //= ${getRandomInt(2, 4)}`]);
                                }
                                if (arithmeticFamilies.modulo) {
                                    simpleNumOps.push([`${indent}${localResultVar} %= ${getRandomInt(2, 4)}`]);
                                }
                                if (arithmeticFamilies.power) {
                                    simpleNumOps.push([`${indent}${localResultVar} = ${localResultVar} ** 2`]);
                                }

                                const selectedNumOps = conditionalNumOps.length > 0 && Math.random() <= 0.4 && operationIndex !== 0
                                    ? getRandomItem(conditionalNumOps)
                                    : (simpleNumOps.length > 0 ? getRandomItem(simpleNumOps) : [[`${indent}${localResultVar} = ${localResultVar}`]]);
                                selectedNumOps.forEach(op => operations.push(op));
                                break;
                            }
                        }
                    }
                }

                bodyLines.push(...operations);

                if (contextOptions.hasReturn) {
                    bodyLines.push(`${indent}return ${localResultVar}`);
                } else if (contextOptions.hasPrint) {
                    if (resultType === 'str') {
                        bodyLines.push(`${indent}print("Résultat: " + ${localResultVar})`);
                    } else {
                        bodyLines.push(`${indent}print("Résultat:", ${localResultVar})`);
                    }
                }
                break;
            }
            default:
                // Fallback générique
                for (let i = 0; i < instructionCount; i++) {
                    bodyLines.push(`${indent}${generateAppropriateStatement()}`);
                }
        }
        
        // Un corps de structure ne doit JAMAIS être vide, `pass` est la seule solution.
        if (bodyLines.length === 0) {
            bodyLines.push(`${indent}pass`);
        }
    
        return bodyLines;
    }

    function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
    }

    // Génération d'un if (avec else optionnel)
    function generateIfStatement() {
        const indent = safeIndent(indentLevel);
        const usedConditions = new Set();
        
        // --- REFACTORISATION ---
        // On utilise maintenant generateCondition pour le IF principal,
        // ce qui permet d'utiliser des listes et des chaînes, et non plus seulement des booléens/entiers.
        // Le 'true' indique de préférer une variable existante.
        const condition = generateDistinctCondition(usedConditions, difficulty);

        // Si aucune condition n'a pu être générée (cas très rare), on abandonne.
        if (!condition) {
            return;
        }

        usedConditions.add(condition);

        // Générer la ligne if avec la condition
        codeLines.push(`${indent}if ${condition}:`);
        // Augmenter l'indentation pour le corps du if
        indentLevel++;
        // Générer le corps du if avec une opération cohérente
        const ifBodyIndent = safeIndent(indentLevel);
        const ifBody = generateDifficultyAwareConditionalStatement(difficulty);
        codeLines.push(`${ifBodyIndent}${ifBody}`);
        indentLevel--;
        let linesAdded = 2; // if + corps
        
        // On traite la génération du 'elif' et du 'else' de manière indépendante.

        // 1. Gérer le 'elif'
        if (options.cond_if_elif) {
            const elifCondition = generateDistinctCondition(usedConditions, difficulty);

            if (elifCondition) {
                usedConditions.add(elifCondition);
                codeLines.push(`${indent}elif ${elifCondition}:`);
                indentLevel++;
                
                const elifBodyIndent = safeIndent(indentLevel);
                const elifBody = generateDifficultyAwareConditionalStatement(difficulty);
                codeLines.push(`${elifBodyIndent}${elifBody}`);
                indentLevel--;
                
                linesAdded += 2;
            }
        }
        
        // 2. Gérer le 'else'
        // Le 'else' peut être ajouté après un 'if' ou un 'elif'.
        // L'option 'cond_if_elif_else' implique que 'cond_if_else' est aussi souhaité.
        if (options.cond_if_else || options.cond_if_elif_else) {
            codeLines.push(`${indent}else:`);
            indentLevel++;
            
            const elseBodyIndent = safeIndent(indentLevel);
            const elseBody = generateDifficultyAwareConditionalStatement(difficulty);
            codeLines.push(`${elseBodyIndent}${elseBody}`);
            indentLevel--;
            
            linesAdded += 2;
        }
        
        linesGenerated += linesAdded;
    }

    function generateNestedIfStatement(depth) {
        const usedConditions = new Set();
        const initialIndentLevel = indentLevel;
        let linesAdded = 0;

        for (let level = 0; level < depth; level++) {
            const condition = generateDistinctCondition(usedConditions, difficulty);

            if (!condition) {
                indentLevel = initialIndentLevel;
                return;
            }

            usedConditions.add(condition);
            codeLines.push(`${safeIndent(indentLevel)}if ${condition}:`);
            indentLevel++;
            linesAdded++;
        }

        const bodyLines = buildConditionalBodyLines(indentLevel, difficulty);
        bodyLines.forEach(line => codeLines.push(line));
        indentLevel = initialIndentLevel;
        linesAdded += bodyLines.length;
        linesGenerated += linesAdded;
    }
    
    // Génération d'une boucle for..range
    //  CORPS := "VAR = VAR + ITERATEUR" UNIQUEMENT
    function generateForRangeLoop() {
        const indent = safeIndent(indentLevel);

        let rangeSpec;
        if (options.loop_range_abs) {
            const start = getRandomInt(0, 3);
            const stop = start + getRandomInt(3, 8);
            const step = getRandomInt(1, 3);
            rangeSpec = `${start}, ${stop}, ${step}`;
        } else if (options.loop_range_ab) {
            const start = getRandomInt(0, 3);
            const stop = start + getRandomInt(3, 8);
            rangeSpec = `${start}, ${stop}`;
        } else {
            rangeSpec = `${getRandomInt(difficulty + 1, difficulty + 4)}`;
        }

        const loopVar = generateUniqueIteratorName('int');
        codeLines.push(`${indent}for ${loopVar} in range(${rangeSpec}):`);
        indentLevel++;
        
        // Utiliser generateStructureBody comme pour les autres types de boucles
        const bodyLines = generateStructureBody(indentLevel, 'for_range', { 
            loopVar, 
            difficulty 
        });
        
        // Ajouter les lignes du corps au code
        bodyLines.forEach(line => codeLines.push(line));
        
        indentLevel--;
        // Mettre à jour le compteur de lignes correctement
        linesGenerated += 1 + bodyLines.length; // 1 pour la ligne "for" + nombre de lignes du corps
    }
    
    // Génération d'une boucle for..list
    function generateForListLoop() {
        const indent = safeIndent(indentLevel);
        let useAdvancedListOps = difficulty >= 4 || options.builtin_isinstance || options.builtin_len;
    
        // Préférer utiliser une variable de liste existante plutôt qu'un littéral
        let iterableExpr; // l'itérable 'list' pour cette boucle for
        if (declaredVarsByType.list.length > 0) {
            iterableExpr = getRandomItem(declaredVarsByType.list);
        } else {
            // Si aucune liste n'est disponible, en créer une avec des types diversifiés
            const allowedTypes = ['int'];
            if (options.var_str_count > 0) allowedTypes.push('str');
            if (options.var_bool_count > 0) allowedTypes.push('bool');
            iterableExpr = generateDiverseList(allowedTypes, difficulty);
        }
        
        // Nom pour l'élément de liste
        const loopVar = generateUniqueIteratorName('list');
        
        // Générer la ligne de la boucle
        codeLines.push(`${indent}for ${loopVar} in ${iterableExpr}:`);
        indentLevel++;
        
        // Générer un corps de boucle qui respecte les contraintes
        const bodyOptions = {
            loopVar,
            difficulty,
            useAdvancedOps: useAdvancedListOps
        };
    
        const bodyLines = generateStructureBody(indentLevel, 'for_list', bodyOptions);
        
        bodyLines.forEach(line => codeLines.push(line));
        
        
        indentLevel--;
        linesGenerated += 1 + bodyLines.length; // 1 pour la ligne "for" + nombre de lignes du corps
    }
    
    // Génération d'une boucle for..str
    function generateForStrLoop() {
        const indent = safeIndent(indentLevel);
        let iterableExpr; // Expression itérable pour la boucle for
       
        // Vérifier si des variables str sont disponibles pour être parcourues
        if (options.var_str_count > 0 && declaredVarsByType.str.length > 0) {
            // Utiliser une variable de type str parmi celles déclarées
            iterableExpr = getRandomItem(declaredVarsByType.str);
        } else {
            // Sinon, utiliser directement un littéral créé pour l'occasion
            iterableExpr = LITERALS_BY_TYPE.str();
        }
        
        // Nom pour l'itérateur
        const charVar = generateUniqueIteratorName('str');
        
        codeLines.push(`${indent}for ${charVar} in ${iterableExpr}:`);
        indentLevel++;
        
        // Corps de la boucle
        const bodyLines = generateStructureBody(indentLevel, 'for_str', { 
            loopVar: charVar,
            difficulty
        });
        
        bodyLines.forEach(line => codeLines.push(line));
        
        indentLevel--;
        linesGenerated += 1 + bodyLines.length;
    }

    
    // Génération d'une boucle while
    function generateWhileLoop(useLogicalOperator = false) {
        const indent = safeIndent(indentLevel);
        const whileCondition = buildWhileConditionSpec(useLogicalOperator, difficulty);

        // Le contrôle de sortie repose sur une variable qui progresse vers une borne connue.
        codeLines.push(`${indent}while ${whileCondition.condition}:`);
        indentLevel++;
        
        // Générer le corps de la boucle
        const bodyLines = generateStructureBody(indentLevel, 'while', { 
            conditionVar: whileCondition.intVar,
            protectedVars: whileCondition.protectedVars,
            difficulty
        });
        
        // Ajouter les lignes du corps au code
        bodyLines.forEach(line => codeLines.push(line));

        // Toujours rapprocher la variable de contrôle de sa borne de sortie.
        codeLines.push(`${safeIndent(indentLevel)}${whileCondition.progressionOperation}`);
        
        indentLevel--;
        linesGenerated += 2 + bodyLines.length;
    }
    
    /**
     * Orchestre la génération complète d'une fonction Python :
     * 1. Choisit un nom et des paramètres pertinents en fonction des options.
     * 2. Détermine si la fonction doit retourner une valeur ou avoir un effet visible (print).
     * 3. Fait appel à `generateStructureBody` pour créer un corps de fonction cohérent.
     * 4. Décide si la fonction doit être appelée après sa définition.
     * 5. Génère l'appel de fonction, en stockant le résultat si nécessaire.
     */
    function generateFunction() {
        // Récupère l'indentation actuelle pour un formatage correct.
        const indent = safeIndent(indentLevel);
        // Choisit un nom de fonction aléatoire parmi une liste prédéfinie pour plus de réalisme.
        let funcName = getRandomItem(FUNCTION_NAMES);
        let params = [];
        
        // Détermine le nombre et les noms des paramètres en fonction des options de l'interface.
        if (options.func_def_ab) {
            // Si l'option 'def f(a, b)' est cochée, génère deux noms de paramètres pertinents.
            params = chooseAppropriateParameterNames(funcName, 2);
        } else if (options.func_def_a) {
            // Si l'option 'def f(a)' est cochée, génère un seul nom de paramètre.
            params = chooseAppropriateParameterNames(funcName, 1);
        }
        
        // Déduit le type probable de chaque paramètre à partir de son nom pour générer un corps de fonction logique.
        const paramTypes = params.map(param => {
            if (INT_VAR_NAMES.includes(param)) {
                return 'int';
            } else if (STR_VAR_NAMES.includes(param)) {
                return 'str';
            } else if (LIST_VAR_NAMES.includes(param)) {
                return 'list';
            } else if (BOOL_VAR_NAMES.includes(param)) {
                return 'bool';
            } else if (FLOAT_VAR_NAMES.includes(param)) {
                return 'float';
            } else {
                return 'int'; // Type par défaut si le nom n'est pas reconnu.
            }
        });

        // Génère la ligne de définition de la fonction (ex: "def calculate(a, b):").
        codeLines.push(`${indent}def ${funcName}(${params.join(", ")}):`);
        indentLevel++;
        
        // --- Logique de décision pour l'utilité de la fonction ---

        // Par défaut, une fonction retourne une valeur si l'option est cochée ou si la difficulté est élevée.
        let useReturnValue = options.func_return || difficulty >= 2;

        // Évalue si la fonction est "importante" (avec paramètres, return, etc.) pour décider si on doit l'appeler.
        const hasParams = params.length > 0;
        const hasAdvancedFeatures = options.func_def_ab || options.func_op_list || options.func_op_str;
        const isImportant = useReturnValue || hasAdvancedFeatures || difficulty >= 3;
        
        // Décide d'appeler la fonction si elle est jugée importante ou avec une probabilité aléatoire sinon.
        const shouldCallFunction = isImportant || (hasParams && Math.random() < 0.7) || Math.random() < 0.4;

        // Pour garantir un code pédagogique, si on décide d'appeler la fonction et que l'option 'print'
        // n'est pas disponible, on force la fonction à retourner une valeur pour que son effet soit visible.
        if (shouldCallFunction && !options.builtin_print) {
            useReturnValue = true;
        }

        // Délègue la création du corps de la fonction à `generateStructureBody`.
        const bodyLines = generateStructureBody(indentLevel, 'function', { 
            params, 
            paramTypes, // Passe les types pour générer des opérations valides.
            difficulty,
            hasReturn: useReturnValue, // Indique si un 'return' est attendu.
            hasPrint: !useReturnValue && options.builtin_print, // Un 'print' interne est possible si pas de 'return'.
            hasInput: options.builtin_input
        });
        
        // Ajoute les lignes du corps généré au code final.
        bodyLines.forEach(line => codeLines.push(line));
        indentLevel--;
        linesGenerated += 1 + bodyLines.length; // Met à jour le compteur de lignes.

        
        // --- Génération de l'appel de la fonction ---
        
        // N'appelle la fonction que si la décision a été prise
        if (shouldCallFunction ) { //&& linesGenerated < targetLines
        
            // Génère des arguments concrets pour l'appel, correspondant aux types des paramètres.
            const args = params.map((param, index) => {
                const paramType = paramTypes[index];
                return ensureVariableExists(paramType);
           });
            
            // Comportement différent selon que la fonction retourne une valeur ou non.
            if (useReturnValue) {
                // Le type de la variable de résultat doit correspondre au type de ce que la fonction retourne.
                // On infère le type de retour à partir du type du premier paramètre (meilleure heuristique disponible).
                const returnType = paramTypes.length > 0 ? paramTypes[0] : 'int';
                const resultVar = generateUniqueVarName(returnType);
                const callStatement = `${resultVar} = ${funcName}(${args.join(", ")})`;
                
                // Enregistre la nouvelle variable de résultat avec le bon type.
                allDeclaredVarNames.add(resultVar);
                declaredVarsByType[returnType].push(resultVar);
                
                // Ajoute la ligne d'appel et d'affectation.
                codeLines.push(`${indent}${callStatement}`);
                
                // Optionnellement, ajoute un 'print' pour afficher le résultat, rendant l'opération visible.
                if (options.builtin_print || difficulty >= 3) {
                    const formattedArgs = args.map((arg, index) => {
                        const argType = paramTypes[index];
                        return argType === 'str' ? arg : `str(${arg})`;
                    });
                    
                    // Adapte le message du 'print' à la difficulté.
                    if (difficulty <= 2) {
                        codeLines.push(`${indent}print("Le résultat de ${funcName} est " + str(${resultVar}))`);
                    } else {
                         // Vérifier si formattedArgs a des éléments avant de faire le join
                        const argsDisplay = formattedArgs.length > 0 
                            ? `"(" + ${formattedArgs.join(' + ", " + ')} + ")"`
                            : `"()"`;
                        codeLines.push(`${indent}print("Le résultat de " + "${funcName}" + ${argsDisplay} + " est " + str(${resultVar}))`);
                    }
                    linesGenerated += 2;
                } else {
                    linesGenerated++;
                }
            } else {
                // Si la fonction ne retourne rien (elle a probablement un 'print' interne), on l'appelle simplement.
                const callStatement = `${funcName}(${args.join(", ")})`;
                codeLines.push(`${indent}${callStatement}`);
                linesGenerated++;
            }
        }
    }

    function chooseAppropriateParameterNames(funcName, count) {
        // Paramètres possibles selon la catégorie de fonction
        const mathParams = ['x', 'y', 'n', 'a', 'b', 'num1', 'num2', 'value'];
        const dataParams = ['data', 'items', 'elements', 'values', 'collection'];
        const textParams = ['text', 'message', 'content', 'string', 'input', 'name'];
        const utilParams = ['value', 'option', 'flag', 'mode', 'config'];
        const genericParams = ['param1', 'param2', 'arg1', 'arg2', 'option1', 'option2'];
        
        // Sélectionner la liste appropriée selon le nom de la fonction
        let paramList;
        if (MATH_FUNCTIONS.includes(funcName)) {
            paramList = mathParams;
        } else if (DATA_FUNCTIONS.includes(funcName)) {
            paramList = dataParams;
        } else if (TEXT_FUNCTIONS.includes(funcName)) {
            paramList = textParams;
        } else if (UTIL_FUNCTIONS.includes(funcName)) {
            paramList = utilParams;
        } else if (GENERIC_FUNCTIONS.includes(funcName)) {
            paramList = genericParams;
        } else {
            paramList = utilParams; // Par défaut
        }
        
        // Mélanger les paramètres et en prendre le nombre demandé
        const shuffled = [...paramList].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    // Fonction utilitaire pour garantir des indentations valides
    function safeIndent(level) {
        return "    ".repeat(Math.max(0, level));
    }

    function generateAppropriateStatement() {
        // Cette fonction génère une instruction adaptée au contexte et aux variables disponibles
        
        // Déterminer les types de variables disponibles
        const availableTypes = Object.keys(declaredVarsByType)
            .filter(type => declaredVarsByType[type].length > 0);
        
        if (availableTypes.length === 0) {
            return "pass  # Aucune variable disponible";
        }
        
        // Choisir un type de variable au hasard parmi ceux disponibles
        const chosenType = getRandomItem(availableTypes);
        const variable = getRandomItem(declaredVarsByType[chosenType]);
        
        // Générer une instruction adaptée au type
        return generateVariedOperation(chosenType, variable, difficulty);
    }



    // D'abord calculer les lignes requises pour les structures demandées
    function calculateRequiredLines() {
        if (window.GenerationRequirements) {
            const varCounts = window.GenerationRequirements.getRequestedVarCounts(options);
            const requirements = window.GenerationRequirements.calculateStructureRequirements(options, varCounts);
            const requiredVars = requirements.totalStructuralVariables;

            if (options.numTotalVariablesGlobal < requiredVars) {
                options.numTotalVariablesGlobal = requiredVars;
            }

            return requirements.requiredLines;
        }

        return 0;
    }

    /**
     * S'assure que toutes les variables déclarées sont utilisées au moins une fois dans le code.
     * Ajoute une opération "variée" pour les variables non utilisées.
     */
    function ensureAllVariablesAreUsed() {
        // Pour chaque type de variable
        for (const type in declaredVarsByType) {
            const variables = declaredVarsByType[type];
            
            // Vérifier chaque variable pour voir si elle est utilisée
            for (const varName of variables) {
                if (variableRegistry[varName]?.skipUsageRequirement) {
                    continue;
                }

                // Vérifier si la variable est utilisée quelque part dans le code (autre que sa déclaration)
                const isUsed = codeLines.some(line => {
                    return line.includes(varName) && !line.trim().startsWith(`${varName} =`);
                });
                
                // Si non utilisée, ajouter une opération l'utilisant
                if (!isUsed && linesGenerated < targetLines) {
                    // Générer une opération variée adaptée au type de variable
                    const operation = generateVariedOperation(type, varName, difficulty);
                    codeLines.push(operation);
                    linesGenerated++;
                }
            }
        }
    }
    
    function ensureVariablesOfType(type, count) {
        while (declaredVarsByType[type].length < count) {
            const varName = generateUniqueVarName(type);
            const value = generateValueForType(type);
            codeLines.push(`${varName} = ${value}`);
            declaredVarsByType[type].push(varName);
            allDeclaredVarNames.add(varName);
            linesGenerated++;
        }
    }

        // Vérification des variables planifiées (nouvelles variables)
        for (const type in plannedVarsByType) {
            // Seules les variables planifiées qui ne sont pas des itérateurs doivent être déclarées
            const varsToCheck = plannedVarsByType[type].filter(name => 
                !name.startsWith('i') && !name.startsWith('j') && 
                !name.startsWith('char') && !name.startsWith('text')
            );
            
            for (const varName of varsToCheck) {
                let initialValue;
                switch (type) {
                    case 'int': initialValue = "0"; break;
                    case 'float': initialValue = "0.0"; break;
                    case 'str': initialValue = '""'; break;
                    case 'bool': initialValue = "False"; break;
                    case 'list': initialValue = "[]"; break;
                    default: initialValue = "None";
                }
                
                codeLines.unshift(`${varName} = ${initialValue}  # Variable planifiée initialisée`);
                linesGenerated++;
                
                // Déplacer de plannedVarsByType à declaredVarsByType
                allPlannedVarNames.delete(varName);
                declaredVarsByType[type].push(varName);
                allDeclaredVarNames.add(varName);
            }
        }

        // Vérification des variables planifiées (nouvelles variables)
        for (const type in declaredVarsByType) {
            for (const varName of declaredVarsByType[type]) {
                // Vérifier si la variable apparaît déjà dans une ligne d'initialisation
                const isAlreadyDeclared = codeLines.some(line => {
                    return line.trim().startsWith(`${varName} =`);
                });
                
                // Si non déclarée, l'initialiser avec une valeur appropriée
                if (!isAlreadyDeclared) {
                    let initialValue;
                    switch (type) {
                        case 'int': initialValue = "0"; break;
                        case 'float': initialValue = "0.0"; break;
                        case 'str': initialValue = '""'; break;
                        case 'bool': initialValue = "False"; break;
                        case 'list': initialValue = "[]"; break;
                        default: initialValue = "None";
                    }
                    
                    // Ajouter la déclaration au début du code
                    codeLines.unshift(`${varName} = ${initialValue}  # Initialisation obligatoire`);
                    linesGenerated++;
                }
            }
        }

    function finalVariableCheck() {
        // S'assurer que toutes les variables "planifiées" ont été déclarées
        for (const type in plannedVarsByType) {
            // Filtrer pour exclure les variables d'itération typiques
            const varsToCheck = plannedVarsByType[type].filter(name => 
                !name.startsWith('i') && !name.startsWith('j') && 
                !name.startsWith('char') && !name.startsWith('text')
            );
            
            for (const varName of varsToCheck) {
                console.warn(`Variable planifiée non déclarée: ${varName} (${type})`);
                declareVariable(varName, type, getDefaultValueForType(type));
            }
        }
        
        // Vérification existante pour les variables déclarées
        for (const type in declaredVarsByType) {
            for (const varName of declaredVarsByType[type]) {
                const isActuallyDeclared = codeLines.some(line => 
                    line.trim().startsWith(`${varName} =`)
                );
                
                if (!isActuallyDeclared) {
                    codeLines.unshift(`${varName} = ${getDefaultValueForType(type)}  # Initialisation obligatoire`);
                    linesGenerated++;
                }
            }
        }
    }

    function getDefaultValueForType(type) {
        switch (type) {
            case 'int': return "0";
            case 'float': return "0.0";
            case 'str': return '""';
            case 'bool': return "False";
            case 'list': return "[]";
            default: return "None";
        }
    }

    /**
     * S'assure que le nombre de variables de chaque type est conforme aux options.
     * 
     */
    function ensureVariablesForOptions() {
        // Variables pour les options sélectionnées
        if (options.var_int_count > 0) {
            ensureVariablesOfType('int', options.var_int_count);
        }
        if (options.var_float_count > 0) {
            ensureVariablesOfType('float', options.var_float_count);
        }
        if (options.var_str_count > 0) {
            ensureVariablesOfType('str', options.var_str_count);
        }
        if (options.var_list_count > 0) {
            ensureVariablesOfType('list', options.var_list_count);
        }
        if (options.var_bool_count > 0) {
            ensureVariablesOfType('bool', options.var_bool_count);
        }
        
        // Variables pour les structures
        ensureRequiredVariables();
    }

    /**
     * S'assure que les variables nécessaires aux structures de contrôle
     * (conditions, boucles, etc.) sont présentes.
     */
    function ensureRequiredVariables() {
        // Pour les conditions
        if (options.main_conditions && (options.cond_if || options.cond_if_if || options.cond_if_if_if)) { // replier le frame 'Ctrl' devrait vouloir dire 'pas de conditionnelles'
            if (declaredVarsByType.bool.length === 0 && declaredVarsByType.int.length === 0) {
                // Préférer créer une variable bool car plus explicite pour les conditions
                ensureVariableExists('bool'); // Utiliser la nouvelle fonction propre
            }
        }
        // Pour les boucles, la logique devrait être gérée DANS chaque fonction de boucle.
        
        // for_list sans list explicite doit pouvoir itérer sur une liste littérale.
        if (options.loop_for_list && options.var_list_count > 0 && declaredVarsByType.list.length === 0) {
            ensureVariableExists('list');
        }
        if (options.loop_for_str && declaredVarsByType.str.length === 0) {
            ensureVariableExists('str');
        }

        if (hasRequestedSlices() && declaredVarsByType.str.length === 0 && declaredVarsByType.list.length === 0) {
            ensureVariableExists(options.var_list_count > 0 ? 'list' : 'str');
        }
    }

    function ensureRequestedSliceOperation() {
        if (!hasRequestedSlices() || hasGeneratedRequestedSlice) {
            return;
        }

        let sliceType;
        const availableTypes = ['str', 'list'].filter(type => declaredVarsByType[type].length > 0);

        if (availableTypes.length > 0) {
            sliceType = getRandomItem(availableTypes);
        } else {
            sliceType = options.var_list_count > 0 ? 'list' : 'str';
            ensureVariableExists(sliceType);
        }

        const sliceVar = ensureVariableExists(sliceType);
        const operation = buildSliceAssignment(sliceType, sliceVar);

        if (operation && !codeLines.some(line => line.trim() === operation.trim())) {
            codeLines.push(operation);
            linesGenerated++;
        }
    }

    function ensureRequestedLogicalOperations() {
        const requestedOperators = Array.from(new Set(getRequestedLogicalOperators()));

        if (requestedOperators.length === 0) {
            return;
        }

        requestedOperators.forEach(operator => {
            const alreadyPresent = codeLines.some(line => lineContainsLogicalOperator(line, operator));
            if (alreadyPresent) {
                return;
            }

            const sourceBool = ensureVariableExists('bool');
            const otherBoolCandidates = declaredVarsByType.bool.filter(name => name !== sourceBool);
            const rightOperand = otherBoolCandidates.length > 0
                ? getRandomItem(otherBoolCandidates)
                : getRandomItem(['True', 'False']);
            let expression;
            let preferredBase;

            if (operator === 'not') {
                expression = `not ${sourceBool}`;
                preferredBase = `not_${sourceBool}`;
            } else if (operator === 'and') {
                expression = `${sourceBool} and ${rightOperand}`;
                preferredBase = `${sourceBool}_and_result`;
            } else {
                expression = `${sourceBool} or ${rightOperand}`;
                preferredBase = `${sourceBool}_or_result`;
            }

            const alreadyDeclared = codeLines.some(line => line.trim() === `${preferredBase} = ${expression}`.trim());
            if (!alreadyDeclared) {
                declareDerivedVariable('bool', expression, preferredBase, {
                    operatorFamily: 'logical',
                    operator
                });
            }
        });
    }

    function ensureRequestedMembershipOperations() {
        if (!(options.op_membership || options.op_in || options.op_not_in)) {
            return;
        }

        const requestedOperators = Array.from(new Set(getRequestedMembershipOperators()));
        if (requestedOperators.length === 0) {
            return;
        }

        requestedOperators.forEach(operator => {
            const alreadyPresent = codeLines.some(line => lineContainsMembershipOperator(line, operator));
            if (alreadyPresent) {
                return;
            }

            const availableTypes = [];
            if (declaredVarsByType.str.length > 0 || options.var_str_count > 0) availableTypes.push('str');
            if (declaredVarsByType.list.length > 0 || options.var_list_count > 0) availableTypes.push('list');

            const sourceType = availableTypes.length > 0 ? getRandomItem(availableTypes) : 'str';
            let expression;
            let preferredBase;

            if (sourceType === 'list') {
                const listVar = ensureVariableExists('list');
                const probeValue = getRandomInt(1, 5);
                expression = operator === 'not in'
                    ? `${probeValue} not in ${listVar}`
                    : `${probeValue} in ${listVar}`;
                preferredBase = `${listVar}_${operator === 'not in' ? 'not_in' : 'in'}_result`;
            } else {
                const strVar = ensureVariableExists('str');
                const probeChar = getRandomItem(['a', 'e', 'i', 'o', 'u', 'y']);
                expression = operator === 'not in'
                    ? `"${probeChar}" not in ${strVar}`
                    : `"${probeChar}" in ${strVar}`;
                preferredBase = `${strVar}_${operator === 'not in' ? 'not_in' : 'in'}_result`;
            }

            const declarationPreview = `${sanitizePreferredVarBase(preferredBase, 'bool')} = ${expression}`;
            if (!codeLines.some(line => line.trim() === declarationPreview.trim())) {
                declareDerivedVariable('bool', expression, preferredBase, {
                    operatorFamily: 'membership',
                    operator
                });
            }
        });
    }

    function ensureRequestedComparisonOperations() {
        if (!options.op_comparison) {
            return;
        }

        const requestedOperators = Array.from(new Set(getAllowedComparisonOperators()));
        if (requestedOperators.length === 0) {
            return;
        }

        const comparisonLabels = {
            '==': 'eq',
            '!=': 'ne',
            '<': 'lt',
            '>': 'gt',
            '<=': 'le',
            '>=': 'ge',
            'is': 'is',
            'is not': 'is_not'
        };

        requestedOperators.forEach(operator => {
            const alreadyPresent = codeLines.some(line => lineContainsComparisonOperator(line, operator));
            if (alreadyPresent) {
                return;
            }

            let expression;
            let preferredBase;

            if (operator === 'is') {
                const boolSourceVar = ensureVariableExists('bool');
                expression = `${boolSourceVar} is True`;
                preferredBase = `${boolSourceVar}_is_true`;
            } else if (operator === 'is not') {
                const boolSourceVar = ensureVariableExists('bool');
                expression = `${boolSourceVar} is not False`;
                preferredBase = `${boolSourceVar}_is_not_false`;
            } else {
                if (declaredVarsByType.int.length > 0) {
                    const leftIntVar = getRandomItem(declaredVarsByType.int);
                    let rightExpression;

                    if (declaredVarsByType.int.length > 1 && Math.random() > 0.5) {
                        rightExpression = getRandomItem(declaredVarsByType.int.filter(name => name !== leftIntVar));
                    } else {
                        rightExpression = `${getRandomInt(-5, 5)}`;
                    }

                    expression = `${leftIntVar} ${operator} ${rightExpression}`;
                    preferredBase = `${leftIntVar}_${comparisonLabels[operator]}_result`;
                } else {
                    const sequenceCandidates = [
                        ...declaredVarsByType.str.map(name => ({ expression: `len(${name})`, label: `len_${name}` })),
                        ...declaredVarsByType.list.map(name => ({ expression: `len(${name})`, label: `len_${name}` }))
                    ];

                    if (sequenceCandidates.length > 0) {
                        const leftSequence = getRandomItem(sequenceCandidates);
                        expression = `${leftSequence.expression} ${operator} ${getRandomInt(1, 8)}`;
                        preferredBase = `${leftSequence.label}_${comparisonLabels[operator]}_result`;
                    } else if ((operator === '==' || operator === '!=') && declaredVarsByType.bool.length > 0) {
                        const boolSourceVar = getRandomItem(declaredVarsByType.bool);
                        const boolLiteral = getRandomItem(['True', 'False']);
                        expression = `${boolSourceVar} ${operator} ${boolLiteral}`;
                        preferredBase = `${boolSourceVar}_${comparisonLabels[operator]}_result`;
                    } else {
                        const intVar = ensureVariableExists('int');
                        expression = `${intVar} ${operator} ${getRandomInt(-5, 5)}`;
                        preferredBase = `${intVar}_${comparisonLabels[operator]}_result`;
                    }
                }
            }

            const declarationPreview = `${sanitizePreferredVarBase(preferredBase, 'bool')} = ${expression}`;
            if (!codeLines.some(line => line.trim() === declarationPreview.trim())) {
                declareDerivedVariable('bool', expression, preferredBase, {
                    operatorFamily: 'comparison',
                    operator
                });
            }
        });
    }
    /**
     * fonction pour ajouter des opérations simples pour compléter le nombre de lignes requis.
     * Cette fonction est appelée dans un while() pour remplir le code jusqu'à atteindre targetLines.
     * Elle choisit aléatoirement un type de variable et une variable à modifier,
     */
    function addFiller() {
    if (linesGenerated >= targetLines) return false; // Si on a atteint la limite, ne rien faire

    // Garder trace des dernières opérations pour éviter les répétitions
    // L'objet window global à l'environnement du navigateur permet de se souvenir des dernières générations
    if (!window._lastFillerOps) window._lastFillerOps = [];

    // Trouver les types disponibles : quel type de variable modifier
    const availableTypes = Object.keys(declaredVarsByType).filter(type => 
        declaredVarsByType[type].length > 0
    );
    
    if (availableTypes.length === 0) {
        codeLines.push("# Pas de variables disponibles pour plus d'opérations");
        linesGenerated++;
        return true;
    }

    // Choisir un type aléatoire, en évitant de répéter le dernier type utilisé si possible
    let type;
    if (window._lastFillerOps.length > 0 && availableTypes.length > 1) {
        const lastType = window._lastFillerOps[window._lastFillerOps.length - 1].type;
        type = getRandomItem(availableTypes.filter(t => t !== lastType));
    } else {
        type = getRandomItem(availableTypes);
    }
    
    // Choisir une variable aléatoire de ce type, en évitant de répéter la dernière variable si possible
    let varToModify;
    if (window._lastFillerOps.length > 0 && declaredVarsByType[type].length > 1) {
        const lastVar = window._lastFillerOps[window._lastFillerOps.length - 1].variable;
        varToModify = getRandomItem(declaredVarsByType[type].filter(v => v !== lastVar));
    } else {
        varToModify = getRandomItem(declaredVarsByType[type]);
    }

    // Générer une opération variée pour cette variable
    // Essayer plusieurs fois de générer une opération différente
    let operation;
    let isRepeat = false;
    const maxAttempts = 3;
    let attempts = 0;

    do {
        operation = generateVariedOperation(type, varToModify, difficulty);
        
        // Vérifier si cette opération est identique à une des dernières
        isRepeat = window._lastFillerOps.some(op => op.operation === operation);
        
        attempts++;
    } while (isRepeat && attempts < maxAttempts);

    // Si après plusieurs tentatives on a toujours une répétition, forcer une variation
    if (isRepeat) {
        // Stratégie 1: Ajouter un commentaire unique pour rendre l'opération différente
        const uniqueId = Math.random().toString(36).substring(2, 5);
        operation = operation.replace(/\s*#.*$/, '') + `  # unique_${uniqueId}`;
        
        // Stratégie 2 (alternative): Essayer d'inverser l'ordre des opérandes si possible
        if (operation.includes('=') && operation.includes('+')) {
            const parts = operation.split('=');
            if (parts.length === 2) {
                const leftSide = parts[0].trim();
                               const rightSide = parts[1].trim();
                
                // Si le format est "var = var + x", essayer "var = x + var"
                if (rightSide.startsWith(leftSide + ' +')) {
                    const addParts = rightSide.split('+');
                    if (addParts.length === 2) {
                        operation = `${leftSide} = ${addParts[1].trim()} + ${leftSide}`;
                    }
                }
            }
        }
    }
    
    // Mémoriser cette opération pour éviter les répétitions
    window._lastFillerOps.push({ type, variable: varToModify, operation });
    // Garder seulement les 3 dernières en mémoire
    if (window._lastFillerOps.length > 5) window._lastFillerOps.shift();

    codeLines.push(operation);
    linesGenerated++;
    return true;
}

    function generateVariedOperation(type, varName, difficulty) {
        const allowedFamilies = getAllowedOperationFamilies();
        const comparisonOperators = getAllowedComparisonOperators(difficulty);
        const numericComparisonOperators = comparisonOperators.filter(operator => ['==', '!=', '<', '>', '<=', '>='].includes(operator));
        const equalityOperators = numericComparisonOperators.filter(operator => operator === '==' || operator === '!=');
        const identityComparisonOperators = comparisonOperators.filter(operator => operator === 'is' || operator === 'is not');
        const membershipOperators = getAllowedMembershipOperators(difficulty);
        const membershipBias = getMembershipPreferenceWeight(difficulty);
        const canUseComparisonExpressions = comparisonOperators.length > 0;

        const intOperations = [];
        if (allowedFamilies.arithmetic.plusMinus) {
            intOperations.push(
                () => `${varName} = ${varName} + ${getRandomInt(1, difficulty + 1)}`,
                () => `${varName} = ${getRandomInt(1, difficulty + 1)} + ${varName}`,
                () => `${varName} += ${getRandomInt(1, 3)}  # Incrémenter ${varName}`,
                () => `${varName} -= ${getRandomInt(1, 3)}  # Décrémenter ${varName}`,
                () => `${varName} += ${getRandomInt(1, 5)}`
            );
        }
        if (allowedFamilies.arithmetic.multiply) {
            intOperations.push(
                () => `${varName} = ${varName} * ${getRandomInt(2, difficulty + 1)}`,
                () => `${varName} = ${getRandomInt(2, difficulty + 1)} * ${varName}`,
                ...(difficulty >= 5 ? [() => `${varName} *= ${getRandomInt(2, 3)}`] : [])
            );
        }
        if (allowedFamilies.arithmetic.power) {
            intOperations.push(
                () => `${varName} = ${varName} ** 2`,
                ...(difficulty >= 5 ? [() => `${varName} = ${varName} ** ${getRandomInt(2, 3)}`] : [])
            );
        }
        if (allowedFamilies.arithmetic.floorDiv) {
            intOperations.push(
                () => `${varName} = ${varName} // ${getRandomInt(2, difficulty + 1)}`,
                ...(difficulty >= 5 ? [() => `${varName} //= ${getRandomInt(2, 3)}`] : [])
            );
        }
        if (allowedFamilies.arithmetic.modulo) {
            intOperations.push(
                () => `${varName} = ${varName} % ${getRandomInt(2, difficulty + 1)}`,
                ...(difficulty >= 5 ? [() => `${varName} %= ${getRandomInt(2, 3)}`] : [])
            );
        }
        if (difficulty >= 5 && canUseComparisonExpressions) {
            intOperations.push(() => `${varName} = ${getRandomInt(-10, 10)} if ${varName} < 0 else ${varName} # syntaxe compacte (niveau plus avancé)`);
        }

        const strOperations = [];
        if (allowedFamilies.arithmetic.plusMinus) {
            strOperations.push(
                () => `${varName} = " ${getRandomItem(["texte", "donnée", "valeur", "info"])}" + ${varName}`,
                () => `${varName} = ${varName} + " ${getRandomItem(["ajout", "extension", "suite"])}"`,
                () => `${varName} += "!!!"  # Ajouter une emphase !!!`,
                ...(difficulty >= 5 && canUseComparisonExpressions ? [() => `${varName} += " (modifié)" if len(${varName}) < 20 else ""`] : []),
                () => `${varName} = "Début: " + ${varName}`,
                () => `${varName} = ${varName} + " Fin"`
            );
        }
        if (allowedFamilies.arithmetic.multiply) {
            strOperations.push(
                () => `${varName} = ${varName} * ${getRandomInt(2, Math.max(2, Math.floor(difficulty / 2) + 1))}  # Répétition de chaîne`,
                () => `${varName} = ${getRandomInt(2, Math.max(2, Math.floor(difficulty / 2) + 1))} * ${varName}  # Répétition de chaîne`,
                () => `${varName} *= ${getRandomInt(2, Math.max(2, Math.floor(difficulty / 2) + 1))}  # Répétition de chaîne`
            );
        }
        if (difficulty >= 3) {
            strOperations.push(
                () => {
                    const randomIndex = getRandomInt(0, 2);
                    return `${varName} = ${varName}.replace(${varName}[${randomIndex}], ${varName}[${randomIndex}].upper())  # Remplace le caractère à l'index ${randomIndex}`;
                },
                () => {
                    const randomIndex = getRandomInt(0, 1);
                    return `${varName} = ${varName}.replace(${varName}[${randomIndex}], "")  # Supprime un caractère`;
                },
                () => `${varName} = ${varName}.upper()`,
                () => `${varName} = ${varName}.lower()`,
                () => `${varName} = ${varName}.capitalize()`,
                () => `${varName} = ${varName}.title()`
            );
        }
        strOperations.push(...getSliceOperationBuilders('str', varName));

        const listOperations = [
            () => `${varName}.append(${getRandomInt(1, 10)})`,
            ...(difficulty >= 3 ? [
                () => `${varName}.extend([${getRandomInt(1, difficulty)}, ${getRandomInt(difficulty + 1, difficulty + 5)}])`
            ] : []),
            ...(declaredVarsByType.list.length > 0 ? [
                () => `${varName}[0] = ${getRandomInt(1, difficulty + 6)}`
            ] : []),
            ...(difficulty >= 4 ? [
                () => `${varName}.insert(${getRandomInt(0, 1)}, ${getRandomInt(-difficulty, difficulty)})`
            ] : []),
            ...(declaredVarsByType.list.length > 0 && difficulty >= 3 && canUseComparisonExpressions ? [
                () => `if len(${varName}) > 0: ${varName}.pop(0) # Suppression du premier élément`
            ] : [])
        ];
        listOperations.push(...getSliceOperationBuilders('list', varName));

        const logicalOperators = getAllowedLogicalOperators(difficulty);
        const boolLogicalOperations = [];

        if (logicalOperators.includes('not')) {
            boolLogicalOperations.push(() => `${varName} = not ${varName}`);
            if (difficulty >= 4) {
                boolLogicalOperations.push(() => `${varName} = ${varName} if ${getRandomItem(['True', 'False'])} else not ${varName}  # Opération conditionnelle avancée`);
            }
        }

        if (logicalOperators.includes('and')) {
            boolLogicalOperations.push(() => `${varName} = ${getRandomItem(['True', 'False'])} and ${getRandomItem(['True', 'False'])}`);
            if (difficulty >= 2) {
                boolLogicalOperations.push(() => `${varName} = ${varName} and ${getRandomItem(['True', 'False'])}  # Opération logique`);
                boolLogicalOperations.push(() => `${varName} = ${getRandomItem(['True', 'False'])} and ${varName}  # Opération logique`);
            }
        }

        if (logicalOperators.includes('or')) {
            boolLogicalOperations.push(() => `${varName} = ${getRandomItem(['True', 'False'])} or ${getRandomItem(['True', 'False'])}`);
            if (difficulty >= 2) {
                boolLogicalOperations.push(() => `${varName} = ${varName} or ${getRandomItem(['True', 'False'])}  # Opération logique`);
                boolLogicalOperations.push(() => `${varName} = ${getRandomItem(['True', 'False'])} or ${varName}  # Opération logique`);
            }
        }

        const boolComparisonOperations = [];
        if (numericComparisonOperators.length > 0) {
            boolComparisonOperations.push(
                () => `${varName} = ${getRandomInt(-difficulty, difficulty)} ${getRandomItem(numericComparisonOperators)} ${getRandomInt(-difficulty, difficulty)}`
            );
        }
        if (equalityOperators.length > 0) {
            boolComparisonOperations.push(
                () => `${varName} = ${getRandomItem(['True', 'False'])} ${getRandomItem(equalityOperators)} ${getRandomItem(['True', 'False'])}`
            );
            if (difficulty >= 4) {
                boolComparisonOperations.push(() => `${varName} = ${varName} ${getRandomItem(equalityOperators)} ${getRandomItem(['True', 'False'])}  # Opération avancée`);
            }
        }
        if (identityComparisonOperators.includes('is')) {
            boolComparisonOperations.push(() => `${varName} = ${varName} is True`);
        }
        if (identityComparisonOperators.includes('is not')) {
            boolComparisonOperations.push(() => `${varName} = ${varName} is not False`);
        }
        if (membershipOperators.length > 0 && declaredVarsByType.str.length > 0) {
            if (membershipOperators.includes('in')) {
                addWeightedCandidates(boolComparisonOperations, [() => {
                    const strVar = getRandomItem(declaredVarsByType.str);
                    return `${varName} = "${getRandomItem(['a', 'e', 'i'])}" in ${strVar}`;
                }], membershipBias);
            }
            if (membershipOperators.includes('not in')) {
                addWeightedCandidates(boolComparisonOperations, [() => {
                    const strVar = getRandomItem(declaredVarsByType.str);
                    return `${varName} = "${getRandomItem(['a', 'e', 'i'])}" not in ${strVar}`;
                }], membershipBias);
            }
        }
        if (membershipOperators.length > 0 && declaredVarsByType.list.length > 0) {
            if (membershipOperators.includes('in')) {
                addWeightedCandidates(boolComparisonOperations, [() => {
                    const listVar = getRandomItem(declaredVarsByType.list);
                    return `${varName} = ${getRandomInt(1, 5)} in ${listVar}`;
                }], membershipBias);
            }
            if (membershipOperators.includes('not in')) {
                addWeightedCandidates(boolComparisonOperations, [() => {
                    const listVar = getRandomItem(declaredVarsByType.list);
                    return `${varName} = ${getRandomInt(1, 5)} not in ${listVar}`;
                }], membershipBias);
            }
        }

        const boolOperations = [...boolLogicalOperations, ...boolComparisonOperations];
        if (difficulty >= 5 && allowedFamilies.arithmetic.plusMinus) {
            boolOperations.push(() => `${varName} = ${varName} + ${getRandomInt(0, 1)}  # Opération arithmétique sur booléen (niveau avancé)`);
        }
        if (difficulty >= 5 && allowedFamilies.arithmetic.multiply) {
            boolOperations.push(() => `${varName} = ${getRandomInt(1, 3)} * ${varName}  # Opération arithmétique sur booléen (niveau avancé)`);
        }

        const floatOperations = [];
        if (allowedFamilies.arithmetic.plusMinus) {
            floatOperations.push(
                () => `${varName} = ${varName} + ${(Math.random() * difficulty + 0.1).toFixed(1)}`,
                () => `${varName} = ${varName} - ${(Math.random() * difficulty + 0.1).toFixed(1)}`,
                () => `${varName} += ${(Math.random() * 2 + 0.1).toFixed(1)}`,
                () => `${varName} -= ${(Math.random() * 2 + 0.1).toFixed(1)}`
            );
        }
        if (allowedFamilies.arithmetic.multiply) {
            floatOperations.push(
                () => `${varName} = ${varName} * ${(1 + Math.random()).toFixed(1)}`,
                ...(difficulty >= 3 ? [
                    () => `${varName} *= ${(1.5 + Math.random()).toFixed(3)}`
                ] : [])
            );
        }
        if (allowedFamilies.arithmetic.power) {
            floatOperations.push(
                () => `${varName} = ${varName} ** 2`
            );
        }
        if (allowedFamilies.arithmetic.floorDiv) {
            floatOperations.push(
                () => `${varName} = ${varName} // ${(1 + Math.random()).toFixed(1)}`
            );
        }
        if (allowedFamilies.arithmetic.modulo) {
            floatOperations.push(
                () => `${varName} = ${varName} % ${(1 + Math.random()).toFixed(1)}`,
                ...(difficulty >= 3 ? [() => `${varName} %= ${(1.5 + Math.random()).toFixed(3)}`] : [])
            );
        }

        const operations = {
            int: intOperations.length > 0 ? intOperations : [() => `${varName} = ${varName} + 1`],
            str: strOperations.length > 0 ? strOperations : [() => `${varName} = ${varName}`],
            list: listOperations,
            bool: boolOperations,
            float: floatOperations.length > 0 ? floatOperations : [() => `${varName} = ${varName} + 1.0`]
        };
        
        // Vérifier si une opération identique a déjà été générée récemment
        let operation;
        let isRepeat = false;
        const maxAttempts = 5;
        let attempts = 0;
        
        do {
            // La logique de difficulté est déjà gérée dans la définition des opérations.
            const availableOps = operations[type] || [];
            if (availableOps.length > 0) {
                // Choisir une opération aléatoire parmi TOUTES celles qui sont disponibles.
                operation = getRandomItem(availableOps)();
            } else {
                // Fallback si aucune opération n'est disponible pour ce type.
                operation = `${varName} = ${varName}`;
            }           
            // Vérifier si cette opération est identique à la dernière
            isRepeat = window._lastFillerOps && 
                    window._lastFillerOps.length > 0 && 
                    window._lastFillerOps[window._lastFillerOps.length - 1].operation === operation;
            
            attempts++;
        } while (isRepeat && attempts < maxAttempts);
        
        // Si après plusieurs tentatives on a toujours une répétition, ajouter un commentaire unique
        // remplacer tout commentaire Python existant par un nouveau commentaire improbable
        if (isRepeat) {
            operation = operation.replace(/\s*#.*$/, '') + `  # unique_${Math.random().toString(36).substr(2, 5)}`;
        }
        // vérifier si l'opération existe déjà dans codeLines
        let exactLineExists = codeLines.some(line => 
            line.trim() === operation.trim()
        );

        // Si l'opération existe déjà dans le code, forcer une variation
        if (exactLineExists) {
            // Extraction de la valeur numérique actuelle si présente
            // Utilise une expression régulière qui capture un nombre qui n'est pas entre parenthèses
            const currentNumberMatch = operation.match(/\d+(?![^)]*\))/);
            const currentNumber = currentNumberMatch ? parseInt(currentNumberMatch[0]) : null;

            // Extraction de l'opérateur actuel si présent
            // Recherche des opérateurs arithmétiques avec ou sans signe égal
            const operatorMatch = operation.match(/(\*\*|\/\/=|\/\/|%=|\*=|\+=|-=|[+\-*%])/);
            const currentOperator = operatorMatch ? operatorMatch[0] : null;

            if (currentNumber !== null) {
                // Génération d'une nouvelle valeur numérique garantie différente
                // Évite la répétition en utilisant une boucle do-while
                let newValue;
                do {
                    newValue = getRandomInt(1, 5);
                } while (newValue === currentNumber);
                
                // Remplacement du nombre dans la chaîne d'opération
                // Utilise la même expression régulière pour cibler le remplacement
                operation = operation.replace(/\d+(?![^)]*\))/, newValue);
            } 
            else if (currentOperator && type !== 'str' && type !== 'list') {
                // Génération d'un opérateur différent
                // Sélectionne un nouvel opérateur parmi ceux disponibles, en excluant l'actuel
                const operators = getAllowedArithmeticOperatorPool(type).filter(op => op !== currentOperator);
                if (operators.length > 0) {
                    const newOperator = getRandomItem(operators);
                    operation = operation.replace(currentOperator, newOperator);
                } else {
                    operation = operation.replace(/\s*#.*$/, '') +
                        `  # unique_${Math.random().toString(36).substr(2, 5)}`;
                }
            }
            else {
                // Solution de repli : ajout d'un commentaire unique
                // Supprime tout commentaire existant et ajoute un identifiant aléatoire
                operation = operation.replace(/\s*#.*$/, '') + 
                    `  # unique_${Math.random().toString(36).substr(2, 5)}`;
            }
        }
        // Traitement spécifique pour les opérations sur chaînes de caractères
        if (type === 'str') {
            // Regex pour détecter les opérateurs arithmétiques invalides pour les chaînes (sauf + et *)
            const invalidArithmeticRegex = /(?:-=|\/\/=|%=)/;
            const invalidBinaryOpRegex = /\s(?:-|\/\/|%)\s/;

            if (invalidArithmeticRegex.test(operation) || invalidBinaryOpRegex.test(operation)) {
                // Si l'opération est invalide, la remplacer par une opération de chaîne valide
                // Generate a more varied replacement based on difficulty
                let chosenLetter = varName[getRandomInt(0, varName.length - 1)];
                const replacements = [
                    () => `${varName} = ${varName}.replace(${varName}[0], ${varName}[0].upper())`,
                    () => `${varName} = ${varName}.replace("${chosenLetter}", "${chosenLetter.toUpperCase()}")`,
                ];

                if (allowedFamilies.arithmetic.plusMinus) {
                    replacements.push(
                        () => `${varName} += " modifié"`,
                        () => `${varName} = ${varName} + "_suffix"`,
                        () => `${varName} = "prefix_" + ${varName}`,
                        () => `${varName} = ${varName}[0] + ${varName}`
                    );
                }
                if (allowedFamilies.arithmetic.multiply) {
                    replacements.push(() => `${varName} = ${varName} * ${getRandomInt(2, Math.max(2, Math.floor(difficulty / 2) + 1))}`);
                }
                
                // pour les difficultés plus élevées, ajouter des opérations plus complexes
                if (difficulty >= 3) {
                    replacements.push(() => `${varName} = ${varName}.upper()`);
                    replacements.push(() => `${varName} = ${varName}.capitalize()`);
                }
                replacements.push(...getSliceOperationBuilders('str', varName));
                
                // choisit un replacement random
                operation = getRandomItem(replacements)();
                
                // ajout pour expliquer d'où vient la substitution
                operation += "  # Opération de chaîne valide";
            }
        }
        return operation; //[type][opIndex]();
    }

     /**
     * Objectif: garantir qu'au moins une opération est générée pour chaque type de variable
     * demandé dans les options, pour rendre leur présence plus significative.
     */
    function ensureTypeSpecificOperations() {
        const typesToCheck = [
            { option: 'var_str_count', type: 'str' },
            { option: 'var_list_count', type: 'list' },
            { option: 'var_bool_count', type: 'bool' },
            { option: 'var_float_count', type: 'float' }
            // On exclue 'int' car il est déjà très utilisé par défaut
        ];

        for (const item of typesToCheck) {
            // Si le type a été demandé et qu'une variable de ce type existe
            if (options[item.option] > 0 && declaredVarsByType[item.type].length > 0) {
                // Choisir une variable de ce type
                const varName = getRandomItem(declaredVarsByType[item.type]);
                // Générer une opération variée pour elle
                const operation = generateVariedOperation(item.type, varName, difficulty);
                
                // Ajouter l'opération si elle n'est pas déjà présente
                if (!codeLines.some(line => line.trim() === operation.trim())) {
                    codeLines.push(operation);
                    linesGenerated++;
                }
            }
        }
    }
    ///////////////////////////////////////////////////////////////////////
    // ----------------- EXÉCUTION DE LA GÉNÉRATION ----------------------

    // 1. Calculer le nombre de lignes requises et initialiser les variables de base
    // et mettre à jour options.numTotalVariablesGlobal si nécessaire
    calculateRequiredLines();
    
    // 2. S'assurer que le bon nombre de variables est créé pour chaque type
    generateInitialVariables(); // 
    ensureVariablesForOptions(); // 
    ensureListVariablesCount(); // pour garantir le bon nombre de listes
    ensureTypeSpecificOperations(); // Assure au moins une opération par type demandé
    ensureRequestedSliceOperation(); // Garantit au moins un slice si demandé
   
    // 3. Générer les structures de contrôle avec des corps enrichis
    generateControlStructures();

    // Garantit les familles d'opérateurs demandées avant les passes d'usage/remplissage.
    ensureRequestedLogicalOperations();
    ensureRequestedMembershipOperations();
    ensureRequestedComparisonOperations();
    
    // 4. S'assurer que toutes les variables déclarées sont utilisées
    ensureAllVariablesAreUsed();
    
    // 5. Compléter avec des opérations variées pour atteindre le nombre de lignes cible
    while (linesGenerated < targetLines) {
        if (!addFiller()) break; // Sortir si impossible d'ajouter plus d'opérations
    }
    
    // 6. Vérification finale
    finalVariableCheck();
    
    // Vérifier que le code n'est pas vide?? just in case
    if (codeLines.length === 0) {
        codeLines.push("x = 10  # code de scours");
        codeLines.push("y = 20  # Valeur par défaut");
        codeLines.push("resultat = x + y");
    }

    // Ajoute une aide contextuelle concise pour les syntaxes inhabituelles.
    const annotatedCodeLines = codeLines.map(annotateBeginnerMutationLine);

    // Finalement... Retour du code généré ...
    return annotatedCodeLines.join("\n");
}

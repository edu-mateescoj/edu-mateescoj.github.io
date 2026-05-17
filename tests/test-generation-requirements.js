document.addEventListener('DOMContentLoaded', () => {
    describe("Minimums de generation", () => {
        it("Calcule les minimums pour toutes les conditions", async () => {
            const requirements = window.GenerationRequirements.calculateGenerationMinimums({
                main_conditions: true,
                cond_if: true,
                cond_if_elif: true,
                cond_if_elif_else: true,
                cond_if_if: true,
                cond_if_if_if: true
            });

            expect(requirements.minLines).toBe(16);
            expect(requirements.minVariables).toBe(1);
        });

        it("Calcule les minimums pour toutes les boucles avancees", async () => {
            const requirements = window.GenerationRequirements.calculateGenerationMinimums({
                main_loops: true,
                loop_for_range: true,
                loop_range_ab: true,
                loop_range_abs: true,
                loop_nested_for2: true,
                loop_nested_for3: true,
                loop_for_list: true,
                loop_for_str: true,
                loop_while: true,
                loop_while_op: true
            });

            expect(requirements.minLines).toBe(19);
            expect(requirements.minVariables).toBe(10);
        });

        it("Compte for_list avec un seul cout variable sans liste explicite", async () => {
            const requirements = window.GenerationRequirements.calculateGenerationMinimums({
                main_loops: true,
                loop_for_list: true
            });

            expect(requirements.minLines).toBe(5);
            expect(requirements.minVariables).toBe(2);
        });

        it("Calcule les minimums pour les fonctions", async () => {
            const requirements = window.GenerationRequirements.calculateGenerationMinimums({
                main_functions: true,
                func_def_simple: true,
                func_def_ab: true,
                builtin_print: true,
                func_return: true
            });

            expect(requirements.minLines).toBe(8);
            expect(requirements.minVariables).toBe(2);
        });

        it("Tient compte des variables explicites avant d'ajouter les structures", async () => {
            const requirements = window.GenerationRequirements.calculateGenerationMinimums({
                var_int_count: 2,
                var_list_count: 1,
                var_str_count: 1,
                main_loops: true,
                loop_for_list: true,
                loop_for_str: true
            });

            expect(requirements.minLines).toBe(8);
            expect(requirements.minVariables).toBe(6);
        });

        it("Surligne bool en suggestion pour les structures if", async () => {
            const plan = window.GenerationRequirements.calculateHighlightPlan({
                main_conditions: true,
                cond_if: true
            });

            expect(plan.highlights['var-bool'].state).toBe('suggested');
        });

        it("Surligne for_List et for_Str en suggestion seulement", async () => {
            const listPlan = window.GenerationRequirements.calculateHighlightPlan({
                main_loops: true,
                loop_for_list: true
            });
            const strPlan = window.GenerationRequirements.calculateHighlightPlan({
                main_loops: true,
                loop_for_str: true
            });

            expect(listPlan.highlights['var-list'].state).toBe('suggested');
            expect(strPlan.highlights['var-str'].state).toBe('suggested');
        });

        it("Impose comparaison et entier pour un while sans int explicite", async () => {
            const plan = window.GenerationRequirements.calculateHighlightPlan({
                difficultyLevelGlobal: 1,
                main_loops: true,
                loop_while: true
            });

            expect(plan.highlights['op-comparison'].state).toBe('required');
            expect(plan.highlights['var-int'].state).toBe('required');
        });

        it("Suggère le membership dès qu'une séquence est disponible", async () => {
            const plan = window.GenerationRequirements.calculateHighlightPlan({
                var_str_count: 1
            });

            expect(plan.highlights['op-membership'].state).toBe('suggested');
        });

        it("Choisit un seul support de séquence imposé quand membership est sélectionné", async () => {
            const plan = window.GenerationRequirements.calculateHighlightPlan({
                difficultyLevelGlobal: 3,
                op_membership: true
            });

            expect(plan.highlights['var-str'].state).toBe('required');
            expect((plan.highlights['var-list'] || { state: 'none' }).state).toBe('none');
        });

        it("Le required domine le suggested sur les types de séquence", async () => {
            const plan = window.GenerationRequirements.calculateHighlightPlan({
                difficultyLevelGlobal: 3,
                main_loops: true,
                loop_for_str: true,
                op_membership: true
            });

            expect(plan.highlights['var-str'].state).toBe('required');
        });

        it("Le plan de highlight se recalcule quand la difficulté change", async () => {
            const lowDifficultyPlan = window.GenerationRequirements.calculateHighlightPlan({
                difficultyLevelGlobal: 1,
                op_comparison: true
            });
            const highDifficultyPlan = window.GenerationRequirements.calculateHighlightPlan({
                difficultyLevelGlobal: 5,
                op_comparison: true
            });

            expect(highDifficultyPlan.semanticRequirements.minLines > lowDifficultyPlan.semanticRequirements.minLines).toBe(true);
            expect(highDifficultyPlan.highlights['num-lines-global'].state).toBe('required');
        });
    });
});
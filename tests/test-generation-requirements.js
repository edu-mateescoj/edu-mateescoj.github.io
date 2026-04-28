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

            expect(requirements.minLines).toBe(23);
            expect(requirements.minVariables).toBe(14);
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
    });
});
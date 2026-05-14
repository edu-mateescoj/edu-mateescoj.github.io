import ast
import html
from typing import List, Dict, Set, Tuple, Optional, Any, Sequence


DEFAULT_RENDER_CONFIG: Dict[str, str] = {
    "source_annotation_visibility": "show",
    "missing_annotation_policy": "keep_unannotated",
    "conflicting_annotation_policy": "keep_source",
    "assignment_operator_mode": "unicode_arrow",
    "assignment_grouping_mode": "merged_block",
    "expression_grouping_policy": "keep_separate",
    "boolean_lexicon": "python",
    "comparison_glyph_mode": "ascii",
    "equality_mode": "single_equals",
    "membership_mode": "python",
    "for_loop_model": "single_has_next",
    "iterable_kind_visibility": "hidden",
    "element_type_visibility": "hidden",
}

class ControlFlowGraph:
    def __init__(self, code: str, render_config: Optional[Dict[str, Any]] = None):
        self.code = code
        self.code_lines = code.splitlines()
        self.render_config = self._normalize_render_config(render_config)
        try:
            self.tree = ast.parse(code)
        except SyntaxError as e:
            self.syntax_error = e
            self.tree = None
        self.nodes: List[Tuple[str, str]] = [] # Liste des tuples (node_id, label)
        self.edges: Set[Tuple[str, str, str]] = set() # Ensemble des tuples (from_node, to_node, label)
        self.node_counter = 0 # Compteur pour générer des ID de nœuds uniques
        
        # Pile pour gérer les cibles de 'continue', 'break' et de re-test pour les boucles imbriquées
        # Chaque élément est un tuple: (continue_target, break_target_is_loop_exit_cond_node, retest_target)
        self.loop_stack: List[Tuple[str, str, str]] = [] 
        
        self.node_labels: Dict[str, str] = {} # Dictionnaire: node_id -> label
        self.terminal_nodes: Set[str] = set() # Ensemble des ID de nœuds qui terminent un flux (Return, Break, Continue)
        self.node_types: Dict[str, str] = {} # Dictionnaire: node_id -> type de nœud (Process, Decision, etc.)
        self.node_source_spans: Dict[str, Dict[str, Optional[int]]] = {}
        self.node_render_payloads: Dict[str, Dict[str, Any]] = {}
        
        # Pile pour gérer les portées des fonctions imbriquées.
        # Chaque élément est un Set d'IDs de nœuds pour cette portée de fonction.
        self._function_scope_stack: List[Set[str]] = []
        
        # Stockage des ID de nœuds pour chaque fonction définie, utilisé pour les sous-graphes Mermaid.
        # Dictionnaire: function_name -> Set[node_id]
        self.function_subgraph_nodes: Dict[str, Set[str]] = {}
        # Stockage des ID de nœuds pour le flux principal (module), utilisé pour le sous-graphe Mermaid.
        self.main_flow_nodes: Set[str] = set()

        # Dictionnaire pour stocker des informations sur les variables affectées à des littéraux
        # Clef:= nom de la variable (str) - Valeur:= tuple (type_ast_node, valeur_reelle_ou_description_type)
        # Ex: "my_string" -> (ast.Constant, "chaîne")
        self.variable_assignments: Dict[str, Tuple[type, Any]] = {}

    def _normalize_render_config(self, render_config: Optional[Dict[str, Any]]) -> Dict[str, str]:
        """Construit une configuration de rendu stable en fusionnant les overrides reçus."""
        normalized = dict(DEFAULT_RENDER_CONFIG)
        if not isinstance(render_config, dict):
            return normalized

        for key, default_value in DEFAULT_RENDER_CONFIG.items():
            candidate_value = render_config.get(key)
            if isinstance(candidate_value, str) and candidate_value:
                normalized[key] = candidate_value
            else:
                normalized[key] = default_value

        # Evite l'ambiguïté visuelle entre affectation et test d'égalité quand
        # les deux seraient affichés avec le même signe '='.
        if (
            normalized["assignment_operator_mode"] == "equals"
            and normalized["equality_mode"] == "single_equals"
        ):
            normalized["equality_mode"] = "double_equals"

        return normalized

    def _get_render_option(self, key: str) -> str:
        """Retourne une option de rendu normalisée."""
        return self.render_config.get(key, DEFAULT_RENDER_CONFIG[key])

    def _get_simple_assignment_operator_text(self) -> str:
        """Retourne le symbole d'affectation simple selon la configuration de rendu."""
        if self._get_render_option("assignment_operator_mode") == "equals":
            return "="
        return "←"

    def _compose_multiline_label(self, *lines: str) -> str:
        """Assemble plusieurs lignes de label sans post-traitement textuel fragile."""
        return "\n".join(line.strip() for line in lines if isinstance(line, str) and line.strip())

    def _is_groupable_statement(self, node: ast.stmt, grouping_mode: Optional[str] = None) -> bool:
        """Indique si une instruction peut participer à un bloc visuel compact."""
        if isinstance(node, ast.Expr):
            return (
                grouping_mode in ("merged_block", "stacked_compact") and
                self._get_render_option("expression_grouping_policy") == "include_in_blocks"
            )
        return isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign))

    def _annotation_from_inferred_type(self, inferred_type: str) -> Optional[str]:
        """Mappe un type simple inféré vers un nom d'annotation Python affichable."""
        annotation_map = {
            "int": "int",
            "float": "float",
            "str": "str",
            "bool": "bool",
            "list": "list",
        }
        return annotation_map.get(inferred_type)

    def _infer_type_from_statement(self, node: ast.stmt) -> str:
        """Infère un type simple à partir d'une instruction de rendu."""
        if isinstance(node, ast.Assign):
            return self._infer_type_from_value_node(node.value)

        if isinstance(node, ast.AnnAssign):
            if node.value is not None:
                return self._infer_type_from_value_node(node.value)
            if isinstance(node.annotation, ast.Name):
                return node.annotation.id
            return "unknown"

        if isinstance(node, ast.AugAssign):
            if isinstance(node.target, ast.Name) and node.target.id in self.variable_assignments:
                assigned_ast_type, assigned_value_or_desc = self.variable_assignments[node.target.id]
                return self._normalize_assignment_entry_type(assigned_ast_type, assigned_value_or_desc)
            return "unknown"

        return "unknown"

    def _get_visible_annotation_text(self, node: ast.stmt) -> Optional[str]:
        """Détermine l'annotation visible à afficher selon la configuration de rendu."""
        source_annotation_text: Optional[str] = None
        if isinstance(node, ast.AnnAssign) and node.annotation is not None:
            source_annotation_text = ast.unparse(node.annotation).replace('"', '"')

        inferred_annotation_text = self._annotation_from_inferred_type(self._infer_type_from_statement(node))

        if source_annotation_text:
            if self._get_render_option("source_annotation_visibility") == "hide":
                return None

            if not inferred_annotation_text or inferred_annotation_text == source_annotation_text:
                return source_annotation_text

            conflict_policy = self._get_render_option("conflicting_annotation_policy")
            if conflict_policy == "use_inferred":
                return inferred_annotation_text
            if conflict_policy == "hide":
                return None
            return source_annotation_text

        if self._get_render_option("missing_annotation_policy") == "infer":
            return inferred_annotation_text

        return None

    def _get_call_display_parts(self, node: ast.Call) -> Dict[str, str]:
        """Construit les parties d'affichage d'un appel de fonction ou méthode."""
        func_name_str = ast.unparse(node.func).replace('"', '#quot;')
        args_list_str = [self._format_display_expression(arg).replace('"', '#quot;') for arg in node.args]
        double_quote_char = '"'
        kwargs_list_str = [
            f"{keyword.arg}={self._format_display_expression(keyword.value).replace(double_quote_char, '#quot;')}"
            for keyword in node.keywords
        ]
        all_args_concatenated_str = ", ".join(args_list_str + kwargs_list_str)

        max_args_display_length = 60
        if len(all_args_concatenated_str) > max_args_display_length:
            all_args_concatenated_str = all_args_concatenated_str[:max_args_display_length - 3] + "..."

        label_text = f"{func_name_str}({all_args_concatenated_str})"
        node_type = "Process"
        if func_name_str in ["print", "input"]:
            node_type = "IoOperation"
        else:
            label_text = f"Appel: {label_text}"

        return {
            "label_text": label_text,
            "node_type": node_type,
        }

    def _get_statement_display_parts(self, node: ast.stmt) -> Dict[str, str]:
        """Construit les parties d'affichage d'une instruction groupable."""
        if isinstance(node, ast.Assign):
            target_text = ", ".join([ast.unparse(target).replace('"', '"') for target in node.targets])
            operator_text = self._get_simple_assignment_operator_text()
            value_text = self._format_display_expression(node.value).replace('"', '"') if node.value else ""
            annotation_text = self._get_visible_annotation_text(node) or ""
            return {
                "kind": "assignment",
                "target": target_text,
                "annotation": annotation_text,
                "operator": operator_text,
                "value": value_text,
            }

        if isinstance(node, ast.AnnAssign):
            target_text = ast.unparse(node.target).replace('"', '"')
            operator_text = self._get_simple_assignment_operator_text() if node.value is not None else ""
            value_text = self._format_display_expression(node.value).replace('"', '"') if node.value is not None else ""
            annotation_text = self._get_visible_annotation_text(node) or ""
            return {
                "kind": "assignment",
                "target": target_text,
                "annotation": annotation_text,
                "operator": operator_text,
                "value": value_text,
            }

        if isinstance(node, ast.AugAssign):
            target_text = ast.unparse(node.target).replace('"', '"')
            operator_text = self._get_augassign_operator_text(node.op)
            value_text = self._format_display_expression(node.value).replace('"', '"') if node.value else ""
            annotation_text = self._get_visible_annotation_text(node) or ""
            return {
                "kind": "assignment",
                "target": target_text,
                "annotation": annotation_text,
                "operator": operator_text,
                "value": value_text,
            }

        if isinstance(node, ast.Expr):
            if isinstance(node.value, ast.Call):
                call_display = self._get_call_display_parts(node.value)
                expression_text = call_display["label_text"]
            else:
                expression_text = self._format_display_expression(node.value).replace('"', '"')
            return {
                "kind": "expression",
                "text": expression_text,
                "target": "",
                "annotation": "",
                "operator": "",
                "value": "",
            }

        raise TypeError(f"Instruction groupable non supportée: {type(node).__name__}")

    def _compose_statement_display_text(self, statement_parts: Dict[str, str]) -> str:
        """Assemble le texte final d'une instruction groupable."""
        if statement_parts.get("kind") == "expression":
            return statement_parts.get("text", "")

        target_text = statement_parts.get("target", "")
        annotation_text = statement_parts.get("annotation", "")
        if annotation_text:
            target_text = f"{target_text} : {annotation_text}"

        label_parts = [target_text]
        if statement_parts.get("operator"):
            label_parts.append(statement_parts["operator"])
        if statement_parts.get("value"):
            label_parts.append(statement_parts["value"])

        return " ".join([part for part in label_parts if part]).strip()

    def _format_statement_label(self, node: ast.stmt) -> str:
        """Formate une instruction groupable pour le rendu Mermaid."""
        label_text = self._compose_statement_display_text(self._get_statement_display_parts(node))

        max_label_length = 60
        if len(label_text) > max_label_length:
            label_text = label_text[:max_label_length - 3] + "..."

        return label_text

    def _get_boolean_operator_text(self, operator: ast.boolop) -> str:
        """Retourne le texte de l'opérateur booléen selon le lexique actif."""
        lexicon_mode = self._get_render_option("boolean_lexicon")
        if isinstance(operator, ast.And):
            return {
                "python": "and",
                "fr_lower": "et",
                "fr_upper": "ET",
                "logic_symbols": "^",
                "c_style": "&&",
            }.get(lexicon_mode, "and")

        return {
            "python": "or",
            "fr_lower": "ou",
            "fr_upper": "OU",
            "logic_symbols": "v",
            "c_style": "||",
        }.get(lexicon_mode, "or")

    def _get_not_operator_text(self) -> str:
        """Retourne le texte de la négation logique selon le lexique actif."""
        return {
            "python": "not",
            "fr_lower": "non",
            "fr_upper": "NON",
            "logic_symbols": "¬",
            "c_style": "!",
        }.get(self._get_render_option("boolean_lexicon"), "not")

    def _get_compare_operator_text(self, operator: ast.cmpop) -> str:
        """Retourne le texte d'un opérateur de comparaison selon le rendu choisi."""
        comparison_mode = self._get_render_option("comparison_glyph_mode")
        equality_mode = self._get_render_option("equality_mode")
        membership_mode = self._get_render_option("membership_mode")

        if isinstance(operator, ast.Eq):
            return "=" if equality_mode == "single_equals" else "=="
        if isinstance(operator, ast.NotEq):
            return "≠" if comparison_mode == "math" else "!="
        if isinstance(operator, ast.LtE):
            return "≤" if comparison_mode == "math" else "<="
        if isinstance(operator, ast.GtE):
            return "≥" if comparison_mode == "math" else ">="
        if isinstance(operator, ast.In):
            return "dans" if membership_mode == "french_dans" else "in"
        if isinstance(operator, ast.NotIn):
            return "n'est pas dans" if membership_mode == "french_dans" else "not in"
        if isinstance(operator, ast.Is):
            return "is"
        if isinstance(operator, ast.IsNot):
            return "is not"
        if isinstance(operator, ast.Lt):
            return "<"
        if isinstance(operator, ast.Gt):
            return ">"

        return ast.unparse(operator)

    def _format_display_expression(self, node: ast.AST) -> str:
        """Formate une expression affichée hors losange en respectant les options de rendu."""
        if isinstance(node, (ast.BoolOp, ast.Compare)):
            return self._format_condition_expression(node)

        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            return self._format_condition_expression(node)

        return ast.unparse(node)

    def _format_condition_expression(self, node: ast.AST) -> str:
        """Formate récursivement une expression booléenne/comparative pour les conditions."""
        if isinstance(node, ast.BoolOp):
            operator_text = self._get_boolean_operator_text(node.op)
            rendered_values: List[str] = []
            for value in node.values:
                value_text = self._format_condition_expression(value)
                if isinstance(value, ast.BoolOp) and type(value.op) is not type(node.op):
                    value_text = f"({value_text})"
                rendered_values.append(value_text)
            return f" {operator_text} ".join(rendered_values)

        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            operand_text = self._format_condition_expression(node.operand)
            if isinstance(node.operand, ast.BoolOp):
                operand_text = f"({operand_text})"
            return f"{self._get_not_operator_text()} {operand_text}"

        if isinstance(node, ast.Compare):
            rendered_parts: List[str] = [self._format_condition_expression(node.left)]
            for operator, comparator in zip(node.ops, node.comparators):
                rendered_parts.append(self._get_compare_operator_text(operator))
                rendered_parts.append(self._format_condition_expression(comparator))
            return " ".join(rendered_parts)

        return ast.unparse(node)

    def _format_multiline_compare_text(self, node: ast.Compare) -> Optional[str]:
        """Découpe une comparaison simple quand le membre droit est visiblement encombrant."""
        if len(node.ops) != 1 or len(node.comparators) != 1:
            return None

        left_text = self._format_condition_expression(node.left)
        operator = node.ops[0]
        operator_text = self._get_compare_operator_text(operator)
        comparator_node = node.comparators[0]
        comparator_text = self._format_condition_expression(comparator_node)
        full_text = f"{left_text} {operator_text} {comparator_text}"

        comparator_is_bulky = isinstance(
            comparator_node,
            (ast.List, ast.Tuple, ast.Set, ast.Dict, ast.Call, ast.Subscript, ast.BinOp, ast.BoolOp, ast.IfExp),
        )
        if not comparator_is_bulky and len(comparator_text) <= 18:
            return None

        if len(full_text) <= 23:
            return None

        return self._compose_multiline_label(f"{left_text} {operator_text}", comparator_text)

    def _format_condition_text(self, node: ast.AST, multiline_final_boolop: bool = False) -> str:
        """Formate le texte d'une condition en tenant compte du lexique configuré."""
        if isinstance(node, ast.BoolOp) and len(node.values) > 1:
            single_line_text = self._format_condition_expression(node)
            should_split_final_boolop = multiline_final_boolop or len(single_line_text) > 28

            if not should_split_final_boolop:
                return single_line_text

            leading_values = node.values[:-1]
            trailing_value = node.values[-1]
            if len(leading_values) == 1:
                first_line = self._format_condition_expression(leading_values[0])
                if isinstance(leading_values[0], ast.BoolOp):
                    first_line = f"({first_line})"
            else:
                first_line = self._format_condition_expression(ast.BoolOp(op=node.op, values=leading_values))

            final_operator = self._get_boolean_operator_text(node.op)
            return f"{first_line}\n{final_operator} {self._format_condition_expression(trailing_value)}"

        if isinstance(node, ast.Compare):
            multiline_compare_text = self._format_multiline_compare_text(node)
            if multiline_compare_text:
                return multiline_compare_text

        return self._format_condition_expression(node)

    def process_and_get_results(self) -> dict:
        """
        Méthode centrale qui génère le diagramme ET le code normalisé.
        """
        if self.tree is None:
            return {
                "mermaid": "graph TD\n    error[Code syntaxiquement invalide]",
                "canonical_code": f"# Erreur de syntaxe:\n# {getattr(self, 'syntax_error', 'Erreur inconnue')}",
                "error": str(getattr(self, 'syntax_error', 'Erreur inconnue')),
                "detected_types": {}
            }

        self.visit(self.tree, None)
        mermaid_string = self.to_mermaid()
        canonical_code_string = ast.unparse(self.tree)
        detected_types = self.get_variable_types()

        return {
            "mermaid": mermaid_string,
            "canonical_code": canonical_code_string,
            "ast_dump": ast.dump(self.tree),
            "detected_types": detected_types,
            "render_config": self.render_config,
            "node_render_payloads": self.node_render_payloads,
            "node_source_spans": self.node_source_spans,
            "error": None
        }

    def _normalize_assignment_entry_type(self, assigned_ast_type: type, assigned_value_or_desc: Any) -> str:
        """
        Convertit une entrée de self.variable_assignments vers un type simple.
        """
        allowed = {"int", "float", "str", "bool", "list", "unknown"}

        if isinstance(assigned_value_or_desc, str) and assigned_value_or_desc in allowed:
            return assigned_value_or_desc

        if assigned_ast_type == ast.Constant:
            value = assigned_value_or_desc
            if isinstance(value, bool):
                return "bool"
            if isinstance(value, int):
                return "int"
            if isinstance(value, float):
                return "float"
            if isinstance(value, str):
                return "str"
            return "unknown"

        if assigned_ast_type == ast.List:
            return "list"

        if assigned_ast_type in (ast.Tuple, ast.Set, ast.Dict):
            return "unknown"

        if assigned_ast_type == ast.Call and isinstance(assigned_value_or_desc, str):
            low = assigned_value_or_desc.lower()
            if "chaîne" in low or "string" in low:
                return "str"
            if "entier" in low:
                return "int"
            if "bool" in low:
                return "bool"
            if "list" in low or "liste" in low:
                return "list"
            if "nombre" in low:
                return "unknown"

        return "unknown"

    def _infer_type_from_value_node(self, value_node: ast.AST) -> str:
        """
        Infère le type simple d'une expression d'assignation.
        """
        if isinstance(value_node, ast.Constant):
            value = value_node.value
            if isinstance(value, bool):
                return "bool"
            if isinstance(value, int):
                return "int"
            if isinstance(value, float):
                return "float"
            if isinstance(value, str):
                return "str"
            return "unknown"

        if isinstance(value_node, ast.List):
            return "list"

        if isinstance(value_node, ast.Name):
            if value_node.id in self.variable_assignments:
                assigned_ast_type, assigned_value_or_desc = self.variable_assignments[value_node.id]
                return self._normalize_assignment_entry_type(assigned_ast_type, assigned_value_or_desc)
            return "unknown"

        if isinstance(value_node, ast.Call):
            return self._infer_type_from_call_node(value_node)

        if isinstance(value_node, ast.Compare):
            return "bool"

        if isinstance(value_node, ast.BoolOp):
            return "bool"

        if isinstance(value_node, ast.UnaryOp):
            if isinstance(value_node.op, ast.Not):
                return "bool"
            operand_type = self._infer_type_from_value_node(value_node.operand)
            if isinstance(value_node.op, (ast.UAdd, ast.USub)) and operand_type in ("int", "float"):
                return operand_type
            return "unknown"

        if isinstance(value_node, ast.BinOp):
            left_type = self._infer_type_from_value_node(value_node.left)
            right_type = self._infer_type_from_value_node(value_node.right)

            if left_type in ("int", "float") and right_type in ("int", "float"):
                if "float" in (left_type, right_type):
                    return "float"
                return "int"

            if left_type == "str" and right_type == "str" and isinstance(value_node.op, ast.Add):
                return "str"

            if left_type == "list" and right_type == "list" and isinstance(value_node.op, ast.Add):
                return "list"

            return "unknown"

        if isinstance(value_node, ast.IfExp):
            body_type = self._infer_type_from_value_node(value_node.body)
            else_type = self._infer_type_from_value_node(value_node.orelse)
            return body_type if body_type == else_type else "unknown"

        return "unknown"

    def _infer_type_from_call_node(self, call_node: ast.Call) -> str:
        """Infère le type simple renvoyé par un appel connu."""
        if isinstance(call_node.func, ast.Name):
            builtin_map = {
                "int": "int",
                "float": "float",
                "str": "str",
                "bool": "bool",
                "list": "list",
                "len": "int",
                "input": "str",
                "ord": "int",
                "chr": "str",
            }
            return builtin_map.get(call_node.func.id, "unknown")

        if isinstance(call_node.func, ast.Attribute):
            receiver_type = self._infer_type_from_value_node(call_node.func.value)
            method_name = call_node.func.attr

            if receiver_type == "str" and method_name == "replace":
                return "str"

        return "unknown"

    def get_variable_types(self) -> Dict[str, str]:
        """
        Retourne un dictionnaire simple: variable -> type.
        """
        detected: Dict[str, str] = {}
        for var_name, (assigned_ast_type, assigned_value_or_desc) in self.variable_assignments.items():
            detected[var_name] = self._normalize_assignment_entry_type(assigned_ast_type, assigned_value_or_desc)
        return detected
        
    def get_node_id(self) -> str:
        """Génère un nouvel ID de nœud unique et l'ajoute à la portée de fonction actuelle si applicable."""
        self.node_counter += 1
        new_id = f"node{self.node_counter:02d}"
        
        if self._function_scope_stack:
            # Si nous sommes dans la portée d'une fonction, ajouter ce nœud à cette portée.
            self._function_scope_stack[-1].add(new_id)
        else:
            # Sinon, ce nœud appartient au flux principal (module).
            self.main_flow_nodes.add(new_id)
        return new_id

    def _build_source_span(
        self,
        source_start_node: Optional[ast.AST] = None,
        source_end_node: Optional[ast.AST] = None,
        source_span: Optional[Dict[str, Optional[int]]] = None,
    ) -> Optional[Dict[str, Optional[int]]]:
        """Construit une plage source normalisée pour l'éditeur et le front."""
        if source_span is not None:
            return dict(source_span)

        if not (source_start_node or source_end_node):
            return None

        start_node = source_start_node or source_end_node
        end_node = source_end_node or source_start_node
        return {
            "lineno": getattr(start_node, "lineno", None),
            "end_lineno": getattr(end_node, "end_lineno", getattr(end_node, "lineno", None)),
            "col_offset": getattr(start_node, "col_offset", None),
            "end_col_offset": getattr(end_node, "end_col_offset", getattr(end_node, "col_offset", None)),
        }

    def _get_header_line_span(self, node: ast.AST) -> Optional[Dict[str, Optional[int]]]:
        """Retourne la plage de la ligne d'en-tête d'une structure de contrôle ou d'une fonction."""
        lineno = getattr(node, "lineno", None)
        if lineno is None or lineno < 1 or lineno > len(self.code_lines):
            return None

        return {
            "lineno": lineno,
            "end_lineno": lineno,
            "col_offset": getattr(node, "col_offset", 0),
            "end_col_offset": len(self.code_lines[lineno - 1]),
        }

    def add_node(
        self,
        label: str,
        node_type: str = "Process",
        source_start_node: Optional[ast.AST] = None,
        source_end_node: Optional[ast.AST] = None,
        source_span: Optional[Dict[str, Optional[int]]] = None,
        render_payload: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Ajoute un nouveau nœud au graphe."""
        node_id = self.get_node_id() # get_node_id gère l'ajout aux ensembles pour les sous-graphes
        
        # --- DEBUG ---
        #import inspect
        #caller_name = inspect.stack()[1].function
        #print(f"DEBUG add_node: ID={node_id}, Label='{label}', Type='{node_type}', Called by='{caller_name}'")
        # --- FIN DEBUG ---

        self.nodes.append((node_id, label))
        self.node_labels[node_id] = label
        self.node_types[node_id] = node_type
        span = self._build_source_span(
            source_start_node=source_start_node,
            source_end_node=source_end_node,
            source_span=source_span,
        )
        if span and any(value is not None for value in span.values()):
            self.node_source_spans[node_id] = span
        if render_payload:
            self.node_render_payloads[node_id] = render_payload
        return node_id

    def add_edge(self, from_node: str, to_node: str, label: str = ""):
        """Ajoute une arête au graphe, avec vérifications."""
        if not from_node or not to_node:
            # Éviter les arêtes avec des nœuds non définis.
            return
        if from_node == to_node and not label:
            # Éviter les auto-boucles non labellisées (souvent issues de branches vides).
            return
            
        # Permettre aux nœuds de saut (Break/Continue) et de Retour d'avoir des arêtes sortantes
        # si elles sont explicitement ajoutées par leurs visiteurs respectifs.
        # Les autres nœuds terminaux ne devraient pas avoir de nouvelles arêtes génériques sortantes.
        if from_node in self.terminal_nodes and \
           self.node_types.get(from_node) not in ("Jump", "Return"):
            return
            
        if from_node not in self.node_labels or to_node not in self.node_labels:
            # Éviter les arêtes entre des nœuds non (encore) existants.
            return
        self.edges.add((from_node, to_node, label))

    def _is_terminal_ast_node(self, node: ast.AST) -> bool:
        """Vérifie si un nœud AST est un nœud qui termine le flux normal (Return, Break, Continue)."""
        return isinstance(node, (ast.Return, ast.Break, ast.Continue))

    def visit_body(self, body: Sequence[ast.stmt], entry_node_ids: List[str]) -> List[str]:
        """
        Visite une séquence d'instructions (un "corps").
        Gère la création de jonctions si nécessaire entre les instructions.
        Retourne une liste d'ID de nœuds qui sont les points de sortie de ce corps.
        """
        active_ids_for_current_statement = list(set(entry_node_ids))

        i = 0
        while i < len(body):
            stmt = body[i]
            if not active_ids_for_current_statement:
                # Plus de chemins actifs à traiter dans ce corps.
                break
            
            # Points d'entrée pour l'instruction courante (filtrer les nœuds déjà terminaux).
            current_stmt_entry_points = [pid for pid in active_ids_for_current_statement 
                                         if pid not in self.terminal_nodes]
            
            if not current_stmt_entry_points:
                 # Tous les chemins menant à cette instruction étaient terminaux.
                 active_ids_for_current_statement = [] 
                 break

            statement_block: List[ast.stmt] = []
            grouping_mode = self._get_render_option("assignment_grouping_mode")
            if grouping_mode in ("merged_block", "stacked_compact") and self._is_groupable_statement(stmt, grouping_mode):
                statement_block.append(stmt)
                next_index = i + 1
                while next_index < len(body):
                    next_stmt = body[next_index]
                    if not self._is_groupable_statement(next_stmt, grouping_mode):
                        break
                    statement_block.append(next_stmt)
                    next_index += 1

            # Collecter les points de sortie de l'instruction courante, pour tous les chemins d'entrée.
            exits_from_current_stmt_all_paths: List[str] = []
            for parent_id in current_stmt_entry_points:
                if len(statement_block) > 1:
                    exit_nodes_from_stmt_path = self._visit_assignment_block(statement_block, parent_id)
                else:
                    # visit() retourne les ID des nœuds de sortie de stmt pour ce parent_id.
                    exit_nodes_from_stmt_path = self.visit(stmt, parent_id)
                exits_from_current_stmt_all_paths.extend(exit_nodes_from_stmt_path)

            if len(statement_block) > 1:
                i += len(statement_block) - 1
            
            # Les points de sortie de l'instruction courante deviennent les points d'entrée potentiels pour la suivante.
            active_ids_for_current_statement = list(set(exits_from_current_stmt_all_paths))

            # Logique de Jonction:
            # Si ce n'est PAS la dernière instruction et que l'instruction courante a produit
            # PLUSIEURS points de sortie non-terminaux, nous les fusionnons avec un nœud de jonction.
            is_last_statement = (i == len(body) - 1)
            non_terminal_active_ids = [pid for pid in active_ids_for_current_statement 
                                       if pid not in self.terminal_nodes]

            if not is_last_statement and len(non_terminal_active_ids) > 1:
                # Créer un seul nœud de jonction.
                junction_id = self.add_node(".", node_type="Junction")
                for pid in non_terminal_active_ids:
                    self.add_edge(pid, junction_id)
                
                # Le nœud de jonction devient le seul point d'entrée non-terminal pour la prochaine instruction.
                # On conserve les points terminaux s'il y en avait.
                terminal_active_ids = [pid for pid in active_ids_for_current_statement if pid in self.terminal_nodes]
                active_ids_for_current_statement = [junction_id] + terminal_active_ids

            i += 1
        
        # Retourne tous les points de sortie actifs (terminaux ou non) du corps.
        return active_ids_for_current_statement


    def visit(self, node: ast.AST, parent_id: Optional[str]) -> List[str]:
        """Méthode de visite générique qui appelle le visiteur spécifique au type de nœud AST."""
        method_name = f'visit_{type(node).__name__}'
        visitor = getattr(self, method_name, self.generic_visit)
        
        # parent_id est None pour le Module ou les FunctionDef de haut niveau.
        if parent_id is None and not isinstance(node, (ast.Module, ast.FunctionDef)):
            # print(f"Critical Warning: visit() appelé avec parent_id=None pour noeud {type(node).__name__}")
            return []

        exit_nodes: List[str] = visitor(node, parent_id)

        # Si le nœud AST lui-même est terminal (Return, Break, Continue),
        # alors les nœuds CFG qu'il a créés sont marqués comme terminaux.
        if self._is_terminal_ast_node(node): 
            for node_id in exit_nodes: # Normalement un seul nœud créé par R/B/C.
                self.terminal_nodes.add(node_id)
            return [] # Pas de continuation de flux normale depuis un nœud terminal AST.
        
        return exit_nodes # Retourne les points de sortie pour le flux normal.

    def connect_finals_to_end(self, target_end_id: str, scope_node_ids: Optional[Set[str]] = None):
        """
        Connecte les nœuds sans arête sortante (dans la portée donnée) au target_end_id.
        Utilisé pour les fins de chemin implicites et les nœuds Return.
        """
        source_nodes_with_outgoing_edges = set(from_node for from_node, _, _ in self.edges)
        
        # Si scope_node_ids n'est pas fourni, considérer tous les nœuds.
        nodes_to_check = scope_node_ids if scope_node_ids is not None else set(self.node_labels.keys())

        for node_id in list(nodes_to_check): # Itérer sur une copie car self.edges peut être modifié.
            if node_id not in self.node_labels: continue # Nœud potentiellement supprimé (logique future).
            if node_id == target_end_id: continue # Ne pas connecter un nœud à lui-même de cette façon.

            is_return_node = self.node_types.get(node_id) == "Return"
            
            # Si un nœud est un 'Return', il DOIT être connecté au 'End' de sa fonction/module.
            # S'il est dans terminal_nodes mais n'est PAS un 'Return' (ex: Break, Continue),
            # ses sauts sont déjà gérés, donc on ne le connecte pas au 'End' général ici.
            if node_id in self.terminal_nodes and not is_return_node:
                continue
            
            # Si le nœud n'a pas d'arête sortante, OU s'il est un 'Return', alors on le connecte.
            if node_id not in source_nodes_with_outgoing_edges or is_return_node:
                self.add_edge(node_id, target_end_id)


    def visit_Module(self, node: ast.Module, parent_id: Optional[str] = None) -> List[str]:
        """Visite le nœud racine du module AST."""
        # Le nœud Start du module. parent_id est None ici.
        # get_node_id ajoutera start_id à self.main_flow_nodes.
        start_id = self.add_node("Start", node_type="StartEnd") 

        # Les définitions de fonction ne participent pas au flux principal,
        # mais elles doivent tout de même casser la contiguïté des blocs d'affectation.
        module_flow_exits = [start_id]
        pending_main_flow_statements: List[ast.stmt] = []

        for top_level_node in node.body:
            if isinstance(top_level_node, ast.FunctionDef):
                if pending_main_flow_statements:
                    module_flow_exits = self.visit_body(pending_main_flow_statements, module_flow_exits)
                    pending_main_flow_statements = []
                self.visit(top_level_node, None)
                continue

            pending_main_flow_statements.append(top_level_node)

        if pending_main_flow_statements:
            module_flow_exits = self.visit_body(pending_main_flow_statements, module_flow_exits)
        
        # Le nœud End du module. get_node_id l'ajoutera à self.main_flow_nodes.
        module_end_id = self.add_node("End", node_type="StartEnd")

        # 3. Connecter les sorties normales du flux principal au nœud 'End' du module.
        for node_id in module_flow_exits:
            if node_id not in self.terminal_nodes: # Ne pas connecter si c'est déjà un break/continue global.
                self.add_edge(node_id, module_end_id)
        
        # 4. Connecter les fins implicites et les 'Return' globaux (rare) au 'End' du module.
        #    On utilise self.main_flow_nodes qui a été rempli par get_node_id pour les nœuds du module.
        self.connect_finals_to_end(module_end_id, scope_node_ids=self.main_flow_nodes) 

        return [] # Le module lui-même n'a pas de "sortie" vers un parent.

    def visit_FunctionDef(self, node: ast.FunctionDef, parent_id: Optional[str]) -> List[str]:
        """Visite une définition de fonction AST."""
        # 1. Gérer la portée pour les nœuds internes à cette fonction.
        #    Crée un nouvel ensemble vide pour les ID de nœuds de cette fonction.
        self._function_scope_stack.append(set()) 
        function_header_span = self._get_header_line_span(node)
        
        # 2. Créer Start et End pour le *corps* de la fonction (sous-graphe).
        #    Ces nœuds seront automatiquement ajoutés à la portée de la fonction actuelle
        #    (et donc à self._function_scope_stack[-1]) par get_node_id.
        func_body_start_id = self.add_node(
            f"Start {node.name}",
            node_type="StartEnd",
            source_span=function_header_span,
        )
        func_body_end_id = self.add_node(f"End {node.name}", node_type="StartEnd")

        # 3. Visiter le corps de la fonction.
        #    Les points d'entrée sont le nœud Start de cette fonction.
        body_normal_exit_nodes = self.visit_body(node.body, [func_body_start_id])

        # 4. Connecter les sorties normales du corps (non-Return) au nœud End de la fonction.
        for node_id in body_normal_exit_nodes:
            if node_id not in self.terminal_nodes: # Ne pas connecter si c'est un break/continue dans la fonction.
                self.add_edge(node_id, func_body_end_id)

        # 5. Récupérer tous les ID de nœuds de cette fonction et les stocker pour les sous-graphes Mermaid.
        #    Puis, dépiler la portée.
        current_function_node_ids = self._function_scope_stack.pop()
        self.function_subgraph_nodes[node.name] = current_function_node_ids
        
        # 6. Connecter tous les 'Return' et fins de chemin implicites DANS CETTE FONCTION
        #    à son propre func_body_end_id. Utiliser les ID de nœuds collectés pour cette fonction.
        self.connect_finals_to_end(func_body_end_id, scope_node_ids=current_function_node_ids)
        
        # La fonction ne s'insère plus dans le flux parent, donc retourne [].
        return []
    
    def visit_If(self, node: ast.If, parent_id: str) -> List[str]:
        """Visite une instruction 'if' AST."""
        condition_text = self._format_condition_text(node.test).replace('"', '"')
        if_decision_id = self.add_node(f"{condition_text}", node_type="Decision", source_start_node=node.test)
        self.add_edge(parent_id, if_decision_id)

        # Points de sortie finaux de la structure If globale.
        final_exit_nodes_after_if: List[str] = []
        
        true_branch_first_node_id: Optional[str] = None
        false_branch_first_node_id: Optional[str] = None

        # --- Branche True (node.body) ---
        if node.body:
            # Pour identifier le premier nœud de la branche, on capture l'état avant/après.
            nodes_before_true_branch = set(n_id for n_id, _ in self.nodes)
            true_branch_exits = self.visit_body(node.body, [if_decision_id])
            nodes_after_true_branch = set(n_id for n_id, _ in self.nodes)
            
            # Trouver les nouveaux nœuds ajoutés dans cette branche.
            new_nodes_in_true_branch = sorted(
                list(nodes_after_true_branch - nodes_before_true_branch), 
                key=lambda x: int(x.replace("node","")) # Trier par numéro de nœud pour la stabilité.
            )
            if new_nodes_in_true_branch:
                true_branch_first_node_id = new_nodes_in_true_branch[0]
            
            final_exit_nodes_after_if.extend(true_branch_exits)
        else: 
            # Branche True vide: le flux continue depuis if_decision_id avec la condition True.
            final_exit_nodes_after_if.append(if_decision_id) 

        # --- Branche False (node.orelse) ---
        if node.orelse: # Peut être un 'else' ou un 'elif' (qui est un autre If).
            nodes_before_false_branch = set(n_id for n_id, _ in self.nodes)
            false_branch_exits = self.visit_body(node.orelse, [if_decision_id])
            nodes_after_false_branch = set(n_id for n_id, _ in self.nodes)

            new_nodes_in_false_branch = sorted(
                list(nodes_after_false_branch - nodes_before_false_branch),
                key=lambda x: int(x.replace("node",""))
            )
            if new_nodes_in_false_branch:
                false_branch_first_node_id = new_nodes_in_false_branch[0]

            final_exit_nodes_after_if.extend(false_branch_exits)
        else: 
            # Branche False vide: le flux continue depuis if_decision_id avec la condition False.
            final_exit_nodes_after_if.append(if_decision_id)

        # Labellisation des arêtes sortantes du nœud de décision 'if_decision_id'.
        if true_branch_first_node_id: 
            # L'arête (if_decision_id, true_branch_first_node_id, "") a été créée par le premier appel
            # à visit() dans visit_body. Nous la supprimons pour la recréer avec le label "True".
            if (if_decision_id, true_branch_first_node_id, "") in self.edges:
                self.edges.remove((if_decision_id, true_branch_first_node_id, ""))
            self.add_edge(if_decision_id, true_branch_first_node_id, "Oui")
        # else: Si la branche True est vide, if_decision_id est une sortie. Le label "True"
        #       sera sur l'arête if_decision_id -> (jonction ou instruction suivante).
        #       Ceci est géré par le fait que if_decision_id est dans final_exit_nodes_after_if.

        if false_branch_first_node_id: 
            if (if_decision_id, false_branch_first_node_id, "") in self.edges:
                self.edges.remove((if_decision_id, false_branch_first_node_id, ""))
            self.add_edge(if_decision_id, false_branch_first_node_id, "Non")
        # else: Idem pour la branche False vide.
        
        # Retourner les points de sortie uniques. visit_body s'occupera de les fusionner si nécessaire.
        return list(set(final_exit_nodes_after_if))

    def _get_for_element_display_parts(
        self,
        elements_type_desc_raw: str,
        article_indefini_element: str,
    ) -> Dict[str, str]:
        """Construit les libellés d'élément visibles pour les variantes de boucle for."""
        show_element_type = self._get_render_option("element_type_visibility") == "show"
        singular_map = {
            "caractère": "caractère",
            "nombre": "nombre",
            "chaîne": "chaîne",
            "booléen": "booléen",
            "clé": "clé",
            "variable": "variable",
            "élément mixte": "élément mixte",
            "élément": "élément",
        }
        plural_map = {
            "caractère": "caractères",
            "nombre": "nombres",
            "chaîne": "chaînes",
            "booléen": "booléens",
            "clé": "clés",
            "variable": "variables",
            "élément mixte": "éléments mixtes",
            "élément": "éléments",
        }

        first_assignment_map = {
            "caractère": "premier caractère",
            "nombre": "premier nombre",
            "chaîne": "première chaîne",
            "booléen": "premier booléen",
            "clé": "première clé",
            "variable": "première variable",
            "élément mixte": "premier élément mixte",
            "élément": "premier élément",
        }
        next_assignment_map = {
            "caractère": "caractère suivant",
            "nombre": "nombre suivant",
            "chaîne": "chaîne suivante",
            "booléen": "booléen suivant",
            "clé": "clé suivante",
            "variable": "variable suivante",
            "élément mixte": "élément mixte suivant",
            "élément": "élément suivant",
        }

        visible_element_key = elements_type_desc_raw if show_element_type else "élément"
        decision_singular = singular_map.get(visible_element_key, "élément")
        decision_plural = plural_map.get(visible_element_key, "éléments")
        first_assignment_text = first_assignment_map.get(visible_element_key, "premier élément")
        next_assignment_text = next_assignment_map.get(visible_element_key, "élément suivant")

        return {
            "decision_article": article_indefini_element if show_element_type else "un",
            "decision_singular": decision_singular,
            "decision_plural": decision_plural,
            "entry_decision_text": f"Au moins {article_indefini_element if show_element_type else 'un'} {decision_singular} à parcourir",
            "repeat_decision_text": f"Encore {article_indefini_element if show_element_type else 'un'} {decision_singular} à parcourir",
            "first_assignment_text": first_assignment_text,
            "next_assignment_text": next_assignment_text,
        }

    def _build_for_decision_label(self, decision_text: str, iterable_reference_text: str) -> str:
        """Construit un losange de boucle for court sur deux lignes."""
        return self._compose_multiline_label(decision_text, f"dans {iterable_reference_text} ?")

    def _build_for_assignment_label(self, iterator_variable: str, assignment_text: str, iterable_reference_text: str) -> str:
        """Construit un rectangle d'affectation d'itérateur compact sur deux lignes."""
        return self._compose_multiline_label(
            f"{iterator_variable} {self._get_simple_assignment_operator_text()} {assignment_text}",
            f"de {iterable_reference_text}",
        )

    def _build_for_loop_render_context(self, node: ast.For) -> Dict[str, Any]:
        """Construit les informations partagées entre les variantes de rendu de boucle for."""
        iterator_variable_str = ast.unparse(node.target).replace('"', '"')
        iterable_kind_desc, elements_type_desc_raw, iterable_display_name, article_indefini_element, _ = \
            self._get_iterable_description(node.iter)
        element_display = self._get_for_element_display_parts(elements_type_desc_raw, article_indefini_element)
        iterable_reference_text = self._get_iterable_reference_text(iterable_kind_desc, iterable_display_name)
        return {
            "iterator_variable": iterator_variable_str,
            "iterable_kind_desc": iterable_kind_desc,
            "inferred_element_type": elements_type_desc_raw,
            "iterable_display_name": iterable_display_name,
            "iterable_reference_text": iterable_reference_text,
            "for_header_span": self._get_header_line_span(node),
            "decision_article": element_display["decision_article"],
            "decision_singular": element_display["decision_singular"],
            "decision_plural": element_display["decision_plural"],
            "entry_decision_text": element_display["entry_decision_text"],
            "repeat_decision_text": element_display["repeat_decision_text"],
            "first_assignment_text": element_display["first_assignment_text"],
            "next_assignment_text": element_display["next_assignment_text"],
        }

    def _visit_for_single_has_next(self, node: ast.For, parent_id: str, loop_context: Dict[str, Any]) -> List[str]:
        """Rendu actuel: un seul test de poursuite, sans cas spécial visible pour le premier passage."""
        loop_render_payload = {
            "kind": "for_loop_control",
            "iterator_variable": loop_context["iterator_variable"],
            "iterable_display_name": loop_context["iterable_display_name"],
            "iterable_kind_desc": loop_context["iterable_kind_desc"],
            "inferred_element_type": loop_context["inferred_element_type"],
            "for_loop_model": self._get_render_option("for_loop_model"),
        }

        for_decision_id = self.add_node(
            self._build_for_decision_label(
                loop_context["repeat_decision_text"],
                loop_context["iterable_reference_text"],
            ),
            node_type="Decision",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "decision",
            },
        )
        self.add_edge(parent_id, for_decision_id)

        next_element_id = self.add_node(
            self._build_for_assignment_label(
                loop_context["iterator_variable"],
                loop_context["next_assignment_text"],
                loop_context["iterable_reference_text"],
            ),
            node_type="Process",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "assignment",
            },
        )
        self.add_edge(for_decision_id, next_element_id, "Oui")

        loop_exit_id = self.add_node(".", node_type="Junction")
        self.loop_stack.append((for_decision_id, loop_exit_id, for_decision_id))

        body_exit_nodes: List[str] = []
        if node.body:
            nodes_before_body = {nid for nid, _ in self.nodes}
            body_exit_nodes = self.visit_body(node.body, [next_element_id])
            nodes_after_body = {nid for nid, _ in self.nodes}
            new_nodes_in_body = sorted(list(nodes_after_body - nodes_before_body), key=lambda x: int(x.replace("node", "")))
            if new_nodes_in_body:
                first_node_of_body = new_nodes_in_body[0]
                if (next_element_id, first_node_of_body, "Oui") in self.edges:
                    self.edges.remove((next_element_id, first_node_of_body, "Oui"))
                    self.add_edge(next_element_id, first_node_of_body, "")
                elif (next_element_id, first_node_of_body, "") not in self.edges and \
                     (next_element_id, first_node_of_body, "Non") not in self.edges:
                    self.add_edge(next_element_id, first_node_of_body, "")

            for exit_node in body_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, for_decision_id)
        else:
            self.add_edge(next_element_id, for_decision_id)

        non_target = loop_exit_id
        if node.orelse:
            nodes_before_orelse = {nid for nid, _ in self.nodes}
            orelse_exit_nodes = self.visit_body(node.orelse, [for_decision_id])
            nodes_after_orelse = {nid for nid, _ in self.nodes}
            new_nodes_in_orelse = sorted(
                list(nodes_after_orelse - nodes_before_orelse),
                key=lambda x: int(x.replace("node", ""))
            )

            if new_nodes_in_orelse:
                first_node_orelse = new_nodes_in_orelse[0]
                non_target = first_node_orelse
                if (for_decision_id, first_node_orelse, "") in self.edges:
                    self.edges.remove((for_decision_id, first_node_orelse, ""))

            for exit_node in orelse_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, loop_exit_id)

        self.add_edge(for_decision_id, non_target, "Non")
        self.loop_stack.pop()
        return [loop_exit_id]

    def _visit_for_empty_then_next(self, node: ast.For, parent_id: str, loop_context: Dict[str, Any]) -> List[str]:
        """Rendu historique: test d'entrée puis distinction premier élément / élément suivant."""
        loop_render_payload = {
            "kind": "for_loop_control",
            "iterator_variable": loop_context["iterator_variable"],
            "iterable_display_name": loop_context["iterable_display_name"],
            "iterable_kind_desc": loop_context["iterable_kind_desc"],
            "inferred_element_type": loop_context["inferred_element_type"],
            "for_loop_model": self._get_render_option("for_loop_model"),
        }

        entry_decision_label = self._build_for_decision_label(
            loop_context["entry_decision_text"],
            loop_context["iterable_reference_text"],
        )
        entry_decision_id = self.add_node(
            entry_decision_label,
            node_type="Decision",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "entry_decision",
            },
        )
        self.add_edge(parent_id, entry_decision_id)

        first_element_id = self.add_node(
            self._build_for_assignment_label(
                loop_context["iterator_variable"],
                loop_context["first_assignment_text"],
                loop_context["iterable_reference_text"],
            ),
            node_type="Process",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "first_assignment",
            },
        )
        self.add_edge(entry_decision_id, first_element_id, "Oui")

        repeat_decision_id = self.add_node(
            self._build_for_decision_label(
                loop_context["repeat_decision_text"],
                loop_context["iterable_reference_text"],
            ),
            node_type="Decision",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "repeat_decision",
            },
        )

        next_element_id = self.add_node(
            self._build_for_assignment_label(
                loop_context["iterator_variable"],
                loop_context["next_assignment_text"],
                loop_context["iterable_reference_text"],
            ),
            node_type="Process",
            source_span=loop_context["for_header_span"],
            render_payload={
                **loop_render_payload,
                "role": "next_assignment",
            },
        )
        self.add_edge(repeat_decision_id, next_element_id, "Oui")

        loop_exit_id = self.add_node(".", node_type="Junction")
        self.loop_stack.append((repeat_decision_id, loop_exit_id, repeat_decision_id))

        if node.body:
            nodes_before_body = {nid for nid, _ in self.nodes}
            body_exit_nodes = self.visit_body(node.body, [first_element_id])
            nodes_after_body = {nid for nid, _ in self.nodes}
            new_nodes_in_body = sorted(list(nodes_after_body - nodes_before_body), key=lambda x: int(x.replace("node", "")))
            if new_nodes_in_body:
                first_node_of_body = new_nodes_in_body[0]
                self.add_edge(next_element_id, first_node_of_body)

            for exit_node in body_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, repeat_decision_id)
        else:
            self.add_edge(first_element_id, repeat_decision_id)
            self.add_edge(next_element_id, repeat_decision_id)

        non_target = loop_exit_id
        if node.orelse:
            nodes_before_orelse = {nid for nid, _ in self.nodes}
            orelse_exit_nodes = self.visit_body(node.orelse, [entry_decision_id])
            nodes_after_orelse = {nid for nid, _ in self.nodes}
            new_nodes_in_orelse = sorted(
                list(nodes_after_orelse - nodes_before_orelse),
                key=lambda x: int(x.replace("node", ""))
            )

            if new_nodes_in_orelse:
                first_node_orelse = new_nodes_in_orelse[0]
                non_target = first_node_orelse
                if (entry_decision_id, first_node_orelse, "") in self.edges:
                    self.edges.remove((entry_decision_id, first_node_orelse, ""))

            for exit_node in orelse_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, loop_exit_id)

        self.add_edge(entry_decision_id, non_target, "Non")
        self.add_edge(repeat_decision_id, non_target, "Non")
        self.loop_stack.pop()
        return [loop_exit_id]

    def visit_For(self, node: ast.For, parent_id: str) -> List[str]:
        """Visite une boucle 'for' AST selon le modèle de rendu configuré."""
        loop_context = self._build_for_loop_render_context(node)
        if self._get_render_option("for_loop_model") == "empty_then_next":
            return self._visit_for_empty_then_next(node, parent_id, loop_context)
        return self._visit_for_single_has_next(node, parent_id, loop_context)
    

    def _visit_for_generic_iterable(self, node: ast.For, parent_id: str, iterator_variable_str: str) -> List[str]:
        """
        Compatibilité héritée: cet ancien helper n'est plus utilisé par visit_For.

        Historique:
        - il portait autrefois une logique CFG séparée pour les for sur itérables
          génériques, distincte des cas range()
        - la logique active a ensuite été unifiée dans visit_For pour éviter deux
          implémentations concurrentes du même flux

        Contrat actuel:
        - on conserve la méthode pour documenter l'ancien point d'extension et
          éviter une suppression brutale
        - si un appel réapparaît par erreur lors d'un futur refactor, on délègue
          immédiatement vers visit_For au lieu de réactiver une logique périmée
        """
        _ = iterator_variable_str
        return self.visit_For(node, parent_id)
    
    def visit_While(self, node: ast.While, parent_id: str) -> List[str]: 
        """Visite une boucle 'while' AST."""
        condition_text = self._format_condition_text(node.test, multiline_final_boolop=True).replace('"', '"')
        while_decision_id = self.add_node(f"{condition_text}", node_type="Decision", source_start_node=node.test)
        self.add_edge(parent_id, while_decision_id)

        loop_exit_id = self.add_node(".", node_type="Junction")

        # continue_target et retest_target -> while_decision_id
        # break_target -> sortie explicite de la boucle
        self.loop_stack.append((while_decision_id, loop_exit_id, while_decision_id))

        # Visiter le corps (branche "True").
        true_branch_first_node_id: Optional[str] = None
        if node.body:
            nodes_before_body = {nid for nid,_ in self.nodes}
            body_exit_nodes = self.visit_body(node.body, [while_decision_id]) 
            nodes_after_body = {nid for nid,_ in self.nodes}
            new_nodes_in_body = sorted(list(nodes_after_body - nodes_before_body), key=lambda x: int(x.replace("node","")))
            if new_nodes_in_body:
                true_branch_first_node_id = new_nodes_in_body[0]
            
            # Les sorties normales du corps retournent au test.
            for exit_node in body_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, while_decision_id) 
        
        if true_branch_first_node_id:
            if (while_decision_id, true_branch_first_node_id, "") in self.edges: 
                self.edges.remove((while_decision_id, true_branch_first_node_id, ""))
            self.add_edge(while_decision_id, true_branch_first_node_id, "Oui")
        elif not node.body: # Corps vide, "Oui" revient directement au test.
            self.add_edge(while_decision_id, while_decision_id, "Oui")

        # Gérer 'orelse' (sortie "False").
        false_branch_target = loop_exit_id
        if node.orelse:
            nodes_before_orelse = {nid for nid,_ in self.nodes}
            orelse_exit_nodes = self.visit_body(node.orelse, [while_decision_id]) 
            nodes_after_orelse = {nid for nid,_ in self.nodes}
            new_nodes_in_orelse = sorted(list(nodes_after_orelse - nodes_before_orelse), key=lambda x: int(x.replace("node","")))
            if new_nodes_in_orelse:
                false_branch_target = new_nodes_in_orelse[0]
                if (while_decision_id, false_branch_target, "") in self.edges: 
                    self.edges.remove((while_decision_id, false_branch_target, ""))

            for exit_node in orelse_exit_nodes:
                if exit_node not in self.terminal_nodes:
                    self.add_edge(exit_node, loop_exit_id)

        self.add_edge(while_decision_id, false_branch_target, "Non")

        self.loop_stack.pop()
        return [loop_exit_id]

    def visit_Return(self, node: ast.Return, parent_id: str) -> List[str]:
        """Visite une instruction 'return' AST."""
        value_text = ast.unparse(node.value).replace('"', '"') if node.value else ""
        return_node_id = self.add_node(f"Return {value_text}", node_type="Return", source_start_node=node)
        self.add_edge(parent_id, return_node_id)
        # visit() marquera return_node_id comme terminal et retournera [].
        return [return_node_id] 

    def visit_Break(self, node: ast.Break, parent_id: str) -> List[str]: 
        """Visite une instruction 'break' AST."""
        break_node_id = self.add_node("Break", node_type="Jump", source_start_node=node)
        self.add_edge(parent_id, break_node_id)
        if self.loop_stack:
            _, loop_exit_target, _ = self.loop_stack[-1]
            self.add_edge(break_node_id, loop_exit_target, "break")
        return [break_node_id] # visit() le marquera comme terminal.

    def visit_Continue(self, node: ast.Continue, parent_id: str) -> List[str]: 
        """Visite une instruction 'continue' AST."""
        continue_node_id = self.add_node("Continue", node_type="Jump", source_start_node=node)
        self.add_edge(parent_id, continue_node_id)
        if self.loop_stack:
            loop_continue_target, _, _ = self.loop_stack[-1]
            self.add_edge(continue_node_id, loop_continue_target) # Explicitement connecter à la cible du continue.
        # else: # 'continue' en dehors d'une boucle (erreur Python).
        return [continue_node_id] # visit() le marquera comme terminal.

    def generic_visit(self, node: ast.AST, parent_id: Optional[str]) -> List[str]:
        print(f"DEBUG: generic_visit appelée pour {type(node).__name__} (parent: {parent_id})")
        """Visiteur par défaut pour les nœuds AST non gérés spécifiquement."""
        try:
            # Essayer de générer une étiquette à partir du code source du nœud.
            label_text = ast.unparse(node).replace('"', '"')
            node_type = "Process" # Type par défaut.
            if isinstance(node, ast.Pass): # Cas spécial pour 'pass'.
                label_text = "Pass"
            
            # Tronquer les étiquettes trop longues.
            max_label_length = 60 
            if len(label_text) > max_label_length: 
                label_text = label_text[:max_label_length-3] + "..."
            
            new_node_id = self.add_node(label_text, node_type=node_type, source_start_node=node)
            if parent_id: # Connecter au parent si un parent existe.
                self.add_edge(parent_id, new_node_id)
            return [new_node_id]
        except Exception: # Si unparse échoue.
            label_text = f"Noeud AST: {type(node).__name__}"
            # print(f"Warning: Impossible de 'unparse' le noeud {label_text}. Erreur: {e}")
            new_node_id = self.add_node(label_text, node_type="Process", source_start_node=node)
            if parent_id: 
                self.add_edge(parent_id, new_node_id)
            return [new_node_id]

    def _get_constant_element_type(self, value: Any) -> str:
        """Retourne un libellé court pour le type d'un élément littéral."""
        if isinstance(value, bool):
            return "booléen"
        if isinstance(value, (int, float)):
            return "nombre"
        if isinstance(value, str):
            return "caractère" if len(value) == 1 else "chaîne"
        return "élément"

    def _get_collection_element_type(self, collection_node: ast.AST) -> str:
        """Infère un type d'élément homogène pour une collection littérale."""
        element_nodes = getattr(collection_node, "elts", [])
        if not element_nodes:
            return "élément"

        element_types_seen: Set[str] = set()
        for element_node in element_nodes:
            current_element_type = "élément"
            if isinstance(element_node, ast.Constant):
                current_element_type = self._get_constant_element_type(element_node.value)
            # Les nombres signés sont représentés par UnaryOp(Constant(...)) dans l'AST.
            # Sans ce cas, une liste homogène comme [5, -3, 4] devient à tort "mixte".
            elif isinstance(element_node, ast.UnaryOp) and isinstance(element_node.op, (ast.UAdd, ast.USub)):
                operand_node = element_node.operand
                if isinstance(operand_node, ast.Constant) and isinstance(operand_node.value, (int, float)):
                    current_element_type = "nombre"
            elif isinstance(element_node, ast.Name):
                current_element_type = "variable"
            element_types_seen.add(current_element_type)

        if len(element_types_seen) == 1:
            return element_types_seen.pop()
        if len(element_types_seen) > 1:
            return "élément mixte"
        return "élément"

    def _get_plural_element_type(self, element_type: str) -> str:
        """Normalise les pluriels utilisés dans les libellés Mermaid."""
        plural_map = {
            "caractère": "caractères",
            "nombre": "nombres",
            "chaîne": "chaînes",
            "booléen": "booléens",
            "clé": "clés",
            "variable": "variables",
            "élément": "éléments",
            "élément mixte": "éléments mixtes",
        }
        return plural_map.get(element_type, f"{element_type}s")

    def _describe_collection_assignment(self, collection_node: ast.AST) -> str:
        """Stocke une description exploitable des éléments d'une collection nommée."""
        container_names = {
            ast.List: "liste",
            ast.Tuple: "tuple",
            ast.Set: "ensemble",
        }
        container_name = container_names.get(type(collection_node), "collection")
        if not getattr(collection_node, "elts", []):
            return f"{container_name} vide"

        element_type = self._get_collection_element_type(collection_node)
        if element_type == "élément mixte":
            return f"{container_name} mixte"
        return f"{container_name} de {self._get_plural_element_type(element_type)}"

    def _get_element_type_from_assignment_description(self, description: Any) -> str:
        """Relit les descriptions stockées par visit_Assign pour retrouver le type d'élément."""
        if not isinstance(description, str):
            return "élément"

        if "caractères" in description:
            return "caractère"
        if "nombres" in description:
            return "nombre"
        if "chaînes" in description:
            return "chaîne"
        if "booléens" in description:
            return "booléen"
        if "clés" in description:
            return "clé"
        if "variables" in description:
            return "variable"
        if "mixte" in description:
            return "élément mixte"
        return "élément"

    def _join_article_and_noun(self, article: str, noun: str) -> str:
        """Assemble correctement un article et un nom, y compris pour l'."""
        if article == "l'":
            return f"{article}{noun}"
        return f"{article} {noun}"

    def _format_entry_elements_phrase(self, element_type: str) -> str:
        """Retourne une forme courte pour les questions d'entrée de boucle."""
        return f"des {self._get_plural_element_type(element_type)}"

    def _get_augassign_operator_text(self, operator: ast.operator) -> str:
        """Retourne le texte de l'opérateur d'une affectation augmentée."""
        operator_map = {
            ast.Add: "+=",
            ast.Sub: "-=",
            ast.Mult: "*=",
            ast.Div: "/=",
            ast.FloorDiv: "//=",
            ast.Mod: "%=",
            ast.Pow: "**=",
            ast.BitAnd: "&=",
            ast.BitOr: "|=",
            ast.BitXor: "^=",
            ast.LShift: "<<=",
            ast.RShift: ">>=",
            ast.MatMult: "@=",
        }
        return operator_map.get(type(operator), f"{ast.unparse(operator)}=")

    def _get_assignment_display_parts(self, node: ast.stmt) -> Dict[str, str]:
        """Compatibilité: délègue vers le formateur générique de statements groupables."""
        return self._get_statement_display_parts(node)

    def _store_assignment_metadata(self, target_nodes: Sequence[ast.expr], value_node: ast.AST):
        """Mémorise les types simples rencontrés lors des affectations."""
        for target_node in target_nodes:
            if isinstance(target_node, ast.Name):
                var_name = target_node.id
                assigned_value_type_ast = type(value_node)
                if isinstance(value_node, ast.Constant):
                    self.variable_assignments[var_name] = (assigned_value_type_ast, value_node.value)
                elif isinstance(value_node, (ast.List, ast.Tuple, ast.Set)):
                    self.variable_assignments[var_name] = (
                        assigned_value_type_ast,
                        self._describe_collection_assignment(value_node),
                    )
                elif isinstance(value_node, ast.Name):
                    source_var_name = value_node.id
                    if source_var_name in self.variable_assignments:
                        self.variable_assignments[var_name] = self.variable_assignments[source_var_name]
                    else:
                        self.variable_assignments[var_name] = (ast.Name, "variable (type inconnu)")
                elif isinstance(value_node, ast.Call):
                    if isinstance(value_node.func, ast.Name):
                        called_func_name = value_node.func.id
                        if called_func_name in ['len', 'int']:
                            self.variable_assignments[var_name] = (ast.Call, "nombre (entier)")
                        elif called_func_name in ['str', 'upper', 'lower', 'chr', 'type']:
                            self.variable_assignments[var_name] = (ast.Call, "chaîne")
                        elif called_func_name in ['sum', 'min', 'max', 'abs', 'ord', 'float', 'pow']:
                            self.variable_assignments[var_name] = (ast.Call, "nombre")
                        else:
                            self.variable_assignments[var_name] = (ast.Call, f"résultat de {called_func_name}()")
                    else:
                        inferred_type = self._infer_type_from_value_node(value_node)
                        if inferred_type != "unknown":
                            self.variable_assignments[var_name] = (assigned_value_type_ast, inferred_type)
                        else:
                            self.variable_assignments[var_name] = (ast.Call, "résultat d'appel de fonction")
                else:
                    inferred_type = self._infer_type_from_value_node(value_node)
                    self.variable_assignments[var_name] = (assigned_value_type_ast, inferred_type)

    def _format_assignment_statement_label(self, node: ast.stmt) -> str:
        """Compatibilité: délègue vers le formateur générique de statements groupables."""
        return self._format_statement_label(node)

    def _visit_assignment_block(self, assign_nodes: Sequence[ast.stmt], parent_id: str) -> List[str]:
        """Fusionne une suite d'instructions groupables en un bloc visuel compact."""
        label_lines: List[str] = []
        render_rows: List[Dict[str, str]] = []
        for assign_node in assign_nodes:
            if isinstance(assign_node, ast.Assign):
                self._store_assignment_metadata(assign_node.targets, assign_node.value)
            elif isinstance(assign_node, ast.AnnAssign) and assign_node.value is not None:
                self._store_assignment_metadata([assign_node.target], assign_node.value)
            label_lines.append(self._format_statement_label(assign_node))
            row_parts = dict(self._get_statement_display_parts(assign_node))
            row_parts["source_span"] = self._build_source_span(
                source_start_node=assign_node,
                source_end_node=assign_node,
            )
            render_rows.append(row_parts)

        assign_block_id = self.add_node(
            "\n".join(label_lines),
            node_type="AssignmentBlock",
            source_start_node=assign_nodes[0],
            source_end_node=assign_nodes[-1],
            render_payload={
                "kind": "statement_block",
                "layout_mode": self._get_render_option("assignment_grouping_mode"),
                "rows": render_rows,
            },
        )
        self.add_edge(parent_id, assign_block_id)
        return [assign_block_id]

    def visit_Assign(self, node: ast.Assign, parent_id: str) -> List[str]:
        """Visite une instruction d'assignation AST."""
        value_node = node.value
        self._store_assignment_metadata(node.targets, value_node)
        label_text = self._format_statement_label(node)
        assign_node_id = self.add_node(label_text, node_type="Process", source_start_node=node)
        self.add_edge(parent_id, assign_node_id)
        return [assign_node_id]

    def visit_AnnAssign(self, node: ast.AnnAssign, parent_id: str) -> List[str]:
        """Visite une instruction d'assignation annotée AST."""
        if node.value is not None:
            self._store_assignment_metadata([node.target], node.value)
        label_text = self._format_statement_label(node)
        annassign_node_id = self.add_node(label_text, node_type="Process", source_start_node=node)
        self.add_edge(parent_id, annassign_node_id)
        return [annassign_node_id]

    def visit_AugAssign(self, node: ast.AugAssign, parent_id: str) -> List[str]:
        """Visite une instruction d'assignation augmentée AST."""
        label_text = self._format_statement_label(node)
        augassign_node_id = self.add_node(label_text, node_type="Process", source_start_node=node)
        self.add_edge(parent_id, augassign_node_id)
        return [augassign_node_id]

    def visit_Expr(self, node: ast.Expr, parent_id: str) -> List[str]:
        """Visite une instruction d'expression AST (souvent un appel de fonction autonome)."""
        # Une instruction Expr contient une valeur qui est évaluée (ex: print(), une fonction personnalisée).
        # On visite la valeur interne.
        return self.visit(node.value, parent_id)

    def visit_Call(self, node: ast.Call, parent_id: str) -> List[str]:
        """Visite un appel de fonction AST."""
        call_display = self._get_call_display_parts(node)
        node_type = call_display["node_type"]
        label_text = call_display["label_text"]

        call_node_id = self.add_node(label_text, node_type=node_type, source_start_node=node)
        self.add_edge(parent_id, call_node_id)
        return [call_node_id]


    def _evaluate_range_to_list_str(self, range_args_nodes: Sequence[ast.expr]) -> Optional[str]:
        """
        Tente d'évaluer les arguments d'un ast.Call à range() et de retourner
        la liste de nombres explicite sous forme de chaîne, ou None si l'évaluation échoue.
        Limite le nombre d'éléments pour éviter des chaînes trop longues.
        """
        MAX_RANGE_ELEMENTS_TO_DISPLAY = 10 # Limite pour l'affichage

        args_values = []
        for arg_node in range_args_nodes:
            if isinstance(arg_node, ast.Constant) and isinstance(arg_node.value, int):
                args_values.append(arg_node.value)
            else:
                return None # Un argument n'est pas un entier littéral, on ne peut pas dérouler

        start, stop, step = 0, 0, 1 # Valeurs par défaut Python pour range
        if len(args_values) == 1:
            stop = args_values[0]
        elif len(args_values) == 2:
            start, stop = args_values[0], args_values[1]
        elif len(args_values) == 3:
            start, stop, step = args_values[0], args_values[1], args_values[2]
        else:
            return None # Nombre d'arguments incorrect

        if step == 0:
            return None # step ne peut pas être 0

        result_numbers = []
        current_val = start
        count = 0

        if step > 0:
            while current_val < stop and count < MAX_RANGE_ELEMENTS_TO_DISPLAY:
                result_numbers.append(current_val)
                current_val += step
                count += 1
        else: # step < 0
            while current_val > stop and count < MAX_RANGE_ELEMENTS_TO_DISPLAY:
                result_numbers.append(current_val)
                current_val += step # step est négatif, donc on soustrait
                count += 1
        
        list_str = "[" + ", ".join(map(str, result_numbers))
        if count == MAX_RANGE_ELEMENTS_TO_DISPLAY and \
           ((step > 0 and current_val < stop) or (step < 0 and current_val > stop)):
            list_str += ", ..." # Indiquer que la liste est tronquée
        list_str += "]"
        return list_str


    def _get_iterable_description(self, iterable_node: ast.AST) -> \
                                 Tuple[str, str, str, str, str]:
        """
        Tente de donner une description du type de l'itérable et de ses éléments.
        Retourne: (
            iterable_kind_desc: information résiduelle sur la nature de l'itérable
            elements_type_desc_raw: "caractère", "nombre", "chaîne", "booléen", "variable", "mixte", "élément"
            iterable_display_name: nom brut de variable ou littéral Python pour affichage
            article_indefini_element: "un", "une"
            article_defini_element: "le", "la", "l'"
            )
        """
        iterable_kind_desc = "la collection" # Terme générique et neutre
        elements_type_desc_raw = "élément"
        # Par défaut, iterable_display_name est la représentation textuelle de l'itérable.
        # On l'affine pour les noms de variables et les chaînes littérales.
        iterable_display_name = ast.unparse(iterable_node).replace('"',"#quot;")
        article_indefini_element = "un" # par défaut
        article_defini_element = "l'"  # par défaut

        actual_node_to_inspect = iterable_node
        original_iterable_name_if_any = None

        if isinstance(iterable_node, ast.Name):
            original_iterable_name_if_any = iterable_node.id
            iterable_display_name = iterable_node.id
            iterable_kind_desc = "la variable" # Plus spécifique
            if iterable_node.id in self.variable_assignments:
                assigned_ast_type, assigned_value_or_desc = self.variable_assignments[iterable_node.id]
                if assigned_ast_type == ast.Constant and isinstance(assigned_value_or_desc, str):
                    actual_node_to_inspect = ast.Constant(value=assigned_value_or_desc)
                    # iterable_kind_desc reste "la variable", mais on inspecte son contenu
                elif assigned_ast_type in (ast.List, ast.Tuple, ast.Set):
                    actual_node_to_inspect = None
                    elements_type_desc_raw = self._get_element_type_from_assignment_description(assigned_value_or_desc)
                elif assigned_ast_type == ast.Call and isinstance(assigned_value_or_desc, str): # ex: "résultat de len()"
                    actual_node_to_inspect = None
                    if assigned_value_or_desc == "chaîne":
                        elements_type_desc_raw = "caractère"


        # Analyse de actual_node_to_inspect (qui peut être l'original ou un reconstitué/simulé)
        if isinstance(actual_node_to_inspect, ast.Constant):
            if isinstance(actual_node_to_inspect.value, str):
                iterable_kind_desc = "la chaîne" if not original_iterable_name_if_any else iterable_kind_desc # Garder "la variable" si c'en était une
                elements_type_desc_raw = "caractère" # forcément
                if not original_iterable_name_if_any:
                    iterable_display_name = ast.unparse(actual_node_to_inspect).replace('"', '#quot;')
        
        elif isinstance(actual_node_to_inspect, (ast.List, ast.Tuple)):
            if isinstance(actual_node_to_inspect, ast.List):
                iterable_kind_desc = "la liste" if not original_iterable_name_if_any else iterable_kind_desc
            else: # ast.Tuple
                iterable_kind_desc = "le tuple" if not original_iterable_name_if_any else iterable_kind_desc

            if hasattr(actual_node_to_inspect, 'elts') and actual_node_to_inspect.elts:
                elements_type_desc_raw = self._get_collection_element_type(actual_node_to_inspect)
                # else: elements_type_desc reste "élément" (liste/tuple vide ou types non identifiables)
            else: # Liste ou tuple vide
                elements_type_desc_raw = "élément"

        elif isinstance(actual_node_to_inspect, ast.Tuple):
            iterable_kind_desc = "le tuple" if not original_iterable_name_if_any else iterable_kind_desc
            elements_type_desc_raw = "élément" # Peut être affiné

        elif isinstance(actual_node_to_inspect, ast.Set):
            iterable_kind_desc = "l'ensemble" if not original_iterable_name_if_any else iterable_kind_desc
            elements_type_desc_raw = "élément" # Peut être affiné

        elif isinstance(actual_node_to_inspect, ast.Dict):
            iterable_kind_desc = "le dictionnaire" if not original_iterable_name_if_any else iterable_kind_desc
            elements_type_desc_raw = "clé"

        elif isinstance(actual_node_to_inspect, ast.Call) and \
             isinstance(actual_node_to_inspect.func, ast.Name) and \
             actual_node_to_inspect.func.id == 'range':
            # Tenter de dérouler le range
            evaluated_range_str = self._evaluate_range_to_list_str(actual_node_to_inspect.args)
            if evaluated_range_str:
                iterable_kind_desc = "la séquence" # Ou "la liste (générée par range)"
                elements_type_desc_raw = "nombre"
                iterable_display_name = evaluated_range_str # Affiche la liste explicite
            else: # N'a pas pu dérouler (args non littéraux)
                iterable_kind_desc = "la séquence (range)"
                elements_type_desc_raw = "nombre"
                # iterable_display_name est déjà ast.unparse(iterable_node)

        elif isinstance(actual_node_to_inspect, ast.Call): # Autre appel de fonction
            if iterable_kind_desc == "la collection" or iterable_kind_desc == "l'itérable": # Si pas déjà mis par la logique de variable
                func_name = ast.unparse(actual_node_to_inspect.func).replace('"', '#quot;')
                iterable_kind_desc = f"le résultat de {func_name}()"
            # elements_type_desc reste "élément"
        
        # Si c'était une variable à l'origine et qu'on n'a pas pu déterminer son type de contenu plus précisément
        if original_iterable_name_if_any and iterable_kind_desc in ["la collection", "l'itérable"]:
            iterable_kind_desc = f"la variable"

        # Déterminer les articles en fonction de elements_type_desc_raw
        if elements_type_desc_raw == "caractère": article_indefini_element = "un"; article_defini_element = "le"
        elif elements_type_desc_raw == "nombre": article_indefini_element = "un"; article_defini_element = "le"
        elif elements_type_desc_raw == "chaîne": article_indefini_element = "une"; article_defini_element = "la"
        elif elements_type_desc_raw == "booléen": article_indefini_element = "un"; article_defini_element = "le"
        elif elements_type_desc_raw == "clé": article_indefini_element = "une"; article_defini_element = "la"
        elif elements_type_desc_raw == "variable": article_indefini_element = "une"; article_defini_element = "la"
        # "élément mixte" et "élément" restent avec "un" et "l'" par défaut.

        return iterable_kind_desc, elements_type_desc_raw, iterable_display_name, \
               article_indefini_element, article_defini_element

    def _get_iterable_reference_text(self, iterable_kind_desc: str, iterable_display_name: str) -> str:
        """Construit le texte de référence de l'itérable selon la visibilité choisie."""
        if self._get_render_option("iterable_kind_visibility") != "show":
            return iterable_display_name

        if iterable_kind_desc.startswith("le résultat de "):
            return iterable_kind_desc

        if iterable_kind_desc and iterable_kind_desc != "l'itérable":
            return f"{iterable_kind_desc} {iterable_display_name}"

        return iterable_display_name


    def _simplify_junctions(self) -> Tuple[List[Tuple[str, str]], Set[Tuple[str, str, str]]]:
        """
        Tente de simplifier les jonctions triviales (1 entrée, 1 sortie).
        NOTE: Actuellement, visit_body ne crée pas de jonctions 1-entrée/1-sortie,
              donc cette fonction n'aura probablement pas d'effet.
              Elle est conservée pour une utilisation future potentielle.
        """
        simplified_nodes_tuples: List[Tuple[str,str]] = [] # Pour garder l'ordre des nœuds.
        simplified_edges = set()
        
        junction_to_successor_map: Dict[str, str] = {} # Mappe: junction_id_simplifiée -> son unique successeur.
        nodes_to_keep_ids = set(n_id for n_id, _ in self.nodes) # Commencer avec tous les nœuds.

        # Première passe: identifier les jonctions triviales à simplifier.
        for junction_candidate_id, _ in self.nodes:
            if self.node_types.get(junction_candidate_id) == "Junction":
                incoming_edges = [edge for edge in self.edges if edge[1] == junction_candidate_id]
                outgoing_edges = [edge for edge in self.edges if edge[0] == junction_candidate_id]

                if len(incoming_edges) == 1 and len(outgoing_edges) == 1:
                    predecessor_node = incoming_edges[0][0]
                    successor_node = outgoing_edges[0][1]
                    
                    # Éviter de simplifier si cela crée une auto-boucle sur la jonction elle-même.
                    if predecessor_node != junction_candidate_id and successor_node != junction_candidate_id : 
                        junction_to_successor_map[junction_candidate_id] = successor_node 
                        if junction_candidate_id in nodes_to_keep_ids:
                            nodes_to_keep_ids.remove(junction_candidate_id) # Marquer pour suppression.

        # Deuxième passe: construire les listes de nœuds et d'arêtes simplifiées.
        for node_id, label in self.nodes:
            if node_id in nodes_to_keep_ids: # N'ajouter que les nœuds conservés.
                simplified_nodes_tuples.append((node_id, label))

        for from_node, to_node, edge_label in self.edges:
            current_from_node = from_node
            current_to_node = to_node

            # Rediriger la destination si elle pointe vers une jonction simplifiée.
            # Répéter au cas où plusieurs jonctions triviales se suivent.
            while current_to_node in junction_to_successor_map:
                current_to_node = junction_to_successor_map[current_to_node]
            
            # Si la source et la destination (après redirection) sont des nœuds conservés.
            if current_from_node in nodes_to_keep_ids and current_to_node in nodes_to_keep_ids:
                # Éviter les auto-boucles créées par la simplification, sauf si elles sont labellisées.
                if current_from_node == current_to_node and not edge_label:
                    continue
                simplified_edges.add((current_from_node, current_to_node, edge_label))
        
        return simplified_nodes_tuples, simplified_edges

    def _format_mermaid_label(self, node_id: str, label_text: str, node_type: str) -> str:
        """Formate le label Mermaid d'un noeud, avec rendu HTML pour les blocs d'affectation."""
        if node_type == "AssignmentBlock":
            render_payload = self.node_render_payloads.get(node_id, {})
            rows = render_payload.get("rows", [])
            if rows:
                def _build_row_source_attrs(row_payload: Dict[str, Any]) -> str:
                    source_span = row_payload.get("source_span")
                    if not isinstance(source_span, dict):
                        return ""

                    source_attrs: List[str] = []
                    for attr_name, span_key in (
                        ("data-source-lineno", "lineno"),
                        ("data-source-end-lineno", "end_lineno"),
                        ("data-source-col-offset", "col_offset"),
                        ("data-source-end-col-offset", "end_col_offset"),
                    ):
                        value = source_span.get(span_key)
                        if isinstance(value, int):
                            source_attrs.append(f"{attr_name}='{value}'")

                    if not source_attrs:
                        return ""
                    return " " + " ".join(source_attrs)

                layout_mode = render_payload.get("layout_mode", "merged_block")
                rendered_rows: List[str] = []
                for row in rows:
                    row_source_attrs = _build_row_source_attrs(row)
                    cell_source_attrs = row_source_attrs
                    if row.get("kind") == "expression":
                        rendered_text = html.escape(row.get("text", ""), quote=False)
                        if layout_mode == "stacked_compact":
                            rendered_rows.append(
                                f"<tr{row_source_attrs}>"
                                f"<td colspan='3'{cell_source_attrs} style='border: 1px solid currentColor; padding: 0.25em 0.6em; text-align: left;'>{rendered_text}</td>"
                                "</tr>"
                            )
                        else:
                            rendered_rows.append(
                                f"<tr{row_source_attrs}>"
                                f"<td colspan='3'{cell_source_attrs} style='text-align: left;'>{rendered_text}</td>"
                                "</tr>"
                            )
                        continue

                    target_text = row.get("target", "")
                    annotation_text = row.get("annotation", "")
                    if annotation_text:
                        target_text = f"{target_text} : {annotation_text}"

                    if layout_mode == "stacked_compact":
                        rendered_rows.append(
                            f"<tr{row_source_attrs}>"
                            f"<td colspan='3'{cell_source_attrs} style='border: 1px solid currentColor; padding: 0.25em 0.6em; text-align: left;'>"
                            f"{html.escape(target_text, quote=False)}"
                            f" {html.escape(row.get('operator', ''), quote=False)}"
                            f" {html.escape(row.get('value', ''), quote=False)}"
                            "</td>"
                            "</tr>"
                        )
                        continue

                    rendered_rows.append(
                        f"<tr{row_source_attrs}>"
                        f"<td{cell_source_attrs} style='text-align: right; padding-right: 0.45em;'>{html.escape(target_text, quote=False)}</td>"
                        f"<td{cell_source_attrs} style='text-align: center; padding: 0 0.15em; min-width: 2.4em;'>{html.escape(row.get('operator', ''), quote=False)}</td>"
                        f"<td{cell_source_attrs} style='text-align: left; padding-left: 0.45em;'>{html.escape(row.get('value', ''), quote=False)}</td>"
                        "</tr>"
                    )
                return (
                    "<table style='font-family: Consolas, &quot;Courier New&quot;, monospace; border-collapse: collapse; margin: 0 auto;'>"
                    + "".join(rendered_rows)
                    + "</table>"
                )

        return label_text.replace('"', '#quot;').replace('\n', '<br/>')

    def to_mermaid(self) -> str:
        """Génère la représentation du graphe en syntaxe Mermaid, avec sous-graphes."""
        
        # Utiliser les nœuds et arêtes originaux. La simplification n'est pas activée par défaut.
        # Pour activer la simplification (si des jonctions 1-1 étaient créées) :
        # display_nodes_tuples, display_edges = self._simplify_junctions()
        display_nodes_tuples = self.nodes
        display_edges = set(self.edges)  # Copie pour modification

        ###################
        mermaid_lines = ["graph TD"] # Orientation de haut en bas.
        
        # Définitions de style pour les types de nœuds.
        mermaid_lines.extend([
            "    classDef StartEnd fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef Decision fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef Process fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef AssignmentBlock fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef IoOperation fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef Junction fill:#999,stroke:#fff,stroke-width:1px;", # Cercle pour jonction.
            "    classDef Return fill:#999,stroke:#fff,stroke-width:2px;",
            "    classDef Jump fill:#999,stroke:#fff,stroke-width:2px;"
        ])

        # --- Sous-graphe pour le Flux Principal ---
        if self.main_flow_nodes: # S'il y a des nœuds dans le flux principal.
            mermaid_lines.append("    subgraph Flux Principal")
            for node_id, label_text in display_nodes_tuples:
                if node_id in self.main_flow_nodes:
                    node_type = self.node_types.get(node_id, "Process")
                    safe_label = self._format_mermaid_label(node_id, label_text, node_type)
                    shape_open, shape_close = self._get_mermaid_node_shape(node_type, safe_label)
                    mermaid_lines.append(f'        {node_id}{shape_open}"{safe_label}"{shape_close}')
            mermaid_lines.append("    end")

        # --- Sous-graphes pour chaque Fonction Définie ---
        for func_name, node_ids_in_func in self.function_subgraph_nodes.items():
            if node_ids_in_func: # S'il y a des nœuds dans cette fonction.
                mermaid_lines.append(f'    subgraph Fonction {func_name}')
                for node_id, label_text in display_nodes_tuples:
                    if node_id in node_ids_in_func:
                        node_type = self.node_types.get(node_id, "Process")
                        safe_label = self._format_mermaid_label(node_id, label_text, node_type)
                        shape_open, shape_close = self._get_mermaid_node_shape(node_type, safe_label)
                        mermaid_lines.append(f'        {node_id}{shape_open}"{safe_label}"{shape_close}')
                mermaid_lines.append("    end")
        
        # --- Application des styles aux nœuds (en dehors des sous-graphes) ---
        node_style_lines = []
        for node_id, _ in display_nodes_tuples:
            node_type = self.node_types.get(node_id, "Process")
            node_style_lines.append(f'    class {node_id} {node_type};')
        mermaid_lines.extend(sorted(list(set(node_style_lines)))) # set pour dédupliquer.

##############
# --- correction finale des labels d'arêtes sortantes des décisions ---
        # pas réussi à m'assurer que les arêtes sortantes des décisions aient un label "False"
        # Si une décision a une arête sortante sans label, on la relabelise en "False".
        decision_nodes = {nid for nid, typ in self.node_types.items() if typ == "Decision"}
        relabeled_edges = set()
        for from_node, to_node, label in list(display_edges):
            if from_node in decision_nodes and label == "":
                # Relabel en "False"
                display_edges.remove((from_node, to_node, label))
                relabeled_edges.add((from_node, to_node, "Non"))
        display_edges = display_edges | relabeled_edges
# --- fin de la correction des labels d'arêtes sortantes des décisions ---      
        

        # --- Définition des Arêtes ---
        edge_definitions = []
        for from_node, to_node, edge_label_text in display_edges:
            safe_edge_label = edge_label_text.replace('"', '#quot;')
            # Vérifier que les nœuds existent toujours (surtout si la simplification était activée).
            if not any(n[0] == from_node for n in display_nodes_tuples) or \
               not any(n[0] == to_node for n in display_nodes_tuples):
                continue

            if safe_edge_label: 
                edge_definitions.append(f"    {from_node} -->|{safe_edge_label}| {to_node}")
            else: 
                edge_definitions.append(f"    {from_node} --> {to_node}")
        
        mermaid_lines.extend(sorted(list(set(edge_definitions)))) # set pour dédupliquer.
        print("\n--- DEBUG: Arêtes envoyées à Mermaid ---")
        for e in display_edges:
            print(e)
        return "\n".join(mermaid_lines)

    def _get_mermaid_node_shape(self, node_type: str, label: str) -> Tuple[str, str]:
        """Helper pour obtenir les délimiteurs de forme Mermaid en fonction du type de nœud."""
        shape_open = "[" ; shape_close = "]" # Forme par défaut (rectangle).
        if node_type == "StartEnd": shape_open, shape_close = "(((", ")))" # cercle doublé
        elif node_type == "Decision": shape_open, shape_close = "{", "}" # Losange.
        elif node_type == "Junction": 
            # Si la jonction n'a pas de label ou un label générique "Junction", la rendre petite (cercle).
            if not label or label == "Junction" or label == "#quot;Junction#quot;": 
                shape_open, shape_close = "((", "))" # Petit cercle.
                # safe_label = "" # Rendre la jonction sans texte (déjà géré par le label vide).
            else: # Jonction avec un label spécifique.
                shape_open, shape_close = "((", "))"
        elif node_type == "Return": shape_open, shape_close = "[(", ")]" # Parallélogramme incliné.
        elif node_type == "Jump": shape_open, shape_close = "((", "))" # Stade (comme StartEnd).
        elif node_type == "IoOperation": shape_open, shape_close = "[/", "/]" # Parallélogramme pour I/O.
        return shape_open, shape_close

# FIN DU FICHIER EN MODE MODULE


'''
############### Choisir le code à tester ###############
import exemples
selected_code = exemples.defif
########################################################

# --- Génération et Affichage ---
print(f"--- Code Python analysé ---")
print(selected_code)

cfg = ControlFlowGraph(selected_code)
# Lancer la visite à partir de la racine de l'AST (le module)
cfg.visit(cfg.tree, None) # Le parent initial est None
print(ast.dump(cfg.tree))
print("\n--- Mermaid Généré ---")
print(cfg.to_mermaid())

# Optionnel : Afficher les noeuds et arêtes pour le débogage
print("\n--- Noeuds (ID, Label) ---")
for n in cfg.nodes:
     print(n)
print("\n--- Arêtes (From, To, Label) ---")
for e in sorted(list(cfg.edges)): # Trié pour la lisibilité
     print(e)
print("\n--- Noeuds Terminaux ---")
print(cfg.terminal_nodes)
'''

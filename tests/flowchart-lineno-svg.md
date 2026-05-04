# Notes Sur Le Mapping Lineno Et Le SVG

## Mapping AST -> CodeMirror

- Python AST remonte `lineno` et `end_lineno` en base 1.
- CodeMirror est initialise avec `firstLineNumber: 0` dans `js/main.js`, donc la gouttiere affiche aussi des lignes en base 0.
- Le bridge Pyodide/JS conserve les deux representations dans `js/flowchart-generator.js`:
  - `nodeSourceSpans`: valeurs AST brutes, donc base 1 pour `lineno` et `end_lineno`.
  - `nodeSourceSpansEditor`: version normalisee pour l'editeur, avec `editorLine = lineno - 1` et `editorEndLine = end_lineno - 1`.
- Les colonnes AST (`col_offset`, `end_col_offset`) restent deja en base 0 cote Python. Elles peuvent etre reutilisees telles quelles pour un futur surlignage fin dans CodeMirror.
- Pour un bloc d'affectations unifie, la plage source est volontairement agrandie du premier statement du bloc jusqu'au dernier. Exemple:
  - `x = 1`
  - `x += 1`
  - `x -= 2`
  - le noeud CFG unique portera `lineno = 1` et `end_lineno = 3`.

## Production D'un SVG Programmatique

- Le SVG vivant est produit par Mermaid juste apres `mermaid.run(...)` dans `js/flowchart-generator.js`.
- A ce moment-la, le DOM contient deja le vrai `<svg>` et c'est le meilleur point d'injection pour enrichir les noeuds avec des `data-*`, des handlers, ou une table de correspondance `node_id -> plage source`.
- L'export actuel passe ensuite par `js/main.js`:
  - `exportFlowchartAsSvg()` clone le SVG courant, nettoie les styles inline Mermaid, reinjecte les styles voulus, puis serialize vers un blob SVG.
  - `exportFlowchartAsPng()` clone aussi le SVG, le serialize en data URL, puis le rasterise dans un canvas avant telechargement.
- Cette chaine est deja suffisante pour un SVG programmatique exploitable par le front-end, a condition de propager en amont les metadonnees voulues dans le DOM SVG avant le clonage.

## Consequences Pratiques

- Si l'on veut cliquer un noeud de logigramme pour viser l'editeur, il faut utiliser `nodeSourceSpansEditor` cote JS, pas `nodeSourceSpans` directement.
- Si l'on veut exporter un SVG interactif ou enrichi, il faut injecter les attributs dans le SVG juste apres `mermaid.run(...)`, puis laisser les fonctions d'export cloner ce SVG deja enrichi.
- Le rendu HTML des blocs d'affectations unifies repose deja sur `htmlLabels: true`; cette capacite sera egalement utile pour de futures metadonnees visuelles, mais elle ne remplace pas un enrichissement du vrai DOM SVG pour l'interactivite.
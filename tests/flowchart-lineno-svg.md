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

## Choix d'implémentation (au 04.05.26 à 22:30)

- `MyCFG.py` enregistre la plage source d'un noeud soit a partir d'un noeud AST, soit a partir d'un span explicite calcule pour le CFG.
- Les noeuds `Decision` de `if` et `while` sont maintenant ancres sur `node.test`, donc sur l'expression effectivement evaluee.
- Les noeuds synthétiques de controle d'un `for` sont ancres sur la ligne d'en-tete `for ... in ...`, y compris l'initialisation de l'iterateur, afin de rendre visible que ces etapes appartiennent a une meme ligne de controle en Python meme si elles sont decomposées dans le CFG.
- Le noeud `Start fonction` est ancre sur la ligne `def ...`, tandis que `End fonction` ne porte pas de plage source.
- Les blocs d'affectations unifies restent ancres sur un span agrégé, mais uniquement quand les statements sont reellement contigus dans le code source. Un `def` top-level agit donc comme separateur et empeche toute fusion abusive entre affectations placees avant et apres lui.
- Cote JS, `flowchart-generator.js` continue de normaliser les spans pour l'editeur, et `main.js` applique ou efface ensuite la selection CodeMirror en miroir de la selection du diagramme.

Résultat : Le comportement de selection suit maintenant la semantique pedagogique du noeud CFG plutot que la seule portee syntaxique du statement AST. Pour un `if` ou un `while`, le clic fait ressortir la condition evaluee; pour un `for`, il fait ressortir la ligne d'en-tete qui porte textuellement le mecanisme de controle; pour `Start fonction`, il fait ressortir la declaration `def`. Ce choix sert mieux le tracage du controle, limite la surcharge cognitive, et evite de laisser croire qu'un losange de decision « possede » tout un bloc de texte au moment ou il est clique. La desélection suit la meme logique: si le noeud du diagramme n'est plus selectionne, l'editeur ne doit pas conserver de trace visuelle residuelle, afin d'eviter une ambiguite tardive pour les eleves.


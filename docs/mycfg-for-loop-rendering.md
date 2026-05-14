# Rendu Mermaid des boucles `for` dans `MyCFG.py`

## Objectif pédagogique

Le rendu Mermaid des boucles `for` suit désormais un seul modèle visuel :

1. une décision compacte sur la poursuite de l'itération ;
2. une affectation uniforme de la variable de boucle ;
3. le corps de la boucle ;
4. un retour vers la même décision.

Ce choix vise deux contraintes simultanées :

- rester dans une zone de compréhension adaptée à des élèves débutants ;
- rester défendable du point de vue de la sémantique Python.

## Forme retenue

Le graphe produit pour `for i in X:` est conceptuellement le suivant :

```text
Reste-t-il un élément à parcourir dans X ?
  Non -> sortie de boucle, ou bloc else s'il existe
  Oui -> i ← prochain élément de X
           -> corps de la boucle
           -> retour au test
```

Les libellés Mermaid visibles sont volontairement sobres :

- décision : `Reste-t-il un élément à parcourir dans X ?`
- affectation : `i ← prochain élément de X`

Le terme affiché est toujours `élément`, même si l'inférence interne détecte un
contenu homogène (`nombre`, `caractère`, etc.). Cela évite d'enseigner un modèle
 différent selon le cas affiché, tout en restant correct pour les listes mixtes en Python.

## Pourquoi ce modèle

L'ancien rendu faisait une distinction entre :

- un premier passage avec `Le premier élément` ;
- des passages suivants avec `l'élément suivant`.

Cette forme posait deux problèmes :

1. elle introduisait un faux cas spécial pour le premier tour ;
2. elle risquait de suggérer une affectation initiale inconditionnelle, alors qu'en Python la variable de boucle n'est pas assignée du tout si l'itérable est vide.

Le nouveau modèle évite ces deux défauts.

## Rigueur sur `for ... else`

Le branchement `else` d'un `for` est désormais raccordé à la branche `Non` de la
 décision unique. Cela garantit le comportement Python correct :

- si la boucle se termine naturellement, le `else` s'exécute ;
- si un `break` survient, le `else` est contourné ;
- si l'itérable est vide, on passe immédiatement par `Non`, donc le `else` s'exécute aussi.

## Conservation de l'inférence de type

Le simplification des libellés n'efface pas l'inférence réalisée par `MyCFG.py`.

Les informations suivantes restent calculées à partir de l'AST et des affectations
 déjà connues :

- nom affichable de l'itérable ;
- nature de l'itérable ;
- type inféré des éléments (`nombre`, `caractère`, `élément`, etc.).

Ces données sont attachées aux nœuds de contrôle de boucle via `render_payload`.

Exemple de payload utile pour des usages ultérieurs :

```json
{
  "kind": "for_loop_control",
  "role": "decision",
  "iterator_variable": "item",
  "iterable_display_name": "values",
  "iterable_kind_desc": "la variable",
  "inferred_element_type": "nombre"
}
```

Cette séparation permet de garder :

- un rendu stable et lisible pour les élèves ;
- une base riche pour la génération future de questions pédagogiques.

## Points d'extension

Si un futur affichage veut réintroduire l'information de type, il est préférable
de le faire comme une option d'interface ou un habillage secondaire, plutôt que
dans le libellé principal de la boucle.
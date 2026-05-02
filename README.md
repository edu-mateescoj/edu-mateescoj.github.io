# edu-mateescoj.github.io

## MyCFG.py: 
- verbosité des boucles !!
-> for list: La variable (liste) 'ma_liste' contient des éléments? ... Le premier élément de 'ma_liste'...
-> for string : c'est le contraire! dnas le code "ma_chaine" mais dnas le logigramme ma_chaine
- rappel du type de l'itérable dans la condition de boucle ?
- rappel du type d'itérateur : pertinent ??

## Dix prompts pour migration vers MVP implémentant Role Based Access Control:
(inspiration: Classroom)
NB: demmander aussi de produire un petit bloc “tests manuels” (curl ou Postman) pour valider rapidement chaque route.

# prompt 1
Tu es dans le fichier database.sql (MySQL). Objectif : implémenter le MVP “cours + code de cours + RBAC” sans casser l’existant.

1) Modifie la table `user` pour ajouter une colonne `role` (VARCHAR(20)) avec valeur par défaut 'student'. Prévois un index sur role si utile.
2) Crée une table `course` :
   - id INT PK AUTO_INCREMENT
   - owner_user_id INT NOT NULL (FK -> user.id)
   - name VARCHAR(120) NOT NULL
   - join_code_hash VARCHAR(255) NOT NULL (ou join_code VARCHAR(32) si tu préfères MVP)
   - created_at DATETIME NOT NULL
   - archived_at DATETIME NULL
   - is_active BOOLEAN NOT NULL DEFAULT 1
   + index sur owner_user_id, index unique sur join_code_hash (ou join_code)
3) Crée une table `course_membership` :
   - id INT PK AUTO_INCREMENT
   - course_id INT NOT NULL (FK -> course.id)
   - user_id INT NOT NULL (FK -> user.id)
   - display_name VARCHAR(120) NULL (pseudo par cours)
   - joined_at DATETIME NOT NULL
   - status VARCHAR(20) NOT NULL DEFAULT 'active'
   + contrainte unique (course_id, user_id)
4) Ajoute une colonne `course_id` (INT NULL) à CHAQUE table de log existante : generation, code, diagram, verify_answer, reveal_solution, load_event.
   - Ajoute une FK vers course(id) (ON DELETE SET NULL) et index sur course_id.
   - Ne rends pas course_id NOT NULL pour préserver les données existantes.
5) Écris les ALTER/CREATE de façon idempotente (IF NOT EXISTS quand possible) et garde le style actuel du fichier.

Retour attendu : le SQL complet à coller dans database.sql (avec commentaires).

# prompt 2

Tu es dans connexion.html. Objectif : MVP UX.

1) Dans le formulaire "Connexion" (signin), ajoute un champ optionnel:
   - <input type="text" name="course_code" placeholder="Code du cours (optionnel)" />
2) Dans le formulaire "Créer un compte" (signup), ajoute une checkbox:
   - name="is_teacher" (valeur "1") avec label "Je suis enseignant"
3) Ne casse pas le toggle existant entre formulaires.
4) Conserve le style inline simple actuel.

Retour attendu : le diff / le code modifié de connexion.html.

# prompt 3

Tu es dans app.py. Objectif : ajouter RBAC minimal sans refactor massif.

1) Modifie signup(username, password) pour accepter un paramètre is_teacher (bool) et insérer role='teacher' ou 'student' dans la table user.
2) Modifie signin(username, password) pour charger aussi le role depuis la table user et stocker dans la session :
   - session['username']
   - session['role']
   - session['user_id'] (évite de refaire get_user_id partout)
3) Ajoute une fonction utilitaire get_current_user() qui lit session et renvoie {user_id, username, role} ou None.
4) Ajoute un décorateur simple require_role('teacher') utilisable sur des routes (retourne JSON 403 si API, sinon redirect).
5) Mets à jour get_user_id(username) si nécessaire, mais préfère utiliser session['user_id'] dans le reste du code.

Retour attendu : code Python prêt à coller + explication brève des changements.

# prompt 4

Dans app.py, implémente le mécanisme de "cours actif" en session (l’élève saisit un 'code du cours' à la connexion, et tout le logging continue via cookie de session).

1) Ajoute une fonction generate_join_code() robuste (8 chars alphanum, sans caractères ambigus) + hash_join_code(code) (utilise bcrypt ou sha256).
2) Ajoute une fonction resolve_course_by_code(course_code) qui retrouve course.id via join_code_hash.
3) Ajoute une route POST /join-course :
   - nécessite utilisateur connecté
   - body JSON { course_code, display_name? }
   - crée course_membership si absent
   - définit session['active_course_id']=course_id
   - renvoie JSON {status:'success', course_id}
4) Modifie authenticate() (route /login) :
   - lit request.form['course_code'] (optionnel) lors du signin
   - si présent et valide : rejoint le cours + set active_course_id
   - sinon continue normalement
5) Gère erreurs : code invalide -> flash message + pas de join; ne bloque pas la connexion.

Retour attendu : code des fonctions + route + patch sur /login.

# prompt 5

Dans app.py, mets à jour toute la journalisation pour inclure course_id.

1) Ajoute une fonction get_active_course_id() qui renvoie session.get('active_course_id') ou None.
2) Modifie ces fonctions de persistence SQL pour insérer course_id :
   - generation_log
   - executed_code_log
   - diagram_log
   - verify_answers_log
   - reveal_solution_log
   - load_example_log
3) Modifie aussi les routes /log/* si besoin, mais idéalement elles restent inchangées côté client : elles utilisent course_id depuis session.
4) Respecte le style existant : cursor = mysql.connection.cursor(), commit, close. :contentReference[oaicite:6]{index=6}
5) Compatibilité : si active_course_id est None, insère NULL et n’échoue pas.

Retour attendu : patch complet app.py pour la partie logs.

# prompt 6

Dans app.py, crée une mini-API dashboard enseignant (JSON) protégée par require_role('teacher').

Routes :
1) POST /api/teacher/courses
   - body { name }
   - crée un course avec owner_user_id=session['user_id'], join_code_hash
   - renvoie {id, name, join_code_plain} (renvoyer le code en clair UNE SEULE FOIS)
2) GET /api/teacher/courses
   - renvoie la liste des cours du prof (id, name, is_active, created_at, archived_at)
3) POST /api/teacher/courses/<course_id>/regenerate-code
   - régénère le join_code (invalide l’ancien)
   - renvoie join_code_plain une seule fois

Contraintes :
- Vérifie que course.owner_user_id == session['user_id'].
- Erreurs JSON claires (401/403/404/400).
- Ajouter des index dans SQL était fait dans la migration, donc ici focus backend.

Retour attendu : code des routes + fonctions utilitaires nécessaires.

# prompt 7

Dans app.py, ajoute GET /api/teacher/courses/<course_id>/students (teacher only).

Objectif : renvoyer une synthèse par élève inscrit au cours, en une requête SQL par table max (ou une requête agrégée si tu peux).

Réponse JSON attendue (liste) :
[
  {
    "user_id": 12,
    "display_name": "Eleve A",
    "joined_at": "...",
    "last_activity_at": "...",
    "counts": {
      "generation": 5,
      "flowchart_generation": 3,   // table code ou diagram selon ton modèle
      "verify_answer": 10,
      "reveal_solution": 2,
      "load_event": 1
    }
  },
  ...
]

Contraintes :
- scope strict : uniquement ce course_id et uniquement les membres (course_membership).
- last_activity_at = max des timestamps dans toutes les tables (utilise COALESCE/MAX).
- performance : ajoute des indexes si tu juges indispensable (mais indique-les clairement).

Retour attendu : code route + requêtes SQL + format JSON.

# prompt 8

Dans app.py, ajoute GET /api/teacher/courses/<course_id>/students/<student_user_id>/timeline (teacher only).

Réponse JSON attendue :
[
  {"type":"generation", "at":"...", "meta":{"difficulty":3}},
  {"type":"flowchart_generation", "at":"...", "meta":{"code_id":42,"difficulty":3}},
  {"type":"verify_answer", "at":"...", "meta":{"code_id":42,"summary":{"correct":2,"wrong":1,"blank":1}}},
  {"type":"reveal_solution", "at":"...", "meta":{"code_id":42}},
  {"type":"load_example", "at":"...", "meta":{"example_name":"..."}}
]

Contraintes :
- Vérifier que student_user_id est bien membre du cours.
- Trier par date ASC.
- Ne renvoie PAS le code source complet (ni canonical) dans le MVP, seulement des métadonnées.

Retour attendu : route + requêtes + assemblage Python.

# prompt 9

Dans app.py, ajoute GET /api/teacher/courses/<course_id>/activity (teacher only).

Objectifs :
- activity_by_day: nombre total d'événements par jour (sur 30 jours glissants)
- funnel: nombre d'élèves ayant au moins 1 event de chaque type (generation / code / verify_answer / reveal_solution)
- difficulty_distribution: distribution des difficulty (à partir de generation et/ou code)

Renvoie un JSON structuré et stable (clés fixes), prêt pour une UI dashboard.

Contraintes :
- Scope strict course_id
- Si pas de données, renvoie des tableaux vides (pas d’erreur)
- Requêtes SQL lisibles, commentées.

Retour attendu : route + SQL + JSON output schema.

# prompt 10

Dans db_queries.js, ajoute des fonctions pour consommer l'API teacher (sans framework) :

- teacherCreateCourse(name)
- teacherListCourses()
- teacherListStudents(courseId)
- teacherGetStudentTimeline(courseId, studentUserId)
- teacherGetCourseActivity(courseId)

Contraintes :
- Reprendre le style logFactory (fetch + headers JSON + credentials same-origin + gestion erreurs).
- Ne pas toucher aux fonctions de logs existantes.
- Retourner des Promises résolues avec data JSON.

Retour attendu : code prêt à coller.

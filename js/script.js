function generateDynamicExercise() {
    const variableNames = Object.keys(variableNamesWithTypes.anglais);
    let selectedVariables = [];
    while (selectedVariables.length < 3) {
        const randomIndex = Math.floor(Math.random() * variableNames.length);
        const variable = variableNames[randomIndex];
        if (!selectedVariables.includes(variable)) {
            selectedVariables.push(variable);
        }
    }
    // Définir des valeurs initiales aléatoires
    let expressions = [];
    currentCorrectAnswers = {}; // Réinitialiser les réponses correctes

    selectedVariables.forEach((variable, index) => {
        let value = Math.floor(Math.random() * 10) + 1; // Valeurs aléatoires pour l'exemple
        expressions.push(`${variable} = ${value}`);
        currentCorrectAnswers[`${variable}-answer`] = value.toString(); // Sauvegarde des réponses correctes
    });

    // Affichage des expressions générées
    document.getElementById('code-display').textContent = expressions.join('\n');
}

// Appel initial pour configurer un exercice par défaut
generateDynamicExercise();


function verifyAnswers() {
  //astuce débogage
  console.log('Vérification des réponses...');
    // Exemple simple de vérification des réponses
    let answers = {
        "v1": document.getElementById('v1-answer').value,
        "r": document.getElementById('r-answer').value,
        "v3": document.getElementById('v3-answer').value
    };

    let feedback = "Vérification non implémentée."; // Vous devez implémenter la logique basée sur le dernier exercice généré.
    document.getElementById('feedback').textContent = feedback;
}
/*
function verifyAnswers() {
  //astuce débogage
  console.log('Vérification des réponses...');
  // Réponses attendues
  const correctAnswers = { 'v1-answer': '2', 'r-answer': '2', 'v3-answer': '4' };

  // Vérification des réponses de l'utilisateur
  Object.keys(correctAnswers).forEach(id => {
    const userAnswer = document.getElementById(id).value;
    const isCorrect = userAnswer === correctAnswers[id];
    document.getElementById(id).style.backgroundColor = isCorrect ? 'lightgreen' : 'salmon';
  });
}
*/

function showAnswers() {
  //astuce débogage
  console.log('Appel de la fonction...');
  // Afficher les bonnes réponses
  document.getElementById('v1-answer').value = '2';
  document.getElementById('r-answer').value = '2';
  document.getElementById('v3-answer').value = '4';

  // Réinitialiser la couleur de fond des réponses
  document.querySelectorAll('input[type=text]').forEach(input => {
    input.style.backgroundColor = 'lightgray';
  });
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('verify-button').addEventListener('click', verifyAnswers);
    document.getElementById('show-button').addEventListener('click', showAnswers);
    document.getElementById('generate-button').addEventListener('click', generateDynamicExercise);
    generateDynamicExercise(); // Générer un premier exercice au chargement
});


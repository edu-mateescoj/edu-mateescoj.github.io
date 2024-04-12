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

// Assurer que le DOM est complètement chargé avant d'ajouter les écouteurs d'événements
document.addEventListener('DOMContentLoaded', (event) => {
  // Ajouter l'écouteur d'événement pour le bouton si nécessaire
  // document.querySelector('button').addEventListener('click', verifyAnswers);
});

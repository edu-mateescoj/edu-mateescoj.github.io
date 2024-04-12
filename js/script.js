function verifyAnswers() {
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
  // Afficher les bonnes réponses
  document.getElementById('v1-answer').value = '2';
  document.getElementById('r-answer').value = '2';
  document.getElementById('v3-answer').value = '4';

  // Réinitialiser la couleur de fond des réponses
  document.querySelectorAll('input[type=text]').forEach(input => {
    input.style.backgroundColor = 'lightgray';
  });
}

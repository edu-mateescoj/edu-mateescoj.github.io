function verifyAnswers() {
  // Réponses attendues
  const correctAnswers = { v1: '2', r: '2', v3: '4' };
  
  // Vérification des réponses de l'utilisateur
  document.querySelectorAll('input[type=text]').forEach(input => {
    const isCorrect = input.value === correctAnswers[input.id.split('-')[0]];
    input.style.backgroundColor = isCorrect ? 'lightgreen' : 'salmon';
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

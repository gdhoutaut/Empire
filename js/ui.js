<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Empire</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <div id="root"></div>
  <div id="modal-overlay" onclick="UI.closeModal()">
    <div class="modal" id="modal-box" onclick="event.stopPropagation()"></div>
  </div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
  <script src="js/data.js"></script>
  <script src="js/engine.js"></script>
  <script src="js/db.js"></script>
  <script src="js/ui.js"></script>
  <script>
    let gameState = DB.load();
    if (!gameState) {
      gameState = Engine.createNewGame();
      DB.addLog(gameState, 'neutral', 'Partie démarrée. 10 000 € disponibles.');
      DB.save(gameState);
    }
    UI.init(gameState);
  </script>
</body>
</html>

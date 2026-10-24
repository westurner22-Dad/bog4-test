// Balls or Gapes IV test build. Realtime Database REST under prefix bog4/ (separate from the dnd-oneshot paths).
window.GAME_CONFIG = {
  backend: 'firebase',
  firebase: { databaseURL: 'https://c-thug-default-rtdb.firebaseio.com', prefix: 'bog4' },
  dataBase: 'design/',
  threshold: null,          // null = Designer's 13
  primarySwap: true
};

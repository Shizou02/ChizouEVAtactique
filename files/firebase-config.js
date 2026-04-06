/*  StratHub — firebase-config.js
    Initialisation Firebase (Auth + Firestore).
    Chargé via CDN compat dans chaque page HTML.
    Ce fichier suppose que les scripts suivants sont chargés AVANT lui :
      - firebase-app-compat.js
      - firebase-auth-compat.js
      - firebase-firestore-compat.js
*/

const firebaseConfig = {
  apiKey: "AIzaSyCIwn5rbTG16X1Ny4OJkdTB6--xZVimswo",
  authDomain: "strathub-eva.firebaseapp.com",
  projectId: "strathub-eva",
  storageBucket: "strathub-eva.firebasestorage.app",
  messagingSenderId: "700721568484",
  appId: "1:700721568484:web:843eda047ce4a178a46af1",
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

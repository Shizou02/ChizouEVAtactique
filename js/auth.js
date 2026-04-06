/*  StratHub — auth.js
    Gestion de l'authentification Firebase.
    Dépend de : firebase-config.js (auth, db)
    Fonctionne sur toutes les pages (index, maps, armes, board, login).
*/

// ─── État auth sur la topbar ─────────────────────────────────────────────────

function updateAuthUI(user) {
  const authBtn = document.getElementById("authBtn");
  const authUser = document.getElementById("authUser");

  if (!authBtn) return;

  if (user) {
    // Connecté → afficher pseudo + bouton déconnexion
    const displayName = user.displayName || user.email.split("@")[0];
    if (authUser) authUser.textContent = displayName;
    authBtn.textContent = "DÉCONNEXION";
    authBtn.onclick = () => {
      auth.signOut();
    };
  } else {
    // Déconnecté → bouton vers login
    if (authUser) authUser.textContent = "";
    authBtn.textContent = "CONNEXION";
    authBtn.onclick = () => {
      window.location.href = "login.html";
    };
  }
}

// Écouter les changements d'état auth
auth.onAuthStateChanged((user) => {
  updateAuthUI(user);
});

// ─── Fonctions auth (utilisées par login.html) ──────────────────────────────

async function authRegister(email, password, pseudo) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  // Stocker le pseudo dans le profil Firebase
  await cred.user.updateProfile({ displayName: pseudo });
  // Créer le document joueur dans Firestore
  await db.collection("users").doc(cred.user.uid).set({
    pseudo: pseudo,
    email: email,
    team: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  return cred.user;
}

async function authLogin(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

function authLogout() {
  return auth.signOut();
}

function authCurrentUser() {
  return auth.currentUser;
}

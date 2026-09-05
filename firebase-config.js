/* ------------------------------------------------------------------
   Configuration Firebase — À REMPLIR AVEC TES PROPRES CLÉS

   Ce fichier connecte le mode "en ligne avec un code de partie" à ta
   propre base de données Firebase (gratuite). Sans ça, le bouton
   "En ligne avec un code" affichera un message d'erreur.

   Comment obtenir ces valeurs : voir la section "Mode en ligne" du
   README.md à la racine du dépôt (environ 5 minutes, aucune carte
   bancaire requise).
------------------------------------------------------------------- */

const firebaseConfig = {
  apiKey: "REMPLACE_MOI",
  authDomain: "REMPLACE_MOI.firebaseapp.com",
  databaseURL: "https://REMPLACE_MOI-default-rtdb.firebaseio.com",
  projectId: "REMPLACE_MOI",
  storageBucket: "REMPLACE_MOI.appspot.com",
  messagingSenderId: "REMPLACE_MOI",
  appId: "REMPLACE_MOI"
};

let firebaseReady = false;
try{
  if(firebaseConfig.apiKey !== "REMPLACE_MOI"){
    firebase.initializeApp(firebaseConfig);
    firebaseReady = true;
  }
}catch(e){
  console.warn('Firebase non initialisé :', e);
}

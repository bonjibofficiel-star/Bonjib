# Bonjib - système de livraison

Site web installable sur téléphone (PWA), sans dépendances.

- Client : `/`  (commande + suivi en direct sur la carte)
- Livreur : `/driver`  (code PIN, commandes, statuts, GPS automatique)

## Lancer en local
    DRIVER_PIN=4821 node server.js
Puis ouvre http://localhost:3000 et http://localhost:3000/driver

## Mettre en ligne (obligatoire en HTTPS pour le GPS)
1. Héberge sur Render / Railway / Fly.io (Node, commande de démarrage: `node server.js`).
2. Variables d'environnement : `DRIVER_PIN` (ton code secret) et `DATA_DIR` (dossier persistant pour data.json).
3. Branche le domaine bonjib.com sur l'hébergeur (enregistrements DNS donnés par l'hébergeur).

## Installer comme application
- Android (Chrome) : menu ⋮ > "Installer l'application".
- iPhone (Safari) : Partager > "Sur l'écran d'accueil".

## Limites de cette première version
- Un seul livreur (toi). La position est partagée par tout le monde, donc 1 livreur à la fois.
- Pas de notifications push quand l'app est fermée (le bip marche quand l'écran du livreur est ouvert).
- Données dans un fichier JSON (suffisant pour démarrer, à remplacer par une vraie base plus tard).

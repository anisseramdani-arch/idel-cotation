IDEL Cotation — version 18 NGAP

Contenu
- Application PWA à fichiers statiques, déployable sur GitHub Pages.
- Fiches patient avec plusieurs lignes d’actes, sélection du libellé, lettre-clé, coefficient et passage.
- Calcul estimatif selon la lettre-clé et les règles de cumul implémentées ci-dessous.
- Suivi journalier, historique, clôture à date, réorganisation, bilan mensuel et export Excel conservés.
- Stockage des données dans le localStorage du navigateur, sous la clé historique idel-pwa-v1.

Données patient et confidentialité
Le data.js livré ne contient aucun patient nominatif. Les fichiers reçus comprenaient des noms de patients et des cotations dans un fichier JavaScript qui serait publiquement consultable après déploiement sur un dépôt GitHub public. Ces lignes ont donc été retirées du fichier public.
Une installation déjà utilisée conserve ses patients et son historique dans le localStorage du navigateur lorsque l’application est mise à jour sur la même adresse GitHub Pages et dans le même navigateur. Ne videz pas les données du site et ne changez pas de domaine avant d’avoir sauvegardé les informations.
Sur une première installation ou un navigateur sans données locales, il faudra créer les fiches patient. Le ZIP ne contient pas de copie privée de la liste nominative.

Références utilisées
- NGAP Assurance Maladie, version en vigueur au 01/09/2026 :
  https://www.ameli.fr/sites/default/files/Documents/NGAP%2001.09.2026%20VF.pdf
- Lettre-clé AMI et AMX : le tarif passe à 3,35 € après le délai conventionnel de six mois, puis à 3,45 € au 01/11/2027 (métropole) :
  https://www.ameli.fr/infirmier/textes-reference/convention/avenants
- Décision UNCAM publiée au Journal officiel le 22/10/2026 : plusieurs changements à compter du 06/11/2026, du 01/01/2027 et du 01/01/2028 :
  https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000055006333
- Tarifs conventionnels Assurance Maladie :
  https://www.ameli.fr/infirmier/exercice-liberal/facturation-remuneration/tarifs-conventionnels/tarifs

Règles prises en compte
- NGAP article 11B : pour des actes soumis à cette règle réalisés au même passage, le coefficient le plus élevé est à taux plein, le second à 50 %, les suivants sans honoraires.
- Dérogations codées explicitement pour les forfaits BSA/BSB/BSC à taux plein, le prélèvement par ponction veineuse directe, l’association analgésie topique + pansement dans le cas prévu par la NGAP, et le cumul des deux forfaits de perfusion visés par le texte.
- En présence d’un forfait de dépendance, le calcul affiche des avertissements : les actes associés et exceptions dépendent du type exact de soin et du contexte BSI.
- Les majorations MAU/MCI affichent une alerte de contrôle de leurs critères. Le moteur ne connaît ni l’ordonnance, ni les conditions cliniques, ni les actes réellement exécutés.
- « BSI » désigne le bilan de soins infirmiers, pas une lettre-clé tarifaire. Les forfaits sont BSA/BSB/BSC ; la saisie du bilan est cotée en DI selon son type.

Limites réglementaires importantes
Le catalogue intégré est une sélection d’actes infirmiers fréquents, pas l’intégralité des 229 pages de la NGAP. Vérifiez le libellé et le coefficient de chaque acte dans le texte officiel.
Un même patient peut avoir plusieurs passages dans une journée : les lignes doivent être affectées au bon passage. Le moteur ne peut pas inférer cela de la fiche.
Le calcul de cumul reste indicatif. Il ne certifie pas une feuille de soins et n’interprète pas toutes les exceptions de tous les chapitres.
Les évolutions prévues au 01/01/2027 et au 01/01/2028 sont signalées comme à revalider, et ne sont pas toutes modélisées. Le tarif DROM AMI/AMX après le 06/11/2026 n’est pas auto-déduit : vérifiez le barème ou saisissez la valeur applicable dans « Tarifs NGAP… ».
Les tarifs de nuit, dimanche/jour férié et passage de l’application d’origine sont conservés comme compléments séparés. Ils ne sont pas recalculés à partir de la situation exacte de chaque acte.

Déploiement GitHub Pages
1. Sauvegardez les données du navigateur et le dépôt actuel avant remplacement.
2. Décompressez le ZIP. Copiez tous les fichiers de ce dossier à la racine du dépôt GitHub Pages, en gardant icon-192.png et icon-512.png.
3. Vérifiez que le dépôt ne contient pas de fichier data.js ou autre fichier public avec des noms/cotations patients. Le fichier data.js de ce ZIP ne contient aucun dossier patient nominatif.
4. Validez le changement et attendez la fin de GitHub Pages.
5. Ouvrez l’application sur la même adresse qu’avant, puis actualisez complètement (Ctrl+F5). Le nouveau cache PWA est idel-pwa-v18-ngap.

Si l’application existait déjà sur cette adresse, les données enregistrées localement sont conservées. Les lignes ajoutées au moteur d’actes sont enregistrées dans la fiche patient; une ancienne cotation texte reste inchangée tant qu’aucune nouvelle ligne n’est ajoutée. Ajouter une ligne puis enregistrer remplace cette cotation historique par les actes structurés.

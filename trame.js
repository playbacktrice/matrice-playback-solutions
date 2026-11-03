// Trame validée : 4 catégories, 29 sous-catégories obligatoires + 5 champs facultatifs (optional: true).
// Les identifiants (id) sont stables : ils servent de clés dans les exports JSON et pour l'import du 16 novembre.
window.TRAME = [
  {
    id: "c1", num: "1", title: "Parcours et réalités actuelles",
    intro: "Comprendre le travail actuel, au-delà d'une liste de références.",
    items: [
      { id: "c1-historique",   title: "Historique", hint: "Création, grandes étapes, évolutions marquantes" },
      { id: "c1-projets",      title: "Projets réalisés et marchés visés", hint: "Projets représentatifs, types de clients et secteurs" },
      { id: "c1-specialites",  title: "Spécialités", hint: "Ce qui vous distingue, votre cœur de métier" },
      { id: "c1-produits",     title: "Produits et services vendus", hint: "Ce que vous facturez concrètement" },
      { id: "c1-fonctionnement", title: "Fonctionnement actuel", hint: "Ce qui est porté, ce qui fonctionne bien, limites rencontrées" },
      { id: "c1-complements", title: "Informations complémentaires", hint: "Précisions, remarques ou éléments qui ne correspondent pas aux rubriques ci-dessus", optional: true }
    ]
  },
  {
    id: "c2", num: "2", title: "Envies, ambitions et visions",
    intro: "Comment chacun envisage son développement à court, moyen et long terme : types de projets, clientèle, dimension de l'activité, place personnelle dans l'organisation. Pas nécessaire d'avoir une vision entièrement définie : les questions ouvertes font aussi partie de l'échange.",
    items: [
      { id: "c2-court",       title: "Court terme", hint: "Les 12 prochains mois" },
      { id: "c2-moyen",       title: "Moyen terme", hint: "D'ici 2 à 3 ans" },
      { id: "c2-long",        title: "Long terme", hint: "Au-delà de 3 ans" },
      { id: "c2-deleguer",    title: "Tâches à déléguer", hint: "Ce que vous ne voulez plus ou ne pouvez plus porter" },
      { id: "c2-evolutions",  title: "Évolutions envisagées", hint: "Changements souhaités dans le rôle, le périmètre ou l'organisation" },
      { id: "c2-temps",       title: "Temps consacré à cette démarche", hint: "Part du temps de travail dédiée aux projets partagés (en % ou en jours par mois)" },
      { id: "c2-complements", title: "Informations complémentaires", hint: "Précisions, remarques ou éléments qui ne correspondent pas aux rubriques ci-dessus", optional: true }
    ]
  },
  {
    id: "c3", num: "3", title: "Méthodes de travail et conditions de collaboration",
    intro: "Pour chacun des thèmes ci-dessous, préciser les éléments à conserver, ceux pouvant être partagés ou adaptés, et les éventuels points de blocage. L'objectif est d'identifier à la fois les complémentarités et les différences à discuter.",
    items: [
      { id: "c3-qualite",     title: "Qualité de service", hint: "Niveau d'exigence, standards, contrôle avant livraison" },
      { id: "c3-documentation", title: "Documentation", hint: "Ce qui est écrit, archivé, transmis" },
      { id: "c3-relation",    title: "Relation client", hint: "Qui est l'interlocuteur, comment le suivi se fait" },
      { id: "c3-autonomie",   title: "Autonomie", hint: "Marge de manœuvre de chacun, ce qui doit être validé" },
      { id: "c3-imprevus",    title: "Gestion des imprévus", hint: "Réaction face à un problème, à une urgence, à un retard" },
      { id: "c3-outils",      title: "Outils et logiciels", hint: "Outils de gestion, devis, facturation, communication" },
      { id: "c3-decision",    title: "Prise de décision", hint: "Qui décide quoi, et comment ?" },
      { id: "c3-complements", title: "Informations complémentaires", hint: "Précisions, remarques ou éléments qui ne correspondent pas aux rubriques ci-dessus", optional: true }
    ]
  },
  {
    id: "c4", num: "4", title: "Nos ressources et nos besoins",
    intro: "État des lieux des moyens disponibles. Préciser les ressources existantes, mobilisables et manquantes.",
    items: [
      { id: "c4-materiel",    title: "Matériel", hint: "Équipements techniques, véhicules" },
      { id: "c4-locaux",      title: "Locaux", hint: "Bureaux, studios, stockage" },
      { id: "c4-equipe",      title: "Équipe (salariés)", hint: "Postes et rôles" },
      { id: "c4-collaborateurs", title: "Collaborateurs réguliers (freelances récurrents)", hint: "Profils et fréquence" },
      { id: "c4-partenaires", title: "Partenaires (structures)", hint: "Prestataires, fournisseurs, structures alliées" },
      { id: "c4-reseau",      title: "Réseau et clients", hint: "Contacts clés, clients fidèles" },
      { id: "c4-outils",      title: "Outils et logiciels", hint: "Outils en place, abonnements" },
      { id: "c4-comp-tech",   title: "Compétences techniques", hint: "Savoir-faire métier" },
      { id: "c4-comp-com",    title: "Compétences commerciales", hint: "Prospection, négociation, vente" },
      { id: "c4-comp-admin",  title: "Compétences administratives", hint: "Gestion, comptabilité, juridique" },
      { id: "c4-comp-orga",   title: "Compétences organisationnelles", hint: "Planification, coordination, suivi de projet" },
      { id: "c4-complements", title: "Informations complémentaires", hint: "Précisions, remarques ou éléments qui ne correspondent pas aux rubriques ci-dessus", optional: true }
    ]
  }
  ,{
    id: "c5", num: "", title: "Commentaires généraux", optional: true,
    intro: "Remarques générales sur l'ensemble de la démarche (facultatif).",
    items: [
      { id: "commentaires-generaux", title: "Commentaires généraux", hint: "Remarques, précisions ou éléments non abordés dans le questionnaire", optional: true }
    ]
  }
];

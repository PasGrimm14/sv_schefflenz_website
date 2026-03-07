import express from 'express';
import { createDirectus, rest, readItems, readSingleton } from '@directus/sdk';

// 1. Verbindung zu DEINEM neuen Server-CMS
const directus = createDirectus('http://pasgri-cloud.de:8055/').with(rest());

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Hilfsfunktion für Bild-URLs (Directus Assets)
const getImg = (id) => id ? `http://pasgri-cloud.de:8055/assets/${id}` : '/images/placeholder.jpg';

// --- ROUTEN ---

// --- MIDDLEWARE ---
// Diese Funktion läuft vor JEDER Seitenanfrage
app.use(async (req, res, next) => {
  try {
    // Hole die globalen Einstellungen (Singleton)
    const globals = await directus.request(readSingleton('globals'));
    
    // Speichere sie in res.locals -> Damit sind sie in ALLEN EJS-Dateien (auch footer) verfügbar
    res.locals.globals = globals;
  } catch (err) {
    console.error("Konnte Globals nicht laden:", err);
    // Fallback, falls Directus nicht erreichbar ist
    res.locals.globals = {}; 
  }
  // Mache auch die getImg Funktion global verfügbar (spart das Übergeben in jeder Route)
  res.locals.getImg = getImg; 
  
  next(); // Weiter zur eigentlichen Route
});

// 1. STARTSEITE
app.get('/', async (req, res) => {
  try {
    // Hole die neuesten 3 News für den Teaser-Bereich
    const news = await directus.request(readItems('news', {
      sort: ['-date_posted'],
      limit: 3,
      filter: { status: { _eq: 'Published' } }
    }));
    
    // Rendere index.ejs und übergebe die News
    res.render('index', { news, getImg });
  } catch (err) {
    console.error(err);
    res.render('index', { news: [], getImg });
  }
});

// 2. VORSTAND
app.get('/vorstand', async (req, res) => {
  try {
    const members = await directus.request(readItems('vorstand', {
      sort: ['sort'], // Sortierung aus CMS
    }));

    // Teile die Daten in die zwei Gruppen auf (wie in deiner HTML Datei)
    const executive = members.filter(m => m.group === 'executive');
    const extended = members.filter(m => m.group === 'extended');

    res.render('vorstand', { executive, extended, getImg });
  } catch (err) {
    res.send('Fehler beim Laden der Vorstände');
  }
});

// --- NEWS LOGIK ---

// 1. NEWS ÜBERSICHT (Aktuell: jünger als 12 Monate)
app.get('/news', async (req, res) => {
  try {
    // Berechne Datum vor 12 Monaten
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const news = await directus.request(readItems('news', {
      sort: ['-date_posted'],
      filter: { 
        status: { _eq: 'Published' },
        // _gte = greater than or equal (neuer oder gleich alt wie das Stichtagsdatum)
        date_posted: { _gte: oneYearAgo.toISOString() } 
      }
    }));
    
    // Wir rendern die normale news.ejs
    res.render('news', { news, getImg });
  } catch (err) {
    console.error(err);
    res.send('Fehler beim Laden der News');
  }
});

// 2. NEWS ARCHIV (Alt: älter als 12 Monate)
app.get('/news/archiv', async (req, res) => {
  try {
    // Berechne Datum vor 12 Monaten
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const news = await directus.request(readItems('news', {
      sort: ['-date_posted'],
      filter: { 
        status: { _eq: 'Published' },
        // _lt = less than (älter als das Stichtagsdatum)
        date_posted: { _lt: oneYearAgo.toISOString() } 
      }
    }));

    // Wir rendern eine neue Datei news-archiv.ejs
    res.render('news-archiv', { news, getImg });
  } catch (err) {
    console.error(err);
    res.send('Fehler beim Laden des Archivs');
  }
});

// 3. NEWS DETAILSEITE (Bleibt gleich, funktioniert für beide)
app.get('/news/:slug', async (req, res) => {
    // ... (hier am bestehenden Code nichts ändern) ...
    // Da wir hier nur nach Slug suchen, werden auch Archiv-Artikel gefunden.
    try {
        const result = await directus.request(readItems('news', {
          filter: { slug: { _eq: req.params.slug } },
          limit: 1
        }));
    
        if (result.length === 0) return res.status(404).send('Artikel nicht gefunden');
        
        res.render('news-detail', { article: result[0], getImg });
      } catch (err) {
        res.status(500).send('Server Fehler');
      }
});

// --- IMPRESSUM ROUTE (mit Status-Check) ---
app.get('/impressum', async (req, res) => {
  try {
    // 1. Daten abrufen
    const data = await directus.request(readSingleton('impressum'));

    // 2. Status prüfen
    // Wenn Daten fehlen ODER der Status nicht 'published' ist -> Fehler/Umleitung
    if (!data || data.status !== 'published') {
       console.log('Impressum ist offline oder Entwurf.');
       // Option A: Auf Startseite leiten
       return res.redirect('/'); 
       // Option B: 404 Seite anzeigen (falls vorhanden)
       // return res.status(404).render('404');
    }

    // 3. Wenn Status OK -> Seite rendern
    res.render('impressum', { 
        title: 'Impressum - SV Schefflenz',
        data: data,
        getImg 
    });

  } catch (err) {
    console.error('Fehler beim Laden des Impressums:', err);
    // Bei Server-Fehler sicherheitshalber auf Startseite leiten
    res.redirect('/');
  }
});

// --- DATENSCHUTZ ROUTE ---
app.get('/datenschutz', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('datenschutz'));

    // Status-Check: Nur anzeigen, wenn veröffentlicht
    if (!data || data.status !== 'published') {
       return res.redirect('/'); 
    }

    res.render('datenschutz', { 
        title: 'Datenschutz - SV Schefflenz',
        data: data,
        getImg
    });
  } catch (err) {
    console.error('Fehler beim Laden des Datenschutzes:', err);
    res.redirect('/');
  }
});

// --- FSJ SEITE ---
app.get('/fsj', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('fsj_page'));

    if (!data || data.status !== 'published') {
       return res.redirect('/'); 
    }

    res.render('fsj', { 
        title: 'FSJ beim SV Schefflenz',
        data: data,
        getImg
    });
  } catch (err) {
    console.error('Fehler FSJ Seite:', err);
    res.redirect('/');
  }
});

// --- SPORTSTÄTTEN ROUTE ---
app.get('/sportstaetten', async (req, res) => {
  try {
    const venues = await directus.request(readItems('sportstaetten', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort'], // Sortierung beachten
      fields: ['*', 'images.directus_files_id'] // Wir brauchen die IDs der Bilder
    }));

    res.render('sportstaetten', { 
        title: 'Unsere Sportstätten - SV Schefflenz',
        venues: venues, // Liste an die View übergeben
        getImg
    });
  } catch (err) {
    console.error('Fehler Sportstätten:', err);
    res.render('sportstaetten', { title: 'Sportstätten', venues: [], getImg });
  }
});

// --- MITGLIEDSCHAFT ROUTE ---
app.get('/mitgliedschaft', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('membership'));

    // Sicherheitscheck
    if (!data || data.status !== 'published') {
       return res.redirect('/'); 
    }

    res.render('mitgliedschaft', { 
        title: 'Mitglied werden - SV Schefflenz',
        data: data,
        getImg
    });
  } catch (err) {
    console.error('Fehler Mitgliedschaft:', err);
    res.redirect('/');
  }
});

// --- SCHÜTZEN ROUTE ---
app.get('/schuetzen', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('schuetzen_page'));

    // Status Check (optional, falls Sie das Feld 'status' angelegt haben)
    // if (!data || data.status !== 'published') return res.redirect('/'); 

    res.render('schuetzen', { 
        title: 'Schützen - SV Schefflenz',
        data: data || {}, // Fallback falls leer
        getImg
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// --- VOLLEYBALL ROUTE ---
app.get('/volleyball', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('volleyball_page'));

    // Falls Sie Status nutzen: if (!data || data.status !== 'published') return res.redirect('/'); 

    res.render('volleyball', { 
        title: 'Volleyball - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Volleyball-Seite:', err);
    res.redirect('/');
  }
});

// --- GOLDIES ROUTE ---
app.get('/breitensport/goldies', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('goldies_page'));

    // if (!data || data.status !== 'published') return res.redirect('/'); 

    res.render('goldies', { 
        title: 'Goldies - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Goldies-Seite:', err);
    res.redirect('/');
  }
});

// --- OLDIES ROUTE ---
app.get('/breitensport/oldies', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('oldies_page'));

    res.render('oldies', { 
        title: 'Oldies - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Oldies-Seite:', err);
    res.redirect('/');
  }
});

// --- NORDIC WALKING ROUTE ---
app.get('/breitensport/nordic-walking', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('nordic_walking_page'));

    res.render('nordic-walking', { 
        title: 'Nordic Walking - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Nordic-Walking-Seite:', err);
    res.redirect('/');
  }
});

// --- KINDERTURNEN ROUTE ---
app.get('/breitensport/kinderturnen', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('kinderturnen_page'));

    res.render('kinderturnen', { 
        title: 'Kinderturnen - SV Schefflenz',
        data: data || {}, // Fallback, falls noch leer
        getImg
    });
  } catch (err) {
    console.error('Fehler Kinderturnen-Seite:', err);
    res.redirect('/');
  }
});

// --- FUSSBALL JUGEND ROUTE ---
app.get('/fussball/jugend', async (req, res) => {
  try {
    // 1. Singleton abrufen (Header, Intro)
    const pageData = await directus.request(readSingleton('juniors_page'));
    
    // 2. Teams abrufen (Liste)
    // Wir sortieren nach 'sort', damit die Reihenfolge wie im CMS ist (Bambini zuerst)
    const teams = await directus.request(readItems('junior_teams', {
      filter: { status: { _eq: 'published' } },
      sort: ['sort'] 
    }));

    res.render('jugend', { 
        title: 'Junioren - SV Schefflenz',
        page: pageData || {}, 
        teams: teams || [],
        getImg
    });
  } catch (err) {
    console.error('Fehler Jugend-Seite:', err);
    // Fallback, falls mal was schiefgeht: Leere Seite rendern statt Absturz
    res.render('jugend', { title: 'Junioren', page: {}, teams: [], getImg });
  }
});

// --- SCHIEDSRICHTER ROUTE ---
app.get('/fussball/schiedsrichter', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('referee_page'));

    res.render('schiedsrichter', { 
        title: 'Schiedsrichter - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Schiedsrichter-Seite:', err);
    res.redirect('/');
  }
});

// --- ALTE HERREN ROUTE ---
app.get('/fussball/alte-herren', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('ah_page'));

    res.render('alte-herren', { 
        title: 'Alte Herren - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error('Fehler Alte-Herren-Seite:', err);
    res.redirect('/');
  }
});

// --- SENIOREN ROUTE ---
app.get('/fussball/senioren', async (req, res) => {
  try {
    const data = await directus.request(readSingleton('seniors_page'));
    res.render('senioren', { 
        title: 'Senioren - SV Schefflenz',
        data: data || {}, 
        getImg
    });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// --- SERVER STARTEN ---
app.listen(PORT, () => {
  console.log(`Frontend läuft lokal auf http://localhost:${PORT}`);
});
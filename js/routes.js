// Screen map (docs/09): every section, its route, Japanese label (only the
// allowed table of docs/02), icon, "Más" group, phase and lock scope.
// Sections not built yet render a placeholder that says in which phase they arrive.
// module: the file that renders a built section (Fase 3 onward); without it the section is "Pronto".

export const TABS = [
  { id: 'inicio', path: '/inicio', title: 'Inicio', jp: '今', romaji: 'ima', icon: 'house', phase: '2', key: '1' },
  { id: 'capsula', path: '/capsula', title: 'Cápsula', jp: '思い出', romaji: 'omoide', icon: 'hourglass', phase: '2', key: '2' },
  { id: 'cupones', path: '/cupones', title: 'Cuponera', jp: '券', romaji: 'ken', icon: 'ticket', phase: '2', key: '3' },
  { id: 'cartas', path: '/cartas', title: 'Cartas', jp: '手紙', romaji: 'tegami', icon: 'mail', phase: '2', key: '4' },
  { id: 'mas', path: '/mas', title: 'Más', jp: 'もっと', romaji: 'motto', icon: 'layout-grid', phase: '1', key: '5' },
];

export const GROUPS = [
  { id: 'nosotros', title: 'Nosotros', jp: '二人', romaji: 'futari', sections: [
    { id: 'calendario', title: 'Calendario', jp: 'カレンダー', romaji: 'karendā', icon: 'calendar', phase: '3', module: 'calendario', blurb: 'Citas, fechas y capas en un solo calendario.' },
    { id: 'fechas', title: 'Fechas especiales', jp: '記念日', romaji: 'kinenbi', icon: 'cake', phase: '3', module: 'fechas', blurb: 'Aniversario, cumpleaños y cuentas regresivas.' },
    { id: 'insignias', title: 'Racha e insignias', jp: 'バッジ', romaji: 'bajji', icon: 'award', phase: '4A', module: 'insignias', blurb: 'Lo que van logrando juntos.' },
    { id: 'rasca', title: 'Rasca y gana', jp: '当たり', romaji: 'atari', icon: 'wand-sparkles', phase: '4B', module: 'rasca', blurb: 'Premios pequeños para raspar.' },
    { id: 'animo', title: 'Medidor de ánimo', jp: '気分', romaji: 'kibun', icon: 'smile', phase: '3', module: 'animo', blurb: 'Cómo amanece cada uno.' },
    { id: 'resumen', title: 'Resumen del año', jp: '年間', romaji: 'nenkan', icon: 'sparkles', phase: '4A', module: 'resumen', moment: true, blurb: 'Su año en historias, con modo Wrapped.' },
    { id: 'recordatorios', title: 'Recordatorios', jp: 'お知らせ', romaji: 'oshirase', icon: 'bell', phase: '3', module: 'recordatorios', blurb: 'Avisos suaves y calendario del teléfono.' },
    { id: 'encuentro', title: 'Próximo encuentro', jp: '次回', romaji: 'jikai', icon: 'plane', phase: '4A', module: 'encuentro', blurb: 'La cuenta regresiva para verse.' },
  ] },
  { id: 'recuerdos', title: 'Recuerdos', jp: '思い出', romaji: 'omoide', sections: [
    { id: 'galeria', title: 'Galería', jp: '写真', romaji: 'shashin', icon: 'image', phase: '4A', module: 'galeria', blurb: 'Todas sus fotos en un lugar.' },
    { id: 'album', title: 'Álbum "Nuestro año"', jp: 'アルバム', romaji: 'arubamu', icon: 'book-open', phase: '4A', module: 'album', blurb: 'Collages por mes y por año.' },
    { id: 'mapa', title: 'Mapa de lugares', jp: '地図', romaji: 'chizu', icon: 'map', phase: '4A', module: 'mapa', blurb: 'Donde han estado y adonde irán.' },
    { id: 'primeras-veces', title: 'Primeras veces', jp: '初めて', romaji: 'hajimete', icon: 'star', phase: '4A', module: 'primeras-veces', blurb: 'El álbum de sus primeras veces.' },
    { id: 'capsula-tiempo', title: 'Cápsula del tiempo', jp: 'タイムカプセル', romaji: 'taimu kapuseru', icon: 'lock', phase: '4A', module: 'capsula-tiempo', moment: true, blurb: 'Mensajes que se abren en el futuro.' },
    { id: 'photobooth', title: 'Photobooth', jp: 'プリクラ', romaji: 'purikura', icon: 'camera', phase: '4A', module: 'photobooth', blurb: 'Tiras de fotos con marco.' },
    { id: 'diario', title: 'Diario', jp: '日記', romaji: 'nikki', icon: 'notebook-pen', phase: '3', module: 'diario', blurb: 'Lo que pasó hoy, en pocas líneas.' },
    { id: 'voz', title: 'Notas de voz', jp: '声', romaji: 'koe', icon: 'mic', phase: '4A', module: 'voz', blurb: 'Su voz para los días que la necesiten.' },
  ] },
  { id: 'juntos', title: 'Juntos', sections: [
    { id: 'preguntas', title: 'Preguntas y quiz', jp: 'クイズ', romaji: 'kuizu', icon: 'message-circle-question', phase: '3', module: 'preguntas', blurb: 'Una pregunta al día para conocerse más.' },
    { id: 'lenguajes', title: 'Lenguajes del amor', jp: '愛', romaji: 'ai', icon: 'heart-handshake', phase: '4A', module: 'lenguajes', blurb: 'Cómo le gusta a cada uno sentirse querido.' },
    { id: 'gratitud', title: 'Gratitud y revisión', jp: '感謝', romaji: 'kansha', icon: 'hand-heart', phase: '4A', module: 'gratitud', blurb: 'El frasco de gracias y la revisión semanal.' },
    { id: 'retos', title: 'Reto semanal', jp: '挑戦', romaji: 'chōsen', icon: 'flag', phase: '3', module: 'retos', blurb: 'Un reto de pareja cada semana.' },
    { id: 'habitos', title: 'Hábitos', jp: '習慣', romaji: 'shūkan', icon: 'repeat', phase: '4B', module: 'habitos', blurb: 'Pequeños hábitos que hacen juntos.' },
    { id: 'canciones', title: 'Canciones', jp: '歌', romaji: 'uta', icon: 'music', phase: '3', module: 'canciones', blurb: 'Las canciones que se dedican y su playlist.' },
    { id: 'planes', title: 'Planes juntos', jp: '願い', romaji: 'negai', icon: 'list-checks', phase: '4A', module: 'planes', blurb: 'Lo que quieren vivir juntos.' },
    { id: 'suenos', title: 'Sueños y viajes', jp: '夢', romaji: 'yume', icon: 'moon-star', phase: '4A', module: 'suenos', blurb: 'Los grandes sueños, paso a paso.' },
    { id: 'citas', title: 'Sugerencias de citas', jp: 'デート', romaji: 'dēto', icon: 'dices', phase: '4A', module: 'citas', blurb: 'Una idea nueva cuando no se les ocurre nada.' },
    { id: 'modo-cita', title: 'Modo cita', jp: 'お出かけ', romaji: 'odekake', icon: 'heart', phase: '0.10', module: 'modo-cita', blurb: 'Para la salida: al final arma el recuerdo solo.' },
    { id: 'cine', title: 'Noche de cine', jp: '映画', romaji: 'eiga', icon: 'film', phase: '0.14', module: 'juegos', blurb: 'Lo que quieren ver juntos.' },
    { id: 'reto30', title: 'Desafío de 30 días', jp: '三十日', romaji: 'sanjūnichi', icon: 'calendar', phase: '0.14', module: 'juegos', blurb: 'Un mini reto de pareja al día.' },
    { id: 'regalos', title: 'Regalos secretos', jp: '贈り物', romaji: 'okurimono', icon: 'gift', phase: '4A', module: 'regalos', blurb: 'Ideas de regalo que el otro no ve.' },
  ] },
  { id: 'jugar', title: 'Jugar', jp: '遊び', romaji: 'asobi', sections: [
    { id: 'juegos', title: 'Juegos', jp: '遊び', romaji: 'asobi', icon: 'gamepad-2', phase: '5', module: 'juegos', blurb: 'Juegos en pareja, en persona.' },
    { id: 'liga', title: 'Liga', jp: 'リーグ', romaji: 'rīgu', icon: 'trophy', phase: '0.14', module: 'juegos', blurb: 'El ganador del mes y su marcador.' },
    { id: 'modos', title: 'Modos', jp: '時間', romaji: 'jikan', icon: 'leaf', phase: '0.14', module: 'juegos', blurb: 'Modo juntos y Modo cita.' },
    { id: 'eventos', title: 'Eventos de temporada', jp: '季節', romaji: 'kisetsu', icon: 'party-popper', phase: '5', module: 'eventos', moment: true, blurb: 'Fechas del año con su decoración.' },
  ] },
  { id: 'hogar', title: 'Hogar', sections: [
    { id: 'mascotas', title: 'Mascotas', jp: 'ペット', romaji: 'petto', icon: 'paw-print', phase: '4B', module: 'mascotas', blurb: 'Perfil, salud y fotos de cada mascota.' },
    { id: 'alcancia', title: 'Alcancía', jp: '貯金', romaji: 'chokin', icon: 'piggy-bank', phase: '4B', module: 'alcancia', blurb: 'Metas de ahorro para sus planes.' },
    { id: 'gastos', title: 'Gastos compartidos', jp: '家計', romaji: 'kakei', icon: 'wallet', phase: '4B', module: 'gastos', blurb: 'Cuentas claras y sin culpa.' },
    { id: 'listas', title: 'Listas', jp: 'リスト', romaji: 'risuto', icon: 'list-todo', phase: '4B', module: 'listas', blurb: 'Mercado y pendientes de la casa.' },
    { id: 'recetas', title: 'Recetas y menú en casa', jp: 'レシピ', romaji: 'reshipi', icon: 'chef-hat', phase: '4B', module: 'recetas', blurb: 'Recetas y citas para cocinar juntos.' },
  ] },
  { id: 'personal', title: 'Mi espacio', jp: '自分', romaji: 'jibun', sections: [
    { id: 'jibun', title: 'Mi espacio', jp: '自分', romaji: 'jibun', icon: 'user-round', phase: '3', module: 'jibun', lock: 'person', blurb: 'Lo tuyo, solo para ti.' },
  ] },
  { id: 'sistema', title: 'Sistema', jp: '設定', romaji: 'settei', sections: [
    { id: 'ajustes', title: 'Ajustes', jp: '設定', romaji: 'settei', icon: 'settings', phase: '1', blurb: 'Apariencia, seguridad, copia y más.' },
    { id: 'ajustes/perfil', title: 'Perfil y datos', jp: '情報', romaji: 'jōhō', icon: 'users', phase: '2', blurb: 'Nombres, fechas y textos de la app.' },
  ] },
];

// moment: true = not listed in Más; it shows up as a notice on Inicio only when it applies
// (Resumen at month/year end, Cápsula del tiempo on opening day, Eventos while a season is on).

/** Hidden section: not listed in "Más"; opened with the secret gesture. Neutral name only. */
export const HIDDEN = [
  { id: 'yoru', title: 'Rincón', jp: '夜', romaji: 'yoru', icon: 'moon', phase: '6', module: 'yoru', lock: 'vault', blurb: 'Solo para los dos, con su PIN.' },
  { id: 'ciclo', title: 'Mi calendario', icon: 'calendar', phase: '4B', module: 'ciclo', lock: 'cycle', blurb: '' },
  { id: 'buscar', title: 'Buscar', icon: 'search', phase: '2', module: 'buscar', blurb: 'Busca en todo lo que no es privado.' },
];

// module: which file renders the page; pages without one are not built yet ("Pronto").
export const SETTINGS_PAGES = [
  { id: 'perfil', title: 'Perfil y datos', jp: '情報', romaji: 'jōhō', icon: 'users', phase: '2', module: 'perfil' },
  { id: 'seguridad', title: 'Centro de seguridad', icon: 'shield-check', phase: '2', module: 'ajustes' },
  { id: 'privacidad', title: 'Privacidad', icon: 'eye-off', phase: '2', module: 'privacidad' },
  { id: 'copia', title: 'Copia de seguridad', icon: 'hard-drive', phase: '2', module: 'ajustes' },
  { id: 'papelera', title: 'Papelera', icon: 'trash-2', phase: '0.10', module: 'papelera' },
  { id: 'sincronizar', title: 'Sincronización', icon: 'refresh-cw', phase: 'A', module: 'sync' },
  { id: 'apariencia', title: 'Apariencia', icon: 'palette', phase: '1', module: 'settings' },
  { id: 'movimiento', title: 'Movimiento y sonido', icon: 'sparkles', phase: '1', module: 'settings', hidden: true },
  { id: 'permisos', title: 'Permisos', icon: 'shield-check', phase: 'A', module: 'permisos' },
  { id: 'terceros', title: 'Modo sin terceros', icon: 'shield', phase: '2', module: 'privacidad' },
  { id: 'legal', title: 'Legal y ayuda', icon: 'file-text', phase: '1', module: 'settings' },
  { id: 'acerca', title: 'Acerca de', icon: 'info', phase: '1', module: 'settings' },
];

export const allSections = () => [...GROUPS.flatMap((g) => g.sections), ...HIDDEN];
export const sectionById = (id) => allSections().find((s) => s.id === id) || TABS.find((t) => t.id === id);

// ---------- hubs (2026-11-21): related sections joined under one entry with tabs ----------
// Each section keeps its route; Más and the favorites list only the hub (its first tab), and every
// tab shows the same strip on top. Nothing was removed, only grouped.
export const HUBS = [
  { id: 'calendario', title: 'Calendario', icon: 'calendar', blurb: 'Citas, fechas especiales, avisos y el próximo encuentro.', tabs: [['calendario', 'Mes'], ['fechas', 'Fechas'], ['recordatorios', 'Avisos']], also: ['encuentro'] },
  { id: 'galeria', title: 'Galería', icon: 'image', blurb: 'Todas sus fotos y videos, su año y el photobooth.', tabs: [['galeria', 'Todas'], ['album', 'Nuestro año'], ['photobooth', 'Photobooth']] },
  { id: 'preguntas', title: 'Conocernos', icon: 'message-circle-question', blurb: 'La pregunta del día, el quiz y sus lenguajes del amor.', tabs: [['preguntas', 'Preguntas'], ['lenguajes', 'Lenguajes del amor']] },
  { id: 'retos', title: 'Retos y hábitos', icon: 'flag', blurb: 'El reto de la semana, el desafío de 30 días y sus hábitos.', tabs: [['retos', 'Reto semanal'], ['reto30', '30 días'], ['habitos', 'Hábitos']] },
  { id: 'planes', title: 'Planes', icon: 'list-checks', blurb: 'Lo que quieren vivir, ideas de citas, sueños y noche de cine.', tabs: [['planes', 'Lista'], ['citas', 'Ideas de citas'], ['suenos', 'Sueños y viajes'], ['cine', 'Noche de cine']] },
  // Juegos reorganized (2026-11-22, option A): play, the monthly league and the modes; Rasca y gana
  // went to Insignias (prizes), 30 días to Retos and Noche de cine to Planes.
  { id: 'juegos', title: 'Juegos', icon: 'gamepad-2', blurb: 'Juegos en pareja, la liga del mes y los modos.', tabs: [['juegos', 'Jugar'], ['liga', 'Liga'], ['modos', 'Modos']], also: ['modo-cita'] },
  { id: 'insignias', title: 'Insignias y premios', icon: 'award', blurb: 'Lo que van logrando juntos y sus premios para raspar.', tabs: [['insignias', 'Insignias'], ['rasca', 'Premios']] },
  { id: 'alcancia', title: 'Dinero', icon: 'piggy-bank', blurb: 'Metas de ahorro y gastos compartidos.', tabs: [['alcancia', 'Alcancía'], ['gastos', 'Gastos']] },
  // Ajustes
  { id: 'ajustes/privacidad', title: 'Privacidad', icon: 'eye-off', tabs: [['ajustes/privacidad', 'Privacidad'], ['ajustes/permisos', 'Permisos'], ['ajustes/terceros', 'Sin terceros']] },
  { id: 'ajustes/copia', title: 'Tus datos', icon: 'hard-drive', tabs: [['ajustes/copia', 'Copia'], ['ajustes/sincronizar', 'Sincronización'], ['ajustes/papelera', 'Papelera']] },
  { id: 'ajustes/acerca', title: 'Acerca de', icon: 'info', tabs: [['ajustes/acerca', 'Acerca de'], ['ajustes/legal', 'Legal y ayuda']] },
];
/** The hub a route id belongs to (as a tab or as an extra page like Próximo encuentro). */
export const hubOf = (id) => HUBS.find((h) => h.tabs.some(([t]) => t === id) || h.also?.includes(id)) || null;
/** Listed on its own in Más / Ajustes: not a later tab or an extra page of a hub. */
export const listed = (id) => { const h = hubOf(id); return !h || h.id === id; };
/** The section as Más shows it: a hub's first tab carries the hub's name, icon and description. */
export const asListed = (s) => { const h = HUBS.find((x) => x.id === s.id); return h ? { ...s, title: h.title, icon: h.icon, blurb: h.blurb || s.blurb } : s; };

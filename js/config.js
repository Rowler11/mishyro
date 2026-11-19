// CONFIG de Aishiteru: SOLO valores iniciales genéricos y públicos.
// - Nada personal aquí: nombres completos, fechas, cartas, razones y recuerdos
//   viven en ../privado/seed-privado.json (fuera del repositorio) o se escriben en la app.
// - Al abrir, la app copia estos valores a su almacén (IndexedDB). Desde ahí todo
//   se edita en la app. Si cambias algo aquí, la app agrega lo nuevo por id y
//   actualiza solo lo que ustedes no hayan editado.
// - Los ids ("cfg:...") no se cambian nunca: así la app sabe qué es cada cosa.
// - Los bancos que se usan en fases posteriores se completan en su fase (van vacíos).

export const CONFIG = {
  // Versión visible de la app (Ajustes > Acerca de). Súbela junto con CACHE_VERSION en sw.js.
  appVersion: '0.1.22',
  // Prefijo de la base de datos y de las 2 preferencias en localStorage (tema y perfil activo).
  // Si lo cambias, también en theme-boot.js. Cambiarlo "empieza de cero" en cada dispositivo.
  storageKey: 'aishiteru',

  // Perfiles. Los ids "sofia" y "david" son internos y no se cambian; los nombres
  // visibles se cargan del seed privado o se escriben en el asistente.
  people: {
    sofia: { shortName: 'Sofía', role: 'partner' },
    david: { shortName: 'David', role: 'author' },
  },

  // Hitos de días juntos y su mensaje (se celebran en Inicio).
  milestones: [
    { id: 'cfg:milestone:100', days: 100, message: '¡100 días juntos! Cien veces elegirnos.' },
    { id: 'cfg:milestone:200', days: 200, message: '200 días. Ya tenemos historia para contar.' },
    { id: 'cfg:milestone:365', days: 365, message: '¡Un año juntos! Gracias por cada día de este viaje.' },
    { id: 'cfg:milestone:500', days: 500, message: '500 días. Y todavía me sorprendes.' },
    { id: 'cfg:milestone:730', days: 730, message: 'Dos años juntos. Lo mejor sigue siendo contigo.' },
    { id: 'cfg:milestone:1000', days: 1000, message: '¡Mil días! Mil razones para seguir.' },
  ],

  // Quién escribe la pregunta propia del día y cuántos caracteres puede tener.
  askerSettings: { asker: 'sofia', maxChars: 200 },

  // Efecto estacional automático (pétalos, luciérnagas, momiji, nieve).
  // La estética usa el calendario del hemisferio norte (como en Japón).
  seasonalEffects: true,
  seasonalHemisphere: 'norte',

  // Enlace opcional a una playlist colaborativa de Spotify ('' = oculto).
  sharedPlaylistUrl: '',

  // Escala del medidor de ánimo (5 niveles).
  moodScale: [
    { level: 1, emoji: '😢', name: 'Muy bajo', color: '#6E7FA8' },
    { level: 2, emoji: '😕', name: 'Bajo', color: '#8FA3B8' },
    { level: 3, emoji: '😐', name: 'Normal', color: '#B89B5E' },
    { level: 4, emoji: '🙂', name: 'Bien', color: '#7A8B6A' },
    { level: 5, emoji: '😄', name: 'Muy bien', color: '#C8412B' },
  ],

  // Calendario del ciclo: valores de partida que Sofía ajusta en la app.
  cycle: {
    owner: 'sofia',
    cycleLength: 28,
    periodLength: 5,
    symptoms: ['Cólicos', 'Dolor de cabeza', 'Hinchazón', 'Sensibilidad', 'Acné', 'Antojos', 'Fatiga', 'Náuseas', 'Dolor lumbar', 'Insomnio', 'Energía alta', 'Otro'],
    flowLevels: [
      { id: 'none', name: 'Ninguno' }, { id: 'spotting', name: 'Manchado' }, { id: 'light', name: 'Ligero' },
      { id: 'medium', name: 'Medio' }, { id: 'heavy', name: 'Abundante' },
    ],
    notice: 'Las predicciones son estimaciones y no son consejo médico ni anticonceptivo.',
  },

  // Privacidad: todo apagado de entrada; Sofía decide sobre el ciclo y la capa privada.
  // El PIN nunca va aquí: se crea dentro de la app.
  privacy: {
    pinEnabled: false,
    sectionPinMode: 'propio', // 'general' (PIN de la app) o 'propio' (uno para la sección)
    lockOnLeave: true,
    autoLockSeconds: 0, // 0 = apagado
    privacyOwner: 'sofia', // fijo
    visibleToPartnerByDefault: false,
    hidePrivateByDefault: false,
    cycleRecordsPrivateByDefault: false,
    intimateRecordsPrivateByDefault: true,
  },

  // Ajustes de las sugerencias de citas (docs/14).
  dateSettings: {
    budgets: { gratis: 0, bajo: 60000, medio: 250000 }, // "especial" = más de medio
    repeatRestDays: 60, // descanso antes de que vuelva una cita marcada "repetir: sí"
    weeklyRhythm: {
      instantDays: [1, 2, 3, 4], // lunes a jueves: ideas instantáneas (1 hora o menos)
      planWeekendDays: [4, 5], // jueves y viernes: tarjeta "Planeemos el finde"
      outingDays: [6, 0], // sábado y domingo: salidas
    },
    filterOptions: 3,
  },

  // Metas iniciales de la Alcancía (montos en COP; 0 = sin definir). Editables o borrables.
  currency: 'COP',
  savingsGoals: [
    { id: 'cfg:goal:japon', name: 'Viaje a Japón', targetCOP: 0, targetDate: '', icon: 'jp-torii', note: '', status: 'active', doneAt: '' },
    { id: 'cfg:goal:cena', name: 'Cena especial', targetCOP: 200000, targetDate: '', icon: 'chef-hat', note: 'Ejemplo: edítalo o bórralo.', status: 'active', doneAt: '' },
    { id: 'cfg:goal:escapada', name: 'Escapada de fin de semana', targetCOP: 800000, targetDate: '', icon: 'plane', note: 'Ejemplo: edítalo o bórralo.', status: 'active', doneAt: '' },
    { id: 'cfg:goal:concierto', name: 'Concierto', targetCOP: 400000, targetDate: '', icon: 'music', note: 'Ejemplo: edítalo o bórralo.', status: 'active', doneAt: '' },
  ],

  // Lugares soñados de Japón (lista opcional de la meta y del sueño "Viaje a Japón").
  japanDreamPlaces: ['Tokio', 'Kioto', 'Osaka', 'Nara', 'Hokkaidō'],

  // Primer sueño, enlazado a la meta de la Alcancía del mismo nombre.
  dreams: [
    {
      id: 'cfg:dream:japon', name: 'Viaje a Japón', kind: 'trip', placeName: 'Japón', priority: 1, note: '',
      places: ['Tokio', 'Kioto', 'Osaka', 'Nara', 'Hokkaidō'], savingsGoalId: 'cfg:goal:japon', status: 'open', doneAt: '',
      checklist: [
        { id: 'pasaporte', text: 'Sacar o renovar el pasaporte', done: false, order: 1 },
        { id: 'ahorrar', text: 'Ahorrar para el viaje', done: false, order: 2 },
        { id: 'vuelos', text: 'Reservar los vuelos', done: false, order: 3 },
        { id: 'frases', text: 'Aprender 20 frases en japonés', done: false, order: 4 },
        { id: 'itinerario', text: 'Armar el itinerario', done: false, order: 5 },
      ],
    },
  ],

  // Recordatorios suaves por defecto (sección 41). leadDays = días de anticipación.
  reminders: [
    { id: 'cfg:reminder:mesiversario', kind: 'monthiversary', rule: { freq: 'monthly', day: 2, time: '09:00' }, leadDays: [1], enabled: true, discreet: false },
    { id: 'cfg:reminder:aniversario', kind: 'anniversary', rule: { freq: 'yearly', month: 5, day: 2, time: '09:00' }, leadDays: [7, 1], enabled: true, discreet: false },
    { id: 'cfg:reminder:cumpleanos', kind: 'birthday', rule: { freq: 'yearly', time: '09:00' }, leadDays: [7], enabled: true, discreet: false },
    { id: 'cfg:reminder:mascotas', kind: 'pet', rule: { freq: 'yearly', time: '09:00' }, leadDays: [7], enabled: true, discreet: false },
    { id: 'cfg:reminder:cita-semanal', kind: 'weeklyDate', rule: { freq: 'weekly', weekday: 6, time: '15:00' }, leadDays: [0], enabled: false, discreet: false },
  ],
  // "Recordatorios discretos": textos neutros en avisos y .ics (apagado por defecto).
  discreetReminders: false,

  // Notas de voz.
  voiceNotes: {
    maxSeconds: 120,
    mimeTypes: ['audio/webm;codecs=opus', 'audio/mp4'],
    occasions: ['Buenos días', 'Buenas noches', 'Porque sí', 'Para un día difícil', 'Cumpleaños', 'Aniversario'],
  },

  // Categorías de la lista de regalos.
  giftCategories: [
    { id: 'cfg:gift:detalle', name: 'Detalle pequeño' },
    { id: 'cfg:gift:experiencia', name: 'Experiencia' },
    { id: 'cfg:gift:tecnologia', name: 'Tecnología' },
    { id: 'cfg:gift:ropa', name: 'Ropa' },
    { id: 'cfg:gift:libros', name: 'Libros' },
    { id: 'cfg:gift:otro', name: 'Otro' },
  ],

  // Insignias: condición medible (la evalúa la sección de Insignias en la Fase 4A).
  badges: [
    { id: 'cfg:badge:primera-pregunta', name: 'Primera pregunta', description: 'Respondieron su primera pregunta del día.', icon: 'message-circle-question', condition: { type: 'count', store: 'questionsDaily', min: 1 } },
    { id: 'cfg:badge:racha-7', name: 'Una semana seguida', description: '7 días de racha.', icon: 'flame', condition: { type: 'streak', streak: 'daily', min: 7 } },
    { id: 'cfg:badge:racha-30', name: 'Un mes seguido', description: '30 días de racha.', icon: 'flame', condition: { type: 'streak', streak: 'daily', min: 30 } },
    { id: 'cfg:badge:racha-100', name: 'Cien días seguidos', description: '100 días de racha.', icon: 'flame', condition: { type: 'streak', streak: 'daily', min: 100 } },
    { id: 'cfg:badge:primer-cupon', name: 'Primer cupón', description: 'Canjearon su primer cupón.', icon: 'ticket', condition: { type: 'count', store: 'couponState', min: 1 } },
    { id: 'cfg:badge:10-recuerdos', name: 'Diez recuerdos', description: 'Guardaron 10 recuerdos en la Cápsula.', icon: 'hourglass', condition: { type: 'count', store: 'memories', min: 10 } },
    { id: 'cfg:badge:primera-cancion', name: 'Primera canción', description: 'Enviaron su primera canción.', icon: 'music', condition: { type: 'count', store: 'songs', min: 1 } },
    { id: 'cfg:badge:primer-lugar', name: 'Primer lugar', description: 'Marcaron su primer lugar en el mapa.', icon: 'map', condition: { type: 'count', store: 'places', min: 1 } },
    { id: 'cfg:badge:primer-aporte', name: 'Primer aporte', description: 'Hicieron su primer aporte a la Alcancía.', icon: 'piggy-bank', condition: { type: 'count', store: 'savingsEntries', min: 1 } },
    { id: 'cfg:badge:primera-meta', name: 'Meta cumplida', description: 'Cumplieron su primera meta de ahorro.', icon: 'award', condition: { type: 'count', store: 'savingsGoals', where: { status: 'done' }, min: 1 } },
    { id: 'cfg:badge:primera-capsula', name: 'Cápsula abierta', description: 'Abrieron su primera cápsula del tiempo.', icon: 'lock-open', condition: { type: 'count', store: 'timeCapsules', where: { opened: true }, min: 1 } },
    { id: 'cfg:badge:100-dias', name: '100 días juntos', description: 'Cumplieron 100 días.', icon: 'heart', condition: { type: 'daysTogether', min: 100 } },
    { id: 'cfg:badge:365-dias', name: 'Un año juntos', description: 'Cumplieron 365 días.', icon: 'heart', condition: { type: 'daysTogether', min: 365 } },
  ],

  // Eventos de temporada. rule: fecha fija (month/day), "nth" (n-ésimo día de la semana del mes),
  // monthly (cada mes) o una fecha del perfil. La decoración, el mensaje y las
  // actividades se completan en la Fase 5.
  seasonalEvents: [
    { id: 'cfg:event:sanvalentin', name: 'San Valentín', rule: { type: 'fixed', month: 2, day: 14 }, decoration: 'hearts' },
    { id: 'cfg:event:hanami', name: 'Temporada de hanami', rule: { type: 'range', from: { month: 3, day: 20 }, to: { month: 4, day: 30 } }, decoration: 'sakura' },
    { id: 'cfg:event:aniversario', name: 'Nuestro aniversario', rule: { type: 'profile', field: 'startDate' }, decoration: 'hanabi' },
    { id: 'cfg:event:tanabata', name: 'Tanabata', rule: { type: 'fixed', month: 7, day: 7 }, decoration: 'lanterns' },
    { id: 'cfg:event:amoryamistad', name: 'Amor y Amistad', rule: { type: 'nth', month: 9, weekday: 6, n: 3 }, decoration: 'hearts' },
    { id: 'cfg:event:halloween', name: 'Halloween', rule: { type: 'fixed', month: 10, day: 31 }, decoration: 'lanterns' },
    { id: 'cfg:event:velitas', name: 'Noche de velitas', rule: { type: 'fixed', month: 12, day: 7 }, decoration: 'candles' },
    { id: 'cfg:event:novenas', name: 'Novenas', rule: { type: 'range', from: { month: 12, day: 16 }, to: { month: 12, day: 24 } }, decoration: 'lights' },
    { id: 'cfg:event:navidad', name: 'Navidad', rule: { type: 'fixed', month: 12, day: 25 }, decoration: 'lights' },
    { id: 'cfg:event:mesiversario', name: 'Mesiversario', rule: { type: 'monthly', day: 2 }, decoration: 'petals' },
    { id: 'cfg:event:cumpleanos', name: 'Cumpleaños', rule: { type: 'profile', field: 'birth' }, decoration: 'hanabi' },
  ],

  // Textos de "Legal y ayuda" (Ajustes). Valores iniciales editables en la app.
  // Se pueden editar desde la app y volver a este texto con "Restaurar". Párrafos separados
  // por una línea en blanco; "## " inicia un subtítulo y "- " un punto de lista.
  legalTexts: [
    { id: 'cfg:legal:privacidad', title: 'Política de privacidad', summary: 'Qué guarda la app, dónde (solo en este dispositivo), qué servicios externos opcionales existen, quién puede ver qué y cómo borrar todo.', body: "Esta app es solo para ustedes dos. No tiene cuentas, ni servidor, ni publicidad, ni analítica, ni cookies.\n\n## Qué guarda\n- Lo que ustedes escriben o eligen: nombres, apodos, fechas, recuerdos con sus fotos, cartas, cupones, frases y ajustes.\n- Datos técnicos mínimos para funcionar, como la versión de la app y un registro local de errores sin datos personales.\n\n## Dónde lo guarda\nTodo vive en el navegador de cada dispositivo (IndexedDB). Cada teléfono y el PC tienen su propia copia. Nada se envía a internet. La única forma de pasar los datos de un dispositivo a otro es la copia de seguridad, que ustedes descargan y mueven.\n\n## Quién ve qué\n- \"Los dos\": lo ve quien use la app en ese dispositivo.\n- \"Solo yo\": no se le muestra a la otra persona ni se cuenta. Con PIN personal, además, queda cifrado.\n- Sin PIN, la privacidad es de cortesía: quien tenga el teléfono desbloqueado podría llegar a los datos con herramientas del navegador.\n\n## Servicios externos\nHoy la app no hace solicitudes a terceros. Cuando lleguen el mapa, Spotify o los enlaces a Google Maps, serán opcionales y se apagan con \"Modo sin terceros\".\n\n## Cifrado\nCon PIN, lo privado se cifra en el dispositivo (AES-GCM, con una clave derivada del PIN). El PIN nunca se guarda. Si lo olvidan, lo cifrado no se puede recuperar.\n\n## Cómo borrar todo\nAjustes, Centro de seguridad, \"Borrar todo\". También se borra todo al eliminar los datos del sitio en Chrome. Las copias descargadas se borran a mano." },
    { id: 'cfg:legal:uso', title: 'Aviso de uso', summary: 'App privada de pareja para uso personal. El Rincón privado es solo para adultos que consienten. Las grabaciones no se comparten sin permiso.', body: "Aishiteru es una app privada de pareja, para el uso personal de dos personas. No es un servicio público ni comercial.\n\n## Uso esperado\n- Es para conectar en persona, no para controlar al otro. Nada en la app sirve para vigilar, rastrear ni revisar el teléfono de la otra persona.\n- Cada uno decide qué comparte. \"Solo yo\" se respeta.\n\n## Contenido\n- Lo que escriben, las fotos y las grabaciones son de quienes las crean. No se comparten fuera de la pareja sin el permiso de los dos.\n- El Rincón privado es solo para adultos que consienten, y cada uno puede decir que no en cualquier momento.\n\n## Responsabilidad\n- La app se entrega tal cual, como un regalo hecho a mano. Hagan copias de seguridad con frecuencia: si se borran los datos del navegador sin copia, se pierden.\n- Si algo falla, no se pierde lo guardado salvo que se borre el dispositivo." },
    { id: 'cfg:legal:salud', title: 'Avisos de salud', summary: 'El ciclo y sus predicciones son estimaciones, no consejo médico ni anticonceptivo. Los datos de salud de la mascota no reemplazan al veterinario.', body: "## Ciclo\nEl calendario del ciclo, sus predicciones y la ventana fértil son estimaciones hechas con los datos que se ingresan. No son consejo médico ni un método anticonceptivo. Ante cualquier duda de salud, consulten a un profesional.\n\n## Mascotas\nLas vacunas, citas y notas de salud de la mascota son un apoyo para recordar. No reemplazan la opinión del veterinario.\n\n## Ánimo\nEl medidor de ánimo es para acompañarse. Si alguno está pasando por un momento difícil, busquen apoyo de personas de confianza o de un profesional." },
    { id: 'cfg:legal:permisos', title: 'Permisos', summary: 'Para qué se usan la cámara, el micrófono, la ubicación, las notificaciones y el almacenamiento, y cómo quitarlos desde Chrome.', body: "La app pide cada permiso solo cuando se usa la función que lo necesita, explica antes para qué es y sigue funcionando si se niega.\n\n- Fotos y cámara: para agregar fotos a los recuerdos y cartas. Las fotos se achican y se quedan en el dispositivo.\n- Micrófono: para las notas de voz, solo después de tocar \"Grabar\".\n- Ubicación: para compartir dónde están en un momento puntual, con la precisión que elijan. No hay seguimiento continuo.\n- Notificaciones: para los recordatorios suaves.\n- Almacenamiento persistente: para que el navegador no borre los datos por su cuenta.\n\n## Cómo quitarlos en Chrome\nEn Android: mantener presionado el ícono de la app, \"Información\", \"Permisos\". En el PC: el candado junto a la dirección, \"Configuración del sitio\". Desde ahí también se puede borrar todo lo guardado." },
    { id: 'cfg:legal:licencias', title: 'Licencias y créditos', summary: 'Lucide (ISC), Leaflet (BSD-2), OpenStreetMap (atribución), fuentes Shippori Mincho, Zen Maru Gothic y Atkinson Hyperlegible (OFL), ONNX Runtime Web (MIT), el modelo U²-Net (Apache 2.0) y los términos de Spotify.', body: "La app usa piezas de terceros con licencias libres. Gracias a sus autores.\n\n- Íconos Lucide, licencia ISC.\n- Fuentes Shippori Mincho, Zen Maru Gothic y Atkinson Hyperlegible, licencia SIL Open Font License 1.1. Se sirven desde la propia app.\n- Mapas (cuando lleguen): Leaflet, licencia BSD-2, con datos de OpenStreetMap y su atribución obligatoria en el mapa.\n- Quitar el fondo de las estampillas: ONNX Runtime Web de Microsoft, licencia MIT, con el modelo U²-Net pequeño de Xuebin Qin y colaboradores, licencia Apache 2.0. Funciona dentro del teléfono; la foto no sale de él.\n- Spotify (cuando llegue): los reproductores embebidos siguen los términos de Spotify.\n\nLas ilustraciones japonesas, el logo de sakura y el resto del diseño son propios de esta app." },
    { id: 'cfg:legal:version', title: 'Versión y novedades', summary: 'Versión instalada, historial de cambios y cómo reportar un problema sin datos personales.', body: "Aquí está la versión instalada y cómo contar un problema sin compartir datos personales.\n\n## Reportar un problema\n\"Copiar reporte técnico\" copia la versión, el navegador, el tamaño de pantalla, cuántos elementos hay por sección (solo números) y los últimos errores técnicos. No incluye nombres, textos, fotos ni fechas de ustedes. Pueden pegarlo en un mensaje o en un correo." },
  ],
  legalFooter: 'Estos textos no constituyen asesoría legal. David debe revisarlos y adaptarlos.',

  // Bancos que se completan en la fase donde se usan (docs/11 §5).
  quiz: [], // Fase 3
  bucketList: [], // Fase 4A
  weeklyChallenges: [], // Fase 3
  firsts: [], // Fase 4A
  gratitudePrompts: [], // Fase 4A
  weeklyReviewQuestions: [], // Fase 4A
  scratchPrizes: [], // Fase 4B
  habitTemplates: [], // Fase 4B
  loveLanguageQuestions: [], // Fase 4A
  loveLanguageIdeas: [], // Fase 4A
  albumTemplates: [], // Fase 4A
  recipes: [], // Fase 4B
  dateMenuIdeas: [], // Fase 4B
  japaneseWords: [], // Fase 5
  games: {}, // Fase 5
  vault: {}, // Fase 6 (solo configuración; el contenido nunca va aquí)

  // Frases del botón "Pensando en ti" (docs/11 §1). {apodo} = apodo de quien recibe.
  thinkingOfYouPhrases: [
    {"id": "cfg:phrase:001", "text": "Estaba haciendo cualquier cosa y de repente pensé en ti."},
    {"id": "cfg:phrase:002", "text": "Este mensaje no tiene motivo. Solo te extraño."},
    {"id": "cfg:phrase:003", "text": "Te mando un abrazo que dura hasta que te vea."},
    {"id": "cfg:phrase:004", "text": "Hoy me acordé de tu risa y sonreí sol{o/a}."},
    {"id": "cfg:phrase:005", "text": "Pausa de dos segundos para decirte que te quiero."},
    {"id": "cfg:phrase:006", "text": "Ojalá estuvieras aquí ahora mismo."},
    {"id": "cfg:phrase:007", "text": "Nada nuevo que contar, solo que sigo enamorad{o/a} de ti."},
    {"id": "cfg:phrase:008", "text": "Te pienso más de lo que te escribo."},
    {"id": "cfg:phrase:009", "text": "Me debes un beso. Lo cobro pronto."},
    {"id": "cfg:phrase:010", "text": "Si pudiera, te teletransportaba a mi lado."},
    {"id": "cfg:phrase:011", "text": "Gracias por existir, así sin más."},
    {"id": "cfg:phrase:012", "text": "Aishiteru, {apodo}."},
  ],
  // Buenos días (docs/11 §2). "requires" = se salta si esa sección no tiene datos.
  goodMorning: [
    {"id": "cfg:goodMorning:001", "text": "Buenos días, {apodo}. Que hoy te salga todo bonito."},
    {"id": "cfg:goodMorning:002", "text": "Despierta despacio, el día puede esperar un minuto más por ti."},
    {"id": "cfg:goodMorning:003", "text": "Buenos días. Ya empecé el día pensando en ti."},
    {"id": "cfg:goodMorning:004", "text": "Un café, un abrazo imaginario y a comerse el día."},
    {"id": "cfg:goodMorning:005", "text": "Hoy es un buen día para sonreír. Empieza conmigo."},
    {"id": "cfg:goodMorning:006", "text": "Buenos días, {apodo}. Eres mi primer pensamiento."},
    {"id": "cfg:goodMorning:007", "text": "Que el día te trate con la misma ternura con la que yo te quiero."},
    {"id": "cfg:goodMorning:008", "text": "Arriba, que el mundo necesita tu sonrisa."},
    {"id": "cfg:goodMorning:009", "text": "Buenos días. Respira hondo, tú puedes con todo."},
    {"id": "cfg:goodMorning:010", "text": "Te mando energía para todo lo que tengas hoy."},
    {"id": "cfg:goodMorning:011", "text": "Otro día más para quererte. Qué suerte la mía."},
    {"id": "cfg:goodMorning:012", "text": "Buenos días, {apodo}. No olvides desayunar."},
    {"id": "cfg:goodMorning:013", "text": "Que hoy te pase algo que te haga reír."},
    {"id": "cfg:goodMorning:014", "text": "Ánimo con todo. Esta noche me cuentas."},
    {"id": "cfg:goodMorning:015", "text": "El sol salió, pero tú sigues brillando más."},
    {"id": "cfg:goodMorning:016", "text": "Buenos días. Hoy también te elijo."},
    {"id": "cfg:goodMorning:017", "text": "Lento o rápido, que tu día sea tuyo."},
    {"id": "cfg:goodMorning:018", "text": "Buenos días, {apodo}. {mascota} y yo te mandamos saludos.", "requires": "pets"},
    {"id": "cfg:goodMorning:019", "text": "Si hoy se pone difícil, recuerda que aquí estoy."},
    {"id": "cfg:goodMorning:020", "text": "Que tengas un día lleno de cosas pequeñas y buenas."},
    {"id": "cfg:goodMorning:021", "text": "Buenos días. Te quiero desde temprano."},
    {"id": "cfg:goodMorning:022", "text": "Hoy toca tratarte con cariño."},
    {"id": "cfg:goodMorning:023", "text": "A darlo todo, pero sin olvidar descansar."},
    {"id": "cfg:goodMorning:024", "text": "Buenos días, {apodo}. Ya quiero verte."},
    {"id": "cfg:goodMorning:025", "text": "Un día nuevo, las mismas ganas de ti."},
    {"id": "cfg:goodMorning:026", "text": "Que todo te salga como lo imaginas."},
    {"id": "cfg:goodMorning:027", "text": "Buenos días. Eres mi parte favorita de cada día."},
    {"id": "cfg:goodMorning:028", "text": "Toma agua, sonríe y acuérdate de que te quiero."},
    {"id": "cfg:goodMorning:029", "text": "Hoy es un buen día para un plan juntos. ¿Qué dices?"},
    {"id": "cfg:goodMorning:030", "text": "Buenos días, {apodo}. Aishiteru."},
  ],
  // Buenas noches (docs/11 §3).
  goodNight: [
    {"id": "cfg:goodNight:001", "text": "Buenas noches, {apodo}. Descansa bonito."},
    {"id": "cfg:goodNight:002", "text": "Hoy lo hiciste bien. Ahora a dormir."},
    {"id": "cfg:goodNight:003", "text": "Que sueñes con algo lindo. Ojalá conmigo."},
    {"id": "cfg:goodNight:004", "text": "Cierra los ojos, aquí te cuido desde lejos."},
    {"id": "cfg:goodNight:005", "text": "Buenas noches. Mañana será otro buen día."},
    {"id": "cfg:goodNight:006", "text": "Gracias por este día, aunque sea solo por existir en él."},
    {"id": "cfg:goodNight:007", "text": "Suelta todo lo de hoy. Ya no te pertenece."},
    {"id": "cfg:goodNight:008", "text": "Buenas noches, {apodo}. Te quiero hasta mañana y después."},
    {"id": "cfg:goodNight:009", "text": "Apaga la pantalla, que mañana te quiero con toda la energía."},
    {"id": "cfg:goodNight:010", "text": "Que la noche te abrace como yo quisiera hacerlo."},
    {"id": "cfg:goodNight:011", "text": "Buenas noches. Pienso en ti antes de dormir."},
    {"id": "cfg:goodNight:012", "text": "Descansa, que te lo mereces."},
    {"id": "cfg:goodNight:013", "text": "Hasta mañana, {apodo}. Ya quiero que sea mañana."},
    {"id": "cfg:goodNight:014", "text": "Un beso de buenas noches, enviado con cariño."},
    {"id": "cfg:goodNight:015", "text": "Si te cuesta dormir, respira lento y piensa en algo bonito."},
    {"id": "cfg:goodNight:016", "text": "Buenas noches. Hoy también te quise mucho."},
    {"id": "cfg:goodNight:017", "text": "Que descanses, que mañana hay más aventuras."},
    {"id": "cfg:goodNight:018", "text": "Dulces sueños, {apodo}."},
    {"id": "cfg:goodNight:019", "text": "La noche es tranquila. Que tú también lo estés."},
    {"id": "cfg:goodNight:020", "text": "Buenas noches. Gracias por estar en mi vida."},
    {"id": "cfg:goodNight:021", "text": "Te dejo un abrazo largo para que duermas mejor."},
    {"id": "cfg:goodNight:022", "text": "Lo que no salió hoy, sale mañana. A dormir."},
    {"id": "cfg:goodNight:023", "text": "Buenas noches, {apodo}. Eres mi último pensamiento."},
    {"id": "cfg:goodNight:024", "text": "Que tus sueños sean tan bonitos como tú."},
    {"id": "cfg:goodNight:025", "text": "Duerme rico. Mañana te vuelvo a escribir."},
    {"id": "cfg:goodNight:026", "text": "Buenas noches. Te quiero más que ayer."},
    {"id": "cfg:goodNight:027", "text": "Desconecta, respira y descansa."},
    {"id": "cfg:goodNight:028", "text": "Que la luna te cuide hasta que yo pueda hacerlo."},
    {"id": "cfg:goodNight:029", "text": "Buenas noches, {apodo}. Nos vemos en los sueños."},
    {"id": "cfg:goodNight:030", "text": "Aishiteru. Que descanses."},
  ],
  // Banco de preguntas para conocerse (docs/11 §4): 91 preguntas en 7 categorías.
  questionBank: [
    {"id": "cfg:question:001", "category": "recuerdos", "text": "¿Cuál es tu recuerdo favorito de cuando eras niña o niño?"},
    {"id": "cfg:question:002", "category": "recuerdos", "text": "¿Qué juguete o juego no soltabas de pequeño?"},
    {"id": "cfg:question:003", "category": "recuerdos", "text": "¿Cuál fue el mejor cumpleaños que has tenido y por qué?"},
    {"id": "cfg:question:004", "category": "recuerdos", "text": "¿Qué recuerdo de nosotros te viene primero a la mente?"},
    {"id": "cfg:question:005", "category": "recuerdos", "text": "¿Qué pensaste la primera vez que me viste?"},
    {"id": "cfg:question:006", "category": "recuerdos", "text": "¿Qué profesor o persona marcó tu forma de ser?"},
    {"id": "cfg:question:007", "category": "recuerdos", "text": "¿Cuál es el olor que más te transporta a tu infancia?"},
    {"id": "cfg:question:008", "category": "recuerdos", "text": "¿Qué es lo más loco que has hecho por diversión?"},
    {"id": "cfg:question:009", "category": "recuerdos", "text": "¿Qué canción te recuerda una época de tu vida?"},
    {"id": "cfg:question:010", "category": "recuerdos", "text": "¿Cuál fue el día en que te sentiste más orgulloso de ti?"},
    {"id": "cfg:question:011", "category": "recuerdos", "text": "¿Qué tradición familiar te gustaría conservar?"},
    {"id": "cfg:question:012", "category": "recuerdos", "text": "¿Qué momento de este año te gustaría volver a vivir?"},
    {"id": "cfg:question:013", "category": "recuerdos", "text": "¿Cuál es la anécdota que más te gusta contar?"},
    {"id": "cfg:question:014", "category": "suenos", "text": "Si el dinero no importara, ¿a qué te dedicarías?"},
    {"id": "cfg:question:015", "category": "suenos", "text": "¿Qué te gustaría aprender este año?"},
    {"id": "cfg:question:016", "category": "suenos", "text": "¿Cuál es un sueño que nunca le has contado a nadie?"},
    {"id": "cfg:question:017", "category": "suenos", "text": "¿Qué lugar del mundo sueñas conocer y qué harías allí?"},
    {"id": "cfg:question:018", "category": "suenos", "text": "¿Cómo sería tu día perfecto de principio a fin?"},
    {"id": "cfg:question:019", "category": "suenos", "text": "¿Qué meta pequeña te haría muy feliz cumplir pronto?"},
    {"id": "cfg:question:020", "category": "suenos", "text": "Si pudieras tener un talento de inmediato, ¿cuál sería?"},
    {"id": "cfg:question:021", "category": "suenos", "text": "¿Qué te gustaría que la gente recordara de ti?"},
    {"id": "cfg:question:022", "category": "suenos", "text": "¿Qué proyecto te gustaría que hiciéramos juntos?"},
    {"id": "cfg:question:023", "category": "suenos", "text": "¿Qué harías con un año sabático?"},
    {"id": "cfg:question:024", "category": "suenos", "text": "¿Qué te gustaría crear algún día?"},
    {"id": "cfg:question:025", "category": "suenos", "text": "¿Cuál sería la casa de tus sueños?"},
    {"id": "cfg:question:026", "category": "suenos", "text": "¿Qué experiencia quieres vivir antes de los 30?"},
    {"id": "cfg:question:027", "category": "gustos", "text": "¿Cuál es tu comida favorita de todos los tiempos?"},
    {"id": "cfg:question:028", "category": "gustos", "text": "¿Qué película podrías ver mil veces?"},
    {"id": "cfg:question:029", "category": "gustos", "text": "¿Playa, montaña o ciudad?"},
    {"id": "cfg:question:030", "category": "gustos", "text": "¿Qué plan te encanta para un domingo?"},
    {"id": "cfg:question:031", "category": "gustos", "text": "¿Cuál es tu dulce o antojo favorito?"},
    {"id": "cfg:question:032", "category": "gustos", "text": "¿Qué tipo de música te pone de buen humor?"},
    {"id": "cfg:question:033", "category": "gustos", "text": "¿Prefieres amanecer temprano o trasnochar?"},
    {"id": "cfg:question:034", "category": "gustos", "text": "¿Qué serie te ha enganchado más?"},
    {"id": "cfg:question:035", "category": "gustos", "text": "¿Cuál es tu estación del año o clima favorito?"},
    {"id": "cfg:question:036", "category": "gustos", "text": "¿Qué detalle pequeño te alegra el día?"},
    {"id": "cfg:question:037", "category": "gustos", "text": "¿Qué olor te encanta?"},
    {"id": "cfg:question:038", "category": "gustos", "text": "¿Qué te gusta que hagamos juntos que no hagas con nadie más?"},
    {"id": "cfg:question:039", "category": "gustos", "text": "¿Cuál es tu forma favorita de recibir cariño?"},
    {"id": "cfg:question:040", "category": "miedos", "text": "¿Qué te pone nervioso aunque parezca una tontería?"},
    {"id": "cfg:question:041", "category": "miedos", "text": "¿Qué te ayuda cuando estás triste?"},
    {"id": "cfg:question:042", "category": "miedos", "text": "¿Cómo sabes que estás estresada o estresado?"},
    {"id": "cfg:question:043", "category": "miedos", "text": "¿Qué te da paz?"},
    {"id": "cfg:question:044", "category": "miedos", "text": "¿Hay algo que te cueste pedir?"},
    {"id": "cfg:question:045", "category": "miedos", "text": "¿Qué te gustaría que hiciera cuando estás de mal humor?"},
    {"id": "cfg:question:046", "category": "miedos", "text": "¿Qué miedo has superado y cómo?"},
    {"id": "cfg:question:047", "category": "miedos", "text": "¿Qué te hace sentir querido o querida de verdad?"},
    {"id": "cfg:question:048", "category": "miedos", "text": "¿Qué cosa te cuesta perdonarte?"},
    {"id": "cfg:question:049", "category": "miedos", "text": "¿En qué momento te sientes más tú?"},
    {"id": "cfg:question:050", "category": "miedos", "text": "¿Qué te gustaría que entendiera mejor de ti?"},
    {"id": "cfg:question:051", "category": "miedos", "text": "¿Qué te emociona hasta las lágrimas?"},
    {"id": "cfg:question:052", "category": "miedos", "text": "¿Qué te gustaría soltar este año?"},
    {"id": "cfg:question:053", "category": "japon", "text": "Si fuéramos a Japón, ¿qué es lo primero que harías?"},
    {"id": "cfg:question:054", "category": "japon", "text": "¿Qué comida japonesa te gustaría probar allá?"},
    {"id": "cfg:question:055", "category": "japon", "text": "¿Kioto tradicional o Tokio de neón?"},
    {"id": "cfg:question:056", "category": "japon", "text": "¿Te animarías a dormir en un ryokan con baño termal?"},
    {"id": "cfg:question:057", "category": "japon", "text": "¿Qué te gustaría ver: los cerezos en flor o las hojas rojas del otoño?"},
    {"id": "cfg:question:058", "category": "japon", "text": "¿Qué anime, película o serie japonesa te gusta más?"},
    {"id": "cfg:question:059", "category": "japon", "text": "¿Qué recuerdo te gustaría traer de un viaje?"},
    {"id": "cfg:question:060", "category": "japon", "text": "¿Cuál ha sido tu mejor viaje hasta ahora?"},
    {"id": "cfg:question:061", "category": "japon", "text": "¿Prefieres viajes planeados al detalle o improvisados?"},
    {"id": "cfg:question:062", "category": "japon", "text": "¿Qué lugar de Colombia quieres que conozcamos juntos?"},
    {"id": "cfg:question:063", "category": "japon", "text": "¿Qué palabra en japonés te gustaría aprender primero?"},
    {"id": "cfg:question:064", "category": "japon", "text": "¿A qué país irías después de Japón?"},
    {"id": "cfg:question:065", "category": "japon", "text": "¿Qué sería imprescindible en tu maleta?"},
    {"id": "cfg:question:066", "category": "vida", "text": "¿Cuál es tu rutina favorita del día?"},
    {"id": "cfg:question:067", "category": "vida", "text": "¿Qué tarea de la casa odias y cuál no te molesta?"},
    {"id": "cfg:question:068", "category": "vida", "text": "¿Qué haces para desconectarte?"},
    {"id": "cfg:question:069", "category": "vida", "text": "¿Cómo te gusta celebrar las cosas pequeñas?"},
    {"id": "cfg:question:070", "category": "vida", "text": "¿Qué comida te sale mejor?"},
    {"id": "cfg:question:071", "category": "vida", "text": "¿Qué hábito quieres empezar?"},
    {"id": "cfg:question:072", "category": "vida", "text": "¿Qué es lo más gracioso que ha hecho {mascota}?", "requires": "pets"},
    {"id": "cfg:question:073", "category": "vida", "text": "¿Qué momento del día prefieres para hablar en serio?"},
    {"id": "cfg:question:074", "category": "vida", "text": "¿Qué te gustaría que cocináramos juntos?"},
    {"id": "cfg:question:075", "category": "vida", "text": "¿Cómo sería nuestra noche de cita ideal en casa?"},
    {"id": "cfg:question:076", "category": "vida", "text": "¿Qué cosa pequeña puedo hacer para facilitarte el día?"},
    {"id": "cfg:question:077", "category": "vida", "text": "¿Qué te hace reír sin falta?"},
    {"id": "cfg:question:078", "category": "vida", "text": "¿Qué te gustaría cambiar de tu semana?"},
    {"id": "cfg:question:079", "category": "futuro", "text": "¿Dónde te ves en cinco años?"},
    {"id": "cfg:question:080", "category": "futuro", "text": "¿Qué tradición te gustaría que tuviéramos como pareja?"},
    {"id": "cfg:question:081", "category": "futuro", "text": "¿Cómo te imaginas nuestra celebración del próximo aniversario?"},
    {"id": "cfg:question:082", "category": "futuro", "text": "¿Qué te gustaría aprender juntos?"},
    {"id": "cfg:question:083", "category": "futuro", "text": "¿Qué tipo de hogar quieres construir?"},
    {"id": "cfg:question:084", "category": "futuro", "text": "¿Qué es lo más importante para ti en una relación a largo plazo?"},
    {"id": "cfg:question:085", "category": "futuro", "text": "¿Qué meta de ahorro te gustaría que cumpliéramos primero?", "requires": "savings"},
    {"id": "cfg:question:086", "category": "futuro", "text": "¿Qué te gustaría que nunca cambiara entre nosotros?"},
    {"id": "cfg:question:087", "category": "futuro", "text": "¿Qué te gustaría mejorar como pareja?"},
    {"id": "cfg:question:088", "category": "futuro", "text": "¿Qué aventura quieres que vivamos este año?"},
    {"id": "cfg:question:089", "category": "futuro", "text": "¿Cómo te gustaría que fuera un día normal nuestro dentro de diez años?"},
    {"id": "cfg:question:090", "category": "futuro", "text": "¿Qué promesa pequeña te gustaría que nos hiciéramos?"},
    {"id": "cfg:question:091", "category": "futuro", "text": "¿Qué te emociona más del futuro?"},
  ],
  // Banco de ideas de citas (docs/14), copiado tal cual: 81 ideas.
  // place: casa | afuera | bogota | cerca | colombia · mood: tranquilos | risas | aventura | romantico
  // budget: gratis | bajo | medio | especial (lista: "gratis o bajo") · duration: 1h | tarde | dia | finde
  // climate: cualquiera | sol | lluvia | interior · day: domingo si aplica · verify: verificar horario y precio
  dateIdeas: [
    {"id": "cfg:date:001", "title": "Noche de izakaya en casa", "description": "Cocinen juntos algo de inspiración japonesa (ramen casero, onigiri o yakitori al sartén) y coman en el piso con cojines.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": true, "verify": false},
    {"id": "cfg:date:002", "title": "Maratón de película elegida a ciegas", "description": "Cada uno escribe 3 películas en papelitos y se saca una.", "place": "casa", "zone": "", "mood": "tranquilos", "budget": ["gratis"], "duration": "tarde", "climate": "lluvia", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:003", "title": "Picnic en la sala", "description": "Manta en el piso, frutas, sánduches y una playlist de la sección Canciones.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["bajo"], "duration": "1h", "climate": "lluvia", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:004", "title": "Noche de juegos de mesa o cartas", "description": "Usen la Liga de pareja para el marcador.", "place": "casa", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:005", "title": "Cata a ciegas", "description": "Chocolates, frutas o jugos, con los ojos vendados, adivinando cuál es cuál.", "place": "casa", "zone": "", "mood": "risas", "budget": ["bajo"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:006", "title": "Spa en casa", "description": "Mascarillas, música suave y el masaje del cupón.", "place": "casa", "zone": "", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:007", "title": "Clase de origami juntos", "description": "Aprendan a hacer grullas para el juego de las mil grullas.", "place": "casa", "zone": "", "mood": "tranquilos", "budget": ["gratis"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": true, "verify": false},
    {"id": "cfg:date:008", "title": "Playlist de nuestras vidas", "description": "Cada uno pone 5 canciones que marcaron su vida y cuenta la historia de cada una; las favoritas van a la sección Canciones.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["gratis"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:009", "title": "Cocinar la receta que nunca han hecho", "description": "Elijan una de la sección Recetas que esté sin hacer.", "place": "casa", "zone": "", "mood": "aventura", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:010", "title": "Cartas a futuro", "description": "Escriban una cápsula del tiempo para abrir en el próximo aniversario.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["gratis"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:011", "title": "Armar un rompecabezas de 500 piezas", "description": "Con té y música tranquila.", "place": "casa", "zone": "", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "lluvia", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:012", "title": "Noche de fotos viejas", "description": "Revisen el Álbum y cuenten la historia detrás de cada foto.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["gratis"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:013", "title": "Desayuno especial de domingo", "description": "Pancakes, arepas o lo que más les guste, con mesa puesta.", "place": "casa", "zone": "", "mood": "romantico", "budget": ["bajo"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:014", "title": "Tarde de dibujo", "description": "Cada uno dibuja al otro en 10 minutos y comparan.", "place": "casa", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:015", "title": "Noche de anime o película japonesa", "description": "Con snacks japoneses o hechos en casa.", "place": "casa", "zone": "", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "lluvia", "day": "", "japan": true, "verify": false},
    {"id": "cfg:date:016", "title": "Jugar con {mascota} y hacerle un juguete casero", "description": "Con cartón y cuerda.", "place": "casa", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false, "requires": "pets"},
    {"id": "cfg:date:017", "title": "Noche de videojuegos en cooperativo", "description": "Un juego para jugar los dos en el mismo sofá, con snacks y el marcador de la Liga de pareja.", "place": "casa", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "tarde", "climate": "lluvia", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:018", "title": "Torneo de videojuegos con apuesta", "description": "3 partidas de un juego competitivo; quien pierda canjea un cupón al ganador.", "place": "casa", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:019", "title": "Atardecer en Monserrate", "description": "Subir caminando (gratis) o en teleférico o funicular (con costo) y ver el atardecer.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["gratis", "bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:020", "title": "Caminar La Candelaria", "description": "Arte urbano, arquitectura colonial y un café.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:021", "title": "Chorro de Quevedo", "description": "Bebida típica, cuenteros o música en vivo.", "place": "bogota", "zone": "Bogotá", "mood": "risas", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:022", "title": "Teatro Colón", "description": "Una función o la visita guiada.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:023", "title": "Mirador de la Torre Colpatria", "description": "Bogotá iluminada con vista de 360°.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["bajo"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:024", "title": "Luces de Bogotá desde La Calera", "description": "Mirador nocturno y algo de comer en la vía.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["medio"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:025", "title": "Parque de los Novios", "description": "Picnic, paseo en bote y el laberinto.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:026", "title": "Jardín Botánico de Bogotá", "description": "Orquídeas, flora nativa y picnic.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:027", "title": "Parque Simón Bolívar", "description": "Caminar, montar en bicicleta o remar en el lago.", "place": "bogota", "zone": "Bogotá", "mood": "aventura", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:028", "title": "Usaquén un domingo", "description": "Plaza, calles coloniales y mercado de pulgas.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "domingo", "japan": false, "verify": true},
    {"id": "cfg:date:029", "title": "Ciclovía del domingo", "description": "Recorrer en bici o a pie las vías cerradas para peatones y ciclistas.", "place": "bogota", "zone": "Bogotá", "mood": "aventura", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "domingo", "japan": false, "verify": false},
    {"id": "cfg:date:030", "title": "Museo del Oro", "description": "Recorrido juntos y elegir cada uno su pieza favorita.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:031", "title": "Museo Botero", "description": "Arte en el centro, con entrada gratuita.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["gratis"], "duration": "1h", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:032", "title": "Planetario de Bogotá", "description": "Una función del domo.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["bajo"], "duration": "1h", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:033", "title": "Mercado de Paloquemao", "description": "Frutas raras para probar y luego cocinar en casa.", "place": "bogota", "zone": "Bogotá", "mood": "aventura", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:034", "title": "Biblioteca Virgilio Barco", "description": "Arquitectura, lectura en pareja y caminata por el parque.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["gratis"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:035", "title": "Cinemateca de Bogotá", "description": "Una película de autor o un ciclo especial.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:036", "title": "Noche de ramen en Bogotá", "description": "Probar un restaurante de ramen nuevo para los dos.", "place": "bogota", "zone": "Bogotá", "mood": "romantico", "budget": ["medio"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": true, "verify": true},
    {"id": "cfg:date:037", "title": "Maloka", "description": "Ciencia interactiva y cine domo.", "place": "bogota", "zone": "Bogotá", "mood": "risas", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:038", "title": "Parque de la 93 y café", "description": "Caminar y elegir un postre para compartir.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["medio"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:039", "title": "Festival gratuito al parque", "description": "Rock al Parque u otro de los festivales gratuitos de la ciudad, cuando estén en temporada.", "place": "bogota", "zone": "Bogotá", "mood": "aventura", "budget": ["gratis"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:040", "title": "Feria de anime y cultura pop", "description": "Por ejemplo SOFA, en Corferias, cuando esté en temporada.", "place": "bogota", "zone": "Bogotá", "mood": "risas", "budget": ["medio"], "duration": "dia", "climate": "interior", "day": "", "japan": true, "verify": true},
    {"id": "cfg:date:041", "title": "Caminata ecológica en los cerros orientales", "description": "Un sendero habilitado, como la Quebrada La Vieja (requiere inscripción previa).", "place": "bogota", "zone": "Bogotá", "mood": "aventura", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:042", "title": "Bolos o patinaje", "description": "Una noche competitiva con apuesta de un cupón.", "place": "bogota", "zone": "Bogotá", "mood": "risas", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:043", "title": "Clase de baile de salsa", "description": "Una clase de prueba para principiantes.", "place": "bogota", "zone": "Bogotá", "mood": "risas", "budget": ["bajo"], "duration": "1h", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:044", "title": "Tour de cafés de especialidad", "description": "Probar el mismo tipo de café en dos lugares y calificarlos.", "place": "bogota", "zone": "Bogotá", "mood": "tranquilos", "budget": ["medio"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:045", "title": "Catedral de Sal de Zipaquirá", "description": "Recorrido y almuerzo en el pueblo.", "place": "cerca", "zone": "Zipaquirá", "mood": "aventura", "budget": ["medio"], "duration": "dia", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:046", "title": "Laguna de Guatavita y el pueblo", "description": "Caminata a la laguna y paseo por Guatavita.", "place": "cerca", "zone": "Guatavita", "mood": "aventura", "budget": ["medio"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:047", "title": "Cabalgata o velero en el embalse de Tominé", "description": "", "place": "cerca", "zone": "Guatavita", "mood": "romantico", "budget": ["especial"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:048", "title": "Escalada para principiantes en Suesca", "description": "Con guía certificado.", "place": "cerca", "zone": "Suesca", "mood": "aventura", "budget": ["medio"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:049", "title": "Chía o Cajicá", "description": "Almuerzo típico y caminata.", "place": "cerca", "zone": "Chía o Cajicá", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:050", "title": "Termales cerca de Bogotá", "description": "Por ejemplo en Choachí, con cabaña opcional.", "place": "cerca", "zone": "Choachí", "mood": "tranquilos", "budget": ["especial"], "duration": "dia", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:051", "title": "Clima cálido en La Mesa o La Vega", "description": "Piscina, cascada o río.", "place": "cerca", "zone": "La Mesa o La Vega", "mood": "aventura", "budget": ["medio"], "duration": "finde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:052", "title": "Embalse del Neusa", "description": "Picnic con vista al agua.", "place": "cerca", "zone": "Tausa", "mood": "tranquilos", "budget": ["bajo"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:053", "title": "Cuatrimoto o picnic nocturno en Guasca", "description": "", "place": "cerca", "zone": "Guasca", "mood": "aventura", "budget": ["especial"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:054", "title": "Laguna de Fúquene y Piedra Colgada", "description": "Foto icónica y almuerzo.", "place": "cerca", "zone": "Fúquene", "mood": "aventura", "budget": ["medio"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:055", "title": "Villa de Leyva", "description": "Plaza mayor, pueblo colonial y parque de alturas opcional.", "place": "cerca", "zone": "Villa de Leyva", "mood": "romantico", "budget": ["especial"], "duration": "finde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:056", "title": "Pozos naturales en Vergara", "description": "", "place": "cerca", "zone": "Vergara", "mood": "tranquilos", "budget": ["medio"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:057", "title": "Eje Cafetero y Valle de Cocora (Salento)", "description": "Palmas de cera y finca cafetera.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:058", "title": "Cartagena", "description": "Ciudad amurallada al atardecer.", "place": "colombia", "zone": "", "mood": "romantico", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:059", "title": "Santa Marta y Parque Tayrona", "description": "Playa y selva.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:060", "title": "Medellín", "description": "Metrocable, Comuna 13 y Parque Arví.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:061", "title": "San Gil y Barichara", "description": "Aventura y el pueblo más bonito de Santander.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:062", "title": "Guatapé y la Piedra del Peñol", "description": "Subir los escalones y ver el embalse.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:063", "title": "Desierto de la Tatacoa", "description": "Noche de estrellas.", "place": "colombia", "zone": "", "mood": "romantico", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:064", "title": "Caño Cristales", "description": "El río de colores, solo en temporada.", "place": "colombia", "zone": "", "mood": "aventura", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:065", "title": "San Andrés", "description": "El mar de siete colores.", "place": "colombia", "zone": "", "mood": "romantico", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:066", "title": "Termales de Santa Rosa de Cabal", "description": "", "place": "colombia", "zone": "", "mood": "tranquilos", "budget": ["especial"], "duration": "finde", "climate": "cualquiera", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:067", "title": "Picnic en el parque más cercano", "description": "Manta, comida casera y un juego de cartas.", "place": "afuera", "zone": "", "mood": "romantico", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:068", "title": "Ruta de comida callejera", "description": "Probar 3 cosas que nunca hayan comido y calificarlas.", "place": "afuera", "zone": "", "mood": "aventura", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:069", "title": "Caminata sin destino", "description": "Tomar calles que no conozcan y elegir el rumbo con una moneda.", "place": "afuera", "zone": "", "mood": "aventura", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:070", "title": "Sala de arcade o videojuegos", "description": "Fichas, retos entre los dos y un premio para quien gane más.", "place": "afuera", "zone": "", "mood": "risas", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:071", "title": "Cine y helado", "description": "La película la elige quien gane piedra, papel o tijera.", "place": "afuera", "zone": "", "mood": "tranquilos", "budget": ["medio"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:072", "title": "Mercado o plaza local", "description": "Comprar ingredientes para cocinar juntos esa noche.", "place": "afuera", "zone": "", "mood": "tranquilos", "budget": ["bajo"], "duration": "tarde", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:073", "title": "Museo o exposición gratuita", "description": "Cada uno elige su obra favorita y explica por qué.", "place": "afuera", "zone": "", "mood": "tranquilos", "budget": ["gratis"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:074", "title": "Mirador al atardecer", "description": "El punto alto más cercano, con algo caliente para tomar.", "place": "afuera", "zone": "", "mood": "romantico", "budget": ["gratis"], "duration": "1h", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:075", "title": "Sesión de fotos juntos", "description": "20 fotos en 20 lugares distintos para el Álbum.", "place": "afuera", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:076", "title": "Café nuevo", "description": "Elegir un café donde nunca hayan ido y quedarse a conversar con las preguntas del día.", "place": "afuera", "zone": "", "mood": "tranquilos", "budget": ["bajo"], "duration": "1h", "climate": "cualquiera", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:077", "title": "Paseo en bicicleta", "description": "Alquilada o propia, con parada para comer.", "place": "afuera", "zone": "", "mood": "aventura", "budget": ["bajo"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:078", "title": "Librería o feria del libro", "description": "Cada uno le elige un libro al otro sin mostrárselo.", "place": "afuera", "zone": "", "mood": "romantico", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": false},
    {"id": "cfg:date:079", "title": "Clase de prueba de algo nuevo", "description": "Cerámica, baile, cocina o escalada.", "place": "afuera", "zone": "", "mood": "aventura", "budget": ["medio"], "duration": "tarde", "climate": "interior", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:080", "title": "Evento gratuito de la ciudad", "description": "Concierto, feria o festival al aire libre de la semana.", "place": "afuera", "zone": "", "mood": "risas", "budget": ["gratis"], "duration": "tarde", "climate": "sol", "day": "", "japan": false, "verify": true},
    {"id": "cfg:date:081", "title": "Día de turistas en su propia ciudad", "description": "Visitar como si fuera la primera vez el lugar más famoso que tengan cerca.", "place": "afuera", "zone": "", "mood": "aventura", "budget": ["bajo"], "duration": "dia", "climate": "sol", "day": "", "japan": false, "verify": false},
  ],
};

export default CONFIG;

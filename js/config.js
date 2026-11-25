// CONFIG de Aishiteru: SOLO valores iniciales genéricos y públicos.
// - Nada personal aquí: nombres completos, fechas, cartas, razones y recuerdos
//   viven en ../privado/seed-privado.json (fuera del repositorio) o se escriben en la app.
// - Al abrir, la app copia estos valores a su almacén (IndexedDB). Desde ahí todo
//   se edita en la app. Si cambias algo aquí, la app agrega lo nuevo por id y
//   actualiza solo lo que ustedes no hayan editado.
// - Los ids ("cfg:...") no se cambian nunca: así la app sabe qué es cada cosa.
// - Los bancos que se usan en fases posteriores se completan en su fase (van vacíos).

import { GAMES } from './config-juegos.js';
import { JAPANESE_WORDS } from './config-japones.js';

export const CONFIG = {
  // Versión visible de la app (Ajustes > Acerca de). Súbela junto con CACHE_VERSION en sw.js.
  appVersion: '0.27.0',
  // Prefijo de la base de datos y de las 2 preferencias en localStorage (tema y perfil activo).
  // Si lo cambias, también en theme-boot.js. Cambiarlo "empieza de cero" en cada dispositivo.
  storageKey: 'aishiteru',

  // Día fijo de la pareja: se marca solo en el Calendario cada semana (0 = domingo … 6 = sábado).
  coupleDay: { weekday: 6, name: 'Día de novios' },

  // Perfiles. Los ids "sofia" y "david" son internos y no se cambian: "david" es quien prepara la app
  // ("Tú" en el asistente) y "sofia" es para quien es ("Tu pareja"). Los nombres visibles y el rol
  // (novia, esposo, mi señora…) los escribe cada pareja en el asistente o vienen del seed privado.
  people: {
    sofia: { shortName: '', role: 'partner' },
    david: { shortName: '', role: 'author' },
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

  // Frase del día en la pantalla del PIN de la app (una distinta cada día). Sin nombres ni nada
  // personal: esa pantalla la ve cualquiera que tome el teléfono.
  lockPhrases: [
    'Qué bueno que volviste.',
    'Hoy también es un buen día para quererse.',
    'Un ratito juntos vale mucho.',
    'Respira. Aquí todo es suave.',
    'Lo bonito se cuida todos los días.',
    'Pasa, que aquí te esperaban.',
    'Un abrazo antes de seguir.',
    'Lo mejor del día cabe en un recuerdo.',
    'Despacio, que no hay prisa.',
    'Hoy puede ser un día para contar.',
    'Aquí se guarda lo que importa.',
    'Una sonrisa también cuenta como plan.',
    'Aquí también es casa.',
    'El corazón ya sabe la clave.',
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
    { id: 'cfg:badge:primera-pregunta', name: 'Primera pregunta', description: 'Respondieron su primera pregunta del día.', icon: 'message-circle-question', condition: { type: 'count', store: 'questionsDaily', where: { kind: 'answer' }, min: 1 } },
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
    { id: 'cfg:badge:primera-gratitud', name: 'Primera gracia', description: 'Echaron la primera nota al frasco de gratitud.', icon: 'hand-heart', condition: { type: 'count', store: 'gratitude', min: 1 } },
    { id: 'cfg:badge:frasco-30', name: 'Frasco lleno', description: '30 notas en el frasco de gratitud.', icon: 'hand-heart', condition: { type: 'count', store: 'gratitude', min: 30 } },
    { id: 'cfg:badge:5-primeras', name: 'Cinco primeras veces', description: 'Completaron 5 páginas de Primeras veces.', icon: 'star', condition: { type: 'count', store: 'firsts', min: 5 } },
    { id: 'cfg:badge:primera-purikura', name: 'Primera tira', description: 'Hicieron su primera tira en el Photobooth.', icon: 'camera', condition: { type: 'count', store: 'content', where: { kind: 'purikura' }, min: 1 } },
    { id: 'cfg:badge:10-lugares', name: 'Exploradores', description: 'Marcaron 10 lugares en el mapa.', icon: 'map', condition: { type: 'count', store: 'places', min: 10 } },
    { id: 'cfg:badge:primer-plan', name: 'Plan cumplido', description: 'Cumplieron su primer plan juntos.', icon: 'flag', condition: { type: 'count', store: 'bucketList', where: { done: true }, min: 1 } },
    { id: 'cfg:badge:primer-sueno', name: 'Sueño cumplido', description: 'Cumplieron su primer sueño.', icon: 'plane', condition: { type: 'count', store: 'dreams', where: { status: 'done' }, min: 1 } },
    { id: 'cfg:badge:primera-voz', name: 'Primera nota de voz', description: 'Grabaron su primera nota de voz para el otro.', icon: 'mic', condition: { type: 'count', store: 'voiceNotes', min: 1 } },
    { id: 'cfg:badge:revision-4', name: 'Un mes de revisiones', description: 'Hicieron 4 revisiones semanales.', icon: 'notebook-pen', condition: { type: 'count', store: 'weeklyReviews', min: 4 } },
    { id: 'cfg:badge:primer-plato', name: 'Primer plato juntos', description: 'Cocinaron juntos su primera receta.', icon: 'chef-hat', condition: { type: 'cooked', min: 1 } },
    { id: 'cfg:badge:10-platos', name: 'Cocina de casa', description: 'Cocinaron juntos 10 veces.', icon: 'chef-hat', condition: { type: 'cooked', min: 10 } },
    { id: 'cfg:badge:primer-menu', name: 'Cena en casa', description: 'Armaron su primer menú de cita en casa.', icon: 'utensils', condition: { type: 'count', store: 'dateMenus', min: 1 } },
    { id: 'cfg:badge:primer-momento-mascota', name: 'Familia peluda', description: 'Guardaron el primer momento con su mascota.', icon: 'paw-print', condition: { type: 'count', store: 'petRecords', where: { type: 'moment' }, min: 1 } },
    { id: 'cfg:badge:cuentas-claras', name: 'Cuentas claras', description: 'Quedaron parejos por primera vez en Gastos.', icon: 'wallet', condition: { type: 'count', store: 'expenses', where: { category: 'saldo' }, min: 1 } },
    { id: 'cfg:badge:primer-rasca', name: 'Primer premio', description: 'Rasparon su primera tarjeta.', icon: 'wand-sparkles', condition: { type: 'count', store: 'scratchCards', has: ['scratchedAt'], min: 1 } },
    { id: 'cfg:badge:primer-juego', name: 'A jugar', description: 'Jugaron su primera partida en Juegos.', icon: 'gamepad-2', condition: { type: 'count', store: 'games', min: 1 } },
    { id: 'cfg:badge:10-juegos', name: 'Noche de juegos', description: 'Jugaron 10 partidas juntos.', icon: 'trophy', condition: { type: 'count', store: 'games', min: 10 } },
    { id: 'cfg:badge:liga-10', name: 'Liga en marcha', description: 'Anotaron 10 partidas en la Liga de pareja.', icon: 'medal', condition: { type: 'count', store: 'games', where: { gameId: 'liga' }, min: 10 } },
    { id: 'cfg:badge:juntos-60', name: 'Una hora de verdad', description: 'Sumaron 60 minutos en Modo juntos.', icon: 'leaf', condition: { type: 'sum', store: 'games', field: 'minutes', where: { gameId: 'juntos' }, min: 60 } },
    { id: 'cfg:badge:juntos-600', name: 'Desconectados juntos', description: 'Sumaron 10 horas en Modo juntos.', icon: 'leaf', condition: { type: 'sum', store: 'games', field: 'minutes', where: { gameId: 'juntos' }, min: 600 } },
    { id: 'cfg:badge:100-dias', name: '100 días juntos', description: 'Cumplieron 100 días.', icon: 'heart', condition: { type: 'daysTogether', min: 100 } },
    { id: 'cfg:badge:365-dias', name: 'Un año juntos', description: 'Cumplieron 365 días.', icon: 'heart', condition: { type: 'daysTogether', min: 365 } },
  ],

  // Eventos de temporada (Fase 5). rule: fecha fija (month/day), "range" (del día "from" al "to"),
  // "nth" (n-ésimo día de la semana del mes; weekday 0 = domingo, 6 = sábado), "monthly" (cada mes)
  // o una fecha del perfil ("startDate" = aniversario, "birth" = cumpleaños de cada uno).
  // v0.16.0: "lunar" = fiesta del calendario lunar (key: cny = Año Nuevo chino, faroles, qixi, luna =
  // Medio Otoño/Tsukimi; days = cuántos días dura). style: 'jp' solo con el estilo japonés, 'cn' solo
  // con los estilos chinos; sin style, siempre.
  // decoration: hearts, sakura, hanabi, lanterns, candles, lights o petals. El mensaje sale como
  // aviso en Inicio ese día y las actividades se marcan en Eventos. {apodo} = apodo de quien lee.
  seasonalEvents: [
    { id: 'cfg:event:sanvalentin', name: 'San Valentín', rule: { type: 'fixed', month: 2, day: 14 }, decoration: 'hearts', icon: 'heart',
      message: 'Feliz San Valentín. Hoy toca consentirse un poquito más.',
      activities: ['Escribirse una carta corta y leerla en voz alta', 'Cocinar juntos la cena', 'Ver una película romántica abrazados', 'Regalarse un cupón de la Cuponera'] },
    { id: 'cfg:event:hanami', name: 'Temporada de hanami', rule: { type: 'range', from: { month: 3, day: 20 }, to: { month: 4, day: 30 } }, decoration: 'sakura', icon: 'jp-sakura', style: 'jp',
      message: 'Es temporada de hanami: mirar las flores juntos, sin afán.',
      activities: ['Hacer un picnic bajo un árbol florecido', 'Tomarse una foto con flores', 'Preparar onigiri para el paseo', 'Caminar sin rumbo una tarde'] },
    { id: 'cfg:event:aniversario', name: 'Nuestro aniversario', rule: { type: 'profile', field: 'startDate' }, decoration: 'hanabi', icon: 'party-popper',
      message: 'Feliz aniversario. Gracias por otro año eligiéndonos.',
      activities: ['Ver juntos el Resumen del año', 'Abrir una cápsula del tiempo o crear una nueva', 'Volver al lugar de una primera vez', 'Escribirse lo que más agradecen de este año'] },
    { id: 'cfg:event:tanabata', name: 'Tanabata', rule: { type: 'fixed', month: 7, day: 7 }, decoration: 'lanterns', icon: 'sparkles', style: 'jp',
      message: 'Hoy es Tanabata: la noche de los deseos.',
      activities: ['Escribir cada uno un deseo en papel y colgarlo', 'Mirar las estrellas un rato', 'Contarse un sueño para este año', 'Agregar un sueño en Sueños y viajes'] },
    { id: 'cfg:event:shogatsu', name: 'Shōgatsu', rule: { type: 'range', from: { month: 1, day: 1 }, to: { month: 1, day: 3 } }, decoration: 'petals', icon: 'sun', style: 'jp',
      message: 'Feliz Shōgatsu: el Año Nuevo japonés, para empezar con calma y juntos.',
      activities: ['Escribir cada uno un propósito y guardarlo en la Cápsula del tiempo', 'Ver juntos el primer amanecer del año', 'Comer algo rico y tradicional en casa', 'Visitar un lugar tranquilo y pedir un deseo'] },
    { id: 'cfg:event:tsukimi', name: 'Tsukimi', rule: { type: 'lunar', key: 'luna', days: 1 }, decoration: 'lanterns', icon: 'moon', style: 'jp',
      message: 'Hoy es Tsukimi: la noche para mirar la luna llena juntos.',
      activities: ['Salir a mirar la luna un rato', 'Hacer dango o comprar algo dulce y redondo', 'Contarse un deseo para lo que queda del año', 'Tomarse una foto con la luna'] },
    { id: 'cfg:event:anonuevochino', name: 'Año Nuevo chino', rule: { type: 'lunar', key: 'cny', days: 7 }, decoration: 'lanterns', icon: 'sparkles', style: 'cn',
      message: 'Feliz Año Nuevo chino: rojo para la suerte y un año nuevo para los dos.',
      activities: ['Cenar juntos algo especial, como dumplings hechos en casa', 'Regalarse un sobre rojo con un mensaje bonito', 'Limpiar un rincón de la casa para recibir el año', 'Escribir un deseo para el nuevo año y guardarlo'] },
    { id: 'cfg:event:faroles', name: 'Festival de los faroles', rule: { type: 'lunar', key: 'faroles', days: 1 }, decoration: 'lanterns', icon: 'flame', style: 'cn',
      message: 'Hoy es el Festival de los faroles: la noche que cierra el Año Nuevo.',
      activities: ['Hacer un farol de papel juntos', 'Escribir una adivinanza para el otro', 'Salir a caminar de noche y ver luces', 'Comer algo dulce y redondo'] },
    { id: 'cfg:event:qixi', name: 'Qixi', rule: { type: 'lunar', key: 'qixi', days: 1 }, decoration: 'hearts', icon: 'sparkles', style: 'cn',
      message: 'Hoy es Qixi, el San Valentín chino: la noche en que se encuentran los enamorados.',
      activities: ['Mirar las estrellas juntos', 'Escribirse una carta corta de amor', 'Recordar cómo se conocieron', 'Regalarse un detalle hecho a mano'] },
    { id: 'cfg:event:mediootono', name: 'Fiesta del Medio Otoño', rule: { type: 'lunar', key: 'luna', days: 1 }, decoration: 'lanterns', icon: 'moon', style: 'cn',
      message: 'Hoy es la Fiesta del Medio Otoño: luna llena, pastel de luna y estar juntos.',
      activities: ['Mirar la luna llena juntos', 'Compartir un pastel de luna o un postre redondo', 'Encender un farol o una vela', 'Contarse lo que agradecen este año'] },
    { id: 'cfg:event:amoryamistad', name: 'Amor y Amistad', rule: { type: 'nth', month: 9, weekday: 6, n: 3 }, decoration: 'hearts', icon: 'heart-handshake',
      message: 'Feliz Amor y Amistad: la mejor amistad también es la de ustedes.',
      activities: ['Darse un detalle hecho a mano', 'Invitar a alguien querido a compartir', 'Jugar una partida en Juegos', 'Escribir tres razones por las que son buen equipo'] },
    { id: 'cfg:event:halloween', name: 'Halloween', rule: { type: 'fixed', month: 10, day: 31 }, decoration: 'lanterns', icon: 'ghost',
      message: 'Feliz Halloween: noche de disfraces, dulces y sustos suaves.',
      activities: ['Disfrazarse con lo que haya en casa', 'Ver una película de terror suave', 'Tallar o pintar una calabaza', 'Hacer dulces caseros'] },
    { id: 'cfg:event:velitas', name: 'Noche de velitas', rule: { type: 'fixed', month: 12, day: 7 }, decoration: 'candles', icon: 'flame',
      message: 'Noche de velitas: una luz por cada cosa bonita del año.',
      activities: ['Prender velitas y pedir un deseo cada uno', 'Tomar chocolate caliente juntos', 'Contar lo mejor del año', 'Tomarse una foto con las velitas'] },
    { id: 'cfg:event:novenas', name: 'Novenas', rule: { type: 'range', from: { month: 12, day: 16 }, to: { month: 12, day: 24 } }, decoration: 'lights', icon: 'star',
      message: 'Tiempo de novenas: buñuelos, natilla y villancicos.',
      activities: ['Hacer buñuelos o natilla', 'Rezar o cantar una novena en familia', 'Armar el pesebre o un rincón navideño', 'Escribir la carta del niño Dios para el otro'] },
    { id: 'cfg:event:navidad', name: 'Navidad', rule: { type: 'fixed', month: 12, day: 25 }, decoration: 'lights', icon: 'tree-pine',
      message: 'Feliz Navidad. El mejor regalo es estar juntos.',
      activities: ['Abrir los regalos con calma', 'Dar un paseo para ver las luces', 'Ver una película navideña', 'Llamar juntos a alguien que quieren'] },
    { id: 'cfg:event:mesiversario', name: 'Mesiversario', rule: { type: 'monthly', day: 2 }, decoration: 'petals', icon: 'heart',
      message: 'Feliz mesiversario. Un mes más de nosotros.',
      activities: ['Decirse una cosa que aprendieron del otro este mes', 'Tomarse la foto del mes'],
      // Un reto especial por mes (va rotando).
      retos: ['Recrear su primera cita', 'Cocinar el plato favorito del otro', 'Hacer una caminata y no mirar el teléfono', 'Escribir una carta para abrir en un año', 'Bailar en la sala su canción', 'Probar un restaurante nuevo', 'Hacer un picnic en casa', 'Planear el próximo viaje con mapa en mano', 'Dibujarse uno al otro', 'Ver el atardecer juntos', 'Armar un álbum del mes con 5 fotos', 'Hacer algo nuevo por primera vez'] },
    { id: 'cfg:event:cumpleanos', name: 'Cumpleaños', rule: { type: 'profile', field: 'birth' }, decoration: 'hanabi', icon: 'cake',
      message: '¡Feliz cumpleaños! Hoy se celebra a una persona muy querida.',
      activities: ['Desayuno sorpresa', 'Una carta de cumpleaños', 'El plan favorito de quien cumple', 'Una canción dedicada'] },
  ],

  // Textos de "Legal y ayuda" (Ajustes). Valores iniciales editables en la app.
  // Se pueden editar desde la app y volver a este texto con "Restaurar". Párrafos separados
  // por una línea en blanco; "## " inicia un subtítulo y "- " un punto de lista.
  legalTexts: [
    { id: 'cfg:legal:privacidad', title: 'Política de privacidad', summary: 'Qué guarda la app, dónde (en cada dispositivo y, si la activan, cifrado en la nube para sincronizar), qué servicios externos opcionales existen, quién puede ver qué y cómo borrar todo.', body: "Esta app es solo para ustedes dos. No tiene cuentas, ni publicidad, ni analítica, ni cookies.\n\n## Qué guarda\n- Lo que ustedes escriben o eligen: nombres, apodos, fechas, recuerdos con sus fotos y videos, cartas, cupones, frases y ajustes.\n- Datos técnicos mínimos para funcionar, como la versión de la app y un registro local de errores sin datos personales.\n\n## Dónde lo guarda\nTodo vive en el navegador de cada dispositivo (IndexedDB). Si activan la Sincronización, una copia cifrada viaja a un pequeño servidor propio en Cloudflare (plan gratis) para llegar a los otros equipos unidos.\n\n## Sincronización\n- Se cifra dentro del teléfono antes de salir (cifrado de extremo a extremo). El servidor guarda paquetes que no puede leer: no ve textos, fotos, nombres ni fechas.\n- Lo de \"Solo yo\" solo viaja entre los equipos de su dueño. El Rincón viaja cifrado y solo se abre con su PIN. Las grabaciones del Rincón no salen del equipo donde se hicieron.\n- Los avisos son solo cariñosos y nunca llevan contenido.\n- La ubicación es una instantánea que ustedes mandan cuando quieren; no hay seguimiento.\n- Es opcional: sin Sincronización, nada sale del dispositivo y los datos se pasan con la copia de seguridad.\n\n## Quién ve qué\n- \"Los dos\": lo ve quien use la app en los equipos unidos.\n- \"Solo yo\": no se le muestra a la otra persona ni se cuenta. Con PIN personal, además, queda cifrado.\n- Sin PIN, la privacidad es de cortesía: quien tenga el teléfono desbloqueado podría llegar a los datos con herramientas del navegador.\n\n## Servicios externos\nEl Mapa de lugares descarga las imágenes del mapa de CARTO (hechas con datos de OpenStreetMap): ese servicio sabe qué zona del mapa se está mirando, nada más. Canciones usa el reproductor de Spotify solo cuando lo tocan. Todo eso es opcional y se apaga con \"Modo sin terceros\": entonces el mapa se ve como lista.\n\n## Cifrado\nCon PIN, lo privado se cifra en el dispositivo (AES-GCM, con una clave derivada del PIN). El PIN nunca se guarda. Si lo olvidan, lo cifrado no se puede recuperar.\n\n## Cómo borrar todo\n- En este dispositivo: Ajustes, Centro de seguridad, \"Borrar todo\". También se borra al eliminar los datos del sitio en Chrome.\n- En la nube: Ajustes, Sincronización, \"Borrar todo del servidor\". Los equipos conservan lo suyo.\n- Las copias descargadas se borran a mano." },
    { id: 'cfg:legal:uso', title: 'Aviso de uso', summary: 'App privada de pareja para uso personal. El Rincón privado es solo para adultos que consienten. Las grabaciones no se comparten sin permiso.', body: "Aishiteru es una app privada de pareja, para el uso personal de dos personas. No es un servicio público ni comercial.\n\n## Uso esperado\n- Es para conectar en persona, no para controlar al otro. Nada en la app sirve para vigilar, rastrear ni revisar el teléfono de la otra persona.\n- Cada uno decide qué comparte. \"Solo yo\" se respeta.\n\n## Contenido\n- Lo que escriben, las fotos y las grabaciones son de quienes las crean. No se comparten fuera de la pareja sin el permiso de los dos.\n- El Rincón privado es solo para adultos que consienten, y cada uno puede decir que no en cualquier momento.\n\n## Responsabilidad\n- La app se entrega tal cual, como un regalo hecho a mano. Hagan copias de seguridad con frecuencia: si se borran los datos del navegador sin copia, se pierden.\n- Si algo falla, no se pierde lo guardado salvo que se borre el dispositivo." },
    { id: 'cfg:legal:salud', title: 'Avisos de salud', summary: 'El ciclo y sus predicciones son estimaciones, no consejo médico ni anticonceptivo. Los datos de salud de la mascota no reemplazan al veterinario.', body: "## Ciclo\nEl calendario del ciclo, sus predicciones y la ventana fértil son estimaciones hechas con los datos que se ingresan. No son consejo médico ni un método anticonceptivo. Ante cualquier duda de salud, consulten a un profesional.\n\n## Mascotas\nLas vacunas, citas y notas de salud de la mascota son un apoyo para recordar. No reemplazan la opinión del veterinario.\n\n## Ánimo\nEl medidor de ánimo es para acompañarse. Si alguno está pasando por un momento difícil, busquen apoyo de personas de confianza o de un profesional." },
    { id: 'cfg:legal:permisos', title: 'Permisos', summary: 'Para qué se usan la cámara, el micrófono, la ubicación, las notificaciones y el almacenamiento, y cómo quitarlos desde Chrome.', body: "La app pide cada permiso solo cuando se usa la función que lo necesita, explica antes para qué es y sigue funcionando si se niega.\n\n- Fotos y cámara: para agregar fotos a los recuerdos y cartas. Las fotos se achican y se quedan en el dispositivo.\n- Micrófono: para las notas de voz, solo después de tocar \"Grabar\".\n- Ubicación: para compartir dónde están en un momento puntual, con la precisión que elijan. No hay seguimiento continuo.\n- Notificaciones: para los recordatorios suaves.\n- Almacenamiento persistente: para que el navegador no borre los datos por su cuenta.\n\n## Cómo quitarlos en Chrome\nEn Android: mantener presionado el ícono de la app, \"Información\", \"Permisos\". En el PC: el candado junto a la dirección, \"Configuración del sitio\". Desde ahí también se puede borrar todo lo guardado." },
    { id: 'cfg:legal:licencias', title: 'Licencias y créditos', summary: 'Lucide (ISC), Leaflet (BSD-2), OpenStreetMap y CARTO (atribución), fuentes Shippori Mincho, Zen Maru Gothic, Atkinson Hyperlegible, Ma Shan Zheng y Noto Serif SC (OFL), ONNX Runtime Web (MIT), el modelo U²-Net (Apache 2.0), qrcode-generator (MIT), jsQR (Apache 2.0) y los términos de Spotify.', body: "La app usa piezas de terceros con licencias libres. Gracias a sus autores.\n\n- Íconos Lucide, licencia ISC.\n- Fuentes Shippori Mincho, Zen Maru Gothic, Atkinson Hyperlegible, Ma Shan Zheng y Noto Serif SC, licencia SIL Open Font License 1.1. Se sirven desde la propia app.\n- Mapa de lugares: Leaflet, licencia BSD-2, con mapas de CARTO (estilo Voyager) hechos con datos de OpenStreetMap (© colaboradores de OpenStreetMap, ODbL) y su atribución en el mapa.\n- Quitar el fondo de las estampillas: ONNX Runtime Web de Microsoft, licencia MIT, con el modelo U²-Net pequeño de Xuebin Qin y colaboradores, licencia Apache 2.0. Funciona dentro del teléfono; la foto no sale de él.\n- Códigos QR para unir equipos: qrcode-generator de Kazuhiko Arase, licencia MIT, y jsQR de Cosmo Wolfe, licencia Apache 2.0, para leer el código con la cámara. Todo pasa dentro del equipo.\n- Spotify: en Canciones se usa solo su reproductor oficial y su servicio público de nombres (oEmbed), según los términos de Spotify. La app no busca en Spotify ni guarda audio.\n\nLas ilustraciones japonesas y chinas, el logo de sakura y el resto del diseño son propios de esta app." },
    { id: 'cfg:legal:version', title: 'Versión y novedades', summary: 'Versión instalada, historial de cambios y cómo reportar un problema sin datos personales.', body: "Aquí está la versión instalada y cómo contar un problema sin compartir datos personales.\n\n## Reportar un problema\n\"Copiar reporte técnico\" copia la versión, el navegador, el tamaño de pantalla, cuántos elementos hay por sección (solo números) y los últimos errores técnicos. No incluye nombres, textos, fotos ni fechas de ustedes. Pueden pegarlo en un mensaje o en un correo." },
  ],
  legalFooter: 'Estos textos no constituyen asesoría legal. Quien prepara la app debe revisarlos y adaptarlos.',

  // Bancos que se completan en la fase donde se usan (docs/11 §5).
  // Plantillas del quiz "¿Cuánto me conoces?": cada uno elige una, escribe 4 opciones sobre sí y marca la correcta.
  quiz: [
    {"id": "cfg:quiz:comida", "text": "¿Cuál es mi comida favorita?"},
    {"id": "cfg:quiz:dia-libre", "text": "¿Qué haría en un día libre perfecto?"},
    {"id": "cfg:quiz:miedo", "text": "¿Qué me da más miedo?"},
    {"id": "cfg:quiz:cancion", "text": "¿Cuál es mi canción del momento?"},
    {"id": "cfg:quiz:japon", "text": "¿Qué lugar de Japón quiero conocer primero?"},
    {"id": "cfg:quiz:detalle", "text": "¿Qué detalle tuyo me enamora más?"},
    {"id": "cfg:quiz:antojo", "text": "¿Qué antojo no puedo resistir?"},
    {"id": "cfg:quiz:loteria", "text": "¿Qué haría si me ganara la lotería?"},
  ],
  // Planes juntos (sección 2): pequeños y rápidos; ustedes agregan, cumplen y borran.
  bucketList: [
    { id: 'cfg:bucket:01', title: "Ver un amanecer desde un lugar alto", done: false, doneAt: '', order: 1 },
    { id: 'cfg:bucket:02', title: "Hacer un picnic en un parque nuevo", done: false, doneAt: '', order: 2 },
    { id: 'cfg:bucket:03', title: "Aprender juntos a preparar un plato japonés", done: false, doneAt: '', order: 3 },
    { id: 'cfg:bucket:04', title: "Ir a un concierto de un artista que nos guste a los dos", done: false, doneAt: '', order: 4 },
    { id: 'cfg:bucket:05', title: "Pasar un fin de semana fuera de Bogotá", done: false, doneAt: '', order: 5 },
    { id: 'cfg:bucket:06', title: "Plantar algo y cuidarlo juntos", done: false, doneAt: '', order: 6 },
    { id: 'cfg:bucket:07', title: "Tomarnos una foto en cada estación del año", done: false, doneAt: '', order: 7 },
    { id: 'cfg:bucket:08', title: "Hacer un viaje en tren o en bus a un pueblo que no conozcamos", done: false, doneAt: '', order: 8 },
  ],
  // Retos semanales (uno por semana, sin repetirse hasta terminar la lista).
  weeklyChallenges: [
    {"id": "cfg:challenge:01", "title": "Nota escondida", "text": "Escóndele una nota a mano donde la encuentre durante la semana.", "category": "detalle"},
    {"id": "cfg:challenge:02", "title": "Desayuno sorpresa", "text": "Prepárale el desayuno un día que no lo espere.", "category": "detalle"},
    {"id": "cfg:challenge:03", "title": "Tres cosas que admiro", "text": "Díganse en persona tres cosas que admiran del otro.", "category": "reflexión"},
    {"id": "cfg:challenge:04", "title": "Caminata sin rumbo", "text": "Salgan a caminar 30 minutos sin plan y sin mirar el teléfono.", "category": "salida"},
    {"id": "cfg:challenge:05", "title": "Noche de juegos de mesa", "text": "Una partida de lo que tengan en casa; quien pierde lava la loza.", "category": "juego"},
    {"id": "cfg:challenge:06", "title": "Barrio nuevo", "text": "Conozcan juntos un barrio o parque de Bogotá donde nunca han estado.", "category": "aventura"},
    {"id": "cfg:challenge:07", "title": "Playlist de la semana", "text": "Cada uno elige 3 canciones que le recuerden al otro y las escuchan juntos.", "category": "detalle"},
    {"id": "cfg:challenge:08", "title": "Recuerdo favorito", "text": "Cuéntense su recuerdo favorito de la relación hasta hoy.", "category": "reflexión"},
    {"id": "cfg:challenge:09", "title": "Cocinar algo nuevo", "text": "Preparen juntos una receta que ninguno haya hecho.", "category": "aventura"},
    {"id": "cfg:challenge:10", "title": "Foto recreada", "text": "Recreen una foto vieja de ustedes y agréguenla a la Cápsula.", "category": "juego"},
    {"id": "cfg:challenge:11", "title": "Carta corta", "text": "Escríbanse una carta de pocas líneas y léanla en voz alta.", "category": "detalle"},
    {"id": "cfg:challenge:12", "title": "Día del sí", "text": "Una tarde, cada uno dice que sí a un plan sencillo que proponga el otro.", "category": "juego"},
    {"id": "cfg:challenge:13", "title": "Picnic", "text": "Un picnic en un parque o en la sala, con lo que haya en la nevera.", "category": "salida"},
    {"id": "cfg:challenge:14", "title": "Lo que necesito", "text": "Cada uno cuenta una cosa pequeña que le haría sentir más querido.", "category": "reflexión"},
    {"id": "cfg:challenge:15", "title": "Atardecer", "text": "Busquen un lugar alto o abierto para ver el atardecer juntos.", "category": "salida"},
    {"id": "cfg:challenge:16", "title": "Masaje de 10 minutos", "text": "Turnos de 10 minutos de masaje de espalda o de manos.", "category": "detalle"},
    {"id": "cfg:challenge:17", "title": "Primera cita, versión 2", "text": "Vuelvan al lugar de una de sus primeras citas o recréenla en casa.", "category": "aventura"},
    {"id": "cfg:challenge:18", "title": "Preguntas rápidas", "text": "20 preguntas de \"esto o aquello\" en voz alta, sin pensarlo mucho.", "category": "juego"},
    {"id": "cfg:challenge:19", "title": "Sueño pequeño", "text": "Elijan un sueño o plan y den juntos el primer paso esta semana.", "category": "reflexión"},
    {"id": "cfg:challenge:20", "title": "Origami", "text": "Aprendan a doblar una grulla y regálensela con un deseo escrito.", "category": "juego"},
    {"id": "cfg:challenge:21", "title": "Mercado juntos", "text": "Hagan el mercado juntos y elijan un antojo nuevo para probar.", "category": "salida"},
    {"id": "cfg:challenge:22", "title": "Cumplido diario", "text": "Cada día de la semana, un cumplido distinto en persona.", "category": "detalle"},
    {"id": "cfg:challenge:23", "title": "Plan de lluvia", "text": "El primer día que llueva: cobija, chocolate y una película.", "category": "detalle"},
    {"id": "cfg:challenge:24", "title": "Algo japonés", "text": "Prueben juntos algo de Japón: comida, una palabra nueva o un anime corto.", "category": "aventura"},
    {"id": "cfg:challenge:25", "title": "Gracias por…", "text": "Díganse cinco cosas que agradecen del otro de este mes.", "category": "reflexión"},
    {"id": "cfg:challenge:26", "title": "Bailar en casa", "text": "Pongan una canción suya y bailen en la sala, aunque sea mal.", "category": "juego"},
  ],
  // Pasos del reto que se marcan durante la semana.
  challengeSteps: ['Elegimos el día', 'Lo hicimos', 'Nos contamos qué tal'],
  // Mensajes al terminar el quiz, según cuántas acertó (de mayor a menor).
  quizMessages: [
    { min: 1, text: 'Me conoces de memoria.' },
    { min: 0.6, text: 'Vas muy bien.' },
    { min: 0, text: 'Hay mucho por descubrir, y eso es lo bonito.' },
  ],
  // Primeras veces sugeridas (sección 22): páginas en blanco que ustedes completan, editan u ocultan.
  firsts: [
    { id: 'cfg:first:cita', title: 'Nuestra primera cita' },
    { id: 'cfg:first:foto', title: 'Nuestra primera foto juntos' },
    { id: 'cfg:first:te-quiero', title: 'El primer "te quiero"' },
    { id: 'cfg:first:beso', title: 'Nuestro primer beso' },
    { id: 'cfg:first:pelicula', title: 'La primera película juntos' },
    { id: 'cfg:first:cocinar', title: 'La primera vez que cocinamos juntos' },
    { id: 'cfg:first:viaje', title: 'Nuestro primer viaje' },
    { id: 'cfg:first:familia', title: 'La primera vez con la familia del otro' },
    { id: 'cfg:first:amigos', title: 'La primera salida con los amigos' },
    { id: 'cfg:first:regalo', title: 'El primer regalo' },
    { id: 'cfg:first:cancion', title: 'Nuestra primera canción' },
    { id: 'cfg:first:pelea', title: 'La primera pelea que arreglamos' },
    { id: 'cfg:first:lluvia', title: 'La primera vez bajo la lluvia' },
    { id: 'cfg:first:baile', title: 'Nuestro primer baile' },
    { id: 'cfg:first:mesiversario', title: 'Nuestro primer mesiversario' },
    { id: 'cfg:first:mascota', title: 'El primer día con {mascota}', requires: 'pets' },
    { id: 'cfg:first:concierto', title: 'Nuestro primer concierto o evento' },
    { id: 'cfg:first:amanecer', title: 'El primer amanecer juntos' },
    { id: 'cfg:first:carta', title: 'La primera carta' },
    { id: 'cfg:first:aniversario', title: 'Nuestro primer aniversario' },
  ],
  // Frasco de gratitud (sección 28): disparadores para empezar la nota.
  gratitudePrompts: [
    { id: 'cfg:gratitude:01', text: "Hoy te agradezco que…" },
    { id: 'cfg:gratitude:02', text: "Algo pequeño que hiciste y me encantó…" },
    { id: 'cfg:gratitude:03', text: "Gracias por escucharme cuando…" },
    { id: 'cfg:gratitude:04', text: "Me hiciste reír cuando…" },
    { id: 'cfg:gratitude:05', text: "Me sentí cuidado o cuidada cuando…" },
    { id: 'cfg:gratitude:06', text: "Admiro cómo…" },
    { id: 'cfg:gratitude:07', text: "Gracias por tu paciencia con…" },
    { id: 'cfg:gratitude:08', text: "Lo que más disfruté de esta semana contigo…" },
    { id: 'cfg:gratitude:09', text: "Gracias por acompañarme en…" },
    { id: 'cfg:gratitude:10', text: "Me gustó mucho que me dijeras…" },
    { id: 'cfg:gratitude:11', text: "Gracias por hacer más fácil…" },
    { id: 'cfg:gratitude:12', text: "Un detalle tuyo que no quiero olvidar…" },
    { id: 'cfg:gratitude:13', text: "Gracias por confiar en mí cuando…" },
    { id: 'cfg:gratitude:14', text: "Me encanta cuando tú…" },
    { id: 'cfg:gratitude:15', text: "Gracias por el abrazo de…" },
    { id: 'cfg:gratitude:16', text: "Algo que aprendí de ti…" },
    { id: 'cfg:gratitude:17', text: "Gracias por darme espacio cuando…" },
    { id: 'cfg:gratitude:18', text: "Me sentí orgulloso u orgullosa de ti cuando…" },
    { id: 'cfg:gratitude:19', text: "Gracias por pensar en mí cuando…" },
    { id: 'cfg:gratitude:20', text: "Hoy me alegraste el día con…" },
  ],
  // Revisión semanal (sección 28): se eligen de 3 a 5 cada semana.
  weeklyReviewQuestions: [
    { id: 'cfg:review:01', text: "¿Qué salió bien esta semana entre nosotros?", order: 1 },
    { id: 'cfg:review:02', text: "¿Qué momento juntos disfrutaste más?", order: 2 },
    { id: 'cfg:review:03', text: "¿Qué necesito de ti la próxima semana?", order: 3 },
    { id: 'cfg:review:04', text: "¿Qué te agradezco de esta semana?", order: 4 },
    { id: 'cfg:review:05', text: "¿Hubo algo que nos costó? ¿Cómo lo hacemos mejor?", order: 5 },
    { id: 'cfg:review:06', text: "¿Qué plan pequeño hacemos la próxima semana?", order: 6 },
    { id: 'cfg:review:07', text: "¿Cómo llegas de energía y de ánimo?", order: 7 },
    { id: 'cfg:review:08', text: "¿Qué quieres que celebremos?", order: 8 },
  ],
  // Listas (sección 32): plantillas que traen elementos típicos; luego se editan en la app.
  listTemplates: [
    { id: 'cfg:list:mercado', name: 'Mercado de la semana', kind: 'shopping', items: ['Arroz', 'Huevos', 'Leche', 'Pan', 'Frutas', 'Verduras', 'Pollo', 'Café', 'Papel higiénico', 'Jabón de loza'] },
    { id: 'cfg:list:mascota', name: 'Cosas de la mascota', kind: 'shopping', items: ['Concentrado', 'Arena', 'Snacks', 'Juguete nuevo'] },
    { id: 'cfg:list:aseo', name: 'Aseo de la casa', kind: 'todo', items: ['Barrer y trapear', 'Lavar la ropa', 'Cambiar sábanas', 'Sacar la basura', 'Limpiar el baño', 'Limpiar la arena'] },
    { id: 'cfg:list:cita', name: 'Para una cita en casa', kind: 'shopping', items: ['Velas', 'Postre', 'Bebida', 'Snacks', 'Flores'] },
    { id: 'cfg:list:viaje', name: 'Maleta de viaje', kind: 'todo', items: ['Documentos', 'Cargadores', 'Ropa', 'Medicinas', 'Cepillo de dientes', 'Dejar comida y arena a la mascota'] },
  ],
  // Mascotas (sección 26). Plantillas GENÉRICAS de salud: el veterinario decide las fechas reales.
  petHealthTemplates: [
    { id: 'cfg:pethealth:gato-triple', species: 'gato', type: 'vaccine', product: 'Triple felina (refuerzo)', everyDays: 365 },
    { id: 'cfg:pethealth:gato-rabia', species: 'gato', type: 'vaccine', product: 'Rabia', everyDays: 365 },
    { id: 'cfg:pethealth:gato-leucemia', species: 'gato', type: 'vaccine', product: 'Leucemia felina', everyDays: 365 },
    { id: 'cfg:pethealth:perro-multiple', species: 'perro', type: 'vaccine', product: 'Múltiple canina (refuerzo)', everyDays: 365 },
    { id: 'cfg:pethealth:perro-rabia', species: 'perro', type: 'vaccine', product: 'Rabia', everyDays: 365 },
    { id: 'cfg:pethealth:interna', type: 'deworm', product: 'Desparasitación interna', everyDays: 90 },
    { id: 'cfg:pethealth:externa', type: 'deworm', product: 'Antipulgas (externa)', everyDays: 30 },
  ],
  petMilestones: [
    { id: 'cfg:petmilestone:llegada', title: 'Primer día en casa' },
    { id: 'cfg:petmilestone:vet', title: 'Primera visita al veterinario' },
    { id: 'cfg:petmilestone:juguete', title: 'Su primer juguete favorito' },
    { id: 'cfg:petmilestone:cama', title: 'Eligió su lugar para dormir' },
    { id: 'cfg:petmilestone:travesura', title: 'Su primera gran travesura' },
    { id: 'cfg:petmilestone:cumple', title: 'Su primer cumpleaños con nosotros' },
    { id: 'cfg:petmilestone:foto', title: 'Foto del mes' },
  ],
  // Rasca y gana (sección 29): premios pequeños; cualquiera se puede convertir en cupón.
  scratchPrizes: [{"id": "cfg:prize:01", "text": "Un abrazo de 30 segundos", "toCoupon": true}, {"id": "cfg:prize:02", "text": "Desayuno en la cama", "toCoupon": true}, {"id": "cfg:prize:03", "text": "Elijo la película de esta noche", "toCoupon": true}, {"id": "cfg:prize:04", "text": "Un masaje de 10 minutos", "toCoupon": true}, {"id": "cfg:prize:05", "text": "Postre a mi elección", "toCoupon": true}, {"id": "cfg:prize:06", "text": "Me libras de lavar la loza hoy", "toCoupon": true}, {"id": "cfg:prize:07", "text": "Un paseo de la mano", "toCoupon": true}, {"id": "cfg:prize:08", "text": "Una cita sorpresa planeada por ti", "toCoupon": true}, {"id": "cfg:prize:09", "text": "Una canción dedicada en voz alta", "toCoupon": true}, {"id": "cfg:prize:10", "text": "Te cocino tu plato favorito", "toCoupon": true}, {"id": "cfg:prize:11", "text": "Un día sin quejas, con muchos mimos", "toCoupon": true}, {"id": "cfg:prize:12", "text": "Elijo el plan del domingo", "toCoupon": true}, {"id": "cfg:prize:13", "text": "Una carta escrita a mano", "toCoupon": true}, {"id": "cfg:prize:14", "text": "Un helado juntos", "toCoupon": true}, {"id": "cfg:prize:15", "text": "Una foto bonita de los dos para imprimir", "toCoupon": true}, {"id": "cfg:prize:16", "text": "Tú escoges la música en el carro", "toCoupon": true}, {"id": "cfg:prize:17", "text": "Una noche de juegos de mesa", "toCoupon": true}, {"id": "cfg:prize:18", "text": "Me peinas o te peino", "toCoupon": true}, {"id": "cfg:prize:19", "text": "Un picnic en casa", "toCoupon": true}, {"id": "cfg:prize:20", "text": "Un beso cuando tú quieras, sin excusas", "toCoupon": true}],
  // Hábitos compartidos (sección 30): ideas para empezar; se editan en la app.
  habitTemplates: [{"id": "cfg:habit:01", "name": "Tomar agua al despertar", "hint": "Un vaso cada uno, apenas se levanten."}, {"id": "cfg:habit:02", "name": "Caminar 20 minutos", "hint": "Juntos o cada uno por su lado; cuenta igual."}, {"id": "cfg:habit:03", "name": "Leer 10 páginas", "hint": "Antes de dormir, sin pantalla."}, {"id": "cfg:habit:04", "name": "Decirse algo bonito", "hint": "En persona o en una nota."}, {"id": "cfg:habit:05", "name": "Acostarse antes de las 11", "hint": "El descanso también es un plan."}, {"id": "cfg:habit:06", "name": "Comer una fruta", "hint": "La que más les guste."}, {"id": "cfg:habit:07", "name": "Estirar 5 minutos", "hint": "Al levantarse o al llegar a casa."}, {"id": "cfg:habit:08", "name": "Un rato sin celular", "hint": "30 minutos juntos sin pantallas."}, {"id": "cfg:habit:09", "name": "Ordenar 10 minutos", "hint": "Un rincón de la casa cada día."}, {"id": "cfg:habit:10", "name": "Agradecer una cosa del día", "hint": "Decirla en voz alta antes de dormir."}],
  // Lenguajes del amor (sección 27): nombres, 10 preguntas de elección y una guía amable, no un diagnóstico.
  loveLanguageNames: {"palabras": "Palabras de afirmación", "tiempo": "Tiempo de calidad", "regalos": "Detalles y regalos", "actos": "Actos de servicio", "contacto": "Contacto físico"},
  loveLanguageQuestions: [
    { id: 'cfg:ll:01', text: "Me siento más querido o querida cuando…", options: [{ lang: 'palabras', text: "me dices lo que admiras de mí" }, { lang: 'tiempo', text: "pasamos una tarde sin teléfonos" }] },
    { id: 'cfg:ll:02', text: "Después de un día difícil prefiero…", options: [{ lang: 'contacto', text: "un abrazo largo" }, { lang: 'actos', text: "que me ayudes con algo pendiente" }] },
    { id: 'cfg:ll:03', text: "Un buen detalle para mí es…", options: [{ lang: 'regalos', text: "algo pequeño que te hizo pensar en mí" }, { lang: 'palabras', text: "una nota escrita a mano" }] },
    { id: 'cfg:ll:04', text: "Me duele más cuando…", options: [{ lang: 'tiempo', text: "estamos juntos pero distraídos" }, { lang: 'palabras', text: "no me dices nada bonito en días" }] },
    { id: 'cfg:ll:05', text: "En una cita, lo que más valoro es…", options: [{ lang: 'tiempo', text: "la conversación sin afán" }, { lang: 'contacto', text: "ir de la mano todo el tiempo" }] },
    { id: 'cfg:ll:06', text: "Me haces sentir importante cuando…", options: [{ lang: 'actos', text: "te encargas de algo para que yo descanse" }, { lang: 'regalos', text: "recuerdas algo que quería y me sorprendes" }] },
    { id: 'cfg:ll:07', text: "Un buen saludo es…", options: [{ lang: 'contacto', text: "un beso y un abrazo" }, { lang: 'palabras', text: "un \"te extrañé\" sincero" }] },
    { id: 'cfg:ll:08', text: "Prefiero que me demuestres cariño…", options: [{ lang: 'actos', text: "haciendo algo por mí sin que lo pida" }, { lang: 'tiempo', text: "eligiendo un plan solo para los dos" }] },
    { id: 'cfg:ll:09', text: "Lo que más recuerdo de un cumpleaños es…", options: [{ lang: 'regalos', text: "el regalo pensado para mí" }, { lang: 'actos', text: "que alguien organizó todo" }] },
    { id: 'cfg:ll:10', text: "Cuando estoy triste me ayuda…", options: [{ lang: 'palabras', text: "que me digas que todo va a estar bien" }, { lang: 'contacto', text: "que me abraces sin decir nada" }] },
  ],
  loveLanguageIdeas: [
    { id: 'cfg:llidea:palabras-1', lang: 'palabras', text: "Déjale una nota escondida con algo que admiras." },
    { id: 'cfg:llidea:palabras-2', lang: 'palabras', text: "Dile en persona tres cosas que te gustan de él o ella." },
    { id: 'cfg:llidea:palabras-3', lang: 'palabras', text: "Mándale un \"Pensando en ti\" en un día cualquiera." },
    { id: 'cfg:llidea:palabras-4', lang: 'palabras', text: "Cuéntale a alguien, delante de él o ella, algo bonito suyo." },
    { id: 'cfg:llidea:tiempo-1', lang: 'tiempo', text: "Una tarde sin teléfonos, solo los dos." },
    { id: 'cfg:llidea:tiempo-2', lang: 'tiempo', text: "Caminen sin rumbo y conversen." },
    { id: 'cfg:llidea:tiempo-3', lang: 'tiempo', text: "Saquen una cita de Sugerencias de citas y háganla." },
    { id: 'cfg:llidea:tiempo-4', lang: 'tiempo', text: "Respondan juntos la pregunta del día, en voz alta." },
    { id: 'cfg:llidea:regalos-1', lang: 'regalos', text: "Un detalle pequeño que te recuerde a él o ella." },
    { id: 'cfg:llidea:regalos-2', lang: 'regalos', text: "Una flor, un dulce o su snack favorito, sin motivo." },
    { id: 'cfg:llidea:regalos-3', lang: 'regalos', text: "Algo hecho a mano: una grulla de papel, un dibujo." },
    { id: 'cfg:llidea:regalos-4', lang: 'regalos', text: "Revisa su lista de Regalos secretos." },
    { id: 'cfg:llidea:actos-1', lang: 'actos', text: "Hazte cargo de algo que tenga pendiente." },
    { id: 'cfg:llidea:actos-2', lang: 'actos', text: "Prepárale el desayuno o la comida." },
    { id: 'cfg:llidea:actos-3', lang: 'actos', text: "Ayúdale con algo de su trabajo o estudio." },
    { id: 'cfg:llidea:actos-4', lang: 'actos', text: "Hagan juntos una tarea de la casa que no le guste." },
    { id: 'cfg:llidea:contacto-1', lang: 'contacto', text: "Un abrazo largo al saludar y al despedirse." },
    { id: 'cfg:llidea:contacto-2', lang: 'contacto', text: "Tomarse de la mano al caminar." },
    { id: 'cfg:llidea:contacto-3', lang: 'contacto', text: "Un masaje de 10 minutos." },
    { id: 'cfg:llidea:contacto-4', lang: 'contacto', text: "Ver una película abrazados." },
  ],
  albumTemplates: [], // Fase 4A
  // Recetas (sección 39): 10 recetas sencillas de ejemplo, editables y borrables (verify: revisar a su gusto).
  recipes: [{"id": "cfg:recipe:onigiri", "name": "Onigiri de atún", "servings": 2, "minutes": 30, "difficulty": "facil", "tags": ["japonés", "salado", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:onigiri:i1", "qty": "2", "unit": "tazas", "text": "arroz para sushi o arroz blanco"}, {"id": "cfg:recipe:onigiri:i2", "qty": "1", "unit": "lata", "text": "atún"}, {"id": "cfg:recipe:onigiri:i3", "qty": "2", "unit": "cdas", "text": "mayonesa"}, {"id": "cfg:recipe:onigiri:i4", "qty": "", "unit": "", "text": "Sal al gusto"}, {"id": "cfg:recipe:onigiri:i5", "qty": "2", "unit": "hojas", "text": "alga nori"}], "steps": [{"id": "cfg:recipe:onigiri:s1", "text": "Lavar el arroz hasta que el agua salga clara", "timerSec": 0}, {"id": "cfg:recipe:onigiri:s2", "text": "Cocinar el arroz tapado a fuego bajo", "timerSec": 900}, {"id": "cfg:recipe:onigiri:s3", "text": "Dejar reposar el arroz tapado", "timerSec": 600}, {"id": "cfg:recipe:onigiri:s4", "text": "Mezclar el atún escurrido con la mayonesa", "timerSec": 0}, {"id": "cfg:recipe:onigiri:s5", "text": "Con las manos mojadas y un poco de sal, formar triángulos con el relleno en el centro", "timerSec": 0}, {"id": "cfg:recipe:onigiri:s6", "text": "Envolver la base con una tira de alga", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:tamagoyaki", "name": "Tamagoyaki (tortilla japonesa enrollada)", "servings": 2, "minutes": 20, "difficulty": "media", "tags": ["japonés", "salado", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:tamagoyaki:i1", "qty": "4", "unit": "", "text": "huevos"}, {"id": "cfg:recipe:tamagoyaki:i2", "qty": "1", "unit": "cda", "text": "azúcar"}, {"id": "cfg:recipe:tamagoyaki:i3", "qty": "1", "unit": "cda", "text": "salsa de soya"}, {"id": "cfg:recipe:tamagoyaki:i4", "qty": "1", "unit": "cdta", "text": "aceite"}], "steps": [{"id": "cfg:recipe:tamagoyaki:s1", "text": "Batir los huevos con el azúcar y la soya sin hacer espuma", "timerSec": 0}, {"id": "cfg:recipe:tamagoyaki:s2", "text": "Engrasar la sartén a fuego medio bajo y verter una capa delgada", "timerSec": 0}, {"id": "cfg:recipe:tamagoyaki:s3", "text": "Cuando cuaje por abajo, enrollar hacia un lado", "timerSec": 60}, {"id": "cfg:recipe:tamagoyaki:s4", "text": "Agregar otra capa, levantar el rollo para que pase por debajo y volver a enrollar", "timerSec": 0}, {"id": "cfg:recipe:tamagoyaki:s5", "text": "Repetir hasta terminar la mezcla y dejar reposar antes de cortar", "timerSec": 120}], "cooked": []}, {"id": "cfg:recipe:pasta", "name": "Pasta en salsa de tomate y albahaca", "servings": 2, "minutes": 25, "difficulty": "facil", "tags": ["salado", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:pasta:i1", "qty": "200", "unit": "g", "text": "pasta"}, {"id": "cfg:recipe:pasta:i2", "qty": "4", "unit": "", "text": "tomates maduros"}, {"id": "cfg:recipe:pasta:i3", "qty": "2", "unit": "dientes", "text": "ajo"}, {"id": "cfg:recipe:pasta:i4", "qty": "1", "unit": "cda", "text": "aceite de oliva"}, {"id": "cfg:recipe:pasta:i5", "qty": "", "unit": "", "text": "Albahaca fresca"}, {"id": "cfg:recipe:pasta:i6", "qty": "", "unit": "", "text": "Queso parmesano al gusto"}, {"id": "cfg:recipe:pasta:i7", "qty": "", "unit": "", "text": "Sal al gusto"}], "steps": [{"id": "cfg:recipe:pasta:s1", "text": "Poner a hervir agua con sal", "timerSec": 0}, {"id": "cfg:recipe:pasta:s2", "text": "Cocinar la pasta según el paquete", "timerSec": 600}, {"id": "cfg:recipe:pasta:s3", "text": "Sofreír el ajo picado en el aceite sin dorarlo", "timerSec": 60}, {"id": "cfg:recipe:pasta:s4", "text": "Agregar los tomates picados y cocinar", "timerSec": 600}, {"id": "cfg:recipe:pasta:s5", "text": "Mezclar la pasta con la salsa y la albahaca", "timerSec": 0}, {"id": "cfg:recipe:pasta:s6", "text": "Servir con queso por encima", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:arepas", "name": "Arepas rellenas de queso", "servings": 2, "minutes": 30, "difficulty": "facil", "tags": ["salado"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:arepas:i1", "qty": "1", "unit": "taza", "text": "harina de maíz precocida"}, {"id": "cfg:recipe:arepas:i2", "qty": "1", "unit": "taza", "text": "agua tibia"}, {"id": "cfg:recipe:arepas:i3", "qty": "1", "unit": "taza", "text": "queso rallado"}, {"id": "cfg:recipe:arepas:i4", "qty": "", "unit": "", "text": "Sal al gusto"}, {"id": "cfg:recipe:arepas:i5", "qty": "1", "unit": "cda", "text": "mantequilla"}], "steps": [{"id": "cfg:recipe:arepas:s1", "text": "Mezclar la harina, el agua y la sal hasta tener una masa suave", "timerSec": 0}, {"id": "cfg:recipe:arepas:s2", "text": "Dejar reposar la masa", "timerSec": 300}, {"id": "cfg:recipe:arepas:s3", "text": "Formar bolitas, poner queso en el centro y aplanar", "timerSec": 0}, {"id": "cfg:recipe:arepas:s4", "text": "Asar en sartén con mantequilla por cada lado a fuego medio", "timerSec": 420}], "cooked": []}, {"id": "cfg:recipe:pollo-teriyaki", "name": "Pollo teriyaki con arroz", "servings": 2, "minutes": 35, "difficulty": "media", "tags": ["japonés", "salado", "especial"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:pollo-teriyaki:i1", "qty": "2", "unit": "", "text": "pechugas de pollo"}, {"id": "cfg:recipe:pollo-teriyaki:i2", "qty": "3", "unit": "cdas", "text": "salsa de soya"}, {"id": "cfg:recipe:pollo-teriyaki:i3", "qty": "2", "unit": "cdas", "text": "miel"}, {"id": "cfg:recipe:pollo-teriyaki:i4", "qty": "1", "unit": "cdta", "text": "jengibre rallado"}, {"id": "cfg:recipe:pollo-teriyaki:i5", "qty": "1", "unit": "diente", "text": "ajo"}, {"id": "cfg:recipe:pollo-teriyaki:i6", "qty": "1", "unit": "taza", "text": "arroz"}, {"id": "cfg:recipe:pollo-teriyaki:i7", "qty": "", "unit": "", "text": "Ajonjolí al gusto"}], "steps": [{"id": "cfg:recipe:pollo-teriyaki:s1", "text": "Cocinar el arroz", "timerSec": 1200}, {"id": "cfg:recipe:pollo-teriyaki:s2", "text": "Cortar el pollo en tiras", "timerSec": 0}, {"id": "cfg:recipe:pollo-teriyaki:s3", "text": "Mezclar soya, miel, jengibre y ajo", "timerSec": 0}, {"id": "cfg:recipe:pollo-teriyaki:s4", "text": "Dorar el pollo en la sartén", "timerSec": 420}, {"id": "cfg:recipe:pollo-teriyaki:s5", "text": "Agregar la salsa y cocinar hasta que espese", "timerSec": 240}, {"id": "cfg:recipe:pollo-teriyaki:s6", "text": "Servir sobre el arroz con ajonjolí", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:ramen-casero", "name": "Ramen casero rápido", "servings": 2, "minutes": 25, "difficulty": "facil", "tags": ["japonés", "salado", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:ramen-casero:i1", "qty": "2", "unit": "paquetes", "text": "fideos para ramen"}, {"id": "cfg:recipe:ramen-casero:i2", "qty": "1", "unit": "l", "text": "caldo de pollo o de verduras"}, {"id": "cfg:recipe:ramen-casero:i3", "qty": "2", "unit": "", "text": "huevos"}, {"id": "cfg:recipe:ramen-casero:i4", "qty": "1", "unit": "cda", "text": "salsa de soya"}, {"id": "cfg:recipe:ramen-casero:i5", "qty": "", "unit": "", "text": "Cebollín al gusto"}, {"id": "cfg:recipe:ramen-casero:i6", "qty": "1", "unit": "taza", "text": "espinaca o repollo"}], "steps": [{"id": "cfg:recipe:ramen-casero:s1", "text": "Cocinar los huevos en agua hirviendo", "timerSec": 420}, {"id": "cfg:recipe:ramen-casero:s2", "text": "Pasar los huevos a agua fría y pelarlos", "timerSec": 0}, {"id": "cfg:recipe:ramen-casero:s3", "text": "Calentar el caldo con la soya", "timerSec": 300}, {"id": "cfg:recipe:ramen-casero:s4", "text": "Agregar los fideos y las verduras", "timerSec": 180}, {"id": "cfg:recipe:ramen-casero:s5", "text": "Servir con medio huevo y cebollín", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:ensalada", "name": "Ensalada fresca con aguacate", "servings": 2, "minutes": 15, "difficulty": "facil", "tags": ["salado", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:ensalada:i1", "qty": "1", "unit": "", "text": "lechuga"}, {"id": "cfg:recipe:ensalada:i2", "qty": "1", "unit": "", "text": "aguacate"}, {"id": "cfg:recipe:ensalada:i3", "qty": "1", "unit": "", "text": "tomate"}, {"id": "cfg:recipe:ensalada:i4", "qty": "1", "unit": "", "text": "pepino"}, {"id": "cfg:recipe:ensalada:i5", "qty": "1", "unit": "", "text": "limón"}, {"id": "cfg:recipe:ensalada:i6", "qty": "1", "unit": "cda", "text": "aceite de oliva"}, {"id": "cfg:recipe:ensalada:i7", "qty": "", "unit": "", "text": "Sal al gusto"}], "steps": [{"id": "cfg:recipe:ensalada:s1", "text": "Lavar y secar las verduras", "timerSec": 0}, {"id": "cfg:recipe:ensalada:s2", "text": "Cortar todo en trozos", "timerSec": 0}, {"id": "cfg:recipe:ensalada:s3", "text": "Mezclar limón, aceite y sal", "timerSec": 0}, {"id": "cfg:recipe:ensalada:s4", "text": "Aliñar justo antes de servir", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:pancakes", "name": "Pancakes de banano", "servings": 2, "minutes": 20, "difficulty": "facil", "tags": ["dulce", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:pancakes:i1", "qty": "1", "unit": "", "text": "banano maduro"}, {"id": "cfg:recipe:pancakes:i2", "qty": "2", "unit": "", "text": "huevos"}, {"id": "cfg:recipe:pancakes:i3", "qty": "1/2", "unit": "taza", "text": "harina"}, {"id": "cfg:recipe:pancakes:i4", "qty": "1/2", "unit": "taza", "text": "leche"}, {"id": "cfg:recipe:pancakes:i5", "qty": "1", "unit": "cdta", "text": "polvo de hornear"}, {"id": "cfg:recipe:pancakes:i6", "qty": "", "unit": "", "text": "Miel o arequipe al gusto"}], "steps": [{"id": "cfg:recipe:pancakes:s1", "text": "Aplastar el banano y mezclar con los huevos", "timerSec": 0}, {"id": "cfg:recipe:pancakes:s2", "text": "Agregar la harina, la leche y el polvo de hornear", "timerSec": 0}, {"id": "cfg:recipe:pancakes:s3", "text": "Cocinar porciones pequeñas en sartén a fuego bajo", "timerSec": 120}, {"id": "cfg:recipe:pancakes:s4", "text": "Voltear cuando salgan burbujas", "timerSec": 60}, {"id": "cfg:recipe:pancakes:s5", "text": "Servir con miel o arequipe", "timerSec": 0}], "cooked": []}, {"id": "cfg:recipe:fresas-crema", "name": "Postre de fresas con crema", "servings": 2, "minutes": 15, "difficulty": "facil", "tags": ["dulce", "rápido", "especial"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:fresas-crema:i1", "qty": "1", "unit": "taza", "text": "fresas"}, {"id": "cfg:recipe:fresas-crema:i2", "qty": "1/2", "unit": "taza", "text": "crema de leche"}, {"id": "cfg:recipe:fresas-crema:i3", "qty": "2", "unit": "cdas", "text": "azúcar"}, {"id": "cfg:recipe:fresas-crema:i4", "qty": "4", "unit": "", "text": "galletas"}], "steps": [{"id": "cfg:recipe:fresas-crema:s1", "text": "Lavar y cortar las fresas", "timerSec": 0}, {"id": "cfg:recipe:fresas-crema:s2", "text": "Batir la crema con el azúcar hasta que espese", "timerSec": 0}, {"id": "cfg:recipe:fresas-crema:s3", "text": "Armar en vasos: galleta triturada, crema y fresas", "timerSec": 0}, {"id": "cfg:recipe:fresas-crema:s4", "text": "Refrigerar antes de servir", "timerSec": 900}], "cooked": []}, {"id": "cfg:recipe:chocolate", "name": "Chocolate caliente con queso", "servings": 2, "minutes": 15, "difficulty": "facil", "tags": ["dulce", "rápido"], "bestCook": "both", "verify": true, "ingredients": [{"id": "cfg:recipe:chocolate:i1", "qty": "2", "unit": "tazas", "text": "leche"}, {"id": "cfg:recipe:chocolate:i2", "qty": "2", "unit": "pastillas", "text": "chocolate de mesa"}, {"id": "cfg:recipe:chocolate:i3", "qty": "", "unit": "", "text": "Queso campesino al gusto"}], "steps": [{"id": "cfg:recipe:chocolate:s1", "text": "Calentar la leche con el chocolate", "timerSec": 300}, {"id": "cfg:recipe:chocolate:s2", "text": "Batir hasta que haga espuma", "timerSec": 0}, {"id": "cfg:recipe:chocolate:s3", "text": "Servir con trocitos de queso", "timerSec": 0}], "cooked": []}],
  // Bebidas sugeridas para el menú en casa; las de alcohol solo salen si lo activan.
  drinkIdeas: [{"id": "cfg:drink:limonada", "name": "Limonada de coco", "alcohol": false}, {"id": "cfg:drink:te", "name": "Té verde frío con miel", "alcohol": false}, {"id": "cfg:drink:aromatica", "name": "Aromática de frutos rojos", "alcohol": false}, {"id": "cfg:drink:soda", "name": "Soda con fresa y menta", "alcohol": false}, {"id": "cfg:drink:chocolate", "name": "Chocolate caliente", "alcohol": false}, {"id": "cfg:drink:vino", "name": "Copa de vino tinto", "alcohol": true}, {"id": "cfg:drink:sake", "name": "Sake", "alcohol": true}, {"id": "cfg:drink:sangria", "name": "Sangría", "alcohol": true}],
  dateMenuIdeas: [], // Fase 4B
  // Palabra del día (Fase 5B): palabras japonesas básicas, en js/config-japones.js.
  japaneseWords: JAPANESE_WORDS,
  // Juegos en pareja (Fase 5): ajustes iniciales y bancos editables, en js/config-juegos.js.
  games: GAMES,
  // Rincón privado (Fase 6): solo configuración. El contenido NUNCA va aquí ni en el repositorio:
  // se carga dentro del Rincón desde un archivo propio y queda cifrado.
  vault: {
    levels: [
      { n: 0, label: 'Calma', hint: 'Cariño, conversación y mimos.' },
      { n: 1, label: 'Coqueteo', hint: 'Miradas, juego y piropos.' },
      { n: 2, label: 'Sensual', hint: 'Cercanía, caricias y susurros.' },
      { n: 3, label: 'Atrevido', hint: 'Más confianza y más juego.' },
      { n: 4, label: 'Picante', hint: 'Muy subido de tono en intención, sin ser explícito.' },
      { n: 5, label: 'Contenido propio', hint: 'Solo lo que ustedes carguen.' },
    ],
    // Temas que cada uno puede marcar como límite (se suman a las etiquetas del contenido cargado).
    limitTags: [
      { id: 'besos', label: 'Besos' }, { id: 'masajes', label: 'Masajes' }, { id: 'cosquillas', label: 'Cosquillas' },
      { id: 'ropa', label: 'Ropa y prendas' }, { id: 'vendas', label: 'Ojos vendados' }, { id: 'frio-calor', label: 'Frío y calor' },
      { id: 'comida', label: 'Comida y sabores' }, { id: 'bebida', label: 'Bebida con alcohol' }, { id: 'baile', label: 'Bailar' },
      { id: 'rol', label: 'Juego de roles' }, { id: 'susurros', label: 'Hablar al oído' }, { id: 'fuera', label: 'Fuera de la habitación' },
      { id: 'fotos', label: 'Fotos o grabaciones' }, { id: 'pasado', label: 'Temas del pasado' },
    ],
  },

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

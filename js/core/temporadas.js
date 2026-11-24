// Temporadas (v0.16.0, chosen 2026-11-24): the 24 solar terms (节气 / 二十四節気), born in China and
// kept in Japan, so they belong to both styles. Each lasts about 15 days; Inicio shows the current one
// with a short line and an idea to do together, in person. Plus the lunar calendar, for the festivals
// that move every year (Año Nuevo chino, Qixi, Medio Otoño, Tsukimi).
// Dates are the usual start day of each term (it can move one day some years: close enough for a card).

/** [month, day, name, line, [two plans]] in calendar order. */
export const SEKKI = [
  [1, 5, 'Frío menor', 'Empieza lo más frío del año. Buen momento para quedarse cerca.', ['Hacer una sopa juntos y comerla con calma', 'Armar un fuerte de cobijas y ver una película']],
  [1, 20, 'Frío mayor', 'El frío llega a su punto más hondo y, detrás, ya viene la primavera.', ['Tomar algo caliente y planear el año', 'Escribirse un deseo para la primavera']],
  [2, 4, 'Comienza la primavera', 'En el calendario antiguo aquí empieza el año nuevo.', ['Limpiar juntos un rincón de la casa para estrenarlo', 'Comprar una planta o unas semillas y sembrarlas']],
  [2, 19, 'Agua de lluvia', 'La nieve se vuelve lluvia y la tierra se despierta.', ['Caminar bajo la lluvia con un solo paraguas', 'Escuchar la lluvia con un té y sin pantallas']],
  [3, 5, 'Despiertan los insectos', 'Con los primeros truenos, todo lo dormido se mueve otra vez.', ['Salir a un parque y buscar cosas que estén naciendo', 'Probar juntos algo que nunca han hecho']],
  [3, 20, 'Equinoccio de primavera', 'El día y la noche duran lo mismo: un equilibrio, como el de ustedes.', ['Ver el atardecer y contarse cómo va el año', 'Cocinar algo con flores o frutas de temporada']],
  [4, 4, 'Claridad pura', 'El aire se aclara y todo se ve más nítido. Es tiempo de recordar.', ['Mirar fotos viejas juntos y elegir la favorita', 'Visitar o llamar a alguien que quieren mucho']],
  [4, 20, 'Lluvia de los granos', 'La última lluvia de primavera alimenta lo que se sembró.', ['Regar juntos las plantas y ver cuánto crecieron', 'Hacer un picnic corto entre dos lluvias']],
  [5, 5, 'Comienza el verano', 'Los días se alargan y apetece estar afuera.', ['Salir a caminar después de la cena', 'Tomarse un helado en un lugar nuevo']],
  [5, 21, 'Los granos se llenan', 'Lo que se sembró empieza a llenarse, sin estar maduro todavía.', ['Contarse algo que esté creciendo en cada uno', 'Preparar juntos un desayuno largo']],
  [6, 5, 'Grano en espiga', 'Tiempo de sembrar lo nuevo y cuidar lo que ya está.', ['Elegir un plan para el próximo mes y anotarlo', 'Aprender juntos una receta nueva']],
  [6, 21, 'Solsticio de verano', 'El día más largo del año: hay luz de sobra para los dos.', ['Ver el amanecer o el atardecer juntos', 'Hacer una caminata larga sin mirar el reloj']],
  [7, 7, 'Calor menor', 'Llega el calor y todo va más despacio.', ['Preparar una limonada y sentarse a la sombra', 'Ir a un lugar con agua: un río, una piscina o una fuente']],
  [7, 22, 'Calor mayor', 'El punto más caliente del año. Mejor sin afán.', ['Tarde de juegos de mesa en casa', 'Comer fruta fría y contarse chismes buenos']],
  [8, 7, 'Comienza el otoño', 'Aún hace calor, pero las tardes ya traen otro aire.', ['Escribirse una carta corta para leer en otoño', 'Ordenar juntos las fotos del verano']],
  [8, 23, 'Se va el calor', 'El calor se retira y el aire se vuelve amable.', ['Salir a caminar al caer la tarde', 'Cocinar algo al horno por primera vez']],
  [9, 7, 'Rocío blanco', 'Las noches refrescan y aparece el rocío en la hierba.', ['Mirar la luna un rato antes de dormir', 'Tomar un té caliente y hablar de sueños']],
  [9, 22, 'Equinoccio de otoño', 'Otra vez el día y la noche se igualan. Tiempo de agradecer.', ['Decirse tres cosas que agradecen del otro', 'Cocinar una cena de cosecha con lo de temporada']],
  [10, 8, 'Rocío frío', 'El rocío se enfría y los colores empiezan a cambiar.', ['Buscar hojas de colores y guardar la más bonita', 'Ver una película de otoño con cobija']],
  [10, 23, 'Desciende la escarcha', 'Las primeras heladas: el año se prepara para descansar.', ['Hacer chocolate caliente y jugar cartas', 'Planear juntos las fiestas de fin de año']],
  [11, 7, 'Comienza el invierno', 'Llega el invierno: tiempo de abrigo, caldos y conversación.', ['Preparar un caldo o una sopa casera juntos', 'Elegir una serie para verla de a poco los dos']],
  [11, 22, 'Nieve menor', 'Caen las primeras nieves, todavía tímidas.', ['Hacer galletas y regalarle unas a alguien', 'Tejer, dibujar o armar algo a mano juntos']],
  [12, 7, 'Nieve mayor', 'La nieve cubre todo y el mundo se vuelve silencioso.', ['Salir a ver luces de noche', 'Escribirse lo mejor que les pasó este año']],
  [12, 21, 'Solsticio de invierno', 'La noche más larga del año; desde mañana, la luz vuelve a crecer.', ['Prender una vela y contarse un deseo', 'Cenar algo especial en casa, sin pantallas']],
];

const DAY = 864e5;
const at = (y, i) => { const k = ((i % 24) + 24) % 24; return new Date(y + Math.floor(i / 24), SEKKI[k][0] - 1, SEKKI[k][1]); };

/**
 * The solar term for a date: { index, name, line, plans, from: Date, to: Date (last day) }.
 * In the southern hemisphere the year is turned around (12 terms ahead), like the falling leaves.
 */
export function sekkiOn(date = new Date(), hemisphere = 'norte') {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const y = day.getFullYear();
  let i = 23; // before Jan 5 it is still last year's winter solstice
  for (let k = 0; k < 24; k++) if (day >= at(y, k)) i = k;
  const startY = i === 23 && day < at(y, 0) ? y - 1 : y;
  const from = at(startY, i);
  const to = new Date(at(startY, i + 1).getTime() - DAY);
  const shown = hemisphere === 'sur' ? (i + 12) % 24 : i;
  const [, , name, line, plans] = SEKKI[shown];
  return { index: shown, name, line, plans, from, to };
}

// ---------- lunar calendar (Intl's Chinese calendar, available in Chrome and Edge) ----------
let fmt = null;
/** { month, day, leap } in the Chinese lunar calendar, or null if the browser can't tell. */
export function lunarDate(date) {
  try {
    fmt ||= new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
    const parts = fmt.formatToParts(utc);
    const m = parts.find((p) => p.type === 'month')?.value || '';
    const d = parts.find((p) => p.type === 'day')?.value || '';
    const month = parseInt(m, 10); const day = parseInt(d, 10);
    if (!month || !day) return null;
    return { month, day, leap: /\D/.test(m) };
  } catch { return null; }
}

// Intl's Chinese calendar is a day off some years (2027 and 2030 New Year), so the festivals use
// checked dates (month-day) and fall back to Intl only after 2037.
const FESTIVAL_DAYS = {
  cny: { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08', 2036: '01-28', 2037: '02-15' },
  qixi: { 2026: '08-19', 2027: '08-08', 2028: '08-26', 2029: '08-16', 2030: '08-05', 2031: '08-24', 2032: '08-12', 2033: '08-01', 2034: '08-20', 2035: '08-10', 2036: '08-28', 2037: '08-17' },
  luna: { 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19', 2033: '09-08', 2034: '09-27', 2035: '09-16', 2036: '10-04', 2037: '09-24' },
};
const LUNAR_OF = { cny: [1, 1], qixi: [7, 7], luna: [8, 15] };

/** Gregorian date of a lunar festival in a year: 'cny' (Año Nuevo), 'faroles' (15 days later), 'qixi', 'luna' (Medio Otoño / Tsukimi). */
export function festivalDate(key, year) {
  if (key === 'faroles') { const d = festivalDate('cny', year); return d && new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14); }
  const known = FESTIVAL_DAYS[key]?.[year];
  if (known) { const [m, d] = known.split('-').map(Number); return new Date(year, m - 1, d); }
  const [M, D] = LUNAR_OF[key] || [];
  if (!M) return null;
  for (let i = 0; i < 366; i++) {
    const day = new Date(year, 0, 1 + i);
    const l = lunarDate(day);
    if (l && !l.leap && l.month === M && l.day === D) return day;
  }
  return null;
}

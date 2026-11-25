// Profile photo (v0.26.0): optional, one per person. Shown in the header instead of the initial.
// Scaled down to a small JPEG on the device and saved as its own profile record ("avatar:<id>"),
// so it travels encrypted to the other devices like the rest of the profile.
import { ui, util, profile } from '../core.js';
import { compressImage } from '../core/images.js';

const { el, icon } = util;
const SIDE = 320;

const toDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Square-ish small JPEG from any image file. */
export async function photoFromFile(file) {
  const { blob } = await compressImage(file, { max: SIDE, quality: 0.82 });
  return toDataURL(blob);
}

/** Round preview + "Elegir foto" + "Quitar". `id` is the person; only their own device should offer it. */
export function photoPicker(id, { onChange } = {}) {
  const inputId = `avatar-file-${id}-${util.uuid().slice(0, 6)}`;
  const preview = el('span', { class: 'avatar-preview', 'aria-hidden': 'true' });
  const status = el('p', { class: 'muted small', 'aria-live': 'polite' });
  const file = el('input', { type: 'file', accept: 'image/*', class: 'sr-only', id: inputId });
  const pick = el('label', { class: 'btn btn-secondary btn-small', for: inputId }, icon('camera', { size: 18 }), el('span', {}, 'Elegir foto'));
  const remove = ui.button({ label: 'Quitar', iconName: 'trash-2', variant: 'ghost', small: true, onClick: async () => {
    await profile.setPhoto(id, '');
    status.textContent = 'Foto quitada: arriba vuelve a salir tu inicial.';
    draw(); onChange?.('');
  } });
  const draw = () => {
    const pic = profile.photo(id);
    if (pic) preview.replaceChildren(el('img', { src: pic, alt: '' }));
    else preview.textContent = [...profile.name(id)][0] || '?';
    preview.classList.toggle('has-photo', !!pic);
    remove.hidden = !pic;
    pick.querySelector('span').textContent = pic ? 'Cambiar foto' : 'Elegir foto';
  };
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = '';
    if (!f) return;
    status.textContent = 'Preparando la foto…';
    try {
      const data = await photoFromFile(f);
      await profile.setPhoto(id, data);
      status.textContent = 'Listo: tu foto ya se ve arriba.';
      util.haptic?.(10);
      draw(); onChange?.(data);
    } catch (e) {
      status.textContent = e?.code === 'DECODE' ? 'Esa imagen no se pudo abrir. Prueba con otra.' : 'No se pudo guardar la foto. Intenta otra vez.';
    }
  });
  draw();
  return el('div', { class: 'avatar-picker' }, preview,
    el('div', { class: 'stack avatar-picker-side' }, el('div', { class: 'btn-row' }, file, pick, remove), status));
}

// Общие функции интерфейса: уведомления, модальное окно, форматирование.

export const $ = (selector, root = document) => root.querySelector(selector);

/** Экранирование текста, чтобы данные пользователей не ломали разметку. */
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export const money = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";

export const ICONS = { "Спорт": "🚴", "Туризм": "⛺", "Строительство": "🛠️" };

const STATUS = {
  booked: ["Ожидает подтверждения", "warn"],
  confirmed: ["Подтверждено", "info"],
  issued: ["Выдано", "info"],
  returned: ["Возвращено", "ok"],
  overdue: ["Просрочено", "bad"],
  cancelled: ["Отменено", "muted"],
};
export const badge = (status) => `<span class="badge badge--${STATUS[status][1]}">${STATUS[status][0]}</span>`;

let toastTimer;
export function toast(text, isError = false) {
  const box = $("#toast");
  box.textContent = text;
  box.className = `toast show ${isError ? "error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 3000);
}

export function openModal(html) {
  $("#modal-box").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
export function closeModal() { $("#modal").classList.add("hidden"); }

/** Вызывает функцию и показывает ошибку тостом, если запрос не удался. */
export async function safe(fn) {
  try { return await fn(); }
  catch (err) { toast(err.message, true); }
}

/** "2026-11-05" -> "05.11.2026" */
export const fmtDate = (iso) => iso.split("-").reverse().join(".");
/** Date -> "YYYY-MM-DD" по местному времени */
export const isoDate = (d) => d.toLocaleDateString("sv-SE");
/** Последний день, на который можно бронировать (сегодня + 5 лет) */
export const maxBookingDate = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return d; };
/** Число суток аренды, включая оба дня */
export const rentDays = (start, end) => (new Date(end) - new Date(start)) / 86400000 + 1;

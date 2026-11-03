// Каталог оборудования и окно бронирования.
import { api, session } from "../api.js";
import { $, esc, money, toast, openModal, closeModal, safe, ICONS, fmtDate, isoDate, maxBookingDate, rentDays } from "../ui.js";
import { cart } from "../cart.js";
import { openAuth } from "./auth.js";

export async function renderCatalog(view, refreshNav) {
  const categories = await api("categories");
  const filters = { q: "", category_id: "", max_price: "" };

  view.innerHTML = `
    <section class="hero">
      <h1>Прокат оборудования<br>на любой случай</h1>
      <p>Спорт, туризм и строительство. Выбирайте технику и бронируйте её онлайн на нужные даты.</p>
      <form id="search" class="search">
        <input name="q" placeholder="Что ищете? Например, велосипед">
        <select name="category_id">
          <option value="">Все категории</option>
          ${categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
        </select>
        <input name="max_price" type="number" min="1" placeholder="Цена до, ₽/сутки">
        <button class="btn btn--cta">Найти</button>
      </form>
    </section>
    <section class="container">
      <div class="chips" id="chips">
        <button class="chip active" data-id="">Все</button>
        ${categories.map((c) => `<button class="chip" data-id="${c.id}">${ICONS[c.name] || "📦"} ${esc(c.name)}</button>`).join("")}
      </div>
      <div id="list" class="cards"></div>
    </section>`;

  async function loadItems() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    const items = await api(`equipment?${params}`);
    const list = $("#list");

    if (!items.length) {
      list.innerHTML = `<div class="empty">Ничего не найдено. Попробуйте изменить фильтры.</div>`;
      return;
    }
    list.innerHTML = items.map((item) => `
      <article class="card">
        <div class="card__img" ${item.photo ? `style="background-image:url('${esc(item.photo)}')"` : ""}>
          ${item.photo ? "" : ICONS[item.category] || "📦"}
        </div>
        <div class="card__body">
          <span class="muted">${esc(item.category)}</span>
          <div class="card__title">${esc(item.name)}</div>
          <div class="card__price">${money(item.price_per_day)} <small>/ сутки</small></div>
          <span class="muted">В наличии: ${item.available} шт.</span>
          <button class="btn" data-book="${item.id}" ${item.available ? "" : "disabled"}>Забронировать</button>
        </div>
      </article>`).join("");

    list.querySelectorAll("[data-book]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const item = items.find((i) => i.id === Number(btn.dataset.book));
        if (!session.get().token) return openAuth(() => { refreshNav(); openBooking(item); });
        openBooking(item);
      }));
  }

  $("#search").addEventListener("submit", (event) => {
    event.preventDefault();
    Object.assign(filters, Object.fromEntries(new FormData(event.target)));
    safe(loadItems);
  });
  $("#chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#chips .chip").forEach((c) => c.classList.toggle("active", c === chip));
    filters.category_id = chip.dataset.id;
    safe(loadItems);
  });

  await loadItems();
}

/** Окно бронирования с живым расчётом стоимости и проверкой доступности. */
function openBooking(item) {
  const today = isoDate(new Date());
  const max = isoDate(maxBookingDate());
  openModal(`
    <h2>${esc(item.name)}</h2>
    <p class="muted">${money(item.price_per_day)} в сутки. Бронировать можно до ${fmtDate(max)} (не более 5 лет вперёд).</p>
    <form id="book-form" class="form">
      <label>С даты<input type="date" name="start" min="${today}" max="${max}" required></label>
      <label>По дату (включительно)<input type="date" name="end" min="${today}" max="${max}" required></label>
      <label>Количество<input type="number" name="qty" value="1" min="1"></label>
      <div class="info" id="book-info">Выберите даты аренды</div>
      <div class="actions">
        <button type="button" class="btn btn--ghost" id="book-cancel">Отмена</button>
        <button type="button" class="btn btn--cta" id="book-cart" disabled>🛒 В корзину</button>
        <button class="btn" id="book-submit" disabled>Забронировать</button>
      </div>
    </form>`);

  const form = $("#book-form");
  const info = $("#book-info");
  const buttons = [$("#book-submit"), $("#book-cart")];
  const read = () => {
    const { start, end, qty } = Object.fromEntries(new FormData(form));
    return { start, end, qty: Number(qty) };
  };
  $("#book-cancel").addEventListener("click", closeModal);

  async function recalc() {
    const { start, end, qty } = read();
    buttons.forEach((b) => (b.disabled = true));
    if (!start || !end) return;
    if (end < start) { info.textContent = "Дата окончания раньше даты начала"; return; }
    if (end > max) { info.textContent = `Максимальная дата — ${fmtDate(max)}`; return; }

    try {
      const { available } = await api(`equipment/${item.id}/availability?start=${start}&end=${end}`);
      const days = rentDays(start, end);
      if (available < qty) {
        info.textContent = `На эти даты свободно только ${available} шт.`;
      } else {
        info.innerHTML = `Суток: <b>${days}</b> · Свободно: <b>${available}</b><br>Итого: <b>${money(days * qty * item.price_per_day)}</b>`;
        buttons.forEach((b) => (b.disabled = false));
      }
    } catch (err) { info.textContent = err.message; }
  }
  form.addEventListener("input", recalc);

  // Добавить в корзину (бронь создаётся позже, при оформлении)
  $("#book-cart").addEventListener("click", () => {
    cart.add({ equipment_id: item.id, name: item.name, price: item.price_per_day, ...read() });
    closeModal();
    toast("Добавлено в корзину");
  });

  // Забронировать сразу, минуя корзину
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    safe(async () => {
      const booking = await api("bookings", "POST", { equipment_id: item.id, ...read() });
      closeModal();
      toast(`Бронь №${booking.id} создана. Сумма: ${money(booking.total)}`);
    });
  });
}

// Страница корзины: список позиций, итог и оформление всех броней сразу.
import { api, session } from "../api.js";
import { cart } from "../cart.js";
import { esc, money, fmtDate, rentDays, safe, toast } from "../ui.js";
import { openAuth } from "./auth.js";

export async function renderCart(view) {
  const items = cart.items();

  if (!items.length) {
    view.innerHTML = `
      <div class="container">
        <h2>Корзина</h2>
        <div class="panel empty">Корзина пуста.<br><br><a href="#catalog" class="btn">Перейти в каталог</a></div>
      </div>`;
    return;
  }

  const total = items.reduce((sum, i) => sum + rentDays(i.start, i.end) * i.qty * i.price, 0);

  view.innerHTML = `
    <div class="container container--wide">
      <h2>Корзина</h2>
      <div class="panel">
        <table class="table--stack">
          <thead><tr><th>Оборудование</th><th>Даты аренды</th><th>Суток</th><th>Кол-во</th><th>Цена/сут.</th><th>Сумма</th><th></th></tr></thead>
          <tbody>${items.map((i, index) => `<tr>
            <td data-label="Оборудование">${esc(i.name)}</td>
            <td data-label="Даты аренды">${fmtDate(i.start)} – ${fmtDate(i.end)}</td>
            <td data-label="Суток">${rentDays(i.start, i.end)}</td>
            <td data-label="Кол-во">${i.qty}</td>
            <td data-label="Цена/сут.">${money(i.price)}</td>
            <td data-label="Сумма"><b>${money(rentDays(i.start, i.end) * i.qty * i.price)}</b></td>
            <td class="td-actions"><button class="btn btn--small btn--danger" data-remove="${index}">Удалить</button></td>
          </tr>`).join("")}</tbody>
        </table>
        <div class="cart-total">
          <span>Итого: <b>${money(total)}</b></span>
          <span class="actions">
            <button class="btn btn--ghost" id="cart-clear">Очистить</button>
            <button class="btn btn--cta" id="cart-checkout">Оформить бронь</button>
          </span>
        </div>
      </div>
    </div>`;

  view.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", () => { cart.remove(Number(btn.dataset.remove)); renderCart(view); }));
  view.querySelector("#cart-clear").addEventListener("click", () => { cart.clear(); renderCart(view); });

  const send = () => safe(async () => {
    const payload = cart.items().map(({ equipment_id, start, end, qty }) => ({ equipment_id, start, end, qty }));
    await api("bookings/batch", "POST", { items: payload });
    cart.clear();
    toast("Все брони оформлены!");
    location.hash = "#my";
  });
  view.querySelector("#cart-checkout").addEventListener("click", () => {
    if (session.get().token) return send();
    openAuth(() => { window.dispatchEvent(new Event("session-changed")); send(); });
  });
}

// Личный кабинет клиента и рабочее место менеджера.
import { api } from "../api.js";
import { esc, money, badge, safe, toast, fmtDate } from "../ui.js";

function table(bookings, { showUser, actions }) {
  if (!bookings.length) return `<div class="empty">Бронирований пока нет</div>`;
  const cell = (label, value) => `<td data-label="${label}">${value}</td>`;
  return `
    <table class="table--stack">
      <thead><tr>
        <th>№</th>${showUser ? "<th>Клиент</th>" : ""}<th>Оборудование</th><th>Кол-во</th>
        <th>Даты аренды</th><th>Статус</th><th>Сумма</th><th>Штраф</th><th>Состояние</th><th></th>
      </tr></thead>
      <tbody>${bookings.map((b) => `<tr>
          ${cell("№", b.id)}
          ${showUser ? cell("Клиент", esc(b.user_name)) : ""}
          ${cell("Оборудование", esc(b.equipment_name))}
          ${cell("Кол-во", b.qty)}
          ${cell("Даты аренды", `${fmtDate(b.start)} – ${fmtDate(b.end)}`)}
          ${cell("Статус", badge(b.status))}
          ${cell("Сумма", money(b.total))}
          ${cell("Штраф", b.fine ? money(b.fine) : "—")}
          ${cell("Состояние", esc(b.condition) || "—")}
          <td class="td-actions">${actions(b)}</td>
        </tr>`).join("")}</tbody>
    </table>`;
}

/** Кнопка с data-атрибутами, обработчики навешиваются в bind(). */
const button = (label, action, id, ghost = false) =>
  `<button class="btn btn--small ${ghost ? "btn--ghost" : ""}" data-action="${action}" data-id="${id}">${label}</button>`;

function bind(view, handlers) {
  view.querySelectorAll("[data-action]").forEach((btn) =>
    btn.addEventListener("click", () => safe(() => handlers[btn.dataset.action](btn.dataset.id))));
}

export async function renderMyBookings(view) {
  const render = async () => {
    const bookings = await api("bookings/my");
    view.innerHTML = `
      <div class="container container--wide">
        <h2>Мои аренды</h2>
        <div class="panel">${table(bookings, {
          actions: (b) => ["booked", "confirmed"].includes(b.status) ? button("Отменить", "cancel", b.id, true) : "",
        })}</div>
      </div>`;
    bind(view, {
      cancel: async (id) => { await api(`bookings/${id}/cancel`, "POST"); toast("Бронь отменена"); render(); },
    });
  };
  await render();
}

export async function renderManager(view) {
  const render = async () => {
    const bookings = await api("manager/bookings");
    view.innerHTML = `
      <div class="container container--wide">
        <h2>Рабочее место менеджера</h2>
        <div class="panel">${table(bookings, {
          showUser: true,
          actions: (b) => ({
            booked: button("Подтвердить", "confirm", b.id),
            confirmed: button("Выдать", "issue", b.id),
            issued: button("Принять", "return", b.id),
            overdue: button("Принять", "return", b.id),
          }[b.status] || ""),
        })}</div>
      </div>`;

    const step = (name, message) => async (id) => { await api(`manager/bookings/${id}/${name}`, "POST"); toast(message); render(); };
    bind(view, {
      confirm: step("confirm", "Бронь подтверждена"),
      issue: step("issue", "Оборудование выдано"),
      return: async (id) => {
        const condition = prompt("Состояние оборудования при возврате:", "Исправно");
        if (condition === null) return;
        const damage_fee = Number(prompt("Штраф за повреждение, ₽ (0 — нет):", "0")) || 0;
        const result = await api(`manager/bookings/${id}/return`, "POST", { condition, damage_fee });
        toast(result.fine ? `Принято. Штраф: ${money(result.fine)}` : "Принято без штрафа");
        render();
      },
    });
  };
  await render();
}

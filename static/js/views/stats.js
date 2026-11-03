// Страница статистики с графиками.
import { api } from "../api.js";
import { esc, money } from "../ui.js";

const STATUS_NAMES = { booked: "Ожидают", confirmed: "Подтверждены", issued: "Выданы", returned: "Возвращены", overdue: "Просрочены" };

function barChart(title, data, format = money) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const rows = entries.map(([label, value]) => `
    <div class="bar-row">
      <span>${esc(STATUS_NAMES[label] || label)}</span>
      <div class="bar" style="width:${Math.max(3, (value / max) * 100)}%"></div>
      <b>${format(value)}</b>
    </div>`).join("");
  return `<div class="panel"><h3>${title}</h3>${rows || '<div class="empty">Данных пока нет</div>'}</div>`;
}

export async function renderStats(view) {
  const stats = await api("admin/stats");
  const revenue = Object.values(stats.revenue_by_month).reduce((a, b) => a + b, 0);
  const count = Object.values(stats.by_status).reduce((a, b) => a + b, 0);
  const overdue = stats.by_status.overdue || 0;

  view.innerHTML = `
    <div class="container">
      <h2>Статистика</h2>
      <div class="kpis">
        <div class="kpi"><b>${money(revenue)}</b>общая выручка (с учётом штрафов)</div>
        <div class="kpi"><b>${count}</b>всего бронирований</div>
        <div class="kpi"><b>${overdue}</b>просроченных аренд</div>
      </div>
      ${barChart("Выручка по месяцам", stats.revenue_by_month)}
      ${barChart("Выручка по оборудованию", stats.revenue_by_equipment)}
      ${barChart("Бронирования по статусам", stats.by_status, String)}
    </div>`;
}

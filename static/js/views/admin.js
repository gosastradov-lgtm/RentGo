// Панель администратора: склад, каталог, пользователи.
import { api, uploadPhoto } from "../api.js";
import { $, esc, money, safe, toast } from "../ui.js";

export async function renderAdmin(view) {
  const [items, categories, users] = await Promise.all([api("equipment"), api("categories"), api("admin/users")]);
  const categoryOptions = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");

  view.innerHTML = `
    <div class="container">
      <h2>Панель администратора</h2>

      <div class="panel">
        <h3>Склад и тарифы</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Фото</th><th>Название</th><th>Категория</th><th>Цена/сут.</th><th>Всего</th><th>В ремонте</th><th>Списано</th><th>Склад</th><th>Фото</th></tr></thead>
          <tbody>${items.map((e) => `
            <tr data-id="${e.id}">
              <td>${e.photo ? `<img class="thumb" src="${esc(e.photo)}" alt="">` : '<span class="thumb thumb--empty">📦</span>'}</td>
              <td>${esc(e.name)}</td><td>${esc(e.category)}</td><td>${money(e.price_per_day)}</td>
              <td><input name="qty_total" type="number" min="0" value="${e.qty_total}"></td>
              <td><input name="qty_repair" type="number" min="0" value="${e.qty_repair}"></td>
              <td><input name="qty_written_off" type="number" min="0" value="${e.qty_written_off}"></td>
              <td><button class="btn btn--small" data-save="${e.id}">Сохранить</button></td>
              <td class="photo-actions">
                <label class="btn btn--small btn--cta">${e.photo ? "Заменить" : "Загрузить"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-photo="${e.id}">
                </label>
                ${e.photo ? `<button class="btn btn--small btn--ghost" data-remove-photo="${e.id}">Убрать</button>` : ""}
              </td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>

      <div class="panel">
        <h3>Добавить оборудование</h3>
        <form id="add-form" class="row">
          <label>Название<input name="name" required minlength="2"></label>
          <label>Категория<select name="category_id">${categoryOptions}</select></label>
          <label>Цена, ₽/сутки<input name="price_per_day" type="number" min="1" required></label>
          <label>Штраф, ₽/сутки просрочки<input name="late_fee_per_day" type="number" min="0" required></label>
          <label>Количество<input name="qty_total" type="number" min="1" value="1" required></label>
          <label>Ссылка на фото<input name="photo" placeholder="необязательно"></label>
          <button class="btn">Добавить</button>
        </form>
      </div>

      <div class="panel">
        <h3>Категории</h3>
        <form id="cat-form" class="row"><label>Новая категория<input name="name" required></label><button class="btn">Добавить</button></form>
      </div>

      <div class="panel">
        <h3>Пользователи и сотрудники</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Имя</th><th>Email</th><th>Роль</th></tr></thead>
          <tbody>${users.map((u) => `
            <tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td>
              <td><select data-role="${u.id}">
                ${["client", "manager", "admin"].map((r) => `<option ${r === u.role ? "selected" : ""}>${r}</option>`).join("")}
              </select></td></tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>`;

  // Сохранение остатков на складе
  view.querySelectorAll("[data-save]").forEach((btn) =>
    btn.addEventListener("click", () => safe(async () => {
      const row = btn.closest("tr");
      const value = (name) => Number($(`[name=${name}]`, row).value);
      await api(`equipment/${btn.dataset.save}/stock`, "PUT",
        { qty_total: value("qty_total"), qty_repair: value("qty_repair"), qty_written_off: value("qty_written_off") });
      toast("Склад обновлён");
    })));

  // Загрузка фото с компьютера
  view.querySelectorAll("[data-photo]").forEach((input) =>
    input.addEventListener("change", () => safe(async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) throw new Error("Файл больше 3 МБ, выберите поменьше");
      await uploadPhoto(input.dataset.photo, file);
      toast("Фото обновлено");
      renderAdmin(view);
    })));

  // Удаление фото (снова будет показана иконка категории)
  view.querySelectorAll("[data-remove-photo]").forEach((btn) =>
    btn.addEventListener("click", () => safe(async () => {
      await api(`equipment/${btn.dataset.removePhoto}/photo`, "DELETE");
      toast("Фото удалено");
      renderAdmin(view);
    })));

  // Добавление оборудования
  $("#add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const f = Object.fromEntries(new FormData(event.target));
    safe(async () => {
      await api("equipment", "POST", {
        name: f.name, photo: f.photo, category_id: Number(f.category_id), price_per_day: Number(f.price_per_day),
        late_fee_per_day: Number(f.late_fee_per_day), qty_total: Number(f.qty_total),
      });
      toast("Оборудование добавлено");
      renderAdmin(view);
    });
  });

  // Новая категория
  $("#cat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = new FormData(event.target).get("name");
    safe(async () => { await api(`categories?name=${encodeURIComponent(name)}`, "POST"); toast("Категория добавлена"); renderAdmin(view); });
  });

  // Смена роли
  view.querySelectorAll("[data-role]").forEach((select) =>
    select.addEventListener("change", () => safe(async () => {
      await api(`admin/users/${select.dataset.role}/role`, "PUT", { role: select.value });
      toast("Роль изменена");
    })));
}

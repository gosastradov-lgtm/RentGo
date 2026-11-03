// Окно входа и регистрации.
import { api, session } from "../api.js";
import { $, openModal, closeModal, safe, toast } from "../ui.js";

export function openAuth(onSuccess) {
  let mode = "login";

  const render = () => {
    openModal(`
      <h2>${mode === "login" ? "Вход" : "Регистрация"}</h2>
      <div class="tabs">
        <button class="chip ${mode === "login" ? "active" : ""}" data-mode="login">Вход</button>
        <button class="chip ${mode === "register" ? "active" : ""}" data-mode="register">Регистрация</button>
      </div>
      <form id="auth-form" class="form">
        ${mode === "register" ? `<label>Имя<input name="name" required minlength="2"></label>` : ""}
        <label>Email<input name="email" type="email" required></label>
        <label>Пароль<input name="password" type="password" required minlength="6"></label>
        <div class="actions">
          <button type="button" class="btn btn--ghost" id="auth-cancel">Отмена</button>
          <button class="btn">${mode === "login" ? "Войти" : "Создать аккаунт"}</button>
        </div>
      </form>`);

    document.querySelectorAll("[data-mode]").forEach((btn) =>
      btn.addEventListener("click", () => { mode = btn.dataset.mode; render(); }));
    $("#auth-cancel").addEventListener("click", closeModal);

    $("#auth-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.target));
      safe(async () => {
        const result = await api(mode, "POST", data);
        session.set(result);
        closeModal();
        toast(`Добро пожаловать, ${result.name}!`);
        onSuccess();
      });
    });
  };
  render();
}

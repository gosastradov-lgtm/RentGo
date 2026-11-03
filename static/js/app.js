// Точка входа: навигация и маршрутизация по hash (#catalog, #my, ...).
import { session } from "./api.js";
import { $, closeModal, safe } from "./ui.js";
import { openAuth } from "./views/auth.js";
import { renderCatalog } from "./views/catalog.js";
import { renderMyBookings, renderManager } from "./views/bookings.js";
import { renderAdmin } from "./views/admin.js";
import { renderStats } from "./views/stats.js";
import { renderCart } from "./views/cart.js";
import { cart } from "./cart.js";

// Какие роли могут открыть страницу
const ROUTES = {
  catalog: { title: "Каталог", roles: null, render: (v) => renderCatalog(v, renderNav) },
  cart: { title: "Корзина", roles: null, render: renderCart },
  my: { title: "Мои аренды", roles: ["client", "manager", "admin"], render: renderMyBookings },
  manager: { title: "Менеджер", roles: ["manager", "admin"], render: renderManager },
  admin: { title: "Админ", roles: ["admin"], render: renderAdmin },
  stats: { title: "Статистика", roles: ["admin"], render: renderStats },
};

function renderNav() {
  const { role, name } = session.get();
  const current = location.hash.slice(1) || "catalog";

  const label = (key, r) => key === "cart"
    ? `🛒 Корзина${cart.count() ? ` <span class="count">${cart.count()}</span>` : ""}`
    : r.title;

  const links = Object.entries(ROUTES)
    .filter(([, r]) => !r.roles || r.roles.includes(role))
    .map(([key, r]) => `<a href="#${key}" class="${key === current ? "active" : ""}">${label(key, r)}</a>`)
    .join("");

  $("#nav").innerHTML = links + (role
    ? `<a href="#" id="logout">Выйти (${name})</a>`
    : `<a href="#" id="login" class="nav__cta">Войти</a>`);

  $("#logout")?.addEventListener("click", (event) => {
    event.preventDefault();
    session.clear();
    location.hash = "#catalog";
    route();
  });
  $("#login")?.addEventListener("click", (event) => {
    event.preventDefault();
    openAuth(route);
  });
}

async function route() {
  const key = location.hash.slice(1) || "catalog";
  const page = ROUTES[key] || ROUTES.catalog;
  const { role } = session.get();

  if (page.roles && !page.roles.includes(role)) {
    location.hash = "#catalog";
    return;
  }
  renderNav();
  await safe(() => page.render($("#view")));
}

// Закрытие модального окна по клику на фон
$("#modal").addEventListener("click", (event) => { if (event.target.id === "modal") closeModal(); });
window.addEventListener("hashchange", route);
window.addEventListener("cart-changed", renderNav);
window.addEventListener("session-changed", renderNav);
route();

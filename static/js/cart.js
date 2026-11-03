// Корзина хранится в браузере (localStorage), пока пользователь не оформит заказ.
const KEY = "cart";

export const cart = {
  items() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  },
  save(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("cart-changed"));  // чтобы обновился счётчик в меню
  },
  add(item) { this.save([...this.items(), item]); },
  remove(index) { this.save(this.items().filter((_, i) => i !== index)); },
  clear() { this.save([]); },
  count() { return this.items().length; },
};

// Работа с сервером и сессией пользователя.

export const session = {
  get() {
    try { return JSON.parse(localStorage.getItem("session")) || {}; }
    catch { return {}; }
  },
  set(data) { localStorage.setItem("session", JSON.stringify(data)); },
  clear() { localStorage.removeItem("session"); },
};

/** Запрос к API. При ошибке бросает Error с понятным сообщением. */
export async function api(path, method = "GET", body) {
  const { token } = session.get();
  const response = await fetch(`/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // detail бывает строкой (наши ошибки) или списком (ошибки валидации Pydantic)
    throw new Error(typeof data.detail === "string" ? data.detail : "Проверьте правильность введённых данных");
  }
  return data;
}

/** Загрузка файла картинки: файл уходит в теле запроса как есть. */
export async function uploadPhoto(equipmentId, file) {
  const { token } = session.get();
  const response = await fetch(`/api/equipment/${equipmentId}/photo`, {
    method: "POST",
    headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Не удалось загрузить фото");
  return data;
}

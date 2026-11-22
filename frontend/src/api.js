// All calls to the FastAPI backend live here.
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function request(path, options) {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const getDashboard = () => request("/api/dashboard");
export const getItem = (code) => request(`/api/items/${encodeURIComponent(code)}`);
export const getDataNotes = () => request("/api/data-notes");
export const markHandled = (code, note, days) =>
  request(`/api/items/${encodeURIComponent(code)}/handled`, {
    method: "POST",
    body: JSON.stringify({ note, days }),
  });
export const unmarkHandled = (code) =>
  request(`/api/items/${encodeURIComponent(code)}/handled`, { method: "DELETE" });

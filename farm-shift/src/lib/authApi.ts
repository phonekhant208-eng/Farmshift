import { supabase } from "./supabaseClient";

const KEY = "farmshift_session";

export const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem(KEY);

export async function registerUser(username: string, password: string) {
  const { data, error } = await supabase.rpc("register_user", { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  localStorage.setItem(KEY, data.token);
  return { username: data.username as string };
}

export async function loginUser(username: string, password: string) {
  const { data, error } = await supabase.rpc("login_user", { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  localStorage.setItem(KEY, data.token);
  return { username: data.username as string };
}

export async function fetchMe(): Promise<{ username: string } | null> {
  const token = getToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc("get_me", { p_token: token });
  if (error || !data) { localStorage.removeItem(KEY); return null; }
  return { username: data as string };
}

export async function logoutUser() {
  const token = getToken();
  localStorage.removeItem(KEY);
  if (token) await supabase.rpc("logout_user", { p_token: token });
}
export async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { credentials: 'same-origin', ...init });
  if (response.status === 401) {
    localStorage.removeItem('isAuthenticated');
    window.location.assign('/');
  }
  return response;
}

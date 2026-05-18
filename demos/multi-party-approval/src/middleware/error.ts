// Maps chain/atom rejection tokens to HTTP status codes.

export function tokenToStatus(token: string): 400 | 403 | 404 | 409 | 500 {
  switch (token) {
    case "permission-denied": return 403;
    case "not-known":         return 404;
    case "not-pending":       return 409;
    case "unauthorized":      return 403;
    case "invalid-request":   return 400;
    case "recording-failure": return 500;
    default:                  return 500;
  }
}

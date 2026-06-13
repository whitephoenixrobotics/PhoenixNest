// The "/" route renders the dashboard. The dashboard lives in the
// (dashboard) route group so it can later share a group layout; this file
// re-exports it so authenticated users land on the dashboard at "/".
// (Intentional — not a route conflict.)
export { default } from './(dashboard)/page'

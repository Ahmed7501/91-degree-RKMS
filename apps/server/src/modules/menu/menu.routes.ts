import { Router } from 'express';
import { requireRole } from '../auth/require-role';
import type { MenuCatalog } from './menu-catalog';

/** GET /api/menu (API_CONTRACTS §3a): the active menu for owner menu ordering. */
export function menuRoutes(menu: MenuCatalog): Router {
  const router = Router();
  router.get('/', requireRole('OWNER'), (_req, res) => {
    res.json({ menu: menu.ownerMenu });
  });
  return router;
}

import { api } from "@/lib/api";

// Thin, named slice of the shared API client scoped to the Parents module —
// keeps feature code importing `parentsApi.x` instead of reaching into the
// global client directly, without duplicating any request logic.
export const parentsApi = {
  list: api.listParents,
  getOne: api.getParent,
  create: api.createParent,
  update: api.updateParent,
  remove: api.deleteParent,
  addChild: api.addParentChild,
  removeChild: api.removeParentChild,
  createPortalAccount: api.createParentPortalAccount,
  search: api.searchGuardians,
};

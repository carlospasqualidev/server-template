import { type FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { requirePermission } from "@/hooks/requirePermission";
import { copyRoleController } from "@/modules/roles/controllers/copyRole.controller";
import { createRoleController } from "@/modules/roles/controllers/createRole.controller";
import { deleteRoleController } from "@/modules/roles/controllers/deleteRole.controller";
import { findRoleByIdController } from "@/modules/roles/controllers/findRoleById.controller";
import { listPermissionCatalogController } from "@/modules/roles/controllers/listPermissionCatalog.controller";
import { listRolesController } from "@/modules/roles/controllers/listRoles.controller";
import { listRoleUsersController } from "@/modules/roles/controllers/listRoleUsers.controller";
import { setRoleUsersController } from "@/modules/roles/controllers/setRoleUsers.controller";
import { updateRoleController } from "@/modules/roles/controllers/updateRole.controller";
import { copyRoleRouteSchema } from "@/modules/roles/schemas/copyRole.schema";
import { createRoleRouteSchema } from "@/modules/roles/schemas/createRole.schema";
import { deleteRoleRouteSchema } from "@/modules/roles/schemas/deleteRole.schema";
import { findRoleByIdRouteSchema } from "@/modules/roles/schemas/findRoleById.schema";
import { listPermissionCatalogRouteSchema } from "@/modules/roles/schemas/listPermissionCatalog.schema";
import { listRolesRouteSchema } from "@/modules/roles/schemas/listRoles.schema";
import { listRoleUsersRouteSchema } from "@/modules/roles/schemas/listRoleUsers.schema";
import { setRoleUsersRouteSchema } from "@/modules/roles/schemas/setRoleUsers.schema";
import { updateRoleRouteSchema } from "@/modules/roles/schemas/updateRole.schema";

export const rolesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get("/", { schema: listRolesRouteSchema, preHandler: requirePermission("backoffice.roles.read"), prefixTrailingSlash: "no-slash" }, listRolesController);
  app.get("/permissions", { schema: listPermissionCatalogRouteSchema, preHandler: requirePermission("backoffice.roles.read") }, listPermissionCatalogController);
  app.post("/", { schema: createRoleRouteSchema, preHandler: requirePermission("backoffice.roles.create"), prefixTrailingSlash: "no-slash" }, createRoleController);

  // Rotas com `:roleId` ficam por último para não capturar `/permissions`.
  app.get("/:roleId", { schema: findRoleByIdRouteSchema, preHandler: requirePermission("backoffice.roles.read") }, findRoleByIdController);
  app.put("/:roleId", { schema: updateRoleRouteSchema, preHandler: requirePermission("backoffice.roles.update") }, updateRoleController);
  app.delete("/:roleId", { schema: deleteRoleRouteSchema, preHandler: requirePermission("backoffice.roles.delete") }, deleteRoleController);
  // Copiar é criar um cargo novo a partir de outro.
  app.post("/:roleId/copy", { schema: copyRoleRouteSchema, preHandler: requirePermission("backoffice.roles.create") }, copyRoleController);
  // A lista expõe nome e e-mail: exige ler cargos E ler usuários.
  app.get("/:roleId/users", { schema: listRoleUsersRouteSchema, preHandler: [requirePermission("backoffice.roles.read"), requirePermission("backoffice.users.read")] }, listRoleUsersController);
  // Mudar quem tem o cargo muda o acesso de usuários: exige editar cargos E editar usuários.
  app.put("/:roleId/users", { schema: setRoleUsersRouteSchema, preHandler: [requirePermission("backoffice.roles.update"), requirePermission("backoffice.users.update")] }, setRoleUsersController);
};

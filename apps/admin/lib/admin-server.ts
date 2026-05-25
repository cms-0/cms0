import {
  configureAdminServer,
  createAdminServer,
  getAdminServerConfig,
} from "@cms0/admin-server";

import { authorizeSelfHostedAdminRequest } from "./admin-server-auth";
import { selfHostedServerBinding } from "./self-hosted-server";

let configured = false;
const selfHostedAdminServer = createAdminServer("self-hosted");

export const configureSelfHostedAdminServer: () => ReturnType<
  typeof getAdminServerConfig
> = () => {
  if (configured) {
    return getAdminServerConfig();
  }

  configureAdminServer({
    authorizeRequest: async ({ request }) => {
      const authorization = await authorizeSelfHostedAdminRequest(
        request,
        request.segments,
      );

      if (authorization.ok) {
        return null;
      }

      return {
        body: authorization.body,
        status: authorization.status,
      };
    },
    resolveBinding: async () => selfHostedServerBinding,
  });
  configured = true;

  return getAdminServerConfig();
};

export const getSelfHostedAdminServer: () => ReturnType<
  typeof createAdminServer
> = () => {
  configureSelfHostedAdminServer();
  return selfHostedAdminServer;
};

export const getSelfHostedSchemaSnapshot = async () =>
  getSelfHostedAdminServer().getLatestSchemaSnapshot();

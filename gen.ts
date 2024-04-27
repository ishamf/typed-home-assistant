import template from "@babel/template";
import { connect } from "./lib.ts";
import {
  HassEntities,
  HassServices,
  subscribeEntities,
  subscribeServices,
} from "home-assistant-js-websocket";

const outTemplate = template(`
%%entityTypeDeclaration%%

import createRuntime from "./lib.ts";

export default createRuntime<Entities>();
`);

export async function generate(output: string) {
  const conn = await connect();
  // Get events and services

  const [entities, services] = await Promise.all([
    new Promise<HassEntities>((resolve) => {
      const remove = subscribeEntities(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
    new Promise<HassServices>((resolve) => {
      const remove = subscribeServices(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
  ]);

  conn.close();

  
}

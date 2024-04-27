import { load } from "@std/dotenv";
import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  subscribeServices,
} from "home-assistant-js-websocket";

export async function connect() {
  await load({ export: true });

  const url = Deno.env.get("HOME_ASSISTANT_URL");

  if (!url) throw new Error("HOME_ASSISTANT_URL is not set");

  const token = Deno.env.get("HOME_ASSISTANT_TOKEN");

  if (!token) throw new Error("HOME_ASSISTANT_TOKEN is not set");

  const auth = createLongLivedTokenAuth(
    url,
    token,
  );

  return await createConnection({ auth });
}

export function createRuntime<Entities extends Record<string, unknown>>() {
  const handlersByEntityName = {} as {
    [K in keyof Entities]: ((state: Entities[K]) => void)[] | undefined;
  };

  const entityLastChanged = {} as {
    [k: string]: Date;
  };

  connect().then((conn) => {
    subscribeEntities(conn, (state) => {
      for (const key in state) {
        const currentLastChanged = new Date(state[key].last_changed);
        // If it's not the first message
        if (
          entityLastChanged[key] && entityLastChanged[key] < currentLastChanged
        ) {
          const entityState = state[key].state as any;
          handlersByEntityName[key]?.forEach((handler) => {
            handler(entityState);
          });
        }

        entityLastChanged[key] = currentLastChanged;
      }
    });

    subscribeServices(conn, (services) => {
      console.log(services);
    });
  });

  return {
    onStateChange<K extends keyof Entities>(
      entityName: K,
      handler: (state: Entities[K]) => void,
    ) {
      let currentHandlers = handlersByEntityName[entityName];

      if (!currentHandlers) {
        currentHandlers = handlersByEntityName[entityName] = [];
      }

      currentHandlers.push(handler);
    },
  };
}

import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  type HassEntities,
  type HassServiceTarget,
  loadEnv,
  subscribeEntities,
  subscribeServices,
} from "../src/deps.ts";

export enum StateType {
  Number,
  String,
}

export type StateTypeToRealType<S> = S extends StateType.Number ? number
  : string;

export type EntityDefinition = {
  [entityId: string]: {
    stateType: StateType;
    attributes: {
      [attributeId: string]: { attrType: StateType };
    };
  };
};

export type EntityStateType<
  Entities extends EntityDefinition,
  K extends keyof Entities,
> = StateTypeToRealType<Entities[K]["stateType"]>;

export type ServiceDefinition = {
  [fullServiceId: string]: {
    fields: {
      [fieldId: string]: unknown;
    };
  };
};

export type StateChangeHandler<T> = (
  state: T,
  extra: { prevState: T },
) => void;

export async function connect() {
  await loadEnv({ export: true });

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

export function createRuntime<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
>(entityDefinition: Entities, _serviceDefinition: Services) {
  let prevState: HassEntities | undefined;

  function convertEntityState<K extends keyof Entities>(
    key: K,
    value: string,
  ): EntityStateType<Entities, K> {
    if (entityDefinition[key].stateType === StateType.Number) {
      // deno-lint-ignore no-explicit-any
      return parseFloat(value) as any;
    }

    // deno-lint-ignore no-explicit-any
    return value as any;
  }

  const handlersByEntityName = {} as {
    [K in keyof Entities]:
      | StateChangeHandler<EntityStateType<Entities, K>>[]
      | undefined;
  };

  const entityLastChanged = {} as {
    [k: string]: Date;
  };

  const connPromise = connect();

  connPromise.then((conn) => {
    subscribeEntities(conn, (state) => {
      for (const key in state) {
        const currentLastChanged = new Date(state[key].last_changed);
        // If it's not the first message
        if (
          entityLastChanged[key] && prevState &&
          entityLastChanged[key] < currentLastChanged
        ) {
          const entityState = convertEntityState(
            key,
            state[key].state,
          );
          const prevEntityState = convertEntityState(key, prevState[key].state);
          handlersByEntityName[key]?.forEach((handler) => {
            handler(entityState, { prevState: prevEntityState });
          });
        }

        entityLastChanged[key] = currentLastChanged;
      }

      prevState = state;
    });
  });

  return {
    onStateChange<K extends keyof Entities>(
      entityName: K,
      handler: StateChangeHandler<EntityStateType<Entities, K>>,
    ) {
      let currentHandlers = handlersByEntityName[entityName];

      if (!currentHandlers) {
        currentHandlers = handlersByEntityName[entityName] = [];
      }

      currentHandlers.push(handler);
    },

    async callService<K extends keyof Services & string>(
      fullServiceId: K,
      serviceData?: Services[K]["fields"],
      target?: Omit<HassServiceTarget, "entity_id"> & {
        entity_id?:
          | keyof Entities & string
          | (keyof Entities & string)[]
          | undefined;
      },
    ) {
      const splitServiceId = fullServiceId.split(".");
      if (splitServiceId.length !== 2) {
        throw new Error("Unknown service id");
      }

      const [domainId, serviceId] = splitServiceId;

      return callService(
        await connPromise,
        domainId,
        serviceId,
        serviceData,
        target,
      );
    },
  };
}

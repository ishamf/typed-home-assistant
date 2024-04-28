/**
 * @module
 *
 * Library for interacting with Home Assistant.
 *
 * Normally, you shouldn't need to import this module. Instead, you should use the CLI to generate a file that exports a runtime.
 */

import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  type HassEntities,
  type HassServiceTarget,
  loadEnv,
  subscribeEntities,
} from "../src/deps.ts";

/**
 * The type of the state of an entity. Only for internal use.
 * 
 * @internal
 */
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

/**
 * Handler for when the state of an entity changes.
 */
export type StateChangeHandler<T> = (
  /**
   * The new state of the entity.
   */
  state: T,
  extra: {
    /**
     * The previous state of the entity.
     */
    prevState: T;
  },
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

/**
 * The runtime for interacting with Home Assistant.
 */
export interface Runtime<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
> {
  /**
   * Register a listener of when the state of an entity changes.
   * @param entityName Name of the entity to listen to.
   * @param handler Handler to call when the state changes.
   */
  onStateChange<K extends keyof Entities>(
    entityName: K,
    handler: StateChangeHandler<EntityStateType<Entities, K>>,
  ): void;

  /**
   * Call a service in home assistant.
   *
   * @param fullServiceId The service ID to call.
   * @param serviceData The params to pass to the service.
   * @param target The target of the service call. e.g. for switch.turn_on, this would be {entity_id: ["switch.living_room_light"] }
   */
  callService<K extends keyof Services & string>(
    fullServiceId: K,
    serviceData?: Services[K]["fields"],
    target?: Omit<HassServiceTarget, "entity_id"> & {
      entity_id?:
        | keyof Entities & string
        | (keyof Entities & string)[]
        | undefined;
    },
  ): Promise<unknown>;

  /**
   * Get the current state of an entity.
   *
   * @param entityName Name of the entity to get the state of.
   */
  getEntityState<K extends keyof Entities & string>(
    entityName: K,
  ): EntityStateType<Entities, K>;
}

/**
 * Create a runtime for interacting with Home Assistant.
 *
 * You shouldn't need to call this function directly. Instead, use the CLI to generate a file that will export a runtime.
 */
export function createRuntime<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
>(
  entityDefinition: Entities,
  _serviceDefinition: Services,
): Runtime<Entities, Services> {
  let prevState: HassEntities | undefined;
  let currentState: HassEntities | undefined;

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

  const connPromise = connect();

  connPromise.then((conn) => {
    subscribeEntities(conn, (state) => {
      currentState = state;
      for (const key in state) {
        if (
          prevState &&
          state[key].state !== prevState[key].state
        ) {
          const entityState = convertEntityState(
            key,
            state[key].state,
          );
          const prevEntityState = convertEntityState(key, prevState[key].state);
          handlersByEntityName[key]?.forEach((handler) => {
            try {
              handler(entityState, { prevState: prevEntityState });
            } catch (e) {
              console.error(`A state handler for '${key}' threw an error:`);
              console.error(e);
            }
          });
        }
      }

      prevState = state;
    });
  });

  const runtime: Runtime<Entities, Services> = {
    onStateChange(
      entityName,
      handler,
    ) {
      let currentHandlers = handlersByEntityName[entityName];

      if (!currentHandlers) {
        currentHandlers = handlersByEntityName[entityName] = [];
      }

      currentHandlers.push(handler);
    },

    async callService(
      fullServiceId,
      serviceData,
      target,
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

    getEntityState(entityName) {
      if (!currentState) {
        throw new Error("No state available yet");
      }

      const entity = currentState[entityName];

      if (!entity) {
        throw new Error(`Entity ${entityName} not found`);
      }

      return convertEntityState(entityName, entity.state);
    },
  };

  return runtime;
}

/**
 * @module
 *
 * Library for interacting with Home Assistant.
 *
 * Normally, you shouldn't need to import this module. Instead, you should use the CLI to generate a file that exports a runtime.
 */

import {
  callService,
  type Connection,
  createConnection,
  createLongLivedTokenAuth,
  existsSync,
  type HassEntities,
  type HassEntity,
  type HassServiceTarget,
  parse,
  process,
  readFile,
  subscribeEntities,
} from "../src/deps.ts";
import { createChangeHelper } from "./utils.ts";

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

export type EntityAttributeStateType<
  Entities extends EntityDefinition,
  K extends keyof Entities,
  A extends keyof Entities[K]["attributes"],
> = StateTypeToRealType<Entities[K]["attributes"][A]["attrType"]>;

export type ServiceDefinition = {
  [fullServiceId: string]: {
    fields: {
      [fieldId: string]: unknown;
    };
  };
};

/**
 * Handler for when the state or of an entity changes.
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

type EntityUpdateHandler = (
  /**
   * The new state of the entity.
   */
  entity: HassEntity,
) => void;

export const ENV_FILENAME = ".env";

export async function loadEnv() {
  const envFile = existsSync(ENV_FILENAME)
    ? parse(await readFile(ENV_FILENAME, { encoding: "utf-8" }))
    : {};
  const processEnv = process.env;

  return { ...envFile, ...processEnv };
}

export async function connect() {
  const env = await loadEnv();

  const url = env["HOME_ASSISTANT_URL"];

  if (!url) throw new Error("HOME_ASSISTANT_URL is not set");

  const token = env["HOME_ASSISTANT_TOKEN"];

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
export class Runtime<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
> {
  /**
   * The definition of entities, used for converting state types from string.
   */
  private entityDefinition: Entities;

  /**
   * The definition of services (currently unused at runtime)
   */
  private serviceDefinition: Services;

  /**
   * Change handlers for various entities
   */
  private handlersByEntityName: {
    [K in keyof Entities]?: EntityUpdateHandler[];
  };

  /**
   * Current and previous states
   */
  private currentState: HassEntities | undefined;
  private prevState: HassEntities | undefined;

  /**
   * Promise for a connection to HA.
   */
  private connPromise: Promise<Connection>;

  private getStatePromise: Promise<() => HassEntities>;

  constructor(entityDefinition: Entities, serviceDefinition: Services) {
    this.entityDefinition = entityDefinition;
    this.serviceDefinition = serviceDefinition;
    this.handlersByEntityName = {};
    this.connPromise = connect();

    let resolve: ((x: () => HassEntities) => void) | null;

    this.getStatePromise = new Promise((r) => {
      resolve = r;
    });

    this.connPromise.then((conn) => {
      subscribeEntities(conn, (state) => {
        this.currentState = state;

        if (resolve) {
          resolve(() => this.currentState!);
          resolve = null;
        }

        for (const key in this.handlersByEntityName) {
          this.handlersByEntityName[key]?.forEach((handler) => {
            try {
              handler(state[key]);
            } catch (e) {
              console.error(`A state handler for '${key}' threw an error:`);
              console.error(e);
            }
          });
        }

        this.prevState = state;
      });
    });
  }

  /**
   * Convert the specified value based on the type of the entity referred to by the key.
   */
  private convertEntityState<K extends keyof Entities>(
    key: K,
    value: string,
  ): EntityStateType<Entities, K> {
    if (this.entityDefinition[key].stateType === StateType.Number) {
      // deno-lint-ignore no-explicit-any
      return parseFloat(value) as any;
    }

    // deno-lint-ignore no-explicit-any
    return value as any;
  }

  private onEntityUpdated<K extends keyof Entities>(
    entityName: K,
    handler: EntityUpdateHandler,
  ) {
    let currentHandlers = this.handlersByEntityName[entityName];

    if (!currentHandlers) {
      currentHandlers = this.handlersByEntityName[entityName] = [];
    }

    currentHandlers.push(handler);
  }

  /**
   * Register a listener of when the state of an entity changes.
   * @param entityName Name of the entity to listen to.
   * @param handler Handler to call when the state changes.
   */
  onStateChange<K extends keyof Entities & string>(
    entityName: K,
    handler: StateChangeHandler<EntityStateType<Entities, K>>,
  ): void {
    this.getStatePromise.then(() => {
      const current = this.getEntityState(entityName);

      const helper = createChangeHelper(current, (current, prev) => {
        handler(current, { prevState: prev });
      });

      this.onEntityUpdated(entityName, (entity) => {
        helper(this.convertEntityState(entityName, entity.state));
      });
    });
  }

  /**
   * Register a listener of when an attribute of an entity changes.
   * @param entityName Name of the entity to listen to.
   * @param attribute Name of the attribute to listen to.
   * @param handler Handler to call when the state changes.
   */
  onEntityAttributeChange<
    K extends keyof Entities & string,
    A extends keyof Entities[K]["attributes"] & string,
  >(
    entityName: K,
    attribute: A,
    handler: StateChangeHandler<EntityAttributeStateType<Entities, K, A>>,
  ): void {
    this.getStatePromise.then(() => {
      const current = this.getEntityAttributeState(entityName, attribute);

      const helper = createChangeHelper(current, (current, prev) => {
        handler(current, { prevState: prev });
      });

      this.onEntityUpdated(entityName, (entity) => {
        helper(entity.attributes[attribute]);
      });
    });
  }

  /**
   * Call a service in home assistant.
   *
   * @param fullServiceId The service ID to call.
   * @param serviceData The params to pass to the service.
   * @param target The target of the service call. e.g. for switch.turn_on, this would be {entity_id: ["switch.living_room_light"] }
   */
  async callService<K extends keyof Services & string>(
    fullServiceId: K,
    serviceData?: Services[K]["fields"],
    target?: Omit<HassServiceTarget, "entity_id"> & {
      entity_id?:
        | keyof Entities & string
        | (keyof Entities & string)[]
        | undefined;
    },
  ): Promise<unknown> {
    const splitServiceId = fullServiceId.split(".");
    if (splitServiceId.length !== 2) {
      throw new Error("Unknown service id");
    }

    const [domainId, serviceId] = splitServiceId;

    return callService(
      await this.connPromise,
      domainId,
      serviceId,
      serviceData,
      target,
    );
  }

  /**
   * Get the current state of an entity.
   *
   * @param entityName Name of the entity to get the state of.
   */
  getEntityState<K extends keyof Entities & string>(
    entityName: K,
  ): EntityStateType<Entities, K> {
    if (!this.currentState) {
      throw new Error("No state available yet");
    }

    const entity = this.currentState[entityName];

    if (!entity) {
      throw new Error(`Entity ${entityName} not found`);
    }

    return this.convertEntityState(entityName, entity.state);
  }

  /**
   * Get the value of an entity's attribute.
   *
   * @param entityName Name of the entity.
   * @param attribute Name of the attribute.
   * @returns
   */
  getEntityAttributeState<
    K extends keyof Entities & string,
    A extends keyof Entities[K]["attributes"] & string,
  >(
    entityName: K,
    attribute: A,
  ): EntityAttributeStateType<Entities, K, A> {
    if (!this.currentState) {
      throw new Error("No state available yet");
    }

    const entity = this.currentState[entityName];

    if (!entity) {
      throw new Error(`Entity ${entityName} not found`);
    }

    return entity.attributes[attribute];
  }

  /**
   * Close the connection to home assistant.
   */
  async close() {
    (await this.connPromise).close();
  }
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
  serviceDefinition: Services,
): Runtime<Entities, Services> {
  return new Runtime(entityDefinition, serviceDefinition);
}

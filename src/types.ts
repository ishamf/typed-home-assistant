/**
 * The type of the state of an entity. Only for internal use.
 *
 * @internal
 */

import type { HassEntity } from "./deps.ts";

export enum StateType {
  Number,
  String
}

export type StateTypeToRealType<S> = S extends StateType.Number ? number : string;

export type EntityDefinition = {
  [entityId: string]: {
    stateType: StateType;
    attributes: {
      [attributeId: string]: { attrType: StateType; };
    };
  };
};

export type EntityStateType<
  Entities extends EntityDefinition,
  K extends keyof Entities
> = StateTypeToRealType<Entities[K]["stateType"]>;

export type EntityAttributeStateType<
  Entities extends EntityDefinition,
  K extends keyof Entities,
  A extends keyof Entities[K]["attributes"]
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
  }
) => void;


export type EntityUpdateHandler = (
  /**
   * The new state of the entity.
   */
  entity: HassEntity
) => void;
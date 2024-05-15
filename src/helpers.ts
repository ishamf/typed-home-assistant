// deno-lint-ignore-file no-explicit-any
import type { Runtime } from "./index.ts";
import type {
  EntityAttributeStateType,
  EntityDefinition,
  EntityStateType,
  Remover,
  ServiceDefinition,
  StateChangeHandler,
} from "./types.ts";

/**
 * A helper to only call the change handler when the predicate switches to true.
 *
 * @param predicate Predicate to check
 * @param onChange The state change handler to call
 */
export function withPredicate<T>(
  predicate: (x: T) => boolean,
  onChange: StateChangeHandler<T>,
): StateChangeHandler<T> {
  let prevPred: boolean | null = null;

  return (...args) => {
    const [state, { prevState }] = args;

    if (prevPred === null) {
      prevPred = !!predicate(prevState);
    }

    const currentPred = !!predicate(state);

    if (currentPred && !prevPred) {
      onChange(...args);
    }

    prevPred = currentPred;
  };
}

interface MultiPredicateBuilder<
  Entities extends EntityDefinition,
  Values extends unknown[] = unknown[],
> {
  /**
   * Add a predicate for a given entity's state.
   *
   * @param k Key of the entity
   * @param pred Predicate to check the entity's state with
   */
  with<K extends keyof Entities & string>(
    k: K,
    pred: (x: EntityStateType<Entities, K>) => boolean,
  ): MultiPredicateBuilder<
    Entities,
    [...Values, EntityStateType<Entities, K>]
  >;

  /**
   * Add a predicate for a given entity's attribute.
   *
   * @param k Key of the entity
   * @param attr Name of the attribute
   * @param pred Predicate to check the entity's attribute with
   */
  withAttr<
    K extends keyof Entities & string,
    A extends keyof Entities[K]["attributes"] & string,
  >(
    k: K,
    attr: A,
    pred: (x: EntityAttributeStateType<Entities, K, A>) => boolean,
  ): MultiPredicateBuilder<
    Entities,
    [...Values, EntityAttributeStateType<Entities, K, A>]
  >;

  /**
   * Register a handler for when all predicates are true, and when they're no longer true.
   *
   * @param onHandler Handler to call when all predicates are true
   * @param offHandler Handler to call when any of the predicates are no longer true
   */
  do(
    onHandler: (...xs: Values) => void,
    offHandler?: (...xs: Values) => void,
  ): Remover;
}

/**
 * Create a multi predicate builder. You can call `with` and `withAttr` to add predicates to the builder, and call `do` to register a listener for when all predicates are true.
 *
 * @param ha The home assistant instance
 * @returns
 */
export function multiPredicate<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
>(ha: Runtime<Entities, Services>): MultiPredicateBuilder<Entities, []> {
  return _multiPredicate(ha, []);
}

type Register = (cb: () => void) => Remover;
type Checker = (prev?: boolean) => [any, boolean];

function _multiPredicate<
  Entities extends EntityDefinition,
  Services extends ServiceDefinition,
>(
  ha: Runtime<Entities, Services>,
  existingPreds: [Register, Checker][],
): MultiPredicateBuilder<Entities, any> {
  return {
    with(k, pred) {
      return _multiPredicate(ha, [...existingPreds, [(cb) => {
        return ha.onStateChange(k, cb);
      }, (prev) => {
        const value = ha.getEntityState(k, prev);

        return [value, pred(value)];
      }]]) as any;
    },

    withAttr(k, attr, pred) {
      return _multiPredicate(ha, [...existingPreds, [(cb) => {
        return ha.onEntityAttributeChange(k, attr, cb);
      }, (prev) => {
        const value = ha.getEntityAttributeState(k, attr, prev);

        return [value, pred(value)];
      }]]) as any;
    },

    do(onHandler, offHandler) {
      let prev: null | boolean = null;

      function listener() {
        if (prev === null) {
          prev = existingPreds.every(([_r, checker]) => checker(true)[1]);
        }

        const values: any = [];
        let state = true;

        for (const [_r, checker] of existingPreds) {
          const [value, valid] = checker();

          if (!valid) {
            state = false;
          }

          values.push(value);
        }

        if (state) {
          if (!prev) {
            onHandler(...values);
            prev = true;
          }
        } else {
          if (prev) {
            if (offHandler) {
              offHandler(...values);
            }
            prev = false;
          }
        }
      }

      const removers = existingPreds.map(([reg]) => reg(listener));

      return () => {
        removers.forEach((r) => r());
      };
    },
  };
}

/**
 * Creates a function that will call the passed `onChange` if its input changes.
 */
export function createChangeHelper<T>(
  current: T,
  onChange: (current: T, prev: T) => void,
) {
  let prev = current;

  return (x: T) => {
    if (x !== prev) onChange(x, prev);

    prev = x;
  };
}

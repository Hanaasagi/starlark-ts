import { Value } from './value';
import { Tuple } from './value';

export function UnpackPositionalArgs(
  fnname: string,
  args: Tuple,
  kwargs: Tuple[],
  min: number,
  vars: Array<Value>
): Error | null {
  if (kwargs.length > 0) {
    return new Error(`${fnname}: unexpected keyword arguments`);
  }
  const max = vars.length;
  if (args.Len() < min) {
    const atleast = min < max ? 'at least ' : '';
    return new Error(
      `${fnname}: got ${args.Len()} arguments, want ${atleast}${min}`
    );
  }
  if (args.Len() > max) {
    const atmost = max > min ? 'at most ' : '';
    return new Error(
      `${fnname}: got ${args.Len()} arguments, want ${atmost}${max}`
    );
  }

  for (let i = 0; i < args.Len(); i++) {
    const arg = args.index(i);
    // const variable = vars[i];
    const [v, err] = unpackOneArg(arg);
    if (err !== null) {
      return new Error(`${fnname}: for parameter ${i + 1}: ${err}`);
    }
    vars[i] = v;
  }
  return null;
}

function unpackOneArg(v: Value): [Value, Error | null] {
  return [v, null];
}

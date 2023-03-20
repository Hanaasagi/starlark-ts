import { Value } from "./value";

export function builtinAttr(
  recv: Value,
  name: string,
  methods: { [name: string]: Builtin }
): [Value, Error] {
  const b: Builtin | undefined = methods[name];
  if (!b) {
    return [null, null]; // no such method
  }
  return [b.BindReceiver(recv), null];
}

export function builtinAttrNames(methods: {
  [name: string]: Builtin;
}): string[] {
  const names: string[] = Object.keys(methods);
  names.sort();
  return names;
}

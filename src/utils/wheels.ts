export function unimplemented(msg: string): never {
  throw new Error("It's unimplemented! " + msg);
}

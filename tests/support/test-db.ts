/** Throws unless `url` is a local database named "*_test" (tests truncate everything). */
export function assertTestDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  if (!/_test$/i.test(name)) throw new Error(`Refusing to run tests on database "${name}" (its name must end in "_test")`);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname)) {
    throw new Error(`Refusing to run tests on database host "${u.hostname}" (local databases only)`);
  }
}

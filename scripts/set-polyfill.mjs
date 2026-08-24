const setMethods = {
  union(other) {
    return new Set([...this, ...other]);
  },
  intersection(other) {
    return new Set([...this].filter((value) => other.has(value)));
  },
  difference(other) {
    return new Set([...this].filter((value) => !other.has(value)));
  },
  symmetricDifference(other) {
    return new Set(
      [...this]
        .filter((value) => !other.has(value))
        .concat([...other].filter((value) => !this.has(value))),
    );
  },
  isSubsetOf(other) {
    return [...this].every((value) => other.has(value));
  },
  isSupersetOf(other) {
    return [...other].every((value) => this.has(value));
  },
};
for (const [name, method] of Object.entries(setMethods))
  if (!(name in Set.prototype)) Object.defineProperty(Set.prototype, name, { value: method });

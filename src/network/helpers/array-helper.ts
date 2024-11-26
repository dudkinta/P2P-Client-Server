export function getRandomElement<T>(array: T[]): T | undefined {
  if (array.length === 0) {
    return undefined;
  }
  const i = Math.floor(Math.random() * array.length);
  return array[i];
}

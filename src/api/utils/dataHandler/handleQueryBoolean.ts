export function handleQueryBoolean(value: string | null | undefined): boolean | undefined {
  const map: Record<string, boolean> = {
    true: true,
    false: false,
  };

  return value ? map[value.toLowerCase().trim()] : undefined;
}

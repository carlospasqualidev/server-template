export function handleOrderByType(orderByType: 'asc' | 'desc' | undefined, defaultOrder: 'asc' | 'desc') {
  if (orderByType && ['asc', 'desc'].includes(orderByType)) return orderByType;

  return defaultOrder;
}

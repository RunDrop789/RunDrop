export function eligibleLineRecipients(drivers, activeOrders, followedLineUserIds, maxActiveOrders) {
  const activeCountByDriver = new Map();
  for (const activeOrder of activeOrders) {
    activeCountByDriver.set(
      activeOrder.driver_id,
      (activeCountByDriver.get(activeOrder.driver_id) || 0) + 1
    );
  }
  const followedIds = new Set(followedLineUserIds);

  return [...new Set(
    drivers
      .filter(driver =>
        (activeCountByDriver.get(driver.id) || 0) < maxActiveOrders &&
        followedIds.has(driver.line_user_id)
      )
      .map(driver => driver.line_user_id)
  )];
}

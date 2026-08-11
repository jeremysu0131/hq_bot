function entriesForUser(entries, user) {
  return entries
    .filter((entry) => entry.userToken === user.token)
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt));
}

function evaluateCheckIns(entries, options) {
  const { watchUsers, asOfMinutes } = options;
  const statuses = watchUsers.map((user) => {
    const userEntries = entriesForUser(entries, user);
    const checkIn =
      userEntries.find((entry) => entry.minutes <= asOfMinutes) || null;

    return {
      userName: user.name,
      userToken: user.token,
      mentionTag: user.mentionTag || "",
      shouldAlert: checkIn === null,
      checkInMinutes: checkIn ? checkIn.minutes : null,
      entries: userEntries,
    };
  });

  const alertUsers = statuses.filter((status) => status.shouldAlert);
  const checkedUsers = statuses.filter((status) => !status.shouldAlert);
  return {
    statuses,
    alertUsers,
    checkedUsers,
    allCheckedIn: alertUsers.length === 0,
  };
}

function evaluateAttendance(entries, options) {
  const { watchUsers, checkInCutoffMinutes, asOfMinutes } = options;
  const statuses = watchUsers.map((user) => {
    const userEntries = entriesForUser(entries, user);
    const checkIn =
      userEntries.find((entry) => entry.minutes <= checkInCutoffMinutes) || null;
    const checkOut = checkIn
      ? userEntries.find(
          (entry) =>
            entry.minutes > checkInCutoffMinutes &&
            entry.minutes <= asOfMinutes,
        ) || null
      : null;
    const skipCheckoutCheck = checkIn === null;

    return {
      userName: user.name,
      userToken: user.token,
      mentionTag: user.mentionTag || "",
      shouldAlert: !skipCheckoutCheck && checkOut === null,
      skipCheckoutCheck,
      checkInMinutes: checkIn ? checkIn.minutes : null,
      checkOutMinutes: checkOut ? checkOut.minutes : null,
      entries: userEntries,
    };
  });

  const alertUsers = statuses.filter((status) => status.shouldAlert);
  const activeUsers = statuses.filter((status) => !status.skipCheckoutCheck);
  const skippedUsers = statuses.filter((status) => status.skipCheckoutCheck);
  const checkedUsers = activeUsers.filter(
    (status) => status.checkOutMinutes !== null,
  );

  return {
    statuses,
    alertUsers,
    activeUsers,
    skippedUsers,
    checkedUsers,
    allCheckedOut: activeUsers.length > 0 && alertUsers.length === 0,
  };
}

module.exports = {
  evaluateAttendance,
  evaluateCheckIns,
};

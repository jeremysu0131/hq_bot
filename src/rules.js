function evaluateAttendance(entries, options) {
  const { watchUsers, cutoffMinutes } = options;

  const statuses = watchUsers.map((user) => {
    const userEntries = entries
      .filter((entry) => entry.userToken === user.token)
      .sort((left, right) => left.minutes - right.minutes);

    const checkIns = userEntries.filter(
      (entry) => entry.action === "checkin" && entry.minutes <= cutoffMinutes,
    );

    const firstCheckIn = checkIns.length > 0 ? checkIns[0].minutes : null;
    const skipCheckoutCheck = firstCheckIn === null;
    const checkOuts = skipCheckoutCheck
      ? []
      : userEntries.filter(
          (entry) =>
            entry.action === "checkout" && entry.minutes <= cutoffMinutes,
        );
    const validCheckOut = skipCheckoutCheck
      ? null
      : checkOuts.find((entry) => entry.minutes >= firstCheckIn) || null;

    const shouldAlert = !skipCheckoutCheck && !validCheckOut;

    return {
      userName: user.name,
      userToken: user.token,
      mentionTag: user.mentionTag || "",
      shouldAlert,
      skipCheckoutCheck,
      firstCheckIn,
      checkOutBeforeCutoff: validCheckOut ? validCheckOut.minutes : null,
      checkIns,
      checkOuts,
      entries: userEntries,
    };
  });

  const alertUsers = statuses.filter((status) => status.shouldAlert);
  const activeUsers = statuses.filter((status) => !status.skipCheckoutCheck);
  const skippedUsers = statuses.filter((status) => status.skipCheckoutCheck);
  const checkedUsers = activeUsers.filter(
    (status) => status.checkOutBeforeCutoff !== null,
  );
  const allCheckedOut = activeUsers.length > 0 && alertUsers.length === 0;

  return {
    statuses,
    alertUsers,
    activeUsers,
    skippedUsers,
    checkedUsers,
    allCheckedOut,
  };
}

module.exports = {
  evaluateAttendance,
};

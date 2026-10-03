export function calendarDateRange(period, anchorDate) {
    if (!['day', 'week', 'month', 'year'].includes(period)) throw new Error('Period must be day, week, month, or year.');
    const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
    if (Number.isNaN(anchor.valueOf()) || anchor.toISOString().slice(0, 10) !== anchorDate) throw new Error('Choose a valid calendar date.');

    const start = new Date(anchor);
    if (period === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (period === 'month') start.setUTCDate(1);
    if (period === 'year') start.setUTCMonth(0, 1);
    const end = new Date(start);
    if (period === 'day') end.setUTCDate(end.getUTCDate() + 1);
    if (period === 'week') end.setUTCDate(end.getUTCDate() + 7);
    if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
    if (period === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);

    return { from: start.toISOString().slice(0, 10), to: new Date(end.valueOf() - 86400000).toISOString().slice(0, 10) };
}

export function filterRecordsByCalendar(records, dateField, period, anchorDate) {
    const { from, to } = calendarDateRange(period, anchorDate);
    return records.filter((record) => {
        const recordDate = String(record[dateField] || '').slice(0, 10);
        return recordDate >= from && recordDate <= to;
    });
}
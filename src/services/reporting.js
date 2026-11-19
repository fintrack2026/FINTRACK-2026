export function summarizePayments(payments) {
    const totals = { cash: 0, digitalWallet: 0, mobileWallet: 0, creditCard: 0, bankTransfer: 0, other: 0 };
    for (const payment of payments) {
        const method = String(payment.paymentMethod || '').trim().toLowerCase();
        const category = method === 'cash'
            ? 'cash'
            : method === 'digital wallet' || method === 'wallet'
                ? 'digitalWallet'
                : method === 'mobile wallet'
                    ? 'mobileWallet'
                    : method === 'bank transfer'
                        ? 'bankTransfer'
                        : ['credit card', 'credit-card', 'card'].includes(method)
                    ? 'creditCard'
                    : 'other';
        totals[category] += Number(payment.amount || 0);
    }
    return totals;
}

export function transactionDateRange(period, anchorDate) {
    if (!['day', 'week', 'month', 'year'].includes(period)) {
        throw Object.assign(new Error('Period must be day, week, month, or year.'), { status: 400 });
    }
    const date = String(anchorDate || '');
    const anchor = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(anchor.valueOf()) || anchor.toISOString().slice(0, 10) !== date) {
        throw Object.assign(new Error('Choose a valid calendar date.'), { status: 400 });
    }

    const start = new Date(anchor);
    if (period === 'week') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    if (period === 'month') start.setUTCDate(1);
    if (period === 'year') start.setUTCMonth(0, 1);
    const endExclusive = new Date(start);
    if (period === 'day') endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    if (period === 'week') endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);
    if (period === 'month') endExclusive.setUTCMonth(endExclusive.getUTCMonth() + 1);
    if (period === 'year') endExclusive.setUTCFullYear(endExclusive.getUTCFullYear() + 1);

    return {
        from: start.toISOString().slice(0, 10),
        to: new Date(endExclusive.valueOf() - 86400000).toISOString().slice(0, 10)
    };
}

export function normalizeDateRange(from = '', to = '') {
    const start = String(from || '');
    const end = String(to || '');
    const validDate = (value) => {
        if (!value) return true;
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
    };
    if (!validDate(start) || !validDate(end)) {
        throw Object.assign(new Error('Choose valid start and end dates.'), { status: 400 });
    }
    if (start && end && start > end) {
        throw Object.assign(new Error('The start date must be on or before the end date.'), { status: 400 });
    }
    return { from: start, to: end };
}

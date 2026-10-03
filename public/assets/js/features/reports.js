export async function renderReports({ apiFetch, escapeHtml, money, viewContainer }, from = '', to = '') {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.size ? `?${params}` : '';
    const report = await apiFetch(`/reports${query}`);
    const methods = [
        { key: 'cash', title: 'Cash', mark: '₱', total: report.paymentMethods?.cash },
        { key: 'digitalWallet', title: 'Digital wallet', mark: '◈', total: report.paymentMethods?.digitalWallet },
        { key: 'mobileWallet', title: 'Mobile wallet', mark: '◉', total: report.paymentMethods?.mobileWallet },
        { key: 'creditCard', title: 'Credit card', mark: '▤', total: report.paymentMethods?.creditCard },
        { key: 'bankTransfer', title: 'Bank transfer', mark: '⇄', total: report.paymentMethods?.bankTransfer },
        { key: 'other', title: 'Other', mark: '•••', total: report.paymentMethods?.other }
    ];
    viewContainer.innerHTML = `
        <div class="view-heading"><div><h2>Financial reports</h2><p>Totals are calculated from your Firestore records.</p></div></div>
        <section class="panel" style="margin-bottom:14px"><div class="panel-header"><h3>Date range</h3></div><div class="panel-body"><div class="toolbar" style="padding:12px 0"><label class="field">From<input type="date" id="report-from" value="${escapeHtml(from)}"></label><label class="field">To<input type="date" id="report-to" value="${escapeHtml(to)}"></label><button class="button" data-action="filter-report">Apply</button></div></div></section>
        <div class="report-tabs" role="tablist" aria-label="Financial report sections"><button type="button" class="report-tab" role="tab" aria-selected="false" aria-controls="report-summary" data-report-tab="summary">Summary</button><button type="button" class="report-tab is-active" role="tab" aria-selected="true" aria-controls="report-payments" data-report-tab="payments">Payment methods</button></div>
        <div id="report-summary" class="report-tab-panel" role="tabpanel" hidden><div class="report-grid"><section class="panel"><div class="panel-header"><h3>Profit & loss</h3></div><div class="panel-body"><div class="report-line"><span>Sales</span><strong>${money(report.sales)}</strong></div><div class="report-line"><span>Expenses</span><strong>${money(report.expenseTotal)}</strong></div><div class="report-line"><span>Net</span><strong>${money(report.net)}</strong></div></div></section>
        <section class="panel"><div class="panel-header"><h3>Receivables</h3></div><div class="panel-body"><div class="report-line"><span>Collected</span><strong>${money(report.paid)}</strong></div><div class="report-line"><span>Outstanding</span><strong>${money(report.outstanding)}</strong></div><div class="report-line"><span>Transactions</span><strong>${report.purchases.length}</strong></div></div></section></div>
        </div><section id="report-payments" class="report-tab-panel panel payment-report-panel" role="tabpanel"><div class="panel-header"><div><h3>Payments by method</h3><p class="muted">Collected totals for the selected date range</p></div></div><div class="payment-method-cards" aria-label="Payment method summaries">${methods.map((method) => `<div class="payment-method-card"><span class="payment-method-logo payment-logo-${method.key}" aria-hidden="true">${method.mark}</span><span class="payment-method-name">${method.title}</span><strong>${money(method.total)}</strong><small>Collected</small></div>`).join('')}</div><div class="payment-report-chart"><canvas id="report-payment-chart" aria-label="Payment totals by method" role="img"></canvas></div></section>`;
    viewContainer.querySelectorAll('[data-report-tab]').forEach((tab) => tab.addEventListener('click', () => {
        viewContainer.querySelectorAll('[data-report-tab]').forEach((item) => {
            const selected = item === tab;
            item.classList.toggle('is-active', selected);
            item.setAttribute('aria-selected', String(selected));
        });
        viewContainer.querySelectorAll('.report-tab-panel').forEach((panel) => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    }));
    const canvas = document.getElementById('report-payment-chart');
    if (canvas && window.Chart) new window.Chart(canvas, {
        type: 'doughnut',
        data: { labels: methods.map(({ title }) => title), datasets: [{ data: methods.map(({ total }) => Number(total || 0)), backgroundColor: ['#63d2c0', '#79a9e8', '#9b8be8', '#e7b45c', '#ef8b78', '#91a3b9'], borderColor: '#142238', borderWidth: 3 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom', labels: { color: '#91a3b9', usePointStyle: true } } } }
    });
}

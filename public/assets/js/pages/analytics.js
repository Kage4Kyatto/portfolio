const analyticsContainer = document.getElementById("analytics-container");
const analyticsRange = document.getElementById("analytics-range");
const analyticsFilter = document.getElementById("analytics-filter");

let currentAnalytics = null;

const loadAnalytics = async (range = "30d", filter = null) => {
  try {
    let url = `/api/admin/analytics?range=${encodeURIComponent(range)}`;
    if (filter) {
      url += `&filter=${encodeURIComponent(filter)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load analytics: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.analytics) {
      throw new Error("Invalid analytics response");
    }

    currentAnalytics = data.analytics;
    renderAnalytics();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load analytics";
    console.error(message);
    analyticsContainer.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--error);">
        <p>${escapeHtml(message)}</p>
      </div>
    `;
    if (window.toast) {
      window.toast.error(message);
    }
  }
};

const renderAnalytics = () => {
  if (!currentAnalytics) {
    return;
  }

  // Ensure container structure exists to avoid full DOM rebuild
  if (!analyticsContainer.querySelector('[data-section="summary"]')) {
    analyticsContainer.innerHTML = `
      <section data-section="summary" style="margin-bottom: 32px;">
        <h3 style="margin-bottom: 16px;">Summary</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
          <div class="card" style="padding: 16px;"><p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 4px;">Total Messages</p><p data-metric="total" style="font-size: 2rem; font-weight: 700; color: var(--accent);"></p></div>
          <div class="card" style="padding: 16px;"><p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 4px;">Unread</p><p data-metric="unread" style="font-size: 2rem; font-weight: 700; color: var(--warning);"></p></div>
          <div class="card" style="padding: 16px;"><p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 4px;">Avg/Day</p><p data-metric="avgPerDay" style="font-size: 2rem; font-weight: 700; color: var(--success);"></p></div>
        </div>
      </section>
      <section data-section="daily" style="margin-bottom: 32px;">
        <h3 style="margin-bottom: 16px;">Daily Activity (<span data-range></span>)</h3>
        <div class="card" style="padding: 16px;" data-chart="daily"></div>
      </section>
      <section data-section="sources">
        <h3 style="margin-bottom: 16px;">Message Sources</h3>
        <div class="card" style="padding: 16px;" data-chart="sources"></div>
      </section>
    `;
  }

  // Update summary metrics
  const summarySection = analyticsContainer.querySelector('[data-section="summary"]');
  if (summarySection) {
    summarySection.querySelector('[data-metric="total"]').textContent = currentAnalytics.total;
    summarySection.querySelector('[data-metric="unread"]').textContent = currentAnalytics.unread;
    summarySection.querySelector('[data-metric="avgPerDay"]').textContent = currentAnalytics.avgMessagesPerDay;
  }

  // Update time range label
  const rangeSpan = analyticsContainer.querySelector('[data-range]');
  if (rangeSpan) {
    rangeSpan.textContent = currentAnalytics.timeRange;
  }

  // Update daily chart
  const dailyChartContainer = analyticsContainer.querySelector('[data-chart="daily"]');
  if (dailyChartContainer) {
    const dailyChartData = Object.entries(currentAnalytics.dailyTotals || {})
      .map(([date, count]) => `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line);">
        <span>${escapeHtml(date)}</span>
        <strong>${count}</strong>
      </div>`)
      .join("");
    dailyChartContainer.innerHTML = dailyChartData || '<p style="color: var(--text-muted); text-align: center; padding: 24px;">No data available</p>';
  }

  // Update source chart
  const sourceChartContainer = analyticsContainer.querySelector('[data-chart="sources"]');
  if (sourceChartContainer) {
    const sourceData = Object.entries(currentAnalytics.sourceBreakdown || {})
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => `<div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--line);">
        <span>${escapeHtml(source === "direct" ? "Direct / No Referrer" : source)}</span>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 150px; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden;">
            <div style="width: ${(count / currentAnalytics.total) * 100}%; height: 100%; background: var(--accent);"></div>
          </div>
          <span style="min-width: 40px; text-align: right;"><strong>${count}</strong></span>
        </div>
      </div>`)
      .join("");
    sourceChartContainer.innerHTML = sourceData || '<p style="color: var(--text-muted); text-align: center; padding: 24px;">No source data available</p>';
  }
};

if (analyticsContainer && analyticsRange && analyticsFilter) {
  loadAnalytics("30d");

  analyticsRange.addEventListener("change", (e) => {
    const filter = analyticsFilter.value || null;
    loadAnalytics(e.target.value, filter);
  });

  analyticsFilter.addEventListener("change", (e) => {
    const range = analyticsRange.value || "30d";
    loadAnalytics(range, e.target.value || null);
  });
}

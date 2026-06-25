const tabMessages = document.getElementById("tab-messages");
const tabAnalytics = document.getElementById("tab-analytics");
const messagesSection = document.getElementById("messages-section");
const analyticsSection = document.getElementById("analytics-section");

if (tabMessages && tabAnalytics && messagesSection && analyticsSection) {
  tabMessages.addEventListener("click", () => {
    messagesSection.style.display = "block";
    analyticsSection.style.display = "none";
    tabMessages.style.borderBottomColor = "var(--accent)";
    tabMessages.style.color = "var(--text)";
    tabAnalytics.style.borderBottomColor = "transparent";
    tabAnalytics.style.color = "var(--text-muted)";
  });

  tabAnalytics.addEventListener("click", () => {
    messagesSection.style.display = "none";
    analyticsSection.style.display = "block";
    tabAnalytics.style.borderBottomColor = "var(--accent)";
    tabAnalytics.style.color = "var(--text)";
    tabMessages.style.borderBottomColor = "transparent";
    tabMessages.style.color = "var(--text-muted)";
  });
}

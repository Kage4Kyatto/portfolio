const tabMessages = document.getElementById("tab-messages");
const tabAnalytics = document.getElementById("tab-analytics");
const messagesSection = document.getElementById("messages-section");
const analyticsSection = document.getElementById("analytics-section");

if (tabMessages && tabAnalytics && messagesSection && analyticsSection) {
  const setActiveTab = (showAnalytics) => {
    messagesSection.classList.toggle("is-hidden", showAnalytics);
    analyticsSection.classList.toggle("is-hidden", !showAnalytics);

    tabMessages.classList.toggle("is-active", !showAnalytics);
    tabAnalytics.classList.toggle("is-active", showAnalytics);

    tabMessages.setAttribute("aria-selected", showAnalytics ? "false" : "true");
    tabAnalytics.setAttribute("aria-selected", showAnalytics ? "true" : "false");
  };

  tabMessages.addEventListener("click", () => {
    setActiveTab(false);
  });

  tabAnalytics.addEventListener("click", () => {
    setActiveTab(true);
  });

  setActiveTab(false);
}

// Updated 2026-07-07
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
    tabMessages.setAttribute("tabindex", showAnalytics ? "-1" : "0");
    tabAnalytics.setAttribute("tabindex", showAnalytics ? "0" : "-1");
  };

  const handleKeyNav = (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const showAnalytics = event.key === "ArrowRight";
    setActiveTab(showAnalytics);
    if (showAnalytics) {
      tabAnalytics.focus();
    } else {
      tabMessages.focus();
    }
  };

  tabMessages.addEventListener("click", () => {
    setActiveTab(false);
  });

  tabAnalytics.addEventListener("click", () => {
    setActiveTab(true);
  });

  tabMessages.addEventListener("keydown", handleKeyNav);
  tabAnalytics.addEventListener("keydown", handleKeyNav);

  setActiveTab(false);
}


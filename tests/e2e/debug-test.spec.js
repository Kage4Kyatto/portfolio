const { test, expect } = require("@playwright/test");

test("debug - check styles immediately after load before wait", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/index.html");
  
  // Check immediately after load
  const immediateState = await page.evaluate(() => {
    const aboutItem = document.querySelector('.nav-links a[href="/about.html"]')?.closest("li");
    const aboutStyle = getComputedStyle(aboutItem);
    return {
      phase: "immediate",
      visibility: aboutStyle.visibility,
      opacity: aboutStyle.opacity,
      pointerEvents: aboutStyle.pointerEvents,
      transition: aboutStyle.transition,
    };
  });
  console.log("Immediate:", JSON.stringify(immediateState));
  
  // Check after 200ms (transition duration)
  await page.waitForTimeout(300);
  const after300ms = await page.evaluate(() => {
    const aboutItem = document.querySelector('.nav-links a[href="/about.html"]')?.closest("li");
    const aboutStyle = getComputedStyle(aboutItem);
    return {
      phase: "after 300ms",
      visibility: aboutStyle.visibility,
      opacity: aboutStyle.opacity,
      pointerEvents: aboutStyle.pointerEvents,
    };
  });
  console.log("After 300ms:", JSON.stringify(after300ms));
  
  // Check after 4300ms
  await page.waitForTimeout(4000);
  await page.mouse.move(1000, 500);
  const after4300ms = await page.evaluate(() => {
    const aboutItem = document.querySelector('.nav-links a[href="/about.html"]')?.closest("li");
    const aboutStyle = getComputedStyle(aboutItem);
    return {
      phase: "after 4300ms + mouse move",
      visibility: aboutStyle.visibility,
      opacity: aboutStyle.opacity,
      pointerEvents: aboutStyle.pointerEvents,
      bodyClasses: [...document.body.classList],
    };
  });
  console.log("After 4300ms+move:", JSON.stringify(after4300ms));
});

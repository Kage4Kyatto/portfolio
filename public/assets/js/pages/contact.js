const contactForm = document.getElementById("contact-form");
const notice = document.getElementById("form-notice");
const submitButton = document.getElementById("contact-submit");

if (contactForm && notice) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const payload = {
      name: formData.get("name")?.toString().trim(),
      email: formData.get("email")?.toString().trim(),
      subject: formData.get("subject")?.toString().trim(),
      message: formData.get("message")?.toString().trim(),
      website: formData.get("website")?.toString().trim()
    };

    notice.textContent = "Sending...";
    notice.className = "notice";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }

    try {
      const response = await fetch("/api/contact.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to send message.");
      }

      notice.textContent = "Thanks. Your message has been sent.";
      notice.classList.add("success");
      contactForm.reset();
    } catch (error) {
      notice.textContent = error.message;
      notice.classList.add("error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "Submit";
      }
    }
  });
}

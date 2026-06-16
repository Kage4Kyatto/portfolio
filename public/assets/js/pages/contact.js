const contactForm = document.getElementById("contact-form");
const notice = document.getElementById("form-notice");
const submitButton = document.getElementById("contact-submit");

const getFastifyContactEndpoint = () => {
  const runtimeConfigUrl = window.PORTFOLIO_FASTIFY_URL?.trim();
  if (runtimeConfigUrl) {
    return `${runtimeConfigUrl.replace(/\/$/, "")}/contact`;
  }

  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isLocalHost) {
    return null;
  }

  return `http://${window.location.hostname}:4001/contact`;
};

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
      const endpoints = [];
      const fastifyContactEndpoint = getFastifyContactEndpoint();

      if (fastifyContactEndpoint) {
        endpoints.push(fastifyContactEndpoint);
      }

      endpoints.push("/api/contact", "/api/contact.php");
      let result = null;
      let lastError = new Error("Failed to send message.");

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          const contentType = response.headers.get("content-type") || "";
          const bodyText = await response.text();
          let parsed = null;

          if (bodyText) {
            try {
              parsed = JSON.parse(bodyText);
            } catch {
              parsed = null;
            }
          }

          if (response.ok) {
            result = parsed || { success: true };
            break;
          }

          const fallbackMessage = contentType.includes("application/json")
            ? "Failed to send message."
            : "API endpoint responded with non-JSON content.";

          throw new Error(parsed?.message || fallbackMessage);
        } catch (error) {
          lastError = error;
        }
      }

      if (!result) {
        throw lastError;
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

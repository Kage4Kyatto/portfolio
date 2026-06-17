const contactForm = document.getElementById("contact-form");
const notice = document.getElementById("form-notice");
const submitButton = document.getElementById("contact-submit");

const parseJsonSafely = (value) => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const setSubmitState = (isSubmitting) => {
  if (!submitButton) {
    return;
  }

  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "Sending..." : "Submit";
};

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
    setSubmitState(true);

    try {
      const endpointSet = new Set();
      const fastifyContactEndpoint = getFastifyContactEndpoint();

      if (fastifyContactEndpoint) {
        endpointSet.add(fastifyContactEndpoint);
      }

      endpointSet.add("/api/contact");
      endpointSet.add("/api/contact.php");
      const endpoints = [...endpointSet];

      let result = null;
      let lastError = new Error("Failed to send message.");

      for (const endpoint of endpoints) {
        let timeoutId = 0;
        try {
          const controller = new AbortController();
          timeoutId = window.setTimeout(() => controller.abort(), 8000);

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          const contentType = response.headers.get("content-type") || "";
          const bodyText = await response.text();
          const parsed = parseJsonSafely(bodyText);

          if (response.ok) {
            result = parsed || { success: true };
            break;
          }

          const fallbackMessage = contentType.includes("application/json")
            ? "Failed to send message."
            : "API endpoint responded with non-JSON content.";

          throw new Error(parsed?.message || fallbackMessage);
        } catch (error) {
          const isAbort = error?.name === "AbortError";
          lastError = isAbort ? new Error("Request timed out.") : error;
        } finally {
          if (timeoutId) {
            window.clearTimeout(timeoutId);
          }
        }
      }

      if (!result) {
        throw lastError;
      }

      notice.textContent = "Thanks. Your message has been sent.";
      notice.classList.add("success");
      contactForm.reset();
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : "Failed to send message.";
      notice.classList.add("error");
    } finally {
      setSubmitState(false);
    }
  });
}

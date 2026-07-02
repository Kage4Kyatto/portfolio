const contactForm = document.getElementById("contact-form");
const notice = document.getElementById("form-notice");
const submitButton = document.getElementById("contact-submit");
const CONTACT_LOCALE_STORAGE_KEY = "portfolio.locale";

let activeLocale = localStorage.getItem(CONTACT_LOCALE_STORAGE_KEY) || "en";
let localeDictionary = {};

const t = (key, fallback) => localeDictionary[key] || fallback;

const loadLocaleDictionary = async (locale) => {
  try {
    // Use 'default' to respect Cache-Control headers from server
    const response = await fetch(`/assets/i18n/${locale}.json`);
    if (!response.ok) {
      console.warn(`Failed to load locale file for ${locale}: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    localeDictionary = data;
  } catch (error) {
    console.warn(`Error loading locale dictionary for ${locale}:`, error.message);
    // Ignore translation loading errors and keep fallback text
  }
};

window.addEventListener("portfolio:locale-changed", (event) => {
  activeLocale = event.detail?.locale || activeLocale;
  localeDictionary = event.detail?.dictionary || localeDictionary;

  if (submitButton && !submitButton.disabled) {
    submitButton.textContent = t("contact_form_submit", activeLocale === "nl" ? "Verzenden" : "Submit");
  }
});

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
  submitButton.classList.toggle("loading", isSubmitting);
  submitButton.textContent = isSubmitting
    ? t("contact_runtime_sending", activeLocale === "nl" ? "Verzenden..." : "Sending...")
    : t("contact_form_submit", activeLocale === "nl" ? "Verzenden" : "Submit");
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

const createIdempotencyKey = async (payload) => {
  const normalized = JSON.stringify({
    name: payload.name,
    email: payload.email,
    subject: payload.subject,
    message: payload.message
  });

  if (window.crypto?.subtle && window.TextEncoder) {
    const bytes = new TextEncoder().encode(normalized);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  return `fallback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

if (contactForm && notice) {
  if (activeLocale === "nl") {
    loadLocaleDictionary(activeLocale).finally(() => {
      if (!submitButton?.disabled) {
        submitButton.textContent = t("contact_form_submit", "Verzenden");
      }
    });
  } else if (!submitButton?.disabled) {
    submitButton.textContent = "Submit";
  }

  if (window.validation) {
    window.validation.setupLiveValidation(contactForm);
  }

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

    if (window.validation) {
      const validation = window.validation.validateForm(payload);
      if (!validation.valid) {
        for (const [field, message] of Object.entries(validation.errors)) {
          const input = contactForm.querySelector(`[name="${field}"]`);
          if (input) {
            window.validation.showFieldError(input, message);
          }
        }
        window.toast?.error(t("contact_runtime_fix_errors", activeLocale === "nl" ? "Corrigeer de formulierfouten." : "Please correct the form errors."));
        return;
      }
    }

    notice.textContent = t("contact_runtime_sending", activeLocale === "nl" ? "Verzenden..." : "Sending...");
    notice.className = "notice";
    setSubmitState(true);

    try {
      const idempotencyKey = await createIdempotencyKey(payload);
      const fastifyContactEndpoint = getFastifyContactEndpoint();

      // Primary endpoint: Node Express API
      const endpoints = ["/api/contact"];

      // Optional secondary endpoint: Fastify API
      if (fastifyContactEndpoint) {
        endpoints.push(fastifyContactEndpoint);
      }

      // Final fallback: PHP API (legacy)
      endpoints.push("/api/contact.php");

      let result = null;
      let lastError = new Error(t("contact_runtime_failed_send", activeLocale === "nl" ? "Bericht verzenden mislukt." : "Failed to send message."));

      for (const endpoint of endpoints) {
        let timeoutId = 0;
        try {
          const controller = new AbortController();
          timeoutId = window.setTimeout(() => controller.abort(), 8000);

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Idempotency-Key": idempotencyKey
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
            ? t("contact_runtime_failed_send", activeLocale === "nl" ? "Bericht verzenden mislukt." : "Failed to send message.")
            : t("contact_runtime_non_json", activeLocale === "nl" ? "API-eindpunt reageerde met geen JSON-inhoud." : "API endpoint responded with non-JSON content.");

          throw new Error(parsed?.message || fallbackMessage);
        } catch (error) {
          const isAbort = error?.name === "AbortError";
          if (isAbort) {
            throw new Error(t(
              "contact_runtime_timeout",
              activeLocale === "nl" ? "Time-out van aanvraag. Probeer opnieuw." : "Request timed out. Please try again."
            ));
          }

          lastError = isAbort
            ? new Error(t("contact_runtime_timeout", activeLocale === "nl" ? "Time-out van aanvraag." : "Request timed out."))
            : error;
        } finally {
          if (timeoutId) {
            window.clearTimeout(timeoutId);
          }
        }
      }

      if (!result) {
        throw lastError;
      }

      notice.textContent = t("contact_runtime_sent_notice", activeLocale === "nl" ? "Bedankt. Je bericht is verzonden." : "Thanks. Your message has been sent.");
      notice.classList.add("success");
      if (window.toast) {
        window.toast.success(t("contact_runtime_sent_toast", activeLocale === "nl" ? "Bericht succesvol verzonden!" : "Message sent successfully!"));
      }
      contactForm.reset();
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : t("contact_runtime_failed_send", activeLocale === "nl" ? "Bericht verzenden mislukt." : "Failed to send message.");
      notice.textContent = errorMessage;
      notice.classList.add("error");
      if (window.toast) {
        window.toast.error(errorMessage);
      }
    } finally {
      setSubmitState(false);
    }
  });
}

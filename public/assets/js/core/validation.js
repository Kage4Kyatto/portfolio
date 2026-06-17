const VALIDATION_RULES = {
  name: {
    required: true,
    minLength: 2,
    maxLength: 100,
    pattern: /^[a-zA-Z\s'-]+$/,
    message: "Name must be 2-100 characters and contain only letters, spaces, hyphens, or apostrophes."
  },
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: "Please enter a valid email address."
  },
  subject: {
    required: true,
    minLength: 3,
    maxLength: 200,
    message: "Subject must be 3-200 characters."
  },
  message: {
    required: true,
    minLength: 10,
    maxLength: 5000,
    message: "Message must be 10-5000 characters."
  }
};

const validateField = (name, value) => {
  const rules = VALIDATION_RULES[name];
  if (!rules) return { valid: true };

  const trimmed = String(value || "").trim();

  if (rules.required && !trimmed) {
    return { valid: false, message: `${name} is required.` };
  }

  if (rules.minLength && trimmed.length < rules.minLength) {
    return { valid: false, message: rules.message || `${name} is too short.` };
  }

  if (rules.maxLength && trimmed.length > rules.maxLength) {
    return { valid: false, message: rules.message || `${name} is too long.` };
  }

  if (rules.pattern && !rules.pattern.test(trimmed)) {
    return { valid: false, message: rules.message || `${name} format is invalid.` };
  }

  return { valid: true };
};

const validateForm = (formData) => {
  const errors = {};

  for (const [name, value] of Object.entries(formData)) {
    const result = validateField(name, value);
    if (!result.valid) {
      errors[name] = result.message;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
};

const showFieldError = (inputElement, message) => {
  const container = inputElement.closest(".form-field") || inputElement.parentElement;
  let errorEl = container.querySelector(".field-error");

  if (!errorEl) {
    errorEl = document.createElement("span");
    errorEl.className = "field-error";
    container.appendChild(errorEl);
  }

  errorEl.textContent = message;
  inputElement.setAttribute("aria-invalid", "true");
  inputElement.classList.add("input-error");
};

const clearFieldError = (inputElement) => {
  const container = inputElement.closest(".form-field") || inputElement.parentElement;
  const errorEl = container.querySelector(".field-error");

  if (errorEl) {
    errorEl.remove();
  }

  inputElement.setAttribute("aria-invalid", "false");
  inputElement.classList.remove("input-error");
};

const setupLiveValidation = (formElement) => {
  const inputs = formElement.querySelectorAll("input, textarea");

  inputs.forEach((input) => {
    input.addEventListener("blur", () => {
      const result = validateField(input.name, input.value);
      if (!result.valid) {
        showFieldError(input, result.message);
      } else {
        clearFieldError(input);
      }
    });

    input.addEventListener("input", () => {
      const result = validateField(input.name, input.value);
      if (result.valid) {
        clearFieldError(input);
      }
    });
  });
};

window.validation = {
  validateField,
  validateForm,
  showFieldError,
  clearFieldError,
  setupLiveValidation
};

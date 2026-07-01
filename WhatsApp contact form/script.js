/**
 * A compact but practical list of countries for the dial-code dropdown.
 * Not exhaustive (the full ITU list has 200+ entries) — trimmed to common
 * markets. Add more entries here if you need others; each needs an ISO
 * code (for the flag emoji), a display name, and a dial code.
 */
const COUNTRY_CODES = [
  { iso: "FR", name: "France", dialCode: "33" },
  { iso: "GB", name: "United Kingdom", dialCode: "44" },
  { iso: "US", name: "United States", dialCode: "1" },
  { iso: "CA", name: "Canada", dialCode: "1" },
  { iso: "DE", name: "Germany", dialCode: "49" },
  { iso: "ES", name: "Spain", dialCode: "34" },
  { iso: "IT", name: "Italy", dialCode: "39" },
  { iso: "PT", name: "Portugal", dialCode: "351" },
  { iso: "BE", name: "Belgium", dialCode: "32" },
  { iso: "CH", name: "Switzerland", dialCode: "41" },
  { iso: "NL", name: "Netherlands", dialCode: "31" },
  { iso: "IE", name: "Ireland", dialCode: "353" },
  { iso: "MA", name: "Morocco", dialCode: "212" },
  { iso: "DZ", name: "Algeria", dialCode: "213" },
  { iso: "TN", name: "Tunisia", dialCode: "216" },
  { iso: "SA", name: "Saudi Arabia", dialCode: "966" },
  { iso: "AE", name: "United Arab Emirates", dialCode: "971" },
  { iso: "EG", name: "Egypt", dialCode: "20" },
  { iso: "TR", name: "Turkey", dialCode: "90" },
  { iso: "IN", name: "India", dialCode: "91" },
  { iso: "CN", name: "China", dialCode: "86" },
  { iso: "JP", name: "Japan", dialCode: "81" },
  { iso: "AU", name: "Australia", dialCode: "61" },
  { iso: "BR", name: "Brazil", dialCode: "55" },
];

/** Converts a 2-letter ISO country code into its flag emoji (e.g. "FR" -> 🇫🇷). */
function isoToFlagEmoji(iso) {
  return iso
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * WhatsApp Contact Form
 * Validates a contact form client-side, then opens WhatsApp
 * (web or app) with a pre-filled message built from the submission.
 */
class WhatsAppForm {
  /**
   * @param {string} formId - id of the <form> element
   * @param {string} whatsappNumber - YOUR destination number (the business/owner's
   *   WhatsApp), international format, digits only, e.g. "33668567513"
   * @param {string} [defaultIso="FR"] - ISO code to preselect in the visitor's
   *   country dropdown (their own phone number, included in the message text)
   */
  constructor(formId, whatsappNumber, defaultIso = "FR") {
    this.form = document.getElementById(formId);

    if (!this.form) {
      throw new Error(`WhatsAppForm: no form found with id "${formId}"`);
    }

    this.whatsappNumber = whatsappNumber;
    this.fields = {
      name: this.form.elements.name,
      email: this.form.elements.email,
      countryCode: this.form.elements["country-code"],
      phone: this.form.elements.phone,
      message: this.form.elements.message,
      honeypot: this.form.elements.company,
    };

    this.toast = document.getElementById("toast");
    this.toastTextEl = this.toast?.querySelector(".toast-text") ?? null;
    this.toastHideTimer = null;

    this.#populateCountryDropdown(defaultIso);

    this.validators = {
      name: (value) => (value.trim().length >= 2 ? null : "Please enter your name."),
      email: (value) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : "Please enter a valid email."),
      // National number only now — the dial code is handled by the dropdown.
      // Accepts digits, spaces, and dashes (no "+", that's implicit from the select).
      phone: (value) =>
        /^[\d\s-]{6,15}$/.test(value.trim()) ? null : "Please enter a valid phone number.",
    };

    this.form.addEventListener("submit", (event) => this.#handleSubmit(event));
  }

  /** Fills the <select> with COUNTRY_CODES, sorted by name, flag-prefixed. */
  #populateCountryDropdown(defaultIso) {
    const select = this.fields.countryCode;
    const sorted = [...COUNTRY_CODES].sort((a, b) => a.name.localeCompare(b.name));

    for (const country of sorted) {
      const option = document.createElement("option");
      option.value = country.dialCode;
      option.dataset.iso = country.iso;
      option.textContent = `${isoToFlagEmoji(country.iso)} ${country.name} (+${country.dialCode})`;
      select.appendChild(option);
    }

    const defaultCountry = COUNTRY_CODES.find((c) => c.iso === defaultIso);
    if (defaultCountry) {
      const defaultOption = select.querySelector(`option[data-iso="${defaultIso}"]`);
      if (defaultOption) {
        // Set the "selected" attribute (not just .value) so that a later
        // form.reset() call restores this option instead of reverting to
        // whichever option happens to be first in the list.
        defaultOption.setAttribute("selected", "");
      }
      select.value = defaultCountry.dialCode;
    }
  }

  #handleSubmit(event) {
    event.preventDefault();

    // Spam check first: if the honeypot has a value, a bot filled it in.
    // Real visitors never see this field, so any value here is a strong
    // signal of automated spam. Bail out silently — no error message,
    // no WhatsApp window — so the bot gets no feedback to adapt to.
    if (this.#isSpam()) {
      return;
    }

    const isValid = this.#validate();
    if (!isValid) return;

    const url = this.#buildWhatsAppUrl();
    const whatsappWindow = window.open(url, "_blank", "noopener,noreferrer");

    // window.open returns null (or a closed/undefined-COM window in some
    // browsers) if the popup was blocked. Only celebrate success, and only
    // reset the form, if WhatsApp actually had a chance to open.
    if (whatsappWindow) {
      this.#showToast("Opening WhatsApp with your message…");
      this.form.reset();
      this.#clearAllErrors();
    } else {
      this.#showToast("Pop-up blocked — please allow pop-ups and try again.", { isError: true });
    }
  }

  /** Returns true if the honeypot field has been filled in (a bot signal). */
  #isSpam() {
    return this.fields.honeypot.value.trim().length > 0;
  }

  /** Clears any leftover validation error states (used after a successful reset). */
  #clearAllErrors() {
    for (const fieldName of Object.keys(this.validators)) {
      this.#setFieldError(fieldName, null);
    }
  }

  /**
   * Shows the toast with the given message and auto-hides it after a delay.
   * Re-triggering while a toast is already visible resets the timer rather
   * than stacking multiple toasts.
   */
  #showToast(message, { isError = false, duration = 4000 } = {}) {
    if (!this.toast) return;

    if (this.toastHideTimer) {
      clearTimeout(this.toastHideTimer);
    }

    if (this.toastTextEl) this.toastTextEl.textContent = message;

    const iconEl = this.toast.querySelector(".toast-icon");
    if (iconEl) iconEl.textContent = isError ? "!" : "✓";

    this.toast.classList.toggle("toast--error", isError);
    this.toast.hidden = false;

    // Defer adding the visible class one frame so the browser registers
    // the starting (hidden) state first and the opacity/transform actually
    // transitions instead of jumping straight to the end state.
    requestAnimationFrame(() => {
      this.toast.classList.add("is-visible");
    });

    this.toastHideTimer = setTimeout(() => this.#hideToast(), duration);
  }

  #hideToast() {
    if (!this.toast) return;
    this.toast.classList.remove("is-visible");
    // Wait for the fade-out transition to finish before fully hiding,
    // so screen readers / layout don't yank it away mid-animation.
    setTimeout(() => {
      this.toast.hidden = true;
    }, 250);
  }

  /** Runs all validators and renders error messages. Returns true if every field passes. */
  #validate() {
    let allValid = true;

    for (const [fieldName, validate] of Object.entries(this.validators)) {
      const input = this.fields[fieldName];
      const error = validate(input.value);
      this.#setFieldError(fieldName, error);
      if (error) allValid = false;
    }

    return allValid;
  }

  #setFieldError(fieldName, message) {
    const input = this.fields[fieldName];
    const errorEl = this.form.querySelector(`[data-error-for="${fieldName}"]`);

    input.classList.toggle("invalid", Boolean(message));
    input.setAttribute("aria-invalid", message ? "true" : "false");

    if (errorEl) errorEl.textContent = message || "";
  }

  /** Builds the wa.me URL with a properly encoded, formatted message. */
  #buildWhatsAppUrl() {
    const name = this.fields.name.value.trim();
    const email = this.fields.email.value.trim();
    const dialCode = this.fields.countryCode.value;
    const nationalNumber = this.fields.phone.value.trim();
    const fullPhone = `+${dialCode} ${nationalNumber}`;
    const message = this.fields.message.value.trim() || "—";

    const text = [
      `*New contact form submission*`,
      ``,
      `*Name:* ${name}`,
      `*Email:* ${email}`,
      `*Phone:* ${fullPhone}`,
      `*Message:* ${message}`,
    ].join("\n");

    // This always opens a chat with YOUR configured WhatsApp number —
    // the visitor's own number above is just included as contact info in the text.
    return `https://wa.me/${this.whatsappNumber}?text=${encodeURIComponent(text)}`;
  }
}

// Bootstrap once the DOM is ready.
document.addEventListener("DOMContentLoaded", () => {
  // 1st arg: YOUR WhatsApp number (digits only, no "+").
  // 2nd arg: default country preselected in the visitor's dropdown.
  new WhatsAppForm("contact-form", "33668567513", "FR");
});


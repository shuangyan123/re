/* global HTMLButtonElement, HTMLFormElement, HTMLSelectElement, HTMLElement, URLSearchParams, document, history, window */

(() => {
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#primary-navigation");

  if (navToggle instanceof HTMLButtonElement && nav instanceof HTMLElement) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.getAttribute("data-open") === "true";
      nav.setAttribute("data-open", String(!isOpen));
      navToggle.setAttribute("aria-expanded", String(!isOpen));
    });
  }

  const localeSwitcher = document.querySelector("[data-locale-switcher]");
  const localeStorageKey = "tutor-benchmark-ui-locale";

  function isSiteLocale(value) {
    return value === "en" || value === "zh-CN";
  }

  function storedLocale() {
    try {
      const value = window.localStorage.getItem(localeStorageKey);
      return isSiteLocale(value) ? value : null;
    } catch {
      return null;
    }
  }

  function applyLocale(locale) {
    if (!isSiteLocale(locale)) {
      return;
    }
    document.documentElement.lang = locale;
    document.documentElement.dataset.uiLocale = locale;
    document.querySelectorAll("[data-ui-text]").forEach((element) => {
      const attribute = locale === "zh-CN" ? "data-ui-text-zh-cn" : "data-ui-text-en";
      const translated = element.getAttribute(attribute);
      if (translated !== null) {
        element.textContent = translated;
      }
    });
    if (localeSwitcher instanceof HTMLSelectElement) {
      localeSwitcher.value = locale;
      const label = document.querySelector('[data-ui-text="selectLanguage"]');
      if (label instanceof HTMLElement && label.textContent !== null) {
        localeSwitcher.setAttribute("aria-label", label.textContent);
      }
    }
  }

  const initialLocale = storedLocale() ?? document.documentElement.dataset.uiLocale ?? "en";
  applyLocale(initialLocale);
  if (localeSwitcher instanceof HTMLSelectElement) {
    localeSwitcher.addEventListener("change", () => {
      const locale = localeSwitcher.value;
      if (!isSiteLocale(locale)) {
        return;
      }
      try {
        window.localStorage.setItem(localeStorageKey, locale);
      } catch {
        // A private browsing policy may deny storage; the current page still switches.
      }
      applyLocale(locale);
    });
  }

  const filterForm = document.querySelector("#case-filters");
  if (!(filterForm instanceof HTMLFormElement)) {
    return;
  }

  const filterFields = Array.from(
    filterForm.querySelectorAll("[data-case-filter]"),
  ).filter((field) => field instanceof HTMLSelectElement);
  const cards = Array.from(document.querySelectorAll("[data-case-card]"));
  const resultCount = document.querySelector("#case-result-count");
  const emptyState = document.querySelector("#case-filter-empty");
  const parameterByFilter = {
    subject: "subject",
    learnerLevel: "learnerLevel",
    taskDifficulty: "taskDifficulty",
    pedagogicalDifficulty: "pedagogicalDifficulty",
    capability: "capability",
    studentState: "studentState",
    disclosurePolicy: "disclosurePolicy",
  };

  function readValues() {
    return Object.fromEntries(
      filterFields.map((field) => [field.dataset.caseFilter ?? "", field.value]),
    );
  }

  function matches(card, values) {
    const subject = card.dataset.caseSubject ?? "";
    const learnerLevel = card.dataset.caseLearnerLevel ?? "";
    const taskDifficulty = card.dataset.caseTaskDifficulty ?? "";
    const pedagogicalDifficulty = card.dataset.casePedagogicalDifficulty ?? "";
    const capabilities = (card.dataset.caseCapabilities ?? "").split(" ");
    const studentState = card.dataset.caseStudentState ?? "";
    const disclosurePolicy = card.dataset.caseDisclosurePolicy ?? "";
    return (
      (!values.subject || values.subject === subject) &&
      (!values.learnerLevel || values.learnerLevel === learnerLevel) &&
      (!values.taskDifficulty || values.taskDifficulty === taskDifficulty) &&
      (!values.pedagogicalDifficulty || values.pedagogicalDifficulty === pedagogicalDifficulty) &&
      (!values.capability || capabilities.includes(values.capability)) &&
      (!values.studentState || values.studentState === studentState) &&
      (!values.disclosurePolicy || values.disclosurePolicy === disclosurePolicy)
    );
  }

  function updateUrl(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value) {
        params.set(parameterByFilter[key] ?? key, value);
      }
    });
    const query = params.toString();
    history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function update(syncUrl = true) {
    const values = readValues();
    let visibleCount = 0;
    cards.forEach((card) => {
      const visible = matches(card, values);
      card.hidden = !visible;
      card.setAttribute("aria-hidden", String(!visible));
      if (visible) {
        visibleCount += 1;
      }
    });
    if (resultCount instanceof HTMLElement) {
      resultCount.textContent = `Showing ${visibleCount} case${visibleCount === 1 ? "" : "s"}`;
    }
    if (emptyState instanceof HTMLElement) {
      emptyState.hidden = visibleCount !== 0;
    }
    if (syncUrl) {
      updateUrl(values);
    }
  }

  const params = new URLSearchParams(window.location.search);
  filterFields.forEach((field) => {
    const value = params.get(field.dataset.caseFilter ?? "");
    if (value !== null && Array.from(field.options).some((option) => option.value === value)) {
      field.value = value;
    }
  });

  filterForm.addEventListener("change", () => update());
  filterForm.addEventListener("reset", () => {
    window.setTimeout(() => update(), 0);
  });
  update(false);
})();

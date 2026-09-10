/* global document, fetch, URL, window */

(function () {
  "use strict";

  const portalStatus = document.getElementById("portal-status");
  const portalState = document.getElementById("portal-state");
  const portalPath = "/reviewer/";
  const callbackPath = "/reviewer/callback";
  let configuration;
  let auth0Client;
  let accessToken;

  function setStatus(message, kind) {
    portalStatus.textContent = message;
    if (kind === undefined) {
      portalStatus.removeAttribute("data-kind");
    } else {
      portalStatus.setAttribute("data-kind", kind);
    }
  }

  function clearState() {
    portalState.replaceChildren();
  }

  function paragraph(text, className) {
    const element = document.createElement("p");
    element.className = className || "state-copy";
    element.textContent = text;
    return element;
  }

  function button(label, className, handler) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    if (className !== undefined) element.className = className;
    element.addEventListener("click", handler);
    return element;
  }

  function actionRow() {
    const element = document.createElement("div");
    element.className = "action-row";
    return element;
  }

  function renderDisabled() {
    clearState();
    setStatus("Unavailable");
    portalState.appendChild(paragraph("The private reviewer portal is not enabled."));
  }

  function renderSignedOut(message) {
    clearState();
    setStatus(message || "Invite-only access");
    portalState.appendChild(paragraph("Reviewer access is available only to accounts enabled by the Community Review service."));
    const actions = actionRow();
    actions.appendChild(button("Sign in", undefined, function () {
      void beginLogin();
    }));
    portalState.appendChild(actions);
  }

  function renderAuthenticating(message) {
    clearState();
    setStatus(message || "Signing you in…");
    portalState.appendChild(paragraph("Completing the secure sign-in step. This page will not display your identity or token details."));
  }

  function renderUnprovisioned() {
    clearState();
    setStatus("Access not enabled", "error");
    portalState.appendChild(paragraph("Reviewer access is not enabled for this account."));
    const actions = actionRow();
    actions.appendChild(button("Sign out", "secondary", function () {
      void signOut();
    }));
    portalState.appendChild(actions);
  }

  function renderReviewer() {
    clearState();
    setStatus("Access verified");
    portalState.appendChild(paragraph("Reviewer access verified."));
    portalState.appendChild(paragraph("Consent and qualification workflow is not available in this phase.", "state-note"));
    const actions = actionRow();
    actions.appendChild(button("Sign out", "secondary", function () {
      void signOut();
    }));
    portalState.appendChild(actions);
  }

  function renderError(message) {
    clearState();
    setStatus("Sign-in could not be completed", "error");
    portalState.appendChild(paragraph(message || "Please try again. No reviewer data was loaded."));
    const actions = actionRow();
    actions.appendChild(button("Try sign in again", undefined, function () {
      void beginLogin();
    }));
    actions.appendChild(button("Sign out", "secondary", function () {
      void signOut();
    }));
    portalState.appendChild(actions);
  }

  function cleanCallbackUrl() {
    window.history.replaceState(null, document.title, portalPath);
  }

  function validConfiguration(value) {
    if (!value || typeof value !== "object" || value.portalPath !== portalPath ||
      value.callbackPath !== callbackPath || typeof value.enabled !== "boolean") return false;
    if (!value.enabled) return true;
    if (typeof value.issuer !== "string" || typeof value.clientId !== "string" ||
      typeof value.audience !== "string" || typeof value.scope !== "string") return false;
    let issuer;
    try {
      issuer = new URL(value.issuer);
    } catch {
      return false;
    }
    return issuer.protocol === "https:" && issuer.username === "" && issuer.password === "" &&
      issuer.hash === "" && issuer.search === "" && issuer.pathname === "/" &&
      value.clientId.length > 0 && value.audience.length > 0 && value.scope.length > 0 &&
      !/\s/u.test(value.clientId) && !/\s/u.test(value.audience) && !/\s/u.test(value.scope);
  }

  async function loadConfiguration() {
    const response = await fetch("/reviewer/config.json", {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("portal_config_unavailable");
    const value = await response.json();
    if (!validConfiguration(value)) throw new Error("portal_config_invalid");
    return value;
  }

  function callbackPresent() {
    return window.location.pathname === callbackPath &&
      (window.location.search.includes("code=") || window.location.search.includes("error="));
  }

  async function getAccessTokenFromMemory() {
    if (accessToken !== undefined) return accessToken;
    accessToken = await auth0Client.getTokenSilently({
      cacheMode: "cache-only",
      authorizationParams: {
        audience: configuration.audience,
        scope: configuration.scope,
      },
    });
    return accessToken;
  }

  async function bootstrap() {
    const token = await getAccessTokenFromMemory();
    const response = await fetch("/v1/reviewer/session", {
      cache: "no-store",
      credentials: "omit",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    });
    if (response.status === 403) {
      accessToken = undefined;
      renderUnprovisioned();
      return;
    }
    if (response.status === 401) {
      accessToken = undefined;
      renderError("Your sign-in session has expired. Please sign in again.");
      return;
    }
    if (!response.ok) throw new Error("reviewer_session_unavailable");
    const body = await response.json();
    const data = body && body.data;
    if (!data || data.reviewerAccess !== "ENABLED") throw new Error("reviewer_session_invalid");
    renderReviewer();
  }

  async function beginLogin() {
    if (configuration === undefined || !configuration.enabled) return;
    renderAuthenticating("Opening secure sign-in…");
    try {
      await auth0Client.loginWithRedirect({
        authorizationParams: {
          audience: configuration.audience,
          scope: configuration.scope,
          redirect_uri: window.location.origin + configuration.callbackPath,
        },
      });
    } catch {
      renderError("The sign-in service is unavailable. Please try again.");
    }
  }

  async function signOut() {
    accessToken = undefined;
    if (auth0Client === undefined || configuration === undefined || !configuration.enabled) {
      renderSignedOut();
      return;
    }
    try {
      await auth0Client.logout({
        logoutParams: { returnTo: window.location.origin + configuration.portalPath },
      });
    } catch {
      renderSignedOut();
    }
  }

  async function initialize() {
    try {
      configuration = await loadConfiguration();
      if (!configuration.enabled) {
        if (window.location.pathname === callbackPath) cleanCallbackUrl();
        renderDisabled();
        return;
      }
      if (!window.auth0 || typeof window.auth0.Auth0Client !== "function") {
        throw new Error("auth0_sdk_unavailable");
      }
      auth0Client = new window.auth0.Auth0Client({
        domain: new URL(configuration.issuer).host,
        clientId: configuration.clientId,
        cacheLocation: "memory",
        useRefreshTokens: false,
        authorizationParams: {
          audience: configuration.audience,
          scope: configuration.scope,
          redirect_uri: window.location.origin + configuration.callbackPath,
        },
      });
      if (callbackPresent()) {
        renderAuthenticating("Completing secure sign-in…");
        try {
          await auth0Client.handleRedirectCallback();
        } finally {
          cleanCallbackUrl();
        }
        await bootstrap();
        return;
      }
      if (await auth0Client.isAuthenticated()) {
        renderAuthenticating("Checking reviewer access…");
        await bootstrap();
      } else {
        renderSignedOut();
      }
    } catch {
      accessToken = undefined;
      renderError("The reviewer portal could not be loaded. Please try again.");
    }
  }

  void initialize();
}());

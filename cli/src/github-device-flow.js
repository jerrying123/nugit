/**
 * GitHub OAuth device flow (no backend). Client id from resolveGithubOAuthClientId() (bundled default or GITHUB_OAUTH_CLIENT_ID).
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
 */

/**
 * @param {string} clientId
 * @param {string} scope space-separated
 */
export async function githubDeviceFlowRequestCode(clientId, scope) {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope
    })
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    const msg = payload.error_description || payload.error || payload.message || `HTTP ${response.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(payload));
  }
  return payload;
}

/**
 * @param {string} clientId
 * @param {string} deviceCode
 */
export async function githubDeviceFlowPollAccessToken(clientId, deviceCode) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text, error: "parse_error" };
  }
  if (!response.ok && !payload.error) {
    payload.error = `http_${response.status}`;
  }
  return payload;
}

function decodeQuotedPrintable(value) {
  return value
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function messageHeaders(rawMessage) {
  return rawMessage.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
}

function isAddressedTo(rawMessage, recipient) {
  const to = messageHeaders(rawMessage).match(/^To:\s*(.+)$/im)?.[1] || '';
  const escapedRecipient = recipient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[<\\s,])${escapedRecipient}(?=$|[>\\s,;])`, 'i').test(to);
}

export function extractAccountLink(rawMessage, expectedPath) {
  if (typeof rawMessage !== 'string' || !expectedPath) {
    throw new Error('SMTP message and expected account path are required');
  }

  const decoded = decodeQuotedPrintable(rawMessage).replaceAll('&amp;', '&');
  const candidates = decoded.match(/https?:\/\/[^\s<>"']+/g) || [];
  for (const candidate of candidates) {
    let link;
    try {
      link = new URL(candidate.replace(/[),.;]+$/, ''));
    } catch {
      continue;
    }
    if (link.pathname === expectedPath && link.searchParams.get('token')) return link;
  }

  throw new Error(`SMTP message did not contain an account link for ${expectedPath}`);
}

async function waitForAccountLink({
  smtpMessages,
  recipient,
  expectedPath,
  afterIndex,
  timeoutMs = 2_000,
  pollIntervalMs = 10,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    for (const rawMessage of smtpMessages.slice(afterIndex)) {
      if (!isAddressedTo(rawMessage, recipient)) continue;
      try {
        return extractAccountLink(rawMessage, expectedPath);
      } catch {
        // The same recipient may have other account emails in the sink.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`SMTP sink did not receive ${expectedPath} mail for the acceptance user`);
}

async function requestJson({
  fetchImpl,
  apiBase,
  method,
  path,
  body,
  cookie,
  expectedStatus,
  label,
}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const response = await fetchImpl(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status !== expectedStatus) {
    throw new Error(`${label} expected HTTP ${expectedStatus}, got ${response.status}`);
  }
  return {
    data,
    cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie || '',
  };
}

async function verifyConcurrentSingleConsumption({
  fetchImpl,
  apiBase,
  method,
  path,
  body,
  label,
}) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  const responses = await Promise.all([
    fetchImpl(`${apiBase}${path}`, options),
    fetchImpl(`${apiBase}${path}`, options),
  ]);
  const statuses = responses.map(({ status }) => status).sort((a, b) => a - b);
  if (statuses[0] !== 200 || statuses[1] !== 400) {
    throw new Error(`${label} expected one HTTP 200 and one HTTP 400, got ${statuses.join(', ')}`);
  }
}

export async function verifyAuthEmailTokenFlow({
  apiBase,
  smtpMessages,
  email,
  password,
  newPassword,
  fetchImpl = fetch,
}) {
  const registered = await requestJson({
    fetchImpl,
    apiBase,
    method: 'POST',
    path: '/auth/register',
    body: { email, password, nickname: '邮件令牌验收' },
    expectedStatus: 201,
    label: 'register acceptance user',
  });

  const verificationMailIndex = smtpMessages.length;
  const sentVerification = await requestJson({
    fetchImpl,
    apiBase,
    method: 'POST',
    path: '/auth/send-verify',
    body: {},
    cookie: registered.cookie,
    expectedStatus: 200,
    label: 'send verification email',
  });
  if (sentVerification.data?.devToken) {
    throw new Error('production verification response exposed a dev token');
  }

  const verificationLink = await waitForAccountLink({
    smtpMessages,
    recipient: email,
    expectedPath: '/app/verify-email',
    afterIndex: verificationMailIndex,
  });
  const verificationToken = verificationLink.searchParams.get('token');
  const verificationPath = `/auth/verify?${new URLSearchParams({ token: verificationToken })}`;
  await verifyConcurrentSingleConsumption({
    fetchImpl,
    apiBase,
    method: 'GET',
    path: verificationPath,
    label: 'concurrent verification email link consumption',
  });

  const resetMailIndex = smtpMessages.length;
  const forgot = await requestJson({
    fetchImpl,
    apiBase,
    method: 'POST',
    path: '/auth/forgot-password',
    body: { email },
    expectedStatus: 200,
    label: 'request password reset email',
  });
  if (forgot.data?.devToken) {
    throw new Error('production password reset response exposed a dev token');
  }

  const resetLink = await waitForAccountLink({
    smtpMessages,
    recipient: email,
    expectedPath: '/app/reset-password',
    afterIndex: resetMailIndex,
  });
  const resetToken = resetLink.searchParams.get('token');
  const resetBody = { token: resetToken, new_password: newPassword };
  await verifyConcurrentSingleConsumption({
    fetchImpl,
    apiBase,
    method: 'POST',
    path: '/auth/reset-password',
    body: resetBody,
    label: 'concurrent password reset email link consumption',
  });

  return { verificationReplayRejected: true, resetReplayRejected: true };
}

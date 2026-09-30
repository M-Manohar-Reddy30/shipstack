import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";

const baseUrl = "http://127.0.0.1:4000";
const testEmail = `test-${Date.now()}@example.com`;
const password = "StrongPassword123!";

let server: ChildProcess;

function waitForServer(url: string, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch(url);

        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Server is not ready yet.
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Server did not become ready within ${timeoutMs}ms`));
        return;
      }

      setTimeout(poll, 100);
    };

    void poll();
  });
}

async function request(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
}

function getSetCookie(response: Response): string {
  const cookie = response.headers.get("set-cookie");

  assert.ok(cookie, "Expected Set-Cookie header");

  return cookie.split(";")[0];
}

describe("authentication API", () => {
  before(async () => {
    server = spawn("node", ["dist/server.js"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: "4000"
      }
    });

    server.stderr.on("data", (chunk) => {
      process.stderr.write(`[auth-server] ${chunk}`);
    });

    await waitForServer(`${baseUrl}/health`);
  });

  after(() => {
    server.kill("SIGTERM");
  });

  it("reports a healthy service", async () => {
    const response = await request("/health");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: {
        status: "ok"
      }
    });
  });

  it("registers a new user", async () => {
    const response = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password,
        display_name: "Test User"
      })
    });

    assert.equal(response.status, 201);

    const body = await response.json() as {
      data: {
        user: {
          id: string;
          email: string;
          display_name: string;
          roles: string[];
        };
      };
      request_id: string;
    };

    assert.match(body.data.user.id, /^usr_/);
    assert.equal(body.data.user.email, testEmail);
    assert.equal(body.data.user.display_name, "Test User");
    assert.deepEqual(body.data.user.roles, ["user"]);
    assert.match(body.request_id, /^req_/);
  });

  it("rejects duplicate registration", async () => {
    const response = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password,
        display_name: "Duplicate"
      })
    });

    assert.equal(response.status, 409);

    const body = await response.json() as {
      error: {
        code: string;
        request_id: string;
      };
    };

    assert.equal(body.error.code, "ACCOUNT_ALREADY_EXISTS");
    assert.match(body.error.request_id, /^req_/);
  });

  it("rejects invalid registration input", async () => {
    const response = await request("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: "not-an-email",
        password: "short",
        display_name: ""
      })
    });

    assert.equal(response.status, 400);

    const body = await response.json() as {
      error: {
        code: string;
        request_id: string;
      };
    };

    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.match(body.error.request_id, /^req_/);
  });

  it("rejects invalid login credentials without exposing account details", async () => {
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password: "WrongPassword123!"
      })
    });

    assert.equal(response.status, 401);

    const body = await response.json() as {
      error: {
        code: string;
        message: string;
      };
    };

    assert.equal(body.error.code, "INVALID_CREDENTIALS");
    assert.equal(body.error.message, "Email or password is incorrect.");
    assert.doesNotMatch(body.error.message, /does not exist|user not found/i);
  });

  it("logs in and returns a secure session cookie", async () => {
    const response = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password
      })
    });

    assert.equal(response.status, 200);

    const cookie = getSetCookie(response);

    assert.match(cookie, /^session=.+$/);
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
    assert.match(response.headers.get("set-cookie") ?? "", /SameSite=Lax/i);

    const body = await response.json() as {
      data: {
        user: {
          email: string;
        };
      };
    };

    assert.equal(body.data.user.email, testEmail);
  });

  it("returns the authenticated user when the session cookie is supplied", async () => {
    const loginResponse = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password
      })
    });

    const cookie = getSetCookie(loginResponse);

    const response = await request("/api/v1/auth/me", {
      headers: {
        Cookie: cookie
      }
    });

    assert.equal(response.status, 200);

    const body = await response.json() as {
      data: {
        user: {
          email: string;
          roles: string[];
        };
      };
    };

    assert.equal(body.data.user.email, testEmail);
    assert.deepEqual(body.data.user.roles, ["user"]);
  });

  it("rejects /auth/me without a session", async () => {
    const response = await request("/api/v1/auth/me");

    assert.equal(response.status, 401);

    const body = await response.json() as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
  });

  it("revokes the session on logout", async () => {
    const loginResponse = await request("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: testEmail,
        password
      })
    });

    const cookie = getSetCookie(loginResponse);

    const logoutResponse = await request("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie
      }
    });

    assert.equal(logoutResponse.status, 204);

    const meResponse = await request("/api/v1/auth/me", {
      headers: {
        Cookie: cookie
      }
    });

    assert.equal(meResponse.status, 401);
  });

  it("returns a generic response for password-reset requests", async () => {
    const response = await request("/api/v1/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({
        email: `unknown-${Date.now()}@example.com`
      })
    });

    assert.equal(response.status, 202);

    const body = await response.json() as {
      data: {
        message: string;
      };
    };

    assert.match(
      body.data.message,
      /If an account matches this email address/i
    );
  });

  it("returns a stable not-found response for unknown routes", async () => {
    const response = await request("/api/v1/does-not-exist");

    assert.equal(response.status, 404);

    const body = await response.json() as {
      error: {
        code: string;
        request_id: string;
      };
    };

    assert.equal(body.error.code, "NOT_FOUND");
    assert.match(body.error.request_id, /^req_/);
  });
});

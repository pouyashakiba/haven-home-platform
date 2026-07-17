import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SESSION_LIFETIME_MS = 30 * 60 * 1000;
const ID_PATTERN = /^[0-9a-f-]{36}$/i;

export class ScanStore {
  constructor(directory) {
    this.directory = directory;
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true });
  }

  async createSession({ serverUrl, callbackUrl }) {
    const trustedServer = normalizeHttpUrl(serverUrl, "server_url");
    const trustedCallback = normalizeHttpUrl(callbackUrl, "callback_url");
    if (trustedServer.origin !== trustedCallback.origin) throw new Error("callback_origin_mismatch");

    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    const session = {
      id,
      status: "waiting",
      tokenHash: hashToken(token),
      serverUrl: trustedServer.origin,
      callbackUrl: trustedCallback.toString(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_LIFETIME_MS).toISOString(),
    };
    await this.#writeJson(this.#sessionPath(id), session);

    const deepLink = new URL("havenscanner://scan");
    deepLink.searchParams.set("server", session.serverUrl);
    deepLink.searchParams.set("session", id);
    deepLink.searchParams.set("token", token);
    deepLink.searchParams.set("callback", session.callbackUrl);
    return { id, status: session.status, expiresAt: session.expiresAt, deepLink: deepLink.toString() };
  }

  async getSession(id) {
    assertId(id);
    const session = await this.#readJson(this.#sessionPath(id));
    if (!session) return null;
    if (session.status !== "complete" && Date.parse(session.expiresAt) <= Date.now()) {
      return { ...publicSession(session), status: "expired" };
    }
    return publicSession(session);
  }

  async completeSession(id, token, bundle) {
    assertId(id);
    const session = await this.#readJson(this.#sessionPath(id));
    if (!session) throw new Error("scan_not_found");
    if (session.status === "complete") throw new Error("scan_already_complete");
    if (Date.parse(session.expiresAt) <= Date.now()) throw new Error("scan_expired");
    if (!safeTokenMatch(token, session.tokenHash)) throw new Error("invalid_scan_token");
    validateScanBundle(bundle, id);

    const receivedAt = new Date().toISOString();
    await this.#writeJson(this.#scanPath(id), { ...bundle, sessionId: id, receivedAt });
    const completed = { ...session, status: "complete", receivedAt };
    await this.#writeJson(this.#sessionPath(id), completed);
    return publicSession(completed);
  }

  async getScan(id) {
    assertId(id);
    return this.#readJson(this.#scanPath(id));
  }

  async getLatestCompleted() {
    const entries = await readdir(this.directory);
    const sessions = await Promise.all(entries
      .filter((entry) => entry.endsWith(".session.json"))
      .map((entry) => this.#readJson(join(this.directory, entry))));
    const latest = sessions
      .filter((session) => session?.status === "complete" && session.receivedAt)
      .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];
    return latest ? publicSession(latest) : null;
  }

  #sessionPath(id) {
    return join(this.directory, `${id}.session.json`);
  }

  #scanPath(id) {
    return join(this.directory, `${id}.scan.json`);
  }

  async #readJson(path) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async #writeJson(path, value) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  }
}

export function validateScanBundle(bundle, expectedSessionId) {
  if (!bundle || typeof bundle !== "object") throw new Error("invalid_scan");
  if (bundle.schemaVersion !== 1 || bundle.sessionId !== expectedSessionId) throw new Error("invalid_scan_schema");
  if (!Array.isArray(bundle.rooms) || bundle.rooms.length === 0 || bundle.rooms.length > 100) {
    throw new Error("invalid_scan_rooms");
  }
  let elementCount = 0;
  for (const room of bundle.rooms) {
    if (!room || typeof room.id !== "string" || typeof room.name !== "string") throw new Error("invalid_scan_room");
    for (const key of ["walls", "doors", "windows", "openings", "floors", "objects"]) {
      if (!Array.isArray(room[key])) throw new Error("invalid_scan_elements");
      elementCount += room[key].length;
      for (const element of room[key]) validateElement(element);
    }
  }
  if (elementCount > 10_000) throw new Error("scan_too_complex");
  return bundle;
}

function validateElement(element) {
  if (!element || typeof element.id !== "string" || typeof element.category !== "string") {
    throw new Error("invalid_scan_element");
  }
  if (!Array.isArray(element.dimensions) || element.dimensions.length !== 3 || !element.dimensions.every(validNumber)) {
    throw new Error("invalid_scan_dimensions");
  }
  if (!Array.isArray(element.transform) || element.transform.length !== 16 || !element.transform.every(validNumber)) {
    throw new Error("invalid_scan_transform");
  }
  if (element.confidence != null && !["low", "medium", "high"].includes(element.confidence)) {
    throw new Error("invalid_scan_confidence");
  }
}

function normalizeHttpUrl(value, field) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`invalid_${field}`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error(`invalid_${field}`);
  return url;
}

function assertId(id) {
  if (!ID_PATTERN.test(id)) throw new Error("invalid_scan_id");
}

function validNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function safeTokenMatch(token, expectedHash) {
  if (typeof token !== "string" || typeof expectedHash !== "string") return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicSession(session) {
  const { tokenHash: _tokenHash, ...safe } = session;
  return safe;
}

const request = require("supertest");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = "test_secret";
process.env.MONGO_URI = "mongodb://localhost/test";

jest.mock("../src/services/externalServices", () => ({
  getEnrollmentCount: jest.fn().mockResolvedValue(0),
  checkEnrollmentStatus: jest.fn().mockResolvedValue({ enrolled: false })
}));
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return { ...actual, connect: jest.fn().mockResolvedValue(true) };
});

const makeToken = (role = "student") =>
  jwt.sign({ id: "507f1f77bcf86cd799439011", role }, process.env.JWT_SECRET);

const adminToken = makeToken("admin");
const studentToken = makeToken("student");

let app;
beforeAll(() => {
  ({ app } = require("../src/server"));
});
afterEach(() => jest.clearAllMocks());

// ── Health ────────────────────────────────────────────────────────
describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ── GET /courses ──────────────────────────────────────────────────
describe("GET /courses", () => {
  it("returns array", async () => {
    const Course = require("../src/models/Course");
    Course.find = jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue([])
    });
    const res = await request(app).get("/courses");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ── GET /courses/:id ──────────────────────────────────────────────
describe("GET /courses/:id", () => {
  it("returns 404 when not found", async () => {
    const Course = require("../src/models/Course");
    Course.findById = jest.fn().mockResolvedValue(null);
    const res = await request(app).get("/courses/507f1f77bcf86cd799439011");
    expect(res.status).toBe(404);
  });
});

// ── POST /courses ─────────────────────────────────────────────────
describe("POST /courses", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app)
      .post("/courses")
      .send({ name: "Test", capacity: 30, credits: 3 });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .post("/courses")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ name: "Test", capacity: 30, credits: 3 });
    expect(res.status).toBe(403);
  });

  it("returns 400 when fields missing", async () => {
    const res = await request(app)
      .post("/courses")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Test" });
    expect(res.status).toBe(400);
  });
});

// ── PUT /courses/:id/capacity ─────────────────────────────────────
describe("PUT /courses/:id/capacity", () => {
  it("returns 400 for invalid action", async () => {
    const res = await request(app)
      .put("/courses/507f1f77bcf86cd799439011/capacity")
      .send({ action: "invalid" });
    expect(res.status).toBe(400);
  });
});

describe("GET /courses/:courseId/check-student/:studentId", () => {
  it("returns enrollment status", async () => {
    const res = await request(app).get(
      "/courses/507f1f77bcf86cd799439011/check-student/123"
    );

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(false);
  });
});

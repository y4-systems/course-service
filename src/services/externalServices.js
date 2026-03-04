// ── Calls to other microservices via API Gateway ─────────────────

const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  "https://api-gateway-763150334229.us-central1.run.app";

// Member 1 — validate JWT token via Auth Service (through gateway)
const validateTokenWithAuthService = async (token) => {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/auth/validate`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("❌ Auth Service unreachable:", err.message);
    return null;
  }
};

// Member 3 — get live enrollment count for a course (through gateway)
const getEnrollmentCount = async (courseId) => {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/api/enrollments/course/${courseId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.SERVICE_TOKEN}`
        }
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.count ?? data.length ?? 0;
  } catch (err) {
    console.error("❌ Enrollment Service unreachable:", err.message);
    return null;
  }
};
// Member 3 — check if a student is already enrolled in a course
const checkEnrollmentStatus = async (studentId, courseId) => {
  try {
    const res = await fetch(
      `${GATEWAY_URL}/api/enrollments/check?studentId=${studentId}&courseId=${courseId}`
    );

    if (!res.ok) return null;

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("❌ Enrollment check failed:", err.message);
    return null;
  }
};

module.exports = {
  validateTokenWithAuthService,
  getEnrollmentCount,
  checkEnrollmentStatus
};

const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  "https://api-gateway-763150334229.us-central1.run.app";

// ── Shared helper ─────────────────────────────────────────────────
const ENROLLMENT_SERVICE_URL =
  process.env.ENROLLMENT_SERVICE_URL ||
  "https://enrollment-service-763150334229.us-central1.run.app";

const callEnrollmentService = async (endpoint) => {
  try {
    const url = `${ENROLLMENT_SERVICE_URL}${endpoint}`; // direct, not via gateway
    console.log("Calling Enrollment Service:", url);

    const res = await fetch(url, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
        // No Authorization header needed — gateway auth is bypassed
      }
    });

    console.log("Enrollment service response status:", res.status);

    if (!res.ok) {
      const text = await res.text();
      console.error("Enrollment service error body:", text);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("Enrollment service unreachable:", err.message);
    return null;
  }
};
// Member 1 — validate JWT token via Auth Service
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

// Member 3 — get live enrollment count for a course
// His getEnrollmentsByCourse returns: an array of enrollment objects
// filtered to ACTIVE only makes the count accurate
const getEnrollmentCount = async (courseId) => {
  const data = await callEnrollmentService(
    `/api/enrollments/course/${courseId}`
  );

  if (!Array.isArray(data)) return null;

  // His endpoint returns all statuses for admin, so count only ACTIVE ones
  const activeCount = data.filter((e) => e.status === "ACTIVE").length;
  return activeCount;
};

// Member 3 — check if a student is enrolled in a course
// His checkEnrollment returns: { isEnrolled: bool, status: string|null, enrollment_id }
const checkEnrollmentStatus = async (studentId, courseId) => {
  try {
    // ✅ Use ENROLLMENT_SERVICE_URL directly, not GATEWAY_URL
    const url = `${ENROLLMENT_SERVICE_URL}/api/enrollments/check?studentId=${studentId}&courseId=${courseId}`;
    console.log("Calling Enrollment Service:", url);

    const res = await fetch(url, {
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache"
        // No Authorization header — bypassing gateway
      }
    });

    console.log("Enrollment service response status:", res.status);

    if (res.status === 304) {
      console.warn("Got 304 from enrollment check — assuming not enrolled");
      return { isEnrolled: false, status: null };
    }

    if (!res.ok) {
      const text = await res.text();
      console.error("Enrollment service error body:", text);
      return null;
    }

    return await res.json();
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

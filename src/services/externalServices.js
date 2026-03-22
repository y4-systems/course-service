const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  "https://api-gateway-763150334229.us-central1.run.app";

const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

// Validate MongoDB ObjectId to prevent path traversal
const isValidObjectId = (id) => /^[a-f\d]{24}$/i.test(String(id || "").trim());

// ── Shared Gateway Helper ─────────────────────────────────────────
/**
 * Makes authenticated requests through the API Gateway
 * All external service calls should use this helper
 */
const callGateway = async (endpoint, options = {}) => {
  try {
    const url = `${GATEWAY_URL}${endpoint}`;
    console.log(`[Gateway] 🔄 Calling: ${url}`);

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...options.headers
    };

    // Add service-to-service authentication if token is available
    if (SERVICE_TOKEN) {
      headers["Authorization"] = `Bearer ${SERVICE_TOKEN}`;
      console.log("[Gateway] 🔐 Using SERVICE_TOKEN for authentication");
    } else {
      console.warn("[Gateway] ⚠️  No SERVICE_TOKEN found - request may fail");
    }

    const res = await fetch(url, {
      method: options.method || "GET",
      ...options,
      headers
    });

    console.log(`[Gateway] Response status: ${res.status} ${res.statusText}`);

    // Handle 304 Not Modified
    if (res.status === 304) {
      console.warn(`[Gateway] Got 304 from ${endpoint}`);
      return null;
    }

    // Handle non-OK responses
    if (!res.ok) {
      const text = await res.text();
      console.error(`[Gateway] ❌ Error response from ${endpoint}:`, text);
      return null;
    }

    const data = await res.json();
    console.log(
      `[Gateway] ✅ Success:`,
      JSON.stringify(data).substring(0, 200)
    );
    return data;
  } catch (err) {
    console.error(`[Gateway] 💥 Request failed for ${endpoint}:`, err.message);
    return null;
  }
};

// ──────────────────────────────────────────────────────────────────
// Member 1 — Auth Service Integration
// ──────────────────────────────────────────────────────────────────

/**
 * Validates JWT token via Auth Service through the Gateway
 * @param {string} token - JWT token to validate
 * @returns {Promise<object|null>} - User data if valid, null otherwise
 */
const validateTokenWithAuthService = async (token) => {
  console.log("[Auth Service] Validating token through gateway...");
  try {
    const url = `${GATEWAY_URL}/api/auth/validate`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` // user token — must NOT be overwritten by SERVICE_TOKEN
      }
    });
    if (!res.ok) {
      console.error(
        `[Auth Service] ❌ Validate failed: ${res.status} ${res.statusText}`
      );
      return null;
    }
    const data = await res.json();
    console.log("[Auth Service] ✅ Token valid, user:", data);
    return data;
  } catch (err) {
    console.error("[Auth Service] 💥 Request failed:", err.message);
    return null;
  }
};

// ──────────────────────────────────────────────────────────────────
// Member 3 — Enrollment Service Integration
// ──────────────────────────────────────────────────────────────────

/**
 * Get live enrollment count for a course (ACTIVE enrollments only)
 * Routes through Gateway to Member 3's Enrollment Service
 * @param {string} courseId - Course ID
 * @returns {Promise<number|null>} - Count of active enrollments or null
 */
const getEnrollmentCount = async (courseId) => {
  console.log(
    `[Enrollment Service] 📊 Getting enrollment count for course: ${courseId}`
  );

  if (!isValidObjectId(courseId)) {
    console.error(
      `[Enrollment Service] ❌ Invalid courseId format: ${courseId}`
    );
    return null;
  }

  const data = await callGateway(`/api/enrollments/course/${courseId}`);

  if (!data) {
    console.error(
      `[Enrollment Service] ❌ No data returned for course ${courseId}`
    );
    return null;
  }

  if (!Array.isArray(data)) {
    console.error(
      `[Enrollment Service] ❌ Invalid response format (expected array):`,
      typeof data
    );
    return null;
  }

  // Count only ACTIVE enrollments (filter out DROPPED, PENDING, etc.)
  const activeCount = data.filter((e) => e.status === "ACTIVE").length;

  console.log(
    `[Enrollment Service] ✅ Course ${courseId}: ${activeCount} active / ${data.length} total enrollments`
  );

  return activeCount;
};

/**
 * Check if a student is enrolled in a course
 * Routes through Gateway to Member 3's Enrollment Service
 * @param {string} studentId - Student ID
 * @param {string} courseId - Course ID
 * @returns {Promise<object|null>} - Enrollment status object or null
 * Returns: { isEnrolled: boolean, status: string|null, enrollment_id: string|null }
 */
const checkEnrollmentStatus = async (studentId, courseId) => {
  console.log(
    `[Enrollment Service] 🔍 Checking enrollment: student=${studentId}, course=${courseId}`
  );

  if (!isValidObjectId(studentId) || !isValidObjectId(courseId)) {
    console.error(
      `[Enrollment Service] ❌ Invalid ID format: student=${studentId}, course=${courseId}`
    );
    return null;
  }

  const data = await callGateway(
    `/api/enrollments/check?studentId=${studentId}&courseId=${courseId}`
  );

  if (!data) {
    console.error(`[Enrollment Service] ❌ Failed to check enrollment status`);
    return null;
  }

  console.log(`[Enrollment Service] ✅ Status:`, data);
  return data;
};

module.exports = {
  validateTokenWithAuthService,
  getEnrollmentCount,
  checkEnrollmentStatus
};

const mongoose = require("mongoose");

const GATEWAY_URL =
  process.env.GATEWAY_URL ||
  "https://api-gateway-763150334229.us-central1.run.app";

const SERVICE_TOKEN = process.env.SERVICE_TOKEN;

// ── Input Validation Helpers ──────────────────────────────────────
/**
 * Validate MongoDB ObjectId to prevent injection attacks
 * @param {string} id - ID to validate
 * @returns {boolean} - True if valid ObjectId
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Build safe URL using URL constructor (not string concatenation)
 * @param {string} path - API path
 * @returns {string|null} - Safe URL or null if invalid
 */
const buildGatewayUrl = (path) => {
  try {
    // Use URL constructor to safely build URL
    const url = new URL(path, GATEWAY_URL);

    // Ensure the final URL has the same origin as GATEWAY_URL
    const gatewayOrigin = new URL(GATEWAY_URL).origin;
    if (url.origin !== gatewayOrigin) {
      console.error("[Gateway] ❌ URL origin mismatch");
      return null;
    }

    return url.toString();
  } catch (err) {
    console.error("[Gateway] ❌ Invalid URL construction");
    return null;
  }
};

/**
 * Validate endpoint against allowed patterns
 * @param {string} endpoint - Endpoint to validate
 * @returns {boolean} - True if endpoint matches allowed patterns
 */
const isAllowedEndpoint = (endpoint) => {
  // Whitelist of allowed endpoint patterns (case-insensitive for ObjectIds)
  const allowedPatterns = [
    /^\/api\/auth\/validate$/,
    /^\/api\/enrollments\/course\/[a-f0-9]{24}$/i,
    /^\/api\/enrollments\/check\?studentId=[a-f0-9]{24}&courseId=[a-f0-9]{24}$/i
  ];

  return allowedPatterns.some((pattern) => pattern.test(endpoint));
};

// ── Shared Gateway Helper ─────────────────────────────────────────
/**
 * Makes authenticated requests through the API Gateway
 * All external service calls should use this helper
 */
const callGateway = async (endpoint, options = {}) => {
  try {
    // Validate endpoint format before constructing URL
    if (!endpoint.startsWith("/")) {
      console.error("[Gateway] ❌ Invalid endpoint - must start with /");
      return null;
    }

    // Validate against whitelist
    if (!isAllowedEndpoint(endpoint)) {
      console.error("[Gateway] ❌ Endpoint not in whitelist");
      return null;
    }

    // Build URL using URL constructor (NOT string concatenation)
    const requestUrl = buildGatewayUrl(endpoint);
    if (!requestUrl) {
      console.error("[Gateway] ❌ Failed to build safe URL");
      return null;
    }

    console.log(`[Gateway] 🔄 Making API request`);

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...options.headers
    };

    // Add service-to-service authentication if token is available
    if (SERVICE_TOKEN) {
      headers.Authorization = `Bearer ${SERVICE_TOKEN}`;
      console.log("[Gateway] 🔐 Using SERVICE_TOKEN for authentication");
    } else {
      console.warn("[Gateway] ⚠️  No SERVICE_TOKEN found - request may fail");
    }

    const res = await fetch(requestUrl, {
      method: options.method || "GET",
      ...options,
      headers
    });

    console.log(`[Gateway] Response status: ${res.status} ${res.statusText}`);

    // Handle 304 Not Modified
    if (res.status === 304) {
      console.warn(`[Gateway] Got 304 Not Modified response`);
      return null;
    }

    // Handle non-OK responses
    if (!res.ok) {
      await res.text(); // Read response to prevent memory leak
      console.error(`[Gateway] ❌ Error response received`);
      return null;
    }

    const data = await res.json();
    console.log(`[Gateway] ✅ Request successful`);
    return data;
  } catch (err) {
    console.error(`[Gateway] 💥 Request failed:`, err.message);
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
    const url = buildGatewayUrl("/api/auth/validate");
    if (!url) {
      console.error("[Auth Service] ❌ Failed to build URL");
      return null;
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` // user token — must NOT be overwritten by SERVICE_TOKEN
      }
    });

    if (res.ok) {
      const data = await res.json();
      console.log("[Auth Service] ✅ Token validated successfully");
      return data;
    }
    console.error(
      `[Auth Service] ❌ Validate failed: ${res.status} ${res.statusText}`
    );
    return null;
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
  // Validate courseId to prevent injection
  if (!isValidObjectId(courseId)) {
    console.error(`[Enrollment Service] ❌ Invalid courseId format`);
    return null;
  }

  console.log(`[Enrollment Service] 📊 Getting enrollment count`);

  // Build endpoint with validated ID
  const endpoint = `/api/enrollments/course/${courseId}`;
  const data = await callGateway(endpoint);

  if (!data) {
    console.error(`[Enrollment Service] ❌ No data returned`);
    return null;
  }

  if (!Array.isArray(data)) {
    console.error(
      `[Enrollment Service] ❌ Invalid response format (expected array)`
    );
    return null;
  }

  // Count only ACTIVE enrollments (filter out DROPPED, PENDING, etc.)
  const activeCount = data.filter((e) => e.status === "ACTIVE").length;

  console.log(
    `[Enrollment Service] ✅ Retrieved enrollment data: ${activeCount} active enrollments`
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
  // Validate both IDs to prevent injection
  if (!isValidObjectId(studentId)) {
    console.error(`[Enrollment Service] ❌ Invalid studentId format`);
    return null;
  }

  if (!isValidObjectId(courseId)) {
    console.error(`[Enrollment Service] ❌ Invalid courseId format`);
    return null;
  }

  console.log(`[Enrollment Service] 🔍 Checking enrollment status`);

  // Build endpoint with validated IDs
  const endpoint = `/api/enrollments/check?studentId=${studentId}&courseId=${courseId}`;
  const data = await callGateway(endpoint);

  if (!data) {
    console.error(`[Enrollment Service] ❌ Failed to check enrollment status`);
    return null;
  }

  console.log(`[Enrollment Service] ✅ Enrollment status retrieved`);
  return data;
};

module.exports = {
  validateTokenWithAuthService,
  getEnrollmentCount,
  checkEnrollmentStatus
};
